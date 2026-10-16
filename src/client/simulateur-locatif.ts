/**
 * Le simulateur de rentabilité locative, côté navigateur : le prix et le loyer
 * préremplis d'après les ventes (DVF) et la carte des loyers, les frais
 * d'achat au taux du département, l'étiquette énergétique au regard de la
 * décence, et le rendement avant impôt. Voir `src/pages/simulateurs/locatif/[dep].json.ts`.
 */
import { aLieu } from '../modele/signalement.ts';
import { fraisAchat } from '../modele/bareme-achat.ts';
import { finDeLocation } from '../modele/bareme-renovation.ts';
import { brancherRapport, restaurerSaisie } from './rapport.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';

type Loyer = [number, number, number, 0 | 1] | null;
type Fichier = {
  loyers: { millesime: number; maj: string } | null;
  ventes: { annees: number[]; minimum: number } | null;
  dep: [number | null, number | null];
  c: Record<string, [Loyer, Loyer, number | null, number | null]>;
};

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const pc = (x: number) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/^1 /, '1er ');
/** Mensualité d'un prêt à taux fixe : capital, taux annuel en %, durée en années. */
const mensualite = (capital: number, taux: number, ans: number) => {
  const n = ans * 12;
  const t = taux / 100 / 12;
  if (capital <= 0 || n <= 0) return 0;
  return t === 0 ? capital / n : (capital * t) / (1 - (1 + t) ** -n);
};

