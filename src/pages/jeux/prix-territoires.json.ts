/**
 * Où l'on peut jouer à « À combien s'est-elle vendue ? » : les départements
 * qui ont des ventes, et les intercommunalités avec celles de leurs communes
 * qui en ont assez. Le champ du jeu le charge à la première frappe ; les
 * communes et les codes postaux viennent de l'index national, comme dans la
 * recherche des « Données de chez moi ».
 *
 * Les communes jouables sont celles des fichiers `jeux/dvf/` : une commune de
 * moins de dix ventes n'y est pas, et le jeu propose alors son
 * intercommunalité.
 */
import type { APIRoute } from 'astro';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from '../../modele/graphe.ts';
import { collectivitesPour } from '../../modele/fiche-commune.ts';
import { intercommunalites } from '../../modele/territoires.ts';

/**
 * `d` : [code, nom] des départements jouables.
 * `e` : [siren, nom, nature, départements jouables séparés par une espace,
 *   toutes ses communes séparées par une espace, précédées d'un tiret quand
 *   elles n'ont pas assez de ventes — le champ propose alors l'intercommunalité].
 */
export interface TerritoiresJeu {
  d: [string, string][];
  e: [string, string, string, string, string][];
}

export const GET: APIRoute = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const dossier = join(RACINE, 'public', 'territoires', 'jeux', 'dvf');
  const fichiers = existsSync(dossier) ? readdirSync(dossier).filter((f) => f.endsWith('.json')) : [];
  const deps = new Set<string>();
  const jouables = new Set<string>();
  for (const f of fichiers) {
    const dep = f.slice(0, -5);
    if (filtre?.length && !filtre.includes(dep)) continue;
    deps.add(dep);
    const { c } = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { c: Record<string, unknown> };
    for (const code of Object.keys(c)) jouables.add(code);
  }
  const t: TerritoiresJeu = { d: [], e: [] };
  for (const c of collectivitesPour(filtre)) {
    if (c.echelon === 'departement' && deps.has(c.code)) t.d.push([c.code, c.nom]);
  }
  for (const e of intercommunalites(filtre)) {
    if (!e.communes.some((c) => jouables.has(c.code))) continue;
    const communes = e.communes.map((c) => (jouables.has(c.code) ? c.code : `-${c.code}`));
    t.e.push([e.siren, e.nom, e.natureLibelle, e.deps.filter((d) => deps.has(d)).join(' '), communes.join(' ')]);
  }
  return new Response(JSON.stringify(t), { headers: { 'Content-Type': 'application/json' } });
};
