/**
 * Les marchés publics d'une commune et de ses groupements.
 *
 * Les données essentielles de la commande publique disent à quoi une
 * collectivité passe commande : voirie, restauration scolaire, collecte des
 * déchets, assurance. C'est la forme la plus concrète de « où va l'argent »,
 * et elle nomme l'objet, pas seulement le montant.
 *
 * **Ce que ce module refuse de faire, et c'est l'essentiel : additionner.**
 * Un accord-cadre multi-attributaires produit une ligne par lot, et chaque
 * ligne déclare le plafond de l'accord entier. La ville de Paris a ainsi sept
 * marchés distincts portant chacun 21 M€ pour un même accord-cadre de travaux :
 * les sommer donnerait 147 M€. Sur les 661 873 marchés notifiés depuis 2023,
 * une addition naïve attribue 185 Md€ au seul bloc communal en trois ans —
 * davantage que la commande publique française entière. Le total serait faux
 * d'un ordre de grandeur, et faux avec aplomb.
 *
 * Ce qui reste vrai ligne à ligne : l'objet, la date de notification, la
 * procédure, et le montant **déclaré pour ce marché** — étant entendu qu'un
 * accord-cadre déclare un plafond, pas une dépense. Le site montre cela, et
 * dit qu'il ne totalise pas.
 *
 * La jointure est sûre, elle : `acheteur_id` est un SIRET dont les neuf
 * premiers chiffres sont le SIREN de l'acheteur, et le site connaît le SIREN
 * de chaque commune (découpage Etalab) comme de chaque groupement (BANATIC).
 *
 * **Ce qui arrive à échéance.** Chaque marché déclare sa durée en mois. La
 * notification plus cette durée donne le mois où l'acheteur devra relancer —
 * ou reconduire —, et c'est la question de qui veut répondre la prochaine
 * fois. L'échéance n'est que *prévisible* : un avenant ou une reconduction la
 * déplace, et le jeu national ne publie pas les modifications de durée — le
 * champ `dureemoismodification` vaut « CDL » sur toutes ses lignes depuis
 * 2023, vérifié le 1er octobre 2026.
 *
 * Et seuls comptent les marchés qui se renouvellent. Au Mayet-de-Montagne, le
 * premier essai annonçait « à échéance » l'achat d'un tracteur et un chantier
 * de voirie : ils s'achèvent, ils ne se relancent pas. Sont retenus les
 * accords-cadres, quel que soit leur objet — ils encadrent des commandes
 * répétées et se repassent à leur terme —, et les marchés de services
 * récurrents d'au moins un an. Les services se lisent au code CPV : division
 * 45 pour les travaux, 03 à 44 et 48 pour les fournitures, le reste pour les
 * services. Le deuxième essai a montré qu'il fallait en retirer les services
 * attachés à un projet unique — une maîtrise d'œuvre, une étude, une
 * assistance à maîtrise d'ouvrage durent plus d'un an et ne se repassent pas :
 * voir `PROJET`.
 *
 * **Le titulaire, depuis le 1er octobre 2026.** Le jeu donne son SIRET, pas
 * son nom ; SIRENE le donne (`sirene-noms.ts`). Une société est nommée par sa
 * dénomination, un entrepreneur individuel seulement s'il est diffusible au
 * répertoire, et un SIREN inconnu de la copie ne l'est pas : le marché dit
 * alors combien de titulaires il ne nomme pas. Les lots regroupés d'un
 * accord-cadre réunissent leurs titulaires.
 *
 * **Le contact de chaque acheteur et les avis ouverts, depuis le 8 octobre
 * 2026.** Les fichiers nationaux donnent, pour chaque acheteur, le téléphone,
 * l'adresse et le site de sa fiche à l'annuaire de l'administration
 * (`acheteurs-contacts.ts`) ; et `avis.json` les avis de marché du BOAMP
 * encore ouverts, rattachés aux mêmes acheteurs (`boamp-avis.ts`). L'une et
 * l'autre collecte sont isolées : si elle échoue, les fichiers s'écrivent
 * sans contact, et `avis.json` garde sa version précédente.
 *
 * Lancé seul — `npx tsx scripts/marches-emettre.ts` —, il réécrit les
 * fichiers des acheteurs que la dernière ingestion complète a retenus.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collecterContacts, contactDe, prenomsConnus, type Contact, type FicheAnnuaire } from './acheteurs-contacts.ts';
import { collecterAvis, lireAvisPrecedents, plierNom, rattacherAvis, type AvisCollectes } from './boamp-avis.ts';
import { telechargerSiAbsent } from './par-departement.ts';
import { retraits } from './retraits.ts';
import { nomsSirene } from './sirene-noms.ts';
import { jugementsBodacc, MOIS_RETENUS, situations as situationsDe, type Situation } from './titulaires-situation.ts';

const DECP =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/decp-2022-marches-valides';

/**
 * Depuis 2023 : avant, le recensement est trop lacunaire pour qu'une absence
 * veuille dire quelque chose — 12 630 marchés notifiés en 2021 contre 254 191
 * en 2025. Montrer 2021 laisserait croire qu'une commune ne commandait rien.
 */
export const DEPUIS = '2023-01-01';

/**
 * Ce que le fichier du département porte d'emblée : les plus récents, qui
 * disent ce qui se passe en ce moment.
 *
 * Le reste n'est pas jeté pour autant — il l'était, et c'était un tort : 88 %
 * des marchés n'atteignaient jamais le site, et la mention « les 5 plus
 * récents » ne menait nulle part. La suite part dans un fichier par acheteur,
 * chargé sur demande : le panneau reste léger pour qui ne clique pas, et
 * complet pour qui clique. Un fichier par acheteur plutôt qu'un par
 * département, parce qu'on ouvre la liste d'un acheteur, jamais celle de tout
 * un département : 2 ko à télécharger dans le cas médian au lieu de 1,5 Mo.
 */
const PAR_ACHETEUR = 5;

/** Les titulaires nommés d'un marché, au plus : au-delà, un accord-cadre à vingt lots se résume en un nombre. */
const MAX_TITULAIRES = 4;

/**
 * Les échéances qu'un acheteur porte dans le fichier du département : les plus
 * proches. Autant que la page en affiche au plus, toutes structures confondues
 * — ainsi les douze premières de la page sont exactes même quand un seul
 * acheteur les fournit toutes.
 */
