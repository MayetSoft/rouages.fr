/**
 * Les défibrillateurs déclarés dans chaque commune, d'après Géo'DAE, la base
 * nationale que tiennent les exploitants eux-mêmes.
 *
 * Comptés : les appareils déclarés en fonctionnement dont la fiche est
 * validée, hors appareils mobiles, hors doublons marqués par la base et hors
 * fiches « à supprimer » ou « non identifiées » ; parmi eux, ceux installés à
 * l'extérieur. L'état « actif » n'est pas exigé : la moitié des fiches en
 * fonctionnement le laissent vide. Les horaires déclarés ne sont pas repris : ils se
 * contredisent parfois d'une fiche à l'autre pour un même lieu. Ni le nom de
 * l'appareil ni celui de l'exploitant, qui peut être une personne : la page
 * renvoie à la base pour les emplacements.
 *
 * Lancé seul — `tsx scripts/dae-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-dae.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '61556e1e9d6adb2df86eb0fc';

/** Appareils, dont à l'extérieur. */
export type Dae = [number, number];

export interface DaeCommunes {
  maj: string;
  communes: Map<string, Dae>;
}

export async function lireDae(chemin: string): Promise<Map<string, Dae>> {
  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Dae>();
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>, ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      for (const n of ['c_com_insee', 'c_etat', 'c_etat_fonct', 'c_etat_valid', 'c_acc', 'c_dae_mobile', 'c_doublon']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    if (v[col.c_etat_fonct] !== 'En fonctionnement' || v[col.c_etat_valid] !== 'validées') continue;
    if (v[col.c_etat] === 'A supprimer' || v[col.c_etat] === 'Non identifié') continue;
    if (v[col.c_dae_mobile] === 't' || v[col.c_doublon] === 't') continue;
    const brut = communeDe((v[col.c_com_insee] ?? '').trim());
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    if (!code) continue;
    const d = communes.get(code) ?? [0, 0];
    d[0]++;
    if (v[col.c_acc] === 'Extérieur') d[1]++;
    communes.set(code, d);
  }
  return communes;
}

/** L'adresse du fichier change à chaque publication, quotidienne : on la lit dans le jeu. */
export async function adresseDae(lireJson: (url: string) => Promise<unknown>): Promise<string> {
  const d = (await lireJson(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`)) as {
    resources?: { title?: string; url?: string }[];
  };
  const r = (d.resources ?? []).find((x) => /geodae\.csv$/i.test(x.title ?? x.url ?? ''));
  if (!r?.url) throw new Error('aucune ressource « geodae.csv » dans le jeu Géo’DAE');
  return r.url;
}

export async function collecterDae(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<DaeCommunes | null> {
  const vers = join(cache, 'geodae.csv');
  await telecharger(await adresseDae(lireJson), vers);
  const communes = await lireDae(vers);
  const total = [...communes.values()].reduce((s, d) => s + d[0], 0);
  if (total < 50000) {
    dire(`Défibrillateurs : ${total} appareils seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const dehors = [...communes.values()].reduce((s, d) => s + d[1], 0);
  dire(
    `Défibrillateurs : ${total.toLocaleString('fr-FR')} appareils dans ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `dont ${dehors.toLocaleString('fr-FR')} à l’extérieur.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireDae(sortie: string, d: DaeCommunes): number {
  return ecrireParDepartement(sortie, 'dae', d.communes, () => ({ maj: d.maj }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const d = await collecterDae(lireJson, telecharger, cache, console.log);
  if (d) console.log(`${ecrireDae(sortie, d)} départements écrits.`);
}
