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
 * chaque page), point par point. Un point que Rouages sait faux est remplacé
 * par celui de `contenu/corrections-kohesio.yaml`, et seulement si ce nouveau
 * point tombe bien dans la commune que la correction déclare : sinon la
 * collecte échoue, et l'ingestion précédente reste en place. Chaque projet
 * garde son point, pour que la page dise d'où vient la localisation et la
 * montre sur une carte.
 *
 * Lancé seul — `npx tsx scripts/europe-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-europe.json`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerGraphe } from '../src/modele/graphe.ts';
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

/**
 * Une localisation corrigée par Rouages : les sources [titre court, adresse],
 * le constat, le point qu'avait donné Kohesio s'il en avait un, et la date à
 * laquelle l'erreur lui a été signalée, s'il l'a été.
 */
export type Correction = { s: [string, string][]; c: string; k: [number, number] | null; d?: string };

/**
 * [nom, fonds, part de l'Union, coût total éligible, taux de cofinancement,
 * début, fin, identifiant Kohesio, autorité de gestion — ou programme, pour
 * 2021-2027 —, latitude, longitude, correction ou 0 — le point est alors
 * celui de Kohesio —, et le nombre de communes quand le projet en a plusieurs]
 */
export type Projet = [string, string, number, number, number, string, string, string, string, number, number, Correction | 0, number?];

/** Au mètre près : c'est assez pour une carte, et le fichier reste léger. */
const arrondi = (v: number) => Math.round(v * 1e5) / 1e5;

