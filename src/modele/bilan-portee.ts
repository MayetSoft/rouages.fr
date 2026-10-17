/**
 * Ce qui est à portée des habitants d'un département ou d'une région : le
 * réseau mobile, un car, un généraliste. Rien n'est collecté ici : les
 * fichiers de la page de commune — couverture 4G (`couverture-emettre.ts`),
 * desserte des arrêts (`transports-emettre.ts`), habitants à distance
 * (`acces-emettre.ts`) — réunis, et comparés à la région et à la France.
 *
 * **Chaque ligne a son dénominateur** : les habitants du carroyage là où la
 * couverture ou la distance est calculée, les communes que les fichiers
 * d'horaires inscrivent pour la desserte. Une part par commune est arrondie
 * à l'unité ; l'addition la repondère par ses habitants, ce qui garde
 * l'erreur sous le point.
 */
import { parDepartement } from './fiche-commune.ts';
import { communes } from './territoires.ts';

type PartsDep = [number[], number[][]];
type CouvertureDep = { au: string; c: Record<string, { n: number; s?: PartsDep; h?: number; p?: PartsDep }> };
type TransportsDep = { s?: string; c: Record<string, { h?: unknown; z?: 1; n?: number }> };
type AccesDep = { maj: string; s?: string; c: Record<string, { h: number; m?: number[]; a?: number[] }> };
const couvertureDep = parDepartement<CouvertureDep>('couverture');
const transportsDep = parDepartement<TransportsDep>('transports');
const accesDep = parDepartement<AccesDep>('acces');

/** Des sommes, qu'on additionne d'un département à l'autre. */
export interface PartsPortee {
  /** Habitants du carroyage là où la couverture 4G est calculée ; en bonne ou très bonne couverture d'au moins un opérateur ; sans aucune. */
  mobile: { h: number; bonne: number; aucune: number };
  /** Communes dont la desserte est connue ; celles où rien ne s'arrête dans la semaine — sans arrêt, ou sans passage —, et leurs habitants (population légale). */
  car: { communes: number; sansPassage: number; habitantsSansPassage: number };
  /** Habitants du carroyage là où les arrêts sont croisés ; à 800 m d'un arrêt desservi ; d'un arrêt desservi dix fois par jour ouvré. */
  arrets: { h: number; desservi: number; frequent: number };
  /** Habitants là où la distance au généraliste est calculée ; à 1 km ou moins ; à plus de 10 km. */
  medecin: { h: number; proche: number; loin: number };
}

const VIDES = (): PartsPortee => ({
  mobile: { h: 0, bonne: 0, aucune: 0 },
  car: { communes: 0, sansPassage: 0, habitantsSansPassage: 0 },
  arrets: { h: 0, desservi: 0, frequent: 0 },
  medecin: { h: 0, proche: 0, loin: 0 },
});

const parDep = new Map<string, PartsPortee>();

/** Les sommes d'un département, faites une fois pour tout le build. */
function partsDuDepartement(dep: string): PartsPortee {
  const deja = parDep.get(dep);
  if (deja) return deja;
  const p = VIDES();
  const population = new Map(communes().filter((x) => x.dep === dep).map((x) => [x.code, x.population]));
  for (const [code, f] of Object.entries(couvertureDep.get(dep)?.c ?? {})) {
    if (!population.has(code) || !f.h || !f.p) continue;
    const [tbc, bc, cl] = f.p[0];
    p.mobile.h += f.h;
    p.mobile.bonne += (f.h * (tbc + bc)) / 100;
    p.mobile.aucune += (f.h * Math.max(0, 100 - tbc - bc - cl)) / 100;
  }
  // La desserte, quand les horaires ont été lus : une commune sans arrêt propre n'a pas de passage ; une commune dont les arrêts ne sont inscrits par aucun fichier couvrant la semaine ne compte pas.
  const t = transportsDep.get(dep);
  if (t?.s)
    for (const [code, habitants] of population) {
      const f = t.c[code];
      const sans = !f || f.n === undefined || (!f.h && !!f.z);
      if (!sans && !f.h) continue;
      p.car.communes++;
      if (sans) {
        p.car.sansPassage++;
        p.car.habitantsSansPassage += habitants;
      }
    }
  for (const [code, f] of Object.entries(accesDep.get(dep)?.c ?? {})) {
    if (!population.has(code)) continue;
    if (f.a) {
      p.arrets.h += f.h;
      p.arrets.desservi += (f.h * f.a[0]) / 100;
      p.arrets.frequent += (f.h * f.a[1]) / 100;
    }
    if (f.m) {
      p.medecin.h += f.h;
      p.medecin.proche += (f.h * f.m[0]) / 100;
      p.medecin.loin += (f.h * (100 - f.m[2])) / 100;
    }
  }
  parDep.set(dep, p);
  return p;
}

function additionner(deps: string[]): PartsPortee {
  const s = VIDES();
  for (const p of deps.map(partsDuDepartement))
    for (const k of Object.keys(s) as (keyof PartsPortee)[]) for (const [c, v] of Object.entries(p[k])) (s[k] as Record<string, number>)[c] += v;
  return s;
}

export interface BilanPortee {
  ici: PartsPortee;
  region: PartsPortee | null;
  france: PartsPortee;
  /** La date des cartes 4G, le lundi de la semaine comptée, la date du calcul des distances. */
  au: string | null;
  semaine: string | null;
  maj: string | null;
}

/** Le territoire, sa région quand c'est un département, et la France entière ; rien quand aucun fichier ne couvre le territoire. */
export function bilanPortee(deps: string[], region: string[] | null): BilanPortee | null {
  const ici = additionner(deps);
  if (!ici.mobile.h && !ici.car.communes && !ici.arrets.h && !ici.medecin.h) return null;
  const tous = [...new Set(communes().map((x) => x.dep))];
  const premier = <T>(f: (dep: string) => T | null | undefined) => deps.map(f).find((x) => x) ?? null;
  return {
    ici,
    region: region && region.length > deps.length ? additionner(region) : null,
    france: additionner(tous),
    au: premier((d) => couvertureDep.get(d)?.au),
    semaine: premier((d) => transportsDep.get(d)?.s),
    maj: premier((d) => accesDep.get(d)?.maj),
  };
}
