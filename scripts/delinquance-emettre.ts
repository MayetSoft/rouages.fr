/**
 * La délinquance enregistrée par la police et la gendarmerie, commune par
 * commune, d'après la base communale du service statistique ministériel de la
 * sécurité intérieure (SSMSI).
 *
 * Ce que la base mesure, et ce qu'elle ne mesure pas — la page le redit :
 * - des faits *enregistrés*, au lieu où ils ont été commis ; la propension à
 *   porter plainte pèse sur le chiffre (12 % des victimes de violences
 *   sexuelles hors ménage, 74 % des victimes de cambriolage, selon les
 *   enquêtes de victimation citées par le SSMSI) ;
 * - pour les stupéfiants, des personnes mises en cause, pas des faits ; pour
 *   les escroqueries, des victimes à leur domicile, pas au lieu des faits ;
 * - un taux pour mille habitants, sauf les cambriolages, pour mille logements.
 *
 * **Le secret statistique décide de ce qui est publié**, pas ce script : le
 * SSMSI ne diffuse une commune, pour un indicateur, que si plus de cinq faits y
 * ont été enregistrés trois années de suite, ou aucun trois années de suite.
 * Ailleurs le fichier ne donne qu'une moyenne départementale des communes
 * masquées, que la page n'attribue pas à la commune.
 *
 * Lancé seul — `tsx scripts/delinquance-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-delinquance.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

export const JEU = 'bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales';

/**
 * Par indicateur : null si le SSMSI ne le diffuse pas la dernière année, sinon
 * [taux pour mille la dernière année, puis le nombre de chaque année — null
 * quand l'année n'est pas diffusée].
 */
export type Indicateurs = ([number, ...(number | null)[]] | null)[];

export interface Delinquance {
  maj: string;
  annees: number[];
  indicateurs: [string, string][]; // [libellé, unité de compte]
  communes: Map<string, Indicateurs>;
  /** Le taux du département, la dernière année, indicateur par indicateur. */
  departements: Map<string, (number | null)[]>;
}

const nombre = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s === '' || s === 'NA' || !Number.isFinite(n) ? null : n;
};

