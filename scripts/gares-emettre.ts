/**
 * Les gares de voyageurs de chaque commune et, pour celle qui n'en a pas, la
 * plus proche de sa mairie — à vol d'oiseau, pas par la route.
 *
 * Trois jeux, joints ici :
 *
 *   — **les gares de voyageurs de SNCF Gares & Connexions**, avec leur commune
 *     et leur position. Le jeu compte aussi les gares qui ont servi ou qui
 *     serviront : une gare fermée y figure ;
 *   — **leur fréquentation annuelle**, que SNCF estime d'après sa billetterie,
 *     hors billets vendus par des tiers. Une gare n'est retenue que si elle a
 *     eu des voyageurs la dernière année publiée : c'est ce qui écarte les
 *     gares fermées ;
 *   — **la position de chaque mairie**, dans l'annuaire de l'administration.
 *
 * Ce ne sont que les gares de SNCF. Une station du RER exploitée par la RATP,
 * une ligne hors du réseau national — les Chemins de fer de Provence, entre
 * Nice et Digne — n'y figurent pas : la page dit « gare SNCF », et ne cherche
 * pas de gare proche en Île-de-France.
 *
 * Ce que le site n'en dit pas : quels trains s'y arrêtent, à quelle fréquence,
 * vers où. Une halte desservie deux fois par jour et une gare de TGV pèsent ici
 * le même poids, sinon par leur fréquentation. Les horaires sont dans les
 * fichiers GTFS des régions, dont l'ingestion reste à faire.
 *
 * Lancé seul — `tsx scripts/gares-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-gares.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const SNCF = 'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets';
const ANNUAIRE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json';

/** Une gare de la commune : son nom et ses voyageurs de l'année. */
export type Gare = [string, number];

/**
 * Pour une commune, ses gares ; à défaut, la plus proche de sa mairie : son
 * nom, sa commune, la distance en kilomètres à vol d'oiseau, ses voyageurs.
 */
export type GaresCommune = { g: Gare[] } | { p: [string, string, number, number] };

export interface GaresCommunes {
  maj: string;
  annee: number;
  communes: Map<string, GaresCommune>;
}

/** Au-delà, on tient la position de la mairie pour fausse (voir plus bas). */
const DISTANCE_MAX = 80;

