/**
 * Ce que la page d'une commune dit de la vie qu'on y mène : se soigner, l'eau
 * du robinet, la fibre, l'électricité et le gaz, le logement et son prix,
 * l'emploi et les trajets, les écoles, la délinquance enregistrée, la terre
 * agricole et les votes ; le sol consommé, le radon et les étiquettes
 * énergétiques des logements.
 *
 * Chaque jeu est écrit par son collecteur (`scripts/*-emettre.ts`), un fichier
 * par département. Ce module ne calcule rien qu'une page ne puisse refaire à
 * la main : des parts, des rapports, jamais un agrégat que la source ne
 * publie pas.
 */
import { parDepartement, type CommuneFiche } from './fiche-commune.ts';
import { communes } from './territoires.ts';

/* ------------------------------------------------------------------ *
 * Les fichiers, tels que les collecteurs les écrivent.
 * ------------------------------------------------------------------ */

type SanteDep = {
  maj: string;
  annees: number[];
  dep: (number | null)[] | null;
  france: (number | null)[] | null;
  c: Record<string, [number | null, number | null][]>;
};
type EauQualiteDep = { maj: string; du: string; au: string; c: Record<string, [number, number, number, number, string | null, string, string]> };
type FibreDep = { maj: string; trimestre: string; annees: number[]; c: Record<string, [number, number, string, string, number[]]> };
type Valeurs = (number[] | null)[];
type ParcDep = { maj: string; millesimes: number[]; libelles: string[]; dep: Valeurs | null; france: Valeurs | null; c: Record<string, Valeurs> };
type EmploiDep = {
  maj: string;
  millesimes: number[];
  activite: string[];
  navettes: string[];
  dep: [Valeurs | null, number[] | null];
  france: [Valeurs | null, number[] | null];
  c: Record<string, [Valeurs | null, number[] | null]>;
};
type PrixLigne = [number, number | null, number | null, number, number | null, ...number[]];
type DvfDep = { maj: string; annees: number[]; minimum: number; dep: PrixLigne | null; c: Record<string, PrixLigne> };
type Reference = { dep: (number | null)[]; france: (number | null)[] };
type IpsDep = {
  maj: string;
  rentrees: Record<'école' | 'collège', string>;
  references: Record<'école' | 'collège', Reference> | null;
  c: Record<string, [string, string, 'public' | 'privé', number, 'école' | 'collège'][]>;
};
type DelinquanceDep = {
  maj: string;
  annees: number[];
  indicateurs: [string, string][];
  dep: (number | null)[] | null;
  c: Record<string, ([number, ...(number | null)[]] | null)[]>;
};
type AgricultureDep = { maj: string; recensement: number; c: Record<string, [number, number, number, number]> };
type FiliereLigne = [number, number, number, number, string[]];
type EnergieDep = { maj: string; annee: number; c: Record<string, [FiliereLigne | null, FiliereLigne | null]> };

