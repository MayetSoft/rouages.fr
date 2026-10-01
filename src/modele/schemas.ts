/**
 * Le modèle de données de Rouages, rendu exécutable.
 *
 * Le site n'a pas d'articles : il a un graphe. Une entité n'existe donc que si
 * elle est reliée à d'autres et si elle renvoie vers au moins une page de
 * référence — Wikipédia pour la définition, Légifrance pour la règle,
 * l'open data pour les chiffres. Nous ne réécrivons rien de ce que ces sites
 * disent déjà mieux ; nous montrons ce qu'ils ne montrent pas : les liens.
 *
 * Ces schémas sont donc la ligne éditoriale appliquée mécaniquement : sans lien
 * sortant, sans date de vérification, ou avec une référence cassée, le build
 * échoue.
 *
 * Référence : docs/03-modele-de-donnees.md
 */
import { z } from 'zod';

/** Identifiant stable, en minuscules. Jamais réutilisé pour autre chose. */
/** Les colonnes de la carte d'ensemble, du plus lointain au plus proche. */
export const ECHELONS = [
  'union_europeenne',
  'etat',
  'region',
  'departement',
  'epci',
  'commune',
  'prive',
  'citoyen',
] as const;
export type Echelon = (typeof ECHELONS)[number];

export const LIBELLE_ECHELON: Record<Echelon, string> = {
  union_europeenne: 'Union européenne',
  etat: 'État',
  region: 'Région',
  departement: 'Département',
  epci: 'Intercommunalité',
  commune: 'Commune',
  prive: 'Acteurs privés',
  citoyen: 'Vous',
};

export const Id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'un id est en minuscules, mots séparés par des tirets');

/**
 * Le niveau de certitude affiché à l'usager. `variable_selon_territoire` est
 * indispensable en France : la répartition commune / EPCI dépend des statuts
 * locaux, et prétendre à une réponse unique serait faux.
 */
export const Confiance = z
  .enum(['etabli', 'variable_selon_territoire', 'a_confirmer'])
  .default('etabli');

const dateSimple = z.coerce.date();

/** Champs de traçabilité communs à toute entité sauf les sources elles-mêmes. */
const tracable = {
  /**
   * Les pages de référence vers lesquelles ce nœud renvoie. C'est le contenu
   * du site : on relie, on ne rédige pas.
   */
  liens: z.array(Id).min(1, 'toute entité renvoie vers au moins une page de référence'),
  verifie_le: dateSimple,
  verifie_par: z.string().optional(),
  /** Mois avant que la fiche ne se signale comme potentiellement périmée. */
  perime_apres_mois: z.number().int().positive().default(12),
  confiance: Confiance,
};

/** Une page de référence. Jamais recopiée, seulement citée et liée. */
export const Source = z.object({
  id: Id,
  type: z.enum(['wikipedia', 'droit', 'donnees_ouvertes', 'page_officielle', 'etude', 'presse']),
  titre: z.string().min(3),
  url: z.string().url(),
  consulte_le: dateSimple,
});

/**
 * Les branches du pouvoir, pour les entités nationales.
 *
 * La séparation en trois est le cadre que tout le monde a appris, et elle ne
 * décrit pas exactement la France. Deux écarts sont assumés ici plutôt que
 * masqués :
 *
 *   — `independant` n'est pas une quatrième branche inventée pour l'occasion,
 *     c'est une catégorie juridique existante (loi n° 2017-55) : les autorités
 *     administratives et publiques indépendantes sont placées par la loi hors
 *     de la hiérarchie des trois pouvoirs. Les ranger sous « exécutif » parce
 *     qu'elles sont administratives dirait le contraire de ce qui les définit.
 *
 *   — le champ est une *liste*, parce qu'au moins une institution en exerce
 *     réellement deux : le Conseil d'État est à la fois le conseil juridique
 *     obligatoire du Gouvernement et le juge suprême de l'ordre administratif.
 *     Choisir l'une des deux serait plus simple, et faux.
 */
export const POUVOIRS = ['executif', 'legislatif', 'judiciaire', 'independant'] as const;
export type Pouvoir = (typeof POUVOIRS)[number];

export const LIBELLE_POUVOIR: Record<Pouvoir, string> = {
  executif: 'Exécutif',
  legislatif: 'Législatif',
  judiciaire: 'Judiciaire',
  independant: 'Autorités indépendantes',
};

