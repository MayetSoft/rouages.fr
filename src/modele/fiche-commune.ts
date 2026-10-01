/**
 * Ce que la page d'une commune dit de ses comptes, de son élection, de ses
 * marchés et de sa vie associative.
 *
 * Ces blocs n'existaient que dans le panneau de la carte. La page de la commune
 * renvoyait à la carte pour « les comptes, les marchés publics, les droits de
 * mutation et les courbes » : deux programmes décrivaient la même commune, et
 * ils avaient dérivé — une faute d'accord corrigée sur la page était restée
 * dans le panneau, et une information ajoutée à la page n'avait jamais atteint
 * le panneau.
 *
 * Les fonctions d'assemblage sont celles du panneau, reprises telles quelles.
 * Seule change la lecture des fichiers : depuis le disque, au build, plutôt que
 * par le réseau, dans le navigateur. Elles n'existent plus qu'ici : le panneau
 * ne dit plus que qui exerce chaque compétence, et conduit à la page pour le
 * reste.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anneePlausible } from './annees.ts';

const BASE = join(process.cwd(), 'public', 'territoires');

function lire<T>(fichier: string): T | null {
  const p = join(BASE, fichier);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Un fichier par département, lu une fois pour toutes ses communes.
 *
 * Le nom `get` n'est pas un hasard : les fonctions reprises du panneau
 * interrogeaient des `Map` du même nom, remplies par le réseau. Garder la même
 * forme permet de les recopier sans les réécrire.
 */
export function parDepartement<T>(jeu: string) {
  const cache = new Map<string, T | null>();
  return {
    get(dep: string): T | null {
      if (!cache.has(dep)) cache.set(dep, lire<T>(`dep/${dep}-${jeu}.json`));
      return cache.get(dep) ?? null;
    },
  };
}

/** Un fichier national, lu une fois. */
export function national<T>(fichier: string) {
  let lu = false;
  let valeur: T | null = null;
  return () => {
    if (!lu) {
      valeur = lire<T>(fichier);
      lu = true;
    }
    return valeur;
  };
}

/* ------------------------------------------------------------------ *
 * Ce dont les fonctions ont besoin pour situer une commune.
 * ------------------------------------------------------------------ */

export interface CommuneFiche {
  code: string;
  nom: string;
  dep: string;
  depNom: string;
}

export interface StructureFiche {
  siren: string;
  nom: string;
  nature: string;
  natureLibelle: string;
}

/* ------------------------------------------------------------------ *
 * Les formes, telles que la page les affiche.
 * ------------------------------------------------------------------ */

export interface Repere {
  id: string;
  nom: string;
  explication: string;
  /** Le flux du réseau que ce repère chiffre, quand la correspondance est exacte. */
  flux?: string;
  /** Euros par habitant pour cette commune, ou null si non renseigné. */
  valeur: number | null;
  /** Le montant du dernier exercice, en euros. */
  montant?: number | null;
  /** Médiane des communes de la même strate de population. */
  mediane: number | null;
  /**
   * La valeur de chaque exercice, du plus ancien au plus récent. Un chiffre
   * isolé ne se discute pas ; une série dit ce qui a changé.
   */
  serie: (number | null)[];
  /**
   * Variation entre le premier et le dernier exercice renseignés, en pour
   * cent. `null` quand la série est trop lacunaire pour conclure — ou quand
   * elle part de zéro, où le pourcentage n'aurait pas de sens.
   */
  evolution: number | null;
}

export interface Finances {
  annee: number;
  /** Les exercices de la série, du plus ancien au plus récent. */
  annees: number[];
  /** Le libellé de la strate à laquelle la commune est comparée. */
  strate: string;
  /**
   * Renseigné pour les communes dont le statut rend la comparaison trompeuse —
   * Paris, qui fusionne les fonctions communales et départementales. Les
   * chiffres restent affichés, la médiane est retirée.
   */
  statutParticulier?: string;
  /** Les lignes de tête, avec leur série. */
  reperes: Repere[];
  /** Tous les postes, dans l'ordre de l'arbre : le tableau poste par poste. */
  lignes: LigneCompte[];
}

/**
 * Un poste du tableau : son montant, en euros et par habitant, et la médiane à
 * laquelle il se compare. Le niveau dit sa place dans l'arbre — 0 pour les
 * totaux —, et `dont` qu'il ne détaille qu'une partie de son parent.
 */
export interface LigneCompte {
  id: string;
  nom: string;
  explication: string;
  niveau: number;
  dont: boolean;
  montant: number | null;
  parHabitant: number | null;
  mediane: number | null;
  /** Combien de collectivités entrent dans la médiane, pour les échelons ; absent pour les communes. */
  effectif?: number;
}

/**
 * Un flux perçu par l'intercommunalité plutôt que par la commune.
 *
 * La taxe d'enlèvement des ordures ménagères et le versement mobilité ne sont
 * presque jamais dans les comptes communaux : les chercher là ne trouve rien,
 * et « la commune ne perçoit rien » serait exact et sans intérêt. Le site sait
 * quelle structure sert la commune ; il lui manquait le chiffre en face.
 */
export interface FluxPercu {
  nom: string;
  explication: string;
  /** La structure qui perçoit, nommée : c'est elle qu'on ira voir. */
  structure: string;
  natureLibelle: string;
  /** Euros par habitant, dernier exercice. */
  valeur: number;
  /** Médiane des seuls groupements qui perçoivent effectivement. */
  mediane: number | null;
  /** Combien de groupements perçoivent : l'absence ailleurs se dit en chiffres. */
  percepteurs: number;
  serie: (number | null)[];
  evolution: number | null;
}

/**
 * Ce qu'un acheteur public a commandé.
 *
 * Les montants ne s'additionnent pas, et le site ne les additionne pas : un
 * accord-cadre déclare un plafond, et chacun de ses lots le redéclare en
 * entier.
 */
export interface Marche {
  objet: string;
  /** Montant déclaré pour ce marché. Pour un accord-cadre, c'est un plafond. */
  montant: number | null;
  date: string;
  /** Libellé de la procédure, ou null si le référentiel a changé. */
  procedure: string | null;
  /** Nombre de lots regroupés sous cette ligne. */
  lots: number;
  /** Nombre d'offres reçues, quand l'acheteur l'a déclaré. */
  offres: number | null;
}

/** Un marché dont l'échéance prévisible tombe dans la fenêtre du fichier. */
export interface EcheanceMarche extends Marche {
  /** Mois d'échéance prévisible (AAAA-MM) : notification plus durée initiale. */
  fin: string;
  /** L'acheteur : la commune, ou celui de ses groupements qui a passé le marché. */
  acheteur: string;
}

