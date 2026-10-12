/**
 * Ce qu'il faut au navigateur pour trouver « le plus proche » : le centre de
 * chaque commune, et, pour chaque type d'équipement et chaque domaine
 * d'association, les communes qui en ont.
 *
 * Rien n'est collecté ici : tout vient des fichiers que l'ingestion vient
 * d'écrire — les contours de l'IGN, la base permanente des équipements de
 * l'INSEE, le répertoire national des associations. Le script les réordonne
 * pour qu'une question — « la piscine la plus proche du Mayet-de-Montagne » —
 * ne charge qu'un petit fichier.
 *
 * - `proximite/centres.json` : le centre de chaque commune, dans l'ordre de
 *   `index.json`, au millième de degré (une centaine de mètres). C'est le
 *   barycentre du plus grand anneau de son contour : une distance « de
 *   commune à commune » se mesure entre ces points, à vol d'oiseau.
 * - `proximite/equipements/<n>.json` : pour le type n de la base, les
 *   communes qui en ont au moins un, et combien.
 * - `proximite/associations/<n>.json` : pour le domaine n du répertoire, les
 *   communes où au moins une association existante le déclare, et combien.
 * - `proximite/index.json` : les types, les domaines, les millésimes.
 * - `dep/XX-manques.json` : pour chaque commune, chaque regroupement de la
 *   gamme de proximité de l'INSEE qu'elle n'a pas, et la commune la plus
 *   proche qui l'a, avec la distance entre les deux centres, en hectomètres.
 *   Calculé ici une fois pour toutes, lu par la page de commune au build.
 *   La recherche reste dans l'Hexagone et la Corse pour une commune de
 *   métropole, dans le département pour une commune d'outre-mer.
 *
 * Les communes sont désignées par leur rang dans `index.json`, écrit en écart
 * au précédent : les fichiers restent petits.
 *
 * Lancé seul — `npx tsx scripts/proximite-emettre.ts` —, il relit
 * `public/territoires` et réécrit `public/territoires/proximite/`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Index = { maj: string; c: [string, string, string, string, number][] };
type ContoursDep = { millesime: string; c: Record<string, [number[][], string[], number[][]]> };
type EquipementsDep = { maj: string; millesime: string; types: [string, number, string][]; groupes: [string, number, number[]][]; c: Record<string, [number, number][]> };
type Existante = [string, string, number, number, string];
type AssociationsDep = { maj: string; domaines: string[]; c: Record<string, { x?: Existante[] }> };

const lire = <T,>(chemin: string): T | null => (existsSync(chemin) ? (JSON.parse(readFileSync(chemin, 'utf8')) as T) : null);

/** Le barycentre d'un anneau (formule de l'aire signée), en dix-millièmes de degré ; et son aire. */
function barycentre(r: number[]): { x: number; y: number; aire: number } | null {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < r.length; i += 2) {
    x += r[i];
    y += r[i + 1];
    pts.push([x, y]);
  }
  if (pts.length < 3) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (a === 0) return null;
  return { x: cx / (3 * a), y: cy / (3 * a), aire: Math.abs(a / 2) };
}

/** Des rangs croissants, écrits en écart au précédent. */
function ecarts(rangs: number[]): number[] {
  const out: number[] = [];
  let avant = 0;
  for (const r of rangs) {
    out.push(r - avant);
    avant = r;
  }
  return out;
}

