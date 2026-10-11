/**
 * Le simulateur d'estimation : des prix unitaires par commune, tirés des
 * ventes de DVF que lit déjà `dvf-emettre.ts`.
 *
 * **La méthode** est celle d'une surface pondérée, que le mainteneur avait
 * mise au point à la main : un bien vaut la somme de ses parts — la surface
 * habitable, le terrain constructible, les terres, les bois, les locaux
 * d'activité comptés pour une fraction de l'habitable. Ici, les prix de
 * chaque part sont mesurés sur les ventes :
 *
 * - **les terres et les bois** sur les ventes de terrain nu d'une seule
 *   nature, en euros à l'hectare, par taille : un petit pré se vend plus cher
 *   à l'hectare qu'un grand ;
 * - **le terrain constructible vendu seul** (sol, jardin, terrain à bâtir),
 *   au mètre carré ;
 * - **l'habitable et le terrain qui va avec la maison**, par une régression
 *   robuste sur les ventes d'une maison : prix − terres − bois =
 *   h × (habitable + k × activité) + c × terrain, sans constante — une maison
 *   sans surface ne vaut rien. k, la part des locaux d'activité, n'est pas
 *   mesurable dans DVF (trop peu de ventes, aucune surface pour les
 *   dépendances) : c'est l'hypothèse du mainteneur, un quart, et la page le dit.
 *
 * **Le voisinage.** Un village vend quelques maisons par an : chaque commune
 * est mesurée avec ses voisines, un anneau après l'autre (d'après les
 * contours d'Admin Express), jusqu'à avoir assez de ventes — trois anneaux au
 * plus. La page dit combien de ventes et d'anneaux ont servi.
 *
 * **La précision** est mesurée, pas supposée : les ventes de maisons du
 * voisinage sont partagées en cinq, chaque cinquième estimé par les quatre
 * autres, et on garde l'écart médian entre l'estimation et le prix réel, avec
 * les quartiles du rapport prix / estimation, qui font la fourchette. DVF ne
 * dit rien de l'état d'une maison : c'est l'essentiel de l'écart.
 *
 * Rien ici ne désigne une vente : seulement des prix unitaires agrégés sur
 * au moins cent ventes de maisons ou quinze de terrain.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { communeDe, departementDe } from './par-departement.ts';
import { fichierCache, type DpeMaison } from './dpe-maisons-emettre.ts';

/** Une vente lue pour l'estimation : surfaces en m². */
export type Bien = {
  commune: string;
  prix: number;
  /** Surface habitable d'une maison, 0 pour un terrain nu. */
  habitable: number;
  /** Locaux industriels, commerciaux ou assimilés. */
  activite: number;
  /** Sol, jardin, terrain d'agrément, terrain à bâtir. */
  constructible: number;
  /** Terres, prés, landes. */
  agricole: number;
  bois: number;
  /** Le point et le jour de la vente, pour la rapprocher d'un DPE. */
  lat: number | null;
  lon: number | null;
  jour: string;
};

const CONSTRUCTIBLE = new Set(['S', 'AG', 'AB', 'J']);
const AGRICOLE = new Set(['T', 'P', 'PA', 'PC', 'PP', 'L', 'LB']);
const estBois = (n: string) => n === 'B' || /^B[A-Z]$/.test(n);

/**
 * Une mutation, ses lignes réunies : une maison (avec ses dépendances, ses
 * locaux, ses terrains) ou un terrain nu, ou rien. Les vignes, les vergers,
 * les eaux, les carrières n'entrent pas : leur prix tient à autre chose.
 */