export const Acteur = z.object({
  id: Id,
  nom: z.string().min(2),
  /** Étiquette portée sur les schémas, où la place manque. */
  nom_court: z.string().min(2).max(24).optional(),
  type: z.enum([
    'personne',
    'mandat_electif',
    'assemblee',
    'service_administratif',
    'service_deconcentre',
    'collectivite',
    'juridiction',
    'autorite_independante',
    'organe_collegial',
    'entreprise',
    'association',
    'metier',
  ]),
  /** Détermine la colonne du nœud sur la carte d'ensemble. */
  echelon: z.enum(ECHELONS),
  /**
   * De quelle branche relève l'entité. Exigé des entités nationales et refusé
   * ailleurs : la séparation des pouvoirs se joue à l'échelon de l'État, une
   * commune n'a pas de pouvoir judiciaire à déclarer. La règle est appliquée
   * par `scripts/valider.ts`.
   */
  pouvoirs: z.array(z.enum(POUVOIRS)).min(1).optional(),
  /** Une phrase, pas un paragraphe : le détail est sur les pages liées. */
  resume: z.string().min(10).max(280, 'une phrase suffit — le reste est sur les pages liées'),
  ...tracable,
});

/**
 * Les catégories d'intercommunalité à fiscalité propre, telles que BANATIC les
 * nomme. Ce sont elles que la loi désigne quand elle rend une compétence
 * obligatoire.
 */
export const NATURES_FISCALITE_PROPRE = ['CC', 'CA', 'CU', 'METRO', 'MET69', 'EPT', 'SAN'] as const;

export const Competence = z.object({
  id: Id,
  nom: z.string().min(3),
  nom_court: z.string().min(3).max(28).optional(),
  /**
   * Les codes du référentiel BANATIC qui permettent de dire, pour une commune
   * donnée, qui exerce réellement cette compétence.
   *
   * C'est la compétence qui déclare comment elle se résout : la correspondance
   * est une décision éditoriale, pas un détail d'implémentation, et elle se
   * relit dans le contenu plutôt que dans un script.
   */
  banatic: z.array(z.string().regex(/^\d{3,5}$/)).default([]),
  /**
   * L'indicateur SISPEA qui chiffre cette compétence sur le terrain, quand il
   * en existe un : le prix du service, rattaché à la structure qui l'exerce.
   */
  sispea: z.string().regex(/^[A-Z]{1,3}\d{2,3}\.\d$/).optional(),
  acteur: Id,
  resume: z.string().min(10).max(280, 'une phrase suffit — le reste est sur les pages liées'),
  partagee_avec: z.array(Id).default([]),
  /**
   * Les catégories d'intercommunalité auxquelles la loi transfère cette
   * compétence de plein droit.
   *
   * BANATIC enregistre les transferts *déclarés*, et il en manque beaucoup :
   * 54 % seulement des intercommunalités à fiscalité propre y déclarent le
   * développement économique, que la loi impose pourtant à toutes depuis 2017.
   * Conclure « la commune » du silence du registre était donc faux une fois
   * sur deux. Quand la loi tranche, c'est elle qui répond.
   *
   * À ne renseigner que sur vérification de l'article : une compétence
   * faussement déclarée obligatoire ferait mentir le site avec l'autorité de
   * la loi. La règle de validation exige d'ailleurs une source de droit.
   */
  obligatoire_pour: z.array(z.enum(NATURES_FISCALITE_PROPRE)).default([]),
  /**
   * Une réserve à afficher avec la réponse territoriale, quand le registre ne
   * capte pas le mécanisme réel.
   *
   * Le cas type est l'instruction des permis : le maire signe — c'est bien une
   * compétence communale — mais l'instruction est très souvent confiée à un
   * service mutualisé, par convention et non par transfert. Une convention
   * n'entre pas à BANATIC, d'où les 2 à 4 % de couverture. Répondre « la
   * commune » est exact et pourtant trompeur : la réserve dit ce que la
   * réponse ne dit pas.
   */
  reserve: z.string().min(20).max(400).optional(),
  /**
   * L'échelon auquel la loi confie cette compétence quand personne d'autre ne
   * s'en est saisi.
   *
   * Une réserve dit « débrouillez-vous » — l'inverse de ce que ce site promet.
   * Quand une communauté de communes n'a pas délibéré pour devenir autorité
   * organisatrice de la mobilité, la compétence n'est pas restée à la commune :
   * la région l'a reprise au 1er juillet 2021. C'est une réponse, pas une
   * incertitude, et le site la connaît puisqu'il sait de quelle région dépend
   * chaque commune.
   */
  a_defaut: z.enum(['region', 'departement', 'etat']).optional(),
  ...tracable,
});

