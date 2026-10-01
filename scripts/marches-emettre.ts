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
 * **Qui en est titulaire.** Le jeu donne le SIRET du titulaire ; le nom vient
 * du répertoire SIRENE, lu par lots de SIRET. La règle des noms
 * (`CLAUDE.md`) s'applique, et `docs/07-risques.md` la justifie pour ce
 * cas : la commande publique est publiée pour que chacun sache qui a obtenu
 * quoi. Un entrepreneur individuel en diffusion partielle n'est pas nommé — le
 * répertoire masque déjà son identité —, ni celui qui s'y est opposé
 * (`oppositions.ts`). Chaque nom renvoie à sa fiche de l'annuaire des
 * entreprises de l'État.
 *
 * Lancé seul — `npx tsx scripts/marches-emettre.ts` —, il réécrit les
 * fichiers des acheteurs que la dernière ingestion complète a retenus.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { telechargerSiAbsent } from './par-departement.ts';
import { SIREN_OPPOSES } from './oppositions.ts';

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

/**
 * Les échéances qu'un acheteur porte dans le fichier du département : les plus
 * proches. Autant que la page en affiche au plus, toutes structures confondues
 * — ainsi les douze premières de la page sont exactes même quand un seul
 * acheteur les fournit toutes.
 */
export const ECHEANCES = 12;

/** La fenêtre des échéances, en mois à partir de celui de l'ingestion. */
const FENETRE_MOIS = 12;

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
  /** Jusqu'à trois titulaires — un groupement d'entreprises en a plusieurs. */
  titulaire_id_1: string | null;
  titulaire_typeidentifiant_1: string | null;
  titulaire_id_2: string | null;
  titulaire_typeidentifiant_2: string | null;
  titulaire_id_3: string | null;
  titulaire_typeidentifiant_3: string | null;
}

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
  /**
   * SIREN des titulaires nommés, trois au plus. Le nom est dans le
   * dictionnaire `t` du fichier : un même titulaire revient des centaines de
   * fois, et le répéter pèserait plus lourd que tout le reste.
   */
  t?: string[];
  /** Nombre de titulaires distincts, quand il dépasse ceux qui sont nommés. */
  tn?: number;
}

