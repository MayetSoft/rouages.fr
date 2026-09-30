/**
 * Les immeubles protégés au titre des monuments historiques dans chaque
 * commune — classés ou inscrits —, d'après la base Mérimée du ministère de la
 * Culture.
 *
 * Ce qu'en tire la page : combien, lesquels, et ce que cela change pour qui
 * habite autour. Aux abords d'un monument, des travaux sur l'aspect extérieur
 * d'un immeuble passent par l'architecte des Bâtiments de France ; sans
 * périmètre délimité, les abords couvrent ce qui est visible du monument, ou
 * en même temps que lui, à moins de 500 mètres (code du patrimoine,
 * L621-30). Le site ne sait pas dire si une adresse y est : il n'a pas les
 * périmètres.
 *
 * La commune d'une notice est celle « lors de la protection » : on la reporte
 * sur la commune actuelle par le découpage. Un immeuble à cheval sur deux
 * communes — un viaduc — compte dans chacune. Les notices de renvoi, qui
 * doublent une autre notice, sont écartées.
 *
 * Le fichier est séparé par des barres verticales, et ses champs de texte
 * contiennent des retours à la ligne entre guillemets.
 *
 * Lancé seul — `tsx scripts/monuments-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-monuments.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '5af120e5b595087cfabcde81';
export const FICHIER = 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/merimee.csv';

/** Référence Mérimée, titre, 1 classé (en tout ou partie), 0 inscrit seulement. */
export type Monument = [string, string, 0 | 1];

export interface Monuments {
  maj: string;
  communes: Map<string, Monument[]>;
}

export async function collecterMonuments(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Monuments | null> {
  const vers = join(cache, 'merimee.csv');
  await telecharger(FICHIER, vers);
  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Monument[]>();
  let col: Record<string, number> | null = null;
  let lues = 0;
  for await (const v of lignesCsv(createReadStream(vers) as unknown as AsyncIterable<Uint8Array>, '|')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      for (const n of ['Reference', 'Titre_editorial_de_la_notice', 'Typologie_de_la_protection', 'COG_Insee_lors_de_la_protection', 'Typologie_du_dossier']) {
        if (col[n] === undefined) throw new Error(`Mérimée : colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const ref = (v[col.Reference] ?? '').trim();
    const titre = (v[col.Titre_editorial_de_la_notice] ?? '').replace(/\s+/g, ' ').trim();
    const protection = (v[col.Typologie_de_la_protection] ?? '').toLowerCase();
    if (!ref || !titre || !protection) continue;
    if (/renvoi/i.test(v[col.Typologie_du_dossier] ?? '')) continue;
    lues++;
    const classe: 0 | 1 = protection.includes('classé') ? 1 : 0;
    const codes = new Set<string>();
    for (const brut of (v[col.COG_Insee_lors_de_la_protection] ?? '').split(/[;,]/)) {
      const c = communeDe(brut.trim());
      const code = actuelles.has(c) ? c : reports.get(c);
      if (code) codes.add(code);
    }
    for (const code of codes) {
      const l = communes.get(code) ?? [];
      l.push([ref, titre, classe]);
      communes.set(code, l);
    }
  }
  if (lues < 40000) {
    dire(`Monuments historiques : ${lues} notices seulement, on garde l’ingestion précédente.`);
    return null;
  }
  for (const l of communes.values()) l.sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1], 'fr'));
  dire(
    `Monuments historiques : ${lues.toLocaleString('fr-FR')} immeubles protégés dans ` +
      `${communes.size.toLocaleString('fr-FR')} communes.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireMonuments(sortie: string, m: Monuments): number {
  return ecrireParDepartement(sortie, 'monuments', m.communes, () => ({ maj: m.maj }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const m = await collecterMonuments(telecharger, cache, console.log);
  if (m) console.log(`${ecrireMonuments(sortie, m)} départements écrits.`);
}
