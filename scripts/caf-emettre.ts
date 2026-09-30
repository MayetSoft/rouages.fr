/**
 * Les foyers allocataires de la CAF, commune par commune, chaque mois de
 * décembre depuis 2020 : au moins une prestation, et parmi eux le RSA, la
 * prime d'activité, une aide au logement, les allocations familiales, une
 * prestation d'accueil du jeune enfant. D'après le jeu « Toutes prestations —
 * répartition des allocataires selon la prestation » de la CNAF.
 *
 * La CAF arrondit chaque nombre à 5 : 7 devient 5, 12 devient 10. La page le
 * dit, et Paris, Lyon et Marseille — publiées par arrondissement — reçoivent
 * la somme de leurs arrondissements, donc une somme d'arrondis : un ordre de
 * grandeur, marqué comme tel. Un foyer peut toucher plusieurs prestations : les
 * lignes ne s'additionnent pas.
 *
 * Lancé seul — `tsx scripts/caf-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-caf.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const JEU = 'https://data.caf.fr/api/explore/v2.1/catalog/datasets/s_ben_com_f';
/** Foyers, personnes couvertes, puis foyers au RSA, à la prime d'activité, à une aide au logement, aux allocations familiales, à la PAJE. */
const CHAMPS = ['indfoy_ndur', 'indnbp_ndur', 'indfoy_rsa', 'indfoy_ppa', 'indfoy_ndural', 'indfoy_af', 'indfoy_ndurpaje'];

export interface CafCommunes {
  maj: string;
  /** Les années, au mois de décembre. */
  annees: number[];
  /** Code commune -> pour chaque année, les sept nombres ou null ; puis 1 si la commune est une somme d'arrondissements. */
  communes: Map<string, [(number[] | null)[], number]>;
}

export async function collecterCaf(
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<CafCommunes | null> {
  const url = `${JEU}/exports/csv?delimiter=%3B&select=${['dtreffre', 'numcomdo', ...CHAMPS].join(',')}`;
  const texte = (await (await obstine(url)).text()).replace(/^﻿/, '');
  const { actuelles, reports } = reportsDuDecoupage();
  const lignes: [number, string, number[], boolean][] = [];
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv([new TextEncoder().encode(texte)], ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['dtreffre', 'numcomdo', ...CHAMPS]) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le jeu a changé de forme`);
      }
      continue;
    }
    const annee = Number((v[col.dtreffre] ?? '').slice(0, 4));
    const brut = v[col.numcomdo] ?? '';
    const plm = communeDe(brut);
    const code = actuelles.has(plm) ? plm : reports.get(plm);
    if (!annee || !code) continue;
    lignes.push([annee, code, CHAMPS.map((c) => Number(v[col![c]]) || 0), plm !== brut]);
  }
  const annees = [...new Set(lignes.map((l) => l[0]))].sort();
  if (annees.length === 0) return null;
  const communes = new Map<string, [(number[] | null)[], number]>();
  for (const [annee, code, n, somme] of lignes) {
    let c = communes.get(code);
    if (!c) communes.set(code, (c = [annees.map(() => null), 0]));
    const i = annees.indexOf(annee);
    c[0][i] = c[0][i] ? c[0][i]!.map((x, k) => x + n[k]) : n;
    if (somme) c[1] = 1;
  }
  if (communes.size < 30000) {
    dire(`CAF : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const dernier = annees.length - 1;
  const foyers = [...communes.values()].reduce((s, c) => s + (c[0][dernier]?.[0] ?? 0), 0);
  dire(
    `CAF, décembre ${annees[0]} à ${annees[dernier]} : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${foyers.toLocaleString('fr-FR')} foyers allocataires en ${annees[dernier]}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annees, communes };
}

export function ecrireCaf(sortie: string, c: CafCommunes): number {
  return ecrireParDepartement(sortie, 'caf', c.communes, () => ({ maj: c.maj, annees: c.annees }));
}

// Lancé seul : réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const c = await collecterCaf(obstine, console.log);
  if (c) console.log(`${ecrireCaf(sortie, c)} départements écrits.`);
}
