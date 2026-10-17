/**
 * Les habitants à distance : quelle part des habitants d'une commune vit près
 * d'un arrêt desservi, et à quelle distance du médecin généraliste le plus
 * proche. Le carroyage de l'INSEE (`carroyage.ts`) dit où vivent les gens, à
 * deux cents mètres près ; une distance se mesure du centre de chaque carreau,
 * à vol d'oiseau.
 *
 * **Les arrêts** sont ceux que la collecte des horaires a trouvés desservis
 * dans la semaine comptée (`transports-emettre.ts`, qui les garde dans le
 * cache des horaires) : la part des habitants à 800 mètres ou moins d'un
 * arrêt où passe au moins un car dans la semaine, et d'un arrêt où passent au
 * moins dix cars chaque jour du lundi au vendredi. Huit cents mètres, c'est
 * une dizaine de minutes à pied, la distance que retiennent la plupart des
 * études d'accès aux transports ; dix passages par jour ouvré, cinq allers et
 * retours, sépare un service qu'on peut prendre d'un car scolaire.
 *
 * **Les médecins** sont les lieux d'exercice des généralistes libéraux de la
 * base permanente des équipements géolocalisée (type D265, d'après le
 * répertoire partagé des professionnels de santé) : la part des habitants à
 * un kilomètre ou moins, à cinq, à dix, et la distance sous laquelle vit la
 * moitié d'entre eux. Les salariés d'un centre de santé n'y sont pas, et rien
 * ne dit si le médecin prend de nouveaux patients : c'est ce que mesure
 * l'accessibilité potentielle localisée de la DREES (`sante-emettre.ts`), que
 * la page donne à côté. Seule la position est lue, jamais le nom.
 *
 * **La commune** d'un carreau est celle dont le contour contient son centre
 * (`localiser.ts`) : le carroyage date de 2021, les communes nouvelles
 * créées depuis sont ainsi les bonnes. Un médecin ou un arrêt de la commune
 * voisine compte, puisqu'on y va. Le carroyage couvre la métropole, la
 * Martinique et La Réunion.
 *
 * Écrit `dep/XX-acces.json`. Lancé seul — `npx tsx scripts/acces-emettre.ts` —,
 * il relit les contours et les arrêts desservis déjà en cache.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { FILOSOFI, lireCarreaux, type Territoire } from './carroyage.ts';
import { contoursDesCommunes, ECHELLE } from './espaces-emettre.ts';
import { champs } from './horaires-gtfs.ts';
import { localisateur } from './localiser.ts';
import { departementDe, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';
import { ARRETS_DESSERVIS, type ArretsDesservis } from './transports-emettre.ts';

/** La base permanente des équipements géolocalisée. Son adresse porte l'identifiant de la publication, qui change à chaque millésime. */
export const BPE_GEO = {
  url: 'https://www.insee.fr/fr/statistiques/fichier/8217525/BPE25.zip',
  fichier: 'bpe25-geolocalisee.zip',
  annee: 2025,
  page: 'https://www.insee.fr/fr/statistiques/8217525',
};
const MEDECIN_GENERALISTE = 'D265';

export const RAYON_ARRET_KM = 0.8;
export const PASSAGES_PAR_JOUR_OUVRE = 10;
/** Les distances au médecin dont la page donne la part des habitants, en kilomètres. */
export const SEUILS_MEDECIN_KM = [1, 5, 10];
/** Au-delà, la distance au médecin n'est pas cherchée : le carreau compte « plus de dix kilomètres ». */
const PORTEE_MEDECIN_KM = 60;

/**
 * Pour une commune : `h`, les habitants des carreaux qu'elle contient ;
 * `m`, la part d'entre eux à un, cinq et dix kilomètres ou moins d'un
 * généraliste, en pour cent, puis la distance médiane en hectomètres ; `a`,
 * la part à 800 mètres ou moins d'un arrêt desservi dans la semaine, puis
 * d'un arrêt desservi dix fois chaque jour ouvré.
 */
export interface AccesCommune {
  h: number;
  m?: [number, number, number, number];
  a?: [number, number];
}

export interface CollecteAcces {
  maj: string;
  /** Le lundi de la semaine dont les arrêts desservis viennent, quand ils ont été lus. */
  semaine: string | null;
  communes: Map<string, AccesCommune>;
}

/** La distance en kilomètres, à plat : à cette échelle l'écart à la sphère est négligeable. */
export function km(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const k = Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  const dx = (lon2 - lon1) * k * 111.32;
  const dy = (lat2 - lat1) * 110.57;
  return Math.hypot(dx, dy);
}

