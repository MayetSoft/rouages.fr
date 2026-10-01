/**
 * Ce qui bouge dans une commune, en une suite d'événements datés.
 *
 * Le site répond « qui décide, combien, où ». Il ne répondait pas à « qu'est-ce
 * qui a changé depuis la dernière fois ? » — et c'est la question de celui qui
 * habite là, par opposition à celui qui découvre. Le journal est la matière de
 * cette réponse : un flux Atom par commune, et une section sur sa page.
 *
 * **Le journal ne garde aucune mémoire, et c'est délibéré.** On pourrait noter
 * la date à laquelle chaque événement a été vu pour la première fois, pour
 * classer le flux par ordre de découverte plutôt que par ordre des faits. Ce
 * serait un état à conserver entre deux ingestions, à faire grossir, et à
 * réparer le jour où il se désynchronise. Or **c'est le lecteur qui fait déjà
 * ce travail** : un agrégateur retient les identifiants d'entrée qu'il a
 * montrés, si bien qu'un marché notifié en juin mais publié en septembre lui
 * apparaît comme nouveau, même daté de juin. Le journal peut donc rester ce
 * qu'il y a de plus sûr : une projection pure de la donnée du moment,
 * idempotente, qui ne peut ni inventer un changement ni s'effondrer parce
 * qu'une source n'a pas répondu.
 *
 * Deux conséquences à accepter : celui qui s'abonne aujourd'hui reçoit d'un
 * coup la fenêtre entière — c'est le comportement ordinaire d'un flux — et un
 * fait antérieur à la fenêtre n'y entrera jamais, même publié tardivement.
 */

/**
 * Les genres d'événements, dans l'ordre où le flux les nomme.
 *
 * L'ordre fait foi : les fichiers y renvoient par position, comme les
 * procédures de marché ou les familles d'actes.
 */
export const GENRES = [
  'Marché notifié',
  'Délibération',
  'Subvention votée',
  'Association créée',
  'Catastrophe naturelle reconnue',
  // « Changement » serait faux : le répertoire date le mandat en cours, et un
  // maire reconduit y figure comme un nouveau. L'élection, elle, a bien eu
  // lieu — le conseil élit son maire à sa première séance, reconduction
  // comprise.
  'Élection du maire',
  // Les trois derniers ne viennent pas d'un fait daté mais d'une comparaison
  // de deux états du registre des transferts : voir
  // `scripts/transferts-emettre.ts`, qui dit pourquoi c'est là, et seulement
  // là, que le journal a besoin de mémoire. Ajoutés en queue : un genre se
  // désigne par sa position, et les flux déjà publiés y renvoient.
  'Compétence transférée',
  'Compétence reprise',
  'Rattachement modifié',
  // Une publication, pas un fait daté de la commune : l'INSEE sort chaque
  // juillet les naissances et les décès de l'année précédente. Le flux le dit,
  // puisque la page n'annonce pas elle-même qu'elle a changé.
  'État civil publié',
  // Les annonces du BODACC. Les modifications n'y entrent pas — un changement
  // de gérant ou de capital noierait ce qu'un habitant remarque, ce qui
  // ouvre, change de mains, ferme. Les procédures collectives non plus : la
  // page les compte, sans les nommer.
  'Société créée',
  'Société arrivée',
  'Fonds de commerce cédé',
  'Société radiée',
  // Les entrepreneurs individuels, nommés depuis le 1er octobre 2026 quand le
  // répertoire SIRENE les dit diffusibles. Ajoutés en queue, comme les autres :
  // la vente d'un fonds garde son genre, qu'elle soit le fait d'une société ou
  // d'une personne.
  'Entreprise individuelle créée',
  'Entreprise individuelle arrivée',
  'Entreprise individuelle radiée',
] as const;

/** Sur combien de mois le journal regarde en arrière. */
export const FENETRE_MOIS = 6;

/**
 * Combien d'événements d'un même genre le journal garde par acteur.
 *
 * Une communauté d'agglomération notifie une centaine de marchés par an, une
 * commune bretonne délibère autant : tout garder ferait un fichier que
 * personne ne lit en entier. Douze par genre et par acteur suffisent — une
 * commune agrège sa propre activité et celle de ses huit groupements, ce qui
 * laisse au flux bien plus de candidats qu'il n'en montre.
 */
export const PAR_ACTEUR = 12;

export interface Evenement {
  /** Index dans `GENRES`. */
  genre: number;
  /** La date du fait, telle que la source la déclare (AAAA-MM-JJ). */
  date: string;
  /** Ce que l'entrée dit, en une ligne. */
  quoi: string;
  /** Une précision : un montant, une famille d'acte, un domaine déclaré. */
  detail?: string;
  /** L'acte lui-même, chez celui qui l'a publié. */
  url?: string;
  /**
   * Le SIREN de l'acteur. L'événement vaut alors pour toutes les communes qui
   * dépendent de lui — le marché d'une agglomération est celui de ses cent
   * quatre communes, et le fichier n'a pas à le répéter cent quatre fois.
   */
  siren?: string;
  /** Le code INSEE, quand l'événement n'appartient qu'à une commune. */
  commune?: string;
}

/** Le premier jour de la fenêtre, en AAAA-MM-JJ. */
export function debutFenetre(aujourdhui = new Date()): string {
  const d = new Date(aujourdhui);
  d.setMonth(d.getMonth() - FENETRE_MOIS);
  return d.toISOString().slice(0, 10);
}

/**
 * L'identité d'un acteur pour le plafonnement : son SIREN, ou la commune quand
 * l'événement n'appartient qu'à elle.
 */
function acteur(e: Evenement): string {
  return e.siren ?? e.commune ?? '';
}

/**
 * Ce que le journal retient : la fenêtre, puis le plafond par acteur et par
 * genre, du plus récent au plus ancien.
 *
 * Une date future est écartée comme une date trop ancienne : les répertoires
 * en portent — le RNA compte onze créations datées de 2029 — et un événement
 * qui n'a pas eu lieu n'a rien à faire en tête d'un flux.
 */
export function retenir(evenements: Evenement[], aujourdhui = new Date()): Evenement[] {
  const debut = debutFenetre(aujourdhui);
  const fin = aujourdhui.toISOString().slice(0, 10);
  const retenus = evenements
    .filter((e) => e.date >= debut && e.date <= fin && e.quoi !== '')
    .sort((a, b) => b.date.localeCompare(a.date) || a.quoi.localeCompare(b.quoi, 'fr'));
  const comptes = new Map<string, number>();
  const sortie: Evenement[] = [];
  for (const e of retenus) {
    const cle = `${e.genre}|${acteur(e)}`;
    const n = comptes.get(cle) ?? 0;
    if (n >= PAR_ACTEUR) continue;
    comptes.set(cle, n + 1);
    sortie.push(e);
  }
  return sortie;
}
