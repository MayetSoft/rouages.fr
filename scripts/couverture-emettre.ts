/**
 * La couverture mobile 4G de chaque commune, opérateur par opérateur, en part
 * de sa surface et en part de ses habitants, d'après les cartes de couverture
 * théorique que l'Arcep collecte chaque trimestre auprès des opérateurs (jeu
 * « Mon Réseau Mobile », `data.arcep.fr/mobile/couvertures_theoriques/`).
 *
 * **Les cartes** : une par opérateur et par territoire, en GeoPackage
 * archivé (7z) — la métropole avec la Corse en Lambert 93 (Orange, SFR,
 * Bouygues Telecom, Free Mobile, de 122 à 369 Mo), chaque département
 * d'outre-mer en UTM (ses propres opérateurs, quelques mégaoctets) —, un
 * multipolygone par département et par niveau de qualité : très bonne
 * couverture (TBC), bonne couverture (BC), couverture limitée (CL). Les
 * trois niveaux ne se recouvrent pas (vérifié sur l'Allier : aucun point
 * dans deux niveaux). Ce sont des simulations des opérateurs, vérifiées par
 * l'Arcep, pas des mesures : la page le dit. Saint-Barthélemy et
 * Saint-Martin, qui n'ont pas de page de commune ici, ne sont pas lus.
 *
 * **En surface** : une grille d'un point tous les 200 m environ sur chaque
 * département ; chaque point prend sa commune (contours d'Admin Express,
 * `dep/XX-contours.json`) et, pour chaque opérateur, son niveau. La part
 * d'une commune est la part de ses points. Une commune de moins de
 * vingt-cinq points — un kilomètre carré environ — est trop petite pour
 * cette grille. « Au moins un opérateur » est le meilleur niveau, point par
 * point.
 *
 * **En habitants** : chaque carreau habité du carroyage de l'INSEE
 * (`carroyage.ts`, Filosofi 2021, carreaux de 200 m) prend le niveau et la
 * commune du point de la grille où tombe son centre, et pèse ses habitants.
 * Le carroyage couvre la métropole, la Martinique et La Réunion ; ailleurs,
 * la part en surface seule.
 *
 * **Un trimestre, un calcul** : les cartes ne changent qu'avec le
 * trimestre, et le calcul prend un quart d'heure. Quand les fichiers publiés
 * portent déjà le dernier trimestre de l'Arcep et la méthode en cours
 * (`METHODE`), la collecte s'arrête là et les laisse ;
 * `ROUAGES_COUVERTURE_FORCER=1` refait le calcul.
 *
 * Il faut `7z` (p7zip) pour ouvrir les archives, et `node:sqlite` (Node 22)
 * pour lire le GeoPackage. Écrit `dep/XX-couverture.json`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILOSOFI, lireCarreaux, type Territoire as TerritoireCarroye } from './carroyage.ts';
import { contoursDesCommunes, dedans, ECHELLE, type Anneau } from './espaces-emettre.ts';
import { depuisLambert93, depuisUtm } from './geo-formats.ts';
import { departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

const ARCEP = 'https://data.arcep.fr/mobile/couvertures_theoriques';

/** La version de la méthode : un fichier publié par une autre version est refait. 2 : les habitants et l'outre-mer. */
const METHODE = 2;

/** Les noms des opérateurs, d'après la documentation de l'Arcep ; à défaut, le code du fichier. */
const NOMS: Record<string, string> = {
  OF: 'Orange',
  SFR0: 'SFR',
  BOUY: 'Bouygues Telecom',
  FREE: 'Free Mobile',
  ORCA: 'Orange Caraïbe',
  OMT: 'Outremer Telecom',
  FRCA: 'Free Caraïbe',
  DIGIC: 'Digicel',
  SRR: 'SRR',
  TELC: 'Telco OI',
  ZEOP: 'Zeop',
  MAOR: 'Maoré Mobile',
};
/** L'ordre de la métropole, celui des antennes. */
const ORDRE_METROPOLE = ['OF', 'SFR0', 'BOUY', 'FREE'];
const NIVEAUX: Record<string, number> = { TBC: 3, BC: 2, CL: 1 };