const santeDep = parDepartement<SanteDep>('sante');
const eauDep = parDepartement<EauQualiteDep>('eau-qualite');
const fibreDep = parDepartement<FibreDep>('fibre');
const parcDep = parDepartement<ParcDep>('parc');
const emploiDep = parDepartement<EmploiDep>('emploi');
const dvfDep = parDepartement<DvfDep>('dvf');
const ipsDep = parDepartement<IpsDep>('ips');
const delinquanceDep = parDepartement<DelinquanceDep>('delinquance');
const agricultureDep = parDepartement<AgricultureDep>('agriculture');
const energieDep = parDepartement<EnergieDep>('energie');
export type Participation = [number, number, number, number, number];
/** Les premiers candidats ou listes [libellé, voix], les voix des autres, le nombre de circonscriptions. */
export type Voix = [[string, number][], number, number];
type VotesDep = {
  maj: string;
  scrutins: { id: string; nom: string; date: string; france: Participation | null }[];
  c: Record<string, [Participation | null, Voix | null][]>;
};
const votesDep = parDepartement<VotesDep>('votes');
type ConsoDep = { maj: string; annees: number[]; c: Record<string, [number[], number, number, number, number, number | null, number | null]> };
type RadonDep = { maj: string; arrete: string; publie?: string | null; c: Record<string, number[]> };
type DpeDep = { maj: string; base: string; dep: number[] | null; france: number[]; c: Record<string, number[]> };
const consoDep = parDepartement<ConsoDep>('artificialisation');
const radonDep = parDepartement<RadonDep>('radon');
const dpeDep = parDepartement<DpeDep>('dpe');
type DotationsDep = { maj: string; annees: number[]; c: Record<string, [(number | null)[], (number | null)[] | null, number[]]> };
const dotationsDep = parDepartement<DotationsDep>('dotations');
type CafDep = { maj: string; annees: number[]; c: Record<string, [(number[] | null)[], number]> };
const cafDep = parDepartement<CafDep>('caf');
type DaeDep = { maj: string; c: Record<string, [number, number]> };
type AccidentsDep = { maj: string; annees: number[]; c: Record<string, [number, number, number]> };
const daeDep = parDepartement<DaeDep>('dae');
const accidentsDep = parDepartement<AccidentsDep>('accidents');
type GaresDep = {
  maj: string;
  annee: number;
  c: Record<string, { g: [string, number][] } | { p: [string, string, number, number] }>;
};
const garesDep = parDepartement<GaresDep>('gares');
type AntennesDep = { maj: string; trimestre: string; operateurs: string[]; c: Record<string, [number, number, number, number][]> };
const antennesDep = parDepartement<AntennesDep>('antennes');
type ProductionDep = { maj: string; au: string; filieres: string[]; c: Record<string, [number, number, number, number, 0 | 1 | 2][]> };
const productionDep = parDepartement<ProductionDep>('production');
type MonumentsDep = { maj: string; c: Record<string, [string, string, 0 | 1][]> };
const monumentsDep = parDepartement<MonumentsDep>('monuments');
type ZonagesDep = { maj: string; dates: Record<string, string>; c: Record<string, [string[], string, string, 0 | 1 | 2]> };
const zonagesDep = parDepartement<ZonagesDep>('zonages');
type LieuxDep = { maj: string; c: Record<string, [string[], string[], string[]]> };
const lieuxDep = parDepartement<LieuxDep>('lieux');

/* ------------------------------------------------------------------ *
 * Les formes, telles que la page les affiche.
 * ------------------------------------------------------------------ */

export interface Sante {
  annees: number[];
  /** Par année : l'APL aux généralistes, puis aux généralistes de 65 ans ou moins. */
  apl: [number | null, number | null][];
  /** Moyennes pondérées par la population, comme l'INSEE les publie. */
  departement: (number | null)[] | null;
  france: (number | null)[] | null;
  /** Paris, Lyon, Marseille : chaque arrondissement, la dernière année. */
  arrondissements: { code: string; apl: number }[];
  maj: string;
}

export interface EauRobinet {
  du: string;
  au: string;
  prelevements: number;
  /** Prélèvements non conformes aux limites de qualité microbiologiques. */
  bacterio: number;
  /** … aux limites de qualité chimiques. */
  chimique: number;
  /** Conformes sous dérogation préfectorale. */
  derogation: number;
  dernierNonConforme: string | null;
  maitreOuvrage: string;
  exploitant: string;
  maj: string;
}

export interface Fibre {
  trimestre: string;
  locaux: number;
  raccordables: number;
  porteur: string;
  zone: string;
  /** L'année à partir de laquelle tous les locaux sont concernés par la fin du cuivre, s'il y en a une. */
  finCuivre: number | null;
  /** Les locaux concernés, fin d'année par fin d'année. */
  cuivre: { annee: number; locaux: number }[];
  maj: string;
}

