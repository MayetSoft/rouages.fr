/**
 * Les communes d'un département pour la commune mystère et « Plus ou moins » :
 * où elles sont, qui sont leurs voisines, et quelques chiffres que leur page
 * publie déjà — aucun qui n'y figure pas.
 *
 * `i` décrit les indicateurs : [clé, libellé, unité, source et millésime].
 * `c` : par commune, [nom, code postal, longitude, latitude, voisines,
 *   intercommunalité, valeurs dans l'ordre de `i` (null si inconnue),
 *   contours au trait grossier, en dix-millièmes de degré et par écarts
 *   successifs comme dans `dep/XX-contours.json`]. La commune mystère en
 *   dessine sa carte.
 *
 * Le point d'une commune est le centre de son plus grand contour, d'après
 * Admin Express : c'est de lui que la commune mystère mesure les distances.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decoder } from '../../../modele/carte.ts';
import { RACINE } from '../../../modele/graphe.ts';
import { parDepartement } from '../../../modele/fiche-commune.ts';
import { NATURES_FISCALITE_PROPRE } from '../../../modele/schemas.ts';
import { communes, metaTerritoires } from '../../../modele/territoires.ts';

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.map((dep) => ({ params: { dep } }));
};

type Contours = { millesime: string; c: Record<string, [number[][], string[], number[][]?]> };
type Population = { annees: number[]; c: Record<string, [number[], number, number]> };
type Revenus = { millesime: number; c: Record<string, [number | null, number | null]> };
type Dvf = { annees: number[]; c: Record<string, (number | null)[]> };
type Gares = { annee: number; c: Record<string, { g: unknown[] } | { p: [string, string, number, number] }> };
type Services = { c: Record<string, [number, string, ...unknown[]][]> };
type Structure = { g: [string, string, string, string[]][]; c: [string, string, number, number[], string][] };

const contours = parDepartement<Contours>('contours');
const population = parDepartement<Population>('population');
const revenus = parDepartement<Revenus>('revenus');
const dvf = parDepartement<Dvf>('dvf');
const gares = parDepartement<Gares>('gares');
const services = parDepartement<Services>('services');
/** `dep/XX.json`, le fichier de structure : les groupements de chaque commune. */
function structure(dep: string): Structure | null {
  const p = join(RACINE, 'public', 'territoires', 'dep', `${dep}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Structure) : null;
}

/** Le centre d'un anneau, pondéré par l'aire : celui d'une commune en croissant reste dedans plus souvent que la moyenne des points. */
function centre(anneau: [number, number][]): [number, number] {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const f = anneau[j][0] * anneau[i][1] - anneau[i][0] * anneau[j][1];
    a += f;
    x += (anneau[j][0] + anneau[i][0]) * f;
    y += (anneau[j][1] + anneau[i][1]) * f;
  }
  if (a === 0) return anneau[0];
  return [x / (3 * a), y / (3 * a)];
}
const aire = (r: [number, number][]) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0));

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const m = metaTerritoires();
  const ct = contours.get(dep);
  const pop = population.get(dep);
  const rev = revenus.get(dep);
  const ventes = dvf.get(dep);
  const gr = gares.get(dep);
  const serv = services.get(dep);
  const st = structure(dep);
  const familles = m?.services?.familles ?? [];
  const iEcole = familles.indexOf('ecole');
  const i1901 = pop?.annees.indexOf(1901) ?? -1;
  const derniere = pop ? pop.annees.length - 1 : -1;

  const i: [string, string, string, string][] = [
    ['habitants', 'Habitants', 'hab.', `INSEE, recensement ${pop?.annees[derniere] ?? ''}`],
    ['habitants1901', 'Habitants en 1901', 'hab.', 'INSEE, séries historiques du recensement'],
    ['niveauDeVie', 'Niveau de vie médian', '€ par an', `INSEE, Filosofi ${rev?.millesime ?? ''}`],
    ['prixMaison', 'Prix médian d’une maison', '€', `DGFiP, ventes de ${ventes?.annees[0] ?? ''} à ${ventes?.annees.at(-1) ?? ''}`],
    ['gare', 'Distance à la gare SNCF la plus proche', 'km', `SNCF Gares & Connexions, ${gr?.annee ?? ''}`],
    ['ecoles', 'Écoles', '', 'Ministère de l’Éducation nationale, annuaire de l’éducation'],
  ];

  const c: Record<string, [string, string, number, number, string[], string, (number | null)[], number[][]]> = {};
  for (const commune of communes().filter((x) => x.dep === dep)) {
    const forme = ct?.c[commune.code];
    if (!forme) continue;
    const anneaux = forme[0].map(decoder) as [number, number][][];
    const grand = anneaux.reduce((a, b) => (aire(b) > aire(a) ? b : a));
    const [x, y] = centre(grand);
    const ligne = st?.c.find((l) => l[0] === commune.code);
    const epci = ligne?.[3].map((k) => st!.g[k]).find((g) => (NATURES_FISCALITE_PROPRE as readonly string[]).includes(g[2]));
    const serie = pop?.c[commune.code]?.[0];
    const g = gr?.c[commune.code];
    const ecoles = serv?.c[commune.code]?.filter((e) => e[0] === iEcole).length;
    c[commune.code] = [
      commune.nom,
      commune.cp,
      Math.round(x) / 10_000,
      Math.round(y) / 10_000,
      forme[1],
      epci?.[1] ?? '',
      [
        serie?.[derniere] ?? commune.population ?? null,
        i1901 >= 0 ? (serie?.[i1901] ?? null) : null,
        rev?.c[commune.code]?.[0] ?? null,
        ventes?.c[commune.code]?.[2] ?? null,
        g ? ('g' in g ? 0 : g.p[2]) : null,
        serv ? (ecoles ?? 0) : null,
      ],
      forme[2] ?? forme[0],
    ];
  }
  return new Response(JSON.stringify({ i, c }), { headers: { 'Content-Type': 'application/json' } });
};
