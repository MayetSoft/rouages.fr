/**
 * Lire, au moment du build, ce que l'ingestion a écrit.
 *
 * Les fichiers de `public/territoires` sont produits par `npm run territoires`
 * pour être consommés par le navigateur. Les pages de commune les relisent
 * depuis le disque : la jointure coûteuse a déjà été faite une fois, il serait
 * absurde de la refaire ici, et deux calculs indépendants finiraient par
 * diverger.
 *
 * Tout est mis en cache par département : un département compte en moyenne
 * 345 communes, et relire son fichier pour chacune multiplierait par autant le
 * temps de génération.
 */
import { dernierChangement } from './fiche-commune.ts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { verdictDe, type StructureExercante, type Verdict } from './verdict.ts';

const BASE = join(process.cwd(), 'public', 'territoires');

export interface CommuneIndex {
  code: string;
  nom: string;
  cp: string;
  dep: string;
  depNom: string;
  population: number;
}

interface Meta {
  maj: string;
  codes: Record<string, string[]>;
  obligatoires?: Record<string, string[]>;
  reserves?: Record<string, string>;
  aDefaut?: Record<string, 'region' | 'departement' | 'etat'>;
  regions?: Record<string, string>;
  /** Le code de la région de chaque département, tel que l'OFGL le publie : c'est lui qui nomme la page `/region/XX`. */
  codesRegion?: Record<string, string>;
  natures: Record<string, string>;
  couverture?: Record<string, number>;
  services?: { familles: string[]; sdis?: Record<string, string> };
}

interface DepStructure {
  maj: string;
  g: [string, string, string, string[]][];
  /** Par commune : code, nom, population, groupements, codes postaux. */
  c: [string, string, number, number[], string?][];
  couverture?: Record<string, number>;
}

type ServicesDep = {
  maj: string;
  c: Record<string, ([number, string, number] | [number, string, number, string])[]>;
  sdis?: string;
  v?: Record<string, Record<string, { n: number; l: string[] }>>;
};
type ElusDep = { maj: string; c: Record<string, [string, string, string]> };
type EcolesDep = { rentrees: number[]; h: Record<string, [(number | null)[], (number | null)[]]> };
type SruDep = { maj: string; c: Record<string, Record<string, unknown>> };
type RisquesDep = {
  maj: string;
  risques: string[];
  jo: string[];
  modeles: string[];
  etats: string[];
  c: Record<
    string,
    {
      ddrm: [number, number[]][];
      catnat: [number, number, string][];
      ppr: { m: number; nom: string; e: number; date: string }[];
      dicrim?: string;
    }
  >;
};

/**
 * Le journal d'un département : ce qui a bougé sur la fenêtre, une fois par
 * événement. Un marché d'agglomération y figure sous son SIREN, pas sous
 * chacune des communes qu'il concerne — c'est ici qu'on fait l'éventail.
 */
/**
 * Le dernier scrutin municipal du département. La page n'en retient que les
 * sièges : la participation et les bulletins blancs sont dans la carte, et
 * c'est le poids de la commune qui manquait ici.
 */
type ElectionsDep = {
  maj: string;
  scrutin: string;
  c: Record<string, { cm: number; cc: number }>;
};

/** La composition des conseils du département ; seuls les adjoints y sont nommés. */
type ConseilsDep = {
  maj: string;
  groupes: string[];
  femmes: number;
  age: number;
  c: Record<
    string,
    { n: number; f: number; age: [number, number, number]; p: [number, number][]; cc: number; a?: [string, string, string, string][] }
  >;
};

/** L'état des documents d'urbanisme du département. */
type UrbanismeDep = {
  maj: string;
  jusquau: string;
  documents: string[];
  sansDocument: number;
  intercommunales: number;
  total: number;
  c: Record<string, { d: number; a: string; i: 0 | 1 | 2; s: string; e: number; p: string }>;
};

/**
 * Ce que le Géoportail de l'urbanisme sait et que l'enquête annuelle ignore :
 * une version déposée après sa clôture.
 */
type PluDep = {
  maj: string;
  c: Record<string, { a: { t: string; d: string; n: number; r: string } }>;
};

