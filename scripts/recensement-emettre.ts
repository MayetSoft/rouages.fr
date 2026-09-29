/**
 * Trois tables du recensement de l'INSEE, lues de la même façon : le parc de
 * logements, l'activité des 15-64 ans, et où travaillent ceux qui ont un emploi
 * — et comment ils s'y rendent.
 *
 * Chaque table croise une dizaine de dimensions (âge, sexe, type de logement,
 * ancienneté…). On ne garde que les cases dont toutes les dimensions sont au
 * total, sauf celles qu'on nomme : c'est ce qui évite de compter deux fois un
 * même logement. Les effectifs sont des estimations — le recensement tourne par
 * cinquièmes de communes sur cinq ans —, arrondis ici au dixième, et la page
 * les donne en parts.
 *
 * Le logement social est lu ici, par ses occupants : les ménages locataires
 * d'un logement vide du parc social. Le répertoire des bailleurs sociaux
 * (RPLS) dirait le parc lui-même, mais il ne se publie qu'au logement — cinq
 * millions de lignes, adresse par adresse — et aucun décompte communal n'est en
 * données ouvertes nationales.
 *
 * Lancé seul — `tsx scripts/recensement-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-parc.json` et `XX-emploi.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lignesArchive } from './ages-emettre.ts';
import { ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

const MELODI = (ds: string, an: number) => `https://api.insee.fr/melodi/file/${ds}/${ds}_${an}_CSV_FR`;
export const MILLESIME = 2023;
export const ANCIEN = 2012;

/** Une case : les dimensions qu'on fixe ; toutes les autres doivent être au total. */
type Case = Record<string, string>;

interface Table {
  jeu: string;
  /** Les cases lues, dans l'ordre où la page les attend. */
  cases: Case[];
  /** Les colonnes qui ne sont pas des dimensions. */
  horsDimensions?: string[];
}

export const PARC: Table = {
  jeu: 'DS_RP_LOGEMENT_PRINC',
  cases: [
    { RP_MEASURE: 'DWELLINGS' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_SEC_DW_OCC' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_VAC' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', TSH: '100' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', TSH: '211' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', TSH: '221' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', TSH: '212_222' },
    { RP_MEASURE: 'DWELLINGS', OCS: 'DW_MAIN', TSH: '300' },
  ],
};
/** Les libellés des cases de PARC, pour la page. */
export const PARC_LIBELLES = [
  'Logements',
  'Résidences principales',
  'Résidences secondaires et logements occasionnels',
  'Logements vacants',
  'Propriétaires',
  'Locataires du parc privé',
  'Locataires d’un logement social',
  'Locataires d’un meublé',
  'Logés gratuitement',
];

export const ACTIVITE: Table = {
  jeu: 'DS_RP_EMPLOI_LR_PRINC',
  cases: [
    { AGE: 'Y15T64', RP_MEASURE: 'POP' },
    { AGE: 'Y15T64', RP_MEASURE: 'POP', EMPSTA_ENQ: '1' },
    { AGE: 'Y15T64', RP_MEASURE: 'POP', EMPSTA_ENQ: '2' },
    { AGE: 'Y15T64', RP_MEASURE: 'POP', EMPSTA_ENQ: '31' },
    { AGE: 'Y15T64', RP_MEASURE: 'POP', EMPSTA_ENQ: '33' },
    { AGE: 'Y15T64', RP_MEASURE: 'POP', EMPSTA_ENQ: '35T36' },
  ],
};
export const ACTIVITE_LIBELLES = [
  'Habitants de 15 à 64 ans',
  'Ont un emploi',
  'Chômeurs',
  'Retraités ou préretraités',
  'Élèves, étudiants, stagiaires non rémunérés',
  'Autres inactifs',
];

export const NAVETTES: Table = {
  jeu: 'DS_RP_NAVETTES_PRINC',
  // Les actifs ayant un emploi, de 15 ans ou plus : ce sont les deux seules
  // valeurs que la table connaît pour ces dimensions.
  cases: [
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', WORK_AREA: '10' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', WORK_AREA: '21' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', WORK_AREA: '22' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', WORK_AREA: '23' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', WORK_AREA: '24T30' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', TRANS: '1' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', TRANS: '2' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', TRANS: '3T4' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', TRANS: '5' },
    { RP_MEASURE: 'POP', AGE: 'Y_GE15', EMPSTA_ENQ: '1', TRANS: '6' },
  ],
};
export const NAVETTES_LIBELLES = [
  'Actifs ayant un emploi',
  'Dans la commune',
  'Ailleurs dans le département',
  'Dans un autre département de la région',
  'Dans une autre région',
  'Hors de la métropole ou à l’étranger',
  'Sans transport',
  'À pied',
  'À vélo ou en deux-roues motorisé',
  'En voiture, camion ou fourgonnette',
  'En transports en commun',
];

const HORS_DIMENSIONS = new Set(['GEO', 'GEO_OBJECT', 'FREQ', 'TIME_PERIOD', 'OBS_VALUE', 'OBS_STATUS', 'OBS_STATUS_FR', 'CONF_STATUS', 'UNIT_MEASURE', 'UNIT_MULT']);

/** Par millésime, les valeurs des cases ; null si le millésime manque. */
export type Valeurs = (number[] | null)[];

export interface Lu {
  communes: Map<string, Valeurs>;
  departements: Map<string, Valeurs>;
  france: Valeurs | null;
}