export interface Parc {
  millesimes: number[];
  libelles: string[];
  commune: Valeurs;
  departement: Valeurs | null;
  france: Valeurs | null;
  maj: string;
}

export interface Emploi {
  millesimes: number[];
  libellesActivite: string[];
  libellesNavettes: string[];
  activite: Valeurs | null;
  navettes: number[] | null;
  departement: [Valeurs | null, number[] | null];
  france: [Valeurs | null, number[] | null];
  maj: string;
}

export interface PrixVentes {
  maisons: number;
  m2Maison: number | null;
  prixMaison: number | null;
  appartements: number;
  m2Appartement: number | null;
  parAnnee: number[];
}

export interface Immobilier {
  annees: number[];
  minimum: number;
  commune: PrixVentes;
  departement: PrixVentes | null;
  maj: string;
}

export interface Etablissement {
  uai: string;
  nom: string;
  secteur: 'public' | 'privé';
  ips: number;
  type: 'école' | 'collège';
}

export interface Ecoles {
  rentrees: Record<'école' | 'collège', string>;
  etablissements: Etablissement[];
  references: Record<'école' | 'collège', Reference> | null;
  maj: string;
}

export interface IndicateurDelinquance {
  nom: string;
  unite: string;
  /** Pour mille habitants — pour mille logements pour les cambriolages. */
  taux: number;
  tauxDepartement: number | null;
  /** Le nombre, année par année ; null quand l'année n'est pas diffusée. */
  serie: (number | null)[];
}

export interface Delinquance {
  annees: number[];
  indicateurs: IndicateurDelinquance[];
  /** Les indicateurs que le SSMSI ne diffuse pas pour cette commune. */
  masques: string[];
  maj: string;
}

export interface Agriculture {
  recensement: number;
  sau: number;
  cereales: number;
  prairies: number;
  permanentes: number;
  maj: string;
}

export interface FiliereEnergie {
  residentiel: number;
  points: number;
  total: number;
  mailles: number;
  distributeurs: string[];
}

export interface Energie {
  annee: number;
  electricite: FiliereEnergie | null;
  gaz: FiliereEnergie | null;
  maj: string;
}

export interface Votes {
  scrutins: VotesDep['scrutins'];
  resultats: (Participation | null)[];
  voix: (Voix | null)[];
  maj: string;
}

/** Les espaces naturels, agricoles et forestiers consommés, en hectares. */
export interface Artificialisation {
  annees: number[];
  /** Chaque année, du 1er janvier au 1er janvier suivant. */
  serie: number[];
  total: number;
  habitat: number;
  activites: number;
  /** La décennie de référence de la loi, 2011 à 2021, et ce qui a suivi. */
  reference: number | null;
  depuis: number | null;
  /** La surface de la commune. */
  surface: number;
  maj: string;
}

export interface Radon {
  /** Les zones, de 1 à 3 ; plusieurs quand la commune en a réuni plusieurs. */
  zones: number[];
  arrete: string;
  /** L'année de publication du fichier. */
  publie: string | null;
  maj: string;
}

/** Diagnostics de performance énergétique, par étiquette de A à G. */
export interface Dpe {
  commune: number[];
  departement: number[] | null;
  france: number[];
  base: string;
  maj: string;
}

/** La DGF notifiée chaque année, et ce qui la compose la dernière. */
export interface Dotations {
  annees: number[];
  dgf: (number | null)[];
  /** La dotation des communes nouvelles, hors du total « DGF » de la DGCL. */
  communeNouvelle: (number | null)[] | null;
  /** Nul quand les parts de la dernière année ne font pas le total. */
  parts: {
    forfaitaire: number;
    dsu: number;
    dsr: number;
    dnp: number;
    dacom: number;
    bourgCentre: number;
    perequation: number;
    cible: number;
  } | null;
  maj: string;
}

