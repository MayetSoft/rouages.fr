/**
 * La dotation globale de fonctionnement (DGF) de chaque commune, année par
 * année depuis 2018, et ce qui la compose la dernière année : les montants
 * que la DGCL notifie, tels que l'OFGL les republie (`dotations-communes`).
 *
 * Deux contrôles : la DGF est la somme de la dotation forfaitaire, de la
 * dotation de solidarité urbaine (DSU), de la dotation de solidarité rurale
 * (DSR), de la dotation nationale de péréquation (DNP) et, outre-mer, de la
 * dotation d'aménagement (DACOM) ; la DSR est la somme de ses trois fractions.
 * Ils tombent juste pour toutes les communes en 2018 comme en 2026 ; en 2021,
 * deux communes nouvelles ont une DGF supérieure à ses parts, d'un montant que
 * le fichier ne détaille pas. Comme pour les comptes, au-delà d'un écart pour
 * mille communes la collecte échoue : l'arbre ne dirait plus ce que la DGCL
 * calcule. En deçà, elle les nomme.
 *
 * La dotation des communes nouvelles, créée en 2024, n'entre pas dans le
 * total « DGF » du fichier : elle est gardée à part.
 *
 * Une commune fusionnée depuis reçoit la somme de celles qui l'ont formée, par
 * le découpage administratif.
 *
 * Lancé seul — `tsx scripts/dotations-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-dotations.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/dotations-communes';

/** Les montants gardés, dans l'ordre des vecteurs. */
export const POSTES = [
  'Montant Dotation DGF',
  'Montant Dotation forfaitaire',
  'Montant Dotation DSU',
  'Montant Dotation DSR',
  'Montant Dotation DNP',
  'Montant Dotation DACOM',
  'Montant global réparti - DSR Bourg-centre',
  'Montant global réparti - DSR Péréquation',
  'Montant global réparti - DSR Cible',
  'Montant Dotation Commune nouvelle',
] as const;
const [DGF, FORF, DSU, DSR, DNP, DACOM, BC, PER, CIB, CN] = POSTES.map((_, i) => i);

/** DGF de chaque année ; dotation des communes nouvelles de chaque année, ou null ; composantes de la dernière année. */
export type Dotation = [(number | null)[], (number | null)[] | null, number[]];

export interface DotationsCommunes {
  maj: string;
  annees: number[];
  communes: Map<string, Dotation>;
}

async function lireAnnee(
  annee: number,
  obstine: (url: string) => Promise<Response>,
): Promise<Map<string, number[]>> {
  const ou =
    `exercice>=${annee} and exercice<=${annee} and variable in (` + POSTES.map((p) => `"${p}"`).join(',') + ')';
  const url = `${BASE}/exports/csv?select=code_insee,variable,valeur&delimiter=%3B&where=${encodeURIComponent(ou)}`;
  const texte = (await (await obstine(url)).text()).replace(/^﻿/, '');
  const parCode = new Map<string, number[]>();
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv([new TextEncoder().encode(texte)], ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      continue;
    }
    const i = POSTES.indexOf(v[col.variable] as (typeof POSTES)[number]);
    if (i < 0) continue;
    const code = v[col.code_insee];
    if (!parCode.has(code)) parCode.set(code, POSTES.map(() => 0));
    parCode.get(code)![i] += Number(v[col.valeur]) || 0;
  }
  return parCode;
}

/** Les deux sommes de la DGCL, commune par commune ; les codes en écart. */
function controler(annee: number, parCode: Map<string, number[]>, dire: (m: string) => void): Set<string> {
  const ecarts = new Set<string>();
  for (const [code, v] of parCode) {
    if (Math.abs(v[FORF] + v[DSU] + v[DSR] + v[DNP] + v[DACOM] - v[DGF]) > 1) ecarts.add(code);
    if (Math.abs(v[BC] + v[PER] + v[CIB] - v[DSR]) > 1) ecarts.add(code);
  }
  if (ecarts.size > parCode.size / 1000) {
    throw new Error(`dotations ${annee} : ${ecarts.size} communes où un total ne fait pas la somme de ses parts`);
  }
  if (ecarts.size > 0) dire(`  dotations ${annee} : total et parts ne concordent pas pour ${[...ecarts].join(', ')}.`);
  return ecarts;
}

export async function collecterDotations(
  obstine: (url: string) => Promise<Response>,
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void,
): Promise<DotationsCommunes | null> {
  const g = (await lireJson(`${BASE}/records?select=exercice&group_by=exercice&limit=50`)) as {
    results: { exercice: string }[];
  };
  const annees = g.results.map((r) => Number(r.exercice.slice(0, 4))).filter((a) => a >= 2018).sort();
  if (annees.length < 3) {
    dire('Dotations : moins de trois exercices publiés, on garde l’ingestion précédente.');
    return null;
  }
  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Dotation>();
  const dernier = annees.length - 1;
  for (const [k, annee] of annees.entries()) {
    const parCode = await lireAnnee(annee, obstine);
    const ecarts = controler(annee, parCode, dire);
    for (const [brut, v] of parCode) {
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      if (!code) continue;
      let d = communes.get(code);
      if (!d) communes.set(code, (d = [annees.map(() => null), null, POSTES.map(() => 0)]));
      d[0][k] = (d[0][k] ?? 0) + v[DGF];
      if (v[CN]) {
        d[1] ??= annees.map(() => null);
        d[1][k] = (d[1][k] ?? 0) + v[CN];
      }
      // Les parts de la dernière année ne sont affichées que si elles font le
      // total ; sinon la page ne donne que le total.
      if (k === dernier && !ecarts.has(brut)) v.forEach((x, i) => (d![2][i] += x));
    }
  }
  if (communes.size < 30000) {
    dire(`Dotations : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const total = [...communes.values()].reduce((s, d) => s + (d[0][dernier] ?? 0), 0);
  dire(
    `Dotations ${annees[0]} à ${annees[dernier]} : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${(total / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md€ de DGF en ${annees[dernier]}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annees, communes };
}

export function ecrireDotations(sortie: string, d: DotationsCommunes): number {
  // Les composantes au complet ne servent que pour la dernière année : on
  // les écrit sans la DGF, déjà dans la série, ni la dotation des communes
  // nouvelles, qui a la sienne.
  const lignes = new Map(
    [...d.communes].map(([c, [dgf, cn, comp]]) => [
      c,
      [dgf, cn, [comp[FORF], comp[DSU], comp[DSR], comp[DNP], comp[DACOM], comp[BC], comp[PER], comp[CIB]]] as const,
    ]),
  );
  return ecrireParDepartement(sortie, 'dotations', lignes, () => ({ maj: d.maj, annees: d.annees }));
}

// Lancé seul : réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { obstine, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const d = await collecterDotations(obstine, lireJson, console.log);
  if (d) console.log(`${ecrireDotations(sortie, d)} départements écrits.`);
}
