/**
 * Combien de fois un car, un bus, un tram ou un train s'arrête à chaque arrêt,
 * jour par jour sur une semaine, d'après un fichier d'horaires GTFS — la
 * « décision 6b » du 30 septembre : dire la desserte, pas seulement que
 * l'arrêt existe. Une semaine plutôt qu'un jour : au Mayet-de-Montagne, les
 * deux arrêts ne voient passer que le car de l'internat, le lundi matin et le
 * vendredi soir — un mardi dirait « rien ».
 *
 * **Un passage** est un arrêt d'une course où l'on peut monter
 * (`pickup_type` différent de 1). Une course active ce jour-là est celle dont
 * le service y circule : le jour de la semaine dans `calendar.txt`, entre ses
 * dates, corrigé par les exceptions de `calendar_dates.txt`. Une course
 * décrite par fréquence (`frequencies.txt`, les métros) compte autant de
 * départs que ses intervalles en contiennent.
 *
 * **Le fichier couvre la semaine** quand ses services vont au moins du lundi
 * au vendredi : un fichier qui ne la couvre pas — expiré, ou pas encore
 * publié pour cette période — ne dit pas « aucun passage », il ne dit rien,
 * et la page le distingue.
 *
 * L'archive se lit par `unzip`, comme les autres collectes ; `stop_times.txt`,
 * qui dépasse le gigaoctet en Île-de-France, en flux.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface ArretDesservi {
  id: string;
  nom: string;
  lon: number;
  lat: number;
  /** Les passages de chaque jour, du lundi au dimanche. */
  n: number[];
  /** Les lignes (nom court, à défaut nom long) qui y passent dans la semaine. */
  lignes: Set<string>;
}

export interface HorairesFlux {
  couvre: boolean;
  arrets: ArretDesservi[];
}

/** Une ligne CSV, guillemets compris ; GTFS n'y met pas de retour à la ligne. */
export function champs(ligne: string, sep = ','): string[] {
  if (!ligne.includes('"')) return ligne.split(sep);
  const sortie: string[] = [];
  let cour = '';
  let dans = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dans) {
      if (c === '"' && ligne[i + 1] === '"') {
        cour += '"';
        i++;
      } else if (c === '"') dans = false;
      else cour += c;
    } else if (c === '"') dans = true;
    else if (c === sep) {
      sortie.push(cour);
      cour = '';
    } else cour += c;
  }
  sortie.push(cour);
  return sortie;
}

