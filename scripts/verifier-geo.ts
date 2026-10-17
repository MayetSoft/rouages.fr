/**
 * Vérifie les lecteurs de `geo-formats.ts` : la projection Lambert 93, le GML
 * d'un WFS, le Shapefile en archive zip, les projections LAEA Europe (le
 * carroyage de l'INSEE) et UTM (l'outre-mer) ; et ceux de la couverture mobile
 * (`couverture-emettre.ts`) : la géométrie d'un GeoPackage et la grille qui
 * mesure la part couverte d'une commune.
 *
 * Une erreur y serait muette : un axe inversé, une projection décalée de
 * quelques kilomètres ou une table lue dans le mauvais encodage ne font pas
 * échouer la collecte — ils rattachent un bien du patrimoine mondial à la
 * mauvaise commune, ou à aucune. Les cas sont donc fixés ici, sur des
 * fichiers fabriqués à la main dont on connaît la réponse.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { km, medecins, Voisinage } from './acces-emettre.ts';
import { distance, phraseArrets, phraseMedecin } from '../src/modele/distances.ts';
import { anneauxGpkg, poser } from './couverture-emettre.ts';
import { depuisLaea3035, depuisLambert93, depuisUtm, lireGml, lireShapefile } from './geo-formats.ts';
import { zip } from './zip-essai.ts';

const ROUGE = '\x1b[31m', VERT = '\x1b[32m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

function attendre(quoi: string, ok: boolean, obtenu: unknown, pourquoi: string) {
  if (!ok) echecs++;
  console.log(`${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}${quoi} → ${JSON.stringify(obtenu)}\n      ${GRIS}${pourquoi}${RAZ}`);
}
const proche = (a: number[], b: number[], tol: number) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= tol);

/* ------------------------------------------------------------------ *
 * Lambert 93
 * ------------------------------------------------------------------ */

// La projection directe, écrite ici à part d'après les mêmes constantes de
// définition (EPSG:2154), pour vérifier que l'inverse la défait.
function versLambert93(lon: number, lat: number): [number, number] {
  const rad = Math.PI / 180;
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e = Math.sqrt(f * (2 - f));
  const m = (p: number) => Math.cos(p) / Math.sqrt(1 - (e * Math.sin(p)) ** 2);
  const t = (p: number) => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const [p1, p2, p0] = [49 * rad, 44 * rad, 46.5 * rad];
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
  const F = m(p1) / (n * t(p1) ** n);
  const rho0 = a * F * t(p0) ** n;
  const rho = a * F * t(lat * rad) ** n;
  const theta = n * (lon - 3) * rad;
  return [700000 + rho * Math.sin(theta), 6600000 + rho0 - rho * Math.cos(theta)];
}

attendre(
  'Lambert 93, origine (700 000 ; 6 600 000)',
  proche(depuisLambert93(700000, 6600000), [3, 46.5], 1e-9),
  depuisLambert93(700000, 6600000),
  'Par définition, le méridien central (3° E) et la latitude d’origine (46° 30′ N).',
);
for (const [nom, lon, lat] of [
  ['Le Mayet-de-Montagne', 3.668, 46.072],
  ['Dunkerque', 2.377, 51.034],
  ['Bonifacio', 9.159, 41.387],
  ['Brest', -4.486, 48.39],
] as const) {
  const [x, y] = versLambert93(lon, lat);
  const retour = depuisLambert93(x, y);
  attendre(`aller-retour, ${nom}`, proche(retour, [lon, lat], 1e-8), retour.map((v) => Number(v.toFixed(9))), 'L’inverse défait la projection directe, aux extrémités de la France comme au centre.');
}

/* ------------------------------------------------------------------ *
 * GML
 * ------------------------------------------------------------------ */

