/**
 * Les espaces naturels de chaque commune : parcs, sites Natura 2000, réserves,
 * arrêtés de protection de biotope, et les inventaires ZNIEFF — avec la part
 * de la commune que chacun couvre.
 *
 * Les périmètres sont ceux de l'INPN (PatriNat), servis en WFS par la
 * Géoplateforme de l'IGN : le site de l'INPN lui-même est fermé depuis une
 * attaque informatique. Ils sont croisés avec les contours des communes que
 * `contours-emettre.ts` vient d'écrire, sans bibliothèque de géométrie : on
 * pose une grille de points sur la commune et on compte ceux qui tombent dans
 * chaque zone. La part est donc approchée — à quelques pour cent près sur une
 * commune moyenne —, et la page l'arrondit. Les contours étant simplifiés à
 * 100 m, une zone qui suit la limite d'une commune voisine mordrait sur
 * celle-ci d'un liseré : une zone n'est donc retenue que si elle touche le
 * cœur de la commune, à plus de 120 m de sa limite — par un point de la
 * grille, par trois de ses sommets (une rivière étroite) ou par son centre
 * (un étang, une grotte), avec alors une part « de moins de 1 % ». Un parc
 * naturel régional, auquel une commune adhère tout entière, n'est retenu
 * qu'au-delà de la moitié de la commune.
 *
 * Pour la carte, chaque zone est gardée une fois par département, simplifiée
 * à une centaine de mètres comme les communes ; les parcs naturels régionaux
 * et les aires d'adhésion des parcs nationaux n'y sont pas dessinés : ils
 * couvrent des communes entières, qui y adhèrent par leur charte.
 *
 * Lancé seul — `tsx scripts/espaces-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-espaces.json`.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

const WFS = 'https://data.geopf.fr/wfs/ows?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326';
const ECHELLE = 1e4;

/** Les natures, dans l'ordre où la page les range. */
export const NATURES = [
  'Cœur de parc national',
  'Réserve naturelle nationale',
  'Réserve naturelle régionale',
  'Arrêté de protection de biotope',
  'Natura 2000, directive Habitats',
  'Natura 2000, directive Oiseaux',
  'ZNIEFF de type I',
  'ZNIEFF de type II',
  'Parc naturel régional',
  'Aire d’adhésion de parc national',
] as const;
const DESSINEES = new Set([0, 1, 2, 3, 4, 5, 6, 7]);

const COUCHES: { couche: string; nature: (p: Proprietes) => number }[] = [
  { couche: 'patrinat_pn:parc_national', nature: (p) => (/c(œ|oe)ur/i.test(p.zone ?? '') ? 0 : 9) },
  { couche: 'patrinat_rnn:rnn', nature: () => 1 },
  { couche: 'patrinat_rnr:rnr', nature: () => 2 },
  { couche: 'patrinat_apb:apb', nature: () => 3 },
  { couche: 'patrinat_sic:sic', nature: () => 4 },
  { couche: 'patrinat_zps:zps', nature: () => 5 },
  { couche: 'patrinat_znieff1:znieff1', nature: () => 6 },
  { couche: 'patrinat_znieff2:znieff2', nature: () => 7 },
  { couche: 'patrinat_pnr:pnr', nature: () => 8 },
];

type Proprietes = { nom_site?: string; id_mnhn?: string; cd_sig?: string; zone?: string; area_sig?: number };
type Entite = { properties: Proprietes; geometry: { type: string; coordinates: unknown } | null };
/** Un anneau à plat : x0, y0, x1, y1… en dix-millièmes de degré. */
type Anneau = number[];

interface Zone {
  cle: string;
  nature: number;
  nom: string;
  id: string;
  hectares: number;
  anneaux: Anneau[];
  cadre: [number, number, number, number];
}

/** Une commune et la part de chacune de ses zones : nature, clé de la zone, pour cent (0 : moins de 1 %). */
export type EspacesCommune = [number, string, number][];