interface TerritoireCouverture {
  /** Le dossier de l'Arcep, sous le trimestre. */
  chemin: string;
  /** Le nom dans les fichiers : `Metropole`, `972`… */
  cle: string;
  deps: (dep: string) => boolean;
  projeter: (x: number, y: number) => [number, number];
  carreaux?: TerritoireCarroye;
}

const TERRITOIRES: TerritoireCouverture[] = [
  { chemin: 'Metropole/00_Metropole', cle: 'Metropole', deps: (d) => d.length === 2, projeter: depuisLambert93, carreaux: 'met' },
  { chemin: 'Outremer/971_Guadeloupe', cle: '971', deps: (d) => d === '971', projeter: (x, y) => depuisUtm(x, y, 20, false) },
  { chemin: 'Outremer/972_Martinique', cle: '972', deps: (d) => d === '972', projeter: (x, y) => depuisUtm(x, y, 20, false), carreaux: 'mart' },
  { chemin: 'Outremer/973_Guyane', cle: '973', deps: (d) => d === '973', projeter: (x, y) => depuisUtm(x, y, 22, false) },
  { chemin: 'Outremer/974_LaReunion', cle: '974', deps: (d) => d === '974', projeter: (x, y) => depuisUtm(x, y, 40, true), carreaux: 'reun' },
  { chemin: 'Outremer/976_Mayotte', cle: '976', deps: (d) => d === '976', projeter: (x, y) => depuisUtm(x, y, 38, true) },
];

/** Le pas de la grille, en degrés : environ 200 m sur 200 m — en métropole 0,0026° de longitude ; outre-mer, selon la latitude. */
const DY = 0.0018;
const DX_METROPOLE = 0.0026;
/** En dessous, la commune est trop petite pour la grille. */
export const POINTS_MIN = 25;

/** Des parts en pour cent : [très bonne, bonne, limitée] pour au moins un opérateur, puis pour chaque opérateur du département. */
export type Parts = [number[], number[][]];

/** Pour une commune : ses points de grille, ses parts en surface (si elle est assez grande), ses habitants et leurs parts. */
export type CouvertureCommune = { n: number; s?: Parts; h?: number; p?: Parts };

export interface CollecteCouverture {
  maj: string;
  /** Le trimestre de l'Arcep, « 2026_T2 ». */
  trimestre: string;
  communes: Map<string, CouvertureCommune>;
  /** Les opérateurs de chaque département, dans l'ordre des parts. */
  operateurs: Map<string, string[]>;
}

export type Grille = { x0: number; y0: number; nx: number; ny: number; dx: number; dy: number; codes: string[]; commune: Int32Array };

/** Le dernier trimestre publié, d'après la page de l'Arcep. */
export async function dernierTrimestre(lireTexte: (url: string) => Promise<string>): Promise<string> {
  const t = [...new Set((await lireTexte(`${ARCEP}/index.html`)).match(/20\d\d_T[1-4]/g) ?? [])].sort().pop();
  if (!t) throw new Error('aucun trimestre sur la page de l’Arcep');
  return t;
}

/** Les fichiers publiés portent-ils tous ce trimestre et cette méthode ? Un département sans fichier, ou d'une autre version, et l'on refait tout. */
function dejaCalcule(sortie: string, trimestre: string): boolean {
  const dossier = join(sortie, 'dep');
  const deps = readdirSync(dossier)
    .map((n) => /^(\d[\dAB]|97[12346])\.json$/.exec(n)?.[1])
    .filter((d): d is string => !!d);
  return (
    deps.length > 0 &&
    deps.every((d) => {
      const f = join(dossier, `${d}-couverture.json`);
      if (!existsSync(f)) return false;
      const x = JSON.parse(readFileSync(f, 'utf8')) as { t?: string; v?: number };
      return x.t === trimestre && x.v === METHODE;
    })
  );
}