/** Les logements autorisés et commencés du département. */
type LogementsDep = {
  maj: string;
  arrete: string;
  annees: number[];
  mediane: number;
  c: Record<string, [number[], number, number]>;
};

/** Les taux d'imposition du département. */
type FiscaliteDep = {
  maj: string;
  millesime: number;
  percepteurs: string[];
  teom: string[];
  medianeFb: number;
  medianeOm: number;
  c: Record<
    string,
    [number[], number, number, number, number, number, number, number, number, number]
  >;
};

/** Les équipements du département, et la nomenclature qui les range. */
type EquipementsDep = {
  maj: string;
  millesime: number;
  types: [string, 0 | 1, string][];
  /** Par regroupement : son intitulé, sa gamme, et les index de ses types. */
  groupes: [string, 0 | 1, number[]][];
  medianeProximite: number;
  nombreProximite: number;
  c: Record<string, [number, number][]>;
};

type JournalDep = {
  maj: string;
  fenetre: number;
  genres: string[];
  e: { g: number; d: string; q: string; p?: string; u?: string; s?: string; c?: string }[];
};

function lire<T>(chemin: string): T | null {
  const p = join(BASE, chemin);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

let meta: Meta | null | undefined;
export function metaTerritoires(): Meta | null {
  if (meta === undefined) meta = lire<Meta>('meta.json');
  return meta;
}

/** Toutes les communes, pour engendrer les chemins. */
export function communes(): CommuneIndex[] {
  const idx = lire<{ deps: Record<string, string>; c: [string, string, string, string, number][] }>(
    'index.json',
  );
  if (!idx) return [];
  return idx.c.map(([code, nom, cp, dep, population]) => ({
    code,
    nom,
    cp,
    dep,
    depNom: idx.deps[dep] ?? dep,
    population,
  }));
}

const cacheDep = new Map<string, DepStructure | null>();
const cacheServices = new Map<string, ServicesDep | null>();
const cacheElus = new Map<string, ElusDep | null>();
const cacheEcoles = new Map<string, EcolesDep | null>();
const cacheSru = new Map<string, SruDep | null>();
const cacheRisques = new Map<string, RisquesDep | null>();
const cacheJournal = new Map<string, JournalDep | null>();
const cacheElections = new Map<string, ElectionsDep | null>();
const cacheConseils = new Map<string, ConseilsDep | null>();
const cacheUrbanisme = new Map<string, UrbanismeDep | null>();
const cachePlu = new Map<string, PluDep | null>();
const cacheLogements = new Map<string, LogementsDep | null>();
const cacheFiscalite = new Map<string, FiscaliteDep | null>();
const cacheEquipements = new Map<string, EquipementsDep | null>();

function enCache<T>(c: Map<string, T | null>, dep: string, f: string): T | null {
  if (!c.has(dep)) c.set(dep, lire<T>(f));
  return c.get(dep) ?? null;
}

export interface EvenementCommune {
  /** Le genre, en clair : « Marché notifié », « Délibération »… */
  genre: string;
  date: string;
  quoi: string;
  detail: string | null;
  url: string | null;
  /**
   * Qui en est l'auteur, quand ce n'est pas la commune elle-même : le nom du
   * groupement. C'est souvent lui qui agit, et c'est pour cela qu'on le nomme.
   */
  par: string | null;
  /** Une identité stable, pour l'`id` d'une entrée de flux. */
  cle: string;
}

/**
 * Ce qui a bougé dans une commune, du plus récent au plus ancien.
 *
 * L'éventail se fait ici : aux événements qui portent son code s'ajoutent ceux
 * de son propre SIREN et de chacun de ses groupements. C'est l'essentiel du
 * volume — une commune de mille habitants ne commande presque rien, son
 * agglomération et ses syndicats commandent pour elle.
 */
export function journalCommune(c: CommuneIndex, maximum = 40): EvenementCommune[] {
  // Trois appels par commune — le chemin du flux, le flux, la page — et
  // chacun reparcourrait les cinq mille événements de son département.
  const deja = cacheCommune.get(c.code);
  if (deja) return deja.slice(0, maximum);
  const liste = rassemblerJournal(c);
  cacheCommune.set(c.code, liste);
  return liste.slice(0, maximum);
}

const cacheCommune = new Map<string, EvenementCommune[]>();

/** Le plafond au-delà duquel rien n'est lu : la page en montre douze. */
const JOURNAL_MAX = 40;

function rassemblerJournal(c: CommuneIndex): EvenementCommune[] {
  const j = enCache(cacheJournal, c.dep, `dep/${c.dep}-journal.json`);
  const dep = enCache(cacheDep, c.dep, `dep/${c.dep}.json`);
  if (!j || !dep) return [];
  const ligne = dep.c.find((x) => x[0] === c.code);
  if (!ligne) return [];
  // Le nom de chaque structure, pour dire qui agit ; la commune elle-même n'a
  // pas à être nommée, on est déjà sur sa page.
  const nomDe = new Map<string, string>();
  for (const i of ligne[3]) nomDe.set(dep.g[i][0], dep.g[i][1]);
  // Un événement de la commune elle-même porte son code, pas son SIREN :
  // l'ingestion l'a converti, elle seule connaît la correspondance.
  const retenus = j.e.filter((e) => (e.c ? e.c === c.code : nomDe.has(e.s ?? '')));
  return retenus
    .sort((a, b) => b.d.localeCompare(a.d) || a.q.localeCompare(b.q, 'fr'))
    .slice(0, JOURNAL_MAX)
    .map((e) => ({
      genre: j.genres[e.g] ?? '',
      date: e.d,
      quoi: e.q,
      detail: e.p ?? null,
      url: e.u ?? null,
      par: e.s ? (nomDe.get(e.s) ?? null) : null,
      // Le genre, la date, l'acteur et l'intitulé : ce qui distingue un
      // événement de tout autre, et qui ne bouge pas d'une ingestion à la
      // suivante. Un agrégateur s'en sert pour savoir ce qu'il a déjà montré.
      cle: `${e.g}-${e.d}-${e.s ?? e.c ?? ''}-${empreinte(e.q)}`,
    }));
}

/** La date du fait le plus récent, ou null quand la commune n'a rien vu bouger. */
export function journalMaj(c: CommuneIndex): string | null {
  return journalCommune(c, 1)[0]?.date ?? null;
}

/**
 * Une empreinte courte et stable d'un intitulé, pour l'identité d'une entrée.
 *
 * Le titre lui-même ferait un identifiant valide mais illisible et fragile :
 * il contient des espaces, des accents et jusqu'à cent trente caractères.
 */
function empreinte(texte: string): string {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface Fiche {
  commune: CommuneIndex;
  /** Les groupements dont la commune dépend, dans l'ordre du fichier. */
  structures: (StructureExercante & { competences: string[] })[];
  /** Compétence de Rouages -> ce qu'on peut en dire ici. */
  verdicts: Map<string, Verdict>;
  reserve: (competence: string) => string | null;
  maire: { prenom: string; nom: string; depuis: string; maj: string } | null;
  /** Les adjoints et maires délégués, dans l'ordre du tableau, d'après le répertoire national des élus. */
  adjoints: { fonction: string; prenom: string; nom: string; depuis: string }[];
  /** La date du fichier des conseillers d'où viennent les adjoints. */
  adjointsMaj: string | null;
  services: {
    famille: string;
    nom: string;
    prive: boolean;
    /** Établissement de santé doté d'un service d'urgences. */
    urgences: boolean;
    ecole?: {
      classes: (number | null)[];
      eleves: (number | null)[];
      rentrees: number[];
      dernierChangement: { rentree: number; ecart: number } | null;
    };
  }[];
  /** Ce qui n'est pas dans la commune mais dans son intercommunalité. */
  voisines: Record<string, { n: number; l: string[] }>;
  sdis: string | null;
  /** La date des annuaires dont viennent les services. */
  servicesMaj: string | null;
  /**
   * À quoi l'endroit est exposé, et ce qui y est déjà arrivé.
   *
   * Deux listes distinctes, et c'est voulu : `recenses` dit ce à quoi l'État
   * estime la commune exposée, `catnat` ce qui a été reconnu. Elles ne se
   * recouvrent pas, et les fondre serait plus simple et faux.
   */
  risques: {
    recenses: { nom: string; sous: string[] }[];
    catnat: { nom: string; nombre: number; dernier: string }[];
    plans: { nom: string; etat: string; date: string }[];
    dicrim: string | null;
    maj: string;
  } | null;
  soumiseSru: boolean;
  /**
   * Ce que pèse la commune dans les deux assemblées où elle siège.
   *
   * « Un siège » ne dit rien tant qu'on ignore sur combien : c'est le rapport
   * qui dit ce qu'elle pèse quand l'intercommunalité vote.
   */
  conseil: {
    sieges: number;
    siegesCc: number;
    /** L'intercommunalité à fiscalité propre où la commune siège. */
    ou: string | null;
    /**
     * De quoi le conseil est fait : aucun nom, un effectif, une part de
     * femmes, un âge médian et huit compteurs.
     */
    elus: number;
    femmes: number;
    ageMedian: number;
    /** Le plus jeune et le plus âgé du conseil. */
    ageMin: number;
    ageMax: number;
    groupes: { nom: string; nombre: number }[];
    /** Les mêmes chiffres pour l'ensemble des conseils du pays. */
    femmesPartout: number;
    agePartout: number;
    /**
     * Représentée sans que ses sièges soient élus.
     *
     * Sous mille habitants, les conseillers communautaires ne sont pas élus au
     * scrutin fléché : ce sont les conseillers municipaux pris dans l'ordre du
     * tableau (article L273-11 du code électoral). Le fichier des résultats
     * ne porte donc aucun siège pour elles — vingt-quatre des trente-neuf
     * communes de Vichy Communauté, par exemple. Se taire laisserait croire
     * qu'elles ne siègent pas.
     */
    designes: boolean;
    scrutin: string;
    /** La date du répertoire des élus, quand il couvre la commune. */
    maj: string | null;
  } | null;
  /**
   * Qui écrit la règle de ce qui peut se construire.
   *
   * Le site décrit le permis de construire comme un acte du maire : vrai de la
   * signature, faux de la règle appliquée dès que le plan est intercommunal —
   * et sans document local, c'est le préfet qui donne son accord sur chaque
   * permis.
   */
  urbanisme: {
    /** Le sigle du document opposable : PLU, PLUi, PLUiS, CC, POS, RNU. */
    document: string;
    /** Sa date d'approbation, vide sous règlement national. */
    approuve: string;
    /** `commune`, `groupement` si le document l'est, `transferee` si seule
     * la compétence l'est — le plan en vigueur restant alors communal. */
    qui: 'commune' | 'groupement' | 'transferee';
    /** Le groupement concerné, quand la commune en relève. */
    porteur: string | null;
    enCours: { document: string; prescrit: string } | null;
    sansDocumentPartout: number;
    intercommunalesPartout: number;
    totalPartout: number;
    /** Jusqu'où va l'enquête : elle est annuelle et paraît avec du retard. */
    jusquau: string;
    maj: string;
    /**
     * La version la plus récente déposée au Géoportail, quand elle est
     * postérieure à la clôture de l'enquête. Sa date est celle de la dernière
     * procédure — approbation, modification, mise à jour des annexes —, et son
     * état déclaré ne dit pas si elle s'applique : voir `scripts/plu-emettre.ts`.
     */
    geoportail: { type: string; date: string; communes: number; reglement: string } | null;
  } | null;
  /**
   * Ce qui est prélevé ici, et par qui.
   *
   * La ligne « taxe foncière » d'un avis n'est pas un taux : c'est une somme
   * de taux votés par des assemblées différentes.
   */
  fiscalite: {
    millesime: number;
    fbTotal: number;
    fb: { nom: string; taux: number }[];
    medianeFb: number;
    thCommune: number;
    thTotal: number;
    majoration: number;
    omTaux: number;
    omQui: string;
    medianeOm: number;
    cfeCommune: number;
    cfeGroupement: number;
    fnbTotal: number;
    maj: string;
  } | null;
  /** Ce qu'on trouve sur place, et ce pour quoi il faut partir. */
  equipements: {
    millesime: number;
    proximite: number;
    proximiteTotal: number;
    medianeProximite: number;
    /** Tout ce qui est présent, rangé par domaine, les plus fournis d'abord. */
    presents: { ou: string; liste: { nom: string; nombre: number }[] }[];
    /** Ce qui manque, parmi la seule gamme de proximité. */
    absents: string[];
    maj: string;
  } | null;
  /** Ce qui s'y construit réellement, une fois la règle écrite. */
  logements: {
    annees: number[];
    /** Les logements autorisés chaque année de la fenêtre. */
    parAnnee: number[];
    autorises: number;
    commences: number;
    individuels: number;
    /** Pour mille habitants sur la fenêtre, ici et à la médiane. */
    taux: number;
    medianeTaux: number;
    /** Le dernier mois que le fichier porte, AAAA-MM. */
    arrete: string;
    maj: string;
  } | null;
  maj: string;
}

/**
 * Tout ce qu'une page de commune affiche, rassemblé une fois.
 *
 * `competences` est la liste des identifiants à résoudre — elle vient du
 * réseau, pas des données : c'est le contenu qui décide de ce qu'on cherche à
 * savoir, pas le référentiel.
 */
export function ficheCommune(c: CommuneIndex, competences: { id: string; banatic: string[] }[]): Fiche | null {
  const m = metaTerritoires();
  const dep = enCache(cacheDep, c.dep, `dep/${c.dep}.json`);
  if (!m || !dep) return null;
  const ligne = dep.c.find((x) => x[0] === c.code);
  if (!ligne) return null;

  const structures = ligne[3].map((i) => {
    const [siren, nom, nature, codes] = dep.g[i];
    return {
      siren,
      nom,
      nature,
      natureLibelle: m.natures[nature] ?? nature,
      competences: [...new Set(codes.flatMap((k) => m.codes[k] ?? []))].sort(),
    };
  });

  const verdicts = new Map<string, Verdict>();
  for (const comp of competences) {
    if (comp.banatic.length === 0) continue;
    verdicts.set(
      comp.id,
      verdictDe({
        exercants: structures.filter((s) => s.competences.includes(comp.id)),
        structures,
        obligatoirePour: m.obligatoires?.[comp.id] ?? [],
        aDefaut: m.aDefaut?.[comp.id],
        region: m.regions?.[c.dep],
        departement: c.depNom,
        couvertureDep: dep.couverture?.[comp.id] ?? 0,
        couvertureNationale: m.couverture?.[comp.id] ?? 0,
      }),
    );
  }

  const elus = enCache(cacheElus, c.dep, `dep/${c.dep}-elus.json`);
  const brutMaire = elus?.c[c.code];

  const servs = enCache(cacheServices, c.dep, `dep/${c.dep}-services.json`);
  const ecoles = enCache(cacheEcoles, c.dep, `dep/${c.dep}-ecoles.json`);
  const familles = m.services?.familles ?? [];
  const services = (servs?.c[c.code] ?? []).map((e) => {
    const uai = e.length === 4 ? e[3] : undefined;
    const serie = uai && ecoles ? ecoles.h[uai] : undefined;
    return {
      famille: familles[e[0]] ?? '',
      nom: e[1],
      prive: familles[e[0]] !== 'sante' && e[2] === 1,
      urgences: familles[e[0]] === 'sante' && e[2] === 1,
      ...(serie
        ? {
            ecole: {
              classes: serie[0],
              eleves: serie[1],
              rentrees: ecoles!.rentrees,
              dernierChangement: dernierChangement(serie[0], ecoles!.rentrees),
            },
          }
        : {}),
    };
  });
  // Les urgences en tête : c'est l'établissement qu'on cherche quand on
  // cherche vite, et il ne doit pas dépendre de l'ordre alphabétique.
  services.sort((a, b) => Number(b.urgences) - Number(a.urgences));

  const sru = enCache(cacheSru, c.dep, `dep/${c.dep}-sru.json`);

  const risq = enCache(cacheRisques, c.dep, `dep/${c.dep}-risques.json`);
  const fr = risq?.c[c.code];

  const adjointsDep = enCache(cacheConseils, c.dep, `dep/${c.dep}-conseils.json`);
  return {
    commune: c,
    structures,
    verdicts,
    reserve: (comp) => m.reserves?.[comp] ?? null,
    maire: brutMaire
      ? { prenom: brutMaire[0], nom: brutMaire[1], depuis: brutMaire[2], maj: elus!.maj }
      : null,
    adjoints: (adjointsDep?.c[c.code]?.a ?? []).map(([fonction, prenom, nom, depuis]) => ({ fonction, prenom, nom, depuis })),
    adjointsMaj: adjointsDep?.maj ?? null,
    services,
    voisines: servs?.v?.[c.code] ?? {},
    sdis: servs?.sdis ?? m.services?.sdis?.[c.dep] ?? null,
    servicesMaj: servs?.maj ?? null,
    risques:
      risq && fr
        ? {
            recenses: fr.ddrm
              .map(([i, sous]) => ({
                nom: risq.risques[i] ?? '',
                sous: sous.map((j) => risq.risques[j] ?? '').filter(Boolean),
              }))
              .filter((r) => r.nom),
            catnat: fr.catnat.map(([i, n, date]) => ({
              nom: risq.jo[i] ?? '',
              nombre: n,
              dernier: date,
            })),
            plans: fr.ppr.map((p) => ({
              nom: p.nom || risq.modeles[p.m] || '',
              etat: risq.etats[p.e] ?? '',
              date: p.date,
            })),
            dicrim: fr.dicrim ?? null,
            maj: risq.maj,
          }
        : null,
    soumiseSru: !!sru?.c[c.code],
    conseil: assemblerConseil(c, structures),
    urbanisme: assemblerUrbanisme(c, structures),
    logements: assemblerLogements(c),
    fiscalite: assemblerFiscalite(c),
    equipements: assemblerEquipements(c),
    maj: dep.maj,
  };
}

/**
 * Les natures dont le conseil est élu au suffrage fléché. Un syndicat n'en est
 * pas : ses délégués sont désignés par les conseils municipaux, et parler de
 * sièges à son propos serait faux.
 */
const FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'SAN', 'EPT']);

