/**
 * La couverture mobile 4G de chaque commune, opérateur par opérateur, en part
 * de sa surface, d'après les cartes de couverture théorique que l'Arcep
 * collecte chaque trimestre auprès des opérateurs (jeu « Mon Réseau Mobile »,
 * `data.arcep.fr/mobile/couvertures_theoriques/`).
 *
 * **Les cartes** : une par opérateur — Orange, SFR, Bouygues Telecom, Free
 * Mobile —, pour la métropole et la Corse, en GeoPackage archivé (7z), en
 * Lambert 93 ; un multipolygone par département et par niveau de qualité :
 * très bonne couverture (TBC), bonne couverture (BC), couverture limitée
 * (CL). Les trois niveaux ne se recouvrent pas (vérifié sur l'Allier :
 * aucun point dans deux niveaux). Ce sont des simulations des opérateurs,
 * vérifiées par l'Arcep, pas des mesures : la page le dit.
 *
 * **La mesure** : une grille d'un point tous les 200 m environ sur chaque
 * département ; chaque point prend sa commune (contours d'Admin Express,
 * `dep/XX-contours.json`) et, pour chaque opérateur, son niveau de
 * couverture. La part d'une commune est la part de ses points. Une commune de
 * moins de vingt-cinq points — un kilomètre carré environ — est trop petite
 * pour cette grille : on n'en dit que cela. « Au moins un opérateur » est le
 * meilleur niveau, point par point, des quatre cartes.
 *
 * **La part de la surface, pas de la population** (décision du 16 octobre
 * 2026) : une forêt mal couverte pèse autant qu'un bourg bien couvert. Le
 * carroyage de l'INSEE permettra plus tard de pondérer par les habitants.
 *
 * **Un trimestre, un calcul** : les cartes ne changent qu'avec le trimestre,
 * et le calcul prend un quart d'heure. Quand les fichiers publiés portent
 * déjà le dernier trimestre de l'Arcep, la collecte s'arrête là et les
 * laisse ; `ROUAGES_COUVERTURE_FORCER=1` refait le calcul.
 *
 * Il faut `7z` (p7zip) pour ouvrir les archives, et `node:sqlite` (Node 22)
 * pour lire le GeoPackage. Écrit `dep/XX-couverture.json`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contoursDesCommunes, dedans, ECHELLE, type Anneau } from './espaces-emettre.ts';
import { depuisLambert93 } from './geo-formats.ts';
import { departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

const ARCEP = 'https://data.arcep.fr/mobile/couvertures_theoriques';

export const OPERATEURS: [string, string][] = [
  ['OF', 'Orange'],
  ['SFR0', 'SFR'],
  ['BOUY', 'Bouygues Telecom'],
  ['FREE', 'Free Mobile'],
];
const NIVEAUX: Record<string, number> = { TBC: 3, BC: 2, CL: 1 };

/** Le pas de la grille, en degrés : environ 200 m sur 200 m en métropole. */
const DX = 0.0026;
const DY = 0.0018;
/** En dessous, la commune est trop petite pour la grille. */
export const POINTS_MIN = 25;

/**
 * Pour une commune : le nombre de points de la grille ; puis, en pour cent de
 * ces points, [très bonne, bonne, limitée] pour au moins un opérateur, et pour
 * chaque opérateur dans l'ordre de `OPERATEURS`. Le nombre seul quand la
 * commune est trop petite.
 */
export type CouvertureCommune = [number] | [number, number[], number[][]];

export interface CollecteCouverture {
  maj: string;
  /** Le trimestre de l'Arcep, « 2026_T2 ». */
  trimestre: string;
  communes: Map<string, CouvertureCommune>;
}

type Grille = { x0: number; y0: number; nx: number; ny: number; codes: string[]; commune: Int32Array };

/** Le dernier trimestre publié, d'après la page de l'Arcep. */
export async function dernierTrimestre(lireTexte: (url: string) => Promise<string>): Promise<string> {
  const t = [...new Set((await lireTexte(`${ARCEP}/index.html`)).match(/20\d\d_T[1-4]/g) ?? [])].sort().pop();
  if (!t) throw new Error('aucun trimestre sur la page de l’Arcep');
  return t;
}

