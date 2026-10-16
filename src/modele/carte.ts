/**
 * La carte de situation d'une commune : ses contours, ceux de ses voisines,
 * et la silhouette de son département. Voir `scripts/contours-emettre.ts`.
 *
 * Les coordonnées restent en dix-millièmes de degré jusqu'au dessin ; la
 * projection est faite par le composant, à la latitude de la commune.
 */
import { national, parDepartement, type CommuneFiche } from './fiche-commune.ts';
import { communes } from './territoires.ts';

export type Point = [number, number];
export type Anneau = Point[];

type ContoursDep = {
  maj: string;
  millesime: string;
  tolerance?: number;
  toleranceGrossiere?: number;
  c: Record<string, [number[][], string[], number[][]?]>;
};
const contoursDep = parDepartement<ContoursDep>('contours');
const silhouettes = national<{ maj: string; millesime: string; d: Record<string, number[][]> }>('contours-departements.json');

const departementDe = (code: string) => (code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2));

let noms: Map<string, string> | null = null;
function nomDe(code: string): string {
  if (!noms) noms = new Map(communes().map((c) => [c.code, c.nom]));
  return noms.get(code) ?? code;
}

export function decoder(r: number[]): Anneau {
  const sortie: Anneau = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < r.length; i += 2) {
    x += r[i];
    y += r[i + 1];
    sortie.push([x, y]);
  }
  return sortie;
}

export interface CarteSituation {
  commune: Anneau[];
  voisines: { code: string; nom: string; anneaux: Anneau[] }[];
  departement: Anneau[];
  millesime: string;
  /** La simplification du dessin, en mètres. */
  tolerance: number;
}

function anneauxDe(code: string): { anneaux: Anneau[]; voisines: string[]; millesime: string; tolerance: number } | null {
  const d = contoursDep.get(departementDe(code));
  const x = d?.c[code];
  if (!d || !x) return null;
  return { anneaux: x[0].map(decoder), voisines: x[1], millesime: d.millesime, tolerance: d.tolerance ?? 100 };
}