/**
 * Le pendant, à la construction de la page, de ce que fait le panneau.
 *
 * Le SIREN du porteur est résolu sur les groupements de la commune, et rien
 * n'est nommé quand il n'y figure pas : un plan porté par une structure à
 * laquelle la commune n'adhère pas directement existe, et lui inventer un nom
 * serait pire que se taire.
 */
function assemblerUrbanisme(
  c: CommuneIndex,
  structures: { siren: string; nom: string; nature: string }[],
): Fiche['urbanisme'] {
  const u = enCache(cacheUrbanisme, c.dep, `dep/${c.dep}-urbanisme.json`);
  const f = u?.c[c.code];
  if (!u || !f) return null;
  const document = u.documents[f.d];
  if (!document) return null;
  const v = enCache(cachePlu, c.dep, `dep/${c.dep}-plu.json`)?.c[c.code]?.a;
  return {
    document,
    approuve: f.a,
    qui: f.i === 1 ? 'groupement' : f.i === 2 ? 'transferee' : 'commune',
    porteur: (f.s && structures.find((s) => s.siren === f.s)?.nom) || null,
    enCours:
      f.e === -1 || !u.documents[f.e] ? null : { document: u.documents[f.e], prescrit: f.p },
    sansDocumentPartout: u.sansDocument,
    intercommunalesPartout: u.intercommunales,
    totalPartout: u.total,
    jusquau: u.jusquau,
    maj: u.maj,
    geoportail: v ? { type: v.t, date: v.d, communes: v.n, reglement: v.r } : null,
  };
}