/** Les fichiers déjà publiés portent-ils tous ce trimestre ? Un département de métropole sans fichier, ou d'un autre trimestre, et l'on refait tout. */
function dejaCalcule(sortie: string, trimestre: string): boolean {
  const dossier = join(sortie, 'dep');
  const deps = readdirSync(dossier)
    .map((n) => /^(\d[\dAB])\.json$/.exec(n)?.[1])
    .filter((d): d is string => !!d);
  return (
    deps.length > 0 &&
    deps.every((d) => {
      const f = join(dossier, `${d}-couverture.json`);
      return existsSync(f) && (JSON.parse(readFileSync(f, 'utf8')) as { t?: string }).t === trimestre;
    })
  );
}

/** Une grille par département, chaque point avec sa commune (-1 hors de toute commune). */
function grilles(sortie: string, deps?: string[]): Map<string, Grille> {
  const parDep = new Map<string, [string, Anneau[]][]>();
  for (const [code, an] of contoursDesCommunes(sortie)) {
    const dep = departementDe(code);
    if (dep.length > 2) continue; // l'outre-mer a ses propres cartes, dans d'autres projections
    if (deps && !deps.includes(dep)) continue;
    (parDep.get(dep) ?? parDep.set(dep, []).get(dep)!).push([code, an]);
  }
  const sortieGrilles = new Map<string, Grille>();
  for (const [dep, communes] of parDep) {
    const cadres = communes.map(([, an]) => {
      let [a, b, c, d] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of an)
        for (let i = 0; i < r.length; i += 2) {
          a = Math.min(a, r[i]);
          c = Math.max(c, r[i]);
          b = Math.min(b, r[i + 1]);
          d = Math.max(d, r[i + 1]);
        }
      return [a / ECHELLE, b / ECHELLE, c / ECHELLE, d / ECHELLE];
    });
    const x0 = Math.min(...cadres.map((k) => k[0]));
    const y0 = Math.min(...cadres.map((k) => k[1]));
    const nx = Math.ceil((Math.max(...cadres.map((k) => k[2])) - x0) / DX) + 1;
    const ny = Math.ceil((Math.max(...cadres.map((k) => k[3])) - y0) / DY) + 1;
    const commune = new Int32Array(nx * ny).fill(-1);
    communes.forEach(([, an], k) => {
      const [a, b, c, d] = cadres[k];
      for (let j = Math.max(0, Math.floor((b - y0) / DY)); j <= Math.min(ny - 1, Math.ceil((d - y0) / DY)); j++)
        for (let i = Math.max(0, Math.floor((a - x0) / DX)); i <= Math.min(nx - 1, Math.ceil((c - x0) / DX)); i++) {
          const p = j * nx + i;
          if (commune[p] >= 0) continue;
          if (dedans(Math.round((x0 + (i + 0.5) * DX) * ECHELLE), Math.round((y0 + (j + 0.5) * DY) * ECHELLE), an)) commune[p] = k;
        }
    });
    sortieGrilles.set(dep, { x0, y0, nx, ny, codes: communes.map(([c]) => c), commune });
  }
  return sortieGrilles;
}

/** Les anneaux d'une géométrie GeoPackage (en-tête puis WKB), en degrés, avec leur cadre. */
export function anneauxGpkg(g: Uint8Array): { a: Float64Array; cadre: [number, number, number, number] }[] {
  const v = new DataView(g.buffer, g.byteOffset, g.byteLength);
  if (g[0] !== 0x47 || g[1] !== 0x50) throw new Error('géométrie sans en-tête GeoPackage');
  let o = 8 + [0, 32, 48, 48, 64][(g[3] >> 1) & 7];
  const sortie: { a: Float64Array; cadre: [number, number, number, number] }[] = [];
  const lire = () => {
    const le = g[o] === 1;
    o += 1;
    const type = v.getUint32(o, le) % 1000;
    o += 4;
    if (type === 6) {
      const n = v.getUint32(o, le);
      o += 4;
      for (let i = 0; i < n; i++) lire();
      return;
    }
    if (type !== 3) throw new Error(`géométrie de type ${type}, polygone attendu`);
    const nr = v.getUint32(o, le);
    o += 4;
    for (let r = 0; r < nr; r++) {
      const np = v.getUint32(o, le);
      o += 4;
      const a = new Float64Array(np * 2);
      const cadre: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let p = 0; p < np; p++) {
        const [lon, lat] = depuisLambert93(v.getFloat64(o, le), v.getFloat64(o + 8, le));
        o += 16;
        a[2 * p] = lon;
        a[2 * p + 1] = lat;
        if (lon < cadre[0]) cadre[0] = lon;
        if (lon > cadre[2]) cadre[2] = lon;
        if (lat < cadre[1]) cadre[1] = lat;
        if (lat > cadre[3]) cadre[3] = lat;
      }
      sortie.push({ a, cadre });
    }
  };
  lire();
  return sortie;
}