export interface AcheteurMarches {
  siren: string;
  /** La commune elle-même, ou l'un de ses groupements. */
  nom: string;
  natureLibelle: string | null;
  /** Nombre total de marchés notifiés depuis `depuis`, avant troncature. */
  total: number;
  /** Le SIRET sous lequel l'acheteur notifie le plus de marchés, quand les données en donnent un. */
  siret: string | null;
  /** Les plus récents seulement. */
  liste: Marche[];
  /** Ses marchés à échéance prévisible dans la fenêtre, les plus proches seulement. */
  echeances: EcheanceMarche[];
  /** Combien il en a dans la fenêtre, avant troncature. */
  totalEcheances: number;
}

/**
 * Les droits de mutation chez vous.
 *
 * La part communale ne revient à la commune que si celle-ci dépasse
 * 5 000 habitants. En dessous, la même taxe alimente un fonds de péréquation
 * départemental.
 */
export interface Dmto {
  annees: number[];
  /** Recettes du département, en euros, par exercice. */
  departement: (number | null)[];
  /** Recettes de l'ensemble des communes du département, en euros. */
  communes: (number | null)[];
  /** Vrai si la part communale revient directement à la commune (art. 1584). */
  partDirecte: boolean;
  maj: string;
}

/**
 * Les comptes d'un échelon supérieur, prêts à afficher. La médiane porte sur
 * toutes les collectivités du même échelon que l'OFGL publie.
 */
export interface ComptesEchelon {
  nom: string;
  annees: number[];
  effectif: number;
  /**
   * La strate à laquelle la collectivité est comparée, au pluriel — « communautés
   * d'agglomération » —, ou `null` quand la médiane porte sur l'échelon entier.
   * Une intercommunalité seule de son espèce n'a pas de médiane du tout.
   */
  strate?: string | null;
  reperes: (Repere & { effectif: number })[];
  lignes: LigneCompte[];
}

/**
 * Ce qu'une collectivité verse aux associations. Aucun total : l'obligation de
 * publier ne porte que sur les conventions de plus de 23 000 €.
 */
export interface Subvention {
  /** Le bénéficiaire — une association, jamais une personne. */
  qui: string;
  montant: number | null;
  annee: string;
  objet: string;
}

export interface CollectiviteSubventionne {
  nom: string;
  natureLibelle: string | null;
  total: number;
  exercices: [string, string];
  liste: Subvention[];
}

/**
 * Ce qu'une collectivité a délibéré. Une collectivité absente d'ici n'est pas
 * une collectivité qui ne délibère pas : c'est une collectivité qui ne verse
 * pas ses actes en données ouvertes.
 */
export interface Deliberation {
  date: string;
  famille: string | null;
  objet: string;
  /** L'acte chez la collectivité qui l'a publié : le site lie, il ne copie pas. */
  url: string;
}

export interface CollectiviteDelibere {
  nom: string;
  natureLibelle: string | null;
  total: number;
  familles: { nom: string; nombre: number }[];
  liste: Deliberation[];
}

/**
 * Le dernier scrutin municipal, et ses listes avec la nuance que le ministère
 * leur attribue (depuis le 1er octobre 2026), et la tête de chacune d'après le
 * fichier des candidatures.
 */
export interface Scrutin {
  nom: string;
  tours: {
    numero: number;
    inscrits: number;
    votants: number;
    /** Blancs et nuls confondus. */
    refus: number;
    /** Séparés, quand le fichier les distingue. */
    blancs: number | null;
    nuls: number | null;
    listes: number;
    /**
     * Les listes, dans l'ordre des voix. `nuance` est le libellé du référentiel
     * du ministère, `code` son abréviation ; tous deux nuls là où le préfet n'en
     * attribue pas, sous 3 500 habitants hors chef-lieu d'arrondissement.
     */
    parListe: { nom: string; tete: string | null; code: string | null; nuance: string | null; voix: number; part: number; sieges: number }[];
    medianeParticipation: number;
    medianeRefus: number;
  }[];
  /**
   * La liste arrivée en tête au tour qui a attribué les sièges : ses voix, en
   * part des inscrits, et la médiane nationale de cette part.
   */
  tete: { voix: number; inscrits: number; part: number; mediane: number; seule: boolean } | null;
  sieges: number;
  siegesCc: number;
  conseilCc: string | null;
  /** Vrai quand la commune est représentée sans que ses sièges soient élus. */
  ccDesignes: boolean;
  partListeUnique: number;
  maj: string;
}

/** Ce qui se crée en associations dans la commune. */
export interface Associations {
  total: number;
  annees: number[];
  parAnnee: number[];
  domaines: { nom: string; nombre: number }[];
  recentes: { mois: string; titre: string; domaine: string | null }[];
  taux: number;
  medianeTaux: number;
  maj: string;
}

/**
 * Les naissances et les décès, domiciliés : au domicile de la mère, à celui du
 * défunt. Aucun nom — le fichier nominatif des décès n'est pas lu.
 */
export interface EtatCivil {
  annees: number[];
  naissances: (number | null)[];
  deces: (number | null)[];
  maj: string;
}

/**
 * La pyramide des âges du recensement : femmes et hommes par tranche de cinq
 * ans, et celle du département, à laquelle la page la compare. Des
 * estimations pondérées, au dixième.
 */
export interface Ages {
  millesime: number;
  /** Le premier âge de chaque tranche ; la dernière reçoit aussi les centenaires. */
  tranches: number[];
  femmes: number[];
  hommes: number[];
  departement: { femmes: number[]; hommes: number[] } | null;
  maj: string;
}

/**
 * Le diplôme le plus élevé des habitants de 15 ans ou plus sortis de l'école,
 * d'après le recensement : les effectifs par niveau, du moins au plus
 * diplômé, pour la commune, son département et la France, à deux millésimes.
 * Des estimations pondérées, au dixième.
 */
export interface Diplomes {
  niveaux: string[];
  /** Le plus récent d'abord. */
  millesimes: number[];
  /** Par millésime, les effectifs par niveau ; null quand le millésime manque. */
  commune: (number[] | null)[];
  departement: (number[] | null)[] | null;
  france: (number[] | null)[] | null;
  maj: string;
}

/**
 * Le niveau de vie des habitants d'après Filosofi : la médiane et le taux de
 * pauvreté, null quand le secret statistique les couvre — la page le dit.
 */
export interface NiveauDeVie {
  millesime: number;
  mediane: number | null;
  pauvrete: number | null;
  departement: { mediane: number | null; pauvrete: number | null } | null;
  metropole: { mediane: number | null; pauvrete: number | null } | null;
  maj: string;
}

