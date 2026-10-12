/**
 * Le simulateur de rénovation, côté navigateur : la valeur de la maison avant
 * et après travaux d'après les ventes rapprochées d'un DPE (le même fichier
 * que le simulateur d'estimation), MaPrimeRénov' d'après le barème de l'Anah,
 * et la décence énergétique pour qui loue. Voir `src/modele/bareme-renovation.ts`.
 */
import { aLieu } from '../modele/signalement.ts';
import {
  AMPLEUR,
  enOutreMer,
  finDeLocation,
  gainDeClasses,
  NOMS_PROFILS,
  plafondsFoyer,
  profilDe,
} from '../modele/bareme-renovation.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';

/** Voir `Estimation` dans `scripts/estimation-emettre.ts` : on n'en lit que l'habitable, le terrain et le mélange d'étiquettes. */
type Estimation = [number | null, number | null, ...unknown[]];
type EffetsDpe = { multiplicateurs: Record<string, number>; ventes: number; ecart: [number, number]; portee: string };
type Fichier = { annees: number[]; dpe: EffetsDpe | null; c: Record<string, Estimation> };

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const arrondi = (x: number) => Math.round(x / 500) * 500;
const date = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
/** La veille d'une date ISO : le dernier jour où la règle ne s'applique pas encore. */
const veille = (iso: string) => new Date(Date.parse(`${iso}T12:00:00`) - 86_400_000).toISOString().slice(0, 10);

