/**
 * Quand chaque source a été lue, et de quand date ce qu'on a lu.
 *
 * L'encadré « Sources et méthode » de chaque bloc renvoie aux jeux de données
 * et aux fichiers (`src/modele/sources-donnees.ts`). Ce module y ajoute deux
 * dates, quand elles existent :
 *
 * - **la récupération** : le jour où l'ingestion a lu la source — le fichier
 *   lui-même, ou, pour la fiche d'un jeu, l'une de ses ressources ;
 * - **la version** : la date que la source publie pour ce qu'on a lu — l'en-tête
 *   `Last-Modified` du fichier au moment du téléchargement, ou, pour un portail
 *   Opendatasoft, la date de mise à jour des données que le portail affiche,
 *   quand elle précède la lecture. Une date postérieure à la lecture dirait la
 *   version d'aujourd'hui, pas celle qu'on a lue : elle n'est pas reprise.
 *
 * **Comment.** `journaliserLesLectures` enveloppe `fetch` : chaque réponse
 * réussie note son adresse, le jour et son `Last-Modified`. Un fichier repris
 * du cache note le jour où il y est entré. En fin de course,
 * `ecrireProvenance` rapproche ces lectures des liens du répertoire et
 * réécrit `public/territoires/provenance.json`, en gardant les dates des
 * sources que cette course n'a pas lues — une collecte facultative en échec
 * garde ses fichiers, elle garde aussi ses dates.
 *
 * Le rapprochement, du plus sûr au moins sûr :
 *
 * 1. l'adresse exacte du lien ;
 * 2. pour la fiche d'un jeu data.gouv, une lecture dont l'adresse porte son
 *    identifiant (l'API du jeu) ;
 * 3. pour un portail Opendatasoft, une lecture de l'API de ce jeu sur ce
 *    portail ;
 * 4. à défaut, la fiche du jeu prend la date du fichier de la même source qui,
 *    lui, a été lu — seulement quand la source n'a qu'une fiche sans lecture
 *    propre. Un article de loi ou une page d'explication cités à côté n'ont
 *    jamais de date : on ne les lit pas.
 *
 * Rien n'est inventé : un lien qu'aucune lecture ne rejoint n'a pas de date.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourcesEtLiens } from '../src/modele/sources-donnees.ts';

export interface Lecture {
  /** Le jour de la lecture, AAAA-MM-JJ. */
  le: string;
  /** La date que la source publie pour ce fichier, AAAA-MM-JJ. */
  version?: string;
}

/** Ce que `provenance.json` porte pour chaque lien : récupéré le, version du. */
export type Provenance = Record<string, { r: string; v?: string }>;

const lues = new Map<string, Lecture>();
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** « Tue, 01 Sep 2026 08:00:00 GMT » → « 2026-09-01 ». */
export function dateHttp(entete: string | null | undefined): string | undefined {
  if (!entete) return undefined;
  const t = Date.parse(entete);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : undefined;
}

/** Note une lecture ; la plus récente l'emporte. */
export function noter(url: string, version?: string, le = aujourdhui()): void {
  const avant = lues.get(url);
  if (avant && avant.le > le) return;
  lues.set(url, { le, ...(version ? { version } : {}) });
}

export function lecture(url: string): Lecture | undefined {
  return lues.get(url);
}

/** Un fichier repris du cache : le jour où il y est entré, et la version notée alors. */
export function noterDuCache(url: string, chemin: string): void {
  if (!existsSync(chemin)) return;
  const le = new Date(statSync(chemin).mtimeMs).toISOString().slice(0, 10);
  const version = existsSync(`${chemin}.version`) ? readFileSync(`${chemin}.version`, 'utf8').trim() || undefined : undefined;
  noter(url, version, le);
}

/** Garde à côté d'un fichier téléchargé la version que la source lui donnait. */
export function garderVersion(url: string, chemin: string): void {
  const v = lues.get(url)?.version;
  if (v) writeFileSync(`${chemin}.version`, `${v}\n`);
}