/** Distance à vol d'oiseau, en kilomètres. */
function distance(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export async function collecterGares(
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void,
): Promise<GaresCommunes | null> {
  const { actuelles, reports } = reportsDuDecoupage();

  // La fréquentation : la dernière année publiée, reconnue au nom des colonnes.
  const freq = (await lireJson(`${SNCF}/frequentation-gares/exports/json`)) as Record<string, unknown>[];
  const annees = Object.keys(freq[0] ?? {})
    .map((k) => /^total_voyageurs_(\d{4})$/.exec(k)?.[1])
    .filter((a): a is string => !!a)
    .map(Number)
    .sort();
  const annee = annees[annees.length - 1];
  if (!annee) throw new Error('fréquentation des gares : aucune colonne « total_voyageurs_AAAA »');
  const voyageurs = new Map<string, number>();
  for (const f of freq) {
    const uic = String(f.code_uic_complet ?? '').trim();
    const v = Number(f[`total_voyageurs_${annee}`]);
    if (uic && v > 0) voyageurs.set(uic, Math.round(v));
  }

  type Brute = {
    nom?: string;
    codeinsee?: string;
    codes_uic?: string;
    position_geographique?: { lon: number; lat: number } | null;
  };
  const brutes = (await lireJson(`${SNCF}/gares-de-voyageurs/exports/json`)) as Brute[];
  const gares: { nom: string; code: string; pos: [number, number]; v: number }[] = [];
  for (const g of brutes) {
    const code0 = communeDe((g.codeinsee ?? '').trim());
    const code = actuelles.has(code0) ? code0 : reports.get(code0);
    const pos = g.position_geographique;
    if (!code || !g.nom || !pos) continue;
    // Une gare peut porter plusieurs codes UIC : on additionne.
    const v = (g.codes_uic ?? '')
      .split(/[;,\s]+/)
      .filter(Boolean)
      .reduce((s, u) => s + (voyageurs.get(u) ?? 0), 0);
    if (v === 0) continue;
    gares.push({ nom: g.nom.trim(), code, pos: [pos.lon, pos.lat], v });
  }
  if (gares.length < 2000) {
    dire(`Gares : ${gares.length} gares fréquentées seulement, on garde l’ingestion précédente.`);
    return null;
  }

  // La mairie de chaque commune. Une commune nouvelle a aussi ses mairies
  // déléguées : on prend la mairie principale.
  type Mairie = { nom?: string; code_insee_commune?: string; adresse?: string };
  const mairies = (await lireJson(
    `${ANNUAIRE}?select=nom,code_insee_commune,adresse&where=${encodeURIComponent('pivot like "mairie"')}`,
  )) as Mairie[];
  const position = new Map<string, [number, number]>();
  for (const m of mairies) {
    const code = (m.code_insee_commune ?? '').trim();
    if (!actuelles.has(code) || /d[ée]l[ée]gu[ée]e|annexe/i.test(m.nom ?? '')) continue;
    if (position.has(code)) continue;
    let a: { longitude?: string; latitude?: string }[] = [];
    try {
      a = JSON.parse(m.adresse ?? '[]');
    } catch {
      continue;
    }
    const lon = Number(a[0]?.longitude);
    const lat = Number(a[0]?.latitude);
    // Quelques fiches portent une position hors de la métropole, ou inversée :
    // on n'en tire rien plutôt qu'une distance de trois mille kilomètres.
    if (lon > -5.5 && lon < 10 && lat > 41 && lat < 51.5) position.set(code, [lon, lat]);
  }

  const communes = new Map<string, GaresCommune>();
  for (const g of gares) {
    const c = communes.get(g.code);
    if (c && 'g' in c) c.g.push([g.nom, g.v]);
    else communes.set(g.code, { g: [[g.nom, g.v]] });
  }
  for (const c of communes.values()) if ('g' in c) c.g.sort((a, b) => b[1] - a[1]);

  // La Corse et l'outre-mer n'ont pas de gare au réseau national : la plus
  // proche serait sur le continent, ce qui ne dit rien d'utile. En
  // Île-de-France, les gares du RER exploitées par la RATP — Rueil-Malmaison,
  // Chatou, Saint-Maur sur le RER A — ne sont pas dans la liste de SNCF : la
  // gare SNCF la plus proche y serait une réponse fausse à la question qu'on se
  // pose.
  const horsReseau = (code: string) => /^(2A|2B|97|98|75|77|78|91|92|93|94|95)/.test(code);
  let sansMairie = 0;
  for (const code of actuelles) {
    if (communes.has(code) || horsReseau(code)) continue;
    const ici = position.get(code);
    if (!ici) {
      sansMairie++;
      continue;
    }
    let meilleure = gares[0];
    let d = Infinity;
    for (const g of gares) {
      const x = distance(ici, g.pos);
      if (x < d) {
        d = x;
        meilleure = g;
      }
    }
    // Au-delà, la position de la mairie est plus probablement fausse que la
    // gare lointaine : la plus éloignée des gares justes est à 53 km.
    if (d > DISTANCE_MAX) {
      sansMairie++;
      continue;
    }
    communes.set(code, { p: [meilleure.nom, meilleure.code, Math.round(d * 10) / 10, meilleure.v] });
  }

  const avec = [...communes.values()].filter((c) => 'g' in c).length;
  dire(
    `Gares : ${gares.length.toLocaleString('fr-FR')} gares fréquentées en ${annee}, dans ` +
      `${avec.toLocaleString('fr-FR')} communes ; ${sansMairie.toLocaleString('fr-FR')} communes sans position de mairie sûre.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annee, communes };
}

export function ecrireGares(sortie: string, g: GaresCommunes): number {
  return ecrireParDepartement(sortie, 'gares', g.communes, () => ({ maj: g.maj, annee: g.annee }));
}

// Lancé seul : réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const g = await collecterGares(lireJson, console.log);
  if (g) console.log(`${ecrireGares(sortie, g)} départements écrits.`);
}
