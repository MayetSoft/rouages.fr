/**
 * Lire les formats géographiques que publient les services régionaux, sans
 * bibliothèque : le GML 3.1.1 d'un WFS de MapServer et le Shapefile en
 * archive zip, projeté en Lambert 93. Tout sort en entités GeoJSON, en
 * longitude et latitude WGS 84 (RGF93 et WGS 84 se confondent au mètre près).
 *
 * Ce qui est lu : les polygones et leurs trous, et les attributs. Le reste
 * (courbes, points d'un Shapefile, géométries en Z) est ignoré.
 */
import { execFileSync } from 'node:child_process';

export type EntiteGeo = { properties: Record<string, string>; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } | null };

/* ------------------------------------------------------------------ *
 * GML
 * ------------------------------------------------------------------ */

const decoderXml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/**
 * Les entités d'une réponse GetFeature en GML 3.1.1. `latLon` : l'ordre des
 * axes du système demandé — EPSG:4326 en WFS 1.1.0 donne la latitude d'abord.
 */
export function lireGml(texte: string, latLon = true): EntiteGeo[] {
  const entites: EntiteGeo[] = [];
  for (const m of texte.matchAll(/<gml:featureMember>([\s\S]*?)<\/gml:featureMember>/g)) {
    const corps = m[1];
    const properties: Record<string, string> = {};
    for (const [, k, v] of corps.matchAll(/<ms:([A-Za-z_0-9]+)>([^<]*)<\/ms:\1>/g)) properties[k] = decoderXml(v).trim();
    const polygones: number[][][][] = [];
    for (const p of corps.matchAll(/<gml:Polygon[^>]*>([\s\S]*?)<\/gml:Polygon>/g)) {
      const anneaux: number[][][] = [];
      for (const [, liste] of p[1].matchAll(/<gml:posList[^>]*>([^<]*)<\/gml:posList>/g)) {
        const n = liste.trim().split(/\s+/).map(Number);
        const anneau: number[][] = [];
        for (let i = 0; i + 1 < n.length; i += 2) anneau.push(latLon ? [n[i + 1], n[i]] : [n[i], n[i + 1]]);
        if (anneau.length >= 4) anneaux.push(anneau);
      }
      if (anneaux.length) polygones.push(anneaux);
    }
    entites.push({ properties, geometry: polygones.length ? { type: 'MultiPolygon', coordinates: polygones } : null });
  }
  return entites;
}

/* ------------------------------------------------------------------ *
 * Lambert 93 → longitude, latitude
 * ------------------------------------------------------------------ */

/** RGF93 / Lambert 93 (EPSG:2154) : conique conforme sécante, ellipsoïde GRS 80. */
const L93 = { a: 6378137, f: 1 / 298.257222101, phi1: 49, phi2: 44, phi0: 46.5, lambda0: 3, x0: 700000, y0: 6600000 };
const rad = Math.PI / 180;
const e = Math.sqrt(L93.f * (2 - L93.f));
const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - (e * Math.sin(phi)) ** 2);
const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
const N = (Math.log(m(L93.phi1 * rad)) - Math.log(m(L93.phi2 * rad))) / (Math.log(t(L93.phi1 * rad)) - Math.log(t(L93.phi2 * rad)));
const F = m(L93.phi1 * rad) / (N * t(L93.phi1 * rad) ** N);
const RHO0 = L93.a * F * t(L93.phi0 * rad) ** N;

/** Un point en Lambert 93, en mètres, vers [longitude, latitude] en degrés. */
export function depuisLambert93(x: number, y: number): [number, number] {
  const dx = x - L93.x0;
  const dy = RHO0 - (y - L93.y0);
  const rho = Math.sign(N) * Math.hypot(dx, dy);
  const tt = (rho / (L93.a * F)) ** (1 / N);
  const theta = Math.atan2(dx, dy);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 8; i++) {
    const s = e * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tt * ((1 - s) / (1 + s)) ** (e / 2));
  }
  return [theta / N / rad + L93.lambda0, phi / rad];
}

/* ------------------------------------------------------------------ *
 * LAEA Europe et UTM → longitude, latitude
 * ------------------------------------------------------------------ */

const e2 = e * e;
const q = (phi: number) => {
  const s = Math.sin(phi);
  return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log((1 - e * s) / (1 + e * s)));
};
/** ETRS89 / LAEA Europe (EPSG:3035) : azimutale équivalente de Lambert, centrée sur 52° N, 10° E — celle du carroyage de l'INSEE. */
const LAEA = { phi1: 52 * rad, lambda0: 10 * rad, x0: 4321000, y0: 3210000 };
const QP = q(Math.PI / 2);
const BETA1 = Math.asin(q(LAEA.phi1) / QP);
const RQ = L93.a * Math.sqrt(QP / 2);
const D = (L93.a * m(LAEA.phi1)) / (RQ * Math.cos(BETA1));