/** Les foyers allocataires de la CAF en décembre, arrondis à 5 par elle. */
export interface Caf {
  annee: number;
  foyers: number;
  personnes: number;
  rsa: number;
  primeActivite: number;
  logement: number;
  familiales: number;
  jeuneEnfant: number;
  /** Les foyers de chaque année, pour la tendance. */
  serie: (number | null)[];
  annees: number[];
  /** Paris, Lyon, Marseille : une somme d'arrondissements, donc d'arrondis. */
  somme: boolean;
  maj: string;
}

/** Les défibrillateurs déclarés à Géo'DAE ; zéro est une réponse. */
export interface Defibrillateurs {
  appareils: number;
  exterieurs: number;
  maj: string;
}

/** Les accidents corporels de la circulation, sur plusieurs années ; zéro est une réponse. */
export interface Route {
  debut: number;
  fin: number;
  accidents: number;
  tues: number;
  blesses: number;
  maj: string;
}

/**
 * Les gares de voyageurs de la commune ; à défaut, la plus proche de sa
 * mairie, à vol d'oiseau. Rien sur les trains qui s'y arrêtent.
 */
export interface Gares {
  ici: { nom: string; voyageurs: number }[];
  proche: { nom: string; code: string; commune: string; km: number; voyageurs: number } | null;
  annee: number;
  maj: string;
}

/**
 * Les sites mobiles installés sur la commune, par opérateur ; aucun est une
 * réponse. Des antennes, pas une couverture.
 */
export interface Antennes {
  operateurs: { nom: string; sites: number; g4: number; g5: number }[];
  /** La date de la liste, AAAA-MM-JJ : le dernier jour du trimestre. */
  au: string;
  maj: string;
}

/**
 * L'électricité produite dans la commune, par filière, d'après le registre
 * national des installations ; aucune installation est une réponse. L'énergie
 * est celle injectée sur le réseau sur un an, autoconsommation exclue.
 */
export interface Production {
  /** `energie` : connue, partielle — un minimum —, ou inconnue. */
  filieres: { nom: string; installations: number; kw: number; mwh: number; energie: 'connue' | 'partielle' | 'inconnue' }[];
  au: string;
  maj: string;
}

/** Les immeubles protégés au titre des monuments historiques ; aucun est une réponse. */
export interface Monuments {
  liste: { reference: string; titre: string; classe: boolean }[];
  maj: string;
}

/**
 * Ce qui mérite une visite, d'après les offices de tourisme (DATAtourisme) :
 * patrimoine, sites naturels, itinéraires. Rien n'est une réponse aussi — mais
 * une réponse sur ce qu'ils ont saisi, pas sur ce qui existe.
 */
export interface Lieux {
  patrimoine: string[];
  nature: string[];
  itineraires: string[];
  maj: string;
}

/**
 * Les programmes de l'ANCT dont la commune bénéficie, et son classement en
 * zone de montagne ; rien est une réponse.
 */
export interface Zonages {
  programmes: string[];
  territoireIndustrie: string | null;
  crte: string | null;
  montagne: 'non' | 'oui' | 'en partie';
  dates: Record<string, string>;
  maj: string;
}

export interface ComplementsVie {
  sante: Sante | null;
  eau: EauRobinet | null;
  fibre: Fibre | null;
  parc: Parc | null;
  emploi: Emploi | null;
  immobilier: Immobilier | null;
  ecoles: Ecoles | null;
  delinquance: Delinquance | null;
  agriculture: Agriculture | null;
  energie: Energie | null;
  votes: Votes | null;
  artificialisation: Artificialisation | null;
  radon: Radon | null;
  dpe: Dpe | null;
  dotations: Dotations | null;
  caf: Caf | null;
  defibrillateurs: Defibrillateurs | null;
  route: Route | null;
  gares: Gares | null;
  antennes: Antennes | null;
  production: Production | null;
  monuments: Monuments | null;
  lieux: Lieux | null;
  zonages: Zonages | null;
}

/* ------------------------------------------------------------------ *
 * Les assemblages.
 * ------------------------------------------------------------------ */

