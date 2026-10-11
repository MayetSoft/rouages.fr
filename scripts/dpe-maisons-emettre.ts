/**
 * Les DPE des maisons, un par un, pour mesurer ce que l'étiquette énergétique
 * pèse dans le prix d'une vente (`estimation-emettre.ts`).
 *
 * La base « DPE Logements existants (depuis juillet 2021) » de l'ADEME, sous
 * Licence Ouverte 2.0. On ne garde de chaque diagnostic que ce qui sert au
 * rapprochement avec une vente : la commune, le point, l'étiquette, la surface
 * habitable, la date — ni adresse écrite, ni numéro de DPE. Les fichiers
 * restent dans `.cache/`, hors du dépôt ; rien n'est publié diagnostic par
 * diagnostic (voir `docs/07-risques.md`).
 *
 * L'API rend dix mille lignes par page : quatre pages pour l'Allier, près de
 * cinq cents pour la France (4,7 millions de maisons en octobre 2026), trois
 * départements à la fois. Lancé seul — `tsx scripts/dpe-maisons-emettre.ts`,
 * `ROUAGES_DEPS=03` pour quelques départements —, il remplit le cache ;
 * l'ingestion le remplit aussi, puis la collecte DVF lit ce qu'elle y trouve.
 */
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JEU = 'meg-83tjwtg8dyz4vv7h1dqe';
const LIGNES = `https://data.ademe.fr/data-fair/api/v1/datasets/${JEU}/lines`;
const ETIQUETTES = 'ABCDEFG';
const EN_MEME_TEMPS = 3;

/** [latitude, longitude, étiquette, surface habitable, jour AAAA-MM-JJ] */
export type DpeMaison = [number, number, string, number, string];

type Page = { results: Record<string, unknown>[]; next?: string };

export const fichierCache = (cache: string, dep: string) => join(cache, `dpe-maisons-${dep}.json`);

/**
 * Le fichier en cache se réutilise, sauf s'il a plus de `ROUAGES_CACHE_JOURS`
 * jours — la règle des autres gros fichiers de l'ingestion.
 */
function reutilisable(chemin: string): boolean {
  if (!existsSync(chemin)) return false;
  const joursMax = Number(process.env.ROUAGES_CACHE_JOURS ?? '');
  return !(Number.isFinite(joursMax) && joursMax > 0 && Date.now() - statSync(chemin).mtimeMs > joursMax * 86_400_000);
}

/** Met en cache les DPE de maisons d'un département, par commune ; rend le nombre de diagnostics téléchargés, 0 s'il était déjà là. */
export async function dpeMaisons(
  cache: string,
  dep: string,
  lireJson: (url: string) => Promise<unknown>,
  reutiliser = true,
): Promise<number> {
  const chemin = fichierCache(cache, dep);
  if (reutiliser && reutilisable(chemin)) return 0;
  const brut: Record<string, DpeMaison[]> = {};
  const params = new URLSearchParams({
    qs: `code_departement_ban:"${dep}" AND type_batiment:"maison"`,
    select: 'date_etablissement_dpe,etiquette_dpe,surface_habitable_logement,code_insee_ban,_geopoint',
    size: '10000',
  });
  let url: string | undefined = `${LIGNES}?${params}`;
  let n = 0;
  while (url) {
    const page = (await lireJson(url)) as Page;
    for (const d of page.results) {
      const g = String(d._geopoint ?? '');
      const e = String(d.etiquette_dpe ?? '');
      const s = Number(d.surface_habitable_logement);
      const jour = String(d.date_etablissement_dpe ?? '').slice(0, 10);
      const code = String(d.code_insee_ban ?? '');
      if (!g.includes(',') || !ETIQUETTES.includes(e) || e.length !== 1 || !(s > 0) || !jour || !code) continue;
      const [lat, lon] = g.split(',').map(Number);
      (brut[code] ??= []).push([lat, lon, e, s, jour]);
      n++;
    }
    url = page.next;
  }
  // Écrit d'un coup : un téléchargement interrompu ne laisse pas un département à moitié.
  writeFileSync(`${chemin}.partiel`, JSON.stringify(brut));
  renameSync(`${chemin}.partiel`, chemin);
  return n;
}

/**
 * Les DPE de maisons de plusieurs départements, trois à la fois. Un
 * département qui échoue est sauté : l'estimation de sa région se passera de
 * l'étiquette. Rend les départements en échec.
 */
export async function collecterDpeMaisons(
  cache: string,
  deps: string[],
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void = () => {},
  reutiliser = true,
): Promise<string[]> {
  const echecs: string[] = [];
  const file = [...deps];
  let total = 0;
  const ouvrier = async () => {
    for (let dep = file.shift(); dep; dep = file.shift()) {
      try {
        const n = await dpeMaisons(cache, dep, lireJson, reutiliser);
        total += n;
        if (n) dire(`DPE des maisons ${dep} : ${n.toLocaleString('fr-FR')} diagnostics.`);
      } catch (e) {
        echecs.push(dep);
        dire(`DPE des maisons ${dep} : échec (${(e as Error).message}).`);
      }
    }
  };
  await Promise.all(Array.from({ length: EN_MEME_TEMPS }, ouvrier));
  dire(`DPE des maisons : ${total.toLocaleString('fr-FR')} diagnostics téléchargés, ${deps.length - echecs.length} départements sur ${deps.length} en cache.`);
  return echecs;
}

/** Les départements du site, d'après `deps.json`. */
export const tousLesDepartements = (sortie: string): string[] => Object.keys(JSON.parse(readFileSync(join(sortie, 'deps.json'), 'utf8')));

// Lancé seul : remplit le cache des départements de ROUAGES_DEPS, ou de tous.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { telechargerSiAbsent } = await import('./par-departement.ts');
  const { cache, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const choisis = (process.env.ROUAGES_DEPS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  const echecs = await collecterDpeMaisons(cache, choisis.length ? choisis : tousLesDepartements(sortie), lireJson, console.log);
  if (echecs.length) process.exitCode = 1;
}
