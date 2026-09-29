/**
 * Ce que la page d'une commune dit de la vie qu'on y mène : se soigner, l'eau
 * du robinet, la fibre, l'électricité et le gaz, le logement et son prix,
 * l'emploi et les trajets, les écoles, la délinquance enregistrée, la terre
 * agricole et les votes.
 *
 * Chaque jeu est écrit par son collecteur (`scripts/*-emettre.ts`), un fichier
 * par département. Ce module ne calcule rien qu'une page ne puisse refaire à
 * la main : des parts, des rapports, jamais un agrégat que la source ne
 * publie pas.
 */
import { parDepartement, type CommuneFiche } from './fiche-commune.ts';

/* ------------------------------------------------------------------ *
 * Les fichiers, tels que les collecteurs les écrivent.
 * ------------------------------------------------------------------ */

type SanteDep = { maj: string; annees: number[]; c: Record<string, [number | null, number | null][]> };
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
type VotesDep = { maj: string; scrutins: { id: string; nom: string; date: string; france: Participation | null }[]; c: Record<string, (Participation | null)[]> };
const votesDep = parDepartement<VotesDep>('votes');

/* ------------------------------------------------------------------ *
 * Les formes, telles que la page les affiche.
 * ------------------------------------------------------------------ */

export interface Sante {
  annees: number[];
  /** Par année : l'APL aux généralistes, puis aux généralistes de 65 ans ou moins. */
  apl: [number | null, number | null][];
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
}

/* ------------------------------------------------------------------ *
 * Les assemblages.
 * ------------------------------------------------------------------ */

function sante(c: CommuneFiche): Sante | null {
  const d = santeDep.get(c.dep);
  const x = d?.c[c.code];
  if (!d || !x || !x.some((a) => a[0] !== null)) return null;
  return { annees: d.annees, apl: x, maj: d.maj };
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
  if (!d || !x || !x.some((r) => r && r[0] > 0)) return null;
  return { scrutins: d.scrutins, resultats: x, maj: d.maj };
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
  };
}
