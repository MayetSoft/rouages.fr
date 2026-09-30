/**
 * Ce qui mérite une visite dans chaque commune : le patrimoine, les sites
 * naturels, les itinéraires de randonnée — d'après DATAtourisme, la base
 * nationale que tiennent les offices de tourisme et les agences
 * départementales.
 *
 * **Une base de promotion, pas un inventaire.** Elle contient ce que les
 * offices ont choisi d'y saisir. Le petit patrimoine — lavoirs, croix,
 * fontaines — n'y figure que là où un office l'a décrit ; aucune base
 * nationale ouverte ne l'inventorie. La page le dit.
 *
 * Ce qui est retenu, et seulement cela :
 *
 *   — le patrimoine : églises, chapelles, lieux de mémoire, musées, châteaux,
 *     moulins, lavoirs, sites archéologiques… ;
 *   — les sites naturels : lacs, cascades, points de vue, parcs et jardins ;
 *   — les itinéraires : à pied, à vélo, à cheval, sentiers d'interprétation.
 *
 * Tout ce qui est aussi un commerce, un hébergement, un restaurant, un
 * prestataire ou un événement est écarté — ce sont d'ailleurs ces fiches qui
 * portent des noms de personnes. La catégorie générique « site culturel » ne
 * suffit pas : elle couvre aussi les médiathèques et les cinémas.
 *
 * Le fichier ne donne pas de code INSEE mais « 03250#Le Mayet-de-Montagne » :
 * la commune est retrouvée par son code postal et son nom.
 *
 * Lancé seul — `tsx scripts/lieux-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-lieux.json`.
 */
import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '5b598be088ee387c0c353714';

const PATRIMOINE = new Set([
  'ReligiousSite', 'Church', 'Chapel', 'Abbey', 'Convent', 'Cloister', 'Collegiate', 'Temple',
  'RemembranceSite', 'Museum', 'InterpretationCentre', 'CityHeritage', 'RemarkableBuilding',
  'TechnicalHeritage', 'IndustrialSite', 'Mill', 'WashHouse', 'Fountain', 'Bridge', 'Aqueduct', 'Tower',
  'Castle', 'FortifiedCastle', 'Fort', 'DefenceSite', 'ArcheologicalSite', 'Ruins',
]);
const NATURE = new Set([
  'NaturalHeritage', 'NaturalCuriosity', 'ParkAndGarden', 'PointOfView', 'Lake', 'Pond', 'Waterfall',
  'River', 'Stream', 'Forest', 'Mountain', 'Volcano', 'Cliff',
]);
const ITINERAIRES = new Set(['WalkingTour', 'CyclingTour', 'HorseTour', 'EducationalTrail']);
/** Un commerce, un hébergement, un prestataire, un événement : écarté, quoi qu'il soit d'autre. */
const ECARTES = new Set([
  'Accommodation', 'FoodEstablishment', 'Store', 'ActivityProvider', 'ServiceProvider', 'TastingProvider',
  'EntertainmentAndEvent', 'Event', 'Product', 'Rental', 'Transporter', 'TourOperatorOrTravelAgency',
]);

/** Les noms par famille : patrimoine, nature, itinéraires. */
export type Lieux = [string[], string[], string[]];

export interface LieuxCommunes {
  maj: string;
  communes: Map<string, Lieux>;
}