export const Document = z.object({
  id: Id,
  nom: z.string().min(3),
  resume: z.string().max(280).optional(),
  ou_le_trouver: z.string().optional(),
  liens: z.array(Id).min(1),
});

/**
 * La nature du délai est aussi importante que sa valeur : un maximum légal et
 * un délai observé ne se traitent pas pareil quand on organise sa réaction.
 */
export const Delai = z.object({
  valeur: z.number().positive(),
  unite: z.enum(['jours', 'semaines', 'mois', 'annees']),
  /**
   * Un plancher n'est pas un plafond, et le confondre trompe dans le sens le
   * plus coûteux.
   *
   * `minimum_legal` est venu de la relecture de l'enquête publique : sa durée
   * ne peut pas être inférieure à trente jours, et la fiche l'annonçait comme
   * « indicative ». Un lecteur en déduisait qu'elle pouvait être raccourcie, ou
   * qu'elle n'engageait personne. C'est l'inverse — c'est le minimum que
   * l'autorité doit laisser au public, et elle ne peut pas descendre en dessous.
   */
  nature: z.enum(['maximum_legal', 'minimum_legal', 'indicatif', 'observe']),
});

export const Etape = z.object({
  ordre: z.number().int().positive(),
  acteur: Id,
  action: z.string().min(5),
  delai: Delai.optional(),
  produit: z.array(Id).default([]),
  note: z.string().optional(),
  conditionnelle: z.boolean().default(false),
  liens: z.array(Id).min(1),
  confiance: Confiance,
});

/**
 * L'entité distinctive du projet : le point où un citoyen peut effectivement
 * intervenir. Aucun site institutionnel ne la modélise ; c'est elle qui
 * transforme une encyclopédie en outil.
 */
export const Levier = z.object({
  id: Id,
  /** Qui peut agir. Par défaut vous. */
  acteur: Id.default('citoyen'),
  quoi: z.string().min(5),
  quand: z.string().min(3),
  aupres_de: z.string().min(3),
  difficulte: z.enum(['faible', 'moyenne', 'elevee']),
  /** Le point de forme sur lequel on perd, presque toujours. */
  piege: z.string().optional(),
  recours_si_refus: z.string().optional(),
  /** Position sur la frise des fenêtres d'action, en n° d'étape du processus. */
  ancre_etape: z.number().int().positive().optional(),
  liens: z.array(Id).min(1),
  confiance: Confiance,
});

export const Processus = z.object({
  id: Id,
  nom: z.string().min(3),
  famille: z.enum(['publics', 'quotidien', 'economiques', 'influence']),
  resume: z.string().min(10).max(280),
  declencheur: z.string().min(5),
  sortie: z.string().min(5),
  /** Qui signe, au bout du compte. La réponse à la question 1, en un id. */
  decideur: Id,
  /** Les compétences que ce processus met en œuvre — relie le temps au réseau. */
  competences: z.array(Id).default([]),
  etapes: z.array(Etape).min(1, 'un processus a au moins une étape'),
  leviers: z
    .array(Levier)
    .min(1, "un processus sans levier d'action n'est pas une fiche Rouages"),
  ...tracable,
});

export const Flux = z.object({
  id: Id,
  /** Le libellé porté par l'arête sur le schéma. */
  nom: z.string().min(3).max(60),
  nature: z.enum(['argent', 'information', 'autorisation', 'obligation', 'attention']),
  de: Id,
  vers: z.array(Id).min(1),
  resume: z.string().min(10).max(280),
  ordre_de_grandeur: z.string().optional(),
  ...tracable,
});

/**
 * Un sigle et son développé.
 *
 * Un sigle non expliqué est une porte fermée pour exactement le lecteur à qui
 * le site s'adresse. La validation refuse donc toute suite de majuscules qui
 * n'a pas son entrée ici.
 */
export const Sigle = z.object({
  id: Id,
  /** Tel qu'il s'écrit dans le texte, casse comprise : SCoT, PLUi, NOTRe. */
  sigle: z.string().min(2).max(12),
  developpe: z.string().min(4).max(120),
  definition: z.string().max(200).optional(),
  /** La fiche correspondante, quand il y en a une. */
  noeud: Id.optional(),
  liens: z.array(Id).default([]),
  confiance: Confiance,
});

