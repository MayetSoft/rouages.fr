/**
 * Les délibérations publiées en données ouvertes.
 *
 * C'est ici que se décide ce que le reste du site décrit : une compétence
 * transférée l'a été par une délibération, un budget voté l'est en séance, un
 * marché est autorisé par une autorisation de signature. Le site montrait le
 * résultat sans jamais montrer l'acte.
 *
 * **La couverture est partielle, et le site le dit plutôt que de le masquer.**
 * Il n'existe aucune consolidation nationale : l'ordonnance n° 2021-1310
 * impose depuis le 1er juillet 2022 de publier les actes en ligne, mais sur le
 * site de la collectivité — elle n'a créé aucun dépôt central, et l'open data
 * reste facultatif. Une collectivité absente d'ici n'est donc pas une
 * collectivité qui ne délibère pas : c'est une collectivité qui ne verse pas
 * ses délibérations en données ouvertes. Le bloc n'apparaît que là où il y a
 * quelque chose, et ne vaut jamais zéro.
 *
 * Deux robinets alimentent le collecteur :
 *
 *   — **la découverte**, par l'attribut de schéma que data.gouv expose. Tout
 *     jeu déclaré conforme au SCDL « délibérations » est ingéré sans qu'on ait
 *     à le connaître, et la couverture grossit d'elle-même ;
 *   — **une liste déclarée**, pour les agrégateurs qui publient au schéma sans
 *     le déclarer sur leurs ressources. Mégalis Bretagne est le plus gros à ce
 *     jour — 1 932 collectivités — et la découverte seule le manquerait.
 *
 * **Ce qui n'est pas corrigé : les apostrophes manquantes.** Un producteur les
 * retire de ses intitulés — « en application de larticle L2122-22 », « demande
 * dinscription ». C'est un défaut de la source, pas du décodage, et le
 * réparer demanderait de distinguer « larticle » de « larve », donc un
 * dictionnaire. Le site rend l'intitulé tel qu'il a été publié, comme il rend
 * les majuscules sans accents des marchés publics : corriger serait réécrire.
 *
 * **Ce qui est écarté : les délibérations dont l'objet nomme quelqu'un.** Un
 * objet sur trois cents en porte une — « Cession de la parcelle AC 0151 à
 * Madame X », « aide sociale à M. Y » — et ce sont précisément celles qui
 * statuent sur le cas d'une personne. Le filtre réutilise le motif qui interdit
 * déjà un nom dans `contenu/` (`src/modele/civilites.ts`), et il est grossier :
 * un nom sans civilité lui échappe. Il ne dispense pas de la précaution qui
 * vaut pour tout le bloc — le site **relaie un intitulé et un lien**, jamais le
 * document, qui reste chez la collectivité qui l'a publié.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { debutFenetre, GENRES, type Evenement } from '../src/modele/journal.ts';
import { lireCsvOuvert, ressourcesDuJeu, ressourcesDuSchema } from './donnees-ouvertes.ts';

/**
 * Les neuf familles de la nomenclature ACTES, celle que les collectivités
 * emploient pour classer leurs actes auprès du contrôle de légalité.
 *
 * Le code fait foi, pas le libellé : un producteur écrit « Finances locales »,
 * un autre « finances locales », un troisième abrège. Le premier chiffre du
 * code, lui, ne bouge pas.
 */
export const FAMILLES_ACTES = [
  'Commande publique',
  'Urbanisme',
  'Domaine et patrimoine',
  'Fonction publique',
  'Institutions et vie politique',
  'Libertés publiques et pouvoirs de police',
  'Finances locales',
  'Domaines de compétences par thèmes',
  'Autres domaines de compétences',
] as const;

/**
 * Les agrégateurs qui publient au schéma sans le déclarer sur leurs
 * ressources. Sans cette liste, la découverte les manquerait — et avec eux la
 * quasi-totalité du volume.
 *
 * On les nomme par leur jeu de données, jamais par l'adresse de leurs
 * fichiers : Mégalis republie chaque jour sous un chemin horodaté, et une
 * adresse recopiée la veille rend déjà 404 (voir `ressourcesDuJeu`).
 */