/** Distance à vol d'oiseau entre deux centres, en kilomètres (millièmes de degré en entrée). */
function km(x1: number, y1: number, x2: number, y2: number): number {
  const rad = Math.PI / 180000;
  const dlat = (y2 - y1) * rad;
  const dlon = (x2 - x1) * rad;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Un dixième de degré par case : 11 km en latitude, au moins 7 km en longitude jusqu'au nord de la France. */
const CASE = 100;
const KM_PAR_CASE = 7;

function emettreManques(
  sortie: string,
  index: Index,
  centres: (number | null)[],
  groupes: [string, number, number[]][],
  parType: Map<number, [number, number][]>,
): number {
  const zone = (i: number) => (index.c[i][3].startsWith('97') ? index.c[i][3] : 'métropole');
  const proximite = groupes.map((g, k) => ({ k, membres: g[2] })).filter((_, k) => groupes[k][1] === 0);
  // Pour chaque regroupement, les communes qui l'ont, rangées par case et par zone.
  const grilles = proximite.map(({ membres }) => {
    const ont = new Set<number>();
    for (const t of membres) for (const [i] of parType.get(t) ?? []) ont.add(i);
    const cases = new Map<string, number[]>();
    for (const i of ont) {
      const x = centres[2 * i];
      const y = centres[2 * i + 1];
      if (x === null || y === null) continue;
      const cle = `${zone(i)}|${Math.floor(x / CASE)}|${Math.floor(y / CASE)}`;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle)!.push(i);
    }
    return { ont, cases };
  });
  const plusProche = (g: (typeof grilles)[number], i: number): [number, number] | null => {
    const x = centres[2 * i]!;
    const y = centres[2 * i + 1]!;
    const cx = Math.floor(x / CASE);
    const cy = Math.floor(y / CASE);
    const z = zone(i);
    let meilleur: [number, number] | null = null;
    for (let r = 0; r <= 60; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const j of g.cases.get(`${z}|${cx + dx}|${cy + dy}`) ?? []) {
            const d = km(x, y, centres[2 * j]!, centres[2 * j + 1]!);
            if (!meilleur || d < meilleur[1]) meilleur = [j, d];
          }
        }
      }
      // Tout ce qui reste hors des r premiers anneaux est à plus de r cases.
      if (meilleur && meilleur[1] <= r * KM_PAR_CASE) break;
    }
    return meilleur;
  };

  const parDep = new Map<string, Record<string, [number, string, number][]>>();
  let situes = 0;
  for (const c of index.c) if (!parDep.has(c[3])) parDep.set(c[3], {});
  const fichierEquipements = new Map<string, Set<string>>();
  for (let i = 0; i < index.c.length; i++) {
    const [code, , , dep] = index.c[i];
    if (centres[2 * i] === null) continue;
    // Une commune absente de la base des équipements n'a pas de « manque » : on ne sait rien d'elle.
    if (!fichierEquipements.has(dep)) {
      const d = lire<EquipementsDep>(join(sortie, 'dep', `${dep}-equipements.json`));
      fichierEquipements.set(dep, new Set(Object.keys(d?.c ?? {})));
    }
    if (!fichierEquipements.get(dep)!.has(code)) continue;
    const liste: [number, string, number][] = [];
    proximite.forEach(({ k }, n) => {
      const g = grilles[n];
      if (g.ont.has(i)) return;
      const p = plusProche(g, i);
      if (!p) return;
      liste.push([k, index.c[p[0]][0], Math.round(p[1] * 10)]);
      situes++;
    });
    if (liste.length) parDep.get(dep)![code] = liste;
  }
  for (const [dep, c] of parDep) {
    writeFileSync(join(sortie, 'dep', `${dep}-manques.json`), JSON.stringify({ maj: index.maj, c }));
  }
  return situes;
}

