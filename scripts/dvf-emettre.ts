/**
 * Le prix des maisons et des appartements, commune par commune, d'après les
 * demandes de valeurs foncières (DVF) de la direction générale des finances
 * publiques, dans la version géolocalisée qu'en publie data.gouv.
 *
 * DVF recense chaque vente passée devant notaire, mais une vente peut porter
 * sur plusieurs biens : une maison et deux garages, trois appartements d'un
 * immeuble, une maison et un champ. Le prix au mètre carré n'a de sens que pour
 * une vente d'un seul logement. D'où la règle, écrite une fois ici :
 * - une vente (nature « Vente », pas un échange ni une adjudication) ;
 * - un seul logement, maison ou appartement, et rien d'autre que des
 *   dépendances — pas de local commercial ;
 * - dans une seule commune ;
 * - une surface bâtie d'au moins 9 m², sous laquelle le prix au mètre carré ne
 *   veut plus rien dire.
 * Le prix rapporté est la médiane, qui ne bouge pas pour une vente
 * extravagante, sur les trois dernières années publiées réunies — un village
 * vend quelques maisons par an. Sous cinq ventes, pas de médiane. La
 * fourchette est celle des quartiles : la moitié des ventes tombe entre les
 * deux. S'y ajoutent la surface habitable, le nombre de pièces et, pour une
 * maison, la surface de terrain vendue avec elle.
 *
 * **Les terrains nus**, sans aucun local, d'une seule nature cadastrale :
 * - les terrains à bâtir (code AB), au mètre carré, à partir de 100 m² ;
 * - les terres et les prés (T, P, PA, PC), à l'hectare, à partir de 1 000 m² ;
 * - les bois (B, BF, BM, BP, BR, BS, BT), à l'hectare, à partir de 1 000 m².
 * « Terrain à bâtir » est une nature cadastrale déclarée à la vente : elle ne
 * dit pas ce que le plan local d'urbanisme permet. Les vignes et les vergers,
 * dont le prix tient à l'appellation, ne sont pas mêlés aux terres.
 *
 * DVF ne couvre ni l'Alsace ni la Moselle, où le livre foncier tient ce rôle,
 * ni Mayotte. Paris, Lyon et Marseille y sont par arrondissement : ils sont
 * réunis sous leur commune.
 *
 * Lancé seul — `tsx scripts/dvf-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-dvf.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { communeDe, departementDe, ecrireParDepartement, lignesCsv, mediane, telechargerSiAbsent } from './par-departement.ts';

export const ADRESSE = (annee: number) => `https://files.data.gouv.fr/geo-dvf/latest/csv/${annee}/full.csv.gz`;
/** Sous ce nombre de ventes, la médiane serait celle de trois maisons. */
export const MINIMUM = 5;

/**
 * Par commune : ventes de maisons, prix médian au m² d'une maison, prix médian
 * d'une maison ; ventes d'appartements, prix médian au m² d'un appartement ;
 * puis le nombre de ventes de logements, année par année.
 */
export type Prix = [number, number | null, number | null, number, number | null, ...number[]];

export interface Dvf {
  maj: string;
  annees: number[];
  communes: Map<string, Prix>;
  departements: Map<string, Prix>;
  details: Map<string, Detail>;
  detailsDep: Map<string, Detail>;
}

type Vente = {
  commune: string;
  annee: number;
  type: 'Maison' | 'Appartement';
  prix: number;
  surface: number;
  pieces: number;
  /** La surface des parcelles vendues avec le logement, en m² ; 0 pour un appartement en copropriété. */
  terrain: number;
};

/** Une vente de terrain nu, d'une seule nature. */
type Terrain = { commune: string; annee: number; genre: Genre; prix: number; surface: number };
export const GENRES = ['batir', 'terres', 'bois'] as const;
type Genre = (typeof GENRES)[number];
const NATURES: Record<string, Genre> = {
  AB: 'batir',
  T: 'terres',
  P: 'terres',
  PA: 'terres',
  PC: 'terres',
  B: 'bois',
  BF: 'bois',
  BM: 'bois',
  BP: 'bois',
  BR: 'bois',
  BS: 'bois',
  BT: 'bois',
};
/** Sous ces surfaces, le prix tient aux frais plus qu'au terrain. */
const SURFACE_MIN: Record<Genre, number> = { batir: 100, terres: 1000, bois: 1000 };

