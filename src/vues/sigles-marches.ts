/**
 * Les deux procédures qui reviennent sur presque tous les marchés, écrites en
 * sigle avec leur développé au survol : « procédure adaptée » revenait près
 * de quarante fois sur la page d'une commune. Partagé par la page et par le
 * script qui charge la suite des marchés.
 */
export const SIGLES_PROCEDURES: Record<string, { sigle: string; titre: string }> = {
  'procédure adaptée': { sigle: 'MAPA', titre: 'marché à procédure adaptée' },
  "appel d'offres ouvert": { sigle: 'AOO', titre: 'appel d’offres ouvert' },
  'appel d’offres ouvert': { sigle: 'AOO', titre: 'appel d’offres ouvert' },
};

/** Une procédure telle qu'elle s'affiche : son sigle s'il en a un, sinon son libellé en minuscules. */
export function procedureAffichee(libelle: string): string | { sigle: string; titre: string } {
  const bas = libelle.toLowerCase();
  return SIGLES_PROCEDURES[bas] ?? bas;
}
