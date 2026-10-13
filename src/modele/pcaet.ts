/**
 * Le plan climat-air-énergie territorial d'une intercommunalité, d'après le
 * registre Territoires & Climat de l'ADEME (`scripts/pcaet-emettre.ts`).
 * Sans nom de personne : ni chef de projet, ni contact, ni élu référent.
 */
import { national } from './fiche-commune.ts';

export interface DemarchePcaet {
  nom: string;
  /** La collectivité porteuse, telle que le registre la nomme. */
  porteur: string;
  /** « Mise en oeuvre », « En cours d'élaboration », « Dépôt pour avis ». */
  etat: string;
  /** Obligée (plus de 20 000 habitants) ou volontaire, selon le registre ; null s'il ne le dit pas. */
  oblige: boolean | null;
  lancement: string | null;
  modification: string | null;
  jeu: string;
}

export interface Pcaet {
  maj: string;
  jeux: { jeu: string; maj: string | null; lignes: number }[];
  /** Par SIREN de la collectivité porteuse. */
  c: Record<string, DemarchePcaet>;
}

/** Le registre des plans climat, ou null s'il n'a pas encore été collecté. */
export const pcaet = national<Pcaet>('pcaet.json');
