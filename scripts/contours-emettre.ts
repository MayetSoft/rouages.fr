/**
 * Les contours des communes, pour la carte de situation de chaque page : la
 * commune, ses voisines, et la silhouette de son département.
 *
 * La source est le découpage d'Etalab tiré d'ADMIN EXPRESS de l'IGN, simplifié
 * à 100 mètres en gardant la topologie : deux communes voisines partagent
 * exactement les mêmes sommets le long de leur limite. C'est ce qui permet de
 * trouver les voisines — deux sommets communs — et de tirer la silhouette du
 * département sans calcul d'union : ses bords sont les segments qu'une seule
 * de ses communes emprunte.
 *
 * Les coordonnées sont gardées au dix-millième de degré — une dizaine de
 * mètres, plus fin que la simplification —, en entiers, chaque point écrit
 * comme l'écart au précédent : un fichier par département, deux à trois fois
 * plus léger que le GeoJSON.
 *
 * Lancé seul — `tsx scripts/contours-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-contours.json` et `contours-departements.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { communeDe, departementDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '683424e996857155175d4f68';
const ECHELLE = 1e4;

type Point = [number, number];
type Anneau = Point[];

/** Les anneaux de la commune (contours extérieurs et trous), puis ses voisines. */
export type ContoursCommune = [number[][], string[]];

export interface Contours {
  maj: string;
  millesime: string;
  communes: Map<string, ContoursCommune>;
  departements: Map<string, number[][]>;
}

type Ressource = { title?: string; url?: string; last_modified?: string };
type Entite = { properties: { code: string }; geometry: { type: string; coordinates: unknown } | null };

/** Un anneau en entiers : le premier point tel quel, les suivants en écart au précédent. */
export function encoder(anneau: Anneau): number[] {
  const sortie: number[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of anneau) {
    sortie.push(x - px, y - py);
    px = x;
    py = y;
  }
  return sortie;
}

/**
 * Douglas-Peucker sur un anneau fermé, en unités du dix-millième de degré.
 * Le premier et le dernier point d'un anneau sont confondus : on le coupe
 * d'abord au point le plus éloigné du premier, sans quoi la « corde » serait
 * nulle et tout l'anneau tomberait.
 */
function simplifier(anneau: Anneau, tolerance: number): Anneau {
  if (anneau.length <= 4) return anneau;
  const [x0, y0] = anneau[0];
  let k = 1;
  for (let i = 1; i < anneau.length - 1; i++) {
    if (Math.hypot(anneau[i][0] - x0, anneau[i][1] - y0) > Math.hypot(anneau[k][0] - x0, anneau[k][1] - y0)) k = i;
  }
  return [...simplifierLigne(anneau.slice(0, k + 1), tolerance), ...simplifierLigne(anneau.slice(k), tolerance).slice(1)];
}

function simplifierLigne(anneau: Anneau, tolerance: number): Anneau {
  if (anneau.length <= 2) return anneau;
  const garde = new Uint8Array(anneau.length);
  garde[0] = 1;
  garde[anneau.length - 1] = 1;
  const pile: [number, number][] = [[0, anneau.length - 1]];
  while (pile.length) {
    const [a, b] = pile.pop()!;
    const [ax, ay] = anneau[a];
    const [bx, by] = anneau[b];
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    let loin = -1;
    let max = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * anneau[i][0] - dx * anneau[i][1] + bx * ay - by * ax) / l;
      if (d > max) {
        max = d;
        loin = i;
      }
    }
    if (loin >= 0) {
      garde[loin] = 1;
      pile.push([a, loin], [loin, b]);
    }
  }
  return anneau.filter((_, i) => garde[i]);
}

function anneaux(g: Entite['geometry']): Anneau[] {
  if (!g) return [];
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
  return polys.flatMap((p) => p.map((r) => r.map(([x, y]) => [Math.round(x * ECHELLE), Math.round(y * ECHELLE)] as Point)));
}

/** Les segments qu'une seule commune du département emprunte, enchaînés en anneaux : sa silhouette. */
function silhouette(lesAnneaux: Anneau[]): Anneau[] {
  const cle = (p: Point) => `${p[0]},${p[1]}`;
  const compte = new Map<string, number>();
  const seg = (a: Point, b: Point) => (cle(a) < cle(b) ? `${cle(a)};${cle(b)}` : `${cle(b)};${cle(a)}`);
  for (const r of lesAnneaux) for (let i = 1; i < r.length; i++) compte.set(seg(r[i - 1], r[i]), (compte.get(seg(r[i - 1], r[i])) ?? 0) + 1);
  const suivants = new Map<string, Point[]>();
  const points = new Map<string, Point>();
  for (const r of lesAnneaux) {
    for (let i = 1; i < r.length; i++) {
      if (compte.get(seg(r[i - 1], r[i])) !== 1) continue;
      for (const [a, b] of [[r[i - 1], r[i]], [r[i], r[i - 1]]] as [Point, Point][]) {
        if (!suivants.has(cle(a))) suivants.set(cle(a), []);
        suivants.get(cle(a))!.push(b);
        points.set(cle(a), a);
      }
    }
  }
  const vus = new Set<string>();
  const sortie: Anneau[] = [];
  for (const [depart, p0] of points) {
    if (vus.has(depart)) continue;
    const anneau: Anneau = [p0];
    vus.add(depart);
    let courant = depart;
    for (;;) {
      const prochain = (suivants.get(courant) ?? []).find((p) => !vus.has(cle(p)));
      if (!prochain) break;
      anneau.push(prochain);
      vus.add(cle(prochain));
      courant = cle(prochain);
    }
    if (anneau.length >= 4) sortie.push([...anneau, p0]);
  }
  return sortie;
}

