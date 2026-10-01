/**
 * Les personnes qui ont demandé à ne pas être nommées.
 *
 * La règle des noms (`CLAUDE.md`, « Les noms dans les données ») veut qu'une
 * opposition reçue par `/signaler` soit appliquée à l'ingestion suivante. Elle
 * arrive en issue ; on ajoute ici l'identifiant qu'elle vise, avec la date et
 * le numéro de l'issue en commentaire, et chaque collecte qui nomme quelqu'un
 * consulte cette liste avant d'écrire.
 *
 * Un identifiant, jamais un nom : la liste elle-même ne doit rien révéler de
 * qui s'est opposé.
 */

/**
 * SIREN des entrepreneurs individuels qui se sont opposés à être nommés.
 *
 * Inutile d'y mettre ceux qui sont en diffusion partielle au répertoire
 * SIRENE : leur identité y est déjà masquée (« [ND] »), et aucune collecte ne
 * peut la lire.
 */
export const SIREN_OPPOSES: ReadonlySet<string> = new Set<string>([
  // 'AAAAAAAAA', // 2026-10-02, issue #NN
]);