/** Un marché dont l'échéance prévisible tombe dans la fenêtre. */
export interface Echeance extends Marche {
  /** Mois d'échéance prévisible (AAAA-MM) : notification plus durée initiale. */
  fin: string;
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
  /** Premier et dernier mois de la fenêtre des échéances (AAAA-MM), bornes comprises. */
  fenetre: [string, string];
  /**
   * SIREN -> le SIRET sous lequel l'acheteur a notifié le plus de marchés. Un
   * groupement achète parfois sous plusieurs établissements ; c'est par ce
   * SIRET que d'autres outils, comme Colibre, désignent l'acheteur.
   */
  sirets: Map<string, string>;
  /** SIREN d'un titulaire -> son nom, tel que le répertoire SIRENE le publie. */
  titulaires: Map<string, string>;
  /** Date de la copie du répertoire SIRENE qui a donné les noms (AAAA-MM-JJ), ou null. */
  sireneMaj: string | null;
  depuis: string;
  maj: string;
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

const SIRENE =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3';

/** Une unité légale telle que la copie de SIRENE la décrit, champs utiles seulement. */
interface UniteSirene {
  siret: string;
  siren: string;
  statutdiffusionunitelegale: string | null;
  categoriejuridiqueunitelegale: string | null;
  denominationunitelegale: string | null;
  denominationusuelle1unitelegale: string | null;
  sigleunitelegale: string | null;
  nomunitelegale: string | null;
  nomusageunitelegale: string | null;
  prenomusuelunitelegale: string | null;
  prenom1unitelegale: string | null;
}

/**
 * Le nom sous lequel le répertoire publie une unité légale, ou null s'il n'en
 * publie pas.
 *
 * Une société : sa dénomination. Un entrepreneur individuel (catégorie 1000) :
 * le nom sous lequel il exerce s'il en a déclaré un, sinon son prénom et son
 * nom — c'est sous ce nom que le répertoire le publie, et c'est ce que permet
 * la règle des noms. En diffusion partielle, rien : le répertoire écrit
 * « [ND] » à la place de l'identité, et c'est la volonté de la personne.
 */
export function nomPublie(u: UniteSirene): string | null {
  if (u.statutdiffusionunitelegale !== 'O') return null;
  const lu = (v: string | null) => (v && v.trim() && v.trim() !== '[ND]' ? v.trim() : null);
  if (u.categoriejuridiqueunitelegale === '1000') {
    const enseigne = lu(u.denominationusuelle1unitelegale);
    if (enseigne) return enseigne;
    const nom = lu(u.nomusageunitelegale) ?? lu(u.nomunitelegale);
    const prenom = lu(u.prenomusuelunitelegale) ?? lu(u.prenom1unitelegale);
    return nom ? (prenom ? `${prenom} ${nom}` : nom) : null;
  }
  return lu(u.denominationunitelegale) ?? lu(u.denominationusuelle1unitelegale) ?? lu(u.sigleunitelegale);
}

/** Les SIRET de titulaires d'une ligne : seulement ceux qui en sont. */
function siretsTitulaires(l: LigneDecp): string[] {
  const out: string[] = [];
  for (const [id, type] of [
    [l.titulaire_id_1, l.titulaire_typeidentifiant_1],
    [l.titulaire_id_2, l.titulaire_typeidentifiant_2],
    [l.titulaire_id_3, l.titulaire_typeidentifiant_3],
  ] as const) {
    const siret = String(id ?? '').replace(/\s/g, '');
    if (type === 'SIRET' && /^\d{14}$/.test(siret)) out.push(siret);
  }
  return out;
}

/**
 * Les noms des titulaires, lus dans la copie de SIRENE par lots de SIRET.
 *
 * Par SIRET plutôt que par SIREN : c'est ce que le jeu des marchés donne, et
 * la copie est indexée par établissement. Fermés compris — un titulaire de
 * 2023 a pu cesser depuis, il reste celui qui a obtenu le marché. Six lots à
 * la fois, cent cinquante SIRET par lot : l'adresse reste sous les cinq mille
 * caractères.
 */
async function nommerTitulaires(
  json: <T>(url: string) => Promise<T>,
  sirets: string[],
  dire: (m: string) => void,
): Promise<{ noms: Map<string, string>; sireneMaj: string | null }> {
  const noms = new Map<string, string>();
  const LOT = 150;
  const champs = [
    'siret', 'siren', 'statutdiffusionunitelegale', 'categoriejuridiqueunitelegale',
    'denominationunitelegale', 'denominationusuelle1unitelegale', 'sigleunitelegale',
    'nomunitelegale', 'nomusageunitelegale', 'prenomusuelunitelegale', 'prenom1unitelegale',
  ].join(',');
  const lots: string[][] = [];
  for (let i = 0; i < sirets.length; i += LOT) lots.push(sirets.slice(i, i + LOT));
  let trouves = 0;
  let masques = 0;
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < lots.length) {
      const lot = lots[suivant++];
      const filtre = `siret in (${lot.map((x) => `"${x}"`).join(',')})`;
      const lignes = await json<UniteSirene[]>(
        `${SIRENE}/exports/json?select=${champs}&where=${encodeURIComponent(filtre)}`,
      );
      for (const u of lignes) {
        trouves++;
        const nom = SIREN_OPPOSES.has(u.siren) ? null : nomPublie(u);
        if (nom) noms.set(u.siren, nom);
        else masques++;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, ouvrier));
  const meta = await json<{ metas?: { default?: { data_processed?: string } } }>(SIRENE).catch(() => null);
  dire(
    `  titulaires : ${sirets.length.toLocaleString('fr-FR')} SIRET, ${trouves.toLocaleString('fr-FR')} ` +
      `trouvés dans SIRENE, ${noms.size.toLocaleString('fr-FR')} unités nommées, ` +
      `${masques.toLocaleString('fr-FR')} établissements sans nom publiable.`,
  );
  return { noms, sireneMaj: meta?.metas?.default?.data_processed?.slice(0, 10) ?? null };
}

