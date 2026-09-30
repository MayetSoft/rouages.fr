/**
 * Les étiquettes énergétiques des logements, commune par commune, d'après la
 * base des diagnostics de performance énergétique (DPE) de l'ADEME.
 *
 * On compte des diagnostics, pas des logements : un DPE est établi à la vente
 * ou à la location, parfois refait pour le même logement, et le parc qui ne
 * change pas de main n'y figure pas. La page le dit, et donne la part des
 * étiquettes F et G parmi les diagnostics établis depuis juillet 2021, date de
 * la méthode actuelle — l'ancienne base, faite autrement, n'est pas mêlée.
 *
 * L'ADEME agrège elle-même : une requête par département rend le nombre de
 * diagnostics de chaque commune par étiquette, en une seconde. Le département
 * et la France sont les sommes de leurs communes.
 *
 * Lancé seul — `tsx scripts/dpe-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-dpe.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

export const JEU = 'meg-83tjwtg8dyz4vv7h1dqe';
const BASE = `https://data.ademe.fr/data-fair/api/v1/datasets/${JEU}`;
export const ETIQUETTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Nombre de diagnostics par étiquette, de A à G. */
export type Etiquettes = number[];

export interface DpeCommunes {
  maj: string;
  /** La date de mise à jour de la base, selon l'ADEME. */
  base: string;
  communes: Map<string, Etiquettes>;
  departements: Map<string, Etiquettes>;
  france: Etiquettes;
}

interface Agregat {
  total_other?: number;
  aggs: { value: string; total: number; aggs?: { value: string; total: number }[] }[];
}

const vide = () => ETIQUETTES.map(() => 0);
const ajouter = (a: Etiquettes, b: Etiquettes) => a.forEach((_, i) => (a[i] += b[i]));

export async function collecterDpe(
  lireJson: (url: string) => Promise<unknown>,
  deps: string[],
  dire: (m: string) => void,
): Promise<DpeCommunes | null> {
  const meta = (await lireJson(`${BASE}?select=updatedAt,count`)) as { updatedAt?: string; count?: number };
  if ((meta.count ?? 0) < 1_000_000) {
    dire(`DPE : ${meta.count ?? 0} diagnostics seulement dans la base, on garde l’ingestion précédente.`);
    return null;
  }
  const communes = new Map<string, Etiquettes>();
  const departements = new Map<string, Etiquettes>();
  const france = vide();
  for (const dep of deps) {
    const url =
      `${BASE}/values_agg?field=code_insee_ban;etiquette_dpe&agg_size=1000&metric=count` +
      `&qs=${encodeURIComponent(`code_departement_ban:"${dep}"`)}`;
    const a = (await lireJson(url)) as Agregat;
    // Plus de mille communes dans un département, et la liste serait tronquée.
    if (a.total_other) throw new Error(`DPE du ${dep} : ${a.total_other} diagnostics hors de la liste rendue`);
    for (const x of a.aggs) {
      const code = communeDe(x.value);
      if (departementDe(code) !== dep) continue;
      const e = communes.get(code) ?? vide();
      for (const y of x.aggs ?? []) {
        const i = ETIQUETTES.indexOf(y.value);
        if (i >= 0) e[i] += y.total;
      }
      communes.set(code, e);
    }
  }
  for (const [code, e] of communes) {
    const dep = departementDe(code);
    if (!departements.has(dep)) departements.set(dep, vide());
    ajouter(departements.get(dep)!, e);
    ajouter(france, e);
  }
  const total = france.reduce((s, x) => s + x, 0);
  if (communes.size < 30000) {
    dire(`DPE : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  dire(
    `DPE depuis juillet 2021 : ${total.toLocaleString('fr-FR')} diagnostics dans ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${Math.round((100 * (france[5] + france[6])) / total)} % en F ou G.`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    base: (meta.updatedAt ?? '').slice(0, 10),
    communes,
    departements,
    france,
  };
}

export function ecrireDpe(sortie: string, d: DpeCommunes): number {
  return ecrireParDepartement(sortie, 'dpe', d.communes, (dep) => ({
    maj: d.maj,
    base: d.base,
    dep: d.departements.get(dep) ?? null,
    france: d.france,
  }));
}

// Lancé seul : les départements de l'index du site, et les fichiers réécrits.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { deps: Record<string, string> };
  const d = await collecterDpe(lireJson, Object.keys(index.deps), console.log);
  if (d) console.log(`${ecrireDpe(sortie, d)} départements écrits.`);
}
