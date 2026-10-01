/**
 * Les appellations d'origine et les indications géographiques dont l'aire
 * comprend la commune, d'après l'Institut national de l'origine et de la
 * qualité (INAO) : AOC et AOP — un fromage, un vin —, IGP — une viande, un
 * vin de pays —, et IG des spiritueux.
 *
 * Être dans l'aire, c'est que ce qui y est produit selon le cahier des charges
 * peut porter le nom : pas que quiconque le produise ici. La page le dit.
 *
 * L'aire d'une IGP de vin liste aussi, pour chaque commune, toutes ses
 * dénominations complémentaires — « Val de Loire Vendée » jusque dans
 * l'Allier. Une dénomination qui prolonge le nom d'une autre présente dans la
 * même commune est donc rangée sous elle : la page dit « Val de Loire ».
 *
 * Les fichiers sont en Latin-1, séparés par des points-virgules ; la commune y
 * est désignée par son code INSEE, reporté sur la commune actuelle.
 *
 * Lancé seul — `tsx scripts/appellations-emettre.ts` —, il réécrit les
 * fichiers `public/territoires/dep/XX-appellations.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEUX = { ao: '53698ecca3a729239d203579', ig: '53698ec7a3a729239d20356a' } as const;

/** Appellations d'origine (AOC, AOP), puis indications géographiques (IGP, IG). */
export type AppellationsCommune = [string[], string[]];

export interface Appellations {
  maj: string;
  dates: { ao: string; ig: string };
  communes: Map<string, AppellationsCommune>;
}

type Ressource = { title?: string; url?: string; format?: string; last_modified?: string };

/** Les noms qui ne prolongent pas un autre nom de la liste : « Val de Loire Cher » sous « Val de Loire ». */
export function sansDeclinaisons(noms: string[]): string[] {
  const tous = [...new Set(noms)];
  return tous
    .filter((n) => !tous.some((m) => m !== n && n.startsWith(`${m} `)))
    .sort((a, b) => a.localeCompare(b, 'fr'));
}

export async function collecterAppellations(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Appellations | null> {
  const { actuelles, reports } = reportsDuDecoupage();
  const parCommune = new Map<string, [Set<string>, Set<string>]>();
  const dates = { ao: '', ig: '' };
  for (const [i, cle] of (['ao', 'ig'] as const).entries()) {
    const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEUX[cle]}/resources/?page_size=20`)) as { data?: Ressource[] };
    const res = (r.data ?? [])
      .filter((x) => x.url && /csv/i.test(x.format ?? ''))
      .sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''))[0];
    if (!res) throw new Error(`INAO ${cle} : aucun fichier`);
    dates[cle] = (res.last_modified ?? '').slice(0, 10);
    const vers = join(cache, `inao-${cle}-${dates[cle]}.csv`);
    await telecharger(res.url!, vers);
    let col: Record<string, number> | null = null;
    let n = 0;
    for await (const v of lignesCsv([new TextDecoder('latin1').decode(readFileSync(vers))], ';')) {
      if (!col) {
        col = Object.fromEntries(v.map((x, k) => [x.trim(), k]));
        for (const c of ['CI', 'Aire géographique']) {
          if (col[c] === undefined) throw new Error(`INAO ${cle} : colonne « ${c} » absente`);
        }
        continue;
      }
      const brut = communeDe((v[col.CI] ?? '').trim());
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      const nom = (v[col['Aire géographique']] ?? '').replace(/\s+/g, ' ').replace(/’/g, '’').trim();
      if (!code || !nom) continue;
      const x = parCommune.get(code) ?? [new Set<string>(), new Set<string>()];
      x[i].add(nom);
      parCommune.set(code, x);
      n++;
    }
    if (n < (cle === 'ao' ? 30000 : 200000)) {
      dire(`Appellations : ${n} lignes seulement pour ${cle}, on garde l’ingestion précédente.`);
      return null;
    }
  }
  const communes = new Map<string, AppellationsCommune>();
  for (const [code, [ao, ig]] of parCommune) communes.set(code, [sansDeclinaisons([...ao]), sansDeclinaisons([...ig])]);
  dire(`Appellations de l’INAO : ${communes.size.toLocaleString('fr-FR')} communes dans au moins une aire.`);
  return { maj: new Date().toISOString().slice(0, 10), dates, communes };
}

export function ecrireAppellations(sortie: string, a: Appellations): number {
  return ecrireParDepartement(sortie, 'appellations', a.communes, () => ({ maj: a.maj, dates: a.dates }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const a = await collecterAppellations(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (a) console.log(`${ecrireAppellations(sortie, a)} départements écrits.`);
}