export async function collecterMarches(
  json: <T>(url: string) => Promise<T>,
  sirensSuivis: Set<string>,
  dire: (m: string) => void,
): Promise<Marches | null> {
  const url =
    `${DECP}/exports/json?select=acheteur_id,objet,montant,datenotification,procedure,dureemois,offresrecues,codecpv,techniques,` +
    `titulaire_id_1,titulaire_typeidentifiant_1,titulaire_id_2,titulaire_typeidentifiant_2,` +
    `titulaire_id_3,titulaire_typeidentifiant_3` +
    `&where=${encodeURIComponent(`datenotification>=date'${DEPUIS}'`)}`;
  const lignes = await json<LigneDecp[]>(url);
  if (lignes.length === 0) {
    dire('Marchés publics : aucune ligne, le jeu a changé de forme.');
    return null;
  }

  // Regroupées avant d'être comptées : un accord-cadre multi-attributaires
  // publie une ligne par lot, avec le même objet, le même montant et la même
  // date. Les afficher sept fois ferait passer une commande pour sept.
  const brut = new Map<string, Map<string, Echeance | Marche>>();
  const totaux = new Map<string, number>();
  const parSiret = new Map<string, Map<string, number>>();
  const inconnues = new Set<string>();
  // Les SIRET des titulaires de chaque marché regroupé : un accord-cadre
  // multi-attributaires en a un par lot.
  const titulairesDe = new Map<Marche, Set<string>>();
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
    const vu = m.get(cle);
    if (vu) {
      vu.lots++;
      for (const x of siretsTitulaires(l)) titulairesDe.get(vu)?.add(x);
    } else {
      // −1 quand le libellé n'est pas dans la liste : le client n'affichera
      // alors pas de procédure, plutôt que d'en inventer une.
      const proc = PROCEDURES.indexOf((l.procedure ?? '').trim() as (typeof PROCEDURES)[number]);
      if (proc === -1 && (l.procedure ?? '').trim()) inconnues.add((l.procedure ?? '').trim());
      const duree = entierPositif(l.dureemois);
      const offres = entierPositif(l.offresrecues);
      const nouveau: Echeance | Marche = {
        objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
        // Arrondi à l'euro : les centimes d'un marché de 489 025,50 € ne
        // changent rien à ce qu'on en comprend, et pèsent sur chaque ligne.
        montant:
          typeof l.montant === 'number' && Number.isFinite(l.montant) ? Math.round(l.montant) : null,
        date,
        procedure: proc,
        lots: 1,
        ...(offres ? { offres } : {}),
        ...(duree && serenouvelle(l.codecpv, l.techniques, duree) ? { fin: ajouterMois(date, duree) } : {}),
      };
      m.set(cle, nouveau);
      titulairesDe.set(nouveau, new Set(siretsTitulaires(l)));
    }
    totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
  }

  // Les noms, puis chaque marché reçoit les SIREN de ceux qu'on peut nommer.
  // Si SIRENE ne répond pas, les marchés partent sans titulaire plutôt que
  // de ne pas partir.
  const tousSirets = [...new Set([...titulairesDe.values()].flatMap((x) => [...x]))].sort();
  const { noms: titulaires, sireneMaj } = await nommerTitulaires(json, tousSirets, dire).catch((e) => {
    dire(`  titulaires : SIRENE n'a pas répondu (${e instanceof Error ? e.message : e}), aucun nom.`);
    return { noms: new Map<string, string>(), sireneMaj: null };
  });
  for (const [marche, sirets] of titulairesDe) {
    const sirens = [...new Set([...sirets].map((x) => x.slice(0, 9)))];
    const nommes = sirens.filter((x) => titulaires.has(x)).slice(0, 3);
    if (nommes.length > 0) marche.t = nommes;
    if (sirens.length > nommes.length && nommes.length > 0) marche.tn = sirens.length;
  }

  const maj = new Date().toISOString().slice(0, 10);
  const fenetre: [string, string] = [ajouterMois(maj, 0), ajouterMois(maj, FENETRE_MOIS - 1)];
  const parAcheteur = new Map<string, Marche[]>();
  const suites = new Map<string, Marche[]>();
  const echeances = new Map<string, Echeance[]>();
  let nEcheances = 0;
  for (const [siren, m] of brut) {
    const tout = [...m.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.montant ?? 0) - (a.montant ?? 0),
    );
    // L'échéance ne voyage qu'avec les échéances : la porter sur chacun des
    // 420 000 marchés alourdirait les listes pour une information qu'elles
    // n'affichent pas.
    const liste = tout.map((x): Marche => {
      if (!('fin' in x)) return x;
      const { fin: _fin, ...sans } = x;
      return sans;
    });
    parAcheteur.set(siren, liste.slice(0, PAR_ACHETEUR));
    if (liste.length > PAR_ACHETEUR) suites.set(siren, liste.slice(PAR_ACHETEUR));
    const proches = tout
      .filter((x): x is Echeance => 'fin' in x && x.fin >= fenetre[0] && x.fin <= fenetre[1])
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
      `de ${fenetre[0]} à ${fenetre[1]}.`,
  );
  const sirets = new Map<string, string>();
  for (const [siren, c] of parSiret) sirets.set(siren, [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return {
    parAcheteur,
    suites,
    totaux,
    echeances,
    fenetre,
    sirets,
    titulaires,
    sireneMaj,
    depuis: DEPUIS,
    maj,
  };
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
  const t = dictionnaireTitulaires(
    Object.values(h).flatMap((x) => [...x.m, ...(x.e ?? [])]),
    marches.titulaires,
  );
  writeFileSync(
    join(sortie, 'dep', `${dep}-marches.json`),
    JSON.stringify({
      dep,
      depuis: marches.depuis,
      maj: marches.maj,
      fenetre: marches.fenetre,
      sirene: marches.sireneMaj,
      procedures: PROCEDURES,
      com,
      h,
      t,
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
    const t = dictionnaireTitulaires(liste, marches.titulaires);
    writeFileSync(join(dossier, `${siren}.json`), JSON.stringify({ m: liste, t }));
    n++;
  }
  return n;
}

/** Les noms des seuls titulaires qu'une liste cite, triés pour un diff stable. */
function dictionnaireTitulaires(liste: Marche[], noms: Map<string, string>): Record<string, string> {
  const t: Record<string, string> = {};
  for (const siren of [...new Set(liste.flatMap((m) => m.t ?? []))].sort()) {
    const nom = noms.get(siren);
    if (nom) t[siren] = nom;
  }
  return t;
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
  const m = await collecterMarches(async (url) => (await obstine(url)).json(), suivis, console.log);
  if (m) {
    let n = 0;
    for (const [dep, d] of parDep) n += ecrireMarches(sortie, dep, d.sirens, d.com, m);
    const suites = ecrireSuitesMarches(sortie, m);
    console.log(`${n} acheteurs écrits, ${suites} listes complètes à la demande.`);
  }
}
