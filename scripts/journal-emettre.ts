/**
 * Rassembler ce qui a bougé, et l'écrire département par département.
 *
 * Chaque collecteur sait dater ce qu'il ramène et sait à qui l'attribuer ; il
 * lui suffit d'émettre ses propres événements. Ce module ne fait que trois
 * choses : réunir, plafonner (`src/modele/journal.ts`), et répartir par
 * département.
 *
 * **Pourquoi ce n'est pas un diff.** On pourrait comparer deux ingestions.
 * Deux raisons de ne pas le faire. La première : les fichiers publiés sont des
 * vues tronquées — cinq marchés par acheteur, quatre créations d'association
 * par commune — si bien qu'un diff signalerait comme nouveau ce qui vient
 * d'entrer dans les cinq premiers, et manquerait ce qui en est sorti entre
 * deux passages. La seconde : un diff dépend de l'ingestion précédente, donc
 * il s'effondre le jour où une source ne répond pas, et il invente un
 * changement le jour où un producteur republie son historique. Une projection
 * datée n'a aucun de ces défauts.
 *
 * **Ce que le journal ne voit pas, et il faut le savoir.** BANATIC ne date pas
 * les transferts de compétences : le jour où une commune confie l'eau à son
 * agglomération, rien dans la donnée ne dit quand. C'est pourtant le
 * changement que ce site devrait annoncer le premier. Le repérer demandera de
 * comparer deux états du registre — un diff, cette fois justifié, parce qu'il
 * n'y a pas de date à projeter. Il n'est pas ici.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FENETRE_MOIS, GENRES, retenir, type Evenement } from '../src/modele/journal.ts';
import type { Marches } from './marches-emettre.ts';
import type { Risques } from './risques-emettre.ts';
import { PROCEDURES } from './marches-emettre.ts';
import { ANNONCE, FAMILLES } from './entreprises-emettre.ts';

interface Sources {
  marches: Marches | null;
  risques: Risques | null;
  elus: { parCommune: Map<string, { nom: string; prenom: string; depuis: string }> } | null;
  deliberations: { evenements: Evenement[] } | null;
  subventions: { evenements: Evenement[] } | null;
  associations: { evenements: Evenement[] } | null;
  etatCivil?: import('./etat-civil-emettre.ts').EtatCivil | null;
  entreprises?: import('./entreprises-emettre.ts').Entreprises | null;
}

/**
 * Un montant tel qu'il se lit : les marchés publics vont de mille euros à
 * plusieurs centaines de millions, et « 1 250 000 € » se déchiffre au lieu de
 * se lire.
 */
function montant(v: number | null): string | undefined {
  if (v === null) return undefined;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (v >= 1_000) return `${Math.round(v / 1_000).toLocaleString('fr-FR')} k€`;
  return `${v.toLocaleString('fr-FR')} €`;
}

