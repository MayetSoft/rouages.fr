/**
 * Le nom d'un département avec son article — « l’Allier », « le Cantal »,
 * « la Loire », « les Landes » —, d'après le nom officiel de la collectivité
 * (« Département de l’Allier »). Sans nom officiel, le nom seul.
 */
import { COLLECTIVITES_SIRENS } from './collectivites-sirens.ts';

const officiels = new Map([...COLLECTIVITES_SIRENS.values()].filter((c) => c.echelon === 'departement').map((c) => [c.code, c.nom]));

export function avecArticle(dep: string, nom: string): string {
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
