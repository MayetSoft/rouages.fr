/**
 * La pyramide des âges de chaque commune, d'après le recensement.
 *
 * La courbe des habitants dit combien ils sont, les naissances et les décès
 * pourquoi leur nombre bouge ; la pyramide dit qui ils sont. Une commune où
 * quatre habitants sur dix ont passé soixante ans n'a pas les mêmes besoins —
 * école, aide à domicile, transport — qu'une commune de jeunes ménages.
 *
 * La source est la table POP1 du recensement de l'INSEE : la population par
 * sexe et par âge, année par année, pour chaque commune et chaque département.
 * **Ce sont des estimations** : les valeurs sont pondérées, donc décimales, et
 * le millésime d'une petite commune est la moyenne de cinq années de collecte.
 * Le site les regroupe par tranches de cinq ans et ne publie jamais un âge
 * détaillé — dans un village, un âge précis tient à trois personnes.
 *
 * Le fichier national pèse 650 Mo décompressé : il est lu en flux, ligne à
 * ligne, sans jamais tenir en mémoire.
 *
 * Lancé seul — `tsx scripts/ages-emettre.ts` —, il réécrit les fichiers de
 * `public/territoires/dep/` sans toucher au reste de l'ingestion.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Le millésime lu, et le fichier complet du catalogue Melodi (73 Mo compressés). */
export const MILLESIME = 2023;
export const FICHIER = `https://api.insee.fr/melodi/file/DS_RP_TD_POPULATION_AGESEX_PRINC/DS_RP_TD_POPULATION_AGESEX_PRINC_${MILLESIME}_CSV_FR`;

/** Le début de chaque tranche de cinq ans ; la dernière, 95 ans, reçoit aussi les centenaires. */
export const TRANCHES = Array.from({ length: 20 }, (_, i) => i * 5);

/** Femmes puis hommes, par tranche, au dixième. */
type Pyramide = [number[], number[]];

export interface Ages {
  maj: string;
  millesime: number;
  communes: Map<string, Pyramide>;
  departements: Map<string, Pyramide>;
}

function tranche(age: string): number {
  if (age === 'Y_GE100') return TRANCHES.length - 1;
  const m = /^Y(\d+)$/.exec(age);
  return m ? Math.min(Math.floor(Number(m[1]) / 5), TRANCHES.length - 1) : -1;
}

/** Les lignes du CSV de données d'une archive Melodi, en flux. */
export async function* lignesArchive(chemin: string): AsyncGenerator<string> {
  const p = spawn('sh', ['-c', `unzip -p "${chemin}" '*_data.csv'`]);
  const fin = new Promise<void>((ok, ko) => {
    p.on('error', () => ko(new Error('« unzip » est requis pour lire les fichiers de l’INSEE')));
    p.on('close', (code) => (code === 0 ? ok() : ko(new Error(`unzip a rendu ${code}`))));
  });
  yield* createInterface({ input: p.stdout, crlfDelay: Infinity });
  await fin;
}

export async function lireAges(chemin: string): Promise<Omit<Ages, 'maj'>> {
  const communes = new Map<string, Pyramide>();
  const departements = new Map<string, Pyramide>();
  let col: Record<string, number> | null = null;
  for await (const l of lignesArchive(chemin)) {
    const v = l.replace(/"/g, '').split(';');
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['GEO', 'GEO_OBJECT', 'AGE', 'SEX', 'OBS_STATUS', 'OBS_VALUE', 'RP_MEASURE']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const objet = v[col.GEO_OBJECT];
    if (objet !== 'COM' && objet !== 'DEP') continue;
    const sexe = v[col.SEX];
    if ((sexe !== 'F' && sexe !== 'M') || v[col.RP_MEASURE] !== 'POP' || v[col.OBS_STATUS] !== 'A') continue;
    const t = tranche(v[col.AGE]);
    const n = Number(v[col.OBS_VALUE]);
    if (t === -1 || !Number.isFinite(n)) continue;
    const cible = objet === 'COM' ? communes : departements;
    let p = cible.get(v[col.GEO]);
    if (!p) cible.set(v[col.GEO], (p = [TRANCHES.map(() => 0), TRANCHES.map(() => 0)]));
    p[sexe === 'F' ? 0 : 1][t] += n;
  }
  const arrondir = (m: Map<string, Pyramide>) => {
    for (const p of m.values()) for (const s of p) for (let i = 0; i < s.length; i++) s[i] = Math.round(s[i] * 10) / 10;
  };
  arrondir(communes);
  arrondir(departements);
  return { millesime: MILLESIME, communes, departements };
}

export async function collecterAges(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Ages | null> {
  const vers = join(cache, 'insee-ages.zip');
  try {
    await telecharger(FICHIER, vers);
  } catch {
    dire('Pyramide des âges indisponible : celle de l’ingestion précédente reste en place.');
    return null;
  }
  const a = await lireAges(vers);
  if (a.communes.size === 0) {
    dire('Pyramide des âges : aucune commune lue.');
    return null;
  }
  dire(
    `Pyramide des âges : ${a.communes.size.toLocaleString('fr-FR')} communes et ` +
      `${a.departements.size} départements, recensement ${a.millesime}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...a };
}

/** Le département d'une commune, tel que le site range ses fichiers. */
function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Un fichier par département, `dep/03-ages.json`, qui porte aussi la pyramide
 * du département : c'est à elle que la page compare celle de la commune.
 * Seulement les départements que le site décrit.
 */
export function ecrireAges(sortie: string, a: Ages): number {
  const parDep = new Map<string, Record<string, Pyramide>>();
  for (const code of [...a.communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = a.communes.get(code)!;
  }
  let ecrits = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(
      join(sortie, 'dep', `${dep}-ages.json`),
      JSON.stringify({ maj: a.maj, millesime: a.millesime, tranches: TRANCHES, dep: a.departements.get(dep) ?? null, c }),
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
  const a = await collecterAges(telecharger, cache, console.log);
  if (a) console.log(`${ecrireAges(join(racine, 'public', 'territoires'), a)} départements écrits.`);
}
