/**
 * Le simulateur des frais d'achat, côté navigateur : le prix, la commune, et
 * qui touche quoi — le département, la commune ou le fonds départemental, l'État,
 * le notaire. Voir `src/modele/bareme-achat.ts`.
 */
import { aLieu } from '../modele/signalement.ts';
import { ECRETEMENT, FIN_HAUSSE, FORFAITS_NOTAIRES, FORMALITES_PAR_PIECE, fraisAchat, REMISE, SEUIL_COMMUNE, type Frais } from '../modele/bareme-achat.ts';
import { brancherRapport, restaurerSaisie } from './rapport.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';

type CommuneJeu = [string, string, number, number, string[], string, (number | null)[]];
type Communes = { i: [string, string, string, string][]; c: Record<string, CommuneJeu> };
/** Les recettes de droits de mutation de chaque département, la dernière année publiée (données de la page). */
type Recettes = { annee: number; d: Record<string, { dep: number | null; com: number | null }> };

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const centimes = (x: number) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const taux = (x: number) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} %`;

/** Le détail du notaire : l'acte tranche par tranche, chaque formalité, l'écrêtement, la TVA, la remise possible. */
function detailNotaire(f: Frais, prix: number): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'sf-detail';
  const resume = document.createElement('summary');
  resume.textContent = 'Le détail, ligne par ligne';
  const table = document.createElement('table');
  const ligne = (libelle: string, montant: string, classe = '') => {
    const tr = document.createElement('tr');
    if (classe) tr.className = classe;
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = libelle;
    const td = document.createElement('td');
    td.textContent = montant;
    tr.append(th, td);
    table.append(tr);
  };
  const tete = (texte: string) => ligne(texte, '', 'sf-detail-tete');
  tete('L’acte de vente — émolument proportionnel (art. A444-91)');
  for (const t of f.tranches) {
    const borne = Number.isFinite(t.a) ? `de ${euros(t.de)} à ${euros(t.a)}` : `au-delà de ${euros(t.de)}`;
    ligne(`${taux(t.taux)} ${borne}, sur ${euros(t.assiette)}`, centimes(t.montant));
  }
  ligne('Sous-total de l’acte', centimes(f.acte), 'sf-detail-total');
  tete('Les formalités — montants fixes (art. A444-169 à A444-173-1)');
  for (const x of f.formalites) ligne(`${x.libelle} (n° ${x.numero})`, centimes(x.montant));
  ligne('Sous-total des formalités', centimes(f.formalitesHt), 'sf-detail-total');
  if (f.ecretement > 0) ligne(`Écrêtement : le total ne peut dépasser ${ECRETEMENT.taux} % du prix, ni descendre sous ${ECRETEMENT.minimum} €`, `− ${centimes(f.ecretement)}`);
  ligne('Émoluments hors taxes', centimes(f.emolumentsHt), 'sf-detail-total');
  ligne('TVA à 20 %, versée à l’État', centimes(f.tva));
  ligne('Émoluments TTC, au minimum du tarif', centimes(f.emolumentsHt + f.tva), 'sf-detail-total');
  if (f.usuel) {
    tete('Un dossier ordinaire — l’estimation');
    ligne('Formalités au forfait du simulateur des notaires de France, à la place des seules obligatoires', centimes(f.usuel.formalitesHt));
    ligne('Émoluments hors taxes', centimes(f.usuel.emolumentsHt));
    ligne('TVA à 20 %', centimes(f.usuel.tva));
    ligne('Émoluments TTC, estimés', centimes(f.usuel.emolumentsHt + f.usuel.tva), 'sf-detail-total');
  }
  const notes = document.createElement('ul');
  const note = (t: string) => notes.append(Object.assign(document.createElement('li'), { textContent: t }));
  note(
    `Selon les pièces que le notaire obtient lui-même, d’autres montants fixes s’ajoutent : ${centimes(FORMALITES_PAR_PIECE.document)} HT par document nécessaire à l’acte et non tarifé ailleurs, ${centimes(FORMALITES_PAR_PIECE.diagnostic)} HT par diagnostic du dossier technique qu’il obtient et vérifie.`,
  );
  note(
    f.remiseMaximale > 0
      ? `Remise possible : le notaire peut réduire jusqu’à ${REMISE.taux} % l’émolument calculé sur la part du prix au-delà de ${euros(REMISE.seuil)}, soit ${centimes(f.remiseMaximale)} HT au plus ici. Il l’applique au même taux à tous ses clients : demandez-lui s’il la pratique.`
      : `Remise : le tarif n’en prévoit que sur la part du prix au-delà de ${euros(REMISE.seuil)} ; à ${euros(prix)}, il n’y en a pas.`,
  );
  note('Les débours — les sommes que le notaire avance pour vous à d’autres, comme un service de l’État ou un syndic — sont remboursés à leur coût : l’estimation en compte 400 €, le forfait des notaires de France. La contribution de sécurité immobilière est comptée avec l’État.');
  details.append(resume, table, notes);
  return details;
}
const pc = (x: number) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const millions = (milliers: number) => `${(milliers / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} millions d’euros`;
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function brancherFrais(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('sf')) return;
  brancherChampLieu('sf-lieu', LIEUX);
  const form = $<HTMLFormElement>('sf-form');
  // La saisie d'un lien de calcul ou d'un rapport n'est remise qu'une fois, au premier lieu chargé.
  let restaure = false;
  brancherRapport(form, $('sf-resultat'), () => lieu?.nom ?? null);
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
    const f = prix > 0 ? fraisAchat(prix, dep, primo, neuf, { copro: coche('copro'), preemption: coche('preemption') }) : null;
    $('sf-resultat').hidden = !f;
    if (!f || !lieu) return;
    const u = f.usuel;
    const impots = f.departement + f.commune + f.etatAssiette + f.csi;
    const total = u?.total ?? f.total;
    $('sf-total').textContent = u ? `environ ${euros(Math.round(u.total / 10) * 10)}` : euros(f.total);
    $('sf-part').textContent = u
      ? `${pc((u.total / prix) * 100)} du prix, dont ${euros(impots)} d’impôts, ${euros(u.emolumentsHt + u.tva)} pour le notaire, TVA comprise, et ${euros(u.debours)} de débours`
      : `${pc((f.total / prix) * 100)} du prix, dont ${euros(impots)} d’impôts et ${euros(f.emolumentsHt + f.tva)} pour le notaire, TVA comprise`;
    $('sf-minimum').textContent = u
      ? `Le minimum fixé par le tarif est de ${euros(f.total)} : les impôts, l’acte et les seules formalités que toute vente exige. Un dossier ordinaire en demande davantage — pièces d’urbanisme, état hypothécaire, diagnostics —, et le notaire avance des débours. L’estimation les compte comme le simulateur des notaires de France : ${euros(FORFAITS_NOTAIRES.formalitesHt)} hors taxes de formalités et ${euros(FORFAITS_NOTAIRES.debours)} de débours. Seul le décompte du notaire fait foi.`
      : 'Dans le neuf, le simulateur ne compte que le minimum fixé par le tarif : les formalités et les débours d’un dossier s’y ajoutent.';

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
      { qui: 'L’État', icone: 'justice', montant: f.etatAssiette + f.csi, detail: `${euros(f.etatAssiette)} de frais d’assiette et de recouvrement, ${euros(f.csi)} de contribution de sécurité immobilière, perçue pour la publication de la vente au fichier immobilier`, lien: null },
      {
        qui: 'Le notaire',
        icone: 'deliberations',
        montant: u?.emolumentsHt ?? f.emolumentsHt,
        detail: u
          ? `au tarif réglementé, hors taxes : ${euros(f.acte)} pour la rédaction de l’acte, ${euros(u.formalitesHt)} de formalités estimées — ${euros(f.formalitesHt)} au minimum${u.emolumentsHt < f.acte + u.formalitesHt ? ', écrêtés à 10 % du prix' : ''}`
          : `au tarif réglementé, hors taxes : ${euros(f.acte)} pour la rédaction de l’acte, ${euros(f.formalitesHt)} pour les formalités${f.ecretement > 0 ? `, écrêtés de ${euros(f.ecretement)}` : ''}`,
        lien: null,
        detailNotaire: true,
      },
      { qui: 'La TVA sur les émoluments', icone: 'argent', montant: u?.tva ?? f.tva, detail: '20 % des émoluments, pour l’État', lien: null },
      { qui: 'Les débours, estimés', icone: 'argent', montant: u?.debours ?? 0, detail: 'les sommes que le notaire avance pour vous — cadastre, urbanisme, état hypothécaire — et qui lui sont remboursées à leur coût : le forfait des notaires de France', lien: null },
    ].filter((p) => p.montant > 0);
    const ul = $('sf-postes');
    ul.innerHTML = '';
    for (const p of postes) {
      const li = document.createElement('li');
      li.style.setProperty('--part', String((p.montant / total) * 100));
      const tete = document.createElement('div');
      tete.className = 'sf-tete';
      const nom = p.lien ? Object.assign(document.createElement('a'), { href: p.lien, textContent: p.qui }) : Object.assign(document.createElement('span'), { textContent: p.qui });
      tete.innerHTML = `<svg class="icone" width="24" height="24" aria-hidden="true"><use href="/icones.svg#${p.icone}"/></svg>`;
      tete.append(nom, Object.assign(document.createElement('strong'), { textContent: euros(p.montant) }));
      li.append(tete, Object.assign(document.createElement('span'), { className: 'sf-barre' }), Object.assign(document.createElement('small'), { textContent: p.detail }));
      if ('detailNotaire' in p) {
        // Le volet garde son état d'ouverture d'un calcul à l'autre.
        const avant = ul.dataset.ouvert === '1';
        const d = detailNotaire(f, prix);
        d.open = avant;
        d.addEventListener('toggle', () => (ul.dataset.ouvert = d.open ? '1' : ''));
        li.append(d);
      }
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
    if (!restaure) {
      restaurerSaisie(form);
      restaure = true;
    }
    form.hidden = false;
    calculer();
  };
  (form.elements.namedItem('prix') as HTMLInputElement).addEventListener('input', (e) => ((e.target as HTMLInputElement).dataset.saisi = '1'));
  quandLieu(LIEUX, null, (cle) => void preparer(cle));
}
