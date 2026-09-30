/**
 * Le potentiel radon de chaque commune : la zone, de 1 à 3, où l'arrêté du
 * 27 juin 2018 range chacune d'elles, d'après le fichier que l'autorité de
 * sûreté nucléaire publie sur data.gouv.
 *
 * Le zonage est celui des communes au 1er janvier 2016. Une commune fusionnée
 * depuis reçoit les zones de celles qui l'ont formée, par le découpage
 * administratif : quand elles diffèrent, la page le dit plutôt que d'en
 * choisir une.
 *
 * Lancé seul — `tsx scripts/radon-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-radon.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '53834c53a3a72906c7ec5c4c';
export const URL_RADON =
  'https://static.data.gouv.fr/resources/connaitre-le-potentiel-radon-de-ma-commune/20190506-174309/radon.csv';

export interface RadonCommunes {
  maj: string;
  /** Code commune -> les zones, de 1 à 3, distinctes et dans l'ordre. */
  communes: Map<string, number[]>;
}

export async function lireRadon(chemin: string): Promise<Map<string, number[]>> {
  const { actuelles, reports } = reportsDuDecoupage();
  const zones = new Map<string, Set<number>>();
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>, ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['insee_com', 'classe_potentiel']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const brut = codeCommune(v[col.insee_com] ?? '');
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    const zone = Number(v[col.classe_potentiel]);
    if (!code || !(zone >= 1 && zone <= 3)) continue;
    if (!zones.has(code)) zones.set(code, new Set());
    zones.get(code)!.add(zone);
  }
  return new Map([...zones].map(([c, z]) => [c, [...z].sort()]));
}

export async function collecterRadon(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<RadonCommunes | null> {
  const vers = join(cache, 'asn-radon.csv');
  await telecharger(URL_RADON, vers);
  const communes = await lireRadon(vers);
  if (communes.size < 30000) {
    dire(`Radon : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const n = [1, 2, 3].map((z) => [...communes.values()].filter((x) => x.includes(z)).length);
  const mixtes = [...communes.values()].filter((x) => x.length > 1).length;
  dire(
    `Radon : ${communes.size.toLocaleString('fr-FR')} communes — zone 1 ${n[0]}, zone 2 ${n[1]}, zone 3 ${n[2]}` +
      (mixtes ? `, ${mixtes} de zones mêlées après fusion.` : '.'),
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireRadon(sortie: string, r: RadonCommunes): number {
  // L'année où l'ASN a déposé le fichier, qu'on lit dans son adresse.
  const publie = /\/(\d{4})\d{4}-\d{6}\//.exec(URL_RADON)?.[1] ?? null;
  return ecrireParDepartement(sortie, 'radon', r.communes, () => ({ maj: r.maj, arrete: '2018-06-27', publie }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const r = await collecterRadon(telecharger, cache, console.log);
  if (r) console.log(`${ecrireRadon(sortie, r)} départements écrits.`);
}
