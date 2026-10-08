/**
 * Les projets que l'Union européenne a cofinancés dans chaque commune, au
 * titre de la politique de cohésion 2014-2020 — FEDER, FSE, Initiative pour
 * l'emploi des jeunes —, d'après Kohesio, la base que la Commission tient à
 * partir des listes d'opérations des autorités de gestion (les régions,
 * l'État). Publiée sur cohesiondata.ec.europa.eu, sous licence CC0.
 *
 * **Ce que la base ne dit pas, et que la page dit.**
 * - Pour la France, aucun nom de bénéficiaire n'y figure (0 sur 43 942
 *   opérations relevées le 8 octobre 2026) : le site montre le projet, son
 *   fonds, son coût et la part de l'Union, pas qui l'a porté.
 * - Seules 24 900 opérations françaises sur 43 942 ont des coordonnées : les
 *   autres — souvent des actions régionales ou de formation — ne se
 *   rattachent à aucune commune et ne sont pas comptées ici.
 * - Les coordonnées sont celles que déclare l'autorité de gestion : le lieu
 *   du projet, ou l'adresse de qui le porte. Une formation suivie dans tout
 *   le département peut tomber sur la commune de l'organisme.
 * - La période 2021-2027 n'est pas encore dans ce jeu ; elle arrive dans
 *   Kohesio au fil des listes publiées par les régions.
 *
 * Le rattachement à la commune se fait par ses contours (ceux de la carte de
 * chaque page), point par point.
 *
 * Lancé seul — `npx tsx scripts/europe-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-europe.json`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

export const JEU = 'https://cohesiondata.ec.europa.eu/resource/557j-pmg8.json';
const CHAMPS = [
  'operation_unique_identifier',
  'operation_name_programme_language',
  'operation_start_date',
  'operation_end_date',
  'cofinancing_rate',
  'total_eligible_expenditure_amount',
  'project_eu_budget',
  'location_indicator_latitude_longitude',
  'category_label',
  'fund_code',
  'programme_name',
  'managingauthority',
];
const PAR_PAGE = 50_000;
/** Les projets listés par commune, des plus gros aux plus petits ; les totaux, eux, portent sur tout. */
const LISTES = 30;
const MAX_NOM = 140;

export const FONDS: Record<string, string> = {
  ERDF: 'FEDER',
  ESF: 'FSE',
  YEI: 'IEJ',
  CF: 'Fonds de cohésion',
  'ERDF|ESF': 'FEDER et FSE',
};

type Ligne = {
  operation_unique_identifier?: { url?: string };
  operation_name_programme_language?: string;
  operation_start_date?: string;
  operation_end_date?: string;
  cofinancing_rate?: string;
  total_eligible_expenditure_amount?: string;
  project_eu_budget?: string;
  location_indicator_latitude_longitude?: string;
  category_label?: string;
  fund_code?: string;
  programme_name?: string;
  managingauthority?: string;
};

/** [nom, fonds, part de l'Union, coût total éligible, taux de cofinancement, début, fin, identifiant Kohesio, autorité de gestion] */
export type Projet = [string, string, number, number, number, string, string, string, string];

export interface EuropeCommune {
  /** Nombre de projets, part de l'Union, coût total éligible. */
  n: number;
  ue: number;
  total: number;
  /** Par fonds : [libellé, projets, part de l'Union]. */
  f: [string, number, number][];
  /** Les plus gros. */
  p: Projet[];
}

/* --- le rattachement par les contours -------------------------------- */

type Anneau = [number, number][];
type Contour = { code: string; anneaux: Anneau[]; bbox: [number, number, number, number] };

function decoder(r: number[]): Anneau {
  const s: Anneau = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < r.length; i += 2) {
    x += r[i];
    y += r[i + 1];
    s.push([x, y]);
  }
  return s;
}

/** Pair-impair : un point dans un trou n'est pas dans la commune. */
function dedans(x: number, y: number, anneaux: Anneau[]): boolean {
  let pris = false;
  for (const a of anneaux) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i];
      const [xj, yj] = a[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) pris = !pris;
    }
  }
  return pris;
}

