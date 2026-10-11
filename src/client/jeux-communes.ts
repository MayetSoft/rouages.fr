/**
 * Les communes d'un périmètre, pour la commune mystère et « Plus ou moins » :
 * lues dans `/jeux/communes/XX.json`, et élargies aux voisines quand le lieu
 * choisi n'en compte pas assez — un code postal de trois villages ne fait pas
 * une partie.
 */
import { departementDe, type Lieu } from './jeux-lieu.ts';

/** [clé, libellé, unité, source et millésime] */
export type Indicateur = [string, string, string, string];
/** [nom, code postal, longitude, latitude, voisines, intercommunalité, valeurs, contours encodés] */
export type CommuneJeu = [string, string, number, number, string[], string, (number | null)[], number[][]];
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

/** Les anneaux d'une commune, décodés en degrés. */
export function anneaux(c: CommuneJeu): [number, number][][] {
  return (c[7] ?? []).map((r) => {
    const sortie: [number, number][] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i + 1 < r.length; i += 2) {
      x += r[i];
      y += r[i + 1];
      sortie.push([x / 10_000, y / 10_000]);
    }
    return sortie;
  });
}

/**
 * La carte d'un ensemble de communes, en SVG : une projection simple, à la
 * latitude moyenne, qui suffit à l'échelle d'un département. `classe` donne
 * à chaque commune sa classe CSS, `titre` son infobulle.
 */
export function carte(communes: Communes, codes: string[], classe: (code: string) => string, titre: (code: string) => string): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const formes = codes.map((code) => ({ code, a: anneaux(communes.c[code]) }));
  const points = formes.flatMap((f) => f.a.flat());
  const lat = points.reduce((s, p) => s + p[1], 0) / Math.max(1, points.length);
  const k = Math.cos((lat * Math.PI) / 180);
  const xs = points.map((p) => p[0] * k);
  const ys = points.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const marge = Math.max(x1 - x0, y1 - y0) * 0.03;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x0 - marge} ${y0 - marge} ${x1 - x0 + 2 * marge} ${y1 - y0 + 2 * marge}`);
  svg.setAttribute('role', 'img');
  for (const f of formes) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', f.a.map((r) => `M${r.map((p) => `${(p[0] * k).toFixed(5)},${(-p[1]).toFixed(5)}`).join('L')}Z`).join(''));
    path.setAttribute('class', classe(f.code));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    const t = document.createElementNS(NS, 'title');
    t.textContent = titre(f.code);
    path.append(t);
    svg.append(path);
  }
  return svg;
}
