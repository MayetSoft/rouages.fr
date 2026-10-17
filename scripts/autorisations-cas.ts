/**
 * Les cas de l'orienteur des autorisations d'urbanisme, chacun repris d'une
 * phrase d'une fiche de service-public.fr lue le 16 octobre 2026 : ils
 * servent au contrôle (`verifier-autorisations.ts`) et à la fiche de
 * relecture du praticien (`relecture-autorisations.ts`), pour que les deux
 * ne puissent pas diverger.
 */
import type { Regime, Situation, Travaux } from '../src/modele/autorisations.ts';

export const U: Situation = { zoneUrbainePlu: 'oui', secteurProtege: 'non', particulier: true };
export const HORS_U: Situation = { zoneUrbainePlu: 'non', secteurProtege: 'non', particulier: true };
export const PROTEGE: Situation = { zoneUrbainePlu: 'oui', secteurProtege: 'oui', particulier: true };
export const DOUTE: Situation = { zoneUrbainePlu: 'nsp', secteurProtege: 'nsp', particulier: true };

/** [ce que dit la fiche, travaux, situation, régime attendu, architecte attendu]. */
export const CAS: [string, Travaux, Situation, Regime, boolean][] = [
  // F662 — abri de jardin
  ['abri indépendant de 5 m² : dispensé', { type: 'abri', surface: 5, accole: false }, U, 'aucune', false],
  ['abri indépendant de 12 m² : DP', { type: 'abri', surface: 12, accole: false }, U, 'DP', false],
  ['abri indépendant de 25 m² : PC', { type: 'abri', surface: 25, accole: false }, U, 'PC', false],
  ['abri de 4 m² en secteur protégé : DP', { type: 'abri', surface: 4, accole: false }, PROTEGE, 'DP', false],
  ['abri de 4 m² sans savoir le secteur : DP', { type: 'abri', surface: 4, accole: false }, DOUTE, 'DP', false],
  ['abri accolé de 3 m² : DP (aspect extérieur)', { type: 'abri', surface: 3, accole: true }, U, 'DP', false],
  ['abri accolé de 30 m² : PC (construction nouvelle, la plus exigeante)', { type: 'abri', surface: 30, accole: true }, U, 'PC', false],
  // F36777 — agrandissement
  ['extension de 4 m² : DP', { type: 'extension', surface: 4, totaleApres: 100 }, U, 'DP', false],
  ['extension de 35 m² en zone U, total 120 m² : DP', { type: 'extension', surface: 35, totaleApres: 120 }, U, 'DP', false],
  ['extension de 35 m² en zone U, total 160 m² : PC et architecte', { type: 'extension', surface: 35, totaleApres: 160 }, U, 'PC', true],
  ['extension de 18 m² en zone U, total 160 m² : DP (pas au-delà de 20 m²)', { type: 'extension', surface: 18, totaleApres: 160 }, U, 'DP', false],
  ['extension de 45 m² en zone U, total 140 m² : PC sans architecte', { type: 'extension', surface: 45, totaleApres: 140 }, U, 'PC', false],
  ['extension de 25 m² hors zone U : PC', { type: 'extension', surface: 25, totaleApres: 120 }, HORS_U, 'PC', false],
  ['extension de 25 m² en zone U mais secteur protégé : PC', { type: 'extension', surface: 25, totaleApres: 120 }, PROTEGE, 'PC', false],
  ['extension de 25 m² sans savoir la zone : PC (seuil de 20 m²)', { type: 'extension', surface: 25, totaleApres: 120 }, DOUTE, 'PC', false],
  ['extension de 25 m² hors zone U, total 170 m² : PC et architecte', { type: 'extension', surface: 25, totaleApres: 170 }, HORS_U, 'PC', true],
  // F36768 — véranda
  ['véranda de 30 m² en zone U : DP', { type: 'veranda', surface: 30, totaleApres: 110 }, U, 'DP', false],
  ['véranda de 30 m² hors zone U : PC', { type: 'veranda', surface: 30, totaleApres: 110 }, HORS_U, 'PC', false],
  // F31404 — piscine
  ['bassin de 9 m² : aucune autorisation', { type: 'piscine', surface: 9, couverture: 'aucune', horsSolSaisonniere: false }, U, 'aucune', false],
  ['bassin de 9 m² en secteur protégé : DP', { type: 'piscine', surface: 9, couverture: 'aucune', horsSolSaisonniere: false }, PROTEGE, 'DP', false],
  ['bassin de 32 m² sans couverture : DP', { type: 'piscine', surface: 32, couverture: 'aucune', horsSolSaisonniere: false }, U, 'DP', false],
  ['bassin de 32 m², couverture de plus de 1,80 m : PC', { type: 'piscine', surface: 32, couverture: 'haute', horsSolSaisonniere: false }, U, 'PC', false],
  ['bassin de 120 m² : PC', { type: 'piscine', surface: 120, couverture: 'aucune', horsSolSaisonniere: false }, U, 'PC', false],
  ['piscine hors sol trois mois par an : aucune', { type: 'piscine', surface: 30, couverture: 'aucune', horsSolSaisonniere: true }, U, 'aucune', false],
  // F3131 — clôture
  ['grillage hors secteur, commune qui ne les soumet pas : dispensé', { type: 'cloture', nature: 'autre', hauteurDeuxMetresOuPlus: false, communeLesSoumet: 'non' }, U, 'aucune', false],
  ['grillage, sans savoir si la commune les soumet : DP', { type: 'cloture', nature: 'autre', hauteurDeuxMetresOuPlus: false, communeLesSoumet: 'nsp' }, U, 'DP', false],
  ['mur de 2 m : DP', { type: 'cloture', nature: 'mur', hauteurDeuxMetresOuPlus: true, communeLesSoumet: 'non' }, U, 'DP', false],
  ['clôture en secteur protégé : DP', { type: 'cloture', nature: 'autre', hauteurDeuxMetresOuPlus: false, communeLesSoumet: 'non' }, PROTEGE, 'DP', false],
  ['haie : pas d’autorisation d’urbanisme', { type: 'cloture', nature: 'vegetale', hauteurDeuxMetresOuPlus: false, communeLesSoumet: 'nsp' }, DOUTE, 'aucune', false],
  // F35336 et F20568 — changement de destination
  ['changement de destination sans toucher la façade : DP', { type: 'destination', facadeOuStructure: false, memeDestination: false, surfaceLocal: 90 }, U, 'DP', false],
  ['changement de destination avec la façade, 90 m² : PC', { type: 'destination', facadeOuStructure: true, memeDestination: false, surfaceLocal: 90 }, U, 'PC', false],
  ['changement de destination avec la façade, 200 m² : PC et architecte', { type: 'destination', facadeOuStructure: true, memeDestination: false, surfaceLocal: 200 }, U, 'PC', true],
  ['changement de sous-destination : dispensé', { type: 'destination', facadeOuStructure: true, memeDestination: true, surfaceLocal: 90 }, U, 'aucune', false],
  // F20568 — personne morale
  ['extension de 45 m² par une société : PC et architecte', { type: 'extension', surface: 45, totaleApres: 100 }, { ...U, particulier: false }, 'PC', true],
  ['extension de 30 m² par une société en zone U : DP, pas d’architecte', { type: 'extension', surface: 30, totaleApres: 100 }, { ...U, particulier: false }, 'DP', false],
];