const gml = `<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml">
<gml:featureMember><ms:couche>
  <ms:nom_site>Le Havre, la ville reconstruite par Auguste Perret</ms:nom_site>
  <ms:type>Bien</ms:type>
  <ms:note>d&#39;apr&#232;s &amp; c&#244;t&#233;</ms:note>
  <ms:geometry><gml:MultiSurface srsName="EPSG:4326"><gml:surfaceMember><gml:Polygon>
    <gml:exterior><gml:LinearRing><gml:posList srsDimension="2">49.0 0.0 49.0 1.0 50.0 1.0 50.0 0.0 49.0 0.0</gml:posList></gml:LinearRing></gml:exterior>
    <gml:interior><gml:LinearRing><gml:posList srsDimension="2">49.4 0.4 49.4 0.6 49.6 0.6 49.6 0.4 49.4 0.4</gml:posList></gml:LinearRing></gml:interior>
  </gml:Polygon></gml:surfaceMember></gml:MultiSurface></ms:geometry>
</ms:couche></gml:featureMember>
<gml:featureMember><ms:couche><ms:nom_site>Sans géométrie</ms:nom_site></ms:couche></gml:featureMember>
</wfs:FeatureCollection>`;
const g = lireGml(gml);
attendre('GML : deux entités', g.length === 2, g.length, 'Une entité sans géométrie reste comptée, avec une géométrie nulle.');
attendre(
  'GML : axes remis en longitude, latitude',
  JSON.stringify(g[0].geometry?.coordinates[0][0][1]) === '[1,49]',
  g[0].geometry?.coordinates[0][0][1],
  'En WFS 1.1.0, EPSG:4326 donne la latitude d’abord ; GeoJSON veut la longitude d’abord.',
);
attendre('GML : le trou est gardé', g[0].geometry?.coordinates[0].length === 2, g[0].geometry?.coordinates[0].length, 'Un anneau intérieur est un trou du polygone, pas un polygone de plus.');
attendre('GML : entités XML décodées', g[0].properties.note === "d'après & côté", g[0].properties.note, 'Les noms de biens portent des apostrophes et des accents encodés.');
attendre('GML : sans géométrie', g[1].geometry === null, g[1].geometry, 'Rien n’est inventé.');

/* ------------------------------------------------------------------ *
 * Shapefile
 * ------------------------------------------------------------------ */

/** Un Shapefile d'un polygone (un anneau extérieur, un trou), en Lambert 93. */
function shp(anneaux: [number, number][][]): Buffer {
  const points = anneaux.flat();
  const contenu = 44 + 4 * anneaux.length + 16 * points.length;
  const b = Buffer.alloc(100 + 8 + contenu);
  b.writeInt32BE(9994, 0);
  b.writeInt32BE(b.length / 2, 24);
  b.writeInt32LE(1000, 28);
  b.writeInt32LE(5, 32);
  b.writeInt32BE(1, 100);
  b.writeInt32BE(contenu / 2, 104);
  const o = 108;
  b.writeInt32LE(5, o);
  b.writeInt32LE(anneaux.length, o + 36);
  b.writeInt32LE(points.length, o + 40);
  let debut = 0;
  anneaux.forEach((r, i) => {
    b.writeInt32LE(debut, o + 44 + 4 * i);
    debut += r.length;
  });
  points.forEach(([x, y], j) => {
    b.writeDoubleLE(x, o + 44 + 4 * anneaux.length + 16 * j);
    b.writeDoubleLE(y, o + 44 + 4 * anneaux.length + 16 * j + 8);
  });
  return b;
}

/** Une table d'un champ texte, avec un octet Windows-1252 (0x92, l'apostrophe typographique) et un « é » (0xE9). */
function dbf(valeur: Buffer): Buffer {
  const taille = 40;
  const b = Buffer.alloc(32 + 32 + 1 + 1 + taille + 1, 0x20);
  b.fill(0, 0, 65);
  b[0] = 3;
  b.writeUInt32LE(1, 4);
  b.writeUInt16LE(32 + 32 + 1, 8);
  b.writeUInt16LE(1 + taille, 10);
  b.write('nom', 32, 'latin1');
  b[32 + 11] = 0x43;
  b[32 + 16] = taille;
  b[64] = 0x0d;
  valeur.copy(b, 66);
  b[b.length - 1] = 0x1a;
  return b;
}

