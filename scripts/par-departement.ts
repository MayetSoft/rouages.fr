/**
 * Ce que partagent les collectes écrites commune par commune, un fichier par
 * département : le département d'un code commune, le repli des arrondissements
 * de Paris, Lyon et Marseille sur leur commune, et l'écriture elle-même.
 *
 * Chaque collecte en réécrivait sa propre copie ; les dix venues avec la santé,
 * l'eau du robinet, la fibre et les autres passent par ici.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ecrireProvenanceEnSortant, garderVersion, journaliserLesLectures, noterDuCache } from './provenance.ts';

export function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Paris, Lyon et Marseille ont une page, pas une par arrondissement. Plusieurs
 * sources — les ventes immobilières, la délinquance enregistrée — ne
 * connaissent que les arrondissements : on les additionne sous la commune.
 */
export function communeDe(code: string): string {
  if (/^751(0[1-9]|1\d|20)$/.test(code)) return '75056';
  if (/^132(0[1-9]|1[0-6])$/.test(code)) return '13055';
  if (/^6938[1-9]$/.test(code)) return '69123';
  return code;
}

/** Les codes de l'INSEE perdent parfois leur zéro de tête en passant par un tableur. */
export function codeCommune(brut: string): string {
  const c = brut.trim().replace(/^"|"$/g, '');
  return /^\d{4}$/.test(c) ? `0${c}` : c;
}

/**
 * Un fichier `dep/XX-<jeu>.json` par département déjà écrit par l'émetteur
 * principal — on n'en crée pas pour un département que le site ne connaît pas.
 * `entete` ajoute ce qui vaut pour tout le département : sa valeur de
 * référence, la date, les libellés.
 */
export function ecrireParDepartement<T>(
  sortie: string,
  jeu: string,
  communes: Map<string, T>,
  entete: (dep: string) => Record<string, unknown>,
): number {
  const parDep = new Map<string, Record<string, T>>();
  for (const code of [...communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = communes.get(code)!;
  }
  let ecrits = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(join(sortie, 'dep', `${dep}-${jeu}.json`), JSON.stringify({ ...entete(dep), c }));
    ecrits++;
  }
  return ecrits;
}

/**
 * Les communes actuelles, et le report vers elles des codes qui ne le sont
 * plus : une commune déléguée ou associée renvoie à son chef-lieu, un
 * arrondissement municipal à sa commune. Pour une source publiée sur un
 * découpage ancien — le zonage du radon date du 1er janvier 2016.
 */
export function reportsDuDecoupage(): { actuelles: Set<string>; reports: Map<string, string> } {
  const chemin = createRequire(import.meta.url).resolve('@etalab/decoupage-administratif/data/communes.json');
  const toutes = JSON.parse(readFileSync(chemin, 'utf8')) as {
    code: string;
    type: string;
    chefLieu?: string;
    commune?: string;
  }[];
  const actuelles = new Set(toutes.filter((c) => c.type === 'commune-actuelle').map((c) => c.code));
  const reports = new Map<string, string>();
  for (const c of toutes) {
    if (c.type === 'commune-actuelle' || actuelles.has(c.code)) continue;
    const vers = c.chefLieu ?? c.commune;
    if (vers && actuelles.has(vers)) reports.set(c.code, vers);
  }
  return { actuelles, reports };
}

/** Une médiane, sur une liste qu'on a le droit de trier. */
export function mediane(v: number[]): number | null {
  if (v.length === 0) return null;
  v.sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Lit un CSV en flux, guillemets compris, et rend chaque ligne comme un
 * tableau. `separateur` : `,` ou `;`. Les gros fichiers — trois cents mégaoctets
 * de ventes immobilières par an — ne tiennent pas en mémoire d'un bloc.
 */
export async function* lignesCsv(
  source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  separateur = ',',
): AsyncGenerator<string[]> {
  const decodeur = new TextDecoder('utf-8');
  let reste = '';
  let champ = '';
  let ligne: string[] = [];
  let entre = false;
  let premier = true;
  for await (const m of source) {
    let t = reste + (typeof m === 'string' ? m : decodeur.decode(m, { stream: true }));
    reste = '';
    if (premier) {
      t = t.replace(/^﻿/, '');
      premier = false;
    }
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (entre) {
        if (c === '"') {
          if (i + 1 === t.length) {
            // Un guillemet en fin de morceau : on ne sait pas encore s'il est doublé.
            reste = '"';
            break;
          }
          if (t[i + 1] === '"') {
            champ += '"';
            i++;
          } else entre = false;
        } else champ += c;
      } else if (c === '"') entre = true;
      else if (c === separateur) {
        ligne.push(champ);
        champ = '';
      } else if (c === '\n') {
        ligne.push(champ.endsWith('\r') ? champ.slice(0, -1) : champ);
        yield ligne;
        ligne = [];
        champ = '';
      } else champ += c;
    }
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    yield ligne;
  }
}

/**
 * Pour un collecteur lancé seul : télécharge dans `.cache/` si le fichier n'y
 * est pas encore. L'ingestion complète passe, elle, par son propre
 * téléchargement, qui réessaie et note la provenance.
 */
export function telechargerSiAbsent(racine: string) {
  const cache = join(racine, '.cache');
  if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
  // Les lectures datent les sources de l'encadré « Sources et méthode » ;
  // une collecte lancée seule les écrit en se terminant (voir `provenance.ts`).
  journaliserLesLectures();
  ecrireProvenanceEnSortant(join(racine, 'public', 'territoires'));
  const obstine = async (url: string): Promise<Response> => {
    let derniere: unknown;
    for (let i = 0; i < 8; i++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(600_000) });
        if (r.ok) return r;
        derniere = new Error(`${url} : ${r.status}`);
      } catch (e) {
        derniere = e;
      }
      await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
    }
    throw derniere;
  };
  // Le tunnel de l'environnement de développement coupe parfois une grosse
  // réponse sans erreur : on compare à la longueur annoncée.
  const telecharger = async (url: string, vers: string) => {
    if (existsSync(vers)) {
      noterDuCache(url, vers);
      return;
    }
    for (let i = 0; i < 6; i++) {
      const r = await obstine(url);
      const attendu = Number(r.headers.get('content-length') ?? 0);
      const corps = Buffer.from(await r.arrayBuffer().catch(() => new ArrayBuffer(0)));
      if (!attendu || corps.length === attendu) {
        writeFileSync(vers, corps);
        garderVersion(url, vers);
        return;
      }
    }
    throw new Error(`${url} : réponse tronquée six fois de suite`);
  };
  const lireJson = async (url: string): Promise<unknown> => (await obstine(url)).json();
  return { cache, telecharger, lireJson, obstine, sortie: join(racine, 'public', 'territoires') };
}
