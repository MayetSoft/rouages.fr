/**
 * Les oppositions à la publication d'un nom, lues dans `retraits.yaml` et
 * appliquées par chaque collecte qui nomme quelqu'un : le BODACC, les adjoints,
 * le maire. Voir l'en-tête du fichier.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export interface Retraits {
  /** Des SIREN, sans espaces. */
  entreprises: Set<string>;
  /** « code INSEE|fonction ». */
  elus: Set<string>;
}

let lus: Retraits | null = null;

export function retraits(): Retraits {
  if (lus) return lus;
  const chemin = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'retraits.yaml');
  const brut = existsSync(chemin)
    ? ((parse(readFileSync(chemin, 'utf8')) ?? {}) as { entreprises?: unknown[]; elus?: { commune?: string; fonction?: string }[] })
    : {};
  lus = {
    entreprises: new Set((brut.entreprises ?? []).map((x) => String(x).replace(/\D/g, '')).filter((x) => x.length === 9)),
    elus: new Set((brut.elus ?? []).filter((e) => e?.commune && e?.fonction).map((e) => `${e.commune}|${e.fonction}`)),
  };
  return lus;
}

export const eluRetire = (commune: string, fonction: string) => retraits().elus.has(`${commune}|${fonction}`);
