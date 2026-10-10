/**
 * Où l'on peut jouer aux jeux qui portent sur des communes — « Qui décide ? »,
 * la commune mystère, « Plus ou moins » : les départements et les
 * intercommunalités, avec toutes leurs communes. Le champ des jeux le charge
 * à la première frappe ; les communes et les codes postaux viennent de
 * l'index national. Même forme que `prix-territoires.json`, sans communes
 * marquées : ici, toutes se jouent.
 */
import type { APIRoute } from 'astro';
import { collectivitesPour } from '../../modele/fiche-commune.ts';
import { intercommunalites } from '../../modele/territoires.ts';
import type { TerritoiresJeu } from './prix-territoires.json.ts';

export const GET: APIRoute = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const t: TerritoiresJeu = { d: [], e: [] };
  for (const c of collectivitesPour(filtre)) if (c.echelon === 'departement') t.d.push([c.code, c.nom]);
  const deps = new Set(t.d.map(([code]) => code));
  for (const e of intercommunalites(filtre)) {
    t.e.push([e.siren, e.nom, e.natureLibelle, e.deps.filter((d) => deps.has(d)).join(' '), e.communes.map((c) => c.code).join(' ')]);
  }
  return new Response(JSON.stringify(t), { headers: { 'Content-Type': 'application/json' } });
};