export function bienDe(lignes: string[][], col: Record<string, number>): Bien | null {
  if (lignes[0][col.nature_mutation] !== 'Vente') return null;
  const communes = new Set(lignes.map((l) => l[col.code_commune]));
  if (communes.size !== 1) return null;
  const prix = Number(lignes[0][col.valeur_fonciere]);
  if (!(prix >= 1000)) return null;
  const maisons = new Map<string, number>();
  const locaux = new Map<string, number>();
  const terrains = new Map<string, [string, number]>();
  for (const l of lignes) {
    const type = l[col.type_local];
    const bati = Number(l[col.surface_reelle_bati]) || 0;
    if (type === 'Appartement') return null;
    if (type === 'Maison') maisons.set(`${l[col.id_parcelle]}|${bati}|${l[col.lot1_numero]}`, bati);
    else if (type && type.startsWith('Local')) locaux.set(`${l[col.id_parcelle]}|${bati}`, bati);
    const s = Number(l[col.surface_terrain]) || 0;
    const n = l[col.code_nature_culture];
    if (s > 0 && n) terrains.set(`${l[col.id_parcelle]}|${n}|${col.code_nature_culture_speciale !== undefined ? l[col.code_nature_culture_speciale] : ''}`, [n, s]);
  }
  if (maisons.size > 1) return null;
  let constructible = 0;
  let agricole = 0;
  let bois = 0;
  for (const [n, s] of terrains.values()) {
    if (CONSTRUCTIBLE.has(n)) constructible += s;
    else if (AGRICOLE.has(n)) agricole += s;
    else if (estBois(n)) bois += s;
    else return null;
  }
  const habitable = [...maisons.values()][0] ?? 0;
  const activite = [...locaux.values()].reduce((a, b) => a + b, 0);
  if (maisons.size === 1 && !(habitable >= 9)) return null;
  if (habitable + activite + constructible + agricole + bois <= 0) return null;
  const lat = col.latitude !== undefined ? Number(lignes[0][col.latitude]) || null : null;
  const lon = col.longitude !== undefined ? Number(lignes[0][col.longitude]) || null : null;
  const jour = col.date_mutation !== undefined ? lignes[0][col.date_mutation] : '';
  return { commune: communeDe([...communes][0]), prix, habitable, activite, constructible, agricole, bois, lat, lon, jour };
}

/** Les bornes des tailles de terrain agricole, en m² : moins d'un demi-hectare, jusqu'à deux, au-delà. */
export const TAILLES = [5_000, 20_000];
/** La part des locaux d'activité dans l'habitable : l'hypothèse du mainteneur. */
export const PART_ACTIVITE = 0.25;
/**
 * Cent ventes de maisons au moins : en dessous, le partage entre l'habitable
 * et le terrain varie du simple au double d'une commune à sa voisine — les
 * grandes maisons ont souvent les grands terrains, et quarante ventes ne
 * suffisent pas à séparer les deux.
 */
const MAISONS_MIN = 100;
const TERRAINS_MIN = 15;
const ANNEAUX_MAX = 3;

const mediane = (v: number[]): number | null => {
  if (v.length === 0) return null;
  const t = [...v].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};
const quantile = (v: number[], p: number): number => {
  const t = [...v].sort((a, b) => a - b);
  const i = (t.length - 1) * p;
  const b = Math.floor(i);
  return t[b] + (t[Math.min(b + 1, t.length - 1)] - t[b]) * (i - b);
};
const taille = (s: number) => (s < TAILLES[0] ? 0 : s < TAILLES[1] ? 1 : 2);

/** Les prix à l'hectare des terres par taille ; une taille de moins de cinq ventes prend le prix de toutes. */
function prixTerres(ventes: { s: number; ha: number }[]): [number, number, number] | null {
  if (ventes.length < TERRAINS_MIN) return null;
  const tous = mediane(ventes.map((v) => v.ha))!;
  return [0, 1, 2].map((t) => {
    const l = ventes.filter((v) => taille(v.s) === t);
    return Math.round(l.length >= 5 ? mediane(l.map((v) => v.ha))! : tous);
  }) as [number, number, number];
}
const valeurTerres = (s: number, prix: [number, number, number] | null) => (prix && s > 0 ? (s / 10_000) * prix[taille(s)] : 0);