export async function collecterContours(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Contours | null> {
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEU}/resources/?page_size=200`)) as { data?: Ressource[] };
  // Le millésime le plus récent, au découpage du 1er janvier, simplifié à 100 m.
  const res = (r.data ?? [])
    .map((x) => ({ ...x, annee: Number(/^Communes (\d{4}) 100m \(format GeoJSON compressé GZ\)$/.exec((x.title ?? '').trim())?.[1] ?? 0) }))
    .filter((x) => x.url && x.annee > 2000)
    .sort((a, b) => b.annee - a.annee)[0];
  if (!res) throw new Error('Contours : aucun fichier « Communes AAAA 100m »');
  const vers = join(cache, `contours-communes-${res.annee}-100m.geojson.gz`);
  await telecharger(res.url!, vers);
  const { features } = JSON.parse(gunzipSync(readFileSync(vers)).toString('utf8')) as { features: Entite[] };

  const { actuelles, reports } = reportsDuDecoupage();
  const formes = new Map<string, Anneau[]>();
  for (const f of features) {
    const brut = communeDe(f.properties.code);
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    if (!code) continue;
    // Une commune nouvelle réunit les contours de celles qui l'ont formée.
    formes.set(code, [...(formes.get(code) ?? []), ...anneaux(f.geometry)]);
  }
  if (formes.size < 34000) {
    dire(`Contours : ${formes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }

  // Les voisines : deux sommets en commun au moins.
  const parSommet = new Map<string, string[]>();
  for (const [code, rs] of formes) {
    const vus = new Set<string>();
    for (const r of rs) for (const [x, y] of r) vus.add(`${x},${y}`);
    for (const k of vus) {
      const l = parSommet.get(k);
      if (l) l.push(code);
      else parSommet.set(k, [code]);
    }
  }
  const partages = new Map<string, Map<string, number>>();
  for (const codes of parSommet.values()) {
    if (codes.length < 2) continue;
    for (const a of codes) {
      for (const b of codes) {
        if (a === b) continue;
        const m = partages.get(a) ?? new Map<string, number>();
        m.set(b, (m.get(b) ?? 0) + 1);
        partages.set(a, m);
      }
    }
  }

  const communes = new Map<string, ContoursCommune>();
  for (const [code, rs] of formes) {
    const voisines = [...(partages.get(code) ?? [])].filter(([, n]) => n >= 2).map(([c]) => c).sort();
    communes.set(code, [rs.map(encoder), voisines]);
  }

  // La silhouette de chaque département, simplifiée à 500 m pour l'encart.
  const parDep = new Map<string, Anneau[]>();
  for (const [code, rs] of formes) {
    const dep = departementDe(code);
    parDep.set(dep, [...(parDep.get(dep) ?? []), ...rs]);
  }
  const departements = new Map<string, number[][]>();
  for (const [dep, rs] of parDep) {
    departements.set(
      dep,
      silhouette(rs)
        .map((a) => simplifier(a, 50))
        .filter((a) => a.length >= 4)
        .map(encoder),
    );
  }
  const sansVoisine = [...communes.values()].filter(([, v]) => v.length === 0).length;
  dire(
    `Contours ${res.annee} : ${communes.size.toLocaleString('fr-FR')} communes, ${departements.size} départements ; ` +
      `${sansVoisine} commune${sansVoisine > 1 ? 's' : ''} sans voisine (îles).`,
  );
  return { maj: new Date().toISOString().slice(0, 10), millesime: String(res.annee), communes, departements };
}

export function ecrireContours(sortie: string, c: Contours): number {
  writeFileSync(
    join(sortie, 'contours-departements.json'),
    JSON.stringify({ maj: c.maj, millesime: c.millesime, d: Object.fromEntries(c.departements) }),
  );
  return ecrireParDepartement(sortie, 'contours', c.communes, () => ({ maj: c.maj, millesime: c.millesime }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const c = await collecterContours(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (c) console.log(`${ecrireContours(sortie, c)} départements écrits.`);
}