/**
 * Ce qu'on trouve sur place, rangé par domaine, et ce qui manque — l'absence
 * étant ici l'information qu'aucune liste de présences ne donne. La page en
 * donnait les huit plus nombreux quand le panneau donnait tout ; elle donne
 * tout désormais, puisqu'elle est seule à le dire.
 */
function assemblerEquipements(c: CommuneIndex): Fiche['equipements'] {
  const d = enCache(cacheEquipements, c.dep, `dep/${c.dep}-equipements.json`);
  const f = d?.c[c.code];
  if (!d || !f || f.length === 0) return null;
  const presence = new Set(f.map(([i]) => i));
  return {
    millesime: d.millesime,
    // Par regroupement, jamais par type : une école primaire ne laisse pas
    // « manquer » la maternelle et l'élémentaire.
    proximite: d.groupes.filter(
      ([, gamme, membres]) => gamme === 0 && membres.some((i) => presence.has(i)),
    ).length,
    proximiteTotal: d.nombreProximite,
    medianeProximite: d.medianeProximite,
    presents: (() => {
      const parDomaine = new Map<string, { nom: string; nombre: number }[]>();
      for (const [i, n] of f) {
        const t = d.types[i];
        if (!t) continue;
        const ou = t[2] || 'Autres';
        if (!parDomaine.has(ou)) parDomaine.set(ou, []);
        parDomaine.get(ou)!.push({ nom: t[0], nombre: n });
      }
      for (const liste of parDomaine.values()) liste.sort((a, b) => b.nombre - a.nombre);
      return [...parDomaine]
        .map(([ou, liste]) => ({ ou, liste }))
        .sort((a, b) => b.liste.length - a.liste.length || a.ou.localeCompare(b.ou));
    })(),
    absents: d.groupes
      .filter(([, gamme, membres]) => gamme === 0 && !membres.some((i) => presence.has(i)))
      .map(([nom]) => nom),
    maj: d.maj,
  };
}

