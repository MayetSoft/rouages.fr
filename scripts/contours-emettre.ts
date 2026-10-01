/**
 * Les contours des communes, pour la carte de chaque page : la commune, ses
 * voisines, la silhouette de son département ; et, pour le croisement avec les
 * espaces naturels, des contours assez justes pour ne pas inventer de liseré.
 *
 * La source est ADMIN EXPRESS COG de l'IGN, au découpage du 1er janvier du
 * dernier millésime publié, dans sa version la plus précise — celle qui suit
 * la BD TOPO —, lue en WFS sur la Géoplateforme, sous Licence Ouverte 2.0. Elle est topologique : deux
 * communes voisines partagent exactement les mêmes sommets le long de leur
 * limite.
 *
 * C'est ce qui permet de simplifier sans trahir. Chaque contour est découpé en
 * « limites » — les portions entre deux points où le nombre de communes qui
 * se partagent un sommet change — et chaque limite est simplifiée une seule
 * fois, puis reprise telle quelle par les deux communes qu'elle sépare : pas
 * de trou ni de chevauchement entre voisines, à aucune échelle. Les voisines
 * sont les communes qui partagent une limite ; la silhouette du département
 * est faite des limites qu'une seule de ses communes emprunte.
 *
 * Les sommets sont lus au cent-millième de degré (un mètre), simplifiés à
 * TOLERANCE mètres pour le dessin, puis écrits au dix-millième en entiers,
 * chaque point comme l'écart au précédent.
 *
 * Lancé seul — `tsx scripts/contours-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-contours.json` et `contours-departements.json`.
 */
