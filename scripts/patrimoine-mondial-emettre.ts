/**
 * Les biens du patrimoine mondial qui touchent chaque commune.
 *
 * **La liste** est celle de l'UNESCO, publiée en données ouvertes
 * (data.unesco.org, jeu `whc001`, CC BY-SA 4.0) : le numéro du bien, son nom
 * français, sa catégorie — culturel, naturel, mixte —, l'année d'inscription
 * et, pour la plupart, ses éléments avec leurs coordonnées. Un élément situé
 * dans une commune la rattache au bien. C'est une couverture nationale, mais
 * ponctuelle : un bien étendu, comme le Val de Loire, n'a qu'un point, et les
 * Chemins de Saint-Jacques n'en ont aucun dans le jeu.
 *
 * **Les périmètres**, quand un service de l'État ou une collectivité les
 * publie, disent davantage : la commune est dans le bien, ou dans sa zone
 * tampon, que le préfet de région délimite autour de lui. Il n'existe pas de
 * couche nationale ; les sources régionales lisibles sont dans `PERIMETRES`,
 * chacune rattachée au numéro UNESCO du bien — par un champ quand elle en a
 * un, sinon par le nom. Une entité qu'on ne sait pas rattacher est écartée et
 * comptée.
 *
 * Une commune est retenue par un périmètre comme par les espaces naturels :
 * un point de sa grille à plus de 50 m de sa limite tombe dedans, ou trois
 * sommets du périmètre, ou, pour un petit périmètre, son centre.
 *
 * Écrit `public/territoires/patrimoine-mondial.json`, que seul le build lit.
 * Lancé seul — `npx tsx scripts/patrimoine-mondial-emettre.ts` —, il relit
 * les contours des communes déjà écrits.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BienMondial, PatrimoineMondial, RattachementMondial } from '../src/modele/patrimoine-mondial.ts';
import { anneauxDe, cadreDe, contoursDesCommunes, dedans, distanceAuBord, ECHELLE, type Entite } from './espaces-emettre.ts';
import { telechargerSiAbsent } from './par-departement.ts';

type LireJson = (url: string) => Promise<unknown>;
type Proprietes = Record<string, string | number | null | undefined>;

const LISTE = 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001';

/** Ce qu'une entité régionale dit d'elle-même : le bien (numéro ou nom), la zone, l'élément. */
type Lecture = { unesco: number | null; nom: string | null; zone: 'bien' | 'tampon'; element: string | null };

interface Perimetre {
  id: string;
  producteur: string;
  licence: 'licence-ouverte-2.0' | 'non-precisee';
  url: string;
  lire: (p: Proprietes) => Lecture;
}

const texte = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const numero = (v: unknown) => (/^\d+$/.test(texte(v)) ? Number(texte(v)) : null);
const element = (v: unknown) => {
  const t = texte(v);
  return t && t !== '/' ? t.replace(/\*$/, '') : null;
};

/** Les sources régionales lisibles en GeoJSON, en WGS 84. Les autres (Normandie, PACA en GML, Bourgogne-Franche-Comté et Bassin minier en Shapefile) restent à brancher. */
export const PERIMETRES: Perimetre[] = [
  {
    id: 'occitanie-biens',
    producteur: 'DREAL Occitanie',
    licence: 'non-precisee',
    url: 'https://catalogue.picto-occitanie.fr/api/data/3359f165-d55d-42a4-a7fd-abfbd4a34cb4?srs=EPSG:4326',
    lire: (p) => ({ unesco: numero(p.c_unesco), nom: texte(p.n_unesco) || null, zone: 'bien', element: element(p.n_serie) }),
  },
  {
    id: 'occitanie-tampons',
    producteur: 'DREAL Occitanie',
    licence: 'non-precisee',
    url: 'https://catalogue.picto-occitanie.fr/api/data/fed755b8-d97e-4a91-a4e1-aa82f6acc48c?srs=EPSG:4326',
    lire: (p) => ({ unesco: numero(p.c_unesco), nom: texte(p.n_unesco) || null, zone: 'tampon', element: null }),
  },
  {
    id: 'bretagne',
    producteur: 'DREAL Bretagne',
    licence: 'licence-ouverte-2.0',
    url: 'https://geobretagne.fr/geoserver/dreal_b/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=dreal_b:Unesco_BPM&outputFormat=application/json&srsName=EPSG:4326',
    lire: (p) => ({
      unesco: Number(/\/list\/(\d+)/.exec(texte(p.URL_UNESCO))?.[1]) || null,
      nom: texte(p.NOM_SITE) || null,
      zone: /tampon/i.test(texte(p.TYPE_ZONE)) ? 'tampon' : 'bien',
      element: element(p.AIRE_NOM),
    }),
  },
  {
    id: 'nouvelle-aquitaine',
    producteur: 'DREAL Nouvelle-Aquitaine',
    licence: 'non-precisee',
    url: 'https://catalogue.sigena.fr/api/data/01fc5e30-d0be-42e7-ad74-644faaffabfa?srs=EPSG:4326',
    lire: (p) => {
      const ensemble = texte(p.nom_ensemb);
      const bien = texte(p.nom_bien);
      return { unesco: null, nom: ensemble || bien || null, zone: 'bien', element: bien && bien !== ensemble ? bien : null };
    },
  },
  {
    id: 'vichy-bien',
    producteur: 'Vichy Communauté',
    licence: 'licence-ouverte-2.0',
    url: 'https://ids.craig.fr/wxs/public/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=public:VVA_2021_PERIMETRE_UNESCO&outputFormat=application/json&srsName=EPSG:4326',
    // « Vichy, grande ville d'eaux d'Europe » : l'élément vichyssois du bien 1613.
    lire: () => ({ unesco: 1613, nom: null, zone: 'bien', element: 'Vichy' }),
  },
  {
    id: 'vichy-tampon',
    producteur: 'Vichy Communauté',
    licence: 'licence-ouverte-2.0',
    url: 'https://ids.craig.fr/wxs/public/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=public:VVA_2021_ZONE_TAMPON_UNESCO&outputFormat=application/json&srsName=EPSG:4326',
    lire: () => ({ unesco: 1613, nom: null, zone: 'tampon', element: null }),
  },
];