const dossier = mkdtempSync(join(tmpdir(), 'verifier-geo-'));
try {
  const exterieur: [number, number][] = [[700000, 6600000], [700000, 6610000], [710000, 6610000], [710000, 6600000], [700000, 6600000]];
  const trou: [number, number][] = [[702000, 6602000], [708000, 6602000], [708000, 6608000], [702000, 6608000], [702000, 6602000]];
  const archive = join(dossier, 'essai.zip');
  writeFileSync(
    archive,
    zip([
      ['couche/biens.shp', shp([exterieur, trou])],
      ['couche/biens.dbf', dbf(Buffer.concat([Buffer.from('Saline d', 'latin1'), Buffer.from([0x92]), Buffer.from('Arc-et-Senans, été', 'latin1')]))],
    ]),
  );
  const s = lireShapefile(archive, 'couche/biens');
  attendre('Shapefile : une entité', s.length === 1, s.length, 'Un enregistrement, un polygone.');
  attendre('Shapefile : deux anneaux', s[0]?.geometry?.coordinates[0].length === 2, s[0]?.geometry?.coordinates[0].length, 'L’extérieur et le trou, gardés ensemble.');
  attendre(
    'Shapefile : premier sommet projeté',
    proche(s[0]?.geometry?.coordinates[0][0][0] ?? [], [3, 46.5], 1e-9),
    s[0]?.geometry?.coordinates[0][0][0],
    'Le sommet (700 000 ; 6 600 000) est l’origine du Lambert 93.',
  );
  attendre(
    'Shapefile : table en Windows-1252',
    s[0]?.properties.nom === 'Saline d’Arc-et-Senans, été',
    s[0]?.properties.nom,
    'Sans fichier .cpg, l’octet 0x92 est l’apostrophe typographique et 0xE9 le « é » — la table de Bourgogne-Franche-Comté est ainsi.',
  );
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ *
 * LAEA Europe (carroyage de l'INSEE) et UTM (outre-mer)
 * ------------------------------------------------------------------ */

{
  // Les projections directes, écrites ici à part (Snyder), pour vérifier que les inverses de `geo-formats.ts` les défont.
  const rad = Math.PI / 180;
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const q = (p: number) => (1 - e2) * (Math.sin(p) / (1 - e2 * Math.sin(p) ** 2) - (1 / (2 * e)) * Math.log((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))));
  const versLaea = (lon: number, lat: number): [number, number] => {
    const p1 = 52 * rad;
    const l0 = 10 * rad;
    const qp = q(Math.PI / 2);
    const b1 = Math.asin(q(p1) / qp);
    const rq = a * Math.sqrt(qp / 2);
    const d = (a * (Math.cos(p1) / Math.sqrt(1 - e2 * Math.sin(p1) ** 2))) / (rq * Math.cos(b1));
    const b = Math.asin(q(lat * rad) / qp);
    const bb = rq * Math.sqrt(2 / (1 + Math.sin(b1) * Math.sin(b) + Math.cos(b1) * Math.cos(b) * Math.cos(lon * rad - l0)));
    return [4321000 + bb * d * Math.cos(b) * Math.sin(lon * rad - l0), 3210000 + (bb / d) * (Math.cos(b1) * Math.sin(b) - Math.sin(b1) * Math.cos(b) * Math.cos(lon * rad - l0))];
  };
  const versUtm = (lon: number, lat: number, zone: number, sud: boolean): [number, number] => {
    const k0 = 0.9996;
    const ep2 = e2 / (1 - e2);
    const p = lat * rad;
    const n = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
    const t = Math.tan(p) ** 2;
    const c = ep2 * Math.cos(p) ** 2;
    const A = (lon - (zone * 6 - 183)) * rad * Math.cos(p);
    const m =
      a *
      ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * p -
        ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) +
        ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) -
        ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
    const x = 500000 + k0 * n * (A + ((1 - t + c) * A ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * ep2) * A ** 5) / 120);
    const y = k0 * (m + n * Math.tan(p) * ((A * A) / 2 + ((5 - t + 9 * c + 4 * c * c) * A ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * ep2) * A ** 6) / 720));
    return [x, sud ? y + 10_000_000 : y];
  };
  for (const [nom, lon, lat] of [
    ['Le Mayet-de-Montagne', 3.668, 46.072],
    ['Dunkerque', 2.377, 51.034],
    ['Bonifacio', 9.159, 41.387],
    ['Brest', -4.486, 48.39],
  ] as const) {
    const [x, y] = versLaea(lon, lat);
    attendre(`LAEA aller-retour : ${nom}`, proche(depuisLaea3035(x, y), [lon, lat], 1e-7), depuisLaea3035(x, y), 'La projection du carroyage de l’INSEE, défaite à un centimètre près.');
  }
  for (const [nom, lon, lat, zone, sud] of [
    ['Fort-de-France', -61.07, 14.6, 20, false],
    ['Pointe-à-Pitre', -61.53, 16.24, 20, false],
    ['Cayenne', -52.33, 4.94, 22, false],
    ['Saint-Denis de La Réunion', 55.45, -20.88, 40, true],
    ['Mamoudzou', 45.23, -12.78, 38, true],
  ] as const) {
    const [x, y] = versUtm(lon, lat, zone, sud);
    attendre(`UTM aller-retour : ${nom}`, proche(depuisUtm(x, y, zone, sud), [lon, lat], 1e-6), depuisUtm(x, y, zone, sud), 'La projection des cartes et du carroyage d’outre-mer, défaite à dix centimètres près.');
  }
}

