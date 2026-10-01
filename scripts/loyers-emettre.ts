/**
 * Le loyer d'annonce estimé dans chaque commune, en euros par mètre carré,
 * pour un appartement et pour une maison, d'après la « carte des loyers » du
 * ministère chargé du logement et de l'ANIL.
 *
 * Ce que l'indicateur est, d'après le guide d'utilisation (décembre 2025) :
 * une **prédiction**, charges comprises, pour un logement type non meublé mis
 * en location au troisième trimestre — un appartement de 52 m², une maison de
 * 92 m² —, tirée d'un modèle estimé sur les annonces de leboncoin et du
 * Groupe SeLoger. Pas un loyer moyen ni médian, et pas le loyer des locataires
 * en place : celui des logements proposés. Calculé dans la commune quand elle
 * compte au moins cent annonces ; sinon dans son intercommunalité ou dans une
 * « maille » de communes voisines comparables.
 *
 * Le guide demande de lire avec prudence une commune de moins de trente
 * annonces, un coefficient de détermination sous 0,5 ou un intervalle très
 * large : la page le dit dans ces cas-là. Il interdit aussi de comparer deux
 * millésimes, le maillage changeant chaque année : on ne garde que le dernier.
 *
 * Lancé seul — `tsx scripts/loyers-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-loyers.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

/** Le jeu du millésime 2025 ; la recherche en trouve un plus récent s'il paraît. */
export const JEU_2025 = '693aa2feed1bf4da603faa49';

/**
 * Loyer prédit, borne basse et borne haute de l'intervalle à 95 % (€/m²,
 * au centime), niveau de la prédiction — 0 commune, 1 intercommunalité,
 * 2 maille —, annonces dans la commune, R² ajusté en centièmes.
 */
export type Loyer = [number, number, number, 0 | 1 | 2, number, number];

export interface Loyers {
  maj: string;
  millesime: number;
  /** Appartement, maison ; null quand le segment manque. */
  communes: Map<string, [Loyer | null, Loyer | null]>;
}

type Ressource = { title?: string; url?: string; format?: string };

async function jeuLePlusRecent(lireJson: (url: string) => Promise<unknown>): Promise<{ id: string; millesime: number }> {
  try {
    const r = (await lireJson(
      'https://www.data.gouv.fr/api/2/datasets/search/?q=carte+des+loyers+indicateurs+de+loyers+d%27annonce+par+commune&page_size=20',
    )) as { data?: { id: string; title?: string }[] };
    const jeux = (r.data ?? [])
      .map((d) => ({ id: d.id, millesime: Number(/carte des loyers.*par commune en (\d{4})/i.exec(d.title ?? '')?.[1] ?? 0) }))
      .filter((d) => d.millesime > 0)
      .sort((a, b) => b.millesime - a.millesime);
    if (jeux[0] && jeux[0].millesime >= 2025) return jeux[0];
  } catch {
    // La recherche de data.gouv est la partie fragile : le millésime connu suffit.
  }
  return { id: JEU_2025, millesime: 2025 };
}

const nombre = (s: string | undefined) => Number((s ?? '').replace(',', '.'));
const centimes = (x: number) => Math.round(x * 100) / 100;

export async function collecterLoyers(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Loyers | null> {
  const { id, millesime } = await jeuLePlusRecent(lireJson);
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${id}/resources/?page_size=50`)) as { data?: Ressource[] };
  const ressource = (motif: RegExp) => (r.data ?? []).find((x) => x.url && /csv/i.test(x.format ?? '') && motif.test(x.url));
  const app = ressource(/pred-app-/);
  const mai = ressource(/pred-mai-/);
  if (!app || !mai) throw new Error(`carte des loyers ${millesime} : fichiers appartement ou maison introuvables`);

  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, [Loyer | null, Loyer | null]>();
  for (const [i, res] of [app, mai].entries()) {
    const vers = join(cache, `loyers-${millesime}-${i === 0 ? 'appartement' : 'maison'}.csv`);
    await telecharger(res.url!, vers);
    // Les fichiers sont en Latin-1.
    const texte = new TextDecoder('latin1').decode(readFileSync(vers));
    let col: Record<string, number> | null = null;
    let n = 0;
    for await (const v of lignesCsv([texte], ';')) {
      if (!col) {
        col = Object.fromEntries(v.map((x, k) => [x.trim(), k]));
        for (const c of ['INSEE_C', 'loypredm2', 'lwr.IPm2', 'upr.IPm2', 'TYPPRED', 'nbobs_com', 'R2_adj']) {
          if (col[c] === undefined) throw new Error(`carte des loyers : colonne « ${c} » absente`);
        }
        continue;
      }
      const brut = communeDe((v[col.INSEE_C] ?? '').trim());
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      const loyer = nombre(v[col.loypredm2]);
      if (!code || !Number.isFinite(loyer) || loyer <= 0) continue;
      const type = (v[col.TYPPRED] ?? '').trim().toLowerCase();
      const x = communes.get(code) ?? [null, null];
      // Une commune nouvelle réunit des lignes : on garde celle de son code actuel.
      if (x[i] && brut !== code) continue;
      x[i] = [
        centimes(loyer),
        centimes(nombre(v[col['lwr.IPm2']])),
        centimes(nombre(v[col['upr.IPm2']])),
        type === 'commune' ? 0 : type === 'epci' ? 1 : 2,
        Number(v[col.nbobs_com]) || 0,
        Math.round(nombre(v[col.R2_adj]) * 100),
      ];
      communes.set(code, x);
      n++;
    }
    if (n < 30000) {
      dire(`Carte des loyers : ${n} communes seulement, on garde l’ingestion précédente.`);
      return null;
    }
  }
  dire(`Carte des loyers ${millesime} : ${communes.size.toLocaleString('fr-FR')} communes.`);
  return { maj: new Date().toISOString().slice(0, 10), millesime, communes };
}

export function ecrireLoyers(sortie: string, l: Loyers): number {
  return ecrireParDepartement(sortie, 'loyers', l.communes, () => ({ maj: l.maj, millesime: l.millesime }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const l = await collecterLoyers(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (l) console.log(`${ecrireLoyers(sortie, l)} départements écrits.`);
}