/**
 * Le centre d'action sociale d'une commune, ou celui de son intercommunalité :
 * son budget principal, ses budgets annexes, les établissements qu'il gère.
 */
export interface CentreSocial {
  nom: string;
  type: 'CCAS' | 'CIAS';
  /** Par agrégat, dans l'ordre de `agregats`, la série du budget principal. */
  principal: (number | null)[][];
  annexes: [string, number][];
  etablissements: [string, string, number | null][];
  dernier: number;
}

export interface CentresSociaux {
  annees: number[];
  agregats: string[];
  centres: CentreSocial[];
  maj: string;
}

/**
 * Les annonces légales des entreprises de la commune, d'après le BODACC.
 *
 * Des annonces, pas des entreprises : une société qui déménage publie une
 * modification, puis une radiation d'établissement ; une procédure collective
 * en publie une par jugement. Les décomptes comptent tout, entrepreneurs
 * individuels compris ; sont nommés les sociétés et les entrepreneurs individuels
 * que le répertoire SIRENE dit diffusibles, jamais une procédure collective.
 */
export interface Entreprises {
  annees: number[];
  familles: string[];
  /** Par famille, dans l'ordre de `familles`, le nombre d'annonces par année ; null si aucune. */
  comptes: number[][] | null;
  /**
   * Les dernières annonces nommées : date, rang de la famille, nom, identifiant
   * de l'annonce au BODACC, activité déclarée, 1 pour un entrepreneur individuel.
   * Un fichier antérieur au 1er octobre 2026 n'a que les quatre premiers.
   */
  recentes: [string, number, string, string, string?, (0 | 1)?][];
  /** La part des annonces nationales qu'aucune commune ne reçoit. */
  sansCommune: number;
  maj: string;
}

/**
 * Les établissements actifs de la commune au répertoire SIRENE, par secteur,
 * et parmi eux les employeurs.
 */
export interface Presentes {
  total: number;
  employeurs: number;
  /** Établissements employeurs pour 1 000 habitants, et la médiane nationale. */
  parMille: number | null;
  mediane: number;
  secteurs: { nom: string; total: number; employeurs: number }[];
  /** La date de la copie de SIRENE lue. */
  source: string | null;
  maj: string;
}

/** La population dans le temps. */
export interface Population {
  annees: number[];
  serie: (number | null)[];
  actuelle: number;
  anneeActuelle: number;
  sommet: [number, number];
  ecart: number;
  maj: string;
}

/**
 * L'obligation de logements sociaux, pour les communes qui y sont soumises.
 * Les autres ne sont pas en défaut : le site ne dit rien pour elles.
 */
export interface Sru {
  lls: number | null;
  llsTexte: string | null;
  taux: number | null;
  tauxTexte: string | null;
  cible: number | null;
  deficitaire: boolean | null;
  carencee: boolean;
  exemptee: boolean;
  prelevement: number | null;
}

export interface ServiceEau {
  prix: number | null;
  nom: string;
  gestion: string;
  operateur: string;
  annee: number;
  median: number | null;
  competence: string;
}

/* ------------------------------------------------------------------ *
 * Les fichiers, tels que l'ingestion les écrit.
 * ------------------------------------------------------------------ */

interface MetaFinances {
  annee: number;
  annees?: number[];
  reperes: { id: string; nom: string; explication: string; flux?: string; parent?: string; dont?: boolean }[];
  /** La position, dans `reperes`, de ceux qui ont leur ligne en tête. */
  principaux: number[];
  strates: string[];
  medianes: (number | null)[][];
  statutParticulier: Record<string, string>;
}

interface Meta {
  regions?: Record<string, string>;
  codesRegion?: Record<string, string>;
  finances?: MetaFinances;
  eau?: { annee: number; indicateur: string; competence: string; prixMedian: number | null };
}

/** Par commune : les séries des repères de tête, le montant de chaque repère au dernier exercice, la population. */
type LigneFinances = [(number | null)[][], (number | null)[], number | null];
type FinancesDep = { annee: number; annees: number[]; c: Record<string, LigneFinances> };
type EauDep = { annee: number; c: Record<string, [number | null, string, string, string]> };
type SruDep = { maj: string; c: Record<string, Sru> };
type AssoDep = {
  maj: string;
  annees: number[];
  domaines: string[];
  mediane: number;
  effectif: number;
  c: Record<string, { n: number; a: number[]; d: [number, number][]; r: [string, string, number][] }>;
};
type PopDep = { maj: string; annees: number[]; c: Record<string, [number[], number, number]> };
type CcasDep = {
  maj: string;
  annees: number[];
  agregats: string[];
  s: Record<string, [string, 'CCAS' | 'CIAS', (number | null)[][], [string, number][], [string, string, number | null][], number]>;
  c: Record<string, string[]>;
};
type EntreprisesDep = {
  maj: string;
  annees: number[];
  familles: string[];
  sansCommune: number;
  c: Record<string, [number[][] | null, [string, number, string, string, string?, (0 | 1)?][]]>;
};
type SireneDep = {
  maj: string;
  source: string | null;
  sections: string[];
  mediane: number;
  c: Record<string, [number, number, number][]>;
};
type AgesDep = {
  maj: string;
  millesime: number;
  tranches: number[];
  dep: [number[], number[]] | null;
  c: Record<string, [number[], number[]]>;
};
type DiplomesDep = {
  maj: string;
  millesimes: number[];
  niveaux: string[];
  france: (number[] | null)[] | null;
  dep: (number[] | null)[] | null;
  c: Record<string, (number[] | null)[]>;
};
type RevenusDep = {
  maj: string;
  millesime: number;
  metropole: [number | null, number | null] | null;
  dep: [number | null, number | null] | null;
  c: Record<string, [number | null, number | null]>;
};
type EtatCivilDep = { maj: string; annees: number[]; c: Record<string, [(number | null)[], (number | null)[]]> };
type TourDep = {
  inscrits: number;
  votants: number;
  exprimes: number;
  refus: number;
  blancs?: number;
  nuls?: number;
  listes: number;
  tete?: number;
  /** Libellé, code de nuance, voix, sièges au conseil municipal, tête de liste. */
  l?: [string, string, number, number, string?][];
};
type ElectionsDep = {
  scrutin: string;
  maj: string;
  nuances?: Record<string, string>;
  medianes: { participation: number; refus: number }[];
  listeUnique: number;
  medianeTete?: number;
  c: Record<
    string,
    {
      t1: TourDep;
      t2?: TourDep;
      decisif?: 1 | 2;
      cm: number;
      cc: number;
    }
  >;
};
type DelibDep = {
  maj: string;
  depuis: string;
  familles: string[];
  com: Record<string, string>;
  echelons?: string[];
  h: Record<string, { n: number; f: number[]; d: { date: string; famille: number; objet: string; url: string }[] }>;
};
type SubvDep = {
  maj: string;
  seuil: number;
  com: Record<string, string>;
  echelons?: string[];
  h: Record<
    string,
    {
      n: number;
      e: [string, string];
      s: { qui: string; montant: number | null; annee: string; objet: string; rna: string }[];
    }
  >;
};
type DmtoNational = {
  annees: number[];
  maj: string;
  d: Record<string, { dep: (number | null)[]; com: (number | null)[] }>;
};
type ComptesFichier = {
  annees: number[];
  reperes: { id: string; nom: string; parent?: string; dont?: boolean }[];
  principaux: number[];
  medianes: (number | null)[];
  effectifs: number[];
  effectif: number;
  h: Record<string, LigneFinances>;
};
type EchelonsFichier = {
  maj: string;
  /** Les intercommunalités à fiscalité propre, par SIREN, comparées à leur strate. */
  intercommunalites?: (ComptesFichier & {
    strates?: {
      de: Record<string, string>;
      medianes: Record<string, (number | null)[]>;
      effectifs: Record<string, number[]>;
    };
  }) | null;
  departements: ComptesFichier | null;
  regions: ComptesFichier | null;
};
type MarcheBrut = {
  objet: string;
  montant: number | null;
  date: string;
  procedure: number;
  lots: number;
  offres?: number;
};
type MarchesDep = {
  depuis: string;
  maj: string;
  /** Absente des fichiers écrits avant l'échéancier. */
  fenetre?: [string, string];
  procedures: string[];
  com: Record<string, string>;
  h: Record<string, { n: number; s?: string; m: MarcheBrut[]; ne?: number; e?: (MarcheBrut & { fin: string })[] }>;
};
interface FichierFlux {
  annees: number[];
  reperes: {
    id: string;
    nom: string;
    explication: string;
    flux?: string;
    mediane: number | null;
    percepteurs: number;
  }[];
  h: Record<string, (number | null)[][]>;
}