export const ECHEANCES = 12;

/** La fenêtre des échéances, en mois à partir de celui de l'ingestion. */
const FENETRE_MOIS = 12;

/**
 * Combien de jours de marchés notifiés `attributions.json` porte. Les données
 * essentielles arrivent avec retard — un acheteur publie souvent ses marchés
 * des semaines après les avoir notifiés —, et un marché qui apparaît cette
 * semaine peut dater de deux mois : quatre-vingt-dix jours le rattrapent.
 */
export const RECENTS_JOURS = 90;

interface LigneDecp {
  acheteur_id: string | null;
  objet: string | null;
  montant: number | null;
  datenotification: string | null;
  procedure: string | null;
  /** Durée initiale en mois. */
  dureemois: number | string | null;
  /** Un nombre écrit en texte, ou « MQ NC » quand l'acheteur ne l'a pas dit. */
  offresrecues: string | number | null;
  /** Code CPV, chiffre de contrôle compris : « 45233140-2 ». */
  codecpv: string | null;
  /** « Accord-cadre », « Sans objet », ou plusieurs techniques séparées de virgules. */
  techniques: string | null;
  /** Jusqu'à trois titulaires : un identifiant, et son type — « SIRET » le plus souvent. */
  titulaire_id_1?: string | null;
  titulaire_typeidentifiant_1?: string | null;
  titulaire_id_2?: string | null;
  titulaire_typeidentifiant_2?: string | null;
  titulaire_id_3?: string | null;
  titulaire_typeidentifiant_3?: string | null;
  /** L'identifiant que l'acheteur donne au marché : « 2025-01-TMA-L3 », souvent avec le numéro du lot. */
  id?: string | null;
  lieuexecution_code?: string | null;
  lieuexecution_typecode?: string | null;
  formeprix?: string | null;
  modalitesexecution?: string | null;
  soustraitancedeclaree?: string | null;
  considerationssociales?: string | null;
  considerationsenvironnementales?: string | null;
  marcheinnovant?: string | null;
}

/**
 * Le détail d'un marché, tel que les données essentielles le déclarent :
 * [identifiant, durée initiale en mois (0 inconnue), lieu d'exécution, forme
 * du prix, modalités d'exécution, sous-traitance déclarée (1, 0 ou -1 si non
 * dit), considérations sociales, considérations environnementales, marché
 * innovant (1, 0 ou -1), les autres lots de la même consultation].
 *
 * **Les autres lots sont un rapprochement**, pas une donnée : deux lignes du
 * même acheteur, notifiées le même jour, dont l'identifiant ne diffère que
 * par le numéro de lot (« …-L1 », « …-L3 »). La page le dit.
 */
export type DetailMarche = [string, number, string, string, string, number, string, string, number, [string, number | null][]];

export interface Marche {
  /** Objet du marché, tronqué : la phrase entière tient rarement en un panneau. */
  objet: string;
  /** Montant déclaré, à l'euro près. Pour un accord-cadre, c'est un plafond. */
  montant: number | null;
  /** Date de notification (AAAA-MM-JJ). */
  date: string;
  /** Indice dans `PROCEDURES` : le libellé se répète des milliers de fois. */
  procedure: number;
  /** Nombre de lignes identiques regroupées : les lots d'un même accord-cadre. */
  lots: number;
  /**
   * Nombre d'offres reçues, quand l'acheteur l'a déclaré. Une seule offre,
   * c'est un marché sans concurrence effective : le fait se montre, il ne se
   * juge pas — une spécialité rare n'a parfois qu'un candidat possible.
   */
  offres?: number;
  /** Les titulaires nommés : SIREN et nom, d'après SIRENE. */
  t?: [string, string][];
  /** Les titulaires que le site ne nomme pas : non diffusibles, inconnus du répertoire, ou hors de France. */
  tx?: number;
  /** Le détail déclaré : voir `DetailMarche`. */
  x?: DetailMarche;
}

/** Un marché dont l'échéance prévisible tombe dans la fenêtre. */
export interface Echeance extends Marche {
  /** Mois d'échéance prévisible (AAAA-MM) : notification plus durée initiale. */
  fin: string;
  /**
   * Code CPV sans son chiffre de contrôle — « 90911200 » pour le nettoyage de
   * bâtiments. C'est le filtre « mon métier » de qui veut répondre ; il ne
   * voyage qu'avec les échéances.
   */
  cpv?: string;
  /**
   * L'historique chez cet acheteur : la date du premier marché du même groupe
   * CPV (trois chiffres) qu'un des titulaires a obtenu chez lui avant
   * celui-ci, et combien il en a obtenu. Rapproché sur le SIREN de
   * l'acheteur, le SIREN du titulaire et le groupe CPV, dans les marchés
   * recensés depuis `DEPUIS` : un titulaire plus ancien n'y paraît pas.
   */
  h?: [string, number];
}

/** Un marché récemment notifié, avec son code CPV : c'est le filtre « mon métier » de qui suit les attributions. */
export interface Attribution extends Marche {
  cpv?: string;
}

/**
 * Les procédures, énumérées une fois.
 *
 * Le libellé « Procédure adaptée » revient sur la moitié des marchés : le
 * répéter en toutes lettres pèserait plus lourd que tout le reste du fichier.
 * L'ordre fait foi, comme pour les familles de services.
 */
export const PROCEDURES = [
  'Procédure adaptée',
  "Appel d'offres ouvert",
  'Marché passé sans publicité ni mise en concurrence préalable',
  'Procédure avec négociation',
  "Appel d'offres restreint",
  'Dialogue compétitif',
] as const;

