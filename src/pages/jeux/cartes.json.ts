/**
 * Pour « Les cartes des départements » : une carte par département, avec sa
 * silhouette et huit chiffres que le site publie déjà ailleurs —
 *
 * - les habitants et le nombre de communes, d'après l'index des communes
 *   (populations municipales de l'INSEE) ;
 * - l'évolution depuis 1876, d'après les séries historiques du recensement,
 *   seulement si chaque commune en a une ;
 * - les communes de moins de 500 habitants ;
 * - les intercommunalités à fiscalité propre qui y ont au moins une commune
 *   (BANATIC) ;
 * - les associations non dissoutes du répertoire national ;
 * - ce que les droits de mutation ont rapporté au département la dernière
 *   année publiée (DGFiP), et le taux qu'il a voté (`bareme-achat.ts`).
 *
 * `i` décrit les chiffres : [clé, libellé, unité, source]. `d` : par
 * département, [nom, nom avec son article, contour, valeurs dans l'ordre de
 * `i`, null si inconnu].
 */
import type { APIRoute } from 'astro';
import { national, parDepartement } from '../../modele/fiche-commune.ts';
import { communes, intercommunalites } from '../../modele/territoires.ts';
import { avecArticle } from '../../modele/article-departement.ts';
import { TAUX_DEPARTEMENT } from '../../modele/bareme-achat.ts';
import { NATURES_FISCALITE_PROPRE } from '../../modele/schemas.ts';

const silhouettes = national<{ millesime: string; d: Record<string, number[][]> }>('contours-departements.json');
const dmto = national<{ annees: number[]; d: Record<string, { dep: (number | null)[] }> }>('dmto.json');
const population = parDepartement<{ annees: number[]; c: Record<string, [(number | null)[], number, number]> }>('population');
const associations = parDepartement<{ c: Record<string, { e?: number }> }>('associations');

/**
 * Un contour allégé pour une carte à jouer, dessinée à quelques centimètres :
 * un point sur trois, le premier et le dernier gardés, toujours codé en
 * écarts. Le fichier passe ainsi d'environ 700 à 250 ko.
 */
function alleger(anneau: number[]): number[] {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k + 1 < anneau.length; k += 2) pts.push([(x += anneau[k]), (y += anneau[k + 1])]);
  const gardes = pts.filter((_, n) => n % 3 === 0 || n === pts.length - 1);
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const [a, b] of gardes) {
    out.push(a - px, b - py);
    [px, py] = [a, b];
  }
  return out;
}

export const GET: APIRoute = () => {
  const s = silhouettes();
  const m = dmto();
  const parDep = new Map<string, ReturnType<typeof communes>>();
  for (const c of communes()) parDep.set(c.dep, [...(parDep.get(c.dep) ?? []), c]);
  const intercos = new Map<string, number>();
  for (const e of intercommunalites()) {
    if (!(NATURES_FISCALITE_PROPRE as readonly string[]).includes(e.nature)) continue;
    for (const d of e.deps) intercos.set(d, (intercos.get(d) ?? 0) + 1);
  }
  const anneeDmto = m ? m.annees.at(-1)! : null;
  const i: [string, string, string, string][] = [
    ['habitants', 'Habitants', '', 'INSEE, populations municipales'],
    ['communes', 'Communes', '', 'INSEE, code officiel géographique'],
    ['evolution', 'Évolution depuis 1876', '%', 'INSEE, séries historiques du recensement'],
    ['petites', 'Communes de moins de 500 habitants', '', 'INSEE, populations municipales'],
    ['intercos', 'Intercommunalités', '', 'BANATIC'],
    ['associations', 'Associations', '', 'Répertoire national des associations'],
    ['dmto', `Droits de mutation reçus en ${anneeDmto ?? ''}`, 'M€', 'DGFiP, droits de mutation attribués'],
    ['taux', 'Taux des droits de mutation', '%', 'DGFiP, taux au 1er juin 2026'],
  ];
  const d: Record<string, [string, string, number[][], (number | null)[]]> = {};
  for (const [dep, liste] of parDep) {
    const contour = s?.d[dep];
    if (!contour || liste.length === 0) continue;
    const nom = liste[0].depNom;
    const habitants = liste.reduce((t, c) => t + (c.population ?? 0), 0);
    const p = population.get(dep);
    // Les deux bouts de la même série, pour comparer ce qui se compare.
    let debut = 0;
    let fin = 0;
    let complet = !!p;
    for (const c of liste) {
      const serie = p?.c[c.code]?.[0];
      if (serie?.[0] == null || serie.at(-1) == null) complet = false;
      else (debut += serie[0]), (fin += serie.at(-1)!);
    }
    const a = associations.get(dep);
    const recettes = m?.d[dep]?.dep.at(-1);
    d[dep] = [
      nom,
      avecArticle(dep, nom),
      // Les îlots de quelques points disparaissent ; s'il ne restait rien, le contour entier.
      contour.some((r) => r.length >= 8) ? contour.filter((r) => r.length >= 8).map(alleger) : contour,
      [
        habitants,
        liste.length,
        complet && debut > 0 ? Math.round(((fin - debut) / debut) * 100) : null,
        liste.filter((c) => (c.population ?? 0) < 500).length,
        intercos.get(dep) ?? null,
        a ? liste.reduce((t, c) => t + (a.c[c.code]?.e ?? 0), 0) : null,
        recettes != null ? Math.round(recettes / 100) / 10 : null,
        TAUX_DEPARTEMENT[dep]?.[0] ?? TAUX_DEPARTEMENT[dep]?.[1] ?? null,
      ],
    ];
  }
  return new Response(JSON.stringify({ millesime: s?.millesime ?? null, i, d }), { headers: { 'Content-Type': 'application/json' } });
};