export function carteDeSituation(c: CommuneFiche): CarteSituation | null {
  const ici = anneauxDe(c.code);
  if (!ici || ici.anneaux.length === 0) return null;
  const voisines = ici.voisines
    .map((code) => ({ code, nom: nomDe(code), anneaux: anneauxDe(code)?.anneaux ?? [] }))
    .filter((v) => v.anneaux.length > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return {
    commune: ici.anneaux,
    voisines,
    departement: (silhouettes()?.d[c.dep] ?? []).map(decoder),
    millesime: ici.millesime,
    tolerance: ici.tolerance,
  };
}

type EspacesDep = {
  maj: string;
  natures: string[];
  z: Record<string, [string, string, number, number[][]]>;
  c: Record<string, [number, string, number][]>;
};
const espacesDep = parDepartement<EspacesDep>('espaces');

/** Le fichier des espaces naturels d'un département, tel quel : pour les bilans qui comptent par département. */
export function espacesDuDepartement(dep: string): EspacesDep | null {
  return espacesDep.get(dep) ?? null;
}

export interface ZoneNaturelle {
  /** Rang de la nature : 0 à 3 protections, 4 et 5 Natura 2000, 6 et 7 ZNIEFF, 8 et 9 parcs, 10 à 12 désignations internationales (Ramsar, biosphère, patrimoine mondial). */
  rang: number;
  nature: string;
  nom: string;
  id: string;
  /** Part approchée de la commune couverte, en pour cent ; 0 : moins de 1 %. */
  part: number;
  anneaux: Anneau[];
}

export interface EspacesNaturels {
  zones: ZoneNaturelle[];
  commune: Anneau[];
  maj: string;
}

/** Les espaces naturels de la commune ; une liste vide est une réponse. */
export function espacesNaturels(c: CommuneFiche): EspacesNaturels | null {
  const d = espacesDep.get(c.dep);
  const ici = anneauxDe(c.code);
  if (!d || !ici) return null;
  const zones = (d.c[c.code] ?? []).map(([rang, cle, part]) => {
    const z = d.z[cle];
    return {
      rang,
      nature: d.natures[rang] ?? '',
      nom: z?.[0] ?? cle,
      id: z?.[1] ?? '',
      part,
      anneaux: (z?.[3] ?? []).map(decoder),
    };
  });
  return { zones, commune: ici.anneaux, maj: d.maj };
}

/**
 * Le cadrage d'une petite carte sur une commune : une projection équirectangulaire
 * corrigée de la latitude, une marge de 6 %, le cadre W × H rempli sans
 * déformer. Rend la fonction qui écrit des anneaux en chemin SVG.
 */
export function cadrerSurCommune(commune: Anneau[], W: number, H: number): (a: Anneau[]) => string {
  const ys = commune.flat().map(([, y]) => y);
  const k = Math.cos((((Math.min(...ys) + Math.max(...ys)) / 2 / 1e4) * Math.PI) / 180);
  const proj = ([x, y]: Point): Point => [x * k, -y];
  const ici = commune.map((r) => r.map(proj));
  const xs = ici.flat().map(([x]) => x);
  const yv = ici.flat().map(([, y]) => y);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...yv), Math.max(...yv)];
  const m = 0.06 * Math.max(x1 - x0, y1 - y0);
  [x0, x1, y0, y1] = [x0 - m, x1 + m, y0 - m, y1 + m];
  if ((x1 - x0) / (y1 - y0) < W / H) {
    const l = ((y1 - y0) * W) / H;
    const c = (x0 + x1) / 2;
    [x0, x1] = [c - l / 2, c + l / 2];
  } else {
    const h = ((x1 - x0) * H) / W;
    const c = (y0 + y1) / 2;
    [y0, y1] = [c - h / 2, c + h / 2];
  }
  const s = W / (x1 - x0);
  return (a: Anneau[]) =>
    a.map((r) => 'M' + r.map(proj).map(([x, y]) => `${((x - x0) * s).toFixed(1)} ${((y - y0) * s).toFixed(1)}`).join('L') + 'Z').join('');
}

type MondialDep = { maj: string; c: Record<string, [number, 'b' | 't' | 'e', number[][]][]> };
const mondialDep = parDepartement<MondialDep>('mondial');

/** Les tracés du patrimoine mondial sur la commune, et son contour : de quoi dessiner la carte. */
export function carteMondiale(c: CommuneFiche): { commune: Anneau[]; traces: { id: number; zone: 'bien' | 'tampon' | 'ensemble'; anneaux: Anneau[] }[] } | null {
  const l = mondialDep.get(c.dep)?.c[c.code];
  const ici = anneauxDe(c.code);
  if (!l?.length || !ici) return null;
  return { commune: ici.anneaux, traces: l.map(([id, z, a]) => ({ id, zone: z === 't' ? 'tampon' : z === 'e' ? 'ensemble' : 'bien', anneaux: a.map(decoder) })) };
}

export interface CarteCommunes {
  communes: { code: string; nom: string; groupe: string; anneaux: Anneau[] }[];
  millesime: string;
  tolerance: number;
}

/**
 * Les communes d'une intercommunalité ou d'un département, au trait grossier
 * — simplifié en gardant les limites partagées —, chacune avec son groupe :
 * la carte trace plus fort la limite entre deux groupes.
 */
export function carteDeCommunes(liste: { code: string; nom: string; groupe?: string }[]): CarteCommunes | null {
  let millesime = '';
  let tolerance = 0;
  const communes = liste.flatMap((c) => {
    const d = contoursDep.get(departementDe(c.code));
    const x = d?.c[c.code];
    if (!d || !x) return [];
    millesime = d.millesime;
    tolerance = d.toleranceGrossiere ?? d.tolerance ?? 100;
    return [{ code: c.code, nom: c.nom, groupe: c.groupe ?? '', anneaux: (x[2] ?? x[0]).map(decoder) }];
  });
  return communes.length ? { communes, millesime, tolerance } : null;
}