const aplatir = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Code postal et nom vers la commune actuelle, communes déléguées comprises. */
function correspondances(): (cp: string, nom: string) => string | null {
  const chemin = createRequire(import.meta.url).resolve('@etalab/decoupage-administratif/data/communes.json');
  const toutes = JSON.parse(readFileSync(chemin, 'utf8')) as {
    code: string;
    nom: string;
    type: string;
    chefLieu?: string;
    codesPostaux?: string[];
    departement?: string;
  }[];
  const parCp = new Map<string, string>();
  const parDep = new Map<string, string>();
  const cpsDe = new Map<string, string[]>();
  for (const c of toutes) if (c.type === 'commune-actuelle') cpsDe.set(c.code, c.codesPostaux ?? []);
  for (const c of toutes) {
    const code = c.type === 'commune-actuelle' ? c.code : c.chefLieu;
    if (!code || !cpsDe.has(code)) continue;
    const n = aplatir(c.nom);
    for (const cp of c.codesPostaux ?? cpsDe.get(code) ?? []) {
      if (!parCp.has(`${cp}|${n}`)) parCp.set(`${cp}|${n}`, code);
    }
    const dep = code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
    // Un nom porté deux fois dans un département ne permet pas de trancher.
    const cle = `${dep}|${n}`;
    parDep.set(cle, parDep.has(cle) && parDep.get(cle) !== code ? '' : code);
  }
  return (cp, nom) => {
    const n = aplatir(nom);
    const exact = parCp.get(`${cp}|${n}`);
    if (exact) return exact;
    const dep = cp.startsWith('97') ? cp.slice(0, 3) : cp.slice(0, 2);
    return parDep.get(`${dep}|${n}`) || null;
  };
}

export async function collecterLieux(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<LieuxCommunes | null> {
  type Ressource = { title?: string; url?: string };
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEU}/resources/?page_size=50`)) as {
    data?: Ressource[];
  };
  const regions = (r.data ?? []).filter((x) => /^datatourisme-reg-[a-z]+\.csv$/i.test(x.title ?? '') && x.url);
  if (regions.length < 13) {
    dire(`Lieux à voir : ${regions.length} fichiers régionaux seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const commune = correspondances();
  const parCommune = new Map<string, [Set<string>, Set<string>, Set<string>]>();
  let retenus = 0;
  let orphelins = 0;
  for (const reg of regions) {
    const vers = join(cache, reg.title!);
    await telecharger(reg.url!, vers);
    let col: Record<string, number> | null = null;
    for await (const v of lignesCsv(createReadStream(vers) as unknown as AsyncIterable<Uint8Array>, ',')) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
        for (const n of ['Nom_du_POI', 'Categories_de_POI', 'Code_postal_et_commune']) {
          if (col[n] === undefined) throw new Error(`DATAtourisme ${reg.title} : colonne « ${n} » absente`);
        }
        continue;
      }
      const cats = new Set((v[col.Categories_de_POI] ?? '').split('|').map((c) => c.split(/[#/]/).pop() ?? ''));
      if ([...cats].some((c) => ECARTES.has(c))) continue;
      const famille: 0 | 1 | 2 | null = [...cats].some((c) => PATRIMOINE.has(c))
        ? 0
        : [...cats].some((c) => NATURE.has(c))
          ? 1
          : [...cats].some((c) => ITINERAIRES.has(c))
            ? 2
            : null;
      if (famille === null) continue;
      const nom = (v[col.Nom_du_POI] ?? '').replace(/\s+/g, ' ').trim();
      const [cp, nomCommune] = (v[col.Code_postal_et_commune] ?? '').split('#');
      if (!nom || !cp || !nomCommune) continue;
      const code = commune(cp.trim(), nomCommune.trim());
      if (!code) {
        orphelins++;
        continue;
      }
      const l = parCommune.get(code) ?? [new Set<string>(), new Set<string>(), new Set<string>()];
      l[famille].add(nom);
      parCommune.set(code, l);
      retenus++;
    }
  }
  if (retenus < 50000) {
    dire(`Lieux à voir : ${retenus} fiches seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const communes = new Map<string, Lieux>();
  const trier = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  for (const [code, [p, n, i]] of parCommune) communes.set(code, [trier(p), trier(n), trier(i)]);
  dire(
    `Lieux à voir : ${retenus.toLocaleString('fr-FR')} fiches dans ${communes.size.toLocaleString('fr-FR')} communes ; ` +
      `${orphelins.toLocaleString('fr-FR')} sans commune retrouvée.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireLieux(sortie: string, l: LieuxCommunes): number {
  return ecrireParDepartement(sortie, 'lieux', l.communes, () => ({ maj: l.maj }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const l = await collecterLieux(lireJson, telecharger, cache, console.log);
  if (l) console.log(`${ecrireLieux(sortie, l)} départements écrits.`);
}