export interface Espaces {
  maj: string;
  communes: Map<string, EspacesCommune>;
  /** Par département : les zones de ses communes, nom, identifiant INPN, nature, anneaux simplifiés (vides pour les parcs). */
  zones: Map<string, Record<string, [string, string, number, number[][]]>>;
}

function cadreDe(anneaux: Anneau[]): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of anneaux) {
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Douglas-Peucker sur une ligne à plat. */
function simplifierLigne(r: Anneau, tol: number): Anneau {
  const n = r.length / 2;
  if (n <= 2) return r;
  const garde = new Uint8Array(n);
  garde[0] = garde[n - 1] = 1;
  const pile: [number, number][] = [[0, n - 1]];
  while (pile.length) {
    const [a, b] = pile.pop()!;
    const ax = r[2 * a], ay = r[2 * a + 1], bx = r[2 * b], by = r[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy) || 1;
    let loin = -1;
    let max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * r[2 * i] - dx * r[2 * i + 1] + bx * ay - by * ax) / l;
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

/** Un anneau fermé, coupé au point le plus éloigné du premier pour que la corde ne soit pas nulle. */
function simplifier(r: Anneau, tol: number): Anneau {
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
  const a = simplifierLigne(r.slice(0, 2 * k + 2), tol);
  const b = simplifierLigne(r.slice(2 * k), tol);
  return [...a, ...b.slice(2)];
}

function anneauxDe(g: Entite['geometry'], tol: number): Anneau[] {
  if (!g) return [];
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
  const sortie: Anneau[] = [];
  for (const p of polys) {
    for (const ring of p) {
      const r: number[] = [];
      for (const [x, y] of ring) {
        const qx = Math.round(x * ECHELLE);
        const qy = Math.round(y * ECHELLE);
        if (r.length && r[r.length - 2] === qx && r[r.length - 1] === qy) continue;
        r.push(qx, qy);
      }
      const s = simplifier(r, tol);
      if (s.length >= 8) sortie.push(s);
    }
  }
  return sortie;
}

const PETITS_MOTS = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'et', 'en', 'sur', 'sous', 'aux', 'au', 'à']);

/** « BOIS NOIRS - MONTS DE LA MADELEINE » → « Bois Noirs - Monts de la Madeleine » ; un nom déjà en casse mixte est gardé. */
export function casse(nom: string): string {
  if (nom !== nom.toUpperCase()) return nom;
  return nom
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((m, i, t) => {
      if (!/\p{L}/u.test(m)) return m;
      if (i > 0 && PETITS_MOTS.has(m)) return m;
      // « d'Allier », « l'Allier » : l'élision reste en minuscule, le nom prend sa capitale.
      if (i > 0 && (m === 'd' || m === 'l') && t[i + 1] === "'") return m;
      return m[0].toUpperCase() + m.slice(1);
    })
    .join('');
}

/** Pair-impair : le point est-il dans l'ensemble des anneaux (trous compris) ? */
function dedans(x: number, y: number, anneaux: Anneau[]): boolean {
  let c = false;
  for (const r of anneaux) {
    const n = r.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const yi = r[i + 1];
      const yj = r[j + 1];
      if (yi > y !== yj > y && x < ((r[j] - r[i]) * (y - yi)) / (yj - yi) + r[i]) c = !c;
    }
  }
  return c;
}

