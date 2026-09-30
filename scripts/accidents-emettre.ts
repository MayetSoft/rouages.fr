/**
 * Les accidents corporels de la circulation dans chaque commune, sur les cinq
 * dernières années publiées : leur nombre, les personnes tuées, les personnes
 * blessées. D'après les bases annuelles de l'Observatoire national
 * interministériel de la sécurité routière (ONISR), une ligne par accident et
 * une par usager.
 *
 * Cinq années plutôt qu'une : une commune de mille habitants compte un
 * accident corporel tous les deux ou trois ans, et une année seule dirait
 * surtout le hasard. Les blessés ne sont pas séparés entre hospitalisés et
 * légers : on donne le total.
 *
 * Les fichiers changent de nom d'une année à l'autre — `caracteristiques`,
 * `carcteristiques`, `caract` — : on les reconnaît dans la liste du jeu.
 *
 * Lancé seul — `tsx scripts/accidents-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-accidents.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '53698f4ca3a729239d2036df';
const ANNEES = 5;

/** Accidents, tués, blessés, sur la période. */
export type Accidents = [number, number, number];

export interface AccidentsCommunes {
  maj: string;
  annees: number[];
  communes: Map<string, Accidents>;
}

const lire = (chemin: string) => lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>, ';');

export async function collecterAccidents(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<AccidentsCommunes | null> {
  const d = (await lireJson(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`)) as { resources?: { url?: string }[] };
  const caract = new Map<number, string>();
  const usagers = new Map<number, string>();
  for (const r of d.resources ?? []) {
    const nom = (r.url ?? '').split('/').pop() ?? '';
    const c = /^(?:caracteristiques|carcteristiques|caract)[-_](\d{4})\.csv$/i.exec(nom);
    const u = /^usagers[-_](\d{4})\.csv$/i.exec(nom);
    if (c) caract.set(Number(c[1]), r.url!);
    if (u) usagers.set(Number(u[1]), r.url!);
  }
  const annees = [...caract.keys()].filter((a) => usagers.has(a) && a >= 2019).sort().slice(-ANNEES);
  if (annees.length < ANNEES) {
    dire(`Accidents : ${annees.length} années complètes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Accidents>();
  for (const annee of annees) {
    const vc = join(cache, `baac-caract-${annee}.csv`);
    const vu = join(cache, `baac-usagers-${annee}.csv`);
    await telecharger(caract.get(annee)!, vc);
    await telecharger(usagers.get(annee)!, vu);
    // L'accident et sa commune.
    const ou = new Map<string, string>();
    let col: Record<string, number> | null = null;
    for await (const v of lire(vc)) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
        // L'identifiant s'appelle `Accident_Id` dans le fichier de 2022.
        col.Num_Acc ??= col.Accident_Id;
        if (col.Num_Acc === undefined || col.com === undefined) throw new Error(`caractéristiques ${annee} : colonnes absentes`);
        continue;
      }
      const brut = communeDe((v[col.com] ?? '').trim());
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      if (!code) continue;
      ou.set(v[col.Num_Acc], code);
      const x = communes.get(code) ?? [0, 0, 0];
      x[0]++;
      communes.set(code, x);
    }
    // Les usagers : 2 tué, 3 blessé hospitalisé, 4 blessé léger.
    col = null;
    for await (const v of lire(vu)) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
        if (col.Num_Acc === undefined || col.grav === undefined) throw new Error(`usagers ${annee} : colonnes absentes`);
        continue;
      }
      const code = ou.get(v[col.Num_Acc]);
      if (!code) continue;
      const g = (v[col.grav] ?? '').trim();
      const x = communes.get(code)!;
      if (g === '2') x[1]++;
      else if (g === '3' || g === '4') x[2]++;
    }
    dire(`  accidents ${annee} : ${ou.size.toLocaleString('fr-FR')} rattachés à une commune.`);
  }
  const t = [...communes.values()].reduce((s, x) => [s[0] + x[0], s[1] + x[1], s[2] + x[2]], [0, 0, 0]);
  if (t[0] < 200000) {
    dire(`Accidents : ${t[0]} seulement, on garde l’ingestion précédente.`);
    return null;
  }
  dire(
    `Accidents ${annees[0]} à ${annees[annees.length - 1]} : ${t[0].toLocaleString('fr-FR')} accidents corporels, ` +
      `${t[1].toLocaleString('fr-FR')} tués, ${t[2].toLocaleString('fr-FR')} blessés.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annees, communes };
}

export function ecrireAccidents(sortie: string, a: AccidentsCommunes): number {
  return ecrireParDepartement(sortie, 'accidents', a.communes, () => ({ maj: a.maj, annees: a.annees }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const a = await collecterAccidents(lireJson, telecharger, cache, console.log);
  if (a) console.log(`${ecrireAccidents(sortie, a)} départements écrits.`);
}
