/**
 * « Qui décide ? » : pour chaque commune d'un département, qui exerce chaque
 * compétence — les verdicts mêmes de sa page (`verdictsCommune`), pas une
 * copie. Une compétence que le registre ne permet pas de trancher ici
 * (« non renseigné ») n'entre pas, ni celle dont la fiche reste à confirmer.
 *
 * `k` : [id, nom] des compétences.
 * `s` : [siren, nom, nature, 1 si à fiscalité propre] des groupements.
 * `c` : par commune, [nom, indice de son intercommunalité à fiscalité propre
 *   ou -1, indices des autres groupements, réponses]. Une réponse est
 *   [indice de compétence, genre, …indices de groupements] : genre `T`
 *   transférée d'après le registre, `L` transférée par la loi, `C` la commune,
 *   `R`, `D`, `E` la région, le département, l'État à défaut.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { chargerGraphe } from '../../../modele/graphe.ts';
import { construireReseau } from '../../../modele/reseau.ts';
import { NATURES_FISCALITE_PROPRE } from '../../../modele/schemas.ts';
import { communes, metaTerritoires, verdictsCommune } from '../../../modele/territoires.ts';

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.map((dep) => ({ params: { dep } }));
};

type Reponse = [number, 'T' | 'L' | 'C' | 'R' | 'D' | 'E', ...number[]];

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const g = chargerGraphe();
  const m = metaTerritoires();
  // Les compétences que le réseau sait résoudre, comme sur la page de commune.
  const resolubles = construireReseau()
    .noeuds.filter((n) => n.banatic && n.banatic.length > 0)
    .map((n) => ({ id: n.id, banatic: n.banatic! }))
    .filter((r) => g.competences.get(r.id)?.confiance !== 'a_confirmer');
  const k: [string, string][] = resolubles.map((r) => [r.id, g.competences.get(r.id)?.nom ?? r.id]);
  const indiceK = new Map(k.map(([id], i) => [id, i]));
  const s: [string, string, string, number][] = [];
  const indiceS = new Map<string, number>();
  const groupement = (x: { siren: string; nom: string; nature: string; natureLibelle: string }) => {
    if (!indiceS.has(x.siren)) {
      indiceS.set(x.siren, s.length);
      s.push([x.siren, x.nom, x.natureLibelle, (NATURES_FISCALITE_PROPRE as readonly string[]).includes(x.nature) ? 1 : 0]);
    }
    return indiceS.get(x.siren)!;
  };
  const c: Record<string, [string, number, number[], Reponse[]]> = {};
  let departement = '';
  for (const commune of communes().filter((x) => x.dep === dep)) {
    departement = commune.depNom;
    const qui = verdictsCommune(commune, resolubles);
    if (!qui) continue;
    const fp = qui.structures.find((x) => (NATURES_FISCALITE_PROPRE as readonly string[]).includes(x.nature));
    const autres = qui.structures.filter((x) => x !== fp).map(groupement);
    const reponses: Reponse[] = [];
    for (const [id, v] of qui.verdicts) {
      const i = indiceK.get(id);
      if (i === undefined) continue;
      if (v.etat === 'transferee' || v.etat === 'transferee-par-loi') {
        reponses.push([i, v.etat === 'transferee' ? 'T' : 'L', ...v.structures.map(groupement)]);
      } else if (v.etat === 'a-defaut') reponses.push([i, v.echelon === 'region' ? 'R' : v.echelon === 'departement' ? 'D' : 'E']);
      else if (v.etat === 'communale') reponses.push([i, 'C']);
    }
    if (reponses.length >= 5) c[commune.code] = [commune.nom, fp ? groupement(fp) : -1, autres, reponses];
  }
  return new Response(
    JSON.stringify({ maj: m?.maj ?? null, departement, region: m?.regions?.[dep] ?? null, k, s, c }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