/** Distance d'un point au bord le plus proche des anneaux. */
function distanceAuBord(x: number, y: number, anneaux: Anneau[]): number {
  let min = Infinity;
  for (const r of anneaux) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Sutherland-Hodgman contre un rectangle : ce qui reste d'un anneau dans le cadre de la commune. */
function decouper(r: Anneau, [x0, y0, x1, y1]: [number, number, number, number]): Anneau {
  let pts = r;
  const bords: [(x: number, y: number) => boolean, (ax: number, ay: number, bx: number, by: number) => [number, number]][] = [
    [(x) => x >= x0, (ax, ay, bx, by) => [x0, ay + ((by - ay) * (x0 - ax)) / (bx - ax)]],
    [(x) => x <= x1, (ax, ay, bx, by) => [x1, ay + ((by - ay) * (x1 - ax)) / (bx - ax)]],
    [(_, y) => y >= y0, (ax, ay, bx, by) => [ax + ((bx - ax) * (y0 - ay)) / (by - ay), y0]],
    [(_, y) => y <= y1, (ax, ay, bx, by) => [ax + ((bx - ax) * (y1 - ay)) / (by - ay), y1]],
  ];
  for (const [garde, couper] of bords) {
    const s: number[] = [];
    const n = pts.length;
    if (n === 0) break;
    for (let i = 0; i < n; i += 2) {
      const j = (i - 2 + n) % n;
      const ax = pts[j], ay = pts[j + 1], bx = pts[i], by = pts[i + 1];
      const a = garde(ax, ay);
      const b = garde(bx, by);
      if (b) {
        if (!a) s.push(...couper(ax, ay, bx, by));
        s.push(bx, by);
      } else if (a) s.push(...couper(ax, ay, bx, by));
    }
    pts = s;
  }
  return pts;
}

function encoder(r: Anneau): number[] {
  const s: number[] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < r.length; i += 2) {
    s.push(r[i] - px, r[i + 1] - py);
    px = r[i];
    py = r[i + 1];
  }
  return s;
}

function decoder(r: number[]): Anneau {
  const s: number[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < r.length; i += 2) {
    x += r[i];
    y += r[i + 1];
    s.push(x, y);
  }
  return s;
}

