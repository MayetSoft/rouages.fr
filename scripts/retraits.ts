/**
 * Les oppositions à la publication d'un nom, lues dans `retraits.yaml` et
 * appliquées par chaque collecte qui nomme quelqu'un : le BODACC, les adjoints,
 * le maire. Voir l'en-tête du fichier.
 */
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export interface Retraits {
  /** Des SIREN, sans espaces. */
  entreprises: Set<string>;
  /** « code INSEE|fonction ». */
  elus: Set<string>;
  /** Les empreintes des conseillers sans fonction, voir `empreinteElu`. */
  empreintes: Set<string>;
  /** « page nominative HATVP|rubrique » : une rubrique de déclaration retirée. */
  declarations: Set<string>;
  /** Le code d'un site pollué (SSP…) ou d'une installation classée (AIOT) dont l'exploitant n'est plus nommé. */
  sites: Set<string>;
}

/**
 * Un conseiller municipal sans fonction ne se désigne pas par elle, et le
 * nommer dans un fichier public le nommerait encore : on inscrit l'empreinte
 * de sa commune, de son nom, de son prénom et de sa date de naissance, telle
 * que `npx tsx scripts/retraits.ts 03165 NOM Prénom 1960-01-31` la calcule,
 * avec `ROUAGES_RETRAITS_SECRET` défini dans l'environnement.
 */
export function empreinteElu(commune: string, nom: string, prenom: string, naissance: string): string {
  const secret = process.env.ROUAGES_RETRAITS_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('ROUAGES_RETRAITS_SECRET doit contenir au moins 32 octets aléatoires.');
  }
  return createHmac('sha256', secret)
    .update([commune, nom.trim().toUpperCase(), prenom.trim().toUpperCase(), naissance.trim()].join('|'))
    .digest('hex')
}

let lus: Retraits | null = null;

export function retraits(): Retraits {
  if (lus) return lus;
  const chemin = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'retraits.yaml');
  const brut = existsSync(chemin)
    ? ((parse(readFileSync(chemin, 'utf8')) ?? {}) as {
        entreprises?: unknown[];
        elus?: { commune?: string; fonction?: string; empreinte?: string }[];
        declarations?: { page?: string; rubrique?: string }[];
        sites?: unknown[];
      })
    : {};
  lus = {
    entreprises: new Set((brut.entreprises ?? []).map((x) => String(x).replace(/\D/g, '')).filter((x) => x.length === 9)),
    elus: new Set((brut.elus ?? []).filter((e) => e?.commune && e?.fonction).map((e) => `${e.commune}|${e.fonction}`)),
    empreintes: new Set((brut.elus ?? []).filter((e) => e?.empreinte).map((e) => String(e.empreinte))),
    declarations: new Set((brut.declarations ?? []).filter((d) => d?.page && d?.rubrique).map((d) => `${d.page}|${d.rubrique}`)),
    sites: new Set((brut.sites ?? []).map((x) => String(x).trim()).filter(Boolean)),
  };
  return lus;
}

export const eluRetire = (commune: string, fonction: string) => retraits().elus.has(`${commune}|${fonction}`);

export const conseillerRetire = (commune: string, nom: string, prenom: string, naissance: string) => {
  const empreintes = retraits().empreintes;
  return empreintes.size > 0 && empreintes.has(empreinteElu(commune, nom, prenom, naissance));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [commune, nom, prenom, naissance] = process.argv.slice(2);
  if (!commune || !nom || !prenom || !naissance) console.log('npx tsx scripts/retraits.ts <code INSEE> <NOM> <Prénom> <AAAA-MM-JJ>');
  else console.log(`  - commune: "${commune}"\n    empreinte: "${empreinteElu(commune, nom, prenom, naissance)}"`);
}
