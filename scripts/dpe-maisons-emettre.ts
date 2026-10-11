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
 * L'API rend dix mille lignes par page : quatre pages pour l'Allier, quelques
 * centaines pour la France. Lancé seul — `ROUAGES_DEPS=03 tsx
 * scripts/dpe-maisons-emettre.ts` —, il remplit le cache des départements
 * demandés ; la collecte DVF lit ensuite ceux qu'elle trouve.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const JEU = 'meg-83tjwtg8dyz4vv7h1dqe';
const LIGNES = `https://data.ademe.fr/data-fair/api/v1/datasets/${JEU}/lines`;
const ETIQUETTES = 'ABCDEFG';

/** [latitude, longitude, étiquette, surface habitable, jour AAAA-MM-JJ] */
export type DpeMaison = [number, number, string, number, string];

type Page = { results: Record<string, unknown>[]; next?: string };

export const fichierCache = (cache: string, dep: string) => join(cache, `dpe-maisons-${dep}.json`);

/** Les DPE de maisons d'un département, par commune : du cache s'il y est, sinon de l'API. */
export async function dpeMaisons(
  cache: string,
  dep: string,
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void = () => {},
): Promise<Map<string, DpeMaison[]>> {
  const chemin = fichierCache(cache, dep);
  let brut: Record<string, DpeMaison[]>;
  if (existsSync(chemin)) brut = JSON.parse(readFileSync(chemin, 'utf8'));
  else {
    brut = {};
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
    writeFileSync(chemin, JSON.stringify(brut));
    dire(`DPE des maisons ${dep} : ${n.toLocaleString('fr-FR')} diagnostics.`);
  }
  return new Map(Object.entries(brut));
}

// Lancé seul : remplit le cache des départements de ROUAGES_DEPS.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { telechargerSiAbsent } = await import('./par-departement.ts');
  const { cache, lireJson } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const deps = (process.env.ROUAGES_DEPS ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  if (deps.length === 0) {
    console.error('Précisez les départements : ROUAGES_DEPS=03');
    process.exit(1);
  }
  for (const dep of deps) await dpeMaisons(cache, dep, lireJson, console.log);
}