export function brancherRenovation(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('sr')) return;
  brancherChampLieu('sr-lieu', LIEUX);
  const form = $<HTMLFormElement>('sr-form');
  let lieu: Lieu | null = null;
  let f: Fichier;
  let e: Estimation;
  let dep = '';

  const champ = (n: string) => Math.max(0, Number((form.elements.namedItem(n) as HTMLInputElement).value) || 0);
  const valeur = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value;
  const coche = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).checked;
  const message = (t: string) => {
    $('sr-message').textContent = t;
    $('sr-message').hidden = !t;
  };
  const ligne = (ok: boolean, texte: string) => Object.assign(document.createElement('li'), { className: ok ? 'oui' : 'non', textContent: `${ok ? '✓' : '✗'} ${texte}` });

  const calculer = () => {
    const avant = valeur('avant');
    const apres = valeur('apres');
    const gain = gainDeClasses(avant, apres);

    // 1. La valeur, avant et après : l'estimation de la maison ordinaire de la commune, rapportée à chaque étiquette.
    const [h, c] = e;
    const melange = (e[10] as number | null | undefined) ?? null;
    const H = champ('habitable');
    const C = champ('terrain');
    const saisie = champ('valeur');
    const m = f.dpe?.multiplicateurs;
    const base = h && H ? h * H + (c ?? 0) * C : 0;
    const valeurAvant = saisie || (m && melange && base ? (base * m[avant]) / melange : 0);
    const valeurApres = m && valeurAvant ? (valeurAvant * m[apres]) / m[avant] : 0;
    const plusValue = valeurApres - valeurAvant;
    $('sr-valeur-estimee').textContent = !saisie && valeurAvant ? `estimée à ${euros(arrondi(valeurAvant))} d’après les ventes autour de la commune` : '';
    if (m && valeurAvant && gain > 0) {
      $('sr-avant').textContent = euros(arrondi(valeurAvant));
      $('sr-apres').textContent = euros(arrondi(valeurApres));
      $('sr-gain').textContent = `${plusValue >= 0 ? '+' : '−'}${euros(Math.abs(arrondi(plusValue)))}`;
      $('sr-valeur-note').textContent =
        `À surface, terrain et commune égaux, une maison ${apres} se vend ${Math.round((m[apres] / m[avant] - 1) * 100)} % plus cher qu’une maison ${avant}, ` +
        `d’après ${f.dpe!.ventes.toLocaleString('fr-FR')} ventes rapprochées d’un DPE (${f.dpe!.portee}). ` +
        `L’écart médian entre ces estimations et les prix réels est de ${Math.round(f.dpe!.ecart[1] * 100)} %.`;
      $('sr-valeur').hidden = false;
    } else $('sr-valeur').hidden = true;

    // 2. MaPrimeRénov' pour une rénovation d'ampleur.
    const ttc = champ('ttc');
    const tva = Number(valeur('tva'));
    const ht = ttc / (1 + tva);
    const profil = profilDe(dep, champ('personnes') || 1, champ('revenu'));
    const [tm, mo, im] = plafondsFoyer(dep, champ('personnes') || 1);
    $('sr-profil').textContent =
      `Revenus ${NOMS_PROFILS[profil]} : les plafonds de votre foyer sont de ${euros(tm)} (très modestes), ${euros(mo)} (modestes) et ${euros(im)} (intermédiaires).`;
    const conditions: [boolean, string][] = [
      [!enOutreMer(dep), 'un logement en France métropolitaine'],
      [AMPLEUR.classesEligibles.includes(avant), `classé E, F ou G avant travaux (ici ${avant})`],
      [gain >= AMPLEUR.gainMinimum, `un gain de deux classes au moins (ici ${gain > 0 ? gain : 'aucun'})`],
      [coche('quinze'), 'construit il y a quinze ans au moins'],
      [coche('principale'), 'une résidence principale'],
      [coche('decarbone'), 'en maison, ni gaz, ni fioul, ni charbon pour le chauffage et l’eau chaude après travaux'],
      [coche('isolation'), 'deux gestes d’isolation au moins dans les travaux'],
    ];
    const ul = $('sr-conditions');
    ul.innerHTML = '';
    for (const [ok, t] of conditions) ul.append(ligne(ok, t));
    const eligible = conditions.every(([ok]) => ok);
    const plafond = gain >= 3 ? AMPLEUR.plafond.troisOuPlus : AMPLEUR.plafond.deux;
    const brute = AMPLEUR.taux[profil] * Math.min(ht, plafond);
    const aide = eligible ? Math.min(brute, AMPLEUR.ecretement[profil] * ttc) : 0;
    const mar = champ('mar');
    const aideMar = eligible ? AMPLEUR.accompagnement.prise[profil] * Math.min(mar, AMPLEUR.accompagnement.plafond) : 0;
    const reste = ttc + mar - aide - aideMar;
    $('sr-aide').textContent = eligible && ttc ? euros(aide) : eligible ? '—' : 'non éligible';
    $('sr-aide-detail').textContent =
      eligible && ttc
        ? `${Math.round(AMPLEUR.taux[profil] * 100)} % de ${euros(Math.min(ht, plafond))} HT (plafond de ${euros(plafond)} pour un gain de ${gain >= 3 ? 'trois classes ou plus' : 'deux classes'})` +
          (aide < brute ? `, écrêtée à ${Math.round(AMPLEUR.ecretement[profil] * 100)} % du montant TTC` : '') +
          (aideMar ? ` ; accompagnement pris en charge à ${Math.round(AMPLEUR.accompagnement.prise[profil] * 100)} % : ${euros(aideMar)}` : '') +
          '.'
        : eligible
          ? 'Indiquez le montant de vos devis.'
          : 'Une condition au moins n’est pas remplie : la rénovation par geste ou les aides locales restent possibles, à voir avec un conseiller France Rénov’.';
    $('sr-reste').textContent = ttc ? euros(reste) : '—';

    // 3. Le bilan : le reste à charge face au gain de valeur mesuré. Aucun conseil, deux nombres côte à côte.
    const bilan = $('sr-bilan');
    if (ttc && m && valeurAvant && gain > 0) {
      bilan.textContent =
        plusValue >= reste
          ? `Le gain de valeur mesuré (${euros(arrondi(plusValue))}) dépasse le reste à charge (${euros(reste)}).`
          : `Le gain de valeur mesuré (${euros(arrondi(plusValue))}) couvre ${Math.max(0, Math.round((plusValue / reste) * 100))} % du reste à charge (${euros(reste)}).`;
      bilan.hidden = false;
    } else bilan.hidden = true;

    // 4. La location : jusqu'à quand chaque classe reste décente.
    const loc = $('sr-location');
    loc.innerHTML = '';
    for (const [quand, cl] of [
      ['Avant travaux', avant],
      ['Après travaux', apres],
    ] as const) {
      const fin = finDeLocation(dep, cl);
      const passe = fin !== null && fin <= new Date().toISOString().slice(0, 10);
      loc.append(
        Object.assign(document.createElement('li'), {
          className: fin ? (passe ? 'non' : 'bientot') : 'oui',
          textContent: `${quand} (${cl}) : ${fin ? (passe ? `ne peut plus être mis en location depuis le ${date(fin)}` : `peut être mis en location jusqu’au ${date(veille(fin))}`) : 'peut être loué, au regard de la décence énergétique'}.`,
        }),
      );
    }
    $('sr-resultat').hidden = false;
  };

  form.addEventListener('input', calculer);

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return message('Cherchez la commune du logement par son nom ou son code postal.');
    retenirLieu(lieu.cle);
    dep = lieu.deps[0];
    try {
      const r = await fetch(`/territoires/simulateurs/estimation/${dep}.json`);
      if (!r.ok) throw new Error(String(r.status));
      f = (await r.json()) as Fichier;
    } catch {
      return message('Les données n’ont pas pu être lues. Réessayez dans un instant.');
    }
    e = f.c[lieu.cle.slice(2)] ?? [null, null];
    message(
      f.dpe
        ? ''
        : `L’effet de l’étiquette sur les prix n’est pas mesuré ${aLieu(lieu.nom)} — trop peu de ventes rapprochées d’un DPE dans la région : seules l’aide et la location sont calculées.`,
    );
    $('sr-titre').textContent = aLieu(lieu.nom).replace(/^./, (x) => x.toUpperCase());
    form.hidden = false;
    calculer();
    (form.elements.namedItem('habitable') as HTMLInputElement).focus();
  };
  quandLieu(LIEUX, null, (cle) => void preparer(cle));
}

