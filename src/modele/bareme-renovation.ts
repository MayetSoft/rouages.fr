/**
 * Les règles publiques dont se sert le simulateur de rénovation, chacune avec
 * son texte et la date à laquelle elle a été relue. Rien ici n'est estimé :
 * ce sont des barèmes et des dates fixés par l'État ou l'Anah. Quand un texte
 * change, on corrige ce fichier, sa date et sa source — et rien d'autre.
 */

/** Relu le 12 octobre 2026, sur les textes ci-dessous. */
export const RELU = '2026-10-12';

export const SOURCES = {
  guideAnah: {
    titre: 'Anah — Les aides financières en 2026, édition septembre 2026',
    url: 'https://www.anah.gouv.fr/document/guide-des-aides-financieres-0226',
  },
  deliberationAnah: {
    titre: 'Anah — délibération n° 2026-23 du 26 juin 2026, dossiers déposés à compter du 1er septembre 2026',
    url: 'https://www.anah.gouv.fr/sites/default/files/2026-07/Deliberation-2026-23_Regime-aides-applicable-aux-proprietaires-occupants.pdf',
  },
  decence: {
    titre: 'Décret n° 2023-796 du 18 août 2023 (niveau de performance minimal d’un logement décent)',
    url: 'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000047980618',
  },
} as const;

export type Profil = 'tres-modeste' | 'modeste' | 'intermediaire' | 'superieur';

export const NOMS_PROFILS: Record<Profil, string> = {
  'tres-modeste': 'très modestes',
  modeste: 'modestes',
  intermediaire: 'intermédiaires',
  superieur: 'supérieurs',
};

/**
 * Les plafonds de revenu fiscal de référence au 1er janvier 2026 (guide de
 * l'Anah, p. 7) : très modestes, modestes, intermédiaires, pour 1 à 5
 * personnes, puis par personne supplémentaire. Au-delà : « supérieurs ».
 */
const PLAFONDS: Record<'idf' | 'autres', { base: [number, number, number][]; enPlus: [number, number, number] }> = {
  idf: {
    base: [
      [24_031, 29_253, 40_851],
      [35_270, 42_933, 60_051],
      [42_357, 51_564, 71_846],
      [49_455, 60_208, 84_562],
      [56_580, 68_877, 96_817],
    ],
    enPlus: [7_116, 8_663, 12_257],
  },
  autres: {
    base: [
      [17_363, 22_259, 31_185],
      [25_393, 32_553, 45_842],
      [30_540, 39_148, 55_196],
      [35_676, 45_735, 64_550],
      [40_835, 52_348, 73_907],
    ],
    enPlus: [5_151, 6_598, 9_357],
  },
};

const ILE_DE_FRANCE = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
export const enIleDeFrance = (dep: string) => ILE_DE_FRANCE.has(dep);
export const enOutreMer = (dep: string) => dep.startsWith('97');

/** Les trois plafonds d'un foyer, selon sa taille et sa région. */
export function plafondsFoyer(dep: string, personnes: number): [number, number, number] {
  const t = PLAFONDS[enIleDeFrance(dep) ? 'idf' : 'autres'];
  const n = Math.max(1, Math.round(personnes));
  if (n <= 5) return t.base[n - 1];
  const plus = n - 5;
  return t.base[4].map((v, i) => v + plus * t.enPlus[i]) as [number, number, number];
}

export function profilDe(dep: string, personnes: number, revenu: number): Profil {
  const [tm, m, i] = plafondsFoyer(dep, personnes);
  return revenu <= tm ? 'tres-modeste' : revenu <= m ? 'modeste' : revenu <= i ? 'intermediaire' : 'superieur';
}

/**
 * MaPrimeRénov' pour une rénovation d'ampleur (guide de l'Anah, p. 17 à 22) :
 * un logement de France métropolitaine de 15 ans au moins, classé E, F ou G,
 * résidence principale ; un gain de deux classes au moins, deux gestes
 * d'isolation, un Accompagnateur Rénov' ; en maison, plus de chauffage ni
 * d'eau chaude au gaz, au fioul ou au charbon après travaux (dossiers déposés
 * depuis le 1er septembre 2026).
 */
export const AMPLEUR = {
  classesEligibles: ['E', 'F', 'G'],
  gainMinimum: 2,
  /** Plafond des dépenses éligibles HT : gain de deux classes, de trois ou plus. */
  plafond: { deux: 30_000, troisOuPlus: 40_000 },
  /** Taux, en part du montant HT dans la limite du plafond. */
  taux: { 'tres-modeste': 0.8, modeste: 0.6, intermediaire: 0.45, superieur: 0.1 } as Record<Profil, number>,
  /** Écrêtement : l'ensemble des aides ne dépasse pas cette part du montant TTC. */
  ecretement: { 'tres-modeste': 1, modeste: 0.9, intermediaire: 0.8, superieur: 0.5 } as Record<Profil, number>,
  /** Mon Accompagnateur Rénov' : prise en charge dans la limite de 2 000 € TTC (guide, p. 21). */
  accompagnement: { plafond: 2_000, prise: { 'tres-modeste': 1, modeste: 0.8, intermediaire: 0.4, superieur: 0.2 } as Record<Profil, number> },
};

export const ETIQUETTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const gainDeClasses = (avant: string, apres: string) => ETIQUETTES.indexOf(avant as never) - ETIQUETTES.indexOf(apres as never);

/**
 * La décence énergétique (décret n° 2023-796) : la classe minimale d'un
 * logement mis en location, et la date à partir de laquelle elle s'impose.
 * En métropole : F en 2025, E en 2028, D en 2034. Dans les départements
 * d'outre-mer : F en 2028, E en 2031.
 */
export function echeancesLocation(dep: string): { depuis: string; minimum: string }[] {
  return enOutreMer(dep)
    ? [
        { depuis: '2028-01-01', minimum: 'F' },
        { depuis: '2031-01-01', minimum: 'E' },
      ]
    : [
        { depuis: '2025-01-01', minimum: 'F' },
        { depuis: '2028-01-01', minimum: 'E' },
        { depuis: '2034-01-01', minimum: 'D' },
      ];
}

/** La première date à partir de laquelle un logement de cette classe ne peut plus être mis en location, ou null. */
export function finDeLocation(dep: string, classe: string): string | null {
  const rang = ETIQUETTES.indexOf(classe as never);
  return echeancesLocation(dep).find((e) => rang > ETIQUETTES.indexOf(e.minimum as never))?.depuis ?? null;
}
