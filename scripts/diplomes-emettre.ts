/**
 * Les diplômes des habitants de chaque commune, d'après le recensement.
 *
 * Le diplôme le plus élevé des personnes de 15 ans ou plus qui ne sont plus
 * scolarisées : sept niveaux, d'« aucun diplôme » à « bac + 5 ou plus ». Le
 * recensement ne va pas au-delà — ni doctorat ni bac + 8 à l'échelle d'une
 * commune, même dans la table détaillée.
 *
 * Deux millésimes, 2017 et 2023 : ce sont les deux seuls où l'INSEE sépare
 * bac + 3 ou 4 et bac + 5 (en 2012, les deux étaient confondus). Les deux sont
 * publiés dans la géographie communale actuelle, communes nouvelles comprises.
 *
 * **Ce sont des estimations**, pondérées et décimales comme celles de la
 * pyramide des âges : le millésime d'une commune de moins de 10 000 habitants
 * combine cinq années de collecte.
 *
 * Lancé seul — `tsx scripts/diplomes-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-diplomes.json` sans toucher au reste.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lignesArchive } from './ages-emettre.ts';

export const MILLESIMES = [2023, 2017] as const;
export const FICHIER =
  'https://api.insee.fr/melodi/file/DS_RP_DIPLOMES_PRINC/DS_RP_DIPLOMES_PRINC_2023_CSV_FR';

/** Les niveaux, du moins au plus diplômé, avec le code du recensement et le nom court que la page affiche. */
export const NIVEAUX: [string, string][] = [
  ['001T100_RP', 'Aucun diplôme ou certificat d’études'],
  ['200_RP', 'Brevet des collèges'],
  ['300_RP', 'CAP, BEP'],
  ['350T351_RP', 'Bac ou brevet professionnel'],
  ['500_RP', 'Bac + 2'],
  ['600_RP', 'Bac + 3 ou 4'],
  ['700_RP', 'Bac + 5 ou plus'],
];

/** Pour chaque millésime de MILLESIMES, l'effectif de chaque niveau ; null si le millésime manque. */
type Effectifs = (number[] | null)[];

export interface Diplomes {
  maj: string;
  communes: Map<string, Effectifs>;
  departements: Map<string, Effectifs>;
  france: Effectifs | null;
}

export async function lireDiplomes(chemin: string): Promise<Omit<Diplomes, 'maj'>> {
  const rang = new Map(NIVEAUX.map(([code], i) => [code, i]));
  const communes = new Map<string, Effectifs>();
  const departements = new Map<string, Effectifs>();
  let france: Effectifs | null = null;
  let col: Record<string, number> | null = null;
  for await (const l of lignesArchive(chemin)) {
    const v = l.replace(/"/g, '').split(';');
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['GEO', 'GEO_OBJECT', 'AGE', 'SEX', 'EDUC', 'RP_MEASURE', 'OBS_STATUS', 'TIME_PERIOD', 'OBS_VALUE']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const objet = v[col.GEO_OBJECT];
    // « F », la France hors Mayotte : la référence des communes d'outre-mer comme de métropole.
    const estFrance = objet === 'FRANCE' && v[col.GEO] === 'F';
    if (objet !== 'COM' && objet !== 'DEP' && !estFrance) continue;
    if (v[col.SEX] !== '_T' || v[col.AGE] !== 'Y_GE15' || v[col.RP_MEASURE] !== 'POP' || v[col.OBS_STATUS] !== 'A') continue;
    const m = MILLESIMES.indexOf(Number(v[col.TIME_PERIOD]) as (typeof MILLESIMES)[number]);
    const r = rang.get(v[col.EDUC]);
    const n = Number(v[col.OBS_VALUE]);
    if (m === -1 || r === undefined || v[col.OBS_VALUE] === '' || !Number.isFinite(n)) continue;
    let e: Effectifs;
    if (estFrance) e = france ??= MILLESIMES.map(() => null);
    else {
      const cible = objet === 'COM' ? communes : departements;
      let x = cible.get(v[col.GEO]);
      if (!x) cible.set(v[col.GEO], (x = MILLESIMES.map(() => null)));
      e = x;
    }
    (e[m] ??= NIVEAUX.map(() => 0))[r] += n;
  }
  const arrondir = (e: Effectifs) => {
    for (const s of e) if (s) for (let i = 0; i < s.length; i++) s[i] = Math.round(s[i] * 10) / 10;
  };
  for (const e of communes.values()) arrondir(e);
  for (const e of departements.values()) arrondir(e);
  if (france) arrondir(france);
  return { communes, departements, france };
}

export async function collecterDiplomes(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Diplomes | null> {
  const vers = join(cache, 'insee-diplomes.zip');
  try {
    await telecharger(FICHIER, vers);
  } catch {
    dire('Diplômes indisponibles : ceux de l’ingestion précédente restent en place.');
    return null;
  }
  const d = await lireDiplomes(vers);
  if (d.communes.size === 0 || !d.france?.[0]) {
    dire('Diplômes : aucune commune lue, ou pas de total national.');
    return null;
  }
  const recents = [...d.communes.values()].filter((e) => e[0]).length;
  dire(
    `Diplômes : ${recents.toLocaleString('fr-FR')} communes au recensement ${MILLESIMES[0]}, ` +
      `${d.departements.size} départements.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...d };
}

function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Un fichier par département, `dep/03-diplomes.json`, qui porte aussi les
 * effectifs du département et de la France : c'est à eux que la page compare.
 */
export function ecrireDiplomes(sortie: string, d: Diplomes): number {
  const parDep = new Map<string, Record<string, Effectifs>>();
  for (const code of [...d.communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = d.communes.get(code)!;
  }
  let ecrits = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(
      join(sortie, 'dep', `${dep}-diplomes.json`),
      JSON.stringify({
        maj: d.maj,
        millesimes: MILLESIMES,
        niveaux: NIVEAUX.map(([, nom]) => nom),
        france: d.france,
        dep: d.departements.get(dep) ?? null,
        c,
      }),
    );
    ecrits++;
  }
  return ecrits;
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const cache = join(racine, '.cache');
  if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
  const telecharger = async (url: string, vers: string) => {
    if (existsSync(vers)) return;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    writeFileSync(vers, Buffer.from(await r.arrayBuffer()));
  };
  const d = await collecterDiplomes(telecharger, cache, console.log);
  if (d) console.log(`${ecrireDiplomes(join(racine, 'public', 'territoires'), d)} départements écrits.`);
}