export function brancherLocatif(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('sl')) return;
  brancherChampLieu('sl-lieu', LIEUX);
  const form = $<HTMLFormElement>('sl-form');
  // La saisie d'un lien de calcul ou d'un rapport n'est remise qu'une fois, au premier lieu chargé.
  let restaure = false;
  brancherRapport(form, $('sl-resultat'), () => lieu?.nom ?? null);
  let lieu: Lieu | null = null;
  let dep = '';
  let f: Fichier;
  let ligne: Fichier['c'][string] | undefined;

  const el = <T extends HTMLInputElement | HTMLSelectElement>(n: string) => form.elements.namedItem(n) as T;
  const champ = (n: string) => Math.max(0, Number(el(n).value) || 0);
  const saisi = (n: string) => el(n).dataset.saisi === '1';
  for (const n of ['prix', 'loyer']) el(n).addEventListener('input', () => (el(n).dataset.saisi = '1'));

  /** Le loyer de la carte pour ce type de logement, et le prix au m² des ventes : de la commune, sinon du département. */
  const references = () => {
    const maison = el('type').value === 'maison';
    const l = ligne?.[maison ? 1 : 0] ?? null;
    const m2Commune = ligne?.[maison ? 2 : 3] ?? null;
    const m2 = m2Commune ?? f.dep[maison ? 0 : 1];
    return { maison, l, m2, m2Commune };
  };

  const preremplir = () => {
    const { l, m2 } = references();
    const S = champ('surface');
    if (!saisi('prix') && m2 && S) el('prix').value = String(Math.round((m2 * S) / 1000) * 1000);
    if (!saisi('loyer') && l && S) el('loyer').value = String(Math.round(l[0] * S));
  };

  const calculer = () => {
    const { maison, l, m2, m2Commune } = references();
    const S = champ('surface');
    const prix = champ('prix');
    const loyer = champ('loyer');
    const travaux = champ('travaux');
    const fa = prix ? fraisAchat(prix, dep, false) : null;
    // L'estimation d'un dossier ordinaire, formalités et débours compris, plutôt que le minimum du tarif.
    const frais = fa ? (fa.usuel?.total ?? fa.total) : 0;
    const cout = prix + frais + travaux;

    $('sl-references').textContent = [
      m2 ? `Prix médian au m² des ${maison ? 'maisons vendues' : 'appartements vendus'} ${m2Commune ? aLieu(lieu!.nom) : 'dans le département'} : ${euros(m2)} (${f.ventes?.annees[0]} à ${f.ventes?.annees.at(-1)}).` : '',
      l ? `Loyer d’annonce estimé ${aLieu(lieu!.nom)} : ${l[0].toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/m² charges comprises, entre ${l[1].toLocaleString('fr-FR')} et ${l[2].toLocaleString('fr-FR')} €${l[3] ? ' — estimation fragile, sur peu d’annonces' : ''}.` : 'Pas de loyer estimé ici par la carte des loyers.',
    ]
      .filter(Boolean)
      .join(' ');

    if (!cout || !loyer) {
      $('sl-resultat').hidden = true;
      return;
    }
    const vacance = Math.min(12, champ('vacance'));
    const gestion = Math.min(100, champ('gestion')) / 100;
    const charges = champ('charges');
    const annuel = loyer * 12;
    const encaisse = loyer * (12 - vacance) * (1 - gestion);
    const net = encaisse - charges;

    $('sl-cout').textContent = euros(cout);
    $('sl-cout-detail').textContent = `${euros(prix)} de prix, environ ${euros(frais)} de frais d’achat au taux du département${travaux ? `, ${euros(travaux)} de travaux` : ''}`;
    $('sl-brut').textContent = pc((annuel / cout) * 100);
    $('sl-net').textContent = pc((net / cout) * 100);
    $('sl-net-detail').textContent = `${euros(encaisse)} encaissés par an${vacance ? ` (${vacance} mois vacants)` : ''}${gestion ? `, après ${Math.round(gestion * 100)} % de gestion` : ''}, moins ${euros(charges)} de charges et de taxe foncière.`;
    // La fourchette de la carte des loyers, appliquée au rendement brut.
    $('sl-fourchette').textContent =
      l && S ? `Avec le loyer bas ou haut de la carte : de ${pc(((l[1] * S * 12) / cout) * 100)} à ${pc(((l[2] * S * 12) / cout) * 100)} brut.` : '';

    // Le crédit, s'il y en a un.
    const apport = champ('apport');
    const capital = Math.max(0, cout - apport);
    const m = mensualite(capital, Number(el('taux').value) || 0, champ('duree'));
    $('sl-credit').hidden = !(m > 0);
    if (m > 0) {
      $('sl-mensualite').textContent = euros(m);
      const flux = net / 12 - m;
      $('sl-flux').textContent = `${flux >= 0 ? '+' : '−'}${euros(Math.abs(flux))}`;
      $('sl-flux-detail').textContent = `par mois : le loyer net moyen (${euros(net / 12)}) moins la mensualité, pour ${euros(capital)} empruntés, hors assurance de prêt.`;
    }

    // La décence énergétique.
    const classe = el('dpe').value;
    const fin = classe ? finDeLocation(dep, classe) : null;
    const auj = new Date().toISOString().slice(0, 10);
    const dpe = $('sl-dpe');
    dpe.className = `jeu-contexte ${fin ? (fin <= auj ? 'sl-non' : 'sl-bientot') : ''}`;
    dpe.textContent = !classe
      ? 'Indiquez l’étiquette énergétique : elle dit jusqu’à quand le logement peut être loué.'
      : fin && fin <= auj
        ? `Un logement classé ${classe} ne peut plus être mis en location depuis le ${date(fin)} : il n’est plus « décent » au sens du décret n° 2023-796. Sans travaux, ce rendement n’existe pas.`
        : fin
          ? `Un logement classé ${classe} ne pourra plus être mis en location à partir du ${date(fin)}, sauf travaux : ${Math.max(0, Math.floor((Date.parse(fin) - Date.now()) / (30.44 * 86_400_000)))} mois d’ici là. Le simulateur de rénovation chiffre les travaux et les aides.`
          : `Un logement classé ${classe} reste louable au regard de la décence énergétique.`;
    $('sl-resultat').hidden = false;
  };

  form.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).getAttribute('name') === 'type') {
      el('surface').value = el('type').value === 'maison' ? '92' : '52';
      delete el('prix').dataset.saisi;
      delete el('loyer').dataset.saisi;
    }
    if (['type', 'surface'].includes((e.target as HTMLElement).getAttribute('name') ?? '')) preremplir();
    calculer();
  });

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return;
    retenirLieu(lieu.cle);
    dep = lieu.deps[0];
    try {
      const r = await fetch(`/simulateurs/locatif/${dep}.json`);
      if (!r.ok) throw new Error(String(r.status));
      f = (await r.json()) as Fichier;
    } catch {
      $('sl-message').textContent = 'Les données n’ont pas pu être lues. Réessayez dans un instant.';
      $('sl-message').hidden = false;
      return;
    }
    $('sl-message').hidden = true;
    ligne = f.c[lieu.cle.slice(2)];
    // Là où l'on ne vend presque que des maisons, on commence par une maison.
    if (!ligne?.[3] && (ligne?.[2] || ligne?.[1])) {
      el('type').value = 'maison';
      el('surface').value = '92';
    }
    delete el('prix').dataset.saisi;
    delete el('loyer').dataset.saisi;
    $('sl-titre').textContent = aLieu(lieu.nom).replace(/^./, (x) => x.toUpperCase());
    if (!restaure) {
      restaurerSaisie(form);
      restaure = true;
    }
    form.hidden = false;
    preremplir();
    calculer();
  };
  quandLieu(LIEUX, null, (cle) => void preparer(cle));
}
