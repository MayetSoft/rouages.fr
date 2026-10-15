/**
 * Les biens du patrimoine mondial qui touchent chaque commune, d'après la
 * liste de l'UNESCO et les périmètres régionaux
 * (`scripts/patrimoine-mondial-emettre.ts`).
 */
import { national } from './fiche-commune.ts';

export interface BienMondial {
  /** Le nom français, tel que l'UNESCO le publie. */
  nom: string;
  categorie: 'culturel' | 'naturel' | 'mixte';
  inscrit: number | null;
}

/**
 * Un bien et la commune : son numéro UNESCO ; comment elle y tient — dans le
 * périmètre du bien, dans sa zone tampon, dans l'un ou l'autre quand la couche
 * publiée ne les distingue pas (« ensemble »), ou par un élément que l'UNESCO
 * y situe — ; les éléments nommés.
 */
export type RattachementMondial = [number, 'perimetre' | 'tampon' | 'ensemble' | 'element', string[]];

export interface PatrimoineMondial {
  maj: string;
  /** La date de mise à jour de la liste sur data.unesco.org. */
  version: string | null;
  biens: Record<string, BienMondial>;
  sources: { id: string; producteur: string; licence: string; url: string; entites: number; ecartees: number }[];
  c: Record<string, RattachementMondial[]>;
}

export const patrimoineMondial = national<PatrimoineMondial>('patrimoine-mondial.json');

/** La page d'un bien sur le site du Centre du patrimoine mondial. */
export const lienUnesco = (id: number) => `https://whc.unesco.org/fr/list/${id}/`;