let installe = false;
/** Enveloppe `fetch` une fois pour toutes : chaque réponse réussie est notée. */
export function journaliserLesLectures(): void {
  if (installe) return;
  installe = true;
  const origine = globalThis.fetch;
  globalThis.fetch = async (entree: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const r = await origine(entree, init);
    if (r.ok) {
      const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      noter(url, dateHttp(r.headers.get('last-modified')));
    }
    return r;
  };
}

const idJeuDataGouv = (url: string) => /^https:\/\/www\.data\.gouv\.fr\/(?:fr\/)?datasets\/([^/?#]+)\/?$/.exec(url)?.[1];
const jeuOds = (url: string) => {
  const m = /^https:\/\/([^/]+)\/explore\/dataset\/([^/?#]+)\/?/.exec(url);
  return m ? { hote: m[1], id: m[2] } : undefined;
};

/** La lecture la plus récente parmi celles que `garder` retient. */
function plusRecente(garder: (url: string) => boolean): Lecture | undefined {
  let mieux: Lecture | undefined;
  for (const [url, l] of lues) if (garder(url) && (!mieux || l.le > mieux.le)) mieux = l;
  return mieux;
}

/**
 * Rapproche les lectures de la course des liens du répertoire, et réécrit
 * `provenance.json`. `lireJson`, quand il est donné, interroge les portails
 * Opendatasoft pour la date de leurs données ; une collecte lancée seule s'en
 * passe et garde la version déjà connue.
 */
export async function ecrireProvenance(sortie: string, lireJson?: (url: string) => Promise<unknown>): Promise<number> {
  const chemin = join(sortie, 'provenance.json');
  const avant: Provenance = existsSync(chemin) ? (JSON.parse(readFileSync(chemin, 'utf8')) as Provenance) : {};
  const nouvelles: Provenance = {};

  for (const liens of sourcesEtLiens()) {
    const trouvees = new Map<string, Lecture>();
    for (const url of liens) {
      let l = lues.get(url);
      const id = idJeuDataGouv(url);
      if (!l && id) l = plusRecente((u) => u.includes(`/datasets/${id}`));
      const ods = jeuOds(url);
      if (!l && ods) {
        l = plusRecente((u) => u.includes(`://${ods.hote}/`) && (u.includes(`/datasets/${ods.id}/`) || u.includes(`/datasets/${ods.id}?`) || u.includes(`dataset=${ods.id}`)));
        if (l && !l.version && lireJson) {
          try {
            const m = (await lireJson(`https://${ods.hote}/api/explore/v2.1/catalog/datasets/${ods.id}`)) as {
              metas?: { default?: { data_processed?: string; modified?: string } };
            };
            const v = (m.metas?.default?.data_processed ?? m.metas?.default?.modified ?? '').slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= l.le) l = { ...l, version: v };
          } catch {
            // Le portail ne répond pas : la date de récupération suffit.
          }
        }
      }
      if (l) trouvees.set(url, l);
    }
    // La fiche d'un jeu non lue prend la date du fichier de la même source,
    // s'il n'y a qu'une fiche à qui la donner.
    const sourceLue = [...trouvees.values()].sort((a, b) => b.le.localeCompare(a.le))[0];
    const fichesSansLecture = liens.filter((u) => (idJeuDataGouv(u) || jeuOds(u)) && !trouvees.has(u));
    for (const url of liens) {
      const l = trouvees.get(url) ?? (fichesSansLecture.length === 1 && fichesSansLecture[0] === url ? sourceLue : undefined);
      if (l) nouvelles[url] = { r: l.le, ...(l.version && l.version <= l.le ? { v: l.version } : {}) };
    }
  }

  const fusion: Provenance = { ...avant, ...nouvelles };
  const tri = Object.fromEntries(Object.entries(fusion).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(chemin, `${JSON.stringify(tri, null, 1)}\n`);
  return Object.keys(nouvelles).length;
}

/** Pour une collecte lancée seule : écrit la provenance quand le processus se termine. */
let prevu = false;
export function ecrireProvenanceEnSortant(sortie: string): void {
  if (prevu) return;
  prevu = true;
  let fait = false;
  process.on('beforeExit', async () => {
    if (fait) return;
    fait = true;
    if (lues.size > 0) await ecrireProvenance(sortie);
  });
}