export interface Marches {
  /** SIREN de l'acheteur -> ses marchés les plus récents. */
  parAcheteur: Map<string, Marche[]>;
  /**
   * SIREN -> tout ce qui vient après ces plus récents, dans le même ordre.
   *
   * Les cinq premiers ne sont pas répétés ici : le client les a déjà, et les
   * redonner coûterait cinq millions d'octets pour rien.
   */
  suites: Map<string, Marche[]>;
  /** SIREN -> nombre total de marchés notifiés depuis `DEPUIS`, avant troncature. */
  totaux: Map<string, number>;
  /** SIREN -> ses marchés à échéance dans la fenêtre, du plus proche au plus lointain. */
  echeances: Map<string, Echeance[]>;
  /** SIREN -> ses marchés notifiés depuis `recentsDepuis`, du plus récent au plus ancien. */
  recents: Map<string, Attribution[]>;
  /** Le premier jour couvert par `recents` (AAAA-MM-JJ). */
  recentsDepuis: string;
  /** Premier et dernier mois de la fenêtre des échéances (AAAA-MM), bornes comprises. */
  fenetre: [string, string];
  /**
   * SIREN -> le SIRET sous lequel l'acheteur a notifié le plus de marchés. Un
   * groupement achète parfois sous plusieurs établissements ; c'est par ce
   * SIRET que d'autres outils, comme Colibre, désignent l'acheteur.
   */
  sirets: Map<string, string>;
  depuis: string;
  maj: string;
  /** SIREN -> la fiche de l'acheteur à l'annuaire de l'administration ; absent si la collecte a échoué. */
  annuaire?: Map<string, FicheAnnuaire>;
  /** Les avis de marché ouverts du BOAMP ; absent si la collecte a échoué. */
  avis?: AvisCollectes;
  /**
   * SIREN d'un titulaire nommé -> sa situation : dernier jugement de
   * procédure collective au BODACC, cessation à SIRENE. Absent si la collecte
   * a échoué ; un titulaire sans rien à signaler n'y figure pas.
   */
  situations?: Map<string, Situation>;
}

