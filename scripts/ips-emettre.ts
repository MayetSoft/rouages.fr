/**
 * L'indice de position sociale des écoles et des collèges, d'après le
 * ministère de l'éducation nationale.
 *
 * L'IPS résume en un nombre les conditions sociales et culturelles des familles
 * des élèves — professions des parents surtout —, construit pour que la moyenne
 * nationale tombe autour de 100 : plus il est haut, plus les élèves viennent de
 * milieux favorisés. Il décrit qui fréquente l'établissement, pas ce qu'on y
 * enseigne ni ce qu'il vaut.
 *
 * Le ministère publie, sur chaque ligne, l'IPS du département et celui de la
 * France, public et privé à part : la page compare à ces valeurs-là, pas à un
 * calcul d'ici.
 *
 * Les résultats au brevet par établissement ne sont pas repris : le jeu national
 * s'arrête à la session 2021.
 *
 * Lancé seul — `tsx scripts/ips-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-ips.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, communeDe, ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

const API = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets';
export const JEUX = { ecole: 'fr-en-ips-ecoles-ap2022', college: 'fr-en-ips-colleges-ap2023' } as const;

/** Un établissement : UAI, nom, public ou privé, IPS, école ou collège. */
export type Etablissement = [string, string, 'public' | 'privé', number, 'école' | 'collège'];
/** Les références publiées : [public, privé, ensemble], département puis France. */
type Reference = { dep: [number | null, number | null, number | null]; france: [number | null, number | null, number | null] };

export interface Ips {
  maj: string;
  rentrees: Record<'école' | 'collège', string>;
  communes: Map<string, Etablissement[]>;
  references: Map<string, Record<'école' | 'collège', Reference>>;
}

/** La dernière rentrée publiée d'un jeu. */
async function derniereRentree(lireJson: (url: string) => Promise<unknown>, jeu: string): Promise<string> {
  const r = (await lireJson(
    `${API}/${jeu}/records?select=rentree_scolaire&group_by=rentree_scolaire&order_by=rentree_scolaire%20desc&limit=1`,
  )) as { results?: { rentree_scolaire?: string }[] };
  const x = r.results?.[0]?.rentree_scolaire;
  if (!x) throw new Error(`${jeu} : aucune rentrée scolaire`);
  return x;
}

export async function lireIps(
  chemins: Record<'école' | 'collège', string>,
  lireFlux: (chemin: string) => AsyncIterable<Uint8Array>,
): Promise<Pick<Ips, 'communes' | 'references'>> {
  const communes = new Map<string, Etablissement[]>();
  const references = new Map<string, Record<'école' | 'collège', Reference>>();
  const num = (s: string | undefined) => {
    const n = Number((s ?? '').replace(',', '.'));
    return s && Number.isFinite(n) ? n : null;
  };
  for (const type of ['école', 'collège'] as const) {
    let col: Record<string, number> | null = null;
    for await (const v of lignesCsv(lireFlux(chemins[type]), ';')) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
        for (const n of ['code_insee_de_la_commune', 'uai', 'nom_de_l_etablissement', 'secteur', 'ips', 'code_du_departement']) {
          if (col[n] === undefined) throw new Error(`IPS ${type} : colonne « ${n} » absente`);
        }
        continue;
      }
      const ips = num(v[col.ips]);
      // Paris, Lyon et Marseille sont rangés par arrondissement : la page est celle de la commune.
      const code = communeDe(codeCommune(v[col.code_insee_de_la_commune] ?? ''));
      if (ips === null || !/^\d[\dAB]\d{3}$/.test(code)) continue;
      const secteur = /priv/i.test(v[col.secteur]) ? 'privé' : 'public';
      if (!communes.has(code)) communes.set(code, []);
      communes.get(code)!.push([v[col.uai], v[col.nom_de_l_etablissement].trim(), secteur, ips, type]);
      const dep = code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
      if (!references.has(dep)) {
        const vide = (): Reference => ({ dep: [null, null, null], france: [null, null, null] });
        references.set(dep, { école: vide(), collège: vide() });
      }
      const r = references.get(dep)![type];
      const lire = (champ: string) => (col![champ] === undefined ? null : num(v[col![champ]]));
      r.dep = [lire('ips_departemental_public') ?? r.dep[0], lire('ips_departemental_prive') ?? r.dep[1], lire('ips_departemental') ?? r.dep[2]];
      r.france = [lire('ips_national_public') ?? r.france[0], lire('ips_national_prive') ?? r.france[1], lire('ips_national') ?? r.france[2]];
    }
  }
  for (const e of communes.values()) e.sort((a, b) => (a[4] === b[4] ? a[1].localeCompare(b[1], 'fr') : a[4] === 'école' ? -1 : 1));
  return { communes, references };
}

export async function collecterIps(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  lireFlux: (chemin: string) => AsyncIterable<Uint8Array>,
  cache: string,
  dire: (m: string) => void,
): Promise<Ips | null> {
  const rentrees = {} as Record<'école' | 'collège', string>;
  const chemins = {} as Record<'école' | 'collège', string>;
  try {
    for (const [type, jeu] of [['école', JEUX.ecole], ['collège', JEUX.college]] as const) {
      rentrees[type] = await derniereRentree(lireJson, jeu);
      chemins[type] = join(cache, `ips-${jeu}-${rentrees[type]}.csv`);
      const ou = encodeURIComponent(`rentree_scolaire="${rentrees[type]}"`);
      await telecharger(`${API}/${jeu}/exports/csv?where=${ou}&delimiter=%3B`, chemins[type]);
    }
  } catch {
    dire('Indices de position sociale indisponibles : ceux de l’ingestion précédente restent en place.');
    return null;
  }
  const i = await lireIps(chemins, lireFlux);
  const n = [...i.communes.values()].reduce((s, e) => s + e.length, 0);
  if (n < 30000) {
    dire(`Indices de position sociale : ${n} établissements seulement, on garde l’ingestion précédente.`);
    return null;
  }
  dire(
    `Indices de position sociale, écoles ${rentrees.école} et collèges ${rentrees.collège} : ` +
      `${n.toLocaleString('fr-FR')} établissements dans ${i.communes.size.toLocaleString('fr-FR')} communes.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), rentrees, ...i };
}

export function ecrireIps(sortie: string, i: Ips): number {
  return ecrireParDepartement(sortie, 'ips', i.communes, (dep) => ({
    maj: i.maj,
    rentrees: i.rentrees,
    references: i.references.get(dep) ?? null,
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { createReadStream } = await import('node:fs');
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const i = await collecterIps(lireJson, telecharger, (c) => createReadStream(c) as unknown as AsyncIterable<Uint8Array>, cache, console.log);
  if (i) console.log(`${ecrireIps(sortie, i)} départements écrits.`);
}
