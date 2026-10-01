/**
 * Les objets mobiliers protégés au titre des monuments historiques dans
 * chaque commune — classés ou inscrits —, d'après la base Palissy du
 * ministère de la Culture : un retable, une cloche, une statue, un orgue…,
 * le plus souvent dans une église.
 *
 * Seuls les dossiers individuels et les dossiers d'ensemble sont comptés : un
 * sous-dossier décrit une partie d'un objet déjà compté. Un objet désinscrit
 * est écarté. La commune est celle de la notice (code « COG »), reportée sur
 * la commune actuelle par le découpage. Un titre qui nomme une personne
 * — civilité suivie d'un nom — n'est pas repris.
 *
 * Le fichier fait 365 Mo, séparé par des barres verticales, avec des retours
 * à la ligne entre guillemets.
 *
 * Lancé seul — `tsx scripts/objets-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-objets.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const FICHIER = 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/palissy.csv';
const LISTES = 40;

/** Classés, inscrits, et jusqu'à quarante objets : référence, titre, 1 classé ou 0 inscrit. */
export type ObjetsCommune = [number, number, [string, string, 0 | 1][]];

export interface Objets {
  maj: string;
  communes: Map<string, ObjetsCommune>;
}

export async function collecterObjets(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Objets | null> {
  const vers = join(cache, 'palissy.csv');
  await telecharger(FICHIER, vers);
  const { actuelles, reports } = reportsDuDecoupage();
  const parCommune = new Map<string, { c: number; i: number; liste: [string, string, 0 | 1][] }>();
  let col: Record<string, number> | null = null;
  let lus = 0;
  for await (const v of lignesCsv(createReadStream(vers) as unknown as AsyncIterable<Uint8Array>, '|')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      for (const n of ['Reference', 'Titre_editorial', 'Typologie_de_la_protection', 'COG_Insee', 'Typologie_du_dossier']) {
        if (col[n] === undefined) throw new Error(`Palissy : colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    const protection = (v[col.Typologie_de_la_protection] ?? '').toLowerCase();
    if (!protection.includes('titre objet') || protection.includes('désinscrit')) continue;
    if (/^sous-dossier/i.test((v[col.Typologie_du_dossier] ?? '').trim())) continue;
    const brut = communeDe((v[col.COG_Insee] ?? '').trim());
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    if (!code) continue;
    lus++;
    const classe: 0 | 1 = /classé au titre objet/.test(protection) ? 1 : 0;
    const x = parCommune.get(code) ?? { c: 0, i: 0, liste: [] };
    if (classe) x.c++;
    else x.i++;
    const titre = (v[col.Titre_editorial] ?? '').replace(/\s+/g, ' ').trim();
    const ref = (v[col.Reference] ?? '').trim();
    if (titre && ref && !nommeUnePersonne(titre)) x.liste.push([ref, titre.length > 140 ? `${titre.slice(0, 137)}…` : titre, classe]);
    parCommune.set(code, x);
  }
  if (lus < 150000) {
    dire(`Objets protégés : ${lus} seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const communes = new Map<string, ObjetsCommune>();
  for (const [code, x] of parCommune) {
    x.liste.sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1], 'fr'));
    communes.set(code, [x.c, x.i, x.liste.slice(0, LISTES)]);
  }
  dire(`Objets protégés : ${lus.toLocaleString('fr-FR')} objets dans ${communes.size.toLocaleString('fr-FR')} communes.`);
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireObjets(sortie: string, o: Objets): number {
  return ecrireParDepartement(sortie, 'objets', o.communes, () => ({ maj: o.maj }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const o = await collecterObjets(telecharger, cache, console.log);
  if (o) console.log(`${ecrireObjets(sortie, o)} départements écrits.`);
}
