/**
 * Le budget voté face au budget exécuté, année par année, d'après les
 * « situations mensuelles budgétaires de l'État » publiées en série longue
 * (data.economie.gouv.fr).
 *
 * Le jeu porte, en pièces jointes, des fichiers « textes législatifs » : pour
 * chaque exercice depuis 2013, et pour les mêmes vingt-six lignes — le solde,
 * les dépenses du budget général par nature, les prélèvements sur recettes,
 * les recettes par impôt, les remboursements et dégrèvements —, trois
 * chiffres :
 *
 * - **la loi de finances initiale** (LFI), ce que le Parlement a voté ;
 * - **la dernière loi de finances rectificative ou de fin de gestion**, quand
 *   l'année en a eu une, et pour les seules lignes de total ;
 * - **l'exécution**, ce qui a été dépensé ou perçu, telle que la situation
 *   mensuelle de décembre l'arrête.
 *
 * Trois chiffres d'une même année, sur un même périmètre : c'est l'écart
 * entre le voté et l'exécuté que la page montre. D'une année sur l'autre, le
 * périmètre du budget général change (transferts, mesures de périmètre) ; la
 * page le dit, et ne trace pas de tendance.
 *
 * Les noms des pièces jointes changent quand une période s'ajoute
 * (« 2013-2023 », « 2024-xx ») : la collecte prend toutes celles dont le titre
 * commence par « textes législatifs ».
 *
 * **L'exécution vient de la série mensuelle, au mois de décembre**, dont le
 * jeu dit les données définitives. Le fichier des textes législatifs la
 * reprend, mais pas toujours juste : le 12 octobre 2026, son total des
 * dépenses nettes du budget général de 2019, 2020 et 2021 était celui de
 * l'année précédente — la somme de ses propres lignes par nature donnait,
 * elle, les chiffres de la série. Chaque écart est gardé dans le fichier
 * (`corrections`) et dit sur la page.
 *
 * Lancé seul — `npx tsx scripts/budget-execution-emettre.ts` —, il réécrit
 * `public/territoires/budget-etat-execution.json`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { BudgetExecution, LigneExecution } from '../src/modele/budget-etat.ts';
import { telechargerSiAbsent } from './par-departement.ts';

export const JEU_SMB = 'situations-mensuelles-budgetaires-series-longues';
const PORTAIL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets';
const TEXTES: Record<string, keyof Omit<LigneExecution, 'categorie' | 'sousCategorie' | 'ligne'>> = {
  LFI: 'lfi',
  'Dernière LFR/LFG': 'lfr',
  Exécution: 'execution',
};

type LireJson = (url: string) => Promise<unknown>;
type LireOctets = (url: string) => Promise<ArrayBuffer>;

/** Un CSV du jeu : UTF-16 avec marque d'ordre, parfois servi compressé ; point-virgule ; virgule décimale. */
export function lireCsv(octets: ArrayBuffer): string[][] {
  let b = Buffer.from(octets);
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
  const texte =
    b[0] === 0xff && b[1] === 0xfe
      ? new TextDecoder('utf-16le').decode(b.subarray(2))
      : b[0] === 0xfe && b[1] === 0xff
        ? new TextDecoder('utf-16be').decode(b.subarray(2))
        : new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
  return texte
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(';'));
}
const nombre = (s: string | undefined) => {
  const t = (s ?? '').replace(/\s/g, '').replace(',', '.');
  return t && Number.isFinite(Number(t)) ? Number(t) : null;
};
const propre = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export async function collecterExecution(lireJson: LireJson, lireOctets: LireOctets, dire: (m: string) => void): Promise<BudgetExecution> {
  const fiche = (await lireJson(`${PORTAIL}/${JEU_SMB}`)) as { metas?: { default?: { modified?: string } } };
  const pj = (await lireJson(`${PORTAIL}/${JEU_SMB}/attachments`)) as { attachments?: { metas: { id: string; title: string; url: string } }[] };
  const pieces = (pj.attachments ?? []).map((a) => a.metas);
  const textes = pieces.filter((m) => /^textes l[ée]gislatifs/i.test(m.title));
  if (!textes.length) throw new Error(`${JEU_SMB} : aucune pièce « textes législatifs »`);

  const lignes = new Map<string, LigneExecution>();
  for (const t of textes) {
    const rangs = lireCsv(await lireOctets(t.url));
    const tete = rangs[0] ?? [];
    const annees = tete.map((h, i) => [i, Number(propre(h))] as const).filter(([, a]) => Number.isInteger(a) && a > 2000);
    if (!annees.length || propre(tete[5]) !== 'Texte législatif') throw new Error(`${t.title} : en-tête inattendu`);
    for (const r of rangs.slice(1)) {
      const champ = TEXTES[propre(r[5])];
      const ligne = propre(r[4]);
      if (!champ || !ligne) continue;
      const cle = `${propre(r[2])}|${propre(r[3])}|${ligne}`;
      if (!lignes.has(cle)) lignes.set(cle, { categorie: propre(r[2]), sousCategorie: propre(r[3]), ligne, lfi: {}, lfr: {}, execution: {} });
      const l = lignes.get(cle)!;
      for (const [i, a] of annees) {
        const v = nombre(r[i]);
        if (v !== null) l[champ][a] = Math.round(v);
      }
    }
  }

  // L'exécution est celle que la série mensuelle arrête en décembre ; un écart avec les textes est gardé.
  let verifiees = 0;
  const corrections: BudgetExecution['corrections'] = [];
  for (const s of pieces.filter((m) => /^s[ée]ries? longues? smb/i.test(m.title))) {
    const rangs = lireCsv(await lireOctets(s.url));
    const tete = rangs[0] ?? [];
    for (const [i, h] of tete.entries()) {
      const m = /^31\/12\/(\d{4})$/.exec(propre(h));
      if (!m) continue;
      const a = Number(m[1]);
      for (const r of rangs.slice(1)) {
        const l = lignes.get(`${propre(r[2])}|${propre(r[3])}|${propre(r[4])}`);
        const v = nombre(r[i]);
        if (!l || v === null || l.execution[a] === undefined) continue;
        if (Math.abs(l.execution[a] - v) > 1) {
          corrections.push({ ligne: l.ligne, annee: a, textes: l.execution[a], serie: Math.round(v) });
          l.execution[a] = Math.round(v);
        }
        verifiees++;
      }
    }
  }

  const toutes = [...lignes.values()];
  const annees = [...new Set(toutes.flatMap((l) => Object.keys(l.execution).map(Number)))].sort((a, b) => a - b);
  dire(
    `Budget voté et exécuté : ${toutes.length} lignes, de ${annees[0]} à ${annees.at(-1)} ; ` +
      `${verifiees} exécutions lues dans la série de décembre, dont ${corrections.length} différentes du fichier des textes.`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    version: fiche.metas?.default?.modified?.slice(0, 10) ?? null,
    annees,
    lignes: toutes,
    corrections,
  };
}

export function ecrireExecution(sortie: string, e: BudgetExecution): void {
  writeFileSync(join(sortie, 'budget-etat-execution.json'), JSON.stringify(e));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, obstine, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrireExecution(sortie, await collecterExecution(lireJson, async (url) => (await obstine(url)).arrayBuffer(), console.log));
}