/**
 * Pose un niveau sur les points d'une grille que des anneaux couvrent, rangée
 * par rangée : les abscisses où les anneaux croisent la rangée, triées ; un
 * point est dedans s'il en a un nombre impair à sa gauche. Un anneau qui ne
 * touche pas le cadre de la grille ne change pas cette parité : on le laisse.
 */
export function poser(rs: Float64Array[], g: { x0: number; y0: number; nx: number; ny: number }, niveau: number, cible: Uint8Array): void {
  const rangs: number[][] = Array.from({ length: g.ny }, () => []);
  for (const a of rs)
    for (let p = 0, q = a.length - 2; p < a.length; q = p, p += 2) {
      const ya = a[q + 1];
      const yb = a[p + 1];
      if (ya === yb) continue;
      const lo = Math.min(ya, yb);
      const hi = Math.max(ya, yb);
      for (let j = Math.max(0, Math.ceil((lo - g.y0) / DY - 0.5)); j < g.ny; j++) {
        const y = g.y0 + (j + 0.5) * DY;
        if (y >= hi) break;
        if (y < lo) continue;
        rangs[j].push(a[q] + ((y - ya) * (a[p] - a[q])) / (yb - ya));
      }
    }
  for (let j = 0; j < g.ny; j++) {
    const xs = rangs[j];
    if (!xs.length) continue;
    xs.sort((a, b) => a - b);
    let k = 0;
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * DX;
      while (k < xs.length && xs[k] < x) k++;
      if (k % 2 && cible[j * g.nx + i] < niveau) cible[j * g.nx + i] = niveau;
    }
  }
}

/** Les niveaux de couverture d'un opérateur sur chaque grille, lus dans son GeoPackage. */
async function niveauxOperateur(gpkg: string, grillesDep: Map<string, Grille>): Promise<Map<string, Uint8Array>> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(gpkg, { readOnly: true });
  try {
    const table = (db.prepare("select table_name as t from gpkg_contents where data_type = 'features'").get() as { t: string }).t;
    const niveaux = new Map([...grillesDep].map(([dep, g]) => [dep, new Uint8Array(g.nx * g.ny)]));
    for (const ligne of db.prepare(`select niveau, geom from "${table}"`).iterate() as Iterable<{ niveau: string; geom: Uint8Array }>) {
      const niveau = NIVEAUX[ligne.niveau];
      if (!niveau || !ligne.geom) continue;
      const anneaux = anneauxGpkg(ligne.geom);
      for (const [dep, g] of grillesDep) {
        const x1 = g.x0 + g.nx * DX;
        const y1 = g.y0 + g.ny * DY;
        const touchent = anneaux.filter(({ cadre }) => cadre[2] >= g.x0 && cadre[0] <= x1 && cadre[3] >= g.y0 && cadre[1] <= y1).map(({ a }) => a);
        if (touchent.length) poser(touchent, g, niveau, niveaux.get(dep)!);
      }
    }
    return niveaux;
  } finally {
    db.close();
  }
}

