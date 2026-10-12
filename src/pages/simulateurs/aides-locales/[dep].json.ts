/**
 * Pour le simulateur de rénovation, par département : les aides locales du
 * registre (`contenu/aides-locales.yaml`) qui valent dans chaque commune, et
 * celles dont la commune est hors du périmètre. Seuls les départements où le
 * registre a des aides ont un fichier ; ailleurs, le simulateur n'affiche
 * rien de plus.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { aidesDeCommune, aidesHorsPerimetre, aidesLocales, etatAide, type AideLocale } from '../../../modele/aides-locales.ts';
import { communes } from '../../../modele/territoires.ts';

const RENOVER = new Set(['energie', 'isolation', 'chauffage', 'indigne', 'toiture']);
const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
const enDep = (dep: string) => communes().filter((c) => c.dep === dep);

export const getStaticPaths: GetStaticPaths = () => {
  if (aidesLocales().length === 0) return [];
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps
    .filter((dep) => enDep(dep).some((c) => aidesDeCommune(c.code, dep).length + aidesHorsPerimetre(c.code, dep).length > 0))
    .map((dep) => ({ params: { dep } }));
};

/** Ce que le simulateur montre d'une aide ; le reste est sur la page de la commune. */
const vue = (a: AideLocale) => ({
  intitule: a.intitule,
  porteur: a.porteur.nom,
  montant: a.montant,
  etat: etatAide(a),
  demarche: a.demarche.url,
  avant: a.demarche.avant_travaux,
  // Ce que le simulateur calcule : un propriétaire occupant qui rénove son logement.
  pour: a.beneficiaires.includes('proprietaire-occupant') && a.travaux.some((t) => RENOVER.has(t)) ? 1 : 0,
});

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const aides: Record<string, ReturnType<typeof vue>> = {};
  const c: Record<string, [string[], string[]]> = {};
  for (const x of enDep(dep)) {
    const ici = aidesDeCommune(x.code, dep).filter((a) => etatAide(a) !== 'fermee');
    const hors = aidesHorsPerimetre(x.code, dep).filter((a) => etatAide(a) !== 'fermee');
    if (ici.length + hors.length === 0) continue;
    for (const a of [...ici, ...hors]) aides[a.id] ??= vue(a);
    c[x.code.slice(2)] = [ici.map((a) => a.id), hors.map((a) => a.id)];
  }
  return new Response(JSON.stringify({ aides, c }), { headers: { 'Content-Type': 'application/json' } });
};