export async function lireDelinquance(communal: string, departemental: string): Promise<Omit<Delinquance, 'maj'>> {
  // En flux : cinq millions de lignes, dont on ne garde que ce qui est diffusé.
  const indicateurs: [string, string][] = [];
  const rang = new Map<string, number>();
  const vues = new Set<number>();
  // code -> indicateur -> année -> [nombre, taux]
  const diffuses = new Map<string, Map<number, Map<number, [number, number | null]>>>();
  let col: Record<string, number> | null = null;
  const flux = createReadStream(communal).pipe(createGunzip()) as unknown as AsyncIterable<Uint8Array>;
  for await (const v of lignesCsv(flux, ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      const code = Object.keys(col).find((n) => n.startsWith('CODGEO'));
      if (!code) throw new Error('colonne « CODGEO_… » absente — le fichier a changé de forme');
      col.CODGEO = col[code];
      for (const n of ['annee', 'indicateur', 'unite_de_compte', 'nombre', 'taux_pour_mille', 'est_diffuse']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    if (v.length < 7) continue;
    const ind = v[col.indicateur];
    if (!rang.has(ind)) {
      rang.set(ind, indicateurs.length);
      indicateurs.push([ind, v[col.unite_de_compte]]);
    }
    const annee = Number(v[col.annee]);
    if (!Number.isFinite(annee)) continue;
    vues.add(annee);
    const code = v[col.CODGEO];
    const n = nombre(v[col.nombre]);
    if (v[col.est_diffuse] !== 'diff' || n === null || !/^\d[\dAB]\d{3}$/.test(code)) continue;
    let c = diffuses.get(code);
    if (!c) diffuses.set(code, (c = new Map()));
    const i = rang.get(ind)!;
    let s = c.get(i);
    if (!s) c.set(i, (s = new Map()));
    s.set(annee, [n, nombre(v[col.taux_pour_mille])]);
  }
  const annees = [...vues].sort();
  const derniere = annees.at(-1)!;
  const communes = new Map<string, Indicateurs>();
  for (const [code, c] of diffuses) {
    const x: Indicateurs = indicateurs.map((_, i) => {
      const s = c.get(i);
      const d = s?.get(derniere);
      // Seulement ce que le SSMSI diffuse la dernière année : une série
      // interrompue dirait autre chose que ce qu'il publie aujourd'hui.
      if (!s || !d || d[1] === null) return null;
      return [Math.round(d[1] * 100) / 100, ...annees.map((a) => s.get(a)?.[0] ?? null)];
    });
    if (x.some((y) => y !== null)) communes.set(code, x);
  }

  // Le département, pour situer : le taux de la dernière année.
  const departements = new Map<string, (number | null)[]>();
  col = null;
  for await (const v of lignesCsv(createReadStream(departemental) as unknown as AsyncIterable<Uint8Array>, ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['Code_departement', 'annee', 'indicateur', 'taux_pour_mille']) {
        if (col[n] === undefined) throw new Error(`base départementale : colonne « ${n} » absente`);
      }
      continue;
    }
    if (Number(v[col.annee]) !== derniere) continue;
    const i = rang.get(v[col.indicateur]);
    if (i === undefined) continue;
    const dep = v[col.Code_departement];
    if (!departements.has(dep)) departements.set(dep, indicateurs.map(() => null));
    const t = nombre(v[col.taux_pour_mille]);
    departements.get(dep)![i] = t === null ? null : Math.round(t * 100) / 100;
  }
  return { annees, indicateurs, communes, departements };
}

/** Les adresses changent à chaque publication : on les lit dans le jeu. */
async function adresses(lireJson: (url: string) => Promise<unknown>): Promise<{ communal: string; departemental: string }> {
  const d = (await lireJson(`https://www.data.gouv.fr/api/1/datasets/${JEU}/`)) as {
    resources?: { title?: string; url?: string; format?: string; last_modified?: string }[];
  };
  const recente = (f: (r: { title?: string; url?: string; format?: string }) => boolean) =>
    (d.resources ?? []).filter(f).sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''))[0]?.url;
  const communal = recente((r) => /^COM - /.test(r.title ?? '') && (r.format ?? '').includes('csv'));
  const departemental = recente((r) => /^DEP - /.test(r.title ?? '') && (r.format ?? '') === 'csv');
  if (!communal || !departemental) throw new Error('bases communale ou départementale introuvables dans le jeu du SSMSI');
  return { communal, departemental };
}

export async function collecterDelinquance(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Delinquance | null> {
  const com = join(cache, 'ssmsi-communes.csv.gz');
  const dep = join(cache, 'ssmsi-departements.csv');
  try {
    const a = await adresses(lireJson);
    await telecharger(a.communal, com);
    await telecharger(a.departemental, dep);
  } catch {
    dire('Délinquance enregistrée indisponible : celle de l’ingestion précédente reste en place.');
    return null;
  }
  const d = await lireDelinquance(com, dep);
  if (d.communes.size < 5000 || d.departements.size < 90) {
    dire(`Délinquance enregistrée : ${d.communes.size} communes, ${d.departements.size} départements — on garde l’ingestion précédente.`);
    return null;
  }
  dire(
    `Délinquance enregistrée ${d.annees[0]}-${d.annees.at(-1)} : au moins un indicateur diffusé pour ` +
      `${d.communes.size.toLocaleString('fr-FR')} communes.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...d };
}

export function ecrireDelinquance(sortie: string, d: Delinquance): number {
  return ecrireParDepartement(sortie, 'delinquance', d.communes, (dep) => ({
    maj: d.maj,
    annees: d.annees,
    indicateurs: d.indicateurs,
    dep: d.departements.get(dep) ?? null,
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const d = await collecterDelinquance(lireJson, telecharger, cache, console.log);
  if (d) console.log(`${ecrireDelinquance(sortie, d)} départements écrits.`);
}