export async function lireTable(chemin: string, t: Table, millesimes: number[]): Promise<Lu> {
  const communes = new Map<string, Valeurs>();
  const departements = new Map<string, Valeurs>();
  let france: Valeurs | null = null;
  let col: Record<string, number> | null = null;
  let dims: string[] = [];
  // Pour chaque case, la liste des dimensions qu'elle laisse au total.
  let auTotal: string[][] = [];
  for await (const l of lignesArchive(chemin)) {
    const v = l.replace(/"/g, '').split(';');
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['GEO', 'GEO_OBJECT', 'TIME_PERIOD', 'OBS_VALUE']) {
        if (col[n] === undefined) throw new Error(`${t.jeu} : colonne « ${n} » absente — le fichier a changé de forme`);
      }
      dims = Object.keys(col).filter((n) => !HORS_DIMENSIONS.has(n));
      for (const c of t.cases) {
        for (const d of Object.keys(c)) if (!dims.includes(d)) throw new Error(`${t.jeu} : dimension « ${d} » absente`);
      }
      auTotal = t.cases.map((c) => dims.filter((d) => !(d in c)));
      continue;
    }
    if (col.OBS_STATUS !== undefined && v[col.OBS_STATUS] !== 'A') continue;
    const m = millesimes.indexOf(Number(v[col.TIME_PERIOD]));
    if (m === -1) continue;
    const objet = v[col.GEO_OBJECT];
    const estFrance = objet === 'FRANCE' && v[col.GEO] === 'F';
    if (objet !== 'COM' && objet !== 'DEP' && !estFrance) continue;
    const k = t.cases.findIndex(
      (c, i) => Object.entries(c).every(([d, x]) => v[col![d]] === x) && auTotal[i].every((d) => v[col![d]] === '_T'),
    );
    if (k === -1) continue;
    const n = Number(v[col.OBS_VALUE]);
    if (!Number.isFinite(n)) continue;
    let x: Valeurs;
    if (estFrance) x = france ??= millesimes.map(() => null);
    else {
      const cible = objet === 'COM' ? communes : departements;
      let y = cible.get(v[col.GEO]);
      if (!y) cible.set(v[col.GEO], (y = millesimes.map(() => null)));
      x = y;
    }
    x[m] ??= t.cases.map(() => 0);
    x[m]![k] = Math.round(n * 10) / 10;
  }
  return { communes, departements, france };
}

export interface Recensement {
  maj: string;
  parc: Lu | null;
  activite: Lu | null;
  navettes: Lu | null;
}

export async function collecterRecensement(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Recensement | null> {
  const lire = async (t: Table, nom: string, millesimes: number[]) => {
    const vers = join(cache, `insee-${nom}.zip`);
    try {
      await telecharger(MELODI(t.jeu, MILLESIME), vers);
    } catch {
      dire(`Recensement, ${nom} : indisponible, l’ingestion précédente reste en place.`);
      return null;
    }
    const l = await lireTable(vers, t, millesimes);
    if (l.communes.size < 30000 || !l.france?.[0]) {
      dire(`Recensement, ${nom} : ${l.communes.size} communes, ou pas de total national — on garde l’ingestion précédente.`);
      return null;
    }
    dire(`Recensement ${millesimes.join(' et ')}, ${nom} : ${l.communes.size.toLocaleString('fr-FR')} communes.`);
    return l;
  };
  const parc = await lire(PARC, 'logement', [MILLESIME, ANCIEN]);
  const activite = await lire(ACTIVITE, 'activite', [MILLESIME, ANCIEN]);
  const navettes = await lire(NAVETTES, 'navettes', [MILLESIME]);
  if (!parc && !activite && !navettes) return null;
  return { maj: new Date().toISOString().slice(0, 10), parc, activite, navettes };
}

/** `XX-parc.json` et `XX-emploi.json` : la commune, et son département et la France pour comparer. */
export function ecrireRecensement(sortie: string, r: Recensement): number {
  let ecrits = 0;
  if (r.parc) {
    const p = r.parc;
    ecrits += ecrireParDepartement(sortie, 'parc', p.communes, (dep) => ({
      maj: r.maj,
      millesimes: [MILLESIME, ANCIEN],
      libelles: PARC_LIBELLES,
      dep: p.departements.get(dep) ?? null,
      france: p.france,
    }));
  }
  if (r.activite || r.navettes) {
    const codes = new Set([...(r.activite?.communes.keys() ?? []), ...(r.navettes?.communes.keys() ?? [])]);
    const c = new Map([...codes].map((code) => [code, [r.activite?.communes.get(code) ?? null, r.navettes?.communes.get(code)?.[0] ?? null]]));
    ecrits += ecrireParDepartement(sortie, 'emploi', c, (dep) => ({
      maj: r.maj,
      millesimes: [MILLESIME, ANCIEN],
      activite: ACTIVITE_LIBELLES,
      navettes: NAVETTES_LIBELLES,
      dep: [r.activite?.departements.get(dep) ?? null, r.navettes?.departements.get(dep)?.[0] ?? null],
      france: [r.activite?.france ?? null, r.navettes?.france?.[0] ?? null],
    }));
  }
  return ecrits;
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const r = await collecterRecensement(telecharger, cache, console.log);
  if (r) console.log(`${ecrireRecensement(sortie, r)} fichiers départementaux écrits.`);
}
