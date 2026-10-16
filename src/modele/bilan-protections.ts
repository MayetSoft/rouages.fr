/**
 * Ce qui protège et engage les communes d'un département ou d'une région, en
 * un bilan : les parcs naturels régionaux et nationaux, nommés, avec leurs
 * communes ; les sites Natura 2000 ; les biens du patrimoine mondial ; les
 * plans climat des intercommunalités. Rien n'est collecté ici : tout vient des
 * fichiers que la page de commune lit déjà, réunis.
 */
import { espacesDuDepartement } from './carte.ts';
import { patrimoineMondial, type BienMondial, type RattachementMondial } from './patrimoine-mondial.ts';
import { pcaet } from './pcaet.ts';
import { communes, intercommunalites } from './territoires.ts';

export interface ParcBilan {
  nom: string;
  /** Les communes du territoire qui y sont, de la plus peuplée à la moins peuplée. */
  communes: { code: string; nom: string }[];
}

export interface BienBilan extends BienMondial {
  id: number;
  communes: { code: string; nom: string; mode: RattachementMondial[1] }[];
}

export interface BilanProtections {
  /** Les communes du territoire, toutes. */
  total: number;
  pnr: ParcBilan[];
  parcsNationaux: ParcBilan[];
  /** Communes touchées par au moins un site Natura 2000, et nombre de sites. */
  natura2000: { communes: number; sites: number };
  biens: BienBilan[];
  /** Intercommunalités à fiscalité propre du territoire, et celles qui portent un plan au registre de l'ADEME. */
  plans: { intercos: number; avecPlan: number; communesCouvertes: number };
  majEspaces: string | null;
  majPlans: string | null;
}

export function bilanProtections(deps: string[]): BilanProtections | null {
  const ici = communes().filter((x) => deps.includes(x.dep)).sort((a, b) => b.population - a.population);
  if (!ici.length) return null;
  const nomDe = new Map(ici.map((x) => [x.code, x.nom]));
  const ordre = new Map(ici.map((x, i) => [x.code, i]));

  // Les parcs et Natura 2000, d'après les fichiers des espaces naturels.
  const parcs = new Map<string, { nature: 'pnr' | 'pn'; nom: string; codes: Set<string> }>();
  const sitesNatura = new Set<string>();
  const communesNatura = new Set<string>();
  let majEspaces: string | null = null;
  for (const dep of deps) {
    const d = espacesDuDepartement(dep);
    if (!d) continue;
    majEspaces = d.maj;
    for (const [code, zones] of Object.entries(d.c)) {
      if (!nomDe.has(code)) continue;
      for (const [rang, cle] of zones) {
        if (rang === 4 || rang === 5) {
          sitesNatura.add(cle);
          communesNatura.add(code);
        }
        if (rang !== 8 && rang !== 0 && rang !== 9) continue;
        const nom = d.z[cle]?.[0] ?? cle;
        // Le cœur et l'aire d'adhésion d'un parc national sont un même parc.
        const nature = rang === 8 ? 'pnr' : 'pn';
        // L'INPN écrit « Ecrins » pour le cœur et « Ecrins [Aire D'Adhésion] » pour l'aire.
        const k = `${nature}|${nom.replace(/\s*\[aire d['’]adh[ée]sion\]\s*$/i, '')}`;
        const p = parcs.get(k) ?? { nature, nom: k.split('|')[1], codes: new Set<string>() };
        p.codes.add(code);
        parcs.set(k, p);
      }
    }
  }
  const versListe = (nature: 'pnr' | 'pn') =>
    [...parcs.values()]
      .filter((p) => p.nature === nature)
      .map((p) => ({ nom: p.nom, communes: [...p.codes].sort((a, b) => ordre.get(a)! - ordre.get(b)!).map((code) => ({ code, nom: nomDe.get(code)! })) }))
      .sort((a, b) => b.communes.length - a.communes.length || a.nom.localeCompare(b.nom, 'fr'));

  // Le patrimoine mondial.
  const mondial = patrimoineMondial();
  const parBien = new Map<number, BienBilan>();
  for (const [code, liste] of Object.entries(mondial?.c ?? {})) {
    if (!nomDe.has(code)) continue;
    for (const [id, mode] of liste) {
      const b = mondial!.biens[String(id)];
      if (!b) continue;
      const e = parBien.get(id) ?? { ...b, id, communes: [] };
      e.communes.push({ code, nom: nomDe.get(code)!, mode });
      parBien.set(id, e);
    }
  }
  for (const b of parBien.values()) b.communes.sort((a, c) => ordre.get(a.code)! - ordre.get(c.code)!);

  // Les plans climat.
  const registre = pcaet();
  const intercos = intercommunalites(deps);
  const avecPlan = intercos.filter((e) => registre?.c[e.siren]);
  const couvertes = new Set(avecPlan.flatMap((e) => e.communes.map((x) => x.code)).filter((code) => nomDe.has(code)));

  return {
    total: ici.length,
    pnr: versListe('pnr'),
    parcsNationaux: versListe('pn'),
    natura2000: { communes: communesNatura.size, sites: sitesNatura.size },
    biens: [...parBien.values()].sort((a, b) => b.communes.length - a.communes.length || a.nom.localeCompare(b.nom, 'fr')),
    plans: { intercos: intercos.length, avecPlan: avecPlan.length, communesCouvertes: couvertes.size },
    majEspaces,
    majPlans: registre?.maj ?? null,
  };
}

