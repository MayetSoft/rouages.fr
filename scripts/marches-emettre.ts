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
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

interface LigneDecp {
  acheteur_id: string | null;
  objet: string | null;
  montant: number | null;
  datenotification: string | null;
  procedure: string | null;
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
  /**
   * SIREN -> le SIRET sous lequel l'acheteur a notifié le plus de marchés. Un
   * groupement achète parfois sous plusieurs établissements ; c'est par ce
   * SIRET que d'autres outils, comme Colibre, désignent l'acheteur.
   */
  sirets: Map<string, string>;
  depuis: string;
  maj: string;
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

export async function collecterMarches(
  json: <T>(url: string) => Promise<T>,
  sirensSuivis: Set<string>,
  dire: (m: string) => void,
): Promise<Marches | null> {
  const url =
    `${DECP}/exports/json?select=acheteur_id,objet,montant,datenotification,procedure` +
    `&where=${encodeURIComponent(`datenotification>=date'${DEPUIS}'`)}`;
  const lignes = await json<LigneDecp[]>(url);
  if (lignes.length === 0) {
    dire('Marchés publics : aucune ligne, le jeu a changé de forme.');
    return null;
  }

  // Regroupées avant d'être comptées : un accord-cadre multi-attributaires
  // publie une ligne par lot, avec le même objet, le même montant et la même
  // date. Les afficher sept fois ferait passer une commande pour sept.
  const brut = new Map<string, Map<string, Marche>>();
  const totaux = new Map<string, number>();
  const parSiret = new Map<string, Map<string, number>>();
  const inconnues = new Set<string>();
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
    } else {
      // −1 quand le libellé n'est pas dans la liste : le client n'affichera
      // alors pas de procédure, plutôt que d'en inventer une.
      const proc = PROCEDURES.indexOf((l.procedure ?? '').trim() as (typeof PROCEDURES)[number]);
      if (proc === -1 && (l.procedure ?? '').trim()) inconnues.add((l.procedure ?? '').trim());
      m.set(cle, {
        objet: objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
        // Arrondi à l'euro : les centimes d'un marché de 489 025,50 € ne
        // changent rien à ce qu'on en comprend, et pèsent sur chaque ligne.
        montant:
          typeof l.montant === 'number' && Number.isFinite(l.montant) ? Math.round(l.montant) : null,
        date,
        procedure: proc,
        lots: 1,
      });
    }
    totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
  }

  const parAcheteur = new Map<string, Marche[]>();
  const suites = new Map<string, Marche[]>();
  for (const [siren, m] of brut) {
    const liste = [...m.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.montant ?? 0) - (a.montant ?? 0),
    );
    parAcheteur.set(siren, liste.slice(0, PAR_ACHETEUR));
    if (liste.length > PAR_ACHETEUR) suites.set(siren, liste.slice(PAR_ACHETEUR));
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
      `acheteurs du bloc communal.`,
  );
  const sirets = new Map<string, string>();
  for (const [siren, c] of parSiret) sirets.set(siren, [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return {
    parAcheteur,
    suites,
    totaux,
    sirets,
    depuis: DEPUIS,
    maj: new Date().toISOString().slice(0, 10),
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
  const h: Record<string, { n: number; m: Marche[]; s?: string }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = marches.parAcheteur.get(siren);
    if (!liste || liste.length === 0) continue;
    const siret = marches.sirets.get(siren);
    h[siren] = { n: marches.totaux.get(siren) ?? liste.length, m: liste, ...(siret ? { s: siret } : {}) };
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
