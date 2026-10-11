/**
 * Les cartes thématiques d'un département : chaque commune teintée selon un
 * indicateur déjà publié sur sa page — le prix d'une maison, les étiquettes
 * énergétiques, la fibre, l'accès aux généralistes.
 *
 * Cinq classes de même effectif (quintiles), dans une seule teinte : plus
 * foncé, c'est plus — jamais « mieux » ni « pire ». Une commune sans donnée,
 * ou sous le seuil de la source, reste en blanc.
 */
import { parDepartement } from './fiche-commune.ts';

type DvfDep = { annees: number[]; minimum: number; c: Record<string, [number, number | null, number | null, ...unknown[]]> };
type DpeDep = { base: string; c: Record<string, number[]> };
type FibreDep = { trimestre: string; c: Record<string, [number, number, ...unknown[]]> };
type SanteDep = { annees: number[]; c: Record<string, [number | null, number | null][]> };

const dvf = parDepartement<DvfDep>('dvf');
const dpe = parDepartement<DpeDep>('dpe');
const fibre = parDepartement<FibreDep>('fibre');
const sante = parDepartement<SanteDep>('sante');

/** Sous vingt diagnostics, la part des étiquettes F et G d'une commune ne dit rien. */
const DPE_MIN = 20;

export interface Thematique {
  id: string;
  nom: string;
  /** Ce que la teinte dit, en une phrase, avec la source et sa date. */
  source: string;
  /** Les quatre bornes entre les cinq classes, déjà écrites pour la légende. */
  bornes: string[];
  /** Une classe par commune, dans l'ordre de la carte : « 0 » à « 4 », « - » sans donnée. */
  classes: string;
}

const nb = (v: number, chiffres = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: chiffres });

function quintiles(codes: string[], valeur: (code: string) => number | null, ecrire: (v: number) => string): Pick<Thematique, 'bornes' | 'classes'> | null {
  const v = codes.map(valeur);
  const tries = v.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  // Moins de dix communes renseignées : cinq classes n'auraient pas de sens.
  if (tries.length < 10) return null;
  const seuils = [0.2, 0.4, 0.6, 0.8].map((q) => tries[Math.min(tries.length - 1, Math.floor(q * tries.length))]);
  const classes = v.map((x) => (x === null || !Number.isFinite(x) ? '-' : String(seuils.filter((s) => x >= s).length))).join('');
  return { bornes: seuils.map(ecrire), classes };
}

/** Les cartes possibles pour ces communes d'un même département, dans l'ordre où la carte les dessine. */
export function thematiquesDepartement(dep: string, codes: string[]): Thematique[] {
  const sortie: Thematique[] = [];
  const ajouter = (t: Omit<Thematique, 'bornes' | 'classes'>, q: Pick<Thematique, 'bornes' | 'classes'> | null) => {
    if (q) sortie.push({ ...t, ...q });
  };

  const d = dvf.get(dep);
  if (d) {
    ajouter(
      {
        id: 'prix',
        nom: 'Prix d’une maison',
        source: `Le prix médian d’une maison vendue de ${d.annees[0]} à ${d.annees.at(-1)}, d’après les demandes de valeurs foncières (DGFiP), là où il y a eu au moins ${d.minimum} ventes.`,
      },
      quintiles(codes, (c) => d.c[c]?.[2] ?? null, (v) => `${nb(Math.round(v / 1000) * 1000)} €`),
    );
  }

  const e = dpe.get(dep);
  if (e) {
    ajouter(
      {
        id: 'dpe',
        nom: 'Logements F ou G',
        source: `La part des logements diagnostiqués F ou G parmi les DPE établis depuis juillet 2021 (ADEME, base du ${e.base}), là où il y en a au moins ${DPE_MIN}.`,
      },
      quintiles(
        codes,
        (c) => {
          const n = e.c[c];
          const total = n?.reduce((a, b) => a + b, 0) ?? 0;
          return n && total >= DPE_MIN ? ((n[5] + n[6]) / total) * 100 : null;
        },
        (v) => `${nb(v)} %`,
      ),
    );
  }

  const f = fibre.get(dep);
  if (f) {
    ajouter(
      {
        id: 'fibre',
        nom: 'Raccordables à la fibre',
        source: `La part des locaux raccordables à la fibre au ${f.trimestre}, d’après l’indicateur France Très Haut Débit de l’ANCT, sur la base de locaux de l’Arcep.`,
      },
      quintiles(codes, (c) => (f.c[c] && f.c[c][0] > 0 ? (f.c[c][1] / f.c[c][0]) * 100 : null), (v) => `${nb(v)} %`),
    );
  }

  const s = sante.get(dep);
  if (s) {
    const i = s.annees.length - 1;
    ajouter(
      {
        id: 'sante',
        nom: 'Accès aux généralistes',
        source: `Les consultations de généraliste accessibles par habitant et par an en ${s.annees[i]} (accessibilité potentielle localisée, DREES).`,
      },
      quintiles(codes, (c) => s.c[c]?.[i]?.[0] ?? null, (v) => nb(v, 1)),
    );
  }
  return sortie;
}