/** Ce que compte la comparaison, en communes : toutes, puis celles que chaque protection ou engagement touche. */
export interface PartsProtections {
  total: number;
  pnr: number;
  parcNational: number;
  natura2000: number;
  mondial: number;
  plan: number;
}

const PARTS_VIDES: PartsProtections = { total: 0, pnr: 0, parcNational: 0, natura2000: 0, mondial: 0, plan: 0 };
const partsParDep = new Map<string, PartsProtections>();
let couvertesFrance: Set<string> | null = null;

/** Les comptes d'un département, faits une fois pour tout le build : chaque page de département et de région les additionne. */
function partsDuDepartement(dep: string): PartsProtections {
  const deja = partsParDep.get(dep);
  if (deja) return deja;
  // Les communes couvertes par un plan climat, d'après l'intercommunalité qui le porte, où qu'elle ait son siège.
  if (!couvertesFrance) {
    const registre = pcaet();
    couvertesFrance = new Set(intercommunalites().filter((e) => registre?.c[e.siren]).flatMap((e) => e.communes.map((x) => x.code)));
  }
  const ici = communes().filter((x) => x.dep === dep);
  const codes = new Set(ici.map((x) => x.code));
  const avec = (rangs: number[]) => {
    const d = espacesDuDepartement(dep);
    if (!d) return 0;
    return Object.entries(d.c).filter(([code, zones]) => codes.has(code) && zones.some(([r]) => rangs.includes(r))).length;
  };
  const mondial = patrimoineMondial()?.c ?? {};
  const p: PartsProtections = {
    total: ici.length,
    pnr: avec([8]),
    parcNational: avec([0, 9]),
    natura2000: avec([4, 5]),
    mondial: ici.filter((x) => mondial[x.code]?.length).length,
    plan: ici.filter((x) => couvertesFrance!.has(x.code)).length,
  };
  partsParDep.set(dep, p);
  return p;
}

const additionner = (deps: string[]): PartsProtections =>
  deps.map(partsDuDepartement).reduce(
    (s, p) => ({
      total: s.total + p.total,
      pnr: s.pnr + p.pnr,
      parcNational: s.parcNational + p.parcNational,
      natura2000: s.natura2000 + p.natura2000,
      mondial: s.mondial + p.mondial,
      plan: s.plan + p.plan,
    }),
    PARTS_VIDES,
  );

/**
 * Le territoire, sa région quand c'est un département, et la France entière :
 * les mêmes comptes, faits des mêmes fichiers, pour situer un département
 * parmi ses voisins sans rien calculer de neuf.
 */
export function comparaisonProtections(deps: string[], region: string[] | null): { ici: PartsProtections; region: PartsProtections | null; france: PartsProtections } {
  const tous = [...new Set(communes().map((x) => x.dep))];
  return { ici: additionner(deps), region: region && region.length > deps.length ? additionner(region) : null, france: additionner(tous) };
}
