/**
 * Les mots d'un intitulé de délibération, tels que l'index de recherche les
 * range et que la page de recherche les cherche : sans accents, en minuscules,
 * trois lettres au moins, ni chiffres ni références cadastrales — « AC 0151 »
 * n'a pas de mot de trois lettres —, sans les mots-outils. Partagé par la
 * collecte (`scripts/deliberations-emettre.ts`) et par le navigateur
 * (`src/client/recherche-deliberations.ts`), pour que les deux découpent pareil.
 */
export const plierMot = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const OUTILS = new Set(
  'les des aux pour par sur avec dans une entre son ses leur leurs que qui est sont pas plus sans sous chez lors suite vers apres avant ainsi cette ces cet'.split(
    ' ',
  ),
);

export function motsDe(texte: string): string[] {
  return [...new Set(plierMot(texte).match(/[a-z]{3,}/g) ?? [])].filter((m) => !OUTILS.has(m));
}