/** Un nom comparable : sans accents, sans ponctuation, sans les petits mots. */
const plier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(le|la|les|l|de|des|du|d|et|en|a|au|aux)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CATEGORIES: Record<string, BienMondial['categorie']> = { Cultural: 'culturel', Natural: 'naturel', Mixed: 'mixte' };

/** « {name: Stadhuis, ref: 943-003, latitude: 51.22, longitude: 4.39}, … » */
const COMPOSANT = /\{name: (.*?), ref: ([^,]+), latitude: (-?[\d.]+), longitude: (-?[\d.]+)\}/g;

type Ligne = { id_no: string; name_fr: string; category: string; date_inscribed: string; iso_codes: string | null; components_list: string | null; coordinates: string | null };

export async function collecterPatrimoineMondial(sortie: string, lireJson: LireJson, dire: (m: string) => void): Promise<PatrimoineMondial> {
  const fiche = (await lireJson(LISTE)) as { metas?: { default?: { modified?: string; license?: string } } };
  const q = new URLSearchParams({ where: 'iso_codes like "FR"', select: 'id_no,name_fr,category,date_inscribed,iso_codes,components_list,coordinates' });
  const lignes = ((await lireJson(`${LISTE}/exports/json?${q}`)) as Ligne[]).filter((l) => (l.iso_codes ?? '').split(',').some((c) => c.trim() === 'FR'));
  if (lignes.length < 40) throw new Error(`Patrimoine mondial : ${lignes.length} biens français seulement dans la liste de l'UNESCO`);

  const biens: Record<string, BienMondial> = {};
  for (const l of lignes) {
    biens[l.id_no] = { nom: texte(l.name_fr), categorie: CATEGORIES[l.category] ?? 'culturel', inscrit: Number(l.date_inscribed) || null };
  }
  const parNom = new Map(Object.entries(biens).map(([id, b]) => [plier(b.nom), Number(id)]));
  const rattacherNom = (nom: string | null) => {
    if (!nom) return null;
    const p = plier(nom);
    if (parNom.has(p)) return parNom.get(p)!;
    // « L'Œuvre architecturale de Le Corbusier » pour « L'Œuvre architecturale de Le Corbusier, une contribution… ».
    for (const [k, id] of parNom) if (p.length >= 12 && (k.startsWith(p) || p.startsWith(k))) return id;
    return null;
  };

  const communes = contoursDesCommunes(sortie);
  const CASE = 2000;
  const grille = new Map<string, string[]>();
  const cadres = new Map<string, [number, number, number, number]>();
  for (const [code, anneaux] of communes) {
    const c = cadreDe(anneaux);
    cadres.set(code, c);
    for (let cx = Math.floor(c[0] / CASE); cx <= Math.floor(c[2] / CASE); cx++) {
      for (let cy = Math.floor(c[1] / CASE); cy <= Math.floor(c[3] / CASE); cy++) {
        const k = `${cx},${cy}`;
        (grille.get(k) ?? grille.set(k, []).get(k)!).push(code);
      }
    }
  }
  const candidates = (c: [number, number, number, number]) => {
    const s = new Set<string>();
    for (let cx = Math.floor(c[0] / CASE); cx <= Math.floor(c[2] / CASE); cx++) {
      for (let cy = Math.floor(c[1] / CASE); cy <= Math.floor(c[3] / CASE); cy++) for (const code of grille.get(`${cx},${cy}`) ?? []) s.add(code);
    }
    return [...s].filter((code) => {
      const k = cadres.get(code)!;
      return k[0] <= c[2] && k[2] >= c[0] && k[1] <= c[3] && k[3] >= c[1];
    });
  };

  const c: Record<string, RattachementMondial[]> = {};
  const rattacher = (code: string, id: number, mode: RattachementMondial[1], el: string | null) => {
    const liste = (c[code] ??= []);
    let r = liste.find(([i]) => i === id);
    if (!r) liste.push((r = [id, mode, []]));
    // Le plus fort l'emporte : dans le bien, puis dans la zone tampon, puis un élément situé.
    const force = { perimetre: 0, tampon: 1, element: 2 } as const;
    if (force[mode] < force[r[1]]) r[1] = mode;
    // Un élément qui porte le nom du bien n'apprend rien.
    const plie = el ? plier(el) : '';
    const nomBien = plier(biens[id].nom);
    if (el && plie && !nomBien.startsWith(plie) && !plie.startsWith(nomBien) && !r[2].includes(el) && r[2].length < 12) r[2].push(el);
  };

  // Les éléments que l'UNESCO situe.
  let situes = 0;
  for (const l of lignes) {
    const points = [...(l.components_list ?? '').matchAll(COMPOSANT)].map((m) => ({ nom: texte(m[1]), lat: Number(m[3]), lon: Number(m[4]) }));
    for (const p of points) {
      // Un bien d'un seul élément le nomme comme lui, souvent en anglais : on ne le répète pas.
      const nomme = points.length > 1 ? p.nom : null;
      const x = Math.round(p.lon * ECHELLE);
      const y = Math.round(p.lat * ECHELLE);
      const code = candidates([x, y, x, y]).find((k) => dedans(x, y, communes.get(k)!));
      if (!code) continue;
      rattacher(code, Number(l.id_no), 'element', nomme);
      situes++;
    }
  }

  // Les périmètres régionaux.
  const sources: PatrimoineMondial['sources'] = [];
  const MARGE = 5;
  for (const src of PERIMETRES) {
    let entites: Entite[];
    try {
      entites = ((await lireJson(src.url)) as { features?: Entite[] }).features ?? [];
    } catch (e) {
      dire(`  ${src.id} : injoignable (${(e as Error).message}) — ignorée`);
      continue;
    }
    let gardees = 0;
    let ecartees = 0;
    for (const e of entites) {
      const lu = src.lire(e.properties as Proprietes);
      const id = lu.unesco && biens[lu.unesco] ? lu.unesco : rattacherNom(lu.nom);
      // Un monument tient en quelques dizaines de mètres : on simplifie à 5 m, et ce qui disparaît encore
      // à cette échelle est rattaché par son centre.
      const zone = anneauxDe(e.geometry, 0.5);
      if (!id) {
        ecartees++;
        continue;
      }
      gardees++;
      const mode = lu.zone === 'tampon' ? 'tampon' : 'perimetre';
      if (zone.length === 0) {
        const brut = JSON.stringify(e.geometry?.coordinates ?? []).match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
        if (brut.length < 2) continue;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < brut.length; i += 2) {
          sx += brut[i];
          sy += brut[i + 1];
        }
        const x = Math.round((sx / (brut.length / 2)) * ECHELLE);
        const y = Math.round((sy / (brut.length / 2)) * ECHELLE);
        const code = candidates([x, y, x, y]).find((k) => dedans(x, y, communes.get(k)!));
        if (code) rattacher(code, id, mode, lu.element);
        continue;
      }
      const cadre = cadreDe(zone);
      const cx = (cadre[0] + cadre[2]) / 2;
      const cy = (cadre[1] + cadre[3]) / 2;
      for (const code of candidates(cadre)) {
        const anneaux = communes.get(code)!;
        const k = cadres.get(code)!;
        const pas = Math.max(1, Math.max(k[2] - k[0], k[3] - k[1]) / 28);
        let touche = false;
        for (let x = k[0] + pas / 2; x < k[2] && !touche; x += pas) {
          for (let y = k[1] + pas / 2; y < k[3] && !touche; y += pas) {
            if (dedans(x, y, zone) && dedans(x, y, anneaux) && distanceAuBord(x, y, anneaux) > MARGE) touche = true;
          }
        }
        if (!touche) {
          let sommets = 0;
          for (const r of zone) for (let i = 0; i < r.length && sommets < 3; i += 2) if (dedans(r[i], r[i + 1], anneaux) && distanceAuBord(r[i], r[i + 1], anneaux) > MARGE) sommets++;
          touche = sommets >= 3 || dedans(cx, cy, anneaux);
        }
        if (touche) rattacher(code, id, mode, lu.element);
      }
    }
    sources.push({ id: src.id, producteur: src.producteur, licence: src.licence, url: src.url, entites: gardees, ecartees });
    dire(`  ${src.id} : ${gardees} périmètres rattachés${ecartees ? `, ${ecartees} écartés` : ''}`);
  }

  for (const liste of Object.values(c)) liste.sort((a, b) => a[0] - b[0]);
  const n = Object.keys(c).length;
  dire(`Patrimoine mondial : ${lignes.length} biens français, ${situes} éléments situés, ${n} communes rattachées.`);
  return { maj: new Date().toISOString().slice(0, 10), version: fiche.metas?.default?.modified?.slice(0, 10) ?? null, biens, sources, c };
}

export function ecrirePatrimoineMondial(sortie: string, p: PatrimoineMondial): void {
  writeFileSync(join(sortie, 'patrimoine-mondial.json'), JSON.stringify(p));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrirePatrimoineMondial(sortie, await collecterPatrimoineMondial(sortie, lireJson, console.log));
}

