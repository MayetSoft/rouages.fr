/**
 * Les arrêts de transport en commun de chaque commune, et les réseaux qui les
 * desservent ; pour une commune sans arrêt, le plus proche de son centre.
 *
 * **La source** est le Point d'accès national aux données de transport
 * (transport.data.gouv.fr), qui lit tous les fichiers d'horaires GTFS qu'on y
 * déclare — bus, cars, tramways, métros, trains régionaux et nationaux — et en
 * tire une couche des arrêts, servie par carreaux (`/api/gtfs-stops`, au plus
 * 20 000 points par réponse : un carreau trop dense est coupé en quatre). Le
 * Point d'accès la dit expérimentale, et demande qu'on ne la prenne pas pour
 * de l'information voyageur : le site s'en sert pour dire qu'un arrêt existe
 * et qui l'inscrit dans ses horaires, pas quand passe le car. Son export
 * statique (« Arrêts de transport en France ») date de janvier 2026 ; les
 * carreaux, eux, suivent les fichiers à mesure qu'ils sont republiés.
 *
 * **Un arrêt** est un point d'arrêt GTFS (`location_type` 0) ; une gare ou un
 * pôle qui les regroupe (`location_type` 1) n'est pas compté deux fois. Le
 * même arrêt figure souvent dans plusieurs jeux — celui du réseau et l'agrégat
 * de sa région, qui reprend tous les réseaux : on le compte une fois, par son
 * nom et sa position à une dizaine de mètres près, et un agrégat (étiquette
 * `agrégat_region` au Point d'accès) n'est nommé que s'il est seul à
 * l'inscrire.
 *
 * **La commune** de l'arrêt est celle dont le contour le contient
 * (`dep/XX-contours.json`, Admin Express) ; le centre d'une commune est celui
 * que publie `proximite/centres.json`.
 *
 * **La desserte** (`horaires-gtfs.ts`) : les fichiers d'horaires eux-mêmes,
 * lus pour une semaine de classe, disent combien de passages compte chaque
 * arrêt, jour par jour ; la commune garde son arrêt le plus desservi. Une
 * collecte des horaires qui échoue laisse les arrêts. Le transport à la
 * demande, quand il n'a pas d'arrêts fixes, n'y figure pas.
 *
 * Écrit `dep/XX-transports.json`. Lancé seul — `npx tsx
 * scripts/transports-emettre.ts` —, il relit les contours déjà écrits.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contoursDesCommunes, ECHELLE } from './espaces-emettre.ts';
import { collecterHoraires, semaineDeClasse, type JeuGtfs } from './horaires-gtfs.ts';
import { localisateur } from './localiser.ts';
import { departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

type LireJson = (url: string) => Promise<unknown>;

const PAN = 'https://transport.data.gouv.fr';

/**
 * La desserte d'un arrêt dans la semaine comptée : son nom, ses passages du
 * lundi au dimanche, le nombre de lignes qui y passent.
 */
export type Desservi = [string, number[], number];

/**
 * Pour une commune : ses arrêts et les réseaux qui les inscrivent (leurs
 * numéros au Point d'accès) ; à défaut, l'arrêt le plus proche de son centre :
 * son nom, sa commune, la distance en hectomètres, ses réseaux. `h` : l'arrêt
 * le plus desservi de la semaine (ou l'arrêt le plus proche, s'il est
 * desservi) ; `z` : les fichiers qui couvrent la semaine inscrivent ses
 * arrêts, et aucun passage n'y est prévu. Ni l'un ni l'autre : on ne sait pas.
 */
export type TransportsCommune = ({ n: number; r: string[]; a?: string[] } | { p: [string, string, number, string[]] }) & { h?: Desservi; z?: 1 };

/**
 * Les arrêts desservis de la semaine comptée, gardés dans le cache des
 * horaires pour les croiser avec le carroyage : position, passages du jour
 * ouvré le moins desservi (du lundi au vendredi), passages de la semaine.
 */
export const ARRETS_DESSERVIS = 'arrets-desservis.json';
export interface ArretsDesservis {
  semaine: string;
  a: number[][];
}

/** Jusqu'à ce nombre d'arrêts, la page les nomme. */
const NOMMES = 8;

export interface Reseau {
  titre: string;
  /** Qui publie le jeu au Point d'accès. */
  editeur: string;
  /** L'adresse de sa fiche. */
  url: string;
  licence: string;
}

export interface CollecteTransports {
  maj: string;
  /** Le lundi de la semaine comptée, AAAA-MM-JJ, quand les horaires ont été lus. */
  semaine?: string;
  reseaux: Map<string, Reseau>;
  communes: Map<string, TransportsCommune>;
}