const DECLARES = [
  { jeu: 'deliberations-des-organismes-adherents-de-megalis-bretagne', motif: 'deliberation-' },
  // Les communes et intercommunalités partenaires de Haute-Garonne Open Data,
  // en un fichier : au schéma, en-têtes en minuscules.
  { jeu: 'donnees-deliberations-partenaires-agregees-1', motif: 'deliberations-partenaires-agregees.csv' },
];

/**
 * Le schéma écrit ses colonnes en majuscules, certains portails les rendent
 * en minuscules ; et une date se trouve parfois écrite jj/mm/aaaa.
 */
function normaliser(l: Record<string, string>): Record<string, string> {
  const n: Record<string, string> = {};
  for (const [k, v] of Object.entries(l)) n[k.toUpperCase()] = v;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(n['DELIB_DATE'] ?? '');
  if (fr) n['DELIB_DATE'] = `${fr[3]}-${fr[2]}-${fr[1]}`;
  return n;
}

/** Combien de délibérations le fichier du département porte, par collectivité. */
const PAR_COLLECTIVITE = 5;

/** Au-delà, l'intitulé cesse d'informer et pèse sur chaque ligne. */
const MAX_OBJET = 130;

export interface Deliberation {
  date: string;
  /** Index dans `FAMILLES_ACTES`, ou -1 quand le code est absent ou illisible. */
  famille: number;
  objet: string;
  /** L'acte lui-même, chez la collectivité qui l'a publié. */
  url: string;
}

export interface Deliberations {
  maj: string;
  /** L'exercice le plus ancien rencontré : le bloc dit depuis quand il voit. */
  depuis: string;
  /** SIREN -> ses délibérations les plus récentes. */
  parCollectivite: Map<string, Deliberation[]>;
  /** SIREN -> nombre total, avant troncature. */
  totaux: Map<string, number>;
  /** SIREN -> nombre par famille d'actes. */
  parFamille: Map<string, number[]>;
  /** Combien de collectivités publient, tous échelons confondus. */
  collectivites: number;
  /** Combien d'objets ont été écartés parce qu'ils nommaient quelqu'un. */
  ecartees: number;
  /** Les délibérations des derniers mois, pour le journal. */
  evenements: Evenement[];
}

