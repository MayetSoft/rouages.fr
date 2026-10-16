/**
 * Les délibérations retirées à la demande (`retraits.yaml`, section
 * `deliberations`) : une délibération dont l'objet nomme quelqu'un que les
 * filtres de `civilites.ts` ont laissé passer.
 *
 * Le fichier ne garde que l'empreinte SHA-256 du SIREN de la collectivité, de
 * la date et de l'objet tel que publié — jamais l'objet, qui nommerait encore
 * la personne. La collecte l'écarte à l'ingestion
 * (`scripts/deliberations-emettre.ts`) ; la page de la commune et le journal
 * l'écartent dès le build suivant, sans attendre.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export function empreinteDeliberation(siren: string, date: string, objet: string): string {
  return createHash('sha256')
    .update([siren.trim(), date.trim().slice(0, 10), objet.replace(/\s+/g, ' ').trim()].join('|'))
    .digest('hex');
}

let lues: Set<string> | null = null;

function empreintes(): Set<string> {
  if (lues) return lues;
  const chemin = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'retraits.yaml');
  const brut = existsSync(chemin) ? ((parse(readFileSync(chemin, 'utf8')) ?? {}) as { deliberations?: { empreinte?: string }[] }) : {};
  lues = new Set((brut.deliberations ?? []).filter((d) => d?.empreinte).map((d) => String(d.empreinte).trim()));
  return lues;
}

export function deliberationRetiree(siren: string, date: string, objet: string): boolean {
  const e = empreintes();
  return e.size > 0 && e.has(empreinteDeliberation(siren, date, objet));
}