/** Les arrondissements de Paris, Lyon et Marseille, par le préfixe de leur code. */
const ARRONDISSEMENTS: Record<string, RegExp> = { '75056': /^751\d\d$/, '69123': /^6938\d$/, '13055': /^132\d\d$/ };

function sante(c: CommuneFiche): Sante | null {
  const d = santeDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || !x.some((a) => a[0] !== null)) return null;
  const motif = ARRONDISSEMENTS[c.code];
  const dernier = d.annees.length - 1;
  const arrondissements = motif
    ? Object.entries(d.c)
        .filter(([code, v]) => motif.test(code) && v[dernier]?.[0] != null)
        .map(([code, v]) => ({ code, apl: v[dernier][0]! }))
    : [];
  return { annees: d.annees, apl: x, departement: d.dep ?? null, france: d.france ?? null, arrondissements, maj: d.maj };
}

function eau(c: CommuneFiche): EauRobinet | null {
  const d = eauDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || x[0] === 0) return null;
  const [prelevements, bacterio, chimique, derogation, dernierNonConforme, maitreOuvrage, exploitant] = x;
  return { du: d.du, au: d.au, prelevements, bacterio, chimique, derogation, dernierNonConforme, maitreOuvrage, exploitant, maj: d.maj };
}

function fibre(c: CommuneFiche): Fibre | null {
  const d = fibreDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || x[0] <= 0) return null;
  const [locaux, raccordables, porteur, zone, cuivre] = x;
  const annees = d.annees.map((annee, i) => ({ annee, locaux: cuivre[i] ?? 0 }));
  const toute = annees.find((a) => a.locaux >= locaux);
  return { trimestre: d.trimestre, locaux, raccordables, porteur, zone, finCuivre: toute?.annee ?? null, cuivre: annees, maj: d.maj };
}

function parc(c: CommuneFiche): Parc | null {
  const d = parcDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || !x[0] || x[0][0] <= 0) return null;
  return { millesimes: d.millesimes, libelles: d.libelles, commune: x, departement: d.dep, france: d.france, maj: d.maj };
}

function emploi(c: CommuneFiche): Emploi | null {
  const d = emploiDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x) return null;
  const [activite, navettes] = x;
  if (!(activite?.[0]?.[0] && activite[0][0] > 0) && !(navettes?.[0] && navettes[0] > 0)) return null;
  return {
    millesimes: d.millesimes,
    libellesActivite: d.activite,
    libellesNavettes: d.navettes,
    activite: activite?.[0]?.[0] ? activite : null,
    navettes: navettes?.[0] ? navettes : null,
    departement: d.dep,
    france: d.france,
    maj: d.maj,
  };
}

function ventes(x: PrixLigne): PrixVentes {
  const [maisons, m2Maison, prixMaison, appartements, m2Appartement, ...parAnnee] = x;
  return { maisons, m2Maison, prixMaison, appartements, m2Appartement, parAnnee };
}

function immobilier(c: CommuneFiche): Immobilier | null {
  const d = dvfDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x) return null;
  return { annees: d.annees, minimum: d.minimum, commune: ventes(x), departement: d.dep ? ventes(d.dep) : null, maj: d.maj };
}

function ecoles(c: CommuneFiche): Ecoles | null {
  const d = ipsDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || x.length === 0) return null;
  return {
    rentrees: d.rentrees,
    etablissements: x.map(([uai, nom, secteur, ips, type]) => ({ uai, nom, secteur, ips, type })),
    references: d.references,
    maj: d.maj,
  };
}

function delinquance(c: CommuneFiche): Delinquance | null {
  const d = delinquanceDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x) return null;
  const indicateurs: IndicateurDelinquance[] = [];
  const masques: string[] = [];
  d.indicateurs.forEach(([nom, unite], i) => {
    const v = x[i];
    if (!v) masques.push(nom);
    else indicateurs.push({ nom, unite, taux: v[0], tauxDepartement: d.dep?.[i] ?? null, serie: v.slice(1) as (number | null)[] });
  });
  if (indicateurs.length === 0) return null;
  return { annees: d.annees, indicateurs, masques, maj: d.maj };
}