export async function collecterDeliberations(
  octetsDe: (url: string) => Promise<Uint8Array>,
  json: <T>(url: string) => Promise<T>,
  /**
   * Ce que le site sait rattacher. Un prédicat plutôt qu'un ensemble : les
   * départements et les régions se reconnaissent à un préfixe de SIREN, pas à
   * une liste qu'il faudrait dresser à l'avance.
   */
  estSuivi: (siren: string) => boolean,
  dire: (m: string) => void,
): Promise<Deliberations | null> {
  const decouvertes = await ressourcesDuSchema('deliberations', json, dire);
  const declarees: string[] = [];
  for (const d of DECLARES) declarees.push(...(await ressourcesDuJeu(d.jeu, d.motif, json, dire)));
  const sources = [...new Set([...declarees, ...decouvertes])];
  dire(
    `Délibérations : ${sources.length} fichiers (${declarees.length} déclarés, ` +
      `${decouvertes.length} découverts par le schéma).`,
  );

  const debutJournal = debutFenetre();
  const evenements: Evenement[] = [];
  const GENRE = GENRES.indexOf('Délibération');

  const brut = new Map<string, Map<string, Deliberation>>();
  const totaux = new Map<string, number>();
  const parFamille = new Map<string, number[]>();
  let ecartees = 0;
  let depuis = '9999';
  let lus = 0;
  let echecs = 0;

  for (const url of sources) {
    let lignes: Record<string, string>[];
    try {
      lignes = lireCsvOuvert(await octetsDe(url));
    } catch {
      echecs++;
      continue;
    }
    for (const brute of lignes) {
      const l = normaliser(brute);
      const siren = (l['COLL_SIRET'] ?? '').replace(/\s/g, '').slice(0, 9);
      if (siren.length !== 9 || !estSuivi(siren)) continue;
      const objet = (l['DELIB_OBJET'] ?? '').trim();
      const date = (l['DELIB_DATE'] ?? '').slice(0, 10);
      if (!objet || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      // Celles qui statuent sur le cas d'une personne restent chez la
      // collectivité : le site n'a pas à les relayer ni à les indexer.
      if (nommeUnePersonne(objet)) {
        ecartees++;
        continue;
      }
      lus++;
      if (date < depuis) depuis = date;

      const code = (l['DELIB_MATIERE_CODE'] ?? '').trim();
      const rang = Number.parseInt(code.split('.')[0] ?? '', 10);
      const famille = Number.isFinite(rang) && rang >= 1 && rang <= 9 ? rang - 1 : -1;

      let m = brut.get(siren);
      if (!m) {
        m = new Map();
        brut.set(siren, m);
      }
      // L'identifiant de la délibération quand il existe, sinon la date et
      // l'objet : un même acte est parfois republié d'un millésime à l'autre.
      const cle = (l['DELIB_ID'] ?? '').trim() || `${date}|${objet}`;
      if (m.has(cle)) continue;
      const tronque = objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet;
      const url = (l['DELIB_URL'] ?? '').trim();
      m.set(cle, { date, famille, objet: tronque, url });
      // Ici plutôt qu'en tête de boucle : la carte de déduplication vient de
      // l'accepter, donc un acte republié d'un millésime à l'autre n'entre pas
      // deux fois dans le journal.
      if (date >= debutJournal) {
        evenements.push({
          genre: GENRE,
          date,
          quoi: tronque,
          detail: famille >= 0 ? FAMILLES_ACTES[famille] : undefined,
          url: url || undefined,
          siren,
        });
      }
      totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
      if (famille >= 0) {
        let f = parFamille.get(siren);
        if (!f) {
          f = new Array<number>(FAMILLES_ACTES.length).fill(0);
          parFamille.set(siren, f);
        }
        f[famille]++;
      }
    }
  }

  if (brut.size === 0) {
    dire('Délibérations : aucune collectivité rattachée, rien à écrire.');
    return null;
  }

  const parCollectivite = new Map<string, Deliberation[]>();
  for (const [siren, m] of brut) {
    parCollectivite.set(
      siren,
      [...m.values()]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, PAR_COLLECTIVITE),
    );
  }

  dire(
    `Délibérations : ${lus.toLocaleString('fr-FR')} retenues depuis ${depuis.slice(0, 4)} pour ` +
      `${brut.size.toLocaleString('fr-FR')} collectivités` +
      (ecartees > 0 ? `, ${ecartees.toLocaleString('fr-FR')} écartées (objet nommant une personne)` : '') +
      (echecs > 0 ? `, ${echecs} fichier(s) injoignable(s)` : '') +
      '.',
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    depuis,
    parCollectivite,
    totaux,
    parFamille,
    collectivites: brut.size,
    ecartees,
    evenements,
  };
}

/**
 * Un fichier par département, indexé par SIREN — comme les marchés, et pour la
 * même raison : c'est le client qui sait de quelles structures dépend une
 * commune, et le fichier n'a pas à le redire.
 */
export function ecrireDeliberations(
  sortie: string,
  dep: string,
  sirens: string[],
  sirenDeCommune: Map<string, string>,
  d: Deliberations,
  /**
   * Le SIREN du département puis celui de sa région, quand ils publient. Le
   * client n'a aucun moyen de les deviner : ils ne sont ni dans le découpage
   * ni dans BANATIC, et c'est ici qu'on les lui nomme.
   */
  echelons: string[] = [],
): number {
  const h: Record<string, { n: number; f: number[]; d: Deliberation[] }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = d.parCollectivite.get(siren);
    if (!liste || liste.length === 0) continue;
    h[siren] = {
      n: d.totaux.get(siren) ?? liste.length,
      f: d.parFamille.get(siren) ?? [],
      d: liste,
    };
    n++;
  }
  if (n === 0) return 0;
  const com: Record<string, string> = {};
  for (const [code, siren] of [...sirenDeCommune].sort()) {
    if (h[siren]) com[code] = siren;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-deliberations.json`),
    JSON.stringify({
      maj: d.maj,
      depuis: d.depuis,
      familles: FAMILLES_ACTES,
      com,
      echelons: echelons.filter((x) => h[x]),
      h,
    }),
  );
  return n;
}