const metaFichier = national<Meta>('meta.json');
const fluxFichier = national<FichierFlux>('flux.json');
const dmtoFichier = national<DmtoNational>('dmto.json');
const echelonsFichier = national<EchelonsFichier>('echelons.json');

const financesDep = parDepartement<FinancesDep>('finances');
const eauDep = parDepartement<EauDep>('eau');
const sruDep = parDepartement<SruDep>('sru');
const assoDep = parDepartement<AssoDep>('associations');
const popDep = parDepartement<PopDep>('population');
const etatCivilDep = parDepartement<EtatCivilDep>('etat-civil');
const agesDep = parDepartement<AgesDep>('ages');
const diplomesDep = parDepartement<DiplomesDep>('diplomes');
const revenusDep = parDepartement<RevenusDep>('revenus');
const sireneDep = parDepartement<SireneDep>('sirene');
const ccasDep = parDepartement<CcasDep>('ccas');
const entreprisesDep = parDepartement<EntreprisesDep>('entreprises');
const electionsDep = parDepartement<ElectionsDep>('elections');
const delibDep = parDepartement<DelibDep>('deliberations');
const subvDep = parDepartement<SubvDep>('subventions');
const marchesDep = parDepartement<MarchesDep>('marches');

/* ------------------------------------------------------------------ *
 * Les assemblages — repris du panneau.
 * ------------------------------------------------------------------ */

/** Les strates de population, dans le même ordre qu'à l'ingestion. */
const BORNES = [500, 2000, 10000, 50000, Infinity];

/**
 * L'écart entre le premier et le dernier exercice renseignés. On refuse de
 * conclure sur moins de trois points, et une série qui part de zéro n'a pas de
 * pourcentage.
 */
export function variation(serie: (number | null)[]): number | null {
  const points = serie.filter((v): v is number => v !== null);
  if (points.length < 3) return null;
  const debut = points[0];
  const fin = points[points.length - 1];
  if (debut === 0) return null;
  return Math.round(((fin - debut) / Math.abs(debut)) * 100);
}

/**
 * La dernière fois que le nombre de classes a bougé.
 *
 * C'est le fait, et le site s'en tient là : « une classe de moins à la rentrée
 * 2025 ». Pourquoi, personne ne le publie — ni les seuils d'ouverture appliqués
 * cette année-là, ni l'arbitrage du rectorat. Prétendre l'expliquer serait
 * inventer ; le taire serait cacher ce qui est vérifiable.
 */
export function dernierChangement(
  classes: (number | null)[],
  rentrees: number[],
): { rentree: number; ecart: number } | null {
  let precedent: number | null = null;
  let trouve: { rentree: number; ecart: number } | null = null;
  for (const [i, v] of classes.entries()) {
    if (v === null) continue;
    // Une rentrée manquante au milieu ne fabrique pas un saut : on compare au
    // dernier chiffre connu, pas à la case précédente.
    if (precedent !== null && v !== precedent) {
      trouve = { rentree: rentrees[i], ecart: v - precedent };
    }
    precedent = v;
  }
  return trouve;
}

/** La première année où la série a une valeur. */
export function debutSerie(serie: (number | null)[], annees: number[]): number | null {
  const i = serie.findIndex((v) => v !== null);
  return i >= 0 ? (annees[i] ?? null) : null;
}

/**
 * L'euro par habitant tel que le site l'écrit : au dixième sous 10 €, à l'euro
 * au-delà — « 0 € » se lirait « rien » là où la valeur est faible mais réelle.
 * La même règle que l'ingestion, pour que tableau et lignes de tête disent le
 * même chiffre.
 */
function parHabitant(brut: number | null): number | null {
  return brut === null ? null : Math.abs(brut) < 10 ? Math.round(brut * 10) / 10 : Math.round(brut);
}

/** La profondeur de chaque repère dans l'arbre, d'après son parent. */
function niveaux(reperes: { id: string; parent?: string }[]): number[] {
  const rang = new Map(reperes.map((r, i) => [r.id, i]));
  const n: number[] = [];
  for (const [i, r] of reperes.entries()) {
    const p = r.parent ? rang.get(r.parent) : undefined;
    n[i] = p === undefined || p >= i ? 0 : n[p] + 1;
  }
  return n;
}

/**
 * Les lignes du tableau poste par poste. L'euro par habitant d'un repère de
 * tête est le dernier point de sa série, tel que l'OFGL le publie ; celui des
 * autres, le montant rapporté à la population que l'OFGL retient.
 */
