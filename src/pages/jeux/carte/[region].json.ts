/**
 * Pour « Le puzzle de la carte », par région : ses départements, leur nom et
 * leur contour (Admin Express, simplifié, coordonnées en dix-millièmes de
 * degré codées en écarts — voir `decoder` dans `src/modele/carte.ts`).
 * Seules les régions de trois départements ou plus ont un fichier : avec
 * moins, il n'y a pas de quoi jouer.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { national } from '../../../modele/fiche-commune.ts';
import { communes, metaTerritoires } from '../../../modele/territoires.ts';
import { COLLECTIVITES_SIRENS } from '../../../modele/collectivites-sirens.ts';

/** « l’Allier », « le Cantal », « la Loire », « les Landes » : d'après le nom officiel de la collectivité. */
const officiels = new Map([...COLLECTIVITES_SIRENS.values()].filter((c) => c.echelon === 'departement').map((c) => [c.code, c.nom]));
function avecArticle(dep: string, nom: string): string {
  const o = officiels.get(dep)?.replace(/^Département /, '');
  if (!o) return nom;
  return o
    .replace(/^de la /, 'la ')
    .replace(/^de l’/, 'l’')
    .replace(/^du /, 'le ')
    .replace(/^des /, 'les ')
    .replace(/^d’/, '')
    .replace(/^de /, '');
}

const silhouettes = national<{ maj: string; millesime: string; d: Record<string, number[][]> }>('contours-departements.json');

function regions(): Map<string, { nom: string; deps: string[] }> {
  const m = metaTerritoires();
  const out = new Map<string, { nom: string; deps: string[] }>();
  for (const [dep, reg] of Object.entries(m?.codesRegion ?? {})) {
    if (!silhouettes()?.d[dep]) continue;
    const r = out.get(reg) ?? { nom: m?.regions?.[dep] ?? reg, deps: [] };
    r.deps.push(dep);
    out.set(reg, r);
  }
  return new Map([...out].filter(([, r]) => r.deps.length >= 3));
}

export const getStaticPaths: GetStaticPaths = () => [...regions().keys()].map((region) => ({ params: { region } }));

export const GET: APIRoute = ({ params }) => {
  const r = regions().get(params.region!)!;
  const noms = new Map(communes().map((c) => [c.dep, c.depNom]));
  const s = silhouettes()!;
  const corps = {
    nom: r.nom,
    millesime: s.millesime,
    // [nom, nom avec son article, contour]
    d: Object.fromEntries(r.deps.sort().map((dep) => [dep, [noms.get(dep) ?? dep, avecArticle(dep, noms.get(dep) ?? dep), s.d[dep]]])),
  };
  return new Response(JSON.stringify(corps), { headers: { 'Content-Type': 'application/json' } });
};