/** Les contours de toutes les communes, rangés dans une grille d'un degré. */
export function indexerContours(sortie: string): (lon: number, lat: number) => string | null {
  const dossier = join(sortie, 'dep');
  const grille = new Map<string, Contour[]>();
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('-contours.json'))) {
    const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { c: Record<string, [number[][], ...unknown[]]> };
    for (const [code, [anneaux]] of Object.entries(d.c)) {
      const a = anneaux.map(decoder);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const r of a) for (const [x, y] of r) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      const c: Contour = { code, anneaux: a, bbox: [x0, y0, x1, y1] };
      for (let gx = Math.floor(x0 / 1e4); gx <= Math.floor(x1 / 1e4); gx++) {
        for (let gy = Math.floor(y0 / 1e4); gy <= Math.floor(y1 / 1e4); gy++) {
          const k = `${gx}|${gy}`;
          if (!grille.has(k)) grille.set(k, []);
          grille.get(k)!.push(c);
        }
      }
    }
  }
  if (grille.size === 0) throw new Error('aucun contour de commune : lancer d’abord scripts/contours-emettre.ts');
  return (lon, lat) => {
    const x = Math.round(lon * 1e4);
    const y = Math.round(lat * 1e4);
    for (const c of grille.get(`${Math.floor(x / 1e4)}|${Math.floor(y / 1e4)}`) ?? []) {
      const [x0, y0, x1, y1] = c.bbox;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (dedans(x, y, c.anneaux)) return c.code;
    }
    return null;
  };
}

/* --- la collecte -------------------------------------------------------- */

export async function collecterEurope(
  lireJson: (url: string) => Promise<unknown>,
  sortie: string,
  dire: (m: string) => void,
): Promise<{ maj: string; communes: Map<string, EuropeCommune> } | null> {
  const lignes: Ligne[] = [];
  for (let offset = 0; ; offset += PAR_PAGE) {
    const page = (await lireJson(
      `${JEU}?$select=${CHAMPS.join(',')}&$where=${encodeURIComponent("country='France'")}` +
        `&$order=${encodeURIComponent(':id')}&$limit=${PAR_PAGE}&$offset=${offset}`,
    )) as Ligne[];
    lignes.push(...page);
    if (page.length < PAR_PAGE) break;
  }
  if (lignes.length < 10_000) {
    dire(`Fonds européens : ${lignes.length} opérations seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const commune = indexerContours(sortie);
  const brut = new Map<string, Projet[]>();
  let localisees = 0;
  let horsCommune = 0;
  for (const l of lignes) {
    const [lat, lon] = (l.location_indicator_latitude_longitude ?? '').split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    localisees++;
    const code = commune(lon, lat);
    if (!code) {
      horsCommune++;
      continue;
    }
    const nom = (l.operation_name_programme_language ?? '').replace(/\s+/g, ' ').trim();
    const id = /\/(Q\d+)$/.exec(l.operation_unique_identifier?.url ?? '')?.[1] ?? '';
    if (!brut.has(code)) brut.set(code, []);
    brut.get(code)!.push([
      nom.length > MAX_NOM ? `${nom.slice(0, MAX_NOM - 1)}…` : nom,
      FONDS[l.fund_code ?? ''] ?? (l.fund_code ?? ''),
      Math.round(Number(l.project_eu_budget) || 0),
      Math.round(Number(l.total_eligible_expenditure_amount) || 0),
      Number(l.cofinancing_rate) || 0,
      (l.operation_start_date ?? '').slice(0, 10),
      (l.operation_end_date ?? '').slice(0, 10),
      id,
      (l.managingauthority ?? '').trim(),
    ]);
  }
  const communes = new Map<string, EuropeCommune>();
  for (const [code, l] of brut) {
    l.sort((a, b) => b[2] - a[2]);
    const f = new Map<string, [number, number]>();
    for (const p of l) {
      const v = f.get(p[1]) ?? [0, 0];
      f.set(p[1], [v[0] + 1, v[1] + p[2]]);
    }
    communes.set(code, {
      n: l.length,
      ue: l.reduce((s, p) => s + p[2], 0),
      total: l.reduce((s, p) => s + p[3], 0),
      f: [...f].sort((a, b) => b[1][1] - a[1][1]).map(([nom, [n, ue]]) => [nom, n, ue]),
      p: l.slice(0, LISTES),
    });
  }
  dire(
    `Fonds européens 2014-2020 (Kohesio) : ${lignes.length.toLocaleString('fr-FR')} opérations, ` +
      `${localisees.toLocaleString('fr-FR')} localisées, rattachées à ${communes.size.toLocaleString('fr-FR')} communes` +
      (horsCommune ? ` (${horsCommune.toLocaleString('fr-FR')} hors de tout contour)` : '') +
      '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireEurope(sortie: string, e: { maj: string; communes: Map<string, EuropeCommune> }): number {
  return ecrireParDepartement(sortie, 'europe', e.communes, () => ({ maj: e.maj, periode: '2014-2020' }));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(join(sortie, 'dep'))) throw new Error('public/territoires/dep absent');
  const e = await collecterEurope(lireJson, sortie, console.log);
  if (e) console.log(`${ecrireEurope(sortie, e)} départements écrits.`);
}