/** Les cadres à parcourir : la métropole et la Corse, puis chaque département d'outre-mer. */
const CADRES: [number, number, number, number][] = [
  [-5.5, 41.0, 10.0, 51.5],
  [-61.9, 15.8, -60.9, 16.6], // Guadeloupe
  [-61.3, 14.3, -60.7, 14.95], // Martinique
  [-54.7, 2.0, -51.5, 5.9], // Guyane
  [55.1, -21.5, 56.0, -20.8], // La Réunion
  [44.9, -13.1, 45.4, -12.5], // Mayotte
];
const PAS = 1;

type Arret = { nom: string; x: number; y: number; jeux: Set<string> };
type Point = { properties: { dataset_id: number; stop_name: string | null; location_type: number | null }; geometry: { coordinates: [number, number] } };

/** Les arrêts d'un carreau ; un carreau qui dépasse le plafond est coupé en quatre. */
async function carreau(o: number, s: number, e: number, n: number, dire: (m: string) => void, profondeur = 0): Promise<Point[]> {
  const url = `${PAN}/api/gtfs-stops?south=${s}&north=${n}&west=${o}&east=${e}`;
  for (let essai = 0; essai < 4; essai++) {
    let r: Response;
    try {
      r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    } catch {
      await new Promise((ok) => setTimeout(ok, 3000 * (essai + 1)));
      continue;
    }
    if (r.status === 422 && profondeur < 8) {
      const mx = (o + e) / 2;
      const my = (s + n) / 2;
      const quarts = [
        [o, s, mx, my],
        [mx, s, e, my],
        [o, my, mx, n],
        [mx, my, e, n],
      ];
      const sortie: Point[] = [];
      for (const [a, b, c, d] of quarts) sortie.push(...(await carreau(a, b, c, d, dire, profondeur + 1)));
      return sortie;
    }
    if (r.ok) return (((await r.json()) as { features?: Point[] }).features ?? []);
    await new Promise((ok) => setTimeout(ok, 3000 * (essai + 1)));
  }
  throw new Error(`carreau ${o},${s},${e},${n} : injoignable`);
}