/** Une grille par département, chaque point avec sa commune (-1 hors de toute commune). */
function grilles(contours: Map<string, Anneau[]>, garder: (dep: string) => boolean): Map<string, Grille> {
  const parDep = new Map<string, [string, Anneau[]][]>();
  for (const [code, an] of contours) {
    const dep = departementDe(code);
    if (garder(dep)) (parDep.get(dep) ?? parDep.set(dep, []).get(dep)!).push([code, an]);
  }
  const sortie = new Map<string, Grille>();
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
    const y1 = Math.max(...cadres.map((k) => k[3]));
    // Des mailles d'environ 200 m de côté : en métropole, le pas de toujours ; ailleurs, selon la latitude.
    const dx = dep.length === 2 ? DX_METROPOLE : DY / Math.cos((((y0 + y1) / 2) * Math.PI) / 180);
    const nx = Math.ceil((Math.max(...cadres.map((k) => k[2])) - x0) / dx) + 1;
    const ny = Math.ceil((y1 - y0) / DY) + 1;
    const commune = new Int32Array(nx * ny).fill(-1);
    communes.forEach(([, an], k) => {
      const [a, b, c, d] = cadres[k];
      for (let j = Math.max(0, Math.floor((b - y0) / DY)); j <= Math.min(ny - 1, Math.ceil((d - y0) / DY)); j++)
        for (let i = Math.max(0, Math.floor((a - x0) / dx)); i <= Math.min(nx - 1, Math.ceil((c - x0) / dx)); i++) {
          const p = j * nx + i;
          if (commune[p] >= 0) continue;
          if (dedans(Math.round((x0 + (i + 0.5) * dx) * ECHELLE), Math.round((y0 + (j + 0.5) * DY) * ECHELLE), an)) commune[p] = k;
        }
    });
    sortie.set(dep, { x0, y0, nx, ny, dx, dy: DY, codes: communes.map(([c]) => c), commune });
  }
  return sortie;
}

/** Le point de grille où tombe une position, ou -1. */
function caseDe(g: Grille, lon: number, lat: number): number {
  const i = Math.floor((lon - g.x0) / g.dx);
  const j = Math.floor((lat - g.y0) / g.dy);
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i;
}

/** Les anneaux d'une géométrie GeoPackage (en-tête puis WKB), projetés en degrés, avec leur cadre. */
export function anneauxGpkg(
  g: Uint8Array,
  projeter: (x: number, y: number) => [number, number] = depuisLambert93,
): { a: Float64Array; cadre: [number, number, number, number] }[] {
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
        const [lon, lat] = projeter(v.getFloat64(o, le), v.getFloat64(o + 8, le));
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
export function poser(
  rs: Float64Array[],
  g: { x0: number; y0: number; nx: number; ny: number; dx: number; dy: number },
  niveau: number,
  cible: Uint8Array,
): void {
  const rangs: number[][] = Array.from({ length: g.ny }, () => []);
  for (const a of rs)
    for (let p = 0, q = a.length - 2; p < a.length; q = p, p += 2) {
      const ya = a[q + 1];
      const yb = a[p + 1];
      if (ya === yb) continue;
      const lo = Math.min(ya, yb);
      const hi = Math.max(ya, yb);
      for (let j = Math.max(0, Math.ceil((lo - g.y0) / g.dy - 0.5)); j < g.ny; j++) {
        const y = g.y0 + (j + 0.5) * g.dy;
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
      const x = g.x0 + (i + 0.5) * g.dx;
      while (k < xs.length && xs[k] < x) k++;
      if (k % 2 && cible[j * g.nx + i] < niveau) cible[j * g.nx + i] = niveau;
    }
  }
}

/** Les niveaux de couverture d'un opérateur sur chaque grille, lus dans son GeoPackage. */
async function niveauxOperateur(
  gpkg: string,
  grillesDep: Map<string, Grille>,
  projeter: (x: number, y: number) => [number, number],
): Promise<Map<string, Uint8Array>> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(gpkg, { readOnly: true });
  try {
    const table = (db.prepare("select table_name as t from gpkg_contents where data_type = 'features'").get() as { t: string }).t;
    const niveaux = new Map([...grillesDep].map(([dep, g]) => [dep, new Uint8Array(g.nx * g.ny)]));
    for (const ligne of db.prepare(`select niveau, geom from "${table}"`).iterate() as Iterable<{ niveau: string; geom: Uint8Array }>) {
      const niveau = NIVEAUX[ligne.niveau];
      if (!niveau || !ligne.geom) continue;
      const anneaux = anneauxGpkg(ligne.geom, projeter);
      for (const [dep, g] of grillesDep) {
        const x1 = g.x0 + g.nx * g.dx;
        const y1 = g.y0 + g.ny * g.dy;
        const touchent = anneaux.filter(({ cadre }) => cadre[2] >= g.x0 && cadre[0] <= x1 && cadre[3] >= g.y0 && cadre[1] <= y1).map(({ a }) => a);
        if (touchent.length) poser(touchent, g, niveau, niveaux.get(dep)!);
      }
    }
    return niveaux;
  } finally {
    db.close();
  }
}