function agriculture(c: CommuneFiche): Agriculture | null {
  const d = agricultureDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x) return null;
  const [sau, cereales, prairies, permanentes] = x;
  return { recensement: d.recensement, sau, cereales, prairies, permanentes, maj: d.maj };
}

function filiere(x: FiliereLigne | null): FiliereEnergie | null {
  if (!x) return null;
  const [residentiel, points, total, mailles, distributeurs] = x;
  return { residentiel, points, total, mailles, distributeurs };
}

function energie(c: CommuneFiche): Energie | null {
  const d = energieDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || (!x[0] && !x[1])) return null;
  return { annee: d.annee, electricite: filiere(x[0]), gaz: filiere(x[1]), maj: d.maj };
}

function votes(c: CommuneFiche): Votes | null {
  const d = votesDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || !x.some((r) => r[0] && r[0][0] > 0)) return null;
  return { scrutins: d.scrutins, resultats: x.map((r) => r[0]), voix: x.map((r) => r[1]), maj: d.maj };
}

function artificialisation(c: CommuneFiche): Artificialisation | null {
  const d = consoDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x) return null;
  // La loi compare 2021-2031 à 2011-2021 : le Cerema publie les deux totaux.
  const [serie, habitat, activites, surface, total, reference, depuis] = x;
  return { annees: d.annees, serie, total, habitat, activites, reference, depuis, surface, maj: d.maj };
}

function radon(c: CommuneFiche): Radon | null {
  const d = radonDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || x.length === 0) return null;
  return { zones: x, arrete: d.arrete, publie: d.publie ?? null, maj: d.maj };
}

function dpe(c: CommuneFiche): Dpe | null {
  const d = dpeDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || x.reduce((s, n) => s + n, 0) === 0) return null;
  return { commune: x, departement: d.dep, france: d.france, base: d.base, maj: d.maj };
}

function dotations(c: CommuneFiche): Dotations | null {
  const d = dotationsDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || !x[0].some((v) => v !== null && v > 0)) return null;
  const [dgf, cn, p] = x;
  const [forfaitaire, dsu, dsr, dnp, dacom, bourgCentre, perequation, cible] = p;
  const derniere = dgf[dgf.length - 1] ?? 0;
  const ok = Math.abs(forfaitaire + dsu + dsr + dnp + dacom - derniere) <= 1;
  return {
    annees: d.annees,
    dgf,
    communeNouvelle: cn,
    parts: ok ? { forfaitaire, dsu, dsr, dnp, dacom, bourgCentre, perequation, cible } : null,
    maj: d.maj,
  };
}

function caf(c: CommuneFiche): Caf | null {
  const d = cafDep.get(c.dep);
  const x = d?.c[c.code];
  const n = x?.[0][x[0].length - 1];
  if (!d || !x || !n || n[0] <= 0) return null;
  const [foyers, personnes, rsa, primeActivite, logement, familiales, jeuneEnfant] = n;
  return {
    annee: d.annees[d.annees.length - 1],
    foyers,
    personnes,
    rsa,
    primeActivite,
    logement,
    familiales,
    jeuneEnfant,
    serie: x[0].map((a) => a?.[0] ?? null),
    annees: d.annees,
    somme: x[1] === 1,
    maj: d.maj,
  };
}

// Une commune absente des deux fichiers n'a rien de déclaré : la page le dit,
// tant que le fichier du département existe.
function defibrillateurs(c: CommuneFiche): Defibrillateurs | null {
  const d = daeDep.get(c.dep);
  if (!d) return null;
  const [appareils, exterieurs] = d.c[c.code] ?? [0, 0];
  return { appareils, exterieurs, maj: d.maj };
}