/**
 * Le prix au m² de l'habitable (h) et du terrain de la maison (c), par moindres
 * carrés repondérés (Huber) : une vente extravagante pèse moins à chaque tour.
 * Sans constante ; un coefficient négatif est ramené à zéro et l'autre réajusté.
 */
export function ajusterMaisons(x: [number, number][], y: number[]): [number, number] | null {
  if (x.length < 10) return null;
  let w = y.map(() => 1);
  let coef: [number, number] = [0, 0];
  const resoudre = (garder: [boolean, boolean]) => {
    let a = 0, b = 0, d = 0, e = 0, f = 0;
    x.forEach(([h, c], i) => {
      a += w[i] * h * h; b += w[i] * h * c; d += w[i] * c * c; e += w[i] * h * y[i]; f += w[i] * c * y[i];
    });
    if (garder[0] && garder[1]) {
      const det = a * d - b * b;
      if (Math.abs(det) > 1e-9) return [(e * d - b * f) / det, (a * f - b * e) / det] as [number, number];
    }
    if (garder[0] && a > 0) return [e / a, 0] as [number, number];
    if (garder[1] && d > 0) return [0, f / d] as [number, number];
    return [0, 0] as [number, number];
  };
  for (let tour = 0; tour < 25; tour++) {
    coef = resoudre([true, true]);
    if (coef[1] < 0) coef = resoudre([true, false]);
    else if (coef[0] < 0) coef = resoudre([false, true]);
    const r = y.map((v, i) => v - coef[0] * x[i][0] - coef[1] * x[i][1]);
    const s = (mediane(r.map(Math.abs)) ?? 1) / 0.6745 || 1;
    const k = 1.345 * s;
    w = r.map((v) => (Math.abs(v) <= k ? 1 : k / Math.abs(v)));
  }
  return coef[0] > 0 ? coef : null;
}

/**
 * Par commune : [h €/m² habitable, c €/m² du terrain d'une maison,
 * constructible seul €/m², terres €/ha par taille, bois €/ha,
 * [ventes de maisons, anneaux], [écart médian, quartile bas, quartile haut
 * du rapport prix / estimation], ventes de terres, ventes de bois, ventes de
 * terrain constructible seul]. null là où les ventes manquent.
 */
export type Estimation = [
  number | null,
  number | null,
  number | null,
  [number, number, number] | null,
  number | null,
  [number, number],
  [number, number, number] | null,
  number,
  number,
  number,
  /** Le multiplicateur moyen des maisons de la commune, selon leurs étiquettes, là où l'effet du DPE est mesuré. */
  (number | null)?,
];

