/**
 * Pour « Le budget de ma commune », par département : où vont 100 € de
 * dépenses de chaque commune, en six postes qu'un enfant comprend. Les mêmes
 * comptes que la page de commune (`assemblerFinances`, d'après l'OFGL), les
 * postes regroupés ainsi :
 *
 * - payer les agents : les frais de personnel ;
 * - acheter : les achats et charges externes ;
 * - construire et réparer : les dépenses et subventions d'équipement ;
 * - aider et participer : les dépenses d'intervention ;
 * - rembourser les emprunts : le remboursement de la dette et ses intérêts ;
 * - le reste : les autres dépenses.
 *
 * `c` : par commune (code sans le département), six entiers qui font 100.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { assemblerFinances } from '../../../modele/fiche-commune.ts';
import { communes } from '../../../modele/territoires.ts';

const POSTES: [string, string[]][] = [
  ['agents', ['repere-personnel']],
  ['acheter', ['repere-achats']],
  ['construire', ['repere-equipement', 'repere-subventions-equipement']],
  ['aider', ['repere-intervention']],
  ['emprunts', ['repere-charges-financieres', 'repere-remboursements']],
  ['reste', ['repere-autres-depenses-fonctionnement', 'repere-autres-depenses-investissement']],
];

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.map((dep) => ({ params: { dep } }));
};

/** Cent, répartis au plus fort reste : la somme fait toujours cent. */
function cent(montants: number[]): number[] | null {
  const total = montants.reduce((s, x) => s + x, 0);
  if (!(total > 0)) return null;
  const exact = montants.map((m) => (m / total) * 100);
  const parts = exact.map(Math.floor);
  let manque = 100 - parts.reduce((s, x) => s + x, 0);
  for (const i of exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (manque-- <= 0) break;
    parts[i]++;
  }
  return parts;
}

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const c: Record<string, number[]> = {};
  let annee: number | null = null;
  for (const x of communes().filter((k) => k.dep === dep)) {
    const f = assemblerFinances(x, x.population);
    if (!f) continue;
    annee ??= f.annee;
    const montant = (id: string) => Math.max(0, f.lignes.find((l) => l.id === id)?.montant ?? 0);
    const parts = cent(POSTES.map(([, ids]) => ids.reduce((s, id) => s + montant(id), 0)));
    if (parts) c[x.code.slice(2)] = parts;
  }
  return new Response(JSON.stringify({ annee, c }), { headers: { 'Content-Type': 'application/json' } });
};