/** Des points rangés dans une grille de degrés, pour chercher le plus proche ou un point dans un rayon. */
export class Voisinage {
  private readonly cases = new Map<string, number[]>();
  constructor(
    private readonly points: [number, number][],
    private readonly pas = 0.02,
  ) {
    points.forEach(([lon, lat], i) => {
      const cle = `${Math.floor(lon / pas)},${Math.floor(lat / pas)}`;
      (this.cases.get(cle) ?? this.cases.set(cle, []).get(cle)!).push(i);
    });
  }

  get taille(): number {
    return this.points.length;
  }

  /** La distance au point le plus proche, en kilomètres ; `Infinity` au-delà de `portee`. */
  plusProche(lon: number, lat: number, portee: number): number {
    const cx = Math.floor(lon / this.pas);
    const cy = Math.floor(lat / this.pas);
    // Le plus petit côté d'une case : la longitude, resserrée par la latitude.
    const cote = this.pas * 111.32 * Math.cos((Math.min(Math.abs(lat) + this.pas, 89) * Math.PI) / 180);
    let d = Infinity;
    for (let r = 0; r <= Math.ceil(portee / cote) + 1; r++) {
      // Tout point hors des anneaux déjà vus est à plus de (r - 1) côtés.
      if (d <= (r - 1) * cote) break;
      for (let i = cx - r; i <= cx + r; i++)
        for (let j = cy - r; j <= cy + r; j++) {
          if (Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== r) continue;
          for (const k of this.cases.get(`${i},${j}`) ?? []) d = Math.min(d, km(lon, lat, this.points[k][0], this.points[k][1]));
        }
    }
    return d <= portee ? d : Infinity;
  }
}

/** Les cabinets des généralistes de la base géolocalisée : leur position seule. */
export async function* medecins(zip: string): AsyncGenerator<[number, number]> {
  const liste = await new Promise<string>((ok, ko) => {
    const p = spawn('unzip', ['-Z1', zip]);
    let s = '';
    p.stdout.on('data', (b) => (s += b));
    p.on('close', (c) => (c ? ko(new Error(`${zip} illisible`)) : ok(s)));
  });
  const csv = liste.split('\n').find((n) => /\.csv$/i.test(n.trim()));
  if (!csv) throw new Error(`${zip} : aucun CSV dans l’archive`);
  const p = spawn('unzip', ['-p', zip, csv.trim()]);
  let sep = ';';
  let col: Record<string, number> | null = null;
  for await (const brute of createInterface({ input: p.stdout, crlfDelay: Infinity })) {
    const l = brute.replace(/^﻿/, '');
    if (!l.trim()) continue;
    if (!col) {
      sep = l.includes(';') ? ';' : ',';
      const noms = champs(l, sep).map((x) => x.trim().toUpperCase());
      col = Object.fromEntries(noms.map((n, i) => [n, i]));
      for (const n of ['TYPEQU', 'LONGITUDE', 'LATITUDE']) if (col[n] === undefined) throw new Error(`base des équipements : colonne ${n} absente`);
      continue;
    }
    // Le type d'abord, sans découper la ligne : un sur deux cents est un généraliste.
    if (!l.includes(MEDECIN_GENERALISTE)) continue;
    const c = champs(l, sep);
    if (c[col.TYPEQU] !== MEDECIN_GENERALISTE) continue;
    const lon = Number(c[col.LONGITUDE]);
    const lat = Number(c[col.LATITUDE]);
    if (Number.isFinite(lon) && Number.isFinite(lat) && (lon || lat)) yield [lon, lat];
  }
}

