/**
 * Les communes d'un périmètre, pour la commune mystère et « Plus ou moins » :
 * lues dans `/jeux/communes/XX.json`, et élargies aux voisines quand le lieu
 * choisi n'en compte pas assez — un code postal de trois villages ne fait pas
 * une partie.
 */
import { departementDe, type Lieu } from './jeux-lieu.ts';

/** [clé, libellé, unité, source et millésime] */
export type Indicateur = [string, string, string, string];
/** [nom, code postal, longitude, latitude, voisines, intercommunalité, valeurs] */
export type CommuneJeu = [string, string, number, number, string[], string, (number | null)[]];
export type Communes = { i: Indicateur[]; c: Record<string, CommuneJeu> };

const fichiers = new Map<string, Promise<Communes>>();
function chargerDep(dep: string): Promise<Communes> {
  if (!fichiers.has(dep)) {
    const l = fetch(`/jeux/communes/${dep}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Communes>;
    });
    l.catch(() => fichiers.delete(dep));
    fichiers.set(dep, l);
  }
  return fichiers.get(dep)!;
}

async function charger(deps: Iterable<string>, dans: Communes): Promise<void> {
  const lus = await Promise.all([...new Set(deps)].map((d) => chargerDep(d).catch(() => null)));
  for (const f of lus) {
    if (!f) continue;
    dans.i = f.i;
    Object.assign(dans.c, f.c);
  }
}

/**
 * Le périmètre d'un lieu : ses communes, puis, tant qu'il en manque, les
 * voisines de celles qu'on a — un anneau après l'autre, trois au plus.
 */
export async function perimetre(lieu: Lieu, minimum: number): Promise<{ codes: string[]; communes: Communes; elargi: boolean }> {
  const communes: Communes = { i: [], c: {} };
  await charger(lieu.deps, communes);
  let codes = new Set((lieu.communes ?? Object.keys(communes.c).filter((c) => lieu.deps.includes(departementDe(c)))).filter((c) => communes.c[c]));
  let elargi = false;
  for (let anneau = 0; codes.size < minimum && anneau < 3; anneau++) {
    const voisines = new Set<string>();
    for (const c of codes) for (const v of communes.c[c]?.[4] ?? []) if (!codes.has(v)) voisines.add(v);
    if (voisines.size === 0) break;
    await charger([...voisines].map(departementDe).filter((d) => !lieu.deps.includes(d)), communes);
    codes = new Set([...codes, ...[...voisines].filter((v) => communes.c[v])]);
    elargi = true;
  }
  return { codes: [...codes].sort(), communes, elargi };
}

/** La distance à vol d'oiseau, en kilomètres. */
export function distance(a: CommuneJeu, b: CommuneJeu): number {
  const rad = Math.PI / 180;
  const dLat = (b[3] - a[3]) * rad;
  const dLon = (b[2] - a[2]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[3] * rad) * Math.cos(b[3] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** La direction de a vers b, en flèche : ↑ le nord, → l'est. */
export function direction(a: CommuneJeu, b: CommuneJeu): string {
  const rad = Math.PI / 180;
  const y = Math.sin((b[2] - a[2]) * rad) * Math.cos(b[3] * rad);
  const x = Math.cos(a[3] * rad) * Math.sin(b[3] * rad) - Math.sin(a[3] * rad) * Math.cos(b[3] * rad) * Math.cos((b[2] - a[2]) * rad);
  const cap = (Math.atan2(y, x) / rad + 360) % 360;
  return ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'][Math.round(cap / 45) % 8];
}

export const nombre = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