/** La surface de terrain d'une mutation : chaque parcelle et chaque nature une fois. */
function surfaceTerrain(lignes: string[][], col: Record<string, number>): number {
  const vues = new Map<string, number>();
  for (const l of lignes) {
    const s = Number(l[col.surface_terrain]);
    if (s > 0) vues.set(`${l[col.id_parcelle]}|${l[col.code_nature_culture]}|${l[col.code_nature_culture_speciale] ?? ''}`, s);
  }
  return [...vues.values()].reduce((a, b) => a + b, 0);
}

/** Une mutation sans aucun local : la vente d'un terrain nu d'une seule nature, ou rien. */
function terrainDe(lignes: string[][], col: Record<string, number>, annee: number): Terrain | null {
  if (lignes[0][col.nature_mutation] !== 'Vente') return null;
  const communes = new Set(lignes.map((l) => l[col.code_commune]));
  if (communes.size !== 1) return null;
  if (lignes.some((l) => l[col.type_local])) return null;
  const genres = new Set<string>(lignes.map((l) => NATURES[l[col.code_nature_culture]] ?? 'autre'));
  if (genres.size !== 1) return null;
  const [genre] = genres;
  if (genre === 'autre') return null;
  const surface = surfaceTerrain(lignes, col);
  const prix = Number(lignes[0][col.valeur_fonciere]);
  if (!(prix > 0) || !(surface >= SURFACE_MIN[genre as Genre])) return null;
  return { commune: communeDe([...communes][0]), annee, genre: genre as Genre, prix, surface };
}

/** Une mutation, toutes ses lignes réunies : en rend la vente d'un logement, ou rien. */
function venteDe(lignes: string[][], col: Record<string, number>, annee: number): Vente | null {
  if (lignes[0][col.nature_mutation] !== 'Vente') return null;
  const communes = new Set(lignes.map((l) => l[col.code_commune]));
  if (communes.size !== 1) return null;
  const logements = new Map<string, [string, number, number]>();
  for (const l of lignes) {
    const type = l[col.type_local];
    if (type === 'Maison' || type === 'Appartement') {
      // Un même logement revient sur plusieurs lignes quand la vente porte
      // aussi sur plusieurs parcelles ou lots : on le compte une fois.
      const s = Number(l[col.surface_reelle_bati]);
      logements.set(`${type}|${l[col.id_parcelle]}|${s}|${l[col.nombre_pieces_principales]}|${l[col.lot1_numero]}`, [type, s, Number(l[col.nombre_pieces_principales])]);
    } else if (type && type !== 'Dépendance') return null;
  }
  if (logements.size !== 1) return null;
  const [[type, surface, pieces]] = logements.values();
  const prix = Number(lignes[0][col.valeur_fonciere]);
  if (!(surface >= 9) || !(prix > 0)) return null;
  return {
    commune: communeDe([...communes][0]),
    annee,
    type: type as Vente['type'],
    prix,
    surface,
    pieces: pieces > 0 ? pieces : 0,
    terrain: type === 'Maison' ? surfaceTerrain(lignes, col) : 0,
  };
}

export async function lireVentes(
  chemin: string,
  annee: number,
  ajouter: (v: Vente) => void,
  ajouterTerrain: (t: Terrain) => void = () => {},
): Promise<void> {
  let col: Record<string, number> | null = null;
  let id = '';
  let lignes: string[][] = [];
  const flux = createReadStream(chemin).pipe(createGunzip()) as unknown as AsyncIterable<Uint8Array>;
  const clore = () => {
    if (lignes.length > 0) {
      const v = venteDe(lignes, col!, annee);
      if (v) ajouter(v);
      else {
        const t = terrainDe(lignes, col!, annee);
        if (t) ajouterTerrain(t);
      }
    }
  };
  for await (const v of lignesCsv(flux)) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['id_mutation', 'nature_mutation', 'valeur_fonciere', 'code_commune', 'type_local', 'surface_reelle_bati', 'id_parcelle', 'nombre_pieces_principales', 'lot1_numero', 'surface_terrain', 'code_nature_culture']) {
        if (col[n] === undefined) throw new Error(`DVF ${annee} : colonne « ${n} » absente`);
      }
      continue;
    }
    if (v.length < 10) continue;
    // Les lignes d'une mutation se suivent dans le fichier.
    if (v[col.id_mutation] !== id) {
      clore();
      id = v[col.id_mutation];
      lignes = [];
    }
    lignes.push(v);
  }
  clore();
}

