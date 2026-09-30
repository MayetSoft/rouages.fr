/**
 * Les espaces naturels, agricoles et forestiers consommés dans chaque commune,
 * année par année depuis 2011, d'après les fichiers fonciers retraités par le
 * Cerema pour le portail national de l'artificialisation.
 *
 * La mesure est celle que retient la loi Climat et résilience (article 191) :
 * la décennie 2011-2021 sert de référence, et la consommation de 2021 à 2031
 * doit en être la moitié — un objectif national, décliné par les régions puis
 * par les documents d'urbanisme, et non un plafond commune par commune.
 *
 * Gardés : la surface consommée chaque année (du 1er janvier au 1er janvier
 * suivant), la part de l'habitat et celle des activités sur toute la période,
 * et la surface de la commune. En mètres carrés dans le fichier, en hectares
 * ici, au centième.
 *
 * Chaque millésime est un jeu distinct sur data.gouv : son adresse est donc
 * fixée ici, et la veille signale le suivant.
 *
 * Lancé seul — `tsx scripts/artificialisation-emettre.ts` —, il réécrit les
 * fichiers `public/territoires/dep/XX-artificialisation.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '6a01b9280dd2d45907e5fc61';
export const URL_CONSO =
  'https://static.data.gouv.fr/resources/consommation-despaces-naturels-agricoles-et-forestiers-du-1er-janvier-2011-au-1er-janvier-2025/20260724-142909/conso-com.csv';

/**
 * Hectares consommés chaque année ; dont habitat et dont activités sur toute
 * la période ; surface de la commune ; puis les totaux tels que le Cerema les
 * publie — toute la période, la décennie 2011-2021, et depuis 2021 —, plutôt
 * que des sommes d'années arrondies, qui s'en écartent d'un centième.
 */
export type Conso = [number[], number, number, number, number, number | null, number | null];

export interface ConsoCommunes {
  maj: string;
  /** La première année de la série : 2011 pour « du 1er janvier 2011 au 1er janvier 2012 ». */
  annees: number[];
  communes: Map<string, Conso>;
}

const ha = (m2: string | undefined) => Math.round((Number(m2) || 0) / 100) / 100;

export async function lireConso(chemin: string): Promise<Omit<ConsoCommunes, 'maj'>> {
  const communes = new Map<string, Conso>();
  let col: Record<string, number> | null = null;
  let annees: number[] = [];
  let debut = 0;
  let fin = 0;
  for await (const v of lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>, ',')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      // Les colonnes annuelles s'appellent `nafAAartBB` : de l'année AA à BB.
      annees = Object.keys(col)
        .map((n) => /^naf(\d\d)art(\d\d)$/.exec(n))
        .filter((m): m is RegExpExecArray => !!m && Number(m[2]) === Number(m[1]) + 1)
        .map((m) => 2000 + Number(m[1]))
        .sort();
      if (annees.length < 10) throw new Error('moins de dix années dans le fichier — il a changé de forme');
      debut = annees[0] % 100;
      fin = (annees[annees.length - 1] + 1) % 100;
      for (const n of ['idcom', 'surfcom2025', `naf${debut}art${fin}`, `art${debut}hab${fin}`, `art${debut}act${fin}`]) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const code = codeCommune(v[col.idcom] ?? '');
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    const serie = annees.map((a) => ha(v[col![`naf${String(a % 100).padStart(2, '0')}art${String((a + 1) % 100).padStart(2, '0')}`]]));
    communes.set(code, [
      serie,
      ha(v[col[`art${debut}hab${fin}`]]),
      ha(v[col[`art${debut}act${fin}`]]),
      Math.round((Number(v[col.surfcom2025]) || 0) / 10000),
      ha(v[col[`naf${debut}art${fin}`]]),
      col.naf11art21 !== undefined ? ha(v[col.naf11art21]) : null,
      col[`naf21art${fin}`] !== undefined ? ha(v[col[`naf21art${fin}`]]) : null,
    ]);
  }
  return { annees, communes };
}

export async function collecterArtificialisation(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<ConsoCommunes | null> {
  const vers = join(cache, 'cerema-conso-com.csv');
  await telecharger(URL_CONSO, vers);
  const c = await lireConso(vers);
  if (c.communes.size < 30000) {
    dire(`Artificialisation : ${c.communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const total = [...c.communes.values()].reduce((s, x) => s + x[4], 0);
  dire(
    `Artificialisation, ${c.annees[0]} à ${c.annees[c.annees.length - 1] + 1} : ${c.communes.size.toLocaleString('fr-FR')} communes, ` +
      `${Math.round(total).toLocaleString('fr-FR')} ha consommés.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...c };
}

export function ecrireArtificialisation(sortie: string, c: ConsoCommunes): number {
  return ecrireParDepartement(sortie, 'artificialisation', c.communes, () => ({ maj: c.maj, annees: c.annees }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const c = await collecterArtificialisation(telecharger, cache, console.log);
  if (c) console.log(`${ecrireArtificialisation(sortie, c)} départements écrits.`);
}