function assemblerFiscalite(c: CommuneIndex): Fiche['fiscalite'] {
  const d = enCache(cacheFiscalite, c.dep, `dep/${c.dep}-fiscalite.json`);
  const f = d?.c[c.code];
  if (!d || !f) return null;
  const [fb, thCommune, thAutres, majoration, omTaux, omQui, cfeCom, cfeGrp, fnbCom, fnbGrp] = f;
  const total = (v: number[]) => Number(v.reduce((s, x) => s + x, 0).toFixed(2));
  return {
    millesime: d.millesime,
    fbTotal: total(fb),
    fb: fb
      .map((taux, i) => ({ nom: d.percepteurs[i] ?? '', taux }))
      .filter((x) => x.taux > 0 && x.nom),
    medianeFb: d.medianeFb,
    thCommune,
    thTotal: total([thCommune, thAutres]),
    majoration,
    omTaux,
    omQui: d.teom[omQui] ?? '',
    medianeOm: d.medianeOm,
    cfeCommune: cfeCom,
    cfeGroupement: cfeGrp,
    fnbTotal: total([fnbCom, fnbGrp]),
    maj: d.maj,
  };
}

function assemblerLogements(c: CommuneIndex): Fiche['logements'] {
  const d = enCache(cacheLogements, c.dep, `dep/${c.dep}-logements.json`);
  const f = d?.c[c.code];
  if (!d || !f) return null;
  const [parAnnee, commences, individuels] = f;
  const autorises = parAnnee.reduce((s, x) => s + x, 0);
  return {
    annees: d.annees,
    parAnnee,
    autorises,
    commences,
    individuels,
    taux: c.population > 0 ? (autorises / c.population) * 1000 : 0,
    medianeTaux: d.mediane,
    arrete: d.arrete,
    maj: d.maj,
  };
}