function resumer(ventes: Vente[], annees: number[]): Prix {
  const maisons = ventes.filter((v) => v.type === 'Maison');
  const apparts = ventes.filter((v) => v.type === 'Appartement');
  const med = (v: number[]) => (v.length >= MINIMUM ? Math.round(mediane(v)!) : null);
  return [
    maisons.length,
    med(maisons.map((v) => v.prix / v.surface)),
    med(maisons.map((v) => v.prix)),
    apparts.length,
    med(apparts.map((v) => v.prix / v.surface)),
    ...annees.map((a) => ventes.filter((v) => v.annee === a).length),
  ];
}

/** Le quantile p (0 à 1), par interpolation entre les deux valeurs qui l'encadrent — la médiane est le quantile 0,5. */
export function quantile(v: number[], p: number): number | null {
  if (v.length === 0) return null;
  const t = [...v].sort((a, b) => a - b);
  const i = (t.length - 1) * p;
  const bas = Math.floor(i);
  return t[bas] + (t[Math.min(bas + 1, t.length - 1)] - t[bas]) * (i - bas);
}

/**
 * Le détail d'une commune ou d'un département, à côté du résumé que la page
 * lit déjà :
 * - maisons : [1er quartile du prix, 3e quartile, surface habitable médiane,
 *   pièces médianes, terrain médian en m²], ou null sous cinq ventes ;
 * - appartements : [1er quartile, 3e quartile, surface médiane, pièces médianes], ou null ;
 * - terrains à bâtir : [ventes, prix médian au m², 1er quartile, 3e quartile, surface médiane en m²] ;
 * - terres et prés, bois : [ventes, prix médian à l'hectare, surface médiane en hectares].
 * Un nombre de ventes est toujours donné ; les prix, à partir de cinq.
 */
export type Detail = [
  [number, number, number, number, number] | null,
  [number, number, number, number] | null,
  [number, number | null, number | null, number | null, number | null],
  [number, number | null, number | null],
  [number, number | null, number | null],
];

function detailler(ventes: Vente[], terrains: Terrain[]): Detail {
  const r = (x: number | null, d = 0) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);
  const assez = <T,>(l: T[]) => l.length >= MINIMUM;
  const logement = (type: Vente['type']) => {
    const l = ventes.filter((v) => v.type === type);
    if (!assez(l)) return null;
    const prix = l.map((v) => v.prix);
    return [r(quantile(prix, 0.25))!, r(quantile(prix, 0.75))!, r(quantile(l.map((v) => v.surface), 0.5))!, r(quantile(l.filter((v) => v.pieces > 0).map((v) => v.pieces), 0.5), 1) ?? 0];
  };
  const maison = logement('Maison');
  const maisons = ventes.filter((v) => v.type === 'Maison' && v.terrain > 0);
  const batir = terrains.filter((t) => t.genre === 'batir');
  const m2 = batir.map((t) => t.prix / t.surface);
  const hectare = (g: Genre): [number, number | null, number | null] => {
    const l = terrains.filter((t) => t.genre === g);
    return assez(l)
      ? [l.length, r(quantile(l.map((t) => t.prix / (t.surface / 10_000)), 0.5)), r(quantile(l.map((t) => t.surface / 10_000), 0.5), 2)]
      : [l.length, null, null];
  };
  return [
    maison ? [maison[0], maison[1], maison[2], maison[3], assez(maisons) ? r(quantile(maisons.map((v) => v.terrain), 0.5))! : 0] : null,
    logement('Appartement') as [number, number, number, number] | null,
    assez(batir)
      ? [batir.length, r(quantile(m2, 0.5)), r(quantile(m2, 0.25)), r(quantile(m2, 0.75)), r(quantile(batir.map((t) => t.surface), 0.5))]
      : [batir.length, null, null, null, null],
    hectare('terres'),
    hectare('bois'),
  ];
}