/** Toutes les entités d'une couche, par pages ; une page refusée est redemandée, plus petite. */
async function entites(couche: string, dire: (m: string) => void): Promise<Entite[]> {
  const toutes: Entite[] = [];
  let taille = 200;
  let echecs = 0;
  for (let debut = 0; ; ) {
    const url = `${WFS}&typeNames=${couche}&sortBy=cd_sig&count=${taille}&startIndex=${debut}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      const page = (await r.json()) as { features: Entite[]; numberMatched?: number };
      toutes.push(...page.features);
      debut += page.features.length;
      echecs = 0;
      if (page.features.length < taille || (page.numberMatched !== undefined && debut >= page.numberMatched)) break;
    } catch (e) {
      echecs++;
      if (echecs > 12) throw new Error(`${couche} : page ${debut} refusée douze fois (${String(e)})`);
      if (echecs % 3 === 0 && taille > 10) taille = Math.max(10, taille >> 1);
      await new Promise((ok) => setTimeout(ok, 1500 * echecs));
    }
  }
  dire(`  ${couche} : ${toutes.length} zones`);
  return toutes;
}

/** Les contours que `contours-emettre.ts` a écrits, à plat. */
function contoursDesCommunes(sortie: string): Map<string, Anneau[]> {
  const dossier = join(sortie, 'dep');
  const m = new Map<string, Anneau[]>();
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('-contours.json'))) {
    const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { c: Record<string, [number[][], string[]]> };
    for (const [code, [anneaux]] of Object.entries(d.c)) m.set(code, anneaux.map(decoder));
  }
  return m;
}

/** Surface en hectares d'anneaux en dix-millièmes de degré, à la latitude donnée. */
function hectares(anneaux: Anneau[], lat: number): number {
  let a = 0;
  for (const r of anneaux) {
    let s = 0;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) s += r[j] * r[i + 1] - r[i] * r[j + 1];
    a += s / 2;
  }
  const m = 111_320 / ECHELLE;
  return (Math.abs(a) * m * m * Math.cos((lat * Math.PI) / 180)) / 10_000;
}

/** Une couche, lue dans `.cache/` si elle y est du jour, sinon interrogée et mise en cache. */
async function couche(cache: string, nom: string, dire: (m: string) => void): Promise<Entite[]> {
  const vers = join(cache, `patrinat-${nom.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.json`);
  if (existsSync(vers)) return JSON.parse(readFileSync(vers, 'utf8')) as Entite[];
  const e = await entites(nom, dire);
  writeFileSync(vers, JSON.stringify(e));
  return e;
}

export async function collecterEspaces(sortie: string, cache: string, dire: (m: string) => void): Promise<Espaces | null> {
  if (!readdirSync(join(sortie, 'dep')).some((n) => n.endsWith('-contours.json'))) {
    throw new Error('Espaces naturels : les contours des communes manquent — lancer contours-emettre.ts d’abord');
  }
  const communes = contoursDesCommunes(sortie);

  const zones: Zone[] = [];
  for (const { couche: nom, nature } of COUCHES) {
    for (const e of await couche(cache, nom, dire)) {
      const p = e.properties;
      const n = nature(p);
      // Tolérance de 30 m pour compter ; le dessin est simplifié davantage plus bas.
      const anneaux = anneauxDe(e.geometry, 3);
      if (anneaux.length === 0) continue;
      zones.push({
        cle: `${p.cd_sig ?? p.id_mnhn ?? zones.length}${n === 9 ? '-a' : ''}`,
        nature: n,
        nom: casse((p.nom_site ?? '').replace(/\s+/g, ' ').trim()),
        id: p.id_mnhn ?? '',
        hectares: Number(p.area_sig) || 0,
        anneaux,
        cadre: cadreDe(anneaux),
      });
    }
  }
  if (zones.length < 20000) {
    dire(`Espaces naturels : ${zones.length} zones seulement, on garde l’ingestion précédente.`);
    return null;
  }

  // Un index en grille de 0,2° : les zones dont le cadre touche chaque case.
  const CASE = 2000;
  const grille = new Map<string, number[]>();
  zones.forEach((z, i) => {
    for (let cx = Math.floor(z.cadre[0] / CASE); cx <= Math.floor(z.cadre[2] / CASE); cx++) {
      for (let cy = Math.floor(z.cadre[1] / CASE); cy <= Math.floor(z.cadre[3] / CASE); cy++) {
        const k = `${cx},${cy}`;
        const l = grille.get(k);
        if (l) l.push(i);
        else grille.set(k, [i]);
      }
    }
  });

  const parCommune = new Map<string, EspacesCommune>();
  const aDessiner = new Map<string, Set<number>>();
  for (const [code, anneaux] of communes) {
    const cadre = cadreDe(anneaux);
    const candidates = new Set<number>();
    for (let cx = Math.floor(cadre[0] / CASE); cx <= Math.floor(cadre[2] / CASE); cx++) {
      for (let cy = Math.floor(cadre[1] / CASE); cy <= Math.floor(cadre[3] / CASE); cy++) {
        for (const i of grille.get(`${cx},${cy}`) ?? []) candidates.add(i);
      }
    }
    const touchees = [...candidates].filter((i) => {
      const z = zones[i].cadre;
      return z[0] <= cadre[2] && z[2] >= cadre[0] && z[1] <= cadre[3] && z[3] >= cadre[1];
    });
    if (touchees.length === 0) continue;
    // La zone, réduite à ce qui tombe dans le cadre de la commune.
    const locales = touchees.map((i) => ({ i, anneaux: zones[i].anneaux.map((r) => decouper(r, cadre)).filter((r) => r.length >= 6) }));
    // Une grille de points sur la commune, plus serrée si elle est étroite.
    let pas = Math.max(1, Math.max(cadre[2] - cadre[0], cadre[3] - cadre[1]) / 28);
    let points: [number, number][] = [];
    for (let essai = 0; essai < 3 && points.length < 200; essai++, pas /= 2) {
      points = [];
      for (let x = cadre[0] + pas / 2; x < cadre[2]; x += pas) {
        for (let y = cadre[1] + pas / 2; y < cadre[3]; y += pas) if (dedans(x, y, anneaux)) points.push([x, y]);
      }
    }
    if (points.length === 0) continue;
    const lat = (cadre[1] + cadre[3]) / 2 / ECHELLE;
    const surface = hectares(anneaux, lat);
    // Le cœur de la commune : à plus de 120 m de sa limite. Les contours sont simplifiés à 100 m, et une zone
    // qui suit la limite d'une commune voisine mordrait sinon sur celle-ci d'un liseré qui n'existe pas.
    const MARGE = 12;
    const coeur = points.map(([x, y]) => distanceAuBord(x, y, anneaux) > MARGE);
    const liste: EspacesCommune = [];
    for (const { i, anneaux: local } of locales) {
      if (local.length === 0) continue;
      const z = zones[i];
      let n = 0;
      let nCoeur = 0;
      points.forEach(([x, y], k) => {
        if (!dedans(x, y, local)) return;
        n++;
        if (coeur[k]) nCoeur++;
      });
      let part = Math.round((100 * n) / points.length);
      if (z.nature >= 8) {
        // Un parc : la commune y adhère tout entière, ou pas. Une part faible est un liseré.
        if (part < 50) continue;
      } else if (nCoeur === 0) {
        // Rien au cœur de la commune : une zone étroite (une rivière) ou petite (un étang) n'y est retenue
        // que si trois de ses sommets, ou son centre pour une petite zone, sont bien à l'intérieur.
        let sommets = 0;
        for (const r of local) {
          for (let k = 0; k < r.length && sommets < 3; k += 2) {
            if (dedans(r[k], r[k + 1], anneaux) && distanceAuBord(r[k], r[k + 1], anneaux) > MARGE) sommets++;
          }
        }
        const cx = (z.cadre[0] + z.cadre[2]) / 2;
        const cy = (z.cadre[1] + z.cadre[3]) / 2;
        const petite = z.hectares > 0 && z.hectares <= surface / 50 && dedans(cx, cy, anneaux);
        if (sommets < 3 && !petite) continue;
        part = 0;
      }
      liste.push([z.nature, z.cle, Math.min(part, 100)]);
      const dep = departementDe(code);
      if (!aDessiner.has(dep)) aDessiner.set(dep, new Set());
      aDessiner.get(dep)!.add(i);
    }
    if (liste.length) parCommune.set(code, liste.sort((a, b) => a[0] - b[0] || b[2] - a[2]));
  }

  // Les zones à dessiner, une fois par département, simplifiées à 100 m et réduites au cadre du département.
  const cadresDep = new Map<string, [number, number, number, number]>();
  for (const [code, anneaux] of communes) {
    const dep = departementDe(code);
    const c = cadreDe(anneaux);
    const d = cadresDep.get(dep);
    cadresDep.set(dep, d ? [Math.min(d[0], c[0]), Math.min(d[1], c[1]), Math.max(d[2], c[2]), Math.max(d[3], c[3])] : c);
  }
  const zonesParDep = new Map<string, Record<string, [string, string, number, number[][]]>>();
  for (const [dep, indices] of aDessiner) {
    const cadre = cadresDep.get(dep)!;
    const z: Record<string, [string, string, number, number[][]]> = {};
    for (const i of indices) {
      const zone = zones[i];
      // Les parcs couvrent des communes entières : leur nom suffit, sans tracé.
      const anneaux = DESSINEES.has(zone.nature)
        ? zone.anneaux
            .map((r) => simplifier(decouper(r, cadre), 10))
            .filter((r) => r.length >= 8)
            .map(encoder)
        : [];
      z[zone.cle] = [zone.nom, zone.id, zone.nature, anneaux];
    }
    zonesParDep.set(dep, z);
  }
  const parNature = NATURES.map((_, k) => [...parCommune.values()].filter((l) => l.some(([n]) => n === k)).length);
  dire(
    `Espaces naturels : ${zones.length.toLocaleString('fr-FR')} zones, ${parCommune.size.toLocaleString('fr-FR')} communes concernées — ` +
      NATURES.map((n, k) => `${n} ${parNature[k]}`).join(', ') + '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), communes: parCommune, zones: zonesParDep };
}

export function ecrireEspaces(sortie: string, e: Espaces): number {
  return ecrireParDepartement(sortie, 'espaces', e.communes, (dep) => ({
    maj: e.maj,
    natures: NATURES,
    z: e.zones.get(dep) ?? {},
  }));
}

// Lancé seul : relit les contours déjà écrits, interroge la Géoplateforme, réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sortie, cache } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const e = await collecterEspaces(sortie, cache, console.log);
  if (e) console.log(`${ecrireEspaces(sortie, e)} départements écrits.`);
}