import { createReadStream, existsSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { communeDe, departementDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '5808de39c751df1e0679df72';
const WFS = 'https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326';
/** Lecture au mètre. */
const LU = 1e5;
/** Écriture au dix-millième de degré, une dizaine de mètres. */
const ECRIT = 1e4;
/** La simplification du dessin, en mètres : sous le pixel à l'échelle d'une commune. */
export const TOLERANCE = 25;
/** Celle des cartes d'intercommunalité et de département, où une commune fait quelques dizaines de pixels. */
export const TOLERANCE_GROSSIERE = 200;
/** Celle de la silhouette du département, pour un encart d'une centaine de pixels. */
const TOLERANCE_ENCART = 500;

/** Les anneaux de la commune (contours extérieurs et trous), ses voisines, puis ses anneaux simplifiés à TOLERANCE_GROSSIERE. */
export type ContoursCommune = [number[][], string[], number[][]];

export interface Contours {
  maj: string;
  millesime: string;
  communes: Map<string, ContoursCommune>;
  departements: Map<string, number[][]>;
}

type Entite = { properties: { code_insee?: string }; geometry: { type: string; coordinates: unknown } | null };
/** Un anneau à plat, x0, y0, x1, y1… en cent-millièmes de degré. */
type Anneau = Int32Array;

/** Une table de hachage à adressage ouvert : sommet → nombre d'anneaux qui l'empruntent. */
class Compteur {
  private cles: Float64Array;
  private valeurs: Int32Array;
  private masque: number;
  constructor(taille: number) {
    let n = 1;
    while (n < taille * 2) n <<= 1;
    this.cles = new Float64Array(n).fill(-1);
    this.valeurs = new Int32Array(n);
    this.masque = n - 1;
  }
  private place(k: number): number {
    let h = (Math.imul((k % 2147483647) | 0, 0x9e3779b1) ^ Math.floor(k / 4294967296)) & this.masque;
    while (this.cles[h] !== -1 && this.cles[h] !== k) h = (h + 1) & this.masque;
    return h;
  }
  ajouter(k: number) {
    const h = this.place(k);
    this.cles[h] = k;
    this.valeurs[h]++;
  }
  lire(k: number): number {
    const h = this.place(k);
    return this.cles[h] === k ? this.valeurs[h] : 0;
  }
}

const cle = (x: number, y: number) => (x + 20_000_000) * 40_000_000 + (y + 10_000_000);

/** Douglas-Peucker sur une ligne à plat, à extrémités fixes, en mètres à la latitude de la ligne. */
function simplifierLigne(r: number[], tolMetres: number): number[] {
  const n = r.length / 2;
  if (n <= 2) return r;
  const k = Math.cos((r[1] / LU) * (Math.PI / 180));
  const tol = (tolMetres / 111_320) * LU;
  const garde = new Uint8Array(n);
  garde[0] = garde[n - 1] = 1;
  const pile: [number, number][] = [[0, n - 1]];
  while (pile.length) {
    const [a, b] = pile.pop()!;
    const ax = r[2 * a] * k, ay = r[2 * a + 1], bx = r[2 * b] * k, by = r[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy);
    let loin = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const px = r[2 * i] * k, py = r[2 * i + 1];
      const d = l === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / l;
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
  const s: number[] = [];
  for (let i = 0; i < n; i++) if (garde[i]) s.push(r[2 * i], r[2 * i + 1]);
  return s;
}

/** Une limite fermée sur elle-même (une île, une enclave) : coupée au point le plus éloigné, pour que la corde ne soit pas nulle. */
function simplifierBoucle(r: number[], tol: number): number[] {
  const n = r.length / 2;
  if (n <= 4) return r;
  let k = 1;
  let dk = -1;
  for (let i = 1; i < n - 1; i++) {
    const d = Math.hypot(r[2 * i] - r[0], r[2 * i + 1] - r[1]);
    if (d > dk) {
      dk = d;
      k = i;
    }
  }
  return [...simplifierLigne(r.slice(0, 2 * k + 2), tol), ...simplifierLigne(r.slice(2 * k), tol).slice(2)];
}

/** Un anneau en entiers au dix-millième : le premier point tel quel, les suivants en écart au précédent. */
function encoder(r: number[]): number[] {
  const s: number[] = [];
  let px = 0;
  let py = 0;
  let dernier = '';
  for (let i = 0; i < r.length; i += 2) {
    const x = Math.round((r[i] * ECRIT) / LU);
    const y = Math.round((r[i + 1] * ECRIT) / LU);
    if (`${x},${y}` === dernier) continue;
    dernier = `${x},${y}`;
    s.push(x - px, y - py);
    px = x;
    py = y;
  }
  return s;
}

/** Le dernier millésime d'ADMIN EXPRESS COG que la Géoplateforme annonce. */
async function dernierMillesime(): Promise<number> {
  for (let i = 0; i < 8; i++) {
    try {
      const t = await (await fetch('https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetCapabilities', { signal: AbortSignal.timeout(120_000) })).text();
      const annees = [...t.matchAll(/ADMINEXPRESS-COG\.(\d{4}):commune</g)].map((m) => Number(m[1]));
      if (annees.length) return Math.max(...annees);
    } catch {
      /* on réessaie */
    }
    await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
  }
  throw new Error('Contours : millésime d’ADMIN EXPRESS introuvable');
}

/** Les communes, lues par pages sur la Géoplateforme et gardées une journée dans `.cache/`, une ligne par commune. */
async function lire(cache: string, annee: number, dire: (m: string) => void): Promise<string> {
  const COUCHE = `ADMINEXPRESS-COG.${annee}:commune`;
  const vers = join(cache, `admin-express-${annee}-communes-${new Date().toISOString().slice(0, 10)}.jsonl`);
  if (existsSync(vers)) return vers;
  const enCours = `${vers}.partiel`;
  writeFileSync(enCours, '');
  let taille = 50;
  let echecs = 0;
  let total = 0;
  for (let debut = 0; ; ) {
    const url = `${WFS}&typeNames=${COUCHE}&sortBy=code_insee&count=${taille}&startIndex=${debut}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      const page = (await r.json()) as { features: Entite[]; numberMatched?: number };
      const lignes = page.features.map((f) => {
        const g = f.geometry;
        const polys = (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
        const anneaux = polys.flatMap((p) => p.map((ring) => ring.flatMap(([x, y]) => [Math.round(x * LU), Math.round(y * LU)])));
        return JSON.stringify([f.properties.code_insee ?? '', anneaux]);
      });
      if (lignes.length) appendFileSync(enCours, lignes.join('\n') + '\n');
      debut += page.features.length;
      total = page.numberMatched ?? total;
      echecs = 0;
      if (page.features.length < taille || (total && debut >= total)) break;
      if (debut % 2000 < taille) dire(`  contours : ${debut} communes sur ${total}`);
    } catch (e) {
      echecs++;
      if (echecs > 15) throw new Error(`Contours : page ${debut} refusée quinze fois (${String(e)})`);
      if (echecs % 3 === 0 && taille > 5) taille = Math.max(5, taille >> 1);
      await new Promise((ok) => setTimeout(ok, 1500 * echecs));
    }
  }
  renameSync(enCours, vers);
  return vers;
}

export async function collecterContours(cache: string, dire: (m: string) => void): Promise<Contours | null> {
  const annee = await dernierMillesime();
  const fichier = await lire(cache, annee, dire);
  const { actuelles, reports } = reportsDuDecoupage();

  // Les anneaux, à plat ; une commune nouvelle réunit ceux des communes qui l'ont formée.
  const anneaux: { code: string; r: Anneau }[] = [];
  let sommets = 0;
  for await (const ligne of createInterface({ input: createReadStream(fichier) })) {
    if (!ligne) continue;
    const [brut, rs] = JSON.parse(ligne) as [string, number[][]];
    const c = communeDe(brut);
    const code = actuelles.has(c) ? c : reports.get(c);
    if (!code) continue;
    for (const r of rs) {
      // Le dernier point répète le premier : on le retire, l'anneau est fermé par construction.
      const n = r.length - (r[0] === r[r.length - 2] && r[1] === r[r.length - 1] ? 2 : 0);
      if (n >= 6) {
        anneaux.push({ code, r: Int32Array.from(r.slice(0, n)) });
        sommets += n / 2;
      }
    }
  }
  const codes = new Set(anneaux.map((a) => a.code));
  if (codes.size < 34000) {
    dire(`Contours : ${codes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }

  // Combien d'anneaux empruntent chaque sommet : un nœud est un sommet où ce nombre change.
  const compte = new Compteur(sommets);
  for (const { r } of anneaux) for (let i = 0; i < r.length; i += 2) compte.ajouter(cle(r[i], r[i + 1]));

  // Les limites : simplifiées une fois, retrouvées par leur clé quel que soit le sens de parcours.
  const limites = new Map<string, { points: number[]; grossier: number[]; encart: number[]; communes: string[] }>();
  const parCommune = new Map<string, { limites: { k: string; inverse: boolean }[][] }>();
  for (const { code, r } of anneaux) {
    const n = r.length / 2;
    const c = (i: number) => compte.lire(cle(r[2 * (i % n)], r[2 * (i % n) + 1]));
    const noeuds: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = c(i);
      if (v !== c(i + n - 1) || v !== c(i + 1) || v > 2) noeuds.push(i);
    }
    if (noeuds.length === 0) {
      // Pas de nœud : une île, ou une enclave dont le contour est aussi le trou de sa voisine. On part du plus petit sommet, le même des deux côtés.
      let m = 0;
      for (let i = 1; i < n; i++) if (cle(r[2 * i], r[2 * i + 1]) < cle(r[2 * m], r[2 * m + 1])) m = i;
      noeuds.push(m);
    }
    const anneau: { k: string; inverse: boolean }[] = [];
    for (let j = 0; j < noeuds.length; j++) {
      const a = noeuds[j];
      const b = j + 1 < noeuds.length ? noeuds[j + 1] : noeuds[0] + n;
      const pts: number[] = [];
      for (let i = a; i <= b; i++) pts.push(r[2 * (i % n)], r[2 * (i % n) + 1]);
      // Le sens canonique : celui où l'on part du plus petit des deux bouts, ou du plus petit second point pour une boucle.
      const debut = cle(pts[0], pts[1]);
      const fin = cle(pts[pts.length - 2], pts[pts.length - 1]);
      const second = cle(pts[2], pts[3]);
      const avantDernier = cle(pts[pts.length - 4], pts[pts.length - 3]);
      const inverse = debut > fin || (debut === fin && second > avantDernier);
      const canon = inverse ? inverserPoints(pts) : pts;
      const milieu = Math.floor(canon.length / 4) * 2;
      const k = `${cle(canon[0], canon[1])}|${cle(canon[canon.length - 2], canon[canon.length - 1])}|${canon.length}|${cle(canon[milieu], canon[milieu + 1])}`;
      const l = limites.get(k);
      if (l) l.communes.push(code);
      else {
        const boucle = debut === fin;
        limites.set(k, {
          points: boucle ? simplifierBoucle(canon, TOLERANCE) : simplifierLigne(canon, TOLERANCE),
          grossier: boucle ? simplifierBoucle(canon, TOLERANCE_GROSSIERE) : simplifierLigne(canon, TOLERANCE_GROSSIERE),
          encart: boucle ? simplifierBoucle(canon, TOLERANCE_ENCART) : simplifierLigne(canon, TOLERANCE_ENCART),
          communes: [code],
        });
      }
      anneau.push({ k, inverse });
    }
    const p = parCommune.get(code) ?? { limites: [] };
    p.limites.push(anneau);
    parCommune.set(code, p);
  }

  // Chaque commune recompose ses anneaux à partir des limites simplifiées.
  const recomposer = (morceaux: { k: string; inverse: boolean }[], champ: 'points' | 'grossier' | 'encart'): number[] => {
    const s: number[] = [];
    for (const { k, inverse } of morceaux) {
      const pts = limites.get(k)![champ];
      const p = inverse ? inverserPoints(pts) : pts;
      s.push(...(s.length ? p.slice(2) : p));
    }
    return s;
  };
  const communes = new Map<string, ContoursCommune>();
  for (const [code, { limites: ls }] of parCommune) {
    const voisines = new Set<string>();
    for (const morceaux of ls) for (const { k } of morceaux) for (const v of limites.get(k)!.communes) if (v !== code) voisines.add(v);
    const rs = ls.map((m) => encoder(recomposer(m, 'points'))).filter((r) => r.length >= 6);
    const grossiers = ls.map((m) => encoder(recomposer(m, 'grossier'))).filter((r) => r.length >= 6);
    communes.set(code, [rs, [...voisines].sort(), grossiers]);
  }

  // La silhouette de chaque département : ses limites qu'une seule de ses communes emprunte, enchaînées.
  const departements = new Map<string, number[][]>();
  const parDep = new Map<string, string[]>();
  for (const [k, l] of limites) {
    const deps = l.communes.map(departementDe);
    for (const dep of new Set(deps)) if (deps.filter((d) => d === dep).length === 1) parDep.set(dep, [...(parDep.get(dep) ?? []), k]);
  }
  for (const [dep, ks] of parDep) departements.set(dep, enchainer(ks.map((k) => limites.get(k)!.encart)).map(encoder).filter((r) => r.length >= 8));

  const partagees = [...limites.values()].filter((l) => l.communes.length === 2).length;
  const sansVoisine = [...communes.values()].filter(([, v]) => v.length === 0).length;
  dire(
    `Contours de l’IGN : ${communes.size.toLocaleString('fr-FR')} communes, ${sommets.toLocaleString('fr-FR')} sommets, ` +
      `${limites.size.toLocaleString('fr-FR')} limites dont ${partagees.toLocaleString('fr-FR')} partagées ; ` +
      `${sansVoisine} commune${sansVoisine > 1 ? 's' : ''} sans voisine (îles).`,
  );
  return { maj: new Date().toISOString().slice(0, 10), millesime: String(annee), communes, departements };
}

function inverserPoints(pts: number[]): number[] {
  const s: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) s.push(pts[i], pts[i + 1]);
  return s;
}

/** Des lignes mises bout à bout, dans un sens ou dans l'autre, en anneaux fermés. */
function enchainer(lignes: number[][]): number[][] {
  const restantes = lignes.map((l) => l.slice());
  const anneaux: number[][] = [];
  while (restantes.length) {
    let a = restantes.pop()!;
    for (;;) {
      const fx = a[a.length - 2], fy = a[a.length - 1];
      if (fx === a[0] && fy === a[1] && a.length > 4) break;
      const i = restantes.findIndex((l) => (l[0] === fx && l[1] === fy) || (l[l.length - 2] === fx && l[l.length - 1] === fy));
      if (i < 0) break;
      const l = restantes.splice(i, 1)[0];
      a = a.concat((l[0] === fx && l[1] === fy ? l : inverserPoints(l)).slice(2));
    }
    anneaux.push(a);
  }
  return anneaux;
}

export function ecrireContours(sortie: string, c: Contours): number {
  writeFileSync(
    join(sortie, 'contours-departements.json'),
    JSON.stringify({ maj: c.maj, millesime: c.millesime, d: Object.fromEntries(c.departements) }),
  );
  return ecrireParDepartement(sortie, 'contours', c.communes, () => ({
    maj: c.maj,
    millesime: c.millesime,
    tolerance: TOLERANCE,
    toleranceGrossiere: TOLERANCE_GROSSIERE,
  }));
}

// Lancé seul : lit la Géoplateforme (ou le cache du jour), et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const c = await collecterContours(cache, console.log);
  if (c) console.log(`${ecrireContours(sortie, c)} départements écrits.`);
}
