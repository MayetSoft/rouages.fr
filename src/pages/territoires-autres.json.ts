/**
 * Les territoires au-dessus de la commune, pour la recherche des « Données de
 * chez moi » : régions, départements et intercommunalités, avec le lien de
 * leur page. Une soixantaine de kilo-octets, chargés à la première frappe
 * comme l'index des communes.
 *
 * Le filtre des builds partiels (`ROUAGES_DEPS`) s'applique comme pour les
 * pages elles-mêmes : la recherche ne propose que des pages qui existent.
 */
import type { APIRoute } from 'astro';
import { intercommunalites, lienIntercommunalite } from '../modele/territoires.ts';
import { collectivitesPour, lienCollectivite } from '../modele/fiche-commune.ts';

/** Échelon, nom, lien, précision affichée sous le nom, population (0 si inconnue). */
export type TerritoireAutre = ['region' | 'departement' | 'interco', string, string, string, number];

export const GET: APIRoute = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const t: TerritoireAutre[] = [];
  for (const c of collectivitesPour(filtre)) {
    t.push([c.echelon === 'region' ? 'region' : 'departement', c.nom, lienCollectivite(c), c.echelon === 'region' ? 'Région' : `Département · ${c.code}`, 0]);
  }
  for (const e of intercommunalites(filtre)) {
    t.push(['interco', e.nom, lienIntercommunalite(e.siren), e.natureLibelle, e.population]);
  }
  return new Response(JSON.stringify(t), { headers: { 'Content-Type': 'application/json' } });
};
