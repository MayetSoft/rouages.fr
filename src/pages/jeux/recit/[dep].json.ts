/**
 * Pour « Ta commune en 30 secondes » : ce que le récit montre et que les
 * autres fichiers des jeux ne portent pas encore — les naissances et les
 * décès de la dernière année, les associations du répertoire, la
 * participation au premier tour des dernières municipales, le prix de l'eau.
 * Ce sont les chiffres de la page de la commune, lus dans les mêmes fichiers.
 *
 * `c` : par commune, [naissances, décès, associations non dissoutes,
 * participation en %, prix de l'eau en € TTC par m³], null si inconnu.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { parDepartement } from '../../../modele/fiche-commune.ts';
import { communes, metaTerritoires } from '../../../modele/territoires.ts';

type EtatCivil = { annees: number[]; c: Record<string, [(number | null)[], (number | null)[]]> };
type Associations = { c: Record<string, { e?: number }> };
type Elections = { scrutin: string; c: Record<string, { t1?: { inscrits: number; votants: number } }> };
type Eau = { annee: number; c: Record<string, [number | null, ...unknown[]]> };
const etatCivil = parDepartement<EtatCivil>('etat-civil');
const associations = parDepartement<Associations>('associations');
const elections = parDepartement<Elections>('elections');
const eau = parDepartement<Eau>('eau');

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.map((dep) => ({ params: { dep } }));
};

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const ec = etatCivil.get(dep);
  const as = associations.get(dep);
  const el = elections.get(dep);
  const ea = eau.get(dep);
  const m = metaTerritoires() as { eau?: { prixMedian?: number } } | null;
  const derniere = ec ? ec.annees.length - 1 : -1;
  const c: Record<string, (number | null)[]> = {};
  for (const x of communes().filter((k) => k.dep === dep)) {
    const e = ec?.c[x.code];
    const t1 = el?.c[x.code]?.t1;
    c[x.code] = [
      e?.[0][derniere] ?? null,
      e?.[1][derniere] ?? null,
      as?.c[x.code]?.e ?? null,
      t1 && t1.inscrits > 0 ? Math.round((t1.votants / t1.inscrits) * 1000) / 10 : null,
      ea?.c[x.code]?.[0] ?? null,
    ];
  }
  return new Response(
    JSON.stringify({
      etatCivil: ec ? ec.annees[derniere] : null,
      scrutin: el?.scrutin ?? null,
      eau: ea ? { annee: ea.annee, mediane: m?.eau?.prixMedian ?? null } : null,
      c,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