/* ------------------------------------------------------------------ *
 * GeoPackage et grille de la couverture mobile
 * ------------------------------------------------------------------ */

{
  // Un multipolygone en Lambert 93 : un carré de 10 km et son trou de 6 km, derrière l'en-tête GeoPackage sans cadre.
  const anneau = (pts: [number, number][]) => {
    const b = Buffer.alloc(4 + pts.length * 16);
    b.writeUInt32LE(pts.length, 0);
    pts.forEach(([x, y], i) => {
      b.writeDoubleLE(x, 4 + i * 16);
      b.writeDoubleLE(y, 12 + i * 16);
    });
    return b;
  };
  const ext: [number, number][] = [[700000, 6600000], [710000, 6600000], [710000, 6610000], [700000, 6610000], [700000, 6600000]];
  const trou: [number, number][] = [[702000, 6602000], [702000, 6608000], [708000, 6608000], [708000, 6602000], [702000, 6602000]];
  const polygone = Buffer.concat([Buffer.from([1]), Buffer.from(Uint32Array.of(3).buffer), Buffer.from(Uint32Array.of(2).buffer), anneau(ext), anneau(trou)]);
  const multi = Buffer.concat([Buffer.from([1]), Buffer.from(Uint32Array.of(6).buffer), Buffer.from(Uint32Array.of(1).buffer), polygone]);
  const entete = Buffer.from([0x47, 0x50, 0, 0x01, 0xa0, 0x86, 0x01, 0]);
  const rs = anneauxGpkg(new Uint8Array(Buffer.concat([entete, multi])));
  attendre('GeoPackage : deux anneaux', rs.length === 2, rs.length, 'L’extérieur et le trou du multipolygone.');
  attendre(
    'GeoPackage : premier sommet projeté',
    proche([rs[0]?.a[0] ?? 0, rs[0]?.a[1] ?? 0], [3, 46.5], 1e-9),
    [rs[0]?.a[0], rs[0]?.a[1]],
    'Le sommet (700 000 ; 6 600 000) est l’origine du Lambert 93.',
  );
  // La grille de la collecte (0,0026° × 0,0018°) sur la zone ; trois points : dans l'anneau, dans le trou, dehors.
  const g = { x0: 2.9, y0: 46.45, nx: 120, ny: 120, dx: 0.0026, dy: 0.0018 };
  const niveaux = new Uint8Array(g.nx * g.ny);
  poser(rs.map((r) => r.a), g, 2, niveaux);
  const au = (x: number, y: number) => {
    const [lon, lat] = depuisLambert93(x, y);
    return niveaux[Math.floor((lat - g.y0) / 0.0018) * g.nx + Math.floor((lon - g.x0) / 0.0026)];
  };
  const obtenu = [au(701000, 6605000), au(705000, 6605000), au(715000, 6605000)];
  attendre('Grille : anneau, trou, dehors', obtenu.join() === '2,0,0', obtenu, 'Un point de l’anneau prend le niveau ; le trou et le dehors restent à zéro.');
  poser(rs.map((r) => r.a), g, 1, niveaux);
  attendre('Grille : un niveau plus faible n’écrase pas', au(701000, 6605000) === 2, au(701000, 6605000), 'Chaque point garde le meilleur niveau posé.');
}