export function estimer(biens: Bien[], voisines: (code: string) => string[]): Map<string, Estimation> {
  const parCommune = new Map<string, Bien[]>();
  for (const b of biens) (parCommune.get(b.commune) ?? parCommune.set(b.commune, []).get(b.commune)!).push(b);
  /** Les ventes de la commune et de ses voisines, anneau par anneau, jusqu'à en avoir assez. */
  const autour = (code: string, filtre: (b: Bien) => boolean, minimum: number): { l: Bien[]; anneaux: number } => {
    const vus = new Set([code]);
    let front = [code];
    let l = (parCommune.get(code) ?? []).filter(filtre);
    let anneaux = 0;
    while (l.length < minimum && anneaux < ANNEAUX_MAX) {
      const suivant: string[] = [];
      for (const c of front) for (const v of voisines(c)) if (!vus.has(v)) (vus.add(v), suivant.push(v));
      if (suivant.length === 0) break;
      for (const c of suivant) l = l.concat((parCommune.get(c) ?? []).filter(filtre));
      front = suivant;
      anneaux++;
    }
    return { l, anneaux };
  };
  const estMaison = (b: Bien) => b.habitable > 0;
  const terreSeule = (b: Bien) => b.habitable === 0 && b.activite === 0 && b.constructible === 0 && b.bois === 0 && b.agricole >= 1000;
  const boisSeul = (b: Bien) => b.habitable === 0 && b.activite === 0 && b.constructible === 0 && b.agricole === 0 && b.bois >= 1000;
  const constructibleSeul = (b: Bien) => b.habitable === 0 && b.activite === 0 && b.agricole === 0 && b.bois === 0 && b.constructible >= 300;

  const sortie = new Map<string, Estimation>();
  // Seulement les départements que DVF couvre : une commune d'Alsace ou de
  // Moselle, où le livre foncier tient ce rôle, ne prend pas le prix de ses
  // voisines d'un autre département.
  const couverts = new Set([...parCommune.keys()].map(departementDe));
  const codes = new Set([...parCommune.keys(), ...[...parCommune.keys()].flatMap(voisines)].filter((c) => couverts.has(departementDe(c))));
  for (const code of codes) {
    const terres = autour(code, terreSeule, TERRAINS_MIN).l;
    const prixT = prixTerres(terres.map((b) => ({ s: b.agricole, ha: (b.prix / b.agricole) * 10_000 })));
    const bois = autour(code, boisSeul, TERRAINS_MIN).l;
    const prixB = bois.length >= TERRAINS_MIN ? Math.round(mediane(bois.map((b) => (b.prix / b.bois) * 10_000))!) : null;
    const seul = autour(code, constructibleSeul, TERRAINS_MIN).l;
    const prixC = seul.length >= TERRAINS_MIN ? Math.round(mediane(seul.map((b) => b.prix / b.constructible))! * 10) / 10 : null;
    const valeurBois = (s: number) => (prixB && s > 0 ? (s / 10_000) * prixB : 0);

    const { l: maisons, anneaux } = autour(code, estMaison, MAISONS_MIN);
    let hc: [number, number] | null = null;
    let precision: [number, number, number] | null = null;
    if (maisons.length >= MAISONS_MIN) {
      const x = maisons.map((b): [number, number] => [b.habitable + PART_ACTIVITE * b.activite, b.constructible]);
      const y = maisons.map((b) => b.prix - valeurTerres(b.agricole, prixT) - valeurBois(b.bois));
      hc = ajusterMaisons(x, y);
      // La précision, sur des ventes que l'ajustement n'a pas vues : cinq parts.
      const rapports: number[] = [];
      for (let part = 0; part < 5; part++) {
        const appris = maisons.map((_, i) => i).filter((i) => i % 5 !== part);
        const c = ajusterMaisons(appris.map((i) => x[i]), appris.map((i) => y[i]));
        if (!c) continue;
        maisons.forEach((b, i) => {
          if (i % 5 !== part) return;
          const estimation = c[0] * x[i][0] + c[1] * x[i][1] + valeurTerres(b.agricole, prixT) + valeurBois(b.bois);
          if (estimation > 0) rapports.push(b.prix / estimation);
        });
      }
      if (rapports.length >= MAISONS_MIN) {
        const r2 = (v: number) => Math.round(v * 100) / 100;
        precision = [r2(mediane(rapports.map((r) => Math.abs(r - 1)))!), r2(quantile(rapports, 0.25)), r2(quantile(rapports, 0.75))];
      }
    }
    if (!hc && !prixT && !prixB && !prixC) continue;
    sortie.set(code, [
      hc ? Math.round(hc[0]) : null,
      hc ? Math.round(hc[1] * 10) / 10 : null,
      prixC,
      prixT,
      prixB,
      [maisons.length, anneaux],
      precision,
      terres.length,
      bois.length,
      seul.length,
    ]);
  }
  return sortie;
}

/** Les voisines de chaque commune, d'après les contours que l'ingestion a déjà écrits. */
export function lireVoisines(sortie: string): (code: string) => string[] {
  const cache = new Map<string, Record<string, [unknown, string[]]> | null>();
  return (code) => {
    const dep = departementDe(code);
    if (!cache.has(dep)) {
      const p = join(sortie, 'dep', `${dep}-contours.json`);
      cache.set(dep, existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { c: Record<string, [unknown, string[]]> }).c : null);
    }
    return cache.get(dep)?.[code]?.[1] ?? [];
  };
}