/**
 * Un repère financier : un agrégat des comptes publics, rendu comparable.
 *
 * Un montant seul ne dit rien. Chaque repère est donc restitué en euros par
 * habitant et confronté à la médiane des communes de taille voisine — ce que le
 * site recommande par ailleurs de faire avant de conclure quoi que ce soit.
 */
export const Repere = z.object({
  id: Id,
  nom: z.string().min(3).max(60),
  /**
   * Libellé exact de l'agrégat OFGL : l'ingestion échoue s'il ne correspond
   * pas. Absent d'un repère calculé, qui porte `difference` à la place.
   */
  agregat: z.string().min(3).optional(),
  /**
   * Un repère que l'OFGL ne publie pas mais qui se déduit de deux autres : le
   * premier moins le second, montant par montant. « Impôts locaux » comprend
   * ce que l'intercommunalité reverse ; ce qu'en lève la commune elle-même,
   * c'est cette différence.
   */
  difference: z.tuple([Id, Id]).optional(),
  /**
   * Le poste dont celui-ci est une part. Les postes d'un même parent
   * s'additionnent pour faire son total — l'ingestion le vérifie commune par
   * commune —, sauf ceux marqués `dont`, qui n'en détaillent qu'une partie.
   */
  parent: Id.optional(),
  dont: z.boolean().default(false),
  /**
   * Une ligne en tête du bloc, avec sa réglette et sa série depuis 2018. Les
   * autres ne paraissent que dans le tableau poste par poste, au dernier
   * exercice : une série par poste alourdirait chaque page pour rien.
   */
  principal: z.boolean().default(false),
  /**
   * Le sens dans lequel un écart à la médiane est réputé favorable, pour les
   * seuls postes où l'analyse financière publique en a un : l'épargne brute,
   * qui finance l'investissement et la dette ; la dette et ce qu'elle coûte.
   * Ailleurs — impôts, dotations, dépenses de personnel —, plus n'est ni mieux
   * ni pire, et le site ne colore pas : il dit « au-dessus » ou « au-dessous ».
   * `lecture` donne les deux mots qui accompagnent la couleur, pour qui ne la
   * voit pas ; `lien`, la source de la convention.
   */
  sens: z
    .object({
      vers: z.enum(['haut', 'bas']),
      lecture: z.tuple([z.string().min(3).max(40), z.string().min(3).max(40)]),
      lien: Id,
    })
    .optional(),
  /**
   * Les échelons dont les comptes portent ce poste. Les allocations de RSA ne
   * se trouvent que chez le département, les cartes grises que chez la région.
   * L'intercommunalité est celle à fiscalité propre, dont l'OFGL publie les
   * comptes.
   */
  niveaux: z
    .array(z.enum(['commune', 'intercommunalite', 'departement', 'region']))
    .default(['commune', 'intercommunalite', 'departement', 'region']),
  /**
   * L'échelon où la mesure a un sens.
   *
   * Les comptes d'une commune ne portent pas le versement mobilité ni, le plus
   * souvent, la taxe d'enlèvement des ordures ménagères : ces ressources sont
   * perçues par l'intercommunalité. Les chercher dans les comptes communaux
   * n'y trouve presque rien — 568 lignes contre 1 942 — et conclure « la
   * commune ne perçoit rien » serait exact et sans intérêt. Le repère déclare
   * donc où regarder, et le site sait déjà quelle structure sert chaque
   * commune.
   */
  echelon: z.enum(['commune', 'groupement']).default('commune'),
  /** Le flux du réseau que ce repère chiffre, quand la correspondance est exacte. */
  flux: Id.optional(),
  explication: z.string().min(10).max(280),
  liens: z.array(Id).min(1),
});

/**
 * Une source de données surveillée.
 *
 * Le projet se périme par ses sources, pas par son code. Chaque source déclare
 * le signal le moins coûteux qui soit réellement actionnable — un ping qui
 * répond « 200 » pendant que la donnée dort depuis huit ans n'en est pas un.
 */