export interface EuropeCommune {
  /** Nombre de projets propres à la commune, part de l'Union, coût total éligible. */
  n: number;
  ue: number;
  total: number;
  /** Par fonds : [libellé, projets, part de l'Union]. */
  f: [string, number, number][];
  /** Les projets partagés avec d'autres communes : listés, mais hors des totaux. */
  m?: number;
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

/* --- les corrections et le regroupement --------------------------------- */

type Corrections = Map<string, { lat: number; lon: number; correction: Correction }>;

/**
 * Les corrections de `contenu/corrections-kohesio.yaml`, chacune vérifiée :
 * son point doit tomber dans la commune qu'elle déclare, sinon la collecte
 * s'arrête — avant tout téléchargement.
 */
function chargerCorrections(commune: (lon: number, lat: number) => string | null): Corrections {
  const graphe = chargerGraphe();
  const corrections: Corrections = new Map();
  for (const c of graphe.correctionsKohesio.values()) {
    const ou = commune(c.lon, c.lat);
    if (ou !== c.commune) {
      throw new Error(
        `correction Kohesio ${c.id} : le point ${c.lat}, ${c.lon} tombe dans ${ou ?? 'aucune commune'}, ` +
          `pas dans ${c.commune} comme le déclare contenu/corrections-kohesio.yaml`,
      );
    }
    const s = c.liens.map((id): [string, string] => {
      const src = graphe.sources.get(id)!;
      return [src.titre.split(' — ')[0], src.url];
    });
    corrections.set(c.id, {
      lat: c.lat,
      lon: c.lon,
      correction: { s, c: c.constat, k: null, ...(c.signale_le ? { d: c.signale_le.toISOString().slice(0, 10) } : {}) },
    });
  }
  return corrections;
}

/**
 * Les projets de chaque commune, rangés des plus gros aux plus petits, avec
 * leurs totaux. Un projet réparti sur plusieurs communes y figure partout,
 * mais ses montants ne s'ajoutent à aucun total : la base ne dit pas quelle
 * part revient à chaque lieu.
 */
function agreger(brut: Map<string, Projet[]>): Map<string, EuropeCommune> {
  const communes = new Map<string, EuropeCommune>();
  for (const [code, l] of brut) {
    l.sort((a, b) => b[2] - a[2]);
    const comptes = l.filter((p) => !p[12]);
    const f = new Map<string, [number, number]>();
    for (const p of comptes) {
      const v = f.get(p[1]) ?? [0, 0];
      f.set(p[1], [v[0] + 1, v[1] + p[2]]);
    }
    const partages = l.length - comptes.length;
    communes.set(code, {
      n: comptes.length,
      ue: comptes.reduce((s, p) => s + p[2], 0),
      total: comptes.reduce((s, p) => s + p[3], 0),
      f: [...f].sort((a, b) => b[1][1] - a[1][1]).map(([nom, [n, ue]]) => [nom, n, ue]),
      ...(partages ? { m: partages } : {}),
      p: l.slice(0, LISTES),
    });
  }
  return communes;
}

/* --- la collecte -------------------------------------------------------- */

export async function collecterEurope(
  lireJson: (url: string) => Promise<unknown>,
  sortie: string,
  dire: (m: string) => void,
): Promise<{ maj: string; communes: Map<string, EuropeCommune> } | null> {
  const commune = indexerContours(sortie);

  // Les corrections d'abord, avant tout téléchargement : chacune doit tomber dans la commune qu'elle déclare.
  const corrections = chargerCorrections(commune);
  const appliquees = new Set<string>();

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

  const brut = new Map<string, Projet[]>();
  let localisees = 0;
  let horsCommune = 0;
  for (const l of lignes) {
    const id = /\/(Q\d+)$/.exec(l.operation_unique_identifier?.url ?? '')?.[1] ?? '';
    const [latK, lonK] = (l.location_indicator_latitude_longitude ?? '').split(',').map(Number);
    const kohesio: [number, number] | null = Number.isFinite(latK) && Number.isFinite(lonK) ? [arrondi(latK), arrondi(lonK)] : null;
    const corrige = corrections.get(id);
    if (corrige) {
      appliquees.add(id);
      // Kohesio a corrigé de son côté : la correction n'a plus d'objet, et elle se retire.
      if (kohesio && commune(kohesio[1], kohesio[0]) === commune(corrige.lon, corrige.lat)) {
        dire(`Fonds européens : Kohesio place désormais ${id} dans la bonne commune — retirer sa correction de contenu/corrections-kohesio.yaml.`);
      }
    }
    const lat = corrige ? corrige.lat : latK;
    const lon = corrige ? corrige.lon : lonK;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    localisees++;
    const code = commune(lon, lat);
    if (!code) {
      horsCommune++;
      continue;
    }
    const nom = (l.operation_name_programme_language ?? '').replace(/\s+/g, ' ').trim();
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
      arrondi(lat),
      arrondi(lon),
      corrige ? { ...corrige.correction, k: kohesio } : 0,
    ]);
  }
  for (const id of corrections.keys()) {
    if (!appliquees.has(id)) dire(`Fonds européens : la correction ${id} ne vise aucun projet de la base — à vérifier.`);
  }
  const communes = agreger(brut);
  dire(
    `Fonds européens 2014-2020 (Kohesio) : ${lignes.length.toLocaleString('fr-FR')} opérations, ` +
      `${localisees.toLocaleString('fr-FR')} localisées, rattachées à ${communes.size.toLocaleString('fr-FR')} communes` +
      (horsCommune ? ` (${horsCommune.toLocaleString('fr-FR')} hors de tout contour)` : '') +
      `, ${appliquees.size} localisation${appliquees.size > 1 ? 's' : ''} corrigée${appliquees.size > 1 ? 's' : ''}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireEurope(sortie: string, e: { maj: string; communes: Map<string, EuropeCommune> }): number {
  return ecrireParDepartement(sortie, 'europe', e.communes, () => ({ maj: e.maj, periode: '2014-2020' }));
}

/* --- 2021-2027 : l'API de Kohesio ---------------------------------------- */

/**
 * La période 2021-2027 n'est pas encore sur cohesiondata : on la lit dans
 * l'API publique dont se sert le site de Kohesio, programme par programme
 * puis fonds par fonds. Son contenu relève de la mention légale de la
 * Commission, à laquelle renvoie Kohesio : CC BY 4.0, source citée.
 *
 * La base donne désormais le nom du bénéficiaire — l'article 49 du
 * règlement (UE) 2021/1060 l'impose — mais pas son numéro SIREN : on ne sait
 * pas distinguer une entreprise d'un entrepreneur individuel, ni appliquer
 * ses oppositions. Le site ne le reprend donc pas.
 */
export const API_KOHESIO = 'https://kohesio.ec.europa.eu/api';
const ENTITE = 'https://linkedopendata.eu/entity/';
const FRANCE = `${ENTITE}Q20`;
const PERIODE_2127 = `${ENTITE}Q7333082`;
const PAR_PAGE_API = 1000;

type ProjetApi = {
  item: string;
  labels?: string[];
  startTimes?: string[];
  endTimes?: string[];
  euBudgets?: string[];
  totalBudgets?: string[];
  /** « longitude,latitude », un par lieu. */
  coordinates?: string[];
};

const FONDS_2127: Record<string, string> = {
  ERDF: 'FEDER',
  'ESF+': 'FSE+',
  JTF: 'FTJ',
  CF: 'Fonds de cohésion',
};

/** « 31500000,00 » → 31500000 */
const montant = (v: string | undefined) => Math.round(Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0);

async function toutesLesPages(lireJson: (url: string) => Promise<unknown>, filtres: string): Promise<ProjetApi[]> {
  const tout: ProjetApi[] = [];
  for (let offset = 0; ; offset += PAR_PAGE_API) {
    const page = (await lireJson(
      `${API_KOHESIO}/projects?language=fr&country=${encodeURIComponent(FRANCE)}` +
        `&programmingPeriod=${encodeURIComponent(PERIODE_2127)}${filtres}&limit=${PAR_PAGE_API}&offset=${offset}`,
    )) as { list?: ProjetApi[]; numberResults?: number };
    const l = page.list ?? [];
    tout.push(...l);
    if (l.length < PAR_PAGE_API || tout.length >= (page.numberResults ?? 0)) break;
  }
  return tout;
}

export async function collecterEurope2127(
  lireJson: (url: string) => Promise<unknown>,
  sortie: string,
  dire: (m: string) => void,
): Promise<{ maj: string; communes: Map<string, EuropeCommune> } | null> {
  const commune = indexerContours(sortie);
  const corrections = chargerCorrections(commune);
  const q = (u: string) => encodeURIComponent(u);

  // Le programme de chaque projet, puis son fonds : la liste de l'API ne donne ni l'un ni l'autre.
  const programmes = (await lireJson(
    `${API_KOHESIO}/queries/programs?language=fr&country=${q(FRANCE)}&programmingPeriod=${q(PERIODE_2127)}`,
  )) as { instance: string; instanceLabel: string }[];
  const projets = new Map<string, ProjetApi>();
  const programmeDe = new Map<string, string>();
  for (const p of programmes) {
    const libelle = p.instanceLabel.replace(/^\S+\s+-\s+/, '').replace(/\s+\d{4}-\d{4}$/, '').trim();
    for (const x of await toutesLesPages(lireJson, `&program=${q(p.instance)}`)) {
      projets.set(x.item, x);
      programmeDe.set(x.item, libelle);
    }
  }
  const fonds = (await lireJson(`${API_KOHESIO}/queries/funds?language=fr&programmingPeriod=${q(PERIODE_2127)}`)) as {
    instance: string;
    instanceLabel: string;
  }[];
  const fondsDe = new Map<string, string>();
  for (const f of fonds) {
    const code = f.instanceLabel.split(' - ')[0].trim();
    if (!FONDS_2127[code]) continue;
    for (const x of await toutesLesPages(lireJson, `&fund=${q(f.instance)}`)) {
      fondsDe.set(x.item, FONDS_2127[code]);
      if (!projets.has(x.item)) projets.set(x.item, x);
    }
  }
  if (projets.size < 1_000) {
    dire(`Fonds européens 2021-2027 : ${projets.size} projets seulement, on garde l’ingestion précédente.`);
    return null;
  }

  const brut = new Map<string, Projet[]>();
  const appliquees = new Set<string>();
  let localises = 0;
  let partages = 0;
  for (const x of projets.values()) {
    const corrige = corrections.get(x.item);
    const points: [number, number][] = corrige
      ? [[corrige.lat, corrige.lon]]
      : (x.coordinates ?? [])
          .map((c) => c.split(',').map(Number))
          .filter(([lon, lat]) => Number.isFinite(lat) && Number.isFinite(lon))
          .map(([lon, lat]) => [lat, lon]);
    if (corrige) appliquees.add(x.item);
    // Un point par commune : le premier qui y tombe.
    const parCommune = new Map<string, [number, number]>();
    for (const [lat, lon] of points) {
      const code = commune(lon, lat);
      if (code && !parCommune.has(code)) parCommune.set(code, [lat, lon]);
    }
    if (parCommune.size === 0) continue;
    localises++;
    if (parCommune.size > 1) partages++;
    const nom = (x.labels?.[0] ?? '').replace(/\s+/g, ' ').trim();
    const ue = montant(x.euBudgets?.[0]);
    const total = montant(x.totalBudgets?.[0]);
    const premier = (x.coordinates ?? [])[0]?.split(',').map(Number);
    for (const [code, [lat, lon]] of parCommune) {
      if (!brut.has(code)) brut.set(code, []);
      brut.get(code)!.push([
        nom.length > MAX_NOM ? `${nom.slice(0, MAX_NOM - 1)}…` : nom,
        fondsDe.get(x.item) ?? 'autre instrument',
        ue,
        total,
        total > 0 ? Math.round((ue / total) * 1000) / 10 : 0,
        (x.startTimes?.[0] ?? '').slice(0, 10),
        (x.endTimes?.[0] ?? '').slice(0, 10),
        x.item,
        programmeDe.get(x.item) ?? '',
        arrondi(lat),
        arrondi(lon),
        corrige
          ? { ...corrige.correction, k: premier && Number.isFinite(premier[1]) ? [arrondi(premier[1]), arrondi(premier[0])] : null }
          : 0,
        ...(parCommune.size > 1 ? [parCommune.size] : []),
      ] as Projet);
    }
  }
  const communes = agreger(brut);
  dire(
    `Fonds européens 2021-2027 (Kohesio) : ${projets.size.toLocaleString('fr-FR')} projets, ` +
      `${localises.toLocaleString('fr-FR')} localisés dans ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${partages.toLocaleString('fr-FR')} sur plusieurs communes` +
      (appliquees.size ? `, ${appliquees.size} localisation${appliquees.size > 1 ? 's' : ''} corrigée${appliquees.size > 1 ? 's' : ''}` : '') +
      '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireEurope2127(sortie: string, e: { maj: string; communes: Map<string, EuropeCommune> }): number {
  return ecrireParDepartement(sortie, 'europe21', e.communes, () => ({ maj: e.maj, periode: '2021-2027' }));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(join(sortie, 'dep'))) throw new Error('public/territoires/dep absent');
  const e = await collecterEurope(lireJson, sortie, console.log);
  if (e) console.log(`${ecrireEurope(sortie, e)} départements écrits (2014-2020).`);
  const e21 = await collecterEurope2127(lireJson, sortie, console.log);
  if (e21) console.log(`${ecrireEurope2127(sortie, e21)} départements écrits (2021-2027).`);
}
