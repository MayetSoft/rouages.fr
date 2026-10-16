/**
 * Pour « Devine la courbe » : la population de chaque commune d'un
 * département, de 1876 au dernier recensement, telle que la page de la
 * commune la publie (séries historiques de l'INSEE, à la géographie en
 * vigueur). `annees` donne les années, `c` la série de chaque commune —
 * null là où l'INSEE n'a rien — et son maximum avec l'année, pour la phrase
 * de la fin.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { parDepartement } from '../../../modele/fiche-commune.ts';
import { communes } from '../../../modele/territoires.ts';

type Population = { maj?: string; annees: number[]; c: Record<string, [(number | null)[], number, number]> };
const population = parDepartement<Population>('population');

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.filter((d) => population.get(d)).map((dep) => ({ params: { dep } }));
};

export const GET: APIRoute = ({ params }) => {
  const p = population.get(params.dep!)!;
  const c: Record<string, [(number | null)[], number, number]> = {};
  for (const [code, [serie, anneeMax, max]] of Object.entries(p.c)) {
    // Au moins le premier et le dernier recensement : sans eux, pas de courbe à deviner.
    if (serie[0] == null || serie.at(-1) == null) continue;
    c[code] = [serie, anneeMax, max];
  }
  return new Response(JSON.stringify({ annees: p.annees, c }), { headers: { 'Content-Type': 'application/json' } });
};
