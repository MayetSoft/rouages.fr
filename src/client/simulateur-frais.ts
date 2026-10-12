/**
 * Le simulateur des frais d'achat, côté navigateur : le prix, la commune, et
 * qui touche quoi — le département, la commune ou le fonds départemental, l'État,
 * le notaire. Voir `src/modele/bareme-achat.ts`.
 */
import { aLieu } from '../modele/signalement.ts';
import { FIN_HAUSSE, fraisAchat, SEUIL_COMMUNE } from '../modele/bareme-achat.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';

type CommuneJeu = [string, string, number, number, string[], string, (number | null)[]];
type Communes = { i: [string, string, string, string][]; c: Record<string, CommuneJeu> };
/** Les recettes de droits de mutation de chaque département, la dernière année publiée (données de la page). */
type Recettes = { annee: number; d: Record<string, { dep: number | null; com: number | null }> };

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const pc = (x: number) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const millions = (milliers: number) => `${(milliers / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} millions d’euros`;
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function brancherFrais(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('sf')) return;
  brancherChampLieu('sf-lieu', LIEUX);
  const form = $<HTMLFormElement>('sf-form');
  const recettes = JSON.parse($('sf-recettes').textContent ?? '{}') as Recettes;
  let lieu: Lieu | null = null;
  let dep = '';
  let habitants: number | null = null;

  const champ = (n: string) => Math.max(0, Number((form.elements.namedItem(n) as HTMLInputElement).value) || 0);
  const coche = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).checked;

  const calculer = () => {
    const prix = champ('prix');
    const neuf = coche('neuf');
    const primo = coche('primo');
    const f = prix > 0 ? fraisAchat(prix, dep, primo, neuf) : null;
    $('sf-resultat').hidden = !f;
    if (!f || !lieu) return;
    $('sf-total').textContent = euros(f.total);
    $('sf-part').textContent = `${pc((f.total / prix) * 100)} du prix, dont ${euros(f.departement + f.commune + f.etatAssiette + f.csi)} d’impôts et ${euros(f.emolumentsHt + f.tva)} pour le notaire, TVA comprise`;

    const recoitCommune = habitants !== null && habitants > SEUIL_COMMUNE;
    const postes = [
      { qui: 'Le département', icone: 'collectivite', montant: f.departement, detail: `${pc(f.tauxDepartement)} du prix, taux voté par le conseil départemental`, lien: `/departement/${dep === '67' || dep === '68' ? '67A' : dep}` },
      {
        qui: recoitCommune ? `La commune — ${lieu.nom}` : 'Les communes de moins de 5 000 habitants du département',
        icone: 'decide',
        montant: f.commune,
        detail: recoitCommune
          ? '1,20 % du prix : la commune, de plus de 5 000 habitants, la perçoit elle-même'
          : '1,20 % du prix, versés au fonds départemental de péréquation et répartis entre les communes de moins de 5 000 habitants (sauf stations de tourisme, qui la perçoivent elles-mêmes)',
        lien: `/commune/${lieu.cle.slice(2)}`,
      },
      { qui: 'L’État', icone: 'justice', montant: f.etatAssiette + f.csi, detail: `${euros(f.etatAssiette)} de frais d’assiette et de recouvrement, ${euros(f.csi)} de contribution de sécurité immobilière`, lien: null },
      { qui: 'Le notaire', icone: 'deliberations', montant: f.emolumentsHt, detail: 'émoluments au tarif réglementé, hors taxes', lien: null },
      { qui: 'La TVA sur les émoluments', icone: 'argent', montant: f.tva, detail: '20 % des émoluments, pour l’État', lien: null },
    ].filter((p) => p.montant > 0);
    const ul = $('sf-postes');
    ul.innerHTML = '';
    for (const p of postes) {
      const li = document.createElement('li');
      li.style.setProperty('--part', String((p.montant / f.total) * 100));
      const tete = document.createElement('div');
      tete.className = 'sf-tete';
      const nom = p.lien ? Object.assign(document.createElement('a'), { href: p.lien, textContent: p.qui }) : Object.assign(document.createElement('span'), { textContent: p.qui });
      tete.innerHTML = `<svg class="icone" width="24" height="24" aria-hidden="true"><use href="/icones.svg#${p.icone}"/></svg>`;
      tete.append(nom, Object.assign(document.createElement('strong'), { textContent: euros(p.montant) }));
      li.append(tete, Object.assign(document.createElement('span'), { className: 'sf-barre' }), Object.assign(document.createElement('small'), { textContent: p.detail }));
      ul.append(li);
    }

    // La hausse votée, et ce qu'elle coûte ici.
    const hausse = $('sf-hausse');
    const surcout = ((f.tauxDepartement - f.tauxSansHausse) / 100) * prix * (1 + 0.0237);
    hausse.textContent = neuf
      ? 'Dans le neuf, le taux réduit s’applique partout : le vote du département n’y change rien.'
      : surcout > 0
        ? `Le département a relevé son taux de ${pc(f.tauxSansHausse)} à ${pc(f.tauxDepartement)}, comme la loi de finances pour 2025 le permet jusqu’au ${date(FIN_HAUSSE)} : ${euros(surcout)} de plus sur cet achat, frais d’assiette compris. Un primo-accédant qui achète sa résidence principale en est exonéré.`
        : primo
          ? `Primo-accédant qui achète sa résidence principale : le taux de ${pc(f.tauxDepartement)} s’applique, sans la hausse votée.`
          : `Le département n’a pas relevé son taux : ${pc(f.tauxDepartement)}.`;

    const r = recettes.d[dep];
    $('sf-recettes-texte').textContent =
      r?.dep != null
        ? `En ${recettes.annee}, les droits de mutation ont rapporté ${millions(r.dep)} au département${r.com != null ? `, et ${millions(r.com)} aux communes du département` : ''}.`
        : '';
  };

  form.addEventListener('input', calculer);

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return;
    retenirLieu(lieu.cle);
    dep = lieu.deps[0];
    habitants = null;
    const code = lieu.cle.slice(2);
    try {
      const r = await fetch(`/jeux/communes/${dep}.json`);
      const d = (await r.json()) as Communes;
      const c = d.c[code];
      const iHab = d.i.findIndex((x) => x[0] === 'habitants');
      const iPrix = d.i.findIndex((x) => x[0] === 'prixMaison');
      habitants = c && iHab >= 0 ? c[6][iHab] : null;
      const median = c && iPrix >= 0 ? c[6][iPrix] : null;
      const prix = form.elements.namedItem('prix') as HTMLInputElement;
      if (median && !prix.dataset.saisi) prix.value = String(median);
      $('sf-median').textContent = median ? `Prix médian d’une maison ${aLieu(lieu.nom)} : ${euros(median)} (${d.i[iPrix][3]}).` : '';
    } catch {
      $('sf-median').textContent = '';
    }
    $('sf-titre').textContent = aLieu(lieu.nom).replace(/^./, (x) => x.toUpperCase());
    form.hidden = false;
    calculer();
  };
  (form.elements.namedItem('prix') as HTMLInputElement).addEventListener('input', (e) => ((e.target as HTMLInputElement).dataset.saisi = '1'));
  quandLieu(LIEUX, null, (cle) => void preparer(cle));
}