/** Un point en LAEA Europe, en mètres, vers [longitude, latitude] en degrés (formules de Snyder, ellipsoïde GRS 80). */
export function depuisLaea3035(x: number, y: number): [number, number] {
  const dx = x - LAEA.x0;
  const dy = y - LAEA.y0;
  const rho = Math.hypot(dx / D, D * dy);
  if (rho === 0) return [LAEA.lambda0 / rad, LAEA.phi1 / rad];
  const c = 2 * Math.asin(rho / (2 * RQ));
  const beta = Math.asin(Math.cos(c) * Math.sin(BETA1) + (D * dy * Math.sin(c) * Math.cos(BETA1)) / rho);
  const lambda = LAEA.lambda0 + Math.atan2(dx * Math.sin(c), D * rho * Math.cos(BETA1) * Math.cos(c) - D * D * dy * Math.sin(BETA1) * Math.sin(c));
  const phi =
    beta +
    (e2 / 3 + (31 * e2 * e2) / 180 + (517 * e2 ** 3) / 5040) * Math.sin(2 * beta) +
    ((23 * e2 * e2) / 360 + (251 * e2 ** 3) / 3780) * Math.sin(4 * beta) +
    ((761 * e2 ** 3) / 45360) * Math.sin(6 * beta);
  return [lambda / rad, phi / rad];
}

/**
 * Un point en UTM, en mètres, vers [longitude, latitude] en degrés : la
 * projection des cartes et du carroyage d'outre-mer (RGAF09 aux Antilles,
 * RGFG95 en Guyane, RGR92 à La Réunion, RGM04 à Mayotte — des repères
 * calés sur le même ellipsoïde GRS 80, à moins d'un mètre de WGS 84).
 * Série de Snyder pour la Mercator transverse inverse.
 */
export function depuisUtm(x: number, y: number, zone: number, sud: boolean): [number, number] {
  const k0 = 0.9996;
  const ep2 = e2 / (1 - e2);
  const M = (sud ? y - 10_000_000 : y) / k0;
  const mu = M / (L93.a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1);
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = L93.a / Math.sqrt(1 - e2 * s * s);
  const r1 = (L93.a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const d = (x - 500_000) / (n1 * k0);
  const phi =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      ((d * d) / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lambda = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) / Math.cos(phi1);
  return [(zone * 6 - 183) + lambda / rad, phi / rad];
}

/* ------------------------------------------------------------------ *
 * Shapefile
 * ------------------------------------------------------------------ */

/** Un fichier d'une archive zip, par `unzip -p` comme les autres collectes. */
function extraire(zip: string, membre: string): Buffer {
  return execFileSync('unzip', ['-p', zip, membre], { maxBuffer: 512 * 1024 * 1024 });
}

/** La table attributaire : UTF-8 si elle en est, Windows-1252 sinon (les fichiers sans .cpg ; l'apostrophe typographique y est l'octet 0x92). */
function lireDbf(b: Buffer): Record<string, string>[] {
  const n = b.readUInt32LE(4);
  const entete = b.readUInt16LE(8);
  const ligne = b.readUInt16LE(10);
  const champs: [string, number][] = [];
  for (let o = 32; b[o] !== 0x0d; o += 32) champs.push([b.subarray(o, o + 11).toString('latin1').replace(/\0.*$/, ''), b[o + 16]]);
  const utf8 = (() => {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(entete));
      return true;
    } catch {
      return false;
    }
  })();
  const ansi = new TextDecoder('windows-1252');
  const lignes: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    const r = b.subarray(entete + i * ligne, entete + (i + 1) * ligne);
    if (r[0] === 0x2a) continue; // supprimée
    const l: Record<string, string> = {};
    let o = 1;
    for (const [nom, taille] of champs) {
      const brut = r.subarray(o, o + taille);
      l[nom] = (utf8 ? brut.toString('utf8') : ansi.decode(brut)).trim();
      o += taille;
    }
    lignes.push(l);
  }
  return lignes;
}

/**
 * Les polygones d'une couche (`membre` : le chemin du .shp dans l'archive,
 * sans extension), en Lambert 93, convertis en WGS 84. Les anneaux d'un
 * polygone sont gardés ensemble : le test pair-impair des collectes traite
 * les trous sans avoir à les distinguer.
 */
export function lireShapefile(zip: string, membre: string): EntiteGeo[] {
  const shp = extraire(zip, `${membre}.shp`);
  const attributs = lireDbf(extraire(zip, `${membre}.dbf`));
  const entites: EntiteGeo[] = [];
  let k = 0;
  for (let o = 100; o + 8 <= shp.length; ) {
    const longueur = shp.readInt32BE(o + 4) * 2;
    const type = shp.readInt32LE(o + 8);
    const corps = o + 8;
    if (type === 5 || type === 15 || type === 25) {
      const nParts = shp.readInt32LE(corps + 36);
      const nPoints = shp.readInt32LE(corps + 40);
      const parts = Array.from({ length: nParts }, (_, i) => shp.readInt32LE(corps + 44 + 4 * i));
      const p0 = corps + 44 + 4 * nParts;
      const anneaux: number[][][] = [];
      for (let i = 0; i < nParts; i++) {
        const fin = i + 1 < nParts ? parts[i + 1] : nPoints;
        const anneau: number[][] = [];
        for (let j = parts[i]; j < fin; j++) anneau.push(depuisLambert93(shp.readDoubleLE(p0 + 16 * j), shp.readDoubleLE(p0 + 16 * j + 8)));
        if (anneau.length >= 4) anneaux.push(anneau);
      }
      entites.push({ properties: attributs[k] ?? {}, geometry: anneaux.length ? { type: 'MultiPolygon', coordinates: [anneaux] } : null });
    } else {
      entites.push({ properties: attributs[k] ?? {}, geometry: null });
    }
    k++;
    o = corps + longueur;
  }
  return entites;
}
