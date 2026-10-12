/**
 * Pour le simulateur de rentabilité locative, par département : le loyer
 * d'annonce estimé d'un appartement et d'une maison types (carte des loyers)
 * et le prix médian au mètre carré des ventes (DVF), commune par commune —
 * des chiffres que la page de chaque commune publie déjà.
 *
 * `c` : par commune, [loyer appartement, loyer maison, € / m² maison, € / m² appartement],
 * un loyer étant [€ / m² charges comprises, bas, haut, fragile (1 ou 0)] ou null.
 * `dep` : les prix au mètre carré du département, quand la commune n'a pas assez de ventes.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { parDepartement } from '../../../modele/fiche-commune.ts';
import { communes } from '../../../modele/territoires.ts';

export const getStaticPaths: GetStaticPaths = () => {
  const filtre = process.env.ROUAGES_DEPS?.split(',').map((d) => d.trim()).filter(Boolean);
  const deps = [...new Set(communes().map((c) => c.dep))].filter((d) => !filtre?.length || filtre.includes(d));
  return deps.map((dep) => ({ params: { dep } }));
};

type LoyerBrut = [number, number, number, number, number, number];
type Loyers = { millesime: number; maj: string; c: Record<string, [LoyerBrut | null, LoyerBrut | null]> };
type Dvf = { annees: number[]; minimum: number; dep: (number | null)[] | null; c: Record<string, (number | null)[]> };
const loyers = parDepartement<Loyers>('loyers');
const dvf = parDepartement<Dvf>('dvf');

// Les trois cas que le guide de la carte des loyers demande de lire avec prudence (voir `fiche-vie.ts`).
const loyer = (x: LoyerBrut | null) => {
  if (!x) return null;
  const [euros, bas, haut, , annonces, r2] = x;
  return [euros, bas, haut, annonces < 30 || r2 < 50 || haut - bas > euros ? 1 : 0];
};

export const GET: APIRoute = ({ params }) => {
  const dep = params.dep!;
  const l = loyers.get(dep);
  const v = dvf.get(dep);
  const c: Record<string, unknown> = {};
  for (const x of communes().filter((k) => k.dep === dep)) {
    const lo = l?.c[x.code];
    const ve = v?.c[x.code];
    const ligne = [loyer(lo?.[0] ?? null), loyer(lo?.[1] ?? null), ve?.[1] ?? null, ve?.[4] ?? null];
    if (ligne.some((y) => y !== null)) c[x.code] = ligne;
  }
  return new Response(
    JSON.stringify({
      loyers: l ? { millesime: l.millesime, maj: l.maj } : null,
      ventes: v ? { annees: v.annees, minimum: v.minimum } : null,
      dep: [v?.dep?.[1] ?? null, v?.dep?.[4] ?? null],
      c,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
