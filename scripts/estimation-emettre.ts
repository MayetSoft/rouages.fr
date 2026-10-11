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
  return { commune: communeDe([...communes][0]), prix, habitable, activite, constructible, agricole, bois };
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

export function ecrireEstimation(sortie: string, biens: Bien[], annees: number[], maj: string): number {
  const estimations = estimer(biens, lireVoisines(sortie));
  const parDep = new Map<string, Record<string, Estimation>>();
  for (const [code, e] of [...estimations].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dep = departementDe(code);
    (parDep.get(dep) ?? parDep.set(dep, {}).get(dep)!)[code] = e;
  }
  const dossier = join(sortie, 'simulateurs', 'estimation');
  mkdirSync(dossier, { recursive: true });
  let n = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(join(dossier, `${dep}.json`), JSON.stringify({ maj, annees, tailles: TAILLES, partActivite: PART_ACTIVITE, c }));
    n++;
  }
  return n;
}
