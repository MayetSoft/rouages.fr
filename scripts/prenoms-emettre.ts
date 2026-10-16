/**
 * La liste des prénoms courants, pour repérer un particulier nommé sans
 * civilité dans l'objet d'une délibération (`src/modele/civilites.ts`).
 *
 * Elle est tirée des prénoms du répertoire national des élus, déjà ingéré
 * (`dep/XX-conseils.json`) : un prénom porté par au moins cinq conseillers,
 * et chaque partie d'un prénom composé. Ce n'est qu'un dictionnaire — aucun
 * nom n'y figure, aucune personne n'y est rattachée. Les prénoms qui sont
 * aussi des mots courants (« France », « Noël », « Maire »…) en sont retirés
 * dans `civilites.ts`, pas ici, pour que la liste reste ce que dit la source.
 *
 * Lancé à la main — `npx tsx scripts/prenoms-emettre.ts` — après une
 * ingestion des élus ; il réécrit `src/modele/prenoms.json`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEUIL = 5;
const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dossier = join(racine, 'public', 'territoires', 'dep');
const compte = new Map<string, number>();
for (const f of readdirSync(dossier).filter((n) => n.endsWith('-conseils.json'))) {
  const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { c: Record<string, { m?: [string, string, string][] }> };
  for (const e of Object.values(d.c))
    for (const [prenom] of e.m ?? []) {
      const p = prenom.trim();
      if (!p) continue;
      const parts = p.split('-');
      for (const x of parts.length > 1 ? [p, ...parts] : [p]) compte.set(x, (compte.get(x) ?? 0) + 1);
    }
}
const p = [...compte].filter(([x, n]) => n >= SEUIL && x.length >= 3).map(([x]) => x).sort((a, b) => a.localeCompare(b, 'fr'));
writeFileSync(
  join(racine, 'src', 'modele', 'prenoms.json'),
  JSON.stringify({ source: 'Répertoire national des élus, prénoms des conseillers municipaux', maj: new Date().toISOString().slice(0, 10), seuil: SEUIL, p }) + '\n',
);
console.log(`${p.length} prénoms écrits.`);
