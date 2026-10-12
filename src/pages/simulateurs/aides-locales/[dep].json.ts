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

const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
const enDep = (dep: string) => communes().filter((c) => c.dep === dep);

export const getStaticPaths: GetStaticPaths = () => {
  if (aidesLocales().length === 0) return [];
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps
    .filter((dep) => enDep(dep).some((c) => aidesDeCommune(c.code, dep).length + aidesHorsPerimetre(c.code, dep).length > 0))
    .map((dep) => ({ params: { dep } }));
};

const vue = (a: AideLocale) => ({
  intitule: a.intitule,
  porteur: a.porteur.nom,
  travaux: a.travaux,
  beneficiaires: a.beneficiaires,
  ressources: a.ressources,
  montant: a.montant,
  precision: a.perimetre.communes === null ? null : a.perimetre.precision,
  etat: etatAide(a),
  guichet: a.demarche.guichet,
  demarche: a.demarche.url,
  avant: a.demarche.avant_travaux,
  sources: a.sources.map((s) => ({ titre: s.titre, url: s.url, date: s.date_texte ?? null })),
  anil: a.anil,
  verifie: a.verifie_le,
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
