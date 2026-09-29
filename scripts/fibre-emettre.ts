/**
 * La fibre optique et la fin du cuivre, commune par commune, d'après
 * l'indicateur France Très Haut Débit de l'ANCT.
 *
 * Trois choses que la page reprend telles quelles :
 * - la part des locaux raccordables à la fibre, au dernier trimestre publié ;
 * - qui porte le réseau : un opérateur privé dans les zones qu'il a choisi
 *   d'équiper à ses frais, une collectivité — département, région, syndicat —
 *   dans les autres, par un réseau d'initiative publique ;
 * - l'année où le réseau cuivre d'Orange sera fermé : l'ANCT donne, pour la fin
 *   de chaque année de 2025 à 2030, le nombre de locaux concernés. Le cumul est
 *   gardé tel quel ; la page dit à partir de quand tous les locaux le sont.
 *
 * Quelques communes sont coupées en deux zonages : l'ANCT en donne une ligne
 * par zone, additionnées ici. La base de locaux est celle de l'observatoire de
 * l'Arcep, qui n'est pas un recensement des logements : elle compte aussi les
 * locaux professionnels.
 *
 * Lancé seul — `tsx scripts/fibre-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-fibre.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

export const JEU = 'indicateur-france-tres-haut-debit-etat-des-deploiements-de-la-fibre-optique-et-decommissionnement-du-cuivre';

/** Locaux, locaux raccordables, porteur du réseau, catégorie de zone, locaux concernés par la fin du cuivre à fin 2025…2030. */
export type Fibre = [number, number, string, string, number[]];

export interface FibreCommunes {
  maj: string;
  trimestre: string;
  annees: number[];
  communes: Map<string, Fibre>;
}

export async function lireFibre(chemin: string): Promise<Omit<FibreCommunes, 'maj'>> {
  const communes = new Map<string, Fibre>();
  let col: Record<string, number> | null = null;
  let trimestre = '';
  let annees: number[] = [];
  for await (const v of lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>)) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['insee_com', 'locaux_arcep', 'locaux_ftth', 'porteur_projet', 'categorie_fthd', 'trimestre']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      annees = Object.keys(col)
        .map((n) => /^ferm_cu(\d\d)$/.exec(n)?.[1])
        .filter((x): x is string => !!x)
        .map((x) => 2000 + Number(x))
        .sort();
      continue;
    }
    const code = v[col.insee_com];
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const locaux = Number(v[col.locaux_arcep]) || 0;
    const ftth = Number(v[col.locaux_ftth]) || 0;
    const cuivre = annees.map((a) => Number(v[col![`ferm_cu${String(a).slice(2)}`]]) || 0);
    trimestre ||= v[col.trimestre];
    const deja = communes.get(code);
    if (deja) {
      deja[0] += locaux;
      deja[1] += ftth;
      // Deux zones, parfois deux porteurs : on les nomme tous deux.
      if (!deja[2].split(' / ').includes(v[col.porteur_projet])) deja[2] += ` / ${v[col.porteur_projet]}`;
      if (!deja[3].split(' / ').includes(v[col.categorie_fthd])) deja[3] += ` / ${v[col.categorie_fthd]}`;
      deja[4] = deja[4].map((x, i) => x + cuivre[i]);
    } else communes.set(code, [locaux, ftth, v[col.porteur_projet], v[col.categorie_fthd], cuivre]);
  }
  for (const f of communes.values()) {
    f[0] = Math.round(f[0]);
    f[1] = Math.round(f[1]);
    f[4] = f[4].map(Math.round);
  }
  return { trimestre, annees, communes };
}

/** L'adresse du fichier change à chaque trimestre : on la lit dans le jeu. */
export async function adresseFibre(lireJson: (url: string) => Promise<unknown>): Promise<string> {
  const d = (await lireJson(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`)) as {
    resources?: { title?: string; url?: string; last_modified?: string }[];
  };
  const r = (d.resources ?? [])
    .filter((x) => /ftth-cu\.csv$/i.test(x.title ?? x.url ?? ''))
    .sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''))[0];
  if (!r?.url) throw new Error('aucune ressource « …ftth-cu.csv » dans le jeu de l’ANCT');
  return r.url;
}

export async function collecterFibre(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<FibreCommunes | null> {
  const vers = join(cache, 'anct-fibre-cuivre.csv');
  try {
    await telecharger(await adresseFibre(lireJson), vers);
  } catch {
    dire('Fibre optique indisponible : celle de l’ingestion précédente reste en place.');
    return null;
  }
  const f = await lireFibre(vers);
  if (f.communes.size < 30000) {
    dire(`Fibre optique : ${f.communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  let locaux = 0;
  let ftth = 0;
  for (const c of f.communes.values()) {
    locaux += c[0];
    ftth += c[1];
  }
  dire(
    `Fibre optique, ${f.trimestre} : ${f.communes.size.toLocaleString('fr-FR')} communes, ` +
      `${Math.round((100 * ftth) / locaux)} % des locaux raccordables.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...f };
}

export function ecrireFibre(sortie: string, f: FibreCommunes): number {
  return ecrireParDepartement(sortie, 'fibre', f.communes, () => ({ maj: f.maj, trimestre: f.trimestre, annees: f.annees }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const f = await collecterFibre(lireJson, telecharger, cache, console.log);
  if (f) console.log(`${ecrireFibre(sortie, f)} départements écrits.`);
}
