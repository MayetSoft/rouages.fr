/**
 * Les démarches que chaque bloc de la page de commune appelle.
 *
 * Tenues ici plutôt que dans la page, pour qu'une seule liste existe et que
 * `scripts/verifier-reseau.ts` la vérifie en entier à chaque build : un bloc
 * ne s'affiche que là où il a des données, et un identifiant faux sous le bloc
 * des délibérations ne se voyait qu'au build des Alpes-Maritimes.
 */
export const DEMARCHES_DES_BLOCS = {
  habitants: ['demander-apa'],
  election: ['inscription-electorale'],
  comptes: ['budget-communal', 'controle-chambre-comptes', 'document-administratif'],
  ccas: ['demander-aide-ccas', 'demande-rsa'],
  preleve: ['contester-taxe-fonciere'],
  urbanisme: ['permis-de-construire', 'modifier-le-plu', 'enquete-publique'],
  'logement-social': ['demande-logement-social'],
  deliberations: ['contester-deliberation', 'document-administratif'],
  equipements: ['inscription-ecole', 'choisir-son-college', 'inscrire-au-transport-scolaire'],
  travail: ['demande-rsa'],
  'petite-enfance': ['devenir-assistant-maternel'],
} as const satisfies Record<string, readonly string[]>;

export type BlocAvecDemarches = keyof typeof DEMARCHES_DES_BLOCS;