function lignesDe(
  reperes: { id: string; nom: string; explication?: string; parent?: string; dont?: boolean }[],
  principaux: number[],
  [series, montants, population]: LigneFinances,
  mediane: (i: number) => number | null,
): LigneCompte[] {
  const n = niveaux(reperes);
  const tete = new Map(principaux.map((i, k) => [i, k]));
  return reperes.map((r, i) => {
    const k = tete.get(i);
    const montant = montants[i] ?? null;
    const serie = k !== undefined ? series[k] : undefined;
    const parHab =
      serie && serie.length > 0
        ? (serie[serie.length - 1] ?? null)
        : montant !== null && population
          ? parHabitant(montant / population)
          : null;
    return {
      id: r.id,
      nom: r.nom,
      explication: r.explication ?? '',
      niveau: n[i],
      dont: !!r.dont,
      montant,
      parHabitant: parHab,
      mediane: mediane(i),
    };
  });
}

function assemblerFinances(commune: CommuneFiche, population: number): Finances | null {
  const m = metaFichier()?.finances;
  const dep = financesDep.get(commune.dep);
  if (!m || !dep) return null;
  const f = dep.c?.[commune.code];
  if (!f) return null;
  const strate = BORNES.findIndex((b) => population < b);
  const particulier = m.statutParticulier?.[commune.code];
  const annees = dep.annees ?? m.annees ?? [dep.annee];
  const mediane = (i: number) => (particulier ? null : (m.medianes[strate]?.[i] ?? null));
  const lignes = lignesDe(m.reperes, m.principaux ?? [], f, mediane);
  return {
    annee: dep.annee,
    annees,
    strate: m.strates[strate] ?? '',
    statutParticulier: particulier,
    reperes: (m.principaux ?? []).map((i, k) => {
      const r = m.reperes[i];
      const serie = f[0][k] ?? [];
      return {
        id: r.id,
        nom: r.nom,
        explication: r.explication,
        flux: r.flux,
        valeur: lignes[i].parHabitant,
        montant: lignes[i].montant,
        mediane: mediane(i),
        serie,
        evolution: variation(serie),
      };
    }),
    lignes,
  };
}

function assemblerEau(commune: CommuneFiche): ServiceEau | null {
  const m = metaFichier()?.eau;
  const dep = eauDep.get(commune.dep);
  const v = m && dep ? dep.c[commune.code] : undefined;
  if (!m || !dep || !v) return null;
  const [prix, nom, gestion, operateur] = v;
  return { prix, nom, gestion, operateur, annee: dep.annee, median: m.prixMedian, competence: m.competence };
}

function assemblerPopulation(commune: CommuneFiche): Population | null {
  const d = popDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const [brut, anneeSommet, valeurSommet] = f;
  const serie = brut.map((x) => (x > 0 ? x : null));
  let dernier = -1;
  for (const [i, v] of serie.entries()) if (v !== null) dernier = i;
  if (dernier === -1 || valeurSommet === 0) return null;
  const actuelle = serie[dernier]!;
  return {
    annees: d.annees,
    serie,
    actuelle,
    anneeActuelle: d.annees[dernier],
    sommet: [anneeSommet, valeurSommet],
    ecart: Math.round(((actuelle - valeurSommet) / valeurSommet) * 100),
    maj: d.maj,
  };
}

function assemblerPresentes(commune: CommuneFiche, population: number): Presentes | null {
  const d = sireneDep.get(commune.dep);
  const c = d?.c[commune.code];
  if (!d || !c || c.length === 0) return null;
  const total = c.reduce((s, x) => s + x[1], 0);
  const employeurs = c.reduce((s, x) => s + x[2], 0);
  return {
    total,
    employeurs,
    parMille: population > 0 ? (employeurs / population) * 1000 : null,
    mediane: d.mediane,
    secteurs: c
      .filter(([i]) => i < d.sections.length - 1)
      .map(([i, n, e]) => ({ nom: d.sections[i], total: n, employeurs: e }))
      .sort((a, b) => b.employeurs - a.employeurs || b.total - a.total),
    source: d.source,
    maj: d.maj,
  };
}

function assemblerAges(commune: CommuneFiche): Ages | null {
  const d = agesDep.get(commune.dep);
  const p = d?.c[commune.code];
  if (!d || !p) return null;
  return {
    millesime: d.millesime,
    tranches: d.tranches,
    femmes: p[0],
    hommes: p[1],
    departement: d.dep ? { femmes: d.dep[0], hommes: d.dep[1] } : null,
    maj: d.maj,
  };
}

function assemblerDiplomes(commune: CommuneFiche): Diplomes | null {
  const d = diplomesDep.get(commune.dep);
  const c = d?.c[commune.code];
  // Sans personne à compter, pas de parts : les villages détruits de la Meuse,
  // sans habitants depuis 1916, figurent au recensement avec des effectifs nuls.
  if (!d || !c || !c[0] || c[0].reduce((s, x) => s + x, 0) <= 0) return null;
  return { niveaux: d.niveaux, millesimes: d.millesimes, commune: c, departement: d.dep, france: d.france, maj: d.maj };
}

function assemblerNiveauDeVie(commune: CommuneFiche): NiveauDeVie | null {
  const d = revenusDep.get(commune.dep);
  const c = d?.c[commune.code];
  if (!d || !c) return null;
  const paire = (x: [number | null, number | null] | null) => (x ? { mediane: x[0], pauvrete: x[1] } : null);
  return {
    millesime: d.millesime,
    mediane: c[0],
    pauvrete: c[1],
    departement: paire(d.dep),
    metropole: paire(d.metropole),
    maj: d.maj,
  };
}

function assemblerEtatCivil(commune: CommuneFiche): EtatCivil | null {
  const d = etatCivilDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const [naissances, deces] = f;
  if (![...naissances, ...deces].some((v) => v !== null)) return null;
  return { annees: d.annees, naissances, deces, maj: d.maj };
}

function assemblerCentres(commune: CommuneFiche): CentresSociaux | null {
  const d = ccasDep.get(commune.dep);
  const sirens = d?.c[commune.code];
  if (!d || !sirens) return null;
  const centres = sirens
    .map((s) => d.s[s])
    .filter(Boolean)
    .map(([nom, type, principal, annexes, etablissements, dernier]) => ({ nom, type, principal, annexes, etablissements, dernier }))
    // Le CCAS de la commune d'abord : c'est d'elle qu'on part.
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'CCAS' ? -1 : 1));
  return centres.length > 0 ? { annees: d.annees, agregats: d.agregats, centres, maj: d.maj } : null;
}

function assemblerEntreprises(commune: CommuneFiche): Entreprises | null {
  const d = entreprisesDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const [comptes, recentes] = f;
  if (!comptes && recentes.length === 0) return null;
  return { annees: d.annees, familles: d.familles, comptes, recentes, sansCommune: d.sansCommune, maj: d.maj };
}