export function rassembler(s: Sources, aujourdhui = new Date()): Evenement[] {
  const tout: Evenement[] = [];

  if (s.marches) {
    const genre = GENRES.indexOf('Marché notifié');
    // Les cinq plus récents d'un acheteur et le reste de sa liste sont deux
    // moitiés du même ensemble : le journal les réunit.
    for (const table of [s.marches.parAcheteur, s.marches.suites]) {
      for (const [siren, liste] of table) {
        for (const m of liste) {
          const precisions = [montant(m.montant), PROCEDURES[m.procedure]].filter(Boolean);
          tout.push({
            genre,
            date: m.date,
            quoi: m.objet,
            detail: precisions.join(' · ') || undefined,
            siren,
          });
        }
      }
    }
  }

  for (const source of [s.deliberations, s.subventions, s.associations]) {
    if (source) tout.push(...source.evenements);
  }

  // Une entrée par commune, le jour où l'INSEE a publié l'année : ce qu'un
  // habitant abonné au flux apprend sans avoir à revenir voir la page.
  if (s.etatCivil?.publie) {
    const genre = GENRES.indexOf('État civil publié');
    const e = s.etatCivil;
    const i = e.annees.length - 1;
    for (const [code, [nais, dec]] of e.communes) {
      const n = nais[i];
      const d = dec[i];
      if (n === null || d === null) continue;
      tout.push({
        genre,
        date: e.publie!,
        quoi: `Naissances et décès de ${e.annees[i]}`,
        detail: `${n} naissance${n > 1 ? 's' : ''}, ${d} décès`,
        commune: code,
      });
    }
  }

  // Les dernières annonces nommées, déjà retenues par commune pour la page.
  if (s.entreprises) {
    const GENRE_DE: Record<string, [(typeof GENRES)[number], (typeof GENRES)[number]]> = {
      creation: ['Société créée', 'Entreprise individuelle créée'],
      immatriculation: ['Société arrivée', 'Entreprise individuelle arrivée'],
      vente: ['Fonds de commerce cédé', 'Fonds de commerce cédé'],
      radiation: ['Société radiée', 'Entreprise individuelle radiée'],
    };
    for (const [code, liste] of s.entreprises.recentes) {
      for (const [date, f, nom, id, , ei] of liste) {
        const g = GENRE_DE[FAMILLES[f]]?.[ei ?? 0];
        if (g) tout.push({ genre: GENRES.indexOf(g), date, quoi: nom, url: ANNONCE + id, commune: code });
      }
    }
  }

  if (s.risques) {
    const genre = GENRES.indexOf('Catastrophe naturelle reconnue');
    for (const [code, fiche] of s.risques.communes) {
      for (const [rang, , dernier] of fiche.catnat) {
        // GASPAR ne garde ici que la date du dernier arrêté par nature de
        // risque : le journal annonce donc une reconnaissance, pas chacune.
        const nom = s.risques.jo[rang];
        if (nom && dernier) tout.push({ genre, date: dernier, quoi: nom, commune: code });
      }
    }
  }

  if (s.elus) {
    const genre = GENRES.indexOf('Élection du maire');
    for (const [code, m] of s.elus.parCommune) {
      if (m.depuis) {
        tout.push({
          genre,
          date: m.depuis,
          quoi: `${m.prenom} ${m.nom}`,
          detail: 'début du mandat',
          commune: code,
        });
      }
    }
  }

  return retenir(tout, aujourdhui);
}

/**
 * Un fichier par département, comme le reste.
 *
 * Un événement d'acheteur y figure une fois, sous son SIREN : le marché d'une
 * agglomération est celui de ses cent quatre communes, et c'est au lecteur du
 * fichier — la page de commune, le flux — de faire l'éventail, puisqu'il sait
 * déjà de quelles structures dépend chaque commune.
 */
export function ecrireJournal(
  sortie: string,
  dep: string,
  codes: string[],
  sirens: string[],
  /**
   * Le SIREN de chaque commune. Un marché passé par la commune elle-même est
   * réécrit sous son code : le lecteur du fichier ne connaît que les SIREN des
   * groupements — le fichier de département n'a pas de colonne pour celui de la
   * commune — et il manquerait sinon ce qu'elle commande en propre.
   */
  sirenDeCommune: Map<string, string>,
  evenements: Evenement[],
  maj: string,
): number {
  const communes = new Set(codes);
  const acteurs = new Set(sirens);
  const codeDuSiren = new Map([...sirenDeCommune].map(([code, siren]) => [siren, code] as const));
  const retenus = evenements
    .map((e) => {
      const propre = e.siren ? codeDuSiren.get(e.siren) : undefined;
      return propre ? { ...e, siren: undefined, commune: propre } : e;
    })
    .filter((e) => (e.commune ? communes.has(e.commune) : e.siren ? acteurs.has(e.siren) : false))
    .sort((a, b) => b.date.localeCompare(a.date) || a.quoi.localeCompare(b.quoi, 'fr'));
  if (retenus.length === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-journal.json`),
    JSON.stringify({
      maj,
      fenetre: FENETRE_MOIS,
      genres: GENRES,
      // Des noms d'un caractère : « genre », « date », « quoi », « detail »,
      // « siren » pèsent trente octets par ligne, et il y a des milliers de
      // lignes par département. Le code, lui, garde les noms entiers.
      e: retenus.map((x) => ({
        g: x.genre,
        d: x.date,
        q: x.quoi,
        ...(x.detail ? { p: x.detail } : {}),
        ...(x.url ? { u: x.url } : {}),
        ...(x.siren ? { s: x.siren } : {}),
        ...(x.commune ? { c: x.commune } : {}),
      })),
    }),
  );
  return retenus.length;
}
