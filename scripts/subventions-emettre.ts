/**
 * Les subventions versées aux associations.
 *
 * Le site dit où va l'argent par ses comptes et ses marchés. Il manquait le
 * troisième canal, et le plus visible dans une petite commune : ce que la
 * collectivité verse au tissu associatif — le club de foot, l'école de
 * musique, le comité des fêtes, l'aide alimentaire.
 *
 * Même mécanique que les délibérations, et pour la même raison : aucun dépôt
 * central n'existe. Le décret n° 2017-779 impose la publication des données
 * essentielles **sur le site de l'autorité qui attribue**, pas dans un
 * registre national. On ingère donc tout jeu conforme au schéma SCDL
 * « subventions », et la couverture grossit d'elle-même.
 *
 * **Aucun total n'est affiché, et cette fois la raison est dans le texte.**
 * L'obligation ne porte que sur les conventions d'un montant annuel supérieur
 * à **23 000 €**, et seulement pour les collectivités de plus de 3 500
 * habitants employant plus de cinquante agents. Certains producteurs publient
 * tout, d'autres s'en tiennent au seuil — le titre de leurs jeux le dit
 * souvent : « subventions de fonctionnement supérieures à 23 000 € ». Sommer
 * les deux donnerait un chiffre systématiquement sous-estimé, d'un facteur
 * qu'on ne connaît pas, et qui varierait d'une commune à l'autre. Le site
 * montre les lignes et dit pourquoi il ne les additionne pas.
 *
 * Deux autres choses que le collecteur refuse de faire :
 *
 *   — **rattacher un bénéficiaire à autre chose que lui-même.** Le numéro RNA
 *     du bénéficiaire est retenu quand il est là, parce qu'il identifie une
 *     association de façon stable ; rien d'autre n'en est tiré ;
 *   — **relayer une subvention versée à une personne physique.** Une bourse au
 *     permis, une aide individuelle : le même filtre que les délibérations
 *     l'écarte.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { debutFenetre, GENRES, type Evenement } from '../src/modele/journal.ts';
import { anneePlausible } from '../src/modele/annees.ts';
import { lireCsvOuvert, ressourcesDuSchema } from './donnees-ouvertes.ts';

/** Combien de subventions le fichier du département porte, par collectivité. */
const PAR_COLLECTIVITE = 6;

/** Au-delà, l'objet cesse d'informer et pèse sur chaque ligne. */
const MAX_OBJET = 110;

/** Le seuil au-dessus duquel la publication est obligatoire. */
export const SEUIL_CONVENTION = 23_000;

export interface Subvention {
  /** Le nom du bénéficiaire — une association, jamais une personne. */
  qui: string;
  /** Euros. Négatif quand la ligne corrige un rattachement d'exercice. */
  montant: number | null;
  annee: string;
  objet: string;
  /** Le numéro au répertoire national des associations, quand il est déclaré. */
  rna: string;
  /**
   * Le SIREN du bénéficiaire — les neuf premiers chiffres du SIRET que le
   * schéma déclare —, ou rien. Il sert au recoupement avec les titulaires des
   * marchés de la même collectivité.
   */
  sb?: string;
}

export interface Subventions {
  maj: string;
  /** SIREN -> ses plus grosses subventions. */
  parCollectivite: Map<string, Subvention[]>;
  /** SIREN -> nombre total publié. */
  totaux: Map<string, number>;
  /** SIREN -> le plus ancien et le plus récent exercice vus. */
  exercices: Map<string, [string, string]>;
  collectivites: number;
  ecartees: number;
  /** Les conventions des derniers mois, pour le journal. */
  evenements: Evenement[];
}

/**
 * Les montants arrivent en « 12 000,50 », « 12000.5 », parfois « 12 000,50 € ».
 * On ne garde que les chiffres, le signe et un séparateur décimal.
 */