/** « La région — Centre-Val de Loire » : `meta.json` la nomme par département. */
function nomRegion(commune: CommuneFiche): string {
  const nom = metaFichier()?.regions?.[commune.dep];
  return nom ? `La région — ${nom}` : 'La région';
}

function assemblerMarches(commune: CommuneFiche, structures: StructureFiche[]): AcheteurMarches[] {
  const d = marchesDep.get(commune.dep);
  if (!d) return [];
  const out: AcheteurMarches[] = [];
  const lireAcheteur = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.m.length === 0) return;
    const lire = (m: MarcheBrut): Marche => ({
      objet: m.objet,
      montant: m.montant,
      date: m.date,
      procedure: d.procedures[m.procedure] ?? null,
      lots: m.lots,
      offres: m.offres ?? null,
    });
    out.push({
      siren,
      nom,
      natureLibelle,
      total: e.n,
      siret: e.s ?? null,
      liste: e.m.map(lire),
      echeances: (e.e ?? []).map((m) => ({ ...lire(m), fin: m.fin, acheteur: nom })),
      totalEcheances: e.ne ?? 0,
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lireAcheteur(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lireAcheteur(s.siren, s.nom, s.natureLibelle);
  return out;
}

function assemblerSubventions(commune: CommuneFiche, structures: StructureFiche[]): CollectiviteSubventionne[] {
  const d = subvDep.get(commune.dep);
  if (!d) return [];
  const out: CollectiviteSubventionne[] = [];
  const lireVerseur = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.s.length === 0) return;
    // Les fichiers déjà écrits peuvent porter une année illisible — « 1735 »
    // pour une convention de 2025. L'ingestion la refuse désormais ; ici, on
    // tait la borne plutôt que d'afficher une plage fausse.
    const bornes: [string, string] =
      anneePlausible(e.e[0]) && anneePlausible(e.e[1]) ? e.e : ['', ''];
    out.push({
      nom,
      natureLibelle,
      total: e.n,
      exercices: bornes,
      liste: e.s.map((x) => ({
        qui: x.qui,
        montant: x.montant,
        annee: anneePlausible(x.annee) ? x.annee : '',
        objet: x.objet,
      })),
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lireVerseur(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lireVerseur(s.siren, s.nom, s.natureLibelle);
  // Le département et sa région viennent en dernier : ils versent le plus, et
  // ce n'est pas d'eux qu'on part quand on cherche sa commune.
  for (const [i, siren] of (d.echelons ?? []).entries()) {
    lireVerseur(siren, i === 0 ? `Le département — ${commune.depNom}` : nomRegion(commune), null);
  }
  return out;
}

function assemblerDeliberations(commune: CommuneFiche, structures: StructureFiche[]): CollectiviteDelibere[] {
  const d = delibDep.get(commune.dep);
  if (!d) return [];
  const out: CollectiviteDelibere[] = [];
  const lireAuteur = (siren: string, nom: string, natureLibelle: string | null) => {
    const e = d.h[siren];
    if (!e || e.d.length === 0) return;
    out.push({
      nom,
      natureLibelle,
      total: e.n,
      familles: (e.f ?? [])
        .map((nombre, i) => ({ nom: d.familles[i] ?? '', nombre }))
        .filter((f) => f.nombre > 0 && f.nom)
        .sort((a, b) => b.nombre - a.nombre)
        .slice(0, 3),
      liste: e.d.map((x) => ({ date: x.date, famille: d.familles[x.famille] ?? null, objet: x.objet, url: x.url })),
    });
  };
  const sirenCommune = d.com[commune.code];
  if (sirenCommune) lireAuteur(sirenCommune, commune.nom, 'la commune');
  for (const s of structures) lireAuteur(s.siren, s.nom, s.natureLibelle);
  for (const [i, siren] of (d.echelons ?? []).entries()) {
    lireAuteur(siren, i === 0 ? `Le département — ${commune.depNom}` : nomRegion(commune), null);
  }
  return out;
}

/**
 * Les natures dont le conseil est élu au suffrage fléché. Un syndicat n'en est
 * pas : ses délégués sont désignés par les conseils municipaux.
 */
const FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'SAN', 'EPT']);

function assemblerScrutin(commune: CommuneFiche, structures: StructureFiche[]): Scrutin | null {
  const d = electionsDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  const conseil = structures.find((st) => FISCALITE_PROPRE.has(st.nature));
  const tour = (numero: number, t: (typeof f)['t1'] | undefined) => {
    if (!t) return null;
    const m = d.medianes[numero - 1];
    return {
      numero,
      inscrits: t.inscrits,
      votants: t.votants,
      refus: t.refus,
      blancs: t.blancs ?? null,
      nuls: t.nuls ?? null,
      listes: t.listes,
      parListe: (t.l ?? []).map(([nom, code, voix, sieges, tete]) => ({
        nom,
        tete: tete || null,
        code: code || null,
        nuance: code ? (d.nuances?.[code] ?? null) : null,
        voix,
        part: t.exprimes > 0 ? (voix / t.exprimes) * 100 : 0,
        sieges,
      })),
      medianeParticipation: m?.participation ?? 0,
      medianeRefus: m?.refus ?? 0,
    };
  };
  const tours = [tour(1, f.t1), tour(2, f.t2)].filter((t): t is NonNullable<typeof t> => !!t);
  if (tours.length === 0) return null;
  const decisif = f.decisif === 2 && f.t2 ? f.t2 : f.t1;
  const tete =
    decisif.tete && decisif.inscrits > 0 && d.medianeTete
      ? {
          voix: decisif.tete,
          inscrits: decisif.inscrits,
          part: (decisif.tete / decisif.inscrits) * 100,
          mediane: d.medianeTete,
          seule: decisif.listes === 1,
        }
      : null;
  return {
    nom: d.scrutin,
    tours,
    tete,
    sieges: f.cm,
    siegesCc: f.cc,
    conseilCc: conseil?.nom ?? null,
    ccDesignes: f.cc === 0 && !!conseil,
    partListeUnique: d.listeUnique,
    maj: d.maj,
  };
}

function assemblerAssociations(commune: CommuneFiche, population: number): Associations | null {
  const d = assoDep.get(commune.dep);
  const f = d?.c[commune.code];
  if (!d || !f) return null;
  return {
    total: f.n,
    annees: d.annees,
    parAnnee: f.a,
    domaines: f.d.map(([i, n]) => ({ nom: d.domaines[i] ?? '', nombre: n })).filter((x) => x.nom),
    recentes: f.r.map(([mois, titre, dom]) => ({
      mois,
      titre,
      domaine: dom >= 0 ? (d.domaines[dom] ?? null) : null,
    })),
    taux: population > 0 ? (f.n / population) * 1000 : 0,
    medianeTaux: d.mediane,
    maj: d.maj,
  };
}

/** Le seuil de 5 000 habitants décide du destinataire de la part communale. */
const SEUIL_PART_COMMUNALE = 5000;

/* ------------------------------------------------------------------ *
 * Le département et la région : une page chacun, un lien depuis la commune.
 * ------------------------------------------------------------------ */

export type Echelon = 'intercommunalite' | 'departement' | 'region';

/** Les strates des intercommunalités, telles que `scripts/echelons-emettre.ts` les forme. */
export const STRATES_INTERCOS: Record<string, string> = {
  'CC-FPU': 'communautés de communes à fiscalité professionnelle unique',
  'CC-FA': 'communautés de communes à fiscalité additionnelle',
  CA: 'communautés d’agglomération',
  'CU-M': 'communautés urbaines et métropoles',
  EPT: 'établissements publics territoriaux du Grand Paris',
};

/** Une collectivité au-dessus de la commune, telle que l'OFGL en publie les comptes. */
export interface Collectivite {
  echelon: Echelon;
  /** Le code de l'OFGL : celui du département, ou « 67A », « 691 » pour les cas qui suivent. */
  code: string;
  nom: string;
}

/**
 * Deux collectivités à statut particulier que l'OFGL range parmi les
 * départements : la Collectivité européenne d'Alsace, qui exerce depuis 2021
 * les compétences des deux départements alsaciens, et la Métropole de Lyon,
 * qui exerce celles du département sur son territoire — le Rhône garde le
 * reste.
 */
const NOMS_PARTICULIERS: Record<string, string> = {
  '67A': "Collectivité européenne d'Alsace",
  '691': 'Métropole de Lyon',
};

/**
 * Collectivités uniques : elles exercent les compétences du département et de
 * la région, et l'OFGL les range parmi les régions. Leur page le dit.
 */
export const COLLECTIVITES_UNIQUES = new Set(['02', '03', '94']);

/** Le nom de chaque département, d'après l'index des communes. */
const nomsDepartements = national<{ deps: Record<string, string> }>('index.json');

function nomDe(echelon: Echelon, code: string): string | null {
  if (echelon === 'departement') return NOMS_PARTICULIERS[code] ?? nomsDepartements()?.deps?.[code] ?? null;
  const meta = metaFichier();
  const dep = Object.entries(meta?.codesRegion ?? {}).find(([, r]) => r === code)?.[0];
  return dep ? (meta?.regions?.[dep] ?? null) : null;
}

/**
 * Les collectivités dont relèvent les départements retenus — le filtre
 * `ROUAGES_DEPS` des builds partiels —, ou toutes sans filtre.
 */
export function collectivitesPour(filtre?: string[]): Collectivite[] {
  const toutes = collectivites();
  if (!filtre || filtre.length === 0) return toutes;
  const regions = new Set(filtre.map((d) => metaFichier()?.codesRegion?.[d]).filter(Boolean));
  const departements = new Set(
    filtre.flatMap((d) => (d === '67' || d === '68' ? ['67A'] : d === '69' ? ['69', '691'] : [d])),
  );
  return toutes.filter((c) => (c.echelon === 'departement' ? departements.has(c.code) : regions.has(c.code)));
}

/** Toutes les collectivités dont l'OFGL publie les comptes, pour engendrer leurs pages. */
export function collectivites(): Collectivite[] {
  const e = echelonsFichier();
  if (!e) return [];
  const out: Collectivite[] = [];
  for (const [echelon, c] of [['departement', e.departements], ['region', e.regions]] as const) {
    for (const code of Object.keys(c?.h ?? {})) {
      const nom = nomDe(echelon, code);
      if (nom) out.push({ echelon, code, nom });
    }
  }
  return out;
}

/**
 * Le département et la région d'une commune, tels que l'OFGL les publie. Le
 * Bas-Rhin et le Haut-Rhin relèvent de la Collectivité européenne d'Alsace ;
 * une commune de la Métropole de Lyon relève d'elle, et non du Rhône ; en
 * Corse, en Martinique et en Guyane, la collectivité unique est rangée parmi
 * les régions.
 */
export function collectivitesDeCommune(commune: CommuneFiche, structures: StructureFiche[]): Collectivite[] {
  const e = echelonsFichier();
  if (!e) return [];
  const out: Collectivite[] = [];
  // L'intercommunalité d'abord : c'est l'échelon le plus proche. Une commune du
  // Grand Paris en a deux, son établissement public territorial et la
  // Métropole.
  for (const s of structures) {
    if (e.intercommunalites?.h[s.siren]) out.push({ echelon: 'intercommunalite', code: s.siren, nom: s.nom });
  }
  const dep =
    commune.dep === '67' || commune.dep === '68'
      ? '67A'
      : commune.dep === '69' && structures.some((s) => s.nature === 'MET69')
        ? '691'
        : commune.dep;
  if (e.departements?.h[dep]) {
    const nom = nomDe('departement', dep);
    if (nom) out.push({ echelon: 'departement', code: dep, nom });
  }
  const reg = metaFichier()?.codesRegion?.[commune.dep];
  if (reg && e.regions?.h[reg]) {
    const nom = nomDe('region', reg);
    if (nom) out.push({ echelon: 'region', code: reg, nom });
  }
  return out;
}

/** Les comptes d'une collectivité, prêts à afficher sur sa page. */
export function comptesCollectivite(c: Collectivite): ComptesEchelon | null {
  const e = echelonsFichier();
  const brut =
    c.echelon === 'intercommunalite' ? e?.intercommunalites : c.echelon === 'departement' ? e?.departements : e?.regions;
  const f = brut?.h[c.code];
  if (!brut || !f) return null;
  // Une intercommunalité se compare à celles de sa strate ; sans strate — la
  // Métropole de Lyon, celle du Grand Paris —, à aucune.
  const strate = c.echelon === 'intercommunalite' ? (e?.intercommunalites?.strates?.de[c.code] ?? null) : undefined;
  const fichier =
    strate === undefined
      ? brut
      : strate === null
        ? { ...brut, medianes: brut.medianes.map(() => null), effectifs: brut.effectifs.map(() => 0), effectif: 0 }
        : (() => {
            const effectifs = e!.intercommunalites!.strates!.effectifs[strate] ?? [];
            return {
              ...brut,
              medianes: e!.intercommunalites!.strates!.medianes[strate] ?? [],
              effectifs,
              effectif: Math.max(0, ...effectifs),
            };
          })();
  // Les explications de `reperes.yaml` parlent de la commune : elles seraient
  // fausses ici, et la page dit elle-même ce qu'elle montre.
  const lignes = lignesDe(fichier.reperes, fichier.principaux, f, (i) => fichier.medianes[i] ?? null).map((l, i) => ({
    ...l,
    explication: '',
    effectif: fichier.effectifs[i] ?? fichier.effectif,
  }));
  return {
    nom: c.nom,
    annees: fichier.annees,
    effectif: fichier.effectif,
    strate: strate === undefined ? null : strate === null ? null : (STRATES_INTERCOS[strate] ?? null),
    reperes: fichier.principaux.map((i, k) => {
      const serie = f[0][k] ?? [];
      return {
        id: fichier.reperes[i].id,
        nom: fichier.reperes[i].nom,
        explication: '',
        valeur: lignes[i].parHabitant,
        montant: lignes[i].montant,
        mediane: fichier.medianes[i] ?? null,
        effectif: fichier.effectifs[i] ?? fichier.effectif,
        serie,
        evolution: variation(serie),
      };
    }),
    lignes,
  };
}

/** Ce que la page de la commune garde d'un échelon : deux chiffres et le lien vers ses comptes. */
export interface ResumeEchelon {
  collectivite: Collectivite;
  lien: string;
  annee: number;
  /** Euros par habitant, au dernier exercice. */
  recettes: number | null;
  depenses: number | null;
}

export function lienCollectivite(c: Collectivite): string {
  return `/${c.echelon}/${c.code}`;
}

function assemblerEchelons(commune: CommuneFiche, structures: StructureFiche[]): ResumeEchelon[] {
  return collectivitesDeCommune(commune, structures).flatMap((c) => {
    const comptes = comptesCollectivite(c);
    if (!comptes) return [];
    const par = (id: string) => comptes.lignes.find((l) => l.id === id)?.parHabitant ?? null;
    return [
      {
        collectivite: c,
        lien: lienCollectivite(c),
        annee: comptes.annees[comptes.annees.length - 1],
        recettes: par('repere-recettes-totales'),
        depenses: par('repere-depenses-totales'),
      },
    ];
  });
}

function assemblerDmto(commune: CommuneFiche, population: number): Dmto | null {
  const n = dmtoFichier();
  if (!n) return null;
  const s = n.d[commune.dep];
  if (!s) return null;
  const enEuros = (l: (number | null)[]) => l.map((v) => (v === null ? null : v * 1000));
  return {
    annees: n.annees,
    departement: enEuros(s.dep),
    communes: enEuros(s.com),
    partDirecte: population > SEUIL_PART_COMMUNALE,
    maj: n.maj,
  };
}

/** Les exercices des séries de `flux.json`. */
export function anneesFlux(): number[] {
  return fluxFichier()?.annees ?? [];
}

export function assemblerFluxPercus(structures: StructureFiche[]): FluxPercu[] {
  const flux = fluxFichier();
  if (!flux) return [];
  const out: FluxPercu[] = [];
  for (const [i, r] of flux.reperes.entries()) {
    for (const s of structures) {
      const serie = flux.h[s.siren]?.[i];
      if (!serie) continue;
      const valeur = serie[serie.length - 1];
      // Une série qui s'arrête avant le dernier exercice ne se lit pas comme un
      // zéro : le groupement a pu cesser de percevoir, ou fusionner.
      if (valeur === null || valeur === undefined) continue;
      out.push({
        nom: r.nom,
        explication: r.explication,
        structure: s.nom,
        natureLibelle: s.natureLibelle,
        valeur,
        mediane: r.mediane,
        percepteurs: r.percepteurs,
        serie,
        evolution: variation(serie),
      });
      break;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Ce que la page reçoit.
 * ------------------------------------------------------------------ */

export interface ComplementsFiche {
  histoire: Population | null;
  etatCivil: EtatCivil | null;
  ages: Ages | null;
  diplomes: Diplomes | null;
  niveauDeVie: NiveauDeVie | null;
  centres: CentresSociaux | null;
  entreprises: Entreprises | null;
  presentes: Presentes | null;
  scrutin: Scrutin | null;
  finances: Finances | null;
  fluxPercus: FluxPercu[];
  anneesFlux: number[];
  /** Le département et la région : leurs comptes ont leur propre page. */
  echelons: ResumeEchelon[];
  echelonsMaj: string | null;
  dmto: Dmto | null;
  eau: ServiceEau | null;
  sru: Sru | null;
  sruMaj: string | null;
  marches: AcheteurMarches[];
  marchesDepuis: string | null;
  /** Premier et dernier mois de la fenêtre des échéances, ou null si le fichier ne la porte pas. */
  marchesFenetre: [string, string] | null;
  /** Les libellés de procédure, pour la suite des marchés chargée à la demande. */
  marchesProcedures: string[];
  deliberations: CollectiviteDelibere[];
  delibDepuis: string | null;
  subventions: CollectiviteSubventionne[];
  subventionsSeuil: number | null;
  associations: Associations | null;
}

export function complementsFiche(
  commune: CommuneFiche,
  population: number,
  structures: StructureFiche[],
): ComplementsFiche {
  return {
    histoire: assemblerPopulation(commune),
    etatCivil: assemblerEtatCivil(commune),
    ages: assemblerAges(commune),
    diplomes: assemblerDiplomes(commune),
    niveauDeVie: assemblerNiveauDeVie(commune),
    centres: assemblerCentres(commune),
    entreprises: assemblerEntreprises(commune),
    presentes: assemblerPresentes(commune, population),
    scrutin: assemblerScrutin(commune, structures),
    finances: assemblerFinances(commune, population),
    fluxPercus: assemblerFluxPercus(structures),
    anneesFlux: fluxFichier()?.annees ?? [],
    echelons: assemblerEchelons(commune, structures),
    echelonsMaj: echelonsFichier()?.maj ?? null,
    dmto: assemblerDmto(commune, population),
    eau: assemblerEau(commune),
    sru: sruDep.get(commune.dep)?.c[commune.code] ?? null,
    sruMaj: sruDep.get(commune.dep)?.maj ?? null,
    marches: assemblerMarches(commune, structures),
    marchesDepuis: marchesDep.get(commune.dep)?.depuis ?? null,
    marchesFenetre: marchesDep.get(commune.dep)?.fenetre ?? null,
    marchesProcedures: marchesDep.get(commune.dep)?.procedures ?? [],
    deliberations: assemblerDeliberations(commune, structures),
    delibDepuis: delibDep.get(commune.dep)?.depuis ?? null,
    subventions: assemblerSubventions(commune, structures),
    subventionsSeuil: subvDep.get(commune.dep)?.seuil ?? null,
    associations: assemblerAssociations(commune, population),
  };
}