/* ------------------------------------------------------------------ *
 * L'étiquette énergétique (voir `docs/07-risques.md`)
 * ------------------------------------------------------------------ */

const ETIQUETTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
/** Les étiquettes mesurées, D servant de référence. */
const MESUREES = ['A', 'B', 'C', 'E', 'F', 'G'];
/** Moins de cinq cents ventes rapprochées, et les écarts par étiquette ne tiennent pas. */
const DPE_MIN = 500;

/** Ce que pèse chaque étiquette, mesuré sur une région. */
export type EffetsDpe = {
  /** Le prix d'une maison de chaque étiquette, rapporté à celui d'une maison D. */
  multiplicateurs: Record<string, number>;
  /** Les ventes rapprochées d'un DPE, et leur nombre par étiquette. */
  ventes: number;
  repartition: Record<string, number>;
  /** L'écart médian de l'estimation, sans puis avec l'étiquette, sur ces ventes. */
  ecart: [number, number];
  /** Sur quel territoire l'effet est mesuré. */
  portee: string;
};

const metres = (a: number, b: number, c: number, d: number) =>
  6_371_000 * Math.hypot(((d - b) * Math.PI) / 180 * Math.cos((a * Math.PI) / 180), ((c - a) * Math.PI) / 180);
const jours = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86_400_000;
/** 30 m en latitude, et un peu plus : la fenêtre où chercher, dans des DPE rangés par latitude. */
const FENETRE = 0.0003;

/**
 * Une vente de maison et un DPE de maison de la même commune, à moins de 30 m,
 * établi dans les deux ans avant la vente, pour une surface à ±20 % ; le plus
 * proche s'il y en a plusieurs. Les DPE de la commune sont rangés par
 * latitude : on ne regarde que ceux de la bande où la vente se trouve — une
 * grande ville compte des dizaines de milliers de diagnostics.
 */
export function rapprocher(b: Bien, dpe: DpeMaison[] | undefined): string | null {
  if (!dpe || b.lat === null || b.lon === null || !b.jour) return null;
  let bas = 0;
  let haut = dpe.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (dpe[m][0] < b.lat - FENETRE) bas = m + 1;
    else haut = m;
  }
  let mieux: [number, string] | null = null;
  for (let i = bas; i < dpe.length && dpe[i][0] <= b.lat + FENETRE; i++) {
    const [lat, lon, e, s, jour] = dpe[i];
    const ecart = jours(b.jour, jour);
    if (ecart < 0 || ecart > 730 || Math.abs(s - b.habitable) > 0.2 * b.habitable) continue;
    const d = metres(b.lat, b.lon, lat, lon);
    if (d <= 30 && (!mieux || d < mieux[0])) mieux = [d, e];
  }
  return mieux?.[1] ?? null;
}