function assemblerConseil(
  c: CommuneIndex,
  structures: { siren: string; nom: string; nature: string }[],
): Fiche['conseil'] {
  const e = enCache(cacheElections, c.dep, `dep/${c.dep}-elections.json`);
  const f = e?.c[c.code];
  if (!e || !f) return null;
  const conseil = structures.find((st) => FISCALITE_PROPRE.has(st.nature));
  // Le nombre de représentants au conseil communautaire vient des seuls
  // résultats du scrutin. Le répertoire des élus n'en fait pas foi : il ne
  // distingue pas titulaires et suppléants, et ses effectifs se contredisent
  // — à Vichy Communauté, deux conseillers pour Bost (183 habitants), un seul
  // pour Vendat (2 292), aucun pour Molles. Sous mille habitants, le site dit
  // comment les représentants sont désignés, pas combien ils sont.
  const k = enCache(cacheConseils, c.dep, `dep/${c.dep}-conseils.json`);
  const comp = k?.c[c.code];
  return {
    sieges: f.cm,
    siegesCc: f.cc,
    ou: conseil?.nom ?? null,
    elus: comp?.n ?? 0,
    femmes: comp?.f ?? 0,
    ageMedian: comp?.age[1] ?? 0,
    ageMin: comp?.age[0] ?? 0,
    ageMax: comp?.age[2] ?? 0,
    groupes: (comp?.p ?? [])
      .map(([i, n]) => ({ nom: k?.groupes[i] ?? '', nombre: n }))
      .filter((g) => g.nom),
    femmesPartout: k?.femmes ?? 0,
    agePartout: k?.age ?? 0,
    designes: f.cc === 0 && !!conseil,
    scrutin: e.scrutin,
    maj: k?.maj ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * L'intercommunalité à fiscalité propre : une page chacune.
 * ------------------------------------------------------------------ */

export interface Intercommunalite {
  siren: string;
  nom: string;
  nature: string;
  natureLibelle: string;
  /** Ses communes, de la plus peuplée à la moins peuplée. */
  communes: CommuneIndex[];
  population: number;
  /** Les départements de ses communes : une intercommunalité sur douze environ en couvre plusieurs. */
  deps: string[];
  /**
   * Les compétences de Rouages que ses communes lui ont transférées, d'après
   * BANATIC — et, pour chacune, si la loi l'impose à sa nature juridique.
   */
  competences: { id: string; parLoi: boolean }[];
  maj: string;
}

let toutesIntercos: Map<string, Intercommunalite> | undefined;

/**
 * Toutes les intercommunalités à fiscalité propre, lues une fois dans les
 * fichiers de structure de chaque département. Une intercommunalité à cheval
 * sur deux départements figure dans les deux fichiers : ses communes sont
 * réunies ici, et ses compétences, identiques d'un fichier à l'autre, prises
 * une fois.
 */
function intercosParSiren(): Map<string, Intercommunalite> {
  if (toutesIntercos) return toutesIntercos;
  const out = new Map<string, Intercommunalite>();
  const m = metaTerritoires();
  const toutes = communes();
  const parCode = new Map(toutes.map((c) => [c.code, c]));
  for (const dep of new Set(toutes.map((c) => c.dep))) {
    const d = enCache(cacheDep, dep, `dep/${dep}.json`);
    if (!m || !d) continue;
    const ici = new Map<number, Intercommunalite>();
    for (const [i, [siren, nom, nature, codes]] of d.g.entries()) {
      if (!FISCALITE_PROPRE.has(nature)) continue;
      let e = out.get(siren);
      if (!e) {
        const ids = [...new Set(codes.flatMap((k) => m.codes[k] ?? []))].sort();
        e = {
          siren,
          nom,
          nature,
          natureLibelle: m.natures[nature] ?? nature,
          communes: [],
          population: 0,
          deps: [],
          competences: ids.map((id) => ({ id, parLoi: (m.obligatoires?.[id] ?? []).includes(nature) })),
          maj: d.maj,
        };
        out.set(siren, e);
      }
      ici.set(i, e);
    }
    for (const [code, , , groupes] of d.c) {
      const c = parCode.get(code);
      if (!c) continue;
      for (const i of groupes) {
        const e = ici.get(i);
        if (!e || e.communes.some((x) => x.code === code)) continue;
        e.communes.push(c);
        e.population += c.population;
        if (!e.deps.includes(dep)) e.deps.push(dep);
      }
    }
  }
  for (const e of out.values()) {
    e.communes.sort((a, b) => b.population - a.population || a.nom.localeCompare(b.nom, 'fr'));
    e.deps.sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }
  // Une structure sans commune dans l'index — dissoute depuis, ou mal
  // rattachée — n'aurait qu'une page vide.
  for (const [siren, e] of out) if (e.communes.length === 0) out.delete(siren);
  toutesIntercos = out;
  return out;
}

/** Les intercommunalités qui ont au moins une commune dans les départements retenus, ou toutes. */
export function intercommunalites(filtre?: string[]): Intercommunalite[] {
  const toutes = [...intercosParSiren().values()];
  if (!filtre || filtre.length === 0) return toutes;
  return toutes.filter((e) => e.deps.some((d) => filtre.includes(d)));
}

export function intercommunalite(siren: string): Intercommunalite | null {
  return intercosParSiren().get(siren) ?? null;
}

export function lienIntercommunalite(siren: string): string {
  return `/intercommunalite/${siren}`;
}