/** Les fichiers 4G d'un territoire pour un trimestre, d'après la page de l'Arcep : [code de l'opérateur, nom du fichier]. */
async function fichiers(lireTexte: (url: string) => Promise<string>, trimestre: string, t: TerritoireCouverture): Promise<[string, string][]> {
  const page = await lireTexte(`${ARCEP}/${trimestre}/${t.chemin}/index.html`);
  const motif = new RegExp(`${trimestre}_couv_${t.cle}_([A-Z0-9]+)_4G_data\\.gpkg\\.7z`, 'g');
  const trouves = [...new Set([...page.matchAll(motif)].map((m) => m[1]))];
  const rang = (c: string) => (ORDRE_METROPOLE.includes(c) ? ORDRE_METROPOLE.indexOf(c) : 99);
  return trouves.sort((a, b) => rang(a) - rang(b) || a.localeCompare(b)).map((c) => [c, `${trimestre}_couv_${t.cle}_${c}_4G_data.gpkg`]);
}

type Comptes = { n: number; o: number[][]; m: number[]; h: number; ho: number[][]; hm: number[] };

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
  // Le carroyage de l'INSEE, pour les habitants.
  const carroyage = join(cache, FILOSOFI.fichier);
  if (!existsSync(carroyage)) {
    await telecharger(FILOSOFI.url, `${carroyage}.partiel`);
    renameSync(`${carroyage}.partiel`, carroyage);
  }
  const contours = contoursDesCommunes(sortie);
  const communes = new Map<string, CouvertureCommune>();
  const operateurs = new Map<string, string[]>();

  for (const t of TERRITOIRES) {
    const grillesDep = grilles(contours, (d) => t.deps(d) && (!deps || deps.includes(d)));
    if (!grillesDep.size) continue;
    const liste = await fichiers(lireTexte, trimestre, t);
    if (!liste.length) throw new Error(`${t.chemin} : aucune carte 4G pour ${trimestre}`);
    const nouveau = () => ({ n: 0, o: liste.map(() => [0, 0, 0]), m: [0, 0, 0], h: 0, ho: liste.map(() => [0, 0, 0]), hm: [0, 0, 0] });
    const comptes = new Map<string, Comptes>();
    for (const g of grillesDep.values()) for (const c of g.codes) comptes.set(c, nouveau());
    for (const g of grillesDep.values()) for (let p = 0; p < g.commune.length; p++) if (g.commune[p] >= 0) comptes.get(g.codes[g.commune[p]])!.n++;

    // Les carreaux habités, chacun sur son point de grille : celui de sa commune, d'après la grille du département que l'INSEE lui donne.
    const carreaux = new Map<string, { p: number[]; ind: number[] }>();
    let horsGrille = 0;
    if (t.carreaux) {
      for await (const c of lireCarreaux(carroyage, t.carreaux)) {
        const dep = departementDe(c.communes[0] ?? '');
        const g = grillesDep.get(dep);
        if (!g) continue;
        const p = caseDe(g, c.lon, c.lat);
        if (p < 0 || g.commune[p] < 0) {
          horsGrille += c.ind;
          continue;
        }
        const x = carreaux.get(dep) ?? carreaux.set(dep, { p: [], ind: [] }).get(dep)!;
        x.p.push(p);
        x.ind.push(c.ind);
        comptes.get(g.codes[g.commune[p]])!.h += c.ind;
      }
    }

    const meilleur = new Map([...grillesDep].map(([dep, g]) => [dep, new Uint8Array(g.nx * g.ny)]));
    for (const [k, [code, nomFichier]] of liste.entries()) {
      const archive = join(dossier, `${nomFichier}.7z`);
      if (!existsSync(archive)) {
        // Par un fichier temporaire : un transfert coupé ne doit pas passer pour une archive en cache.
        await telecharger(`${ARCEP}/${trimestre}/${t.chemin}/${nomFichier}.7z`, `${archive}.partiel`);
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
        const niveaux = await niveauxOperateur(gpkg, grillesDep, t.projeter);
        for (const [dep, g] of grillesDep) {
          const n = niveaux.get(dep)!;
          const m = meilleur.get(dep)!;
          for (let p = 0; p < n.length; p++) {
            const c = g.commune[p];
            if (c < 0) continue;
            if (n[p]) comptes.get(g.codes[c])!.o[k][3 - n[p]]++;
            if (n[p] > m[p]) m[p] = n[p];
          }
          const x = carreaux.get(dep);
          if (x) x.p.forEach((p, i) => n[p] && (comptes.get(g.codes[g.commune[p]])!.ho[k][3 - n[p]] += x.ind[i]));
        }
      } finally {
        rmSync(gpkg, { force: true });
      }
      dire(`  Couverture mobile ${t.cle} : ${NOMS[code] ?? code} lu (${(statSync(archive).size / 1e6).toFixed(1)} Mo), ${((Date.now() - debut) / 1000).toFixed(0)} s.`);
    }
    for (const [dep, g] of grillesDep) {
      const m = meilleur.get(dep)!;
      for (let p = 0; p < m.length; p++) if (g.commune[p] >= 0 && m[p]) comptes.get(g.codes[g.commune[p]])!.m[3 - m[p]]++;
      const x = carreaux.get(dep);
      if (x) x.p.forEach((p, i) => m[p] && (comptes.get(g.codes[g.commune[p]])!.hm[3 - m[p]] += x.ind[i]));
      operateurs.set(dep, liste.map(([c]) => NOMS[c] ?? c));
    }
    if (t.carreaux) dire(`  Couverture mobile ${t.cle} : ${Math.round(horsGrille).toLocaleString('fr-FR')} habitants de carreaux hors de la grille, laissés.`);

    const pc = (v: number, n: number) => Math.round((100 * v) / n);
    for (const [code, x] of comptes) {
      const c: CouvertureCommune = { n: x.n };
      if (x.n >= POINTS_MIN) c.s = [x.m.map((v) => pc(v, x.n)), x.o.map((l) => l.map((v) => pc(v, x.n)))];
      if (x.h > 0) {
        c.h = Math.round(x.h);
        c.p = [x.hm.map((v) => pc(v, x.h)), x.ho.map((l) => l.map((v) => pc(v, x.h)))];
      }
      communes.set(code, c);
    }
  }
  return { maj: new Date().toISOString().slice(0, 10), trimestre, communes, operateurs };
}

const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];

export function ecrireCouverture(sortie: string, c: CollecteCouverture, deps?: string[]): number {
  const communes = deps ? new Map([...c.communes].filter(([code]) => deps.includes(departementDe(code)))) : c.communes;
  const [an, t] = c.trimestre.split('_T');
  return ecrireParDepartement(sortie, 'couverture', communes, (dep) => ({
    maj: c.maj,
    t: c.trimestre,
    v: METHODE,
    au: `${an}-${FIN_TRIMESTRE[Number(t) - 1]}`,
    ops: c.operateurs.get(dep) ?? [],
    carroyage: FILOSOFI.annee,
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { obstine, telecharger, cache, sortie } = telechargerSiAbsent(racine);
  const deps = process.env.ROUAGES_DEPS?.split(',');
  const c = await collecterCouverture(sortie, async (url) => (await obstine(url)).text(), telecharger, cache, console.log, deps);
  if (c) console.log(`${ecrireCouverture(sortie, c, deps)} départements écrits.`);
}