export async function collecterCouverture(
  sortie: string,
  lireTexte: (url: string) => Promise<string>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
  /** Pour un essai : ces départements seulement. */
  deps?: string[],
): Promise<CollecteCouverture | null> {
  const trimestre = await dernierTrimestre(lireTexte);
  if (!process.env.ROUAGES_COUVERTURE_FORCER && !deps && dejaCalcule(sortie, trimestre)) {
    dire(`  Couverture mobile : déjà calculée pour ${trimestre}, dernier trimestre de l’Arcep ; rien à refaire.`);
    return null;
  }
  const dossier = join(cache, 'couverture');
  mkdirSync(dossier, { recursive: true });
  // Les archives d'un trimestre précédent ne servent plus.
  for (const f of readdirSync(dossier)) if (!f.startsWith(trimestre)) rmSync(join(dossier, f), { force: true });
  const grillesDep = grilles(sortie, deps);
  dire(`  Couverture mobile ${trimestre} : ${grillesDep.size} départements, ${[...grillesDep.values()].reduce((s, g) => s + g.codes.length, 0)} communes sur la grille.`);

  // Par commune : ses points, et pour chaque opérateur puis pour le meilleur, le compte de points par niveau.
  const comptes = new Map<string, { n: number; o: number[][]; m: number[] }>();
  for (const g of grillesDep.values()) for (const c of g.codes) comptes.set(c, { n: 0, o: OPERATEURS.map(() => [0, 0, 0]), m: [0, 0, 0] });
  for (const g of grillesDep.values()) for (let p = 0; p < g.commune.length; p++) if (g.commune[p] >= 0) comptes.get(g.codes[g.commune[p]])!.n++;
  const meilleur = new Map([...grillesDep].map(([dep, g]) => [dep, new Uint8Array(g.nx * g.ny)]));

  for (const [k, [code, nom]] of OPERATEURS.entries()) {
    const nomFichier = `${trimestre}_couv_Metropole_${code}_4G_data.gpkg`;
    const archive = join(dossier, `${nomFichier}.7z`);
    if (!existsSync(archive)) {
      // Par un fichier temporaire : un transfert coupé ne doit pas passer pour une archive en cache.
      await telecharger(`${ARCEP}/${trimestre}/Metropole/00_Metropole/${nomFichier}.7z`, `${archive}.partiel`);
      renameSync(`${archive}.partiel`, archive);
    }
    try {
      execFileSync('7z', ['e', '-y', `-o${dossier}`, archive, nomFichier], { stdio: 'ignore' });
    } catch (e) {
      rmSync(archive, { force: true });
      throw new Error(`${nomFichier}.7z illisible (${(e as Error).message.split('\n')[0]}) : l’archive est retirée du cache`);
    }
    const gpkg = join(dossier, nomFichier);
    const debut = Date.now();
    try {
      const niveaux = await niveauxOperateur(gpkg, grillesDep);
      for (const [dep, g] of grillesDep) {
        const n = niveaux.get(dep)!;
        const m = meilleur.get(dep)!;
        for (let p = 0; p < n.length; p++) {
          const c = g.commune[p];
          if (c < 0) continue;
          if (n[p]) comptes.get(g.codes[c])!.o[k][3 - n[p]]++;
          if (n[p] > m[p]) m[p] = n[p];
        }
      }
    } finally {
      rmSync(gpkg, { force: true });
    }
    dire(`  Couverture mobile : ${nom} lu (${(statSync(archive).size / 1e6).toFixed(0)} Mo), ${((Date.now() - debut) / 1000).toFixed(0)} s.`);
  }
  for (const [dep, g] of grillesDep) {
    const m = meilleur.get(dep)!;
    for (let p = 0; p < m.length; p++) if (g.commune[p] >= 0 && m[p]) comptes.get(g.codes[g.commune[p]])!.m[3 - m[p]]++;
  }

  const pc = (v: number, n: number) => Math.round((100 * v) / n);
  const communes = new Map<string, CouvertureCommune>();
  for (const [code, x] of comptes) {
    if (x.n < POINTS_MIN) communes.set(code, [x.n]);
    else communes.set(code, [x.n, x.m.map((v) => pc(v, x.n)), x.o.map((l) => l.map((v) => pc(v, x.n)))]);
  }
  return { maj: new Date().toISOString().slice(0, 10), trimestre, communes };
}

const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];

export function ecrireCouverture(sortie: string, c: CollecteCouverture, deps?: string[]): number {
  const communes = deps ? new Map([...c.communes].filter(([code]) => deps.includes(departementDe(code)))) : c.communes;
  const [an, t] = c.trimestre.split('_T');
  return ecrireParDepartement(sortie, 'couverture', communes, () => ({
    maj: c.maj,
    t: c.trimestre,
    au: `${an}-${FIN_TRIMESTRE[Number(t) - 1]}`,
    ops: OPERATEURS.map(([, nom]) => nom),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { obstine, telecharger, cache, sortie } = telechargerSiAbsent(racine);
  const deps = process.env.ROUAGES_DEPS?.split(',');
  const c = await collecterCouverture(sortie, async (url) => (await obstine(url)).text(), telecharger, cache, console.log, deps);
  if (c) console.log(`${ecrireCouverture(sortie, c, deps)} départements écrits.`);
}