function route(c: CommuneFiche): Route | null {
  const d = accidentsDep.get(c.dep);
  if (!d) return null;
  const [accidents, tues, blesses] = d.c[c.code] ?? [0, 0, 0];
  return { debut: d.annees[0], fin: d.annees[d.annees.length - 1], accidents, tues, blesses, maj: d.maj };
}

let nomsCommunes: Map<string, string> | null = null;

function gares(c: CommuneFiche): Gares | null {
  const d = garesDep.get(c.dep);
  const f = d?.c[c.code];
  if (!d || !f) return null;
  if ('g' in f) {
    return { ici: f.g.map(([nom, voyageurs]) => ({ nom, voyageurs })), proche: null, annee: d.annee, maj: d.maj };
  }
  nomsCommunes ??= new Map(communes().map((x) => [x.code, x.nom]));
  const [nom, code, km, voyageurs] = f.p;
  return {
    ici: [],
    proche: { nom, code, commune: nomsCommunes.get(code) ?? code, km, voyageurs },
    annee: d.annee,
    maj: d.maj,
  };
}

const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];

function antennes(c: CommuneFiche): Antennes | null {
  const d = antennesDep.get(c.dep);
  const m = d ? /^(\d{4})_T([1-4])$/.exec(d.trimestre) : null;
  if (!d || !m) return null;
  return {
    operateurs: (d.c[c.code] ?? []).map(([i, sites, g4, g5]) => ({ nom: d.operateurs[i] ?? '', sites, g4, g5 })),
    au: `${m[1]}-${FIN_TRIMESTRE[Number(m[2]) - 1]}`,
    maj: d.maj,
  };
}

function production(c: CommuneFiche): Production | null {
  const d = productionDep.get(c.dep);
  if (!d) return null;
  return {
    filieres: (d.c[c.code] ?? []).map(([i, installations, kw, mwh, e]) => ({
      nom: d.filieres[i] ?? '',
      installations,
      kw,
      mwh,
      energie: e === 2 ? 'inconnue' : e === 1 ? 'partielle' : 'connue',
    })),
    au: d.au,
    maj: d.maj,
  };
}

function monuments(c: CommuneFiche): Monuments | null {
  const d = monumentsDep.get(c.dep);
  if (!d) return null;
  return {
    liste: (d.c[c.code] ?? []).map(([reference, titre, classe]) => ({ reference, titre, classe: classe === 1 })),
    maj: d.maj,
  };
}

function lieux(c: CommuneFiche): Lieux | null {
  const d = lieuxDep.get(c.dep);
  if (!d) return null;
  const [patrimoine, nature, itineraires] = d.c[c.code] ?? [[], [], []];
  return { patrimoine, nature, itineraires, maj: d.maj };
}

function zonages(c: CommuneFiche): Zonages | null {
  const d = zonagesDep.get(c.dep);
  if (!d) return null;
  const [programmes, ti, crte, m] = d.c[c.code] ?? [[], '', '', 0];
  return {
    programmes,
    territoireIndustrie: ti || null,
    crte: crte || null,
    montagne: m === 1 ? 'oui' : m === 2 ? 'en partie' : 'non',
    dates: d.dates,
    maj: d.maj,
  };
}

export function complementsVie(c: CommuneFiche): ComplementsVie {
  return {
    sante: sante(c),
    eau: eau(c),
    fibre: fibre(c),
    parc: parc(c),
    emploi: emploi(c),
    immobilier: immobilier(c),
    ecoles: ecoles(c),
    delinquance: delinquance(c),
    agriculture: agriculture(c),
    energie: energie(c),
    votes: votes(c),
    artificialisation: artificialisation(c),
    radon: radon(c),
    dpe: dpe(c),
    dotations: dotations(c),
    caf: caf(c),
    defibrillateurs: defibrillateurs(c),
    route: route(c),
    gares: gares(c),
    antennes: antennes(c),
    production: production(c),
    monuments: monuments(c),
    lieux: lieux(c),
    zonages: zonages(c),
  };
}