/** Résout A x = b, A symétrique de petite taille (pivot de Gauss). */
function resoudre(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((ligne, i) => [...ligne, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-10) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  return M.map((ligne, i) => ligne[n] / ligne[i]);
}

/**
 * Le prix en logarithme, avec un effet propre à chaque commune — ce qui ne
 * tient ni à la surface ni à l'étiquette, l'emplacement — retiré par
 * centrage commune par commune ; moindres carrés repondérés (Huber).
 * Rend les coefficients et l'effet de chaque commune.
 */
function ajusterLog(x: number[][], y: number[], groupes: string[]): { b: number[]; effets: Map<string, number> } | null {
  const k = x[0]?.length ?? 0;
  let w = y.map(() => 1);
  let b: number[] = new Array(k).fill(0);
  let effets = new Map<string, number>();
  for (let tour = 0; tour < 15; tour++) {
    const somme = new Map<string, { w: number; y: number; x: number[] }>();
    x.forEach((xi, i) => {
      const g = somme.get(groupes[i]) ?? somme.set(groupes[i], { w: 0, y: 0, x: new Array(k).fill(0) }).get(groupes[i])!;
      g.w += w[i];
      g.y += w[i] * y[i];
      xi.forEach((v, j) => (g.x[j] += w[i] * v));
    });
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const B = new Array(k).fill(0);
    x.forEach((xi, i) => {
      const g = somme.get(groupes[i])!;
      const xc = xi.map((v, j) => v - g.x[j] / g.w);
      const yc = y[i] - g.y / g.w;
      for (let a = 0; a < k; a++) {
        B[a] += w[i] * xc[a] * yc;
        for (let c = 0; c < k; c++) A[a][c] += w[i] * xc[a] * xc[c];
      }
    });
    const sol = resoudre(A, B);
    if (!sol) return null;
    b = sol;
    effets = new Map([...somme].map(([g, v]) => [g, (v.y - b.reduce((s, bj, j) => s + bj * v.x[j], 0)) / v.w]));
    const r = y.map((v, i) => v - effets.get(groupes[i])! - b.reduce((s, bj, j) => s + bj * x[i][j], 0));
    const echelle = (mediane(r.map(Math.abs)) ?? 1) / 0.6745 || 1;
    const seuil = 1.345 * echelle;
    w = r.map((v) => (Math.abs(v) <= seuil ? 1 : seuil / Math.abs(v)));
  }
  return { b, effets };
}

/** L'écart médian entre estimation et prix, sur des ventes que l'ajustement n'a pas vues (cinq parts). */
function ecartCroise(x: number[][], y: number[], groupes: string[]): number | null {
  const ecarts: number[] = [];
  for (let part = 0; part < 5; part++) {
    const appris = y.map((_, i) => i).filter((i) => i % 5 !== part);
    const m = ajusterLog(appris.map((i) => x[i]), appris.map((i) => y[i]), appris.map((i) => groupes[i]));
    if (!m) continue;
    y.forEach((v, i) => {
      if (i % 5 !== part || !m.effets.has(groupes[i])) return;
      const p = m.effets.get(groupes[i])! + m.b.reduce((s, bj, j) => s + bj * x[i][j], 0);
      ecarts.push(Math.abs(Math.exp(p - v) - 1));
    });
  }
  return ecarts.length ? mediane(ecarts) : null;
}

/** L'effet de chaque étiquette sur un ensemble de ventes de maisons, ou null s'il y en a trop peu à rapprocher. */
export function mesurerDpe(biens: Bien[], dpe: Map<string, DpeMaison[]>, portee: string): EffetsDpe | null {
  for (const l of dpe.values()) l.sort((a, b) => a[0] - b[0]);
  const lignes: { b: Bien; e: string }[] = [];
  for (const b of biens) {
    if (!(b.habitable > 0) || b.activite > 0) continue;
    const e = rapprocher(b, dpe.get(b.commune));
    if (e) lignes.push({ b, e });
  }
  if (lignes.length < DPE_MIN) return null;
  const base = lignes.map(({ b }) => [Math.log(b.habitable), Math.log1p(b.constructible + b.agricole + b.bois)]);
  const avec = lignes.map(({ e }, i) => [...base[i], ...MESUREES.map((m) => (m === e ? 1 : 0))]);
  const y = lignes.map(({ b }) => Math.log(b.prix));
  const groupes = lignes.map(({ b }) => b.commune);
  const m = ajusterLog(avec, y, groupes);
  if (!m) return null;
  const multiplicateurs: Record<string, number> = { D: 1 };
  MESUREES.forEach((e, j) => (multiplicateurs[e] = Math.round(Math.exp(m.b[2 + j]) * 1000) / 1000));
  const repartition = Object.fromEntries(ETIQUETTES.map((e) => [e, lignes.filter((l) => l.e === e).length]));
  const r2 = (v: number | null) => Math.round((v ?? 0) * 100) / 100;
  return { multiplicateurs, ventes: lignes.length, repartition, ecart: [r2(ecartCroise(base, y, groupes)), r2(ecartCroise(avec, y, groupes))], portee };
}

/**
 * Le multiplicateur moyen des maisons d'une commune, d'après les étiquettes
 * de ses diagnostics (`dep/XX-dpe.json`) : le prix d'une maison D, c'est le
 * prix estimé divisé par lui. Sous vingt diagnostics, ceux du département.
 */
function melanges(sortie: string, dep: string, mult: Record<string, number>): Map<string, number> {
  const p = join(sortie, 'dep', `${dep}-dpe.json`);
  if (!existsSync(p)) return new Map();
  const f = JSON.parse(readFileSync(p, 'utf8')) as { dep: number[]; c: Record<string, number[]> };
  const moyenne = (n: number[]) => {
    const total = n.reduce((a, b) => a + b, 0);
    return total ? ETIQUETTES.reduce((s, e, i) => s + (n[i] / total) * mult[e], 0) : 1;
  };
  const duDep = moyenne(f.dep);
  return new Map(Object.entries(f.c).map(([code, n]) => [code, Math.round((n.reduce((a, b) => a + b, 0) >= 20 ? moyenne(n) : duDep) * 1000) / 1000]));
}

/**
 * L'effet de l'étiquette, mesuré région par région sur les ventes de ses
 * départements : assez de ventes rapprochées partout, et un marché moins
 * disparate que la France entière. Une région n'est mesurée que si les DPE de
 * tous ses départements sont en cache — sinon l'effet dirait « région » sur
 * une partie seulement. Rend l'effet de chaque département.
 */
function effetsParRegion(sortie: string, biens: Bien[], deps: string[], cache: string): Map<string, EffetsDpe> {
  const meta = JSON.parse(readFileSync(join(sortie, 'meta.json'), 'utf8')) as { regions: Record<string, string>; codesRegion: Record<string, string> };
  const regions = new Map<string, string[]>();
  for (const dep of deps) {
    const r = meta.codesRegion[dep];
    if (r) (regions.get(r) ?? regions.set(r, []).get(r)!).push(dep);
  }
  const effets = new Map<string, EffetsDpe>();
  for (const membres of regions.values()) {
    if (!membres.every((d) => existsSync(fichierCache(cache, d)))) continue;
    const diagnostics = new Map<string, DpeMaison[]>();
    for (const d of membres)
      for (const [code, l] of Object.entries(JSON.parse(readFileSync(fichierCache(cache, d), 'utf8')) as Record<string, DpeMaison[]>)) diagnostics.set(code, l);
    const dansRegion = new Set(membres);
    const e = mesurerDpe(biens.filter((b) => dansRegion.has(departementDe(b.commune))), diagnostics, `région ${meta.regions[membres[0]]}`);
    if (e) for (const d of membres) effets.set(d, e);
  }
  return effets;
}

export function ecrireEstimation(sortie: string, biens: Bien[], annees: number[], maj: string, cache?: string): number {
  const estimations = estimer(biens, lireVoisines(sortie));
  const parDep = new Map<string, Record<string, Estimation>>();
  for (const [code, e] of [...estimations].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dep = departementDe(code);
    (parDep.get(dep) ?? parDep.set(dep, {}).get(dep)!)[code] = e;
  }
  const dossier = join(sortie, 'simulateurs', 'estimation');
  mkdirSync(dossier, { recursive: true });
  const deps = [...parDep.keys()].filter((dep) => existsSync(join(sortie, 'dep', `${dep}.json`)));
  const effets = cache ? effetsParRegion(sortie, biens, deps, cache) : new Map<string, EffetsDpe>();
  let n = 0;
  for (const dep of deps) {
    const c = parDep.get(dep)!;
    const dpe = effets.get(dep) ?? null;
    if (dpe) {
      const m = melanges(sortie, dep, dpe.multiplicateurs);
      for (const [code, e] of Object.entries(c)) e[10] = m.get(code) ?? null;
    }
    writeFileSync(join(dossier, `${dep}.json`), JSON.stringify({ maj, annees, tailles: TAILLES, partActivite: PART_ACTIVITE, dpe, c }));
    n++;
  }
  return n;
}