// Les habitants à distance : la distance à plat contre la formule de la sphère,
// le plus proche de la grille contre la recherche exhaustive, et la lecture
// des généralistes dans un extrait de la base des équipements.
{
  const haversine = (lo1: number, la1: number, lo2: number, la2: number) => {
    const r = Math.PI / 180;
    const h = Math.sin(((la2 - la1) * r) / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(((lo2 - lo1) * r) / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
  };
  // Le Mayet-de-Montagne et Vichy, une vingtaine de kilomètres.
  const [a, b] = [km(3.6667, 46.0722, 3.4264, 46.1278), haversine(3.6667, 46.0722, 3.4264, 46.1278)];
  attendre('Distance à plat', Math.abs(a - b) / b < 0.005, `${a.toFixed(3)} km contre ${b.toFixed(3)}`, 'À vingt kilomètres, l’écart à la sphère reste sous 0,5 %.');

  let graine = 7;
  const hasard = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  const points: [number, number][] = Array.from({ length: 400 }, () => [3 + hasard(), 45.5 + hasard()]);
  const v = new Voisinage(points);
  let faux = 0;
  for (let i = 0; i < 300; i++) {
    const [lon, lat] = [2.8 + 1.4 * hasard(), 45.3 + 1.4 * hasard()];
    const exhaustif = Math.min(...points.map(([x, y]) => km(lon, lat, x, y)));
    const obtenu = v.plusProche(lon, lat, 60);
    if (Math.abs(obtenu - exhaustif) > 1e-9) faux++;
  }
  attendre('Voisinage : le plus proche', faux === 0, `${faux} écart(s) sur 300`, 'La grille rend le même point que la recherche exhaustive, bord des cases compris.');
  attendre('Voisinage : la portée', v.plusProche(10, 50, 5) === Infinity, v.plusProche(10, 50, 5), 'Au-delà de la portée, aucune distance.');

  const d = [0.05, 0.5, 0.96, 1, 4.1, 12].map(distance).join(' | ');
  attendre('Distances en clair', d === 'moins de 100 mètres | 500 mètres | 1 kilomètre | 1 kilomètre | 4,1 kilomètres | 12 kilomètres', d, 'Au-dessous du kilomètre, à la centaine de mètres ; au-delà, au dixième.');
  const acces = { habitants: 1274, medecin: { parts: [69, 100, 100] as [number, number, number], mediane: 0.5 }, arrets: { desservi: 67, frequent: 0 }, semaine: '2026-11-02', carroyage: 2021, bpe: 2025, maj: '2026-10-17' };
  const pm = phraseMedecin(acces);
  attendre(
    'Phrase du médecin',
    pm === 'La moitié des 1\u202f274 habitants de la commune vivent à 500 mètres ou moins du cabinet d’un médecin généraliste, à vol d’oiseau ; 69 % à un kilomètre ou moins, 100 % à cinq kilomètres ou moins.',
    pm,
    'Le Mayet-de-Montagne, essai du 17 octobre 2026 : la médiane, puis les parts ; rien au-delà de dix kilomètres quand personne n’y vit.',
  );
  const loin = phraseMedecin({ ...acces, medecin: { parts: [0, 40, 85], mediane: 6.3 } });
  attendre('Phrase du médecin, loin', !!loin?.endsWith('à cinq kilomètres ou moins, et 15 % à plus de dix kilomètres.') && loin.includes('6,3 kilomètres ou moins'), loin, 'La part au-delà de dix kilomètres se dit.');
  const pa = phraseArrets(acces);
  attendre('Phrase des arrêts', !!pa?.startsWith('67 % des habitants vivent à 800 mètres ou moins') && pa.includes('du 2 au 8 novembre 2026') && pa.endsWith('et 0 % d’un arrêt desservi au moins dix fois chaque jour du lundi au vendredi.'), pa, 'La semaine comptée et les deux seuils se disent.');

  const dossier = mkdtempSync(join(tmpdir(), 'rouages-bpe-'));
  try {
    const csv = [
      '"AN";"NOMRS";"TYPEQU";"LONGITUDE";"LATITUDE"',
      '"2025";"CABINET; DU BOURG";"D265";3.6671;46.0725',
      '"2025";"PHARMACIE";"D307";3.6680;46.0730',
      '"2025";"RUE D265";"B101";3.6;46.0',
      '"2025";"SANS POSITION";"D265";;',
    ].join('\n');
    writeFileSync(join(dossier, 'bpe.zip'), zip([['BPE25.csv', Buffer.from(csv)]]));
    const lus: [number, number][] = [];
    for await (const p of medecins(join(dossier, 'bpe.zip'))) lus.push(p);
    attendre('Base des équipements : les généralistes', JSON.stringify(lus) === '[[3.6671,46.0725]]', lus, 'Seul le type D265 avec sa position est lu ; un point-virgule dans le nom ne décale pas les colonnes.');
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

if (echecs) {
  console.log(`\n${ROUGE}${echecs} échec(s).${RAZ}`);
  process.exit(1);
}
console.log(`\n${VERT}Lecteurs géographiques conformes.${RAZ}`);