export async function collecterDvf(
  annees: number[],
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Dvf | null> {
  const parCommune = new Map<string, Vente[]>();
  const terrainsParCommune = new Map<string, Terrain[]>();
  const lues: number[] = [];
  for (const annee of annees) {
    const vers = join(cache, `dvf-${annee}.csv.gz`);
    try {
      await telecharger(ADRESSE(annee), vers);
    } catch {
      dire(`Ventes immobilières ${annee} indisponibles.`);
      continue;
    }
    let n = 0;
    let nt = 0;
    await lireVentes(
      vers,
      annee,
      (v) => {
        if (!parCommune.has(v.commune)) parCommune.set(v.commune, []);
        parCommune.get(v.commune)!.push(v);
        n++;
      },
      (t) => {
        if (!terrainsParCommune.has(t.commune)) terrainsParCommune.set(t.commune, []);
        terrainsParCommune.get(t.commune)!.push(t);
        nt++;
      },
    );
    dire(`Ventes immobilières ${annee} : ${n.toLocaleString('fr-FR')} ventes d’un seul logement, ${nt.toLocaleString('fr-FR')} de terrain nu.`);
    lues.push(annee);
  }
  // Trois années ou rien : une médiane sur deux ans ne se comparerait pas à
  // celle de l'ingestion précédente.
  if (lues.length !== annees.length) {
    dire('Ventes immobilières : une année manque, l’ingestion précédente reste en place.');
    return null;
  }
  const communes = new Map<string, Prix>();
  const parDep = new Map<string, Vente[]>();
  for (const [code, ventes] of parCommune) {
    communes.set(code, resumer(ventes, annees));
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, []);
    parDep.get(dep)!.push(...ventes);
  }
  const departements = new Map([...parDep].map(([dep, v]) => [dep, resumer(v, annees)]));
  const details = new Map<string, Detail>();
  const terrainsParDep = new Map<string, Terrain[]>();
  for (const [code, t] of terrainsParCommune) {
    const dep = departementDe(code);
    if (!terrainsParDep.has(dep)) terrainsParDep.set(dep, []);
    terrainsParDep.get(dep)!.push(...t);
  }
  for (const code of new Set([...parCommune.keys(), ...terrainsParCommune.keys()])) {
    details.set(code, detailler(parCommune.get(code) ?? [], terrainsParCommune.get(code) ?? []));
  }
  const detailsDep = new Map<string, Detail>();
  for (const dep of new Set([...parDep.keys(), ...terrainsParDep.keys()])) {
    detailsDep.set(dep, detailler(parDep.get(dep) ?? [], terrainsParDep.get(dep) ?? []));
  }
  return { maj: new Date().toISOString().slice(0, 10), annees, communes, departements, details, detailsDep };
}

/** Les trois dernières années complètes : la base est publiée au printemps et en automne. */
export function anneesDvf(aujourdhui = new Date()): number[] {
  const derniere = aujourdhui.getUTCFullYear() - (aujourdhui.getUTCMonth() >= 5 ? 1 : 2);
  return [derniere - 2, derniere - 1, derniere];
}

export function ecrireDvf(sortie: string, d: Dvf): number {
  // Une commune qui n'a vendu que des terrains a quand même sa ligne : un
  // résumé de logements à zéro, et son détail.
  const communes = new Map(d.communes);
  for (const code of d.details.keys()) if (!communes.has(code)) communes.set(code, [0, null, null, 0, null, ...d.annees.map(() => 0)]);
  const parDep = new Map<string, Record<string, Detail>>();
  for (const [code, x] of d.details) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = x;
  }
  return ecrireParDepartement(sortie, 'dvf', communes, (dep) => ({
    maj: d.maj,
    annees: d.annees,
    minimum: MINIMUM,
    dep: d.departements.get(dep) ?? null,
    xdep: d.detailsDep.get(dep) ?? null,
    x: parDep.get(dep) ?? {},
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const d = await collecterDvf(anneesDvf(), telecharger, cache, console.log);
  if (d) console.log(`${ecrireDvf(sortie, d)} départements écrits.`);
}