/** AAAA-MM, `mois` mois après le mois de `iso`. Le jour ne compte pas. */
export function ajouterMois(iso: string, mois: number): string {
  const t = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + mois;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/**
 * Un marché qui se repasse à son terme : un accord-cadre, ou un marché de
 * services d'au moins un an. Un chantier ou un achat ponctuel s'achève.
 */
export function serenouvelle(cpv: string | null, techniques: string | null, duree: number): boolean {
  if (/accord-cadre/i.test(techniques ?? '')) return true;
  const division = Number((cpv ?? '').slice(0, 2));
  const service = Number.isInteger(division) && division >= 49 && !PROJET.has(division);
  return service && duree >= 12;
}

/**
 * Les divisions de services qui suivent un projet plutôt qu'un besoin
 * récurrent : installation (51), immobilier (70), architecture, construction,
 * ingénierie et inspection (71), recherche et développement (73),
 * administration publique (75), industrie pétrolière et gazière (76). Restent
 * l'entretien, la restauration, le transport, les télécommunications,
 * l'assurance, l'informatique, les espaces verts, l'impression et la sécurité,
 * la formation, l'action sociale, la collecte et le nettoyage.
 */
const PROJET = new Set([51, 70, 71, 73, 75, 76]);

/** Les huit chiffres du code CPV, sans le chiffre de contrôle ; rien s'il est illisible. */
function cpv(code: string | null): { cpv?: string } {
  const m = /^\s*(\d{8})/.exec(code ?? '');
  return m ? { cpv: m[1] } : {};
}

/** Un entier positif, ou rien : « MQ NC », une durée nulle ou négative ne disent rien. */
function entierPositif(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : /^\s*\d+\s*$/.test(String(v ?? '')) ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

const MAX_OBJET = 90;

/**
 * Ce que Windows-1252 devient quand on le lit comme du Latin-1.
 *
 * Les octets 0x80 à 0x9F portent en Windows-1252 l'apostrophe typographique,
 * le tiret demi-cadratin, l'œ lié ; en Latin-1 ce sont des caractères de
 * commande, et c'est sous cette forme qu'ils arrivent : « GROS \u008cUVRE »,
 * « D\u0092ACTIONS ». 1 783 objets sur 369 872 en portent au moins un.
 *
 * La correction est sans perte et sans jugement : un caractère de commande
 * n'a aucune raison d'être dans le libellé d'un marché, et la table de
 * Windows-1252 dit exactement lequel était visé. Les deux positions vides de
 * cette table restent telles quelles — trois objets, qu'on ne devine pas.
 */
const CP1252 = new Map<number, string>([
  [0x80, '\u20ac'], [0x82, '\u201a'], [0x83, '\u0192'], [0x84, '\u201e'],
  [0x85, '\u2026'], [0x86, '\u2020'], [0x87, '\u2021'], [0x88, '\u02c6'],
  [0x89, '\u2030'], [0x8a, '\u0160'], [0x8b, '\u2039'], [0x8c, '\u0152'],
  [0x8e, '\u017d'], [0x91, '\u2018'], [0x92, '\u2019'], [0x93, '\u201c'],
  [0x94, '\u201d'], [0x95, '\u2022'], [0x96, '\u2013'], [0x97, '\u2014'],
  [0x98, '\u02dc'], [0x99, '\u2122'], [0x9a, '\u0161'], [0x9b, '\u203a'],
  [0x9c, '\u0153'], [0x9e, '\u017e'], [0x9f, '\u0178'],
]);

/**
 * Deux accidents d'encodage, corrigés ; le reste, laissé tel quel.
 *
 * Le second : un caractère de remplacement traîne dans 3 603 objets sur
 * 661 873, où `¿` tient la place d'une apostrophe — « d¿un tracteur »,
 * « D¿IMPRESSION ». Toujours entre deux lettres, et le remplacer là et
 * seulement là ne peut rien abîmer d'autre.
 *
 * Ce qu'on ne corrige pas : les majuscules sans accents, les fautes de frappe,
 * ni les libellés jumeaux d'un même marché publié deux fois. Le premier serait
 * de la réécriture, le dernier une devinette.
 */
function nettoyer(objet: string): string {
  return objet
    .replace(/[\u0080-\u009f]/g, (c) => CP1252.get(c.charCodeAt(0)) ?? c)
    .replace(/(\p{L})\u00bf(\p{L})/gu, '$1\u2019$2')
    .trim();
}

/** Une valeur déclarée, ou rien : « CDL » et « MQ NC » sont les absences du jeu. */
const declare = (v: string | null | undefined) => {
  const t = String(v ?? '').trim();
  return t === 'CDL' || t === 'MQ NC' || t === 'Sans objet' ? '' : t;
};
const ouiNon = (v: string | null | undefined) => {
  const t = declare(v).toLowerCase();
  return t === 'oui' || t === 'true' ? 1 : t === 'non' || t === 'false' ? 0 : -1;
};
/** Une considération sociale ou environnementale : rien quand l'acheteur dit n'en avoir pas. */
const consideration = (v: string | null | undefined) => {
  const t = declare(v);
  return /^pas de/i.test(t) ? '' : t;
};

function detailDe(l: LigneDecp, duree: number | undefined): DetailMarche {
  const code = declare(l.lieuexecution_code);
  const type = declare(l.lieuexecution_typecode).toLowerCase();
  return [
    declare(l.id).slice(0, 60),
    duree ?? 0,
    code ? `${type ? `${type} ` : ''}${code}` : '',
    declare(l.formeprix),
    declare(l.modalitesexecution),
    ouiNon(l.soustraitancedeclaree),
    consideration(l.considerationssociales),
    consideration(l.considerationsenvironnementales),
    ouiNon(l.marcheinnovant),
    [],
  ];
}

/** L'identifiant sans son numéro de lot, ou null s'il n'en porte pas : « 2025-01-TMA-L3 » → « 2025-01-TMA ». */
export function consultationDe(id: string): string | null {
  const m = /^(.*?\S)[\s._-]*(?:lot|l)[\s._-]*0*\d{1,3}$/i.exec(id.trim());
  return m && m[1].length >= 3 ? m[1] : null;
}

/**
 * Ce qu'un des titulaires d'une échéance a déjà obtenu chez le même acheteur,
 * dans le même métier (groupe CPV), avant elle : la date du premier de ces
 * marchés et leur nombre. Rien quand l'échéance n'a ni code CPV ni titulaire
 * nommé, ou quand il n'y a pas d'antécédent.
 */
export function historique(
  x: { date: string; cpv?: string; t?: [string, string][] },
  marchesDeLAcheteur: { date: string; cpv?: string; t?: [string, string][] }[],
): [string, number] | undefined {
  if (!x.cpv || !x.t || x.t.length === 0) return undefined;
  const groupe = x.cpv.slice(0, 3);
  const siens = new Set(x.t.map(([s]) => s));
  const avant = marchesDeLAcheteur.filter(
    (y) => y !== x && y.date < x.date && y.cpv?.startsWith(groupe) && (y.t ?? []).some(([s]) => siens.has(s)),
  );
  if (avant.length === 0) return undefined;
  return [avant.map((y) => y.date).sort()[0], avant.length];
}

export async function collecterMarches(
  json: <T>(url: string) => Promise<T>,
  sirensSuivis: Set<string>,
  dire: (m: string) => void,
  /** Pour lire SIRENE ; sans lui, les titulaires ne sont pas nommés. */
  texte?: (url: string) => Promise<string>,
  /** Le dossier des fichiers : `avis.json` y dit depuis quand relire le BOAMP. */
  sortie?: string,
): Promise<Marches | null> {
  const url =
    `${DECP}/exports/json?select=acheteur_id,objet,montant,datenotification,procedure,dureemois,offresrecues,codecpv,techniques,` +
    'titulaire_id_1,titulaire_typeidentifiant_1,titulaire_id_2,titulaire_typeidentifiant_2,titulaire_id_3,titulaire_typeidentifiant_3,' +
    'id,lieuexecution_code,lieuexecution_typecode,formeprix,modalitesexecution,soustraitancedeclaree,' +
    'considerationssociales,considerationsenvironnementales,marcheinnovant';
  // Une année de notification par requête : l'export entier dépasse la plus
  // longue chaîne que Node sait décoder (512 Mo) depuis que chaque marché
  // porte son détail.
  const lignes: LigneDecp[] = [];
  const premiere = Number(DEPUIS.slice(0, 4));
  for (let annee = premiere; annee <= new Date().getUTCFullYear(); annee++) {
    const debut = annee === premiere ? DEPUIS : `${annee}-01-01`;
    const where = `datenotification>=date'${debut}' and datenotification<date'${annee + 1}-01-01'`;
    for (const l of await json<LigneDecp[]>(`${url}&where=${encodeURIComponent(where)}`)) lignes.push(l);
  }
  if (lignes.length === 0) {
    dire('Marchés publics : aucune ligne, le jeu a changé de forme.');
    return null;
  }

  // Regroupées avant d'être comptées : un accord-cadre multi-attributaires
  // publie une ligne par lot, avec le même objet, le même montant et la même
  // date. Les afficher sept fois ferait passer une commande pour sept.
  const brut = new Map<string, Map<string, Attribution & { fin?: string }>>();
  const totaux = new Map<string, number>();
  const parSiret = new Map<string, Map<string, number>>();
  const inconnues = new Set<string>();
  // Les titulaires de chaque marché regroupé : un SIREN, ou « ? » pour un
  // identifiant qui n'en est pas un (TVA, hors Union européenne…).
  const titulaires = new Map<Marche, Set<string>>();
  for (const l of lignes) {
    const siren = String(l.acheteur_id ?? '').slice(0, 9);
    if (siren.length !== 9 || !sirensSuivis.has(siren)) continue;
    const siret = String(l.acheteur_id ?? '').trim();
    if (/^\d{14}$/.test(siret)) {
      const c = parSiret.get(siren) ?? new Map<string, number>();
      c.set(siret, (c.get(siret) ?? 0) + 1);
      parSiret.set(siren, c);
    }
    const objet = nettoyer(l.objet ?? '');
    const date = (l.datenotification ?? '').slice(0, 10);
    if (!objet || !date) continue;

    const cle = `${objet}|${l.montant}|${date}`;
    let m = brut.get(siren);
    if (!m) {
      m = new Map();
      brut.set(siren, m);
    }
    const ids = ([1, 2, 3] as const)
      .map((i) => [String(l[`titulaire_id_${i}`] ?? '').trim(), String(l[`titulaire_typeidentifiant_${i}`] ?? '').trim()])
      .filter(([id, type]) => id && id !== 'CDL' && type !== 'CDL')
      .map(([id, type]) => (type === 'SIRET' && /^\d{14}$/.test(id) ? id.slice(0, 9) : `?${type}:${id}`));
    const vu = m.get(cle);
    if (vu) {
      vu.lots++;
      const deja = titulaires.get(vu) ?? new Set<string>();
      for (const id of ids) deja.add(id);
      titulaires.set(vu, deja);
    } else {
      // −1 quand le libellé n'est pas dans la liste : le client n'affichera
      // alors pas de procédure, plutôt que d'en inventer une.
      const proc = PROCEDURES.indexOf((l.procedure ?? '').trim() as (typeof PROCEDURES)[number]);
      if (proc === -1 && (l.procedure ?? '').trim()) inconnues.add((l.procedure ?? '').trim());
      const duree = entierPositif(l.dureemois);
      const offres = entierPositif(l.offresrecues);
      m.set(cle, {
        objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
        // Arrondi à l'euro : les centimes d'un marché de 489 025,50 € ne
        // changent rien à ce qu'on en comprend, et pèsent sur chaque ligne.
        montant:
          typeof l.montant === 'number' && Number.isFinite(l.montant) ? Math.round(l.montant) : null,
        date,
        procedure: proc,
        lots: 1,
        ...(offres ? { offres } : {}),
        x: detailDe(l, duree),
        ...(duree && serenouvelle(l.codecpv, l.techniques, duree) ? { fin: ajouterMois(date, duree) } : {}),
        ...cpv(l.codecpv),
      });
      titulaires.set(m.get(cle)!, new Set(ids));
    }
    totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
  }

  // Les autres lots de la même consultation : même acheteur, même jour, même
  // identifiant au numéro de lot près.
  let rapproches = 0;
  for (const m of brut.values()) {
    const groupes = new Map<string, (Attribution & { fin?: string })[]>();
    for (const x of m.values()) {
      const base = x.x ? consultationDe(x.x[0]) : null;
      if (!base) continue;
      const k = `${x.date}|${base}`;
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k)!.push(x);
    }
    for (const g of groupes.values()) {
      if (g.length < 2) continue;
      for (const x of g) {
        x.x![9] = g
          .filter((y) => y !== x)
          .slice(0, 8)
          .map((y) => [y.objet.length > 80 ? `${y.objet.slice(0, 79)}…` : y.objet, y.montant] as [string, number | null]);
        rapproches++;
      }
    }
  }
  if (rapproches > 0) dire(`  ${rapproches.toLocaleString('fr-FR')} marchés rapprochés des autres lots de leur consultation.`);

  // Le nom de chaque titulaire, une fois pour tous les marchés.
  const cessees = new Set<string>();
  if (texte) {
    const tous = new Set<string>();
    for (const ids of titulaires.values()) for (const id of ids) if (!id.startsWith('?')) tous.add(id);
    const noms = await nomsSirene(texte, tous);
    for (const [s, n] of noms) if (n.cessee) cessees.add(s);
    const retires = retraits().entreprises;
    let nommes = 0;
    let tus = 0;
    for (const [marche, ids] of titulaires) {
      const t: [string, string][] = [];
      let tx = 0;
      for (const id of ids) {
        const n = id.startsWith('?') || retires.has(id) ? undefined : noms.get(id);
        if (n && t.length < MAX_TITULAIRES) t.push([id, n.nom]);
        else tx++;
      }
      if (t.length > 0) marche.t = t;
      if (tx > 0) marche.tx = tx;
      nommes += t.length;
      tus += tx;
    }
    dire(
      `  titulaires : ${tous.size.toLocaleString('fr-FR')} SIREN relus au répertoire, ${noms.size.toLocaleString('fr-FR')} nommables ; ` +
        `${nommes.toLocaleString('fr-FR')} mentions nommées, ${tus.toLocaleString('fr-FR')} non nommées.`,
    );
  }

  const maj = new Date().toISOString().slice(0, 10);
  const fenetre: [string, string] = [ajouterMois(maj, 0), ajouterMois(maj, FENETRE_MOIS - 1)];
  const recentsDepuis = new Date(Date.parse(maj) - RECENTS_JOURS * 86_400_000).toISOString().slice(0, 10);
  const parAcheteur = new Map<string, Marche[]>();
  const suites = new Map<string, Marche[]>();
  const echeances = new Map<string, Echeance[]>();
  const recents = new Map<string, Attribution[]>();
  let nEcheances = 0;
  let nRecents = 0;
  for (const [siren, m] of brut) {
    const tout = [...m.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.montant ?? 0) - (a.montant ?? 0),
    );
    // L'échéance ne voyage qu'avec les échéances : la porter sur chacun des
    // 420 000 marchés alourdirait les listes pour une information qu'elles
    // n'affichent pas. Le code CPV reste, comme avant, sur les marchés qui se
    // renouvellent — ceux qui ont une échéance — et seulement sur eux.
    const liste = tout.map(({ fin, cpv, ...sans }): Marche => (fin && cpv ? { ...sans, cpv } : sans) as Marche);
    const neufs = tout.filter((x) => x.date >= recentsDepuis).map(({ fin: _fin, ...sans }): Attribution => sans);
    if (neufs.length > 0) {
      recents.set(siren, neufs);
      nRecents += neufs.length;
    }
    parAcheteur.set(siren, liste.slice(0, PAR_ACHETEUR));
    if (liste.length > PAR_ACHETEUR) suites.set(siren, liste.slice(PAR_ACHETEUR));
    const proches = tout
      .filter((x): x is Echeance => x.fin !== undefined && x.fin >= fenetre[0] && x.fin <= fenetre[1])
      .map((x) => {
        const h = historique(x, tout);
        return h ? { ...x, h } : x;
      })
      .sort((a, b) => a.fin.localeCompare(b.fin) || (b.montant ?? 0) - (a.montant ?? 0));
    if (proches.length > 0) {
      echeances.set(siren, proches);
      nEcheances += proches.length;
    }
  }

  if (inconnues.size > 0) {
    // Pas une erreur : la liste des procédures évolue, et une procédure non
    // reconnue vaut mieux affichée comme absente qu'écrite de travers. Mais on
    // le dit, sinon la liste se périmerait sans qu'on le sache.
    dire(`  procédure(s) hors liste, à ajouter à PROCEDURES : ${[...inconnues].join(' ; ')}`);
  }

  const retenus = [...totaux.values()].reduce((a, b) => a + b, 0);
  dire(
    `Marchés publics : ${lignes.length.toLocaleString('fr-FR')} notifiés depuis ${DEPUIS.slice(0, 4)}, ` +
      `dont ${retenus.toLocaleString('fr-FR')} pour ${parAcheteur.size.toLocaleString('fr-FR')} ` +
      `acheteurs du bloc communal ; ${nEcheances.toLocaleString('fr-FR')} à échéance prévisible ` +
      `de ${fenetre[0]} à ${fenetre[1]} ; ${nRecents.toLocaleString('fr-FR')} notifiés depuis le ${recentsDepuis}.`,
  );
  const sirets = new Map<string, string>();
  for (const [siren, c] of parSiret) sirets.set(siren, [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);

  // Deux collectes de plus, isolées : l'échec de l'une ne coûte que ce qu'elle apporte.
  let annuaire: Map<string, FicheAnnuaire> | undefined;
  try {
    annuaire = await collecterContacts(json, new Set(parAcheteur.keys()), dire);
  } catch (e) {
    dire(`  annuaire de l'administration : ${(e as Error).message} — les fichiers s'écrivent sans contact.`);
  }
  let avis: AvisCollectes | undefined;
  try {
    avis = await collecterAvis(json, dire, sortie);
  } catch (e) {
    dire(`  BOAMP : ${(e as Error).message} — avis.json garde sa version précédente.`);
  }
  // La situation des titulaires nommés des marchés publiés : échéances et attributions.
  let situations: Map<string, Situation> | undefined;
  try {
    const publies = new Set<string>();
    for (const liste of [...echeances.values(), ...recents.values()]) {
      for (const x of liste) for (const [s] of x.t ?? []) publies.add(s);
    }
    const depuisJugements = `${ajouterMois(maj, -MOIS_RETENUS)}-01`;
    const jugements = await jugementsBodacc(json, publies, depuisJugements);
    situations = situationsDe(publies, jugements, cessees);
    const nc = [...situations.values()].filter((x) => x.c).length;
    dire(
      `  situation des titulaires : ${publies.size.toLocaleString('fr-FR')} relus au BODACC depuis le ${depuisJugements} ; ` +
        `${jugements.size.toLocaleString('fr-FR')} avec un jugement de procédure collective, ${nc.toLocaleString('fr-FR')} cessés au répertoire.`,
    );
  } catch (e) {
    dire(`  BODACC : ${(e as Error).message} — les fichiers s'écrivent sans la situation des titulaires.`);
  }
  return {
    parAcheteur,
    suites,
    totaux,
    echeances,
    recents,
    recentsDepuis,
    fenetre,
    sirets,
    depuis: DEPUIS,
    maj,
    ...(annuaire ? { annuaire } : {}),
    ...(avis ? { avis } : {}),
    ...(situations ? { situations } : {}),
  };
}

/** Les situations des titulaires qu'une liste de marchés nomme, ou rien. */
function situationsCitees(marches: Marches, liste: Marche[]): { situations?: Record<string, Situation> } {
  if (!marches.situations) return {};
  const out: Record<string, Situation> = {};
  for (const x of liste) {
    for (const [s] of x.t ?? []) {
      const sit = marches.situations.get(s);
      if (sit) out[s] = sit;
    }
  }
  return { situations: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))) };
}