function montantDe(brut: string): number | null {
  const net = brut
    .replace(/\s| |€/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.');
  if (net === '') return null;
  const n = Number.parseFloat(net);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Le nom des colonnes varie d'une version du schéma à l'autre — et
 * `nomBeneficiere` porte une faute d'orthographe que le schéma a figée. On
 * cherche donc par tolérance plutôt que par égalité stricte.
 */
function champ(l: Record<string, string>, ...motifs: string[]): string {
  for (const m of motifs) {
    for (const [k, v] of Object.entries(l)) {
      if (k.toLowerCase().replace(/[^a-z]/g, '').includes(m)) return v;
    }
  }
  return '';
}

/**
 * La date d'une convention, ramenée en AAAA-MM-JJ.
 *
 * Le schéma la veut en ISO ; les producteurs l'écrivent aussi à la française,
 * et parfois ils ne donnent que l'année. Le journal a besoin d'un jour : une
 * convention qu'on ne sait dater qu'à l'année n'y entre pas, plutôt que d'y
 * entrer au premier janvier.
 */
function jourDe(brut: string): string | null {
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(brut);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = /(\d{2})\/(\d{2})\/(\d{4})/.exec(brut);
  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  return null;
}

export async function collecterSubventions(
  octetsDe: (url: string) => Promise<Uint8Array>,
  json: <T>(url: string) => Promise<T>,
  /**
   * Ce que le site sait rattacher. Un prédicat plutôt qu'un ensemble : les
   * départements et les régions se reconnaissent à un préfixe de SIREN, pas à
   * une liste qu'il faudrait dresser à l'avance.
   */
  estSuivi: (siren: string) => boolean,
  dire: (m: string) => void,
): Promise<Subventions | null> {
  const sources = await ressourcesDuSchema('subventions', json, dire);
  if (sources.length === 0) {
    dire('Subventions : aucune ressource conforme au schéma.');
    return null;
  }
  dire(`Subventions : ${sources.length} fichiers découverts par le schéma.`);

  const debutJournal = debutFenetre();
  const evenements: Evenement[] = [];
  const GENRE = GENRES.indexOf('Subvention votée');

  const brut = new Map<string, Map<string, Subvention>>();
  const totaux = new Map<string, number>();
  const exercices = new Map<string, [string, string]>();
  let ecartees = 0;
  let echecs = 0;

  for (const url of sources) {
    let lignes: Record<string, string>[];
    try {
      lignes = lireCsvOuvert(await octetsDe(url), 5);
    } catch {
      echecs++;
      continue;
    }
    for (const l of lignes) {
      const siren = champ(l, 'idattribuant').replace(/\s/g, '').slice(0, 9);
      if (siren.length !== 9 || !estSuivi(siren)) continue;
      const qui = champ(l, 'nombeneficier', 'nombeneficiaire').trim();
      if (!qui) continue;
      // Une aide individuelle n'a pas à être relayée : c'est la situation
      // d'une personne, pas le fonctionnement d'une institution.
      if (nommeUnePersonne(qui)) {
        ecartees++;
        continue;
      }
      const objet = champ(l, 'objet').trim();
      const montant = montantDe(champ(l, 'montant'));
      // L'année de la convention : le schéma ne porte pas d'exercice, et la
      // date est écrite tantôt en ISO, tantôt à la française.
      const date = champ(l, 'dateconvention');
      const lue = /(\d{4})/.exec(date)?.[1] ?? '';
      if (!lue) continue;
      // Une date illisible donne des années impossibles : Quimper Bretagne
      // Occidentale publiait trois conventions « de 1735 » dont l'objet dit
      // 2025. La ligne reste — la convention existe —, l'année non : on ne
      // publie pas un chiffre qu'on sait faux.
      const annee = anneePlausible(lue) ? lue : '';

      let m = brut.get(siren);
      if (!m) {
        m = new Map();
        brut.set(siren, m);
      }
      const cle = `${qui}|${objet}|${montant}|${annee}`;
      if (m.has(cle)) continue;
      const tronque = objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet;
      m.set(cle, {
        qui,
        montant,
        annee,
        objet: tronque,
        rna: champ(l, 'rnabeneficiaire').trim(),
        ...sirenBeneficiaire(champ(l, 'idbeneficiaire')),
      });
      // Après la déduplication, comme pour les délibérations.
      const jour = jourDe(date);
      if (jour && jour >= debutJournal) {
        evenements.push({
          genre: GENRE,
          date: jour,
          quoi: tronque ? `${qui} — ${tronque}` : qui,
          detail: montant !== null ? `${montant.toLocaleString('fr-FR')} €` : undefined,
          siren,
        });
      }
      totaux.set(siren, (totaux.get(siren) ?? 0) + 1);
      const bornes = exercices.get(siren);
      if (!annee) {
        // Rien à borner.
      } else if (!bornes) exercices.set(siren, [annee, annee]);
      else {
        if (annee < bornes[0]) bornes[0] = annee;
        if (annee > bornes[1]) bornes[1] = annee;
      }
    }
  }

  if (brut.size === 0) {
    dire('Subventions : aucune collectivité rattachée, rien à écrire.');
    return null;
  }

  const parCollectivite = new Map<string, Subvention[]>();
  for (const [siren, m] of brut) {
    // Les plus grosses d'abord, et non les plus récentes : ce sont elles qui
    // disent où va l'argent, et le seuil de publication fait que les petites
    // ne sont de toute façon pas toutes là.
    parCollectivite.set(
      siren,
      [...m.values()]
        .sort((a, b) => (b.montant ?? 0) - (a.montant ?? 0) || b.annee.localeCompare(a.annee))
        .slice(0, PAR_COLLECTIVITE),
    );
  }

  const lignes = [...totaux.values()].reduce((a, b) => a + b, 0);
  dire(
    `Subventions : ${lignes.toLocaleString('fr-FR')} retenues pour ` +
      `${brut.size.toLocaleString('fr-FR')} collectivités` +
      (ecartees > 0 ? `, ${ecartees.toLocaleString('fr-FR')} écartées (bénéficiaire nommé)` : '') +
      (echecs > 0 ? `, ${echecs} fichier(s) injoignable(s)` : '') +
      '.',
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    parCollectivite,
    totaux,
    exercices,
    collectivites: brut.size,
    ecartees,
    evenements,
  };
}

/** Le SIREN tiré du SIRET déclaré, quand il en a la forme. */
function sirenBeneficiaire(id: string): { sb?: string } {
  const chiffres = id.replace(/\s/g, '');
  return /^\d{9}(\d{5})?$/.test(chiffres) ? { sb: chiffres.slice(0, 9) } : {};
}

/** Un fichier par département, indexé par SIREN — comme les marchés. */
export function ecrireSubventions(
  sortie: string,
  dep: string,
  sirens: string[],
  sirenDeCommune: Map<string, string>,
  s: Subventions,
  /**
   * Le SIREN du département puis celui de sa région, quand ils publient. Le
   * client n'a aucun moyen de les deviner : ils ne sont ni dans le découpage
   * ni dans BANATIC, et c'est ici qu'on les lui nomme.
   */
  echelons: string[] = [],
): number {
  const h: Record<string, { n: number; e: [string, string]; s: Subvention[] }> = {};
  let n = 0;
  for (const siren of [...new Set(sirens)].sort()) {
    const liste = s.parCollectivite.get(siren);
    if (!liste || liste.length === 0) continue;
    h[siren] = {
      n: s.totaux.get(siren) ?? liste.length,
      e: s.exercices.get(siren) ?? ['', ''],
      s: liste,
    };
    n++;
  }
  if (n === 0) return 0;
  const com: Record<string, string> = {};
  for (const [code, siren] of [...sirenDeCommune].sort()) {
    if (h[siren]) com[code] = siren;
  }
  writeFileSync(
    join(sortie, 'dep', `${dep}-subventions.json`),
    JSON.stringify({
      maj: s.maj,
      seuil: SEUIL_CONVENTION,
      com,
      echelons: echelons.filter((x) => h[x]),
      h,
    }),
  );
  return n;
}