export function emettreProximite(sortie: string, dire: (m: string) => void = console.log): void {
  const index = lire<Index>(join(sortie, 'index.json'));
  if (!index) throw new Error('index.json absent');
  const rang = new Map(index.c.map(([code], i) => [code, i]));
  const dep = join(sortie, 'dep');
  const fichiers = readdirSync(dep);
  const dossier = join(sortie, 'proximite');
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(join(dossier, 'equipements'), { recursive: true });
  mkdirSync(join(dossier, 'associations'), { recursive: true });

  // Les centres.
  const centres: (number | null)[] = new Array(index.c.length * 2).fill(null);
  let millesimeContours = '';
  let places = 0;
  for (const f of fichiers.filter((x) => x.endsWith('-contours.json'))) {
    const d = lire<ContoursDep>(join(dep, f));
    if (!d) continue;
    millesimeContours ||= d.millesime;
    for (const [code, [anneaux]] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      // Le plus grand anneau : le contour principal, pas un trou ni une île.
      const b = anneaux.map(barycentre).filter((x) => x !== null).sort((p, q) => q!.aire - p!.aire)[0];
      if (!b) continue;
      centres[2 * i] = Math.round(b.x / 10);
      centres[2 * i + 1] = Math.round(b.y / 10);
      places++;
    }
  }
  writeFileSync(join(dossier, 'centres.json'), JSON.stringify({ maj: index.maj, millesime: millesimeContours, c: centres }));

  // Les équipements, type par type.
  let types: [string, number, string][] | null = null;
  let groupes: [string, number, number[]][] = [];
  let millesimeEquipements = '';
  let majEquipements = '';
  const parType = new Map<number, [number, number][]>();
  for (const f of fichiers.filter((x) => x.endsWith('-equipements.json'))) {
    const d = lire<EquipementsDep>(join(dep, f));
    if (!d) continue;
    if (!types) {
      types = d.types;
      groupes = d.groupes ?? [];
      millesimeEquipements = d.millesime;
      majEquipements = d.maj;
    } else if (JSON.stringify(types) !== JSON.stringify(d.types)) {
      throw new Error(`${f} : la liste des types d'équipements diffère des autres départements`);
    }
    for (const [code, l] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      for (const [t, n] of l) {
        if (n <= 0) continue;
        if (!parType.has(t)) parType.set(t, []);
        parType.get(t)!.push([i, n]);
      }
    }
  }
  for (const [t, l] of parType) {
    l.sort((a, b) => a[0] - b[0]);
    writeFileSync(join(dossier, 'equipements', `${t}.json`), JSON.stringify({ r: ecarts(l.map(([i]) => i)), n: l.map(([, n]) => n) }));
  }

  // Ce qui manque, et où le trouver : la commune la plus proche qui a chaque regroupement absent.
  const manques = emettreManques(sortie, index, centres, groupes, parType);

  // Les associations, domaine par domaine : la liste du département et la suite, s'il y en a une.
  let domaines: string[] = [];
  let majAssociations = '';
  const parDomaine = new Map<number, Map<number, number>>();
  const compter = (i: number, x: Existante[]) => {
    for (const a of x) {
      const dm = a[2];
      if (typeof dm !== 'number' || dm < 0) continue;
      if (!parDomaine.has(dm)) parDomaine.set(dm, new Map());
      const m = parDomaine.get(dm)!;
      m.set(i, (m.get(i) ?? 0) + 1);
    }
  };
  for (const f of fichiers.filter((x) => x.endsWith('-associations.json'))) {
    const d = lire<AssociationsDep>(join(dep, f));
    if (!d) continue;
    if (!domaines.length) {
      domaines = d.domaines;
      majAssociations = d.maj;
    }
    for (const [code, fiche] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      compter(i, fiche.x ?? []);
      const suite = lire<{ x: Existante[] }>(join(sortie, 'associations', `${code}.json`));
      if (suite) compter(i, suite.x);
    }
  }
  for (const [dm, m] of parDomaine) {
    const l = [...m].sort((a, b) => a[0] - b[0]);
    writeFileSync(join(dossier, 'associations', `${dm}.json`), JSON.stringify({ r: ecarts(l.map(([i]) => i)), n: l.map(([, n]) => n) }));
  }

  writeFileSync(
    join(dossier, 'index.json'),
    JSON.stringify({
      maj: index.maj,
      contours: millesimeContours,
      equipements: {
        maj: majEquipements,
        millesime: millesimeEquipements,
        // Nom, gamme de proximité (1) ou non, groupe, nombre de communes qui en ont.
        types: (types ?? []).map(([nom, gamme, groupe], t) => [nom, gamme, groupe, parType.get(t)?.length ?? 0]),
      },
      associations: { maj: majAssociations, domaines: domaines.map((nom, dm) => [nom, parDomaine.get(dm)?.size ?? 0]) },
    }),
  );
  dire(
    `Proximité : ${places.toLocaleString('fr-FR')} centres de communes, ` +
      `${parType.size} types d'équipements, ${parDomaine.size} domaines d'associations, ` +
      `${manques.toLocaleString('fr-FR')} absences situées par rapport à la commune la plus proche.`,
  );
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  emettreProximite(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'territoires'));
}