function membres(zip: string): string[] {
  return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Un fichier de l'archive, ligne par ligne, avec ses colonnes ; rien s'il manque. Le nom est cherché à la racine ou dans un dossier. */
async function* lignes(zip: string, liste: string[], fichier: string): AsyncGenerator<Record<string, string>> {
  const membre = liste.find((m) => m === fichier || m.endsWith(`/${fichier}`));
  if (!membre) return;
  const p = spawn('unzip', ['-p', zip, membre]);
  const rl = createInterface({ input: p.stdout, crlfDelay: Infinity });
  let entete: string[] | null = null;
  for await (const brute of rl) {
    const l = brute.replace(/^﻿/, '');
    if (!l.trim()) continue;
    const c = champs(l);
    if (!entete) {
      entete = c.map((x) => x.trim().toLowerCase());
      continue;
    }
    const o: Record<string, string> = {};
    for (let i = 0; i < entete.length; i++) o[entete[i]] = (c[i] ?? '').trim();
    yield o;
  }
}

const secondes = (h: string) => {
  const [a, b, c] = h.split(':').map(Number);
  return a * 3600 + b * 60 + (c || 0);
};

const JOURS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** `semaine` : les sept dates, du lundi au dimanche, en AAAAMMJJ. */
export async function lireHoraires(zip: string, semaine: string[]): Promise<HorairesFlux> {
  const liste = membres(zip);

  // Pour chaque service, les jours de la semaine où il circule (un masque de sept bits) ; et l'étendue des dates du fichier.
  const masque = new Map<string, number>();
  let premier = '99999999';
  let dernier = '00000000';
  for await (const c of lignes(zip, liste, 'calendar.txt')) {
    if (c.start_date < premier) premier = c.start_date;
    if (c.end_date > dernier) dernier = c.end_date;
    let m = 0;
    semaine.forEach((jour, i) => {
      if (c[JOURS[i]] === '1' && c.start_date <= jour && jour <= c.end_date) m |= 1 << i;
    });
    if (m) masque.set(c.service_id, m);
  }
  for await (const c of lignes(zip, liste, 'calendar_dates.txt')) {
    if (c.date < premier) premier = c.date;
    if (c.date > dernier) dernier = c.date;
    const i = semaine.indexOf(c.date);
    if (i < 0) continue;
    const m = masque.get(c.service_id) ?? 0;
    if (c.exception_type === '1') masque.set(c.service_id, m | (1 << i));
    else if (c.exception_type === '2') masque.set(c.service_id, m & ~(1 << i));
  }
  const couvre = premier <= semaine[0] && semaine[4] <= dernier;
  if (!couvre) return { couvre, arrets: [] };

  const lignesDe = new Map<string, string>();
  for await (const r of lignes(zip, liste, 'routes.txt')) lignesDe.set(r.route_id, r.route_short_name || r.route_long_name || r.route_id);
  // Course qui circule dans la semaine -> sa ligne et ses jours.
  const courses = new Map<string, [string, number]>();
  for await (const t of lignes(zip, liste, 'trips.txt')) {
    const m = masque.get(t.service_id);
    if (m) courses.set(t.trip_id, [lignesDe.get(t.route_id) ?? '', m]);
  }
  if (!courses.size) return { couvre, arrets: [] };
  // Une course à fréquence compte autant de départs que ses intervalles.
  const multiple = new Map<string, number>();
  for await (const f of lignes(zip, liste, 'frequencies.txt')) {
    if (!courses.has(f.trip_id)) continue;
    const pas = Number(f.headway_secs);
    if (!(pas > 0)) continue;
    const n = Math.max(1, Math.ceil((secondes(f.end_time) - secondes(f.start_time)) / pas));
    multiple.set(f.trip_id, (multiple.get(f.trip_id) ?? 0) + n);
  }

  const parArret = new Map<string, { n: number[]; lignes: Set<string> }>();
  for await (const s of lignes(zip, liste, 'stop_times.txt')) {
    const course = courses.get(s.trip_id);
    if (!course || s.pickup_type === '1') continue;
    const [ligne, m] = course;
    const a = parArret.get(s.stop_id) ?? parArret.set(s.stop_id, { n: [0, 0, 0, 0, 0, 0, 0], lignes: new Set() }).get(s.stop_id)!;
    const k = multiple.get(s.trip_id) ?? 1;
    for (let i = 0; i < 7; i++) if (m & (1 << i)) a.n[i] += k;
    if (ligne) a.lignes.add(ligne);
  }

  // Tous les arrêts du fichier, avec leur position — ceux sans passage aussi : ils disent « aucun passage cette semaine ».
  const arrets: ArretDesservi[] = [];
  for await (const s of lignes(zip, liste, 'stops.txt')) {
    if (s.location_type && s.location_type !== '0') continue;
    const lon = Number(s.stop_lon);
    const lat = Number(s.stop_lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue;
    const p = parArret.get(s.stop_id);
    arrets.push({ id: s.stop_id, nom: (s.stop_name ?? '').replace(/\s+/g, ' ').trim(), lon, lat, n: p?.n ?? [0, 0, 0, 0, 0, 0, 0], lignes: p?.lignes ?? new Set() });
  }
  return { couvre, arrets };
}

/* ------------------------------------------------------------------ *
 * La semaine comptée
 * ------------------------------------------------------------------ */

type LireJson = (url: string) => Promise<unknown>;

const parisJour = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const plusJours = (jour: string, n: number) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * La première semaine entière de classe à venir, du lundi au dimanche : pas
 * un jour de vacances scolaires du lundi au vendredi, dans aucune des zones
 * A, B, C ni en Corse (calendrier de l'Éducation nationale), et pas un jour
 * férié de la semaine (calendrier de l'administration). Une semaine de
 * vacances compterait moins de cars — les lignes scolaires ne roulent pas —,
 * et un jour férié roule comme un dimanche. L'outre-mer a ses propres
 * vacances : la semaine retenue peut y en être une.
 */
export async function semaineDeClasse(lireJson: LireJson, aujourdhui = new Date().toISOString().slice(0, 10)): Promise<string[]> {
  const fin = plusJours(aujourdhui, 200);
  const url =
    'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?limit=100&select=start_date,end_date,zones' +
    `&where=${encodeURIComponent(`end_date >= "${aujourdhui}" and start_date <= "${fin}" and zones in ("Zone A", "Zone B", "Zone C", "Corse")`)}`;
  const vacances = ((await lireJson(url)) as { results: { start_date: string; end_date: string }[] }).results.map(
    // La fin publiée est le jour de la reprise.
    (v) => [parisJour(v.start_date), parisJour(v.end_date)] as const,
  );
  const feries = new Set<string>();
  for (const an of new Set([aujourdhui.slice(0, 4), fin.slice(0, 4)]))
    for (const j of Object.keys((await lireJson(`https://calendrier.api.gouv.fr/jours-feries/metropole/${an}.json`)) as Record<string, string>)) feries.add(j);
  const enVacances = (j: string) => vacances.some(([a, b]) => a <= j && j < b);
  // Le premier lundi après aujourd'hui.
  let lundi = plusJours(aujourdhui, 1);
  while (new Date(`${lundi}T12:00:00Z`).getUTCDay() !== 1) lundi = plusJours(lundi, 1);
  for (; lundi <= fin; lundi = plusJours(lundi, 7)) {
    const jours = [...Array(7)].map((_, i) => plusJours(lundi, i));
    if (jours.slice(0, 5).some(enVacances) || jours.some((j) => feries.has(j))) continue;
    return jours.map((j) => j.replace(/-/g, ''));
  }
  throw new Error('aucune semaine de classe entière dans les deux cents jours à venir');
}

/* ------------------------------------------------------------------ *
 * Tous les réseaux
 * ------------------------------------------------------------------ */

/** Un jeu du Point d'accès, avec ses fichiers GTFS. */
export interface JeuGtfs {
  id: string;
  agregat: boolean;
  fichiers: { id: string; urls: string[] }[];
}

/** Par commune et par nom d'arrêt plié : le nom, la position du premier quai lu, les passages de chaque jour, les lignes. */
export type Desserte = Map<string, Map<string, { nom: string; lon: number; lat: number; n: number[]; lignes: Set<string> }>>;

export interface CollecteHoraires {
  /** Les sept jours comptés, en AAAAMMJJ. */
  semaine: string[];
  desserte: Desserte;
  /** Les communes qu'un fichier couvrant la semaine inscrit, passages ou non. */
  couvertes: Set<string>;
}

const plierNom = (n: string) => n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Une archive téléchargée, gardée si elle est entière ; réutilisée tant qu'elle a moins de `joursMax` jours. */
async function archive(urls: string[], vers: string, joursMax: number): Promise<void> {
  if (existsSync(vers) && Date.now() - statSync(vers).mtimeMs < joursMax * 86_400_000) return;
  let derniere: unknown = new Error('aucune adresse');
  for (const url of urls)
    for (let essai = 0; essai < 3; essai++) {
      try {
        const r = await fetch(url, { headers: { 'accept-encoding': 'identity' }, signal: AbortSignal.timeout(900_000) });
        if (!r.ok) throw new Error(`${r.status}`);
        const corps = Buffer.from(await r.arrayBuffer());
        if (corps.subarray(0, 4).toString('latin1') !== 'PK\x03\x04') throw new Error('pas une archive zip');
        if (!corps.subarray(-65_557).includes(Buffer.from('PK\x05\x06', 'latin1'))) throw new Error('archive tronquée');
        writeFileSync(`${vers}.partiel`, corps);
        renameSync(`${vers}.partiel`, vers);
        return;
      } catch (e) {
        derniere = e;
        await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
      }
    }
  throw derniere;
}

/**
 * Les passages de la semaine, par commune et par arrêt, sur tous les réseaux.
 *
 * Plusieurs fichiers d'un même jeu sont tantôt des sous-réseaux (BreizhGo
 * par département), tantôt des copies du même (trois pour Île-de-France
 * Mobilités, un « référentiel complet » en plus de chaque réseau à
 * Aix-Marseille) : entre eux, on garde le plus grand nombre de passages de
 * chaque arrêt, chaque jour, plutôt que leur somme. Entre jeux différents, on
 * additionne. Un agrégat régional reprend tous les réseaux de sa région :
 * pour chaque arrêt et chaque jour, on garde le plus grand de la somme des
 * réseaux propres et de l'agrégat — ce qui compte aussi un réseau qui n'est
 * publié que dans l'agrégat, ou dont le fichier propre a échoué. Un fichier
 * injoignable ou illisible est laissé, et dit.
 */
export async function collecterHoraires(
  jeux: JeuGtfs[],
  semaine: string[],
  communeDu: (lon: number, lat: number) => string | null,
  cache: string,
  dire: (m: string) => void,
): Promise<CollecteHoraires> {
  mkdirSync(cache, { recursive: true });
  const joursMax = Number(process.env.ROUAGES_CACHE_JOURS ?? '') || 1;
  const propres: Desserte = new Map();
  const agregats: Desserte = new Map();
  const couvertes = new Set<string>();
  let lus = 0;
  let horsSemaine = 0;
  const echecs: string[] = [];
  for (const jeu of jeux) {
    const duJeu: Desserte = new Map();
    for (const f of jeu.fichiers) {
      const zip = join(cache, `${f.id.replace(/[^\w-]/g, '_')}.zip`);
      let h: HorairesFlux;
      try {
        await archive(f.urls, zip, joursMax);
        h = await lireHoraires(zip, semaine);
      } catch (e) {
        echecs.push(`${jeu.id} (${(e as Error).message})`);
        continue;
      }
      lus++;
      if (!h.couvre) {
        horsSemaine++;
        continue;
      }
      // Dans un fichier, les quais d'un même arrêt s'additionnent : ce sont ses deux sens.
      const duFichier: Desserte = new Map();
      for (const a of h.arrets) {
        const code = communeDu(a.lon, a.lat);
        if (!code) continue;
        couvertes.add(code);
        const m = duFichier.get(code) ?? duFichier.set(code, new Map()).get(code)!;
        const cle = plierNom(a.nom);
        const x = m.get(cle) ?? m.set(cle, { nom: a.nom, lon: a.lon, lat: a.lat, n: [0, 0, 0, 0, 0, 0, 0], lignes: new Set() }).get(cle)!;
        a.n.forEach((v, i) => (x.n[i] += v));
        for (const l of a.lignes) x.lignes.add(`${jeu.id}|${l}`);
      }
      // Entre fichiers d'un même jeu : le plus grand, jour par jour.
      for (const [code, m] of duFichier) {
        const d = duJeu.get(code) ?? duJeu.set(code, new Map()).get(code)!;
        for (const [cle, x] of m) {
          const y = d.get(cle);
          if (!y) d.set(cle, x);
          else {
            x.n.forEach((v, i) => (y.n[i] = Math.max(y.n[i], v)));
            for (const l of x.lignes) y.lignes.add(l);
          }
        }
      }
    }
    // Entre jeux : la somme.
    const cible = jeu.agregat ? agregats : propres;
    for (const [code, m] of duJeu) {
      const d = cible.get(code) ?? cible.set(code, new Map()).get(code)!;
      for (const [cle, x] of m) {
        const y = d.get(cle);
        if (!y) d.set(cle, { ...x, n: [...x.n], lignes: new Set(x.lignes) });
        else {
          x.n.forEach((v, i) => (y.n[i] += v));
          for (const l of x.lignes) y.lignes.add(l);
        }
      }
    }
  }
  // L'agrégat contre la somme des réseaux propres : le plus grand, jour par jour ; les lignes de celui qui l'emporte sur la semaine.
  const desserte: Desserte = propres;
  const total = (n: number[]) => n.reduce((a, b) => a + b, 0);
  for (const [code, m] of agregats) {
    const d = desserte.get(code) ?? desserte.set(code, new Map()).get(code)!;
    for (const [cle, x] of m) {
      const y = d.get(cle);
      if (!y) d.set(cle, x);
      else {
        if (total(x.n) > total(y.n)) y.lignes = x.lignes;
        x.n.forEach((v, i) => (y.n[i] = Math.max(y.n[i], v)));
      }
    }
  }
  dire(
    `  Horaires : ${lus} fichiers lus, ${horsSemaine} hors de la semaine du ${semaine[0].slice(6)}/${semaine[0].slice(4, 6)}/${semaine[0].slice(0, 4)}, ` +
      `${echecs.length} en échec ; ${[...desserte.values()].filter((m) => [...m.values()].some((x) => x.n.some(Boolean))).length} communes desservies.`,
  );
  if (echecs.length) dire(`  Fichiers d'horaires en échec : ${echecs.slice(0, 20).join(', ')}${echecs.length > 20 ? '…' : ''}`);
  return { semaine, desserte, couvertes };
}