export async function collecterAcces(
  sortie: string,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<CollecteAcces> {
  const carroyage = join(cache, FILOSOFI.fichier);
  const bpe = join(cache, BPE_GEO.fichier);
  for (const [url, vers] of [
    [FILOSOFI.url, carroyage],
    [BPE_GEO.url, bpe],
  ]) {
    if (existsSync(vers)) continue;
    // Par un fichier temporaire : un transfert coupé ne doit pas passer pour une archive en cache.
    await telecharger(url, `${vers}.partiel`);
    renameSync(`${vers}.partiel`, vers);
  }
  const contours = contoursDesCommunes(sortie);
  if (!contours.size) throw new Error('contours des communes absents : lancer d’abord la collecte des espaces naturels');
  const communeDu = localisateur(contours);

  const cabinets: [number, number][] = [];
  for await (const p of medecins(bpe)) cabinets.push(p);
  if (cabinets.length < 10_000) throw new Error(`${cabinets.length} cabinets de généralistes seulement : la base des équipements a changé de forme`);
  const parMedecin = new Voisinage(cabinets);
  dire(`  Habitants à distance : ${cabinets.length.toLocaleString('fr-FR')} lieux d’exercice de généralistes.`);

  // Les arrêts desservis, s'ils ont été lus par la collecte des horaires.
  let semaine: string | null = null;
  let desservis: Voisinage | null = null;
  let frequents: Voisinage | null = null;
  const fichierArrets = join(cache, 'gtfs', ARRETS_DESSERVIS);
  // Une collecte des horaires qui a échoué laisse le fichier d'une ingestion ancienne : au-delà d'une semaine, on ne le lit pas.
  if (existsSync(fichierArrets) && Date.now() - statSync(fichierArrets).mtimeMs < 7 * 86_400_000) {
    const x = JSON.parse(readFileSync(fichierArrets, 'utf8')) as ArretsDesservis;
    semaine = x.semaine;
    desservis = new Voisinage(x.a.map(([lon, lat]) => [lon, lat]), 0.01);
    frequents = new Voisinage(x.a.filter((a) => a[2] >= PASSAGES_PAR_JOUR_OUVRE).map(([lon, lat]) => [lon, lat]), 0.01);
    dire(`  Habitants à distance : ${desservis.taille.toLocaleString('fr-FR')} arrêts desservis la semaine du ${semaine}, dont ${frequents.taille.toLocaleString('fr-FR')} dix fois chaque jour ouvré.`);
  } else dire('  Habitants à distance : pas d’arrêts desservis de moins d’une semaine en cache, la part des habitants près d’un arrêt n’est pas calculée.');

  type Comptes = { h: number; m: number[]; dist: [number, number][]; a: number[] };
  const comptes = new Map<string, Comptes>();
  let horsCommune = 0;
  for (const t of ['met', 'mart', 'reun'] as Territoire[]) {
    for await (const c of lireCarreaux(carroyage, t)) {
      const code = communeDu(Math.round(c.lon * ECHELLE), Math.round(c.lat * ECHELLE));
      if (!code) {
        horsCommune += c.ind;
        continue;
      }
      const x = comptes.get(code) ?? comptes.set(code, { h: 0, m: SEUILS_MEDECIN_KM.map(() => 0), dist: [], a: [0, 0] }).get(code)!;
      x.h += c.ind;
      const d = parMedecin.plusProche(c.lon, c.lat, PORTEE_MEDECIN_KM);
      SEUILS_MEDECIN_KM.forEach((s, i) => d <= s && (x.m[i] += c.ind));
      x.dist.push([d, c.ind]);
      if (desservis && desservis.plusProche(c.lon, c.lat, RAYON_ARRET_KM) <= RAYON_ARRET_KM) {
        x.a[0] += c.ind;
        if (frequents!.plusProche(c.lon, c.lat, RAYON_ARRET_KM) <= RAYON_ARRET_KM) x.a[1] += c.ind;
      }
    }
  }
  dire(`  Habitants à distance : ${Math.round(horsCommune).toLocaleString('fr-FR')} habitants de carreaux hors des contours, laissés.`);

  const pc = (v: number, n: number) => Math.round((100 * v) / n);
  const communes = new Map<string, AccesCommune>();
  for (const [code, x] of comptes) {
    // La distance sous laquelle vit la moitié des habitants.
    x.dist.sort((a, b) => a[0] - b[0]);
    let cumul = 0;
    let mediane = Infinity;
    for (const [d, ind] of x.dist) if ((cumul += ind) >= x.h / 2) {
      mediane = d;
      break;
    }
    const e: AccesCommune = {
      h: Math.round(x.h),
      m: [...(x.m.map((v) => pc(v, x.h)) as [number, number, number]), Number.isFinite(mediane) ? Math.round(mediane * 10) : -1],
    };
    if (desservis) e.a = [pc(x.a[0], x.h), pc(x.a[1], x.h)];
    communes.set(code, e);
  }
  return { maj: new Date().toISOString().slice(0, 10), semaine, communes };
}

export function ecrireAcces(sortie: string, c: CollecteAcces, deps?: string[]): number {
  const communes = deps ? new Map([...c.communes].filter(([code]) => deps.includes(departementDe(code)))) : c.communes;
  return ecrireParDepartement(sortie, 'acces', communes, () => ({
    maj: c.maj,
    ...(c.semaine ? { s: c.semaine } : {}),
    carroyage: FILOSOFI.annee,
    bpe: BPE_GEO.annee,
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { telecharger, cache, sortie } = telechargerSiAbsent(racine);
  const deps = process.env.ROUAGES_DEPS?.split(',');
  const c = await collecterAcces(sortie, telecharger, cache, console.log);
  console.log(`${ecrireAcces(sortie, c, deps)} départements écrits.`);
}