export const Surveillance = z.object({
  id: Id,
  nom: z.string().min(3),
  /** Ce que cette source alimente sur le site, pour savoir ce qui casse. */
  alimente: z.string().min(5).max(160),
  type: z.enum([
    'disponibilite',
    'fichier-date',
    'banatic-competences',
    'ofgl-millesime',
    'sispea-millesime',
    'opendatasoft-total',
    'opendatasoft-pieces',
    'datagouv-tabulaire',
    'datagouv-ressource',
    'paquet-npm',
    'melodi-periode',
    'opendatasoft-fraicheur',
  ]),
  url: z.string().min(3),
  /**
   * Pour `ofgl-millesime` : l'échelon des repères que cette base alimente.
   *
   * L'OFGL publie un jeu par échelon, et un agrégat peut disparaître de l'un
   * sans bouger dans l'autre. Chercher « Versement transport » dans les
   * comptes des communes le trouverait — 568 lignes résiduelles — et laisserait
   * croire que tout va bien alors que le site le lit chez les groupements.
   */
  echelon: z.enum(['commune', 'groupement']).default('commune'),
  /**
   * Pour `datagouv-ressource` et `opendatasoft-pieces` : le motif que doit
   * porter le nom de la ressource suivie. Un jeu de données en publie souvent
   * plusieurs, dont des notices PDF ; sans motif, on comparerait n'importe quoi.
   */
  ressource: z.string().min(1).optional(),
  /**
   * Pour `opendatasoft-total` : le nombre d'enregistrements au dernier relevé
   * connu. Une chute brutale est le signal — un référentiel ne perd pas la
   * moitié de ses lignes sans raison.
   */
  attendu: z.number().int().positive().optional(),
  /** La page de référence correspondante, si elle est déjà au contenu. */
  lien: Id.optional(),
});

/** Ce qu'on cherche à voir apparaître en open data. */
export const Decouverte = z.object({
  mots_cles: z.array(z.string().min(3)).min(1),
  depuis: z.coerce.date(),
});

/**
 * Qui édite le site, et qui l'héberge.
 *
 * L'article 6 de la loi pour la confiance dans l'économie numérique impose ces
 * mentions à tout site accessible au public. Elles ne se devinent pas depuis le
 * dépôt : elles sont déclarées dans `contenu/editeur.yaml`, et la validation
 * refuse de publier tant qu'un champ porte encore sa valeur d'attente. C'est la
 * même logique que le reste du contenu — ce qui doit être vrai est vérifié par
 * le build plutôt que par la mémoire de quelqu'un.
 */
export const ATTENTE_EDITEUR = 'À COMPLÉTER';

export const Editeur = z.object({
  nom: z.string().min(2),
  contact: z.string().min(2),
  directeur_publication: z.string().min(2),
  hebergeur: z.string().min(2),
  /**
   * Qui exploite techniquement le site, quand ce n'est pas l'éditeur.
   *
   * La loi ne l'exige pas : elle demande qui publie et qui héberge, et
   * l'exploitant technique n'est ni l'un ni l'autre. Le champ est donc
   * facultatif — un site tenu par une seule personne n'a rien à y mettre, et
   * le rendre obligatoire bloquerait sa publication pour une mention que
   * personne ne réclame.
   */
  realisation_technique: z.string().min(2).optional(),
});

/** Un fichier de contenu : toutes les entités d'un même rouage. */
export const FichierContenu = z.object({
  acteurs: z.array(Acteur).default([]),
  competences: z.array(Competence).default([]),
  documents: z.array(Document).default([]),
  processus: z.array(Processus).default([]),
  flux: z.array(Flux).default([]),
  sources: z.array(Source).default([]),
  sigles: z.array(Sigle).default([]),
  reperes: z.array(Repere).default([]),
  surveillances: z.array(Surveillance).default([]),
  decouverte: Decouverte.optional(),
  editeur: Editeur.optional(),
});

export type Decouverte = z.infer<typeof Decouverte>;
export type Editeur = z.infer<typeof Editeur>;
export type Repere = z.infer<typeof Repere>;
export type Surveillance = z.infer<typeof Surveillance>;
export type Sigle = z.infer<typeof Sigle>;
export type Source = z.infer<typeof Source>;
export type Acteur = z.infer<typeof Acteur>;
export type Competence = z.infer<typeof Competence>;
export type Document = z.infer<typeof Document>;
export type Etape = z.infer<typeof Etape>;
export type Levier = z.infer<typeof Levier>;
export type Processus = z.infer<typeof Processus>;
export type Flux = z.infer<typeof Flux>;
export type Delai = z.infer<typeof Delai>;
export type FichierContenu = z.infer<typeof FichierContenu>;