/**
 * Un fichier par département, indexé par SIREN d'acheteur — commune ou
 * groupement, indifféremment : c'est le client qui sait de qui il dépend.
 */
export function ecrireMarches(
  sortie: string,
  dep: string,
  sirens: string[],
  /**
   * Code INSEE -> SIREN, pour les communes du département. Le client connaît
   * le SIREN de chaque groupement — BANATIC le lui donne — mais pas celui de
   * sa propre commune : il n'a jamais servi jusqu'ici.
   */
  sirenDeCommune: Map<string, string>,
  marches: Marches,
): number {
  const h: Record<string, { n: number; m: Marche[]; s?: string; ne?: number; e?: Echeance[] }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = marches.parAcheteur.get(siren);
    if (!liste || liste.length === 0) continue;
    const ech = marches.echeances.get(siren) ?? [];
    const siret = marches.sirets.get(siren);
    h[siren] = {
      n: marches.totaux.get(siren) ?? liste.length,
      m: liste,
      ...(siret ? { s: siret } : {}),
      ...(ech.length > 0 ? { ne: ech.length, e: ech.slice(0, ECHEANCES) } : {}),
    };
    n++;
  }
  if (n === 0) return 0;
  const com: Record<string, string> = {};
  for (const [code, siren] of [...sirenDeCommune].sort()) {
    if (h[siren]) com[code] = siren;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-marches.json`),
    JSON.stringify({
      dep,
      depuis: marches.depuis,
      maj: marches.maj,
      fenetre: marches.fenetre,
      procedures: PROCEDURES,
      com,
      h,
    }),
  );
  return n;
}

/**
 * La suite de la liste, un fichier par acheteur.
 *
 * Écrite une seule fois pour tout le pays, et non département par département :
 * la métropole d'Aix-Marseille-Provence sert trois départements, et son fichier
 * serait sinon écrit trois fois à l'identique.
 *
 * Le libellé des procédures n'y est pas répété : le client a déjà chargé le
 * fichier du département — c'est lui qui affiche les cinq premiers marchés et
 * porte le bouton — et le même index y figure.
 *
 * 6 708 fichiers, 47 Mo au total, 2 ko dans le cas médian. Seuls les acheteurs
 * qui ont plus de cinq marchés en ont un : pour les autres, le fichier du
 * département dit déjà tout.
 */
export function ecrireSuitesMarches(sortie: string, marches: Marches): number {
  const dossier = join(sortie, 'marches');
  mkdirSync(dossier, { recursive: true });
  let n = 0;
  for (const [siren, liste] of marches.suites) {
    if (liste.length === 0) continue;
    writeFileSync(join(dossier, `${siren}.json`), JSON.stringify({ m: liste }));
    n++;
  }
  return n;
}

/** Les natures de groupement à fiscalité propre : ce qu'on appelle une intercommunalité. */
const A_FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'EPT', 'SAN']);

/** Un acheteur, tel que les fichiers nationaux le décrivent. */
interface Acheteur {
  nom: string | null;
  deps: string[];
  /** Le code INSEE, pour une commune : sa page sur rouages.fr. */
  commune?: string;
  /**
   * Les intercommunalités sur le territoire desquelles il agit : la sienne
   * pour une commune, elle-même pour une intercommunalité, celles de ses
   * communes membres pour un syndicat. C'est le périmètre « une
   * intercommunalité » de qui cherche des marchés, et le territoire d'une
   * intercommunalité qui regarde ses membres.
   */
  epci?: string[];
  /** Ses coordonnées à l'annuaire de l'administration, quand il y a une fiche. */
  contact?: Contact;
}

/**
 * Les acheteurs retenus par au moins un département, avec leur nom, leurs
 * départements et leurs intercommunalités ; et les intercommunalités du pays,
 * nommées. Relus dans les fichiers déjà écrits : groupements et communes dans
 * `dep/XX.json`, SIREN des communes dans `dep/XX-marches.json`.
 */
function acheteursNommes(
  sortie: string,
  /** Les fiches de l'annuaire : sans elles, les acheteurs n'ont pas de contact. */
  annuaire?: Map<string, FicheAnnuaire>,
): {
  acheteurs: Map<string, Acheteur>;
  epci: Map<string, { nom: string; deps: string[] }>;
} {
  const acheteurs = new Map<string, Acheteur>();
  const epci = new Map<string, { nom: string; deps: string[] }>();
  const dossier = join(sortie, 'dep');
  const ajouter = <T>(liste: T[], x: T) => {
    if (!liste.includes(x)) liste.push(x);
  };
  for (const f of readdirSync(dossier).sort()) {
    const dep = /^(\w+)-marches\.json$/.exec(f)?.[1];
    if (!dep) continue;
    const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as {
      com: Record<string, string>;
      h: Record<string, unknown>;
    };
    // Groupement : SIREN, nom, nature. Commune : code, nom, population, indices de ses groupements.
    let g: [string, string, string, ...unknown[]][] = [];
    let c: [string, string, number, number[], ...unknown[]][] = [];
    try {
      const s = JSON.parse(readFileSync(join(dossier, `${dep}.json`), 'utf8')) as { g?: typeof g; c?: typeof c };
      g = s.g ?? [];
      c = s.c ?? [];
    } catch {
      // Sans le fichier des structures, les acheteurs restent sans nom ni intercommunalité.
    }
    const noms = new Map<string, string>(g.map((x) => [x[0], x[1]]));
    const intercos = new Set(g.filter((x) => A_FISCALITE_PROPRE.has(x[2])).map((x) => x[0]));
    for (const [siren, nom, nature] of g) {
      if (!A_FISCALITE_PROPRE.has(nature)) continue;
      const e = epci.get(siren) ?? { nom, deps: [] };
      ajouter(e.deps, dep);
      epci.set(siren, e);
    }
    // Les intercommunalités de chaque commune, et par là celles de chaque syndicat.
    const deCommune = new Map<string, string[]>();
    const deGroupement = new Map<string, string[]>();
    for (const [code, , , membres] of c) {
      const siens = (membres ?? []).map((i) => g[i]?.[0]).filter((s): s is string => !!s);
      const ses = siens.filter((s) => intercos.has(s));
      deCommune.set(code, ses);
      for (const s of siens) {
        const l = deGroupement.get(s) ?? [];
        for (const e of ses) ajouter(l, e);
        deGroupement.set(s, l);
      }
    }
    const codeDeSiren = new Map<string, string>();
    for (const [code, siren] of Object.entries(d.com)) {
      codeDeSiren.set(siren, code);
      const n = c.find((x) => x[0] === code)?.[1];
      if (n) noms.set(siren, n);
    }
    for (const siren of Object.keys(d.h)) {
      const a = acheteurs.get(siren) ?? { nom: null, deps: [] };
      a.nom ??= noms.get(siren) ?? null;
      ajouter(a.deps, dep);
      const code = codeDeSiren.get(siren);
      if (code) a.commune = code;
      const ses = intercos.has(siren) ? [siren] : code ? deCommune.get(code) : deGroupement.get(siren);
      if (ses && ses.length > 0) {
        a.epci ??= [];
        for (const e of ses) ajouter(a.epci, e);
      }
      acheteurs.set(siren, a);
    }
  }
  if (annuaire) {
    const prenoms = prenomsConnus(sortie);
    for (const [siren, a] of acheteurs) {
      const f = annuaire.get(siren);
      const contact = f ? contactDe(f, prenoms) : undefined;
      if (contact) a.contact = contact;
    }
  }
  return { acheteurs, epci };
}

/** Les acheteurs et les intercommunalités qu'un fichier national cite. */
function cites(
  { acheteurs, epci }: ReturnType<typeof acheteursNommes>,
  sirens: Set<string>,
): { acheteurs: Record<string, Acheteur>; epci: Record<string, { nom: string; deps: string[] }> } {
  const retenus = [...acheteurs].filter(([s]) => sirens.has(s)).sort(([a], [b]) => a.localeCompare(b));
  const ses = new Set(retenus.flatMap(([, a]) => a.epci ?? []));
  return {
    acheteurs: Object.fromEntries(retenus),
    epci: Object.fromEntries([...epci].filter(([s]) => ses.has(s)).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/**
 * Toutes les échéances du pays dans un seul fichier, `echeances.json`.
 *
 * Les fichiers par département servent la page de commune : douze échéances
 * par acheteur, rangées sous lui. Qui veut répondre cherche autrement — un
 * métier sur un territoire —, et il lui faut la liste entière, avec le nom de
 * l'acheteur, ses départements et le code CPV. C'est une donnée publique, et
 * elle reste publique : publiée ici, ouverte comme le reste, et c'est elle que
 * lisent les services construits au-dessus.
 *
 * Écrit après les fichiers par département, qu'il relit : le nom d'un
 * groupement est dans `dep/XX.json`, celui d'une commune aussi, son SIREN
 * dans `dep/XX-marches.json`. Un acheteur qu'aucun département n'a retenu n'y
 * figure pas, comme il ne figure sur aucune page.
 */
export function ecrireEcheancesNationales(sortie: string, marches: Marches): number {
  const lus = acheteursNommes(sortie, marches.annuaire);
  const { acheteurs } = lus;
  const e: (Echeance & { a: string })[] = [];
  for (const [siren, liste] of marches.echeances) {
    if (!acheteurs.has(siren)) continue;
    for (const x of liste) e.push({ a: siren, ...x });
  }
  e.sort((x, y) => x.fin.localeCompare(y.fin) || x.a.localeCompare(y.a) || x.objet.localeCompare(y.objet));
  writeFileSync(
    join(sortie, 'echeances.json'),
    JSON.stringify({
      maj: marches.maj,
      fenetre: marches.fenetre,
      procedures: PROCEDURES,
      ...cites(lus, new Set(e.map((x) => x.a))),
      ...situationsCitees(marches, e),
      e,
    }),
  );
  return e.length;
}

/**
 * Les marchés notifiés ces quatre-vingt-dix derniers jours, pour tout le pays,
 * dans `attributions.json` : qui a obtenu quoi, chez quel acheteur, avec le
 * code CPV. Le pendant d'`echeances.json` — l'un dit ce qui va se rejouer,
 * l'autre ce qui vient de se jouer —, publié de même pour être téléchargé, et
 * lu par les services qui alertent sur les nouvelles attributions.
 *
 * Même forme qu'`echeances.json` : les acheteurs une fois, nommés, puis les
 * marchés, du plus récent au plus ancien.
 */
export function ecrireAttributionsNationales(sortie: string, marches: Marches): number {
  const lus = acheteursNommes(sortie, marches.annuaire);
  const { acheteurs } = lus;
  const m: (Attribution & { a: string })[] = [];
  for (const [siren, liste] of marches.recents) {
    if (!acheteurs.has(siren)) continue;
    for (const x of liste) m.push({ a: siren, ...x });
  }
  m.sort((x, y) => y.date.localeCompare(x.date) || x.a.localeCompare(y.a) || x.objet.localeCompare(y.objet));
  writeFileSync(
    join(sortie, 'attributions.json'),
    JSON.stringify({
      maj: marches.maj,
      depuis: marches.recentsDepuis,
      procedures: PROCEDURES,
      ...cites(lus, new Set(m.map((x) => x.a))),
      ...situationsCitees(marches, m),
      m,
    }),
  );
  return m.length;
}

/**
 * Les avis de marché ouverts, pour tout le pays, dans `avis.json` : ce qu'un
 * acheteur suivi demande en ce moment, et jusqu'à quand on peut répondre. Le
 * troisième fichier national, après ce qui va se rejouer (`echeances.json`) et
 * ce qui vient de se jouer (`attributions.json`), de même forme : les
 * acheteurs une fois, nommés, puis les avis, du plus récent au plus ancien.
 *
 * Chaque avis dit comment il a été rattaché — par le SIRET que porte l'avis,
 * ou par le nom de l'acheteur dans son département —, parce que le second est
 * moins sûr que le premier et que qui lit doit pouvoir le savoir.
 *
 * Sans collecte du BOAMP, le fichier précédent reste en place : rien n'est
 * écrit, et la fonction rend `null`.
 */
export function ecrireAvisNationaux(
  sortie: string,
  marches: Marches,
): { avis: number; parSiret: number; parNom: number; ambigus: number } | null {
  if (!marches.avis) return null;
  const lus = acheteursNommes(sortie, marches.annuaire);
  const precedents = lireAvisPrecedents(sortie)?.avis ?? [];
  let departements = new Set<string>();
  const chemin = join(sortie, 'deps.json');
  if (existsSync(chemin)) {
    departements = new Set(Object.values(JSON.parse(readFileSync(chemin, 'utf8')) as Record<string, string>).map(plierNom));
  }
  const r = rattacherAvis(marches.avis, lus.acheteurs, precedents, departements);
  const avis = r.avis.map((a) => {
    const objet = nettoyer(a.objet);
    return { ...a, objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet };
  });
  writeFileSync(
    join(sortie, 'avis.json'),
    JSON.stringify({
      maj: marches.avis.maj,
      depuis: marches.avis.depuis,
      ...cites(lus, new Set(avis.map((x) => x.a))),
      avis,
    }),
  );
  return { avis: avis.length, parSiret: r.parSiret, parNom: r.parNom, ambigus: r.ambigus };
}

// Lancé seul : les acheteurs que la dernière ingestion complète a retenus,
// relus dans ses fichiers. Un acheteur qui n'avait encore aucun marché n'y
// figure pas : il n'entre qu'à la réingestion complète, qui connaît les
// groupements de chaque commune.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const parDep = new Map<string, { sirens: string[]; com: Map<string, string> }>();
  for (const f of readdirSync(join(sortie, 'dep'))) {
    const dep = /^(\w+)-marches\.json$/.exec(f)?.[1];
    if (!dep) continue;
    const d = JSON.parse(readFileSync(join(sortie, 'dep', f), 'utf8')) as {
      com: Record<string, string>;
      h: Record<string, unknown>;
    };
    parDep.set(dep, { sirens: Object.keys(d.h), com: new Map(Object.entries(d.com)) });
  }
  const suivis = new Set([...parDep.values()].flatMap((d) => d.sirens));
  const m = await collecterMarches(
    async (url) => (await obstine(url)).json(),
    suivis,
    console.log,
    async (url) => (await obstine(url)).text(),
    sortie,
  );
  if (m) {
    let n = 0;
    for (const [dep, d] of parDep) n += ecrireMarches(sortie, dep, d.sirens, d.com, m);
    const suites = ecrireSuitesMarches(sortie, m);
    const nationales = ecrireEcheancesNationales(sortie, m);
    const attributions = ecrireAttributionsNationales(sortie, m);
    const avis = ecrireAvisNationaux(sortie, m);
    console.log(
      `${n} acheteurs écrits, ${suites} listes complètes à la demande, ${nationales} échéances dans echeances.json, ` +
        `${attributions} marchés dans attributions.json, ` +
        (avis
          ? `${avis.avis} avis ouverts dans avis.json (${avis.parSiret} par SIRET, ${avis.parNom} par nom, ${avis.ambigus} noms ambigus écartés).`
          : 'avis.json inchangé.'),
    );
  }
}