/** Distance à vol d'oiseau, en kilomètres. */
function km(ax: number, ay: number, bx: number, by: number): number {
  const r = Math.PI / 180;
  const h = Math.sin(((by - ay) * r) / 2) ** 2 + Math.cos(ay * r) * Math.cos(by * r) * Math.sin(((bx - ax) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export async function collecterTransports(sortie: string, lireJson: LireJson, dire: (m: string) => void, cache?: string): Promise<CollecteTransports> {
  // Les jeux du Point d'accès : leur nom, leur éditeur, et s'ils agrègent une région.
  type Ressource = { id: string | number; format?: string; url?: string; original_url?: string; is_community_resource?: boolean };
  type Jeu = {
    datagouv_id: string;
    id: string;
    title: string;
    page_url: string;
    licence: string;
    type?: string;
    tags?: string[];
    publisher?: { name?: string };
    resources?: Ressource[];
  };
  const jeux = (await lireJson(`${PAN}/api/datasets`)) as Jeu[];
  // `/api/gtfs-stops` numérote les jeux autrement que `/api/datasets` : le lien se fait par la fiche.
  const fiches = new Map<string, Jeu>();
  for (const j of jeux) fiches.set(j.title, j);

  const contours = contoursDesCommunes(sortie);
  if (!contours.size) throw new Error('contours des communes absents : lancer d’abord la collecte des espaces naturels');
  const communeDu = localisateur(contours);
  const CASE = 0.1 * ECHELLE;

  // Les arrêts, carreau par carreau, dédoublonnés par leur nom et leur position.
  const arrets = new Map<string, Arret>();
  let lus = 0;
  for (const [o0, s0, e0, n0] of CADRES) {
    for (let o = o0; o < e0; o += PAS) {
      for (let s = s0; s < n0; s += PAS) {
        const points = await carreau(o, s, Math.min(o + PAS, e0), Math.min(s + PAS, n0), dire);
        lus += points.length;
        for (const p of points) {
          const lt = p.properties.location_type;
          if (lt !== 0 && lt !== null) continue;
          const [lon, lat] = p.geometry.coordinates;
          const x = Math.round(lon * ECHELLE);
          const y = Math.round(lat * ECHELLE);
          const nom = (p.properties.stop_name ?? '').replace(/\s+/g, ' ').trim();
          const cle = `${nom.toLowerCase()}|${x}|${y}`;
          const a = arrets.get(cle) ?? arrets.set(cle, { nom, x, y, jeux: new Set() }).get(cle)!;
          const titre = (p.properties as { dataset_title?: string }).dataset_title ?? '';
          a.jeux.add(titre);
        }
      }
    }
  }
  dire(`  ${lus} points lus, ${arrets.size} arrêts distincts.`);

  // Un agrégat n'est nommé que là où il est seul à inscrire l'arrêt.
  const agregat = (titre: string) => !!fiches.get(titre)?.tags?.some((t) => /agr[ée]gat/i.test(t));
  const reseaux = new Map<string, Reseau>();
  const idDe = (titre: string) => {
    const j = fiches.get(titre);
    const id = j?.id ?? titre;
    if (!reseaux.has(id)) reseaux.set(id, { titre, editeur: j?.publisher?.name ?? '', url: j?.page_url ?? `${PAN}/datasets`, licence: j?.licence ?? '' });
    return id;
  };
  // Par commune : les arrêts par leur nom — deux quais d'un même arrêt, ou le même arrêt placé à quelques
  // mètres près par deux jeux, n'en font qu'un —, et les jeux qui les inscrivent.
  const plier = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const parCommune = new Map<string, { noms: Map<string, string>; r: Set<string> }>();
  const situes: Arret[] = [];
  for (const a of arrets.values()) {
    const code = communeDu(a.x, a.y);
    if (!code) continue;
    situes.push(a);
    const e = parCommune.get(code) ?? parCommune.set(code, { noms: new Map(), r: new Set() }).get(code)!;
    if (a.nom && !e.noms.has(plier(a.nom))) e.noms.set(plier(a.nom), a.nom);
    for (const t of a.jeux) if (t) e.r.add(idDe(t));
  }
  dire(`  ${situes.length} arrêts situés dans ${parCommune.size} communes.`);

  // Les communes sans arrêt : le plus proche de leur centre.
  const communes = new Map<string, TransportsCommune>();
  const estAgregat = (id: string) => agregat(reseaux.get(id)!.titre);
  for (const [code, e] of parCommune) {
    if (!e.noms.size) continue;
    // Un agrégat régional n'est nommé que si aucun réseau propre n'inscrit d'arrêt dans la commune.
    const propres = [...e.r].filter((id) => !estAgregat(id));
    const r = (propres.length ? propres : [...e.r]).sort((a, b) => reseaux.get(a)!.titre.localeCompare(reseaux.get(b)!.titre, 'fr'));
    const noms = [...e.noms.values()].sort((a, b) => a.localeCompare(b, 'fr'));
    communes.set(code, { n: noms.length, r, ...(noms.length <= NOMMES ? { a: noms } : {}) });
  }
  const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { c: [string, string, string, string, number][] };
  const nomDe = new Map(index.c.map(([code, nom]) => [code, nom]));
  const centres = (JSON.parse(readFileSync(join(sortie, 'proximite', 'centres.json'), 'utf8')) as { c: (number | null)[] }).c;
  // Une grille d'un dixième de degré sur les arrêts situés, pour chercher en cercles croissants.
  const g = new Map<string, Arret[]>();
  for (const a of situes) (g.get(`${Math.floor(a.x / CASE)},${Math.floor(a.y / CASE)}`) ?? g.set(`${Math.floor(a.x / CASE)},${Math.floor(a.y / CASE)}`, []).get(`${Math.floor(a.x / CASE)},${Math.floor(a.y / CASE)}`)!).push(a);
  const communeDeLArret = new Map<Arret, string>();
  index.c.forEach(([code], i) => {
    if (communes.has(code) || centres[2 * i] === null || centres[2 * i] === undefined) return;
    // Les centres sont au millième de degré.
    const lon = centres[2 * i]! / 1000;
    const lat = centres[2 * i + 1]! / 1000;
    const cx = Math.floor((lon * ECHELLE) / CASE);
    const cy = Math.floor((lat * ECHELLE) / CASE);
    let meilleur: Arret | null = null;
    let d = Infinity;
    // Jusqu'à trois cases autour (une trentaine de kilomètres) : au-delà, on ne dit rien.
    for (let rayon = 0; rayon <= 3 && !meilleur; rayon++) {
      for (let i2 = cx - rayon; i2 <= cx + rayon; i2++)
        for (let j2 = cy - rayon; j2 <= cy + rayon; j2++) {
          if (Math.max(Math.abs(i2 - cx), Math.abs(j2 - cy)) !== rayon) continue;
          for (const a of g.get(`${i2},${j2}`) ?? []) {
            const k = km(lon, lat, a.x / ECHELLE, a.y / ECHELLE);
            if (k < d) {
              d = k;
              meilleur = a;
            }
          }
        }
    }
    if (!meilleur || d > 30) return;
    let ou = communeDeLArret.get(meilleur);
    if (!ou) {
      ou = communeDu(meilleur.x, meilleur.y)!;
      communeDeLArret.set(meilleur, ou);
    }
    const propres = [...meilleur.jeux].filter((t) => t && !agregat(t));
    const r = (propres.length ? propres : [...meilleur.jeux].filter(Boolean)).map(idDe);
    communes.set(code, { p: [meilleur.nom, ou, Math.round(d * 10), r] });
  });

  // La desserte, d'après les fichiers d'horaires eux-mêmes. Un échec laisse les arrêts.
  let semaine: string | undefined;
  if (cache) {
    try {
      const jours = await semaineDeClasse(lireJson);
      const gtfs: JeuGtfs[] = jeux
        .filter((j) => j.type === 'public-transit')
        .map((j) => ({
          id: j.id,
          agregat: !!j.tags?.some((t) => /agr[ée]gat/i.test(t)),
          fichiers: (j.resources ?? [])
            .filter((r) => (r.format ?? '').toUpperCase() === 'GTFS' && !r.is_community_resource)
            .map((r) => ({ id: String(r.id), urls: [r.url, r.original_url].filter((u): u is string => !!u) })),
        }))
        .filter((j) => j.fichiers.length)
        // Pour un essai : `ROUAGES_GTFS=<id>,<id>` ne lit que ces jeux.
        .filter((j) => !process.env.ROUAGES_GTFS || process.env.ROUAGES_GTFS.split(',').includes(j.id));
      const h = await collecterHoraires(gtfs, jours, (lon, lat) => communeDu(Math.round(lon * ECHELLE), Math.round(lat * ECHELLE)), join(cache, 'gtfs'), dire);
      const desservi = (m: Map<string, { nom: string; n: number[]; lignes: Set<string> }> | undefined, cle?: string): Desservi | undefined => {
        if (!m) return undefined;
        const choix = cle ? m.get(cle) : [...m.values()].sort((a, b) => b.n.reduce((x, y) => x + y, 0) - a.n.reduce((x, y) => x + y, 0))[0];
        return choix && choix.n.some(Boolean) ? [choix.nom, choix.n, choix.lignes.size] : undefined;
      };
      for (const [code, e] of communes) {
        const d = 'p' in e ? desservi(h.desserte.get(e.p[1]), plier(e.p[0])) : desservi(h.desserte.get(code));
        if (d) e.h = d;
        else if (!('p' in e) && h.couvertes.has(code)) e.z = 1;
      }
      semaine = `${jours[0].slice(0, 4)}-${jours[0].slice(4, 6)}-${jours[0].slice(6)}`;
      // Les arrêts desservis et leur position, pour les croiser avec les habitants (`acces-emettre.ts`).
      const a6 = (v: number) => Math.round(v * 1e5) / 1e5;
      const points = [...h.desserte.values()].flatMap((m) =>
        [...m.values()].filter((x) => x.n.some(Boolean)).map((x) => [a6(x.lon), a6(x.lat), Math.min(...x.n.slice(0, 5)), x.n.reduce((u, v) => u + v, 0)]),
      );
      writeFileSync(join(cache, 'gtfs', ARRETS_DESSERVIS), JSON.stringify({ semaine, a: points } satisfies ArretsDesservis));
    } catch (e) {
      dire(`  Horaires non lus (${(e as Error).message}) : les arrêts restent, sans leur desserte.`);
    }
  }
  return { maj: new Date().toISOString().slice(0, 10), semaine, reseaux, communes };
}

/** Les fichiers de chaque département ; `deps`, pour n'écrire que ceux qu'une collecte partielle couvre entièrement. */
export function ecrireTransports(sortie: string, t: CollecteTransports, deps?: string[]): number {
  const communes = deps ? new Map([...t.communes].filter(([code]) => deps.includes(departementDe(code)))) : t.communes;
  // Chaque fichier porte les réseaux qu'il cite — titre, éditeur, fiche —, pas les 800 jeux du Point d'accès.
  const cites = new Map<string, Set<string>>();
  for (const [code, e] of communes) {
    const dep = departementDe(code);
    const s = cites.get(dep) ?? cites.set(dep, new Set()).get(dep)!;
    for (const id of 'r' in e ? e.r : e.p[3]) s.add(id);
  }
  return ecrireParDepartement(sortie, 'transports', communes, (dep) => ({
    maj: t.maj,
    ...(t.semaine ? { s: t.semaine } : {}),
    r: Object.fromEntries([...(cites.get(dep) ?? [])].map((id) => {
      const r = t.reseaux.get(id)!;
      return [id, [r.titre, r.editeur, r.url]];
    })),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  // Pour un essai : `ROUAGES_CADRE=o,s,e,n ROUAGES_DEPS=03` ne lit que ce cadre et n'écrit que ces départements.
  const cadre = process.env.ROUAGES_CADRE?.split(',').map(Number);
  if (cadre?.length === 4) CADRES.splice(0, CADRES.length, cadre as [number, number, number, number]);
  const t = await collecterTransports(sortie, lireJson, console.log, join(racine, '.cache'));
  console.log(`${ecrireTransports(sortie, t, process.env.ROUAGES_DEPS?.split(','))} départements écrits.`);
}
