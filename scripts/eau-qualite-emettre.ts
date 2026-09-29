/**
 * L'eau du robinet est-elle conforme ? Le contrôle sanitaire des agences
 * régionales de santé, commune par commune, sur les douze derniers mois.
 *
 * Le ministère de la santé publie chaque prélèvement avec sa conclusion et
 * quatre verdicts : conforme ou non aux **limites** de qualité — celles qui
 * protègent la santé, microbiologiques d'un côté, chimiques (nitrates,
 * pesticides, métaux…) de l'autre — et aux **références** de qualité, simples
 * témoins du fonctionnement des installations, sans incidence directe sur la
 * santé. La page ne compte que les premières : c'est la distinction que fait la
 * réglementation, et l'autre ferait passer un défaut de goût pour un danger.
 *
 * « D », conforme dans le cadre d'une dérogation, est gardé à part : le
 * préfet a autorisé pour un temps une eau qui dépasse une limite chimique, et
 * c'est précisément le genre de décision que ce site veut rendre visible.
 *
 * Le lien entre une commune et ses réseaux vient du même jeu : une commune peut
 * être desservie par plusieurs unités de distribution, un réseau peut desservir
 * plusieurs communes. Un prélèvement fait en amont est rattaché à chaque réseau
 * qu'il alimente ; il n'est compté qu'une fois par commune.
 *
 * Lancé seul — `tsx scripts/eau-qualite-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-eau-qualite.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

const BASE = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/controle_sanitaire_eau';
export const PRELEVEMENTS = `${BASE}/PLV.csv.gz`;
export const RESEAUX = `${BASE}/COM_UDI.csv.gz`;

/**
 * Par commune : prélèvements, non conformes aux limites microbiologiques, aux
 * limites chimiques, conformes sous dérogation, date du dernier non conforme,
 * maître d'ouvrage et exploitant les plus fréquents.
 */
export type Qualite = [number, number, number, number, string | null, string, string];

export interface EauQualite {
  maj: string;
  /** Les douze mois retenus, bornes comprises. */
  du: string;
  au: string;
  communes: Map<string, Qualite>;
}

function flux(chemin: string) {
  return createReadStream(chemin).pipe(createGunzip()) as unknown as AsyncIterable<Uint8Array>;
}

export async function lireEauQualite(prelevements: string, reseaux: string): Promise<Omit<EauQualite, 'maj'>> {
  // 1. Les réseaux de chaque commune, d'après le rattachement le plus récent.
  const desservies = new Map<string, Set<string>>(); // réseau -> communes
  let annee = '';
  const lignesReseaux: [string, string, string][] = [];
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv(flux(reseaux))) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['inseecommune', 'cdreseau', 'annee']) {
        if (col[n] === undefined) throw new Error(`COM_UDI : colonne « ${n} » absente`);
      }
      continue;
    }
    const a = v[col.annee];
    if (a > annee) annee = a;
    lignesReseaux.push([v[col.inseecommune], v[col.cdreseau], a]);
  }
  for (const [commune, reseau, a] of lignesReseaux) {
    if (a !== annee || !/^\d[\dAB]\d{3}$/.test(commune)) continue;
    if (!desservies.has(reseau)) desservies.set(reseau, new Set());
    desservies.get(reseau)!.add(commune);
  }

  // 2. Les prélèvements : un premier passage suffit si on garde tout ce qui a
  //    moins de treize mois, la borne exacte n'étant connue qu'à la fin.
  type Plv = { date: string; b: string; c: string; moa: string; distr: string };
  const parReseau = new Map<string, Map<string, Plv>>(); // réseau -> référence -> prélèvement
  let fin = '';
  col = null;
  for await (const v of lignesCsv(flux(prelevements))) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['cdreseau', 'referenceprel', 'dateprel', 'plvconformitebacterio', 'plvconformitechimique', 'moalib', 'distrlib']) {
        if (col[n] === undefined) throw new Error(`PLV : colonne « ${n} » absente`);
      }
      continue;
    }
    const date = v[col.dateprel];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date > fin) fin = date;
    // Deux ans de marge : la borne se resserre à la fin.
    if (fin && date < `${Number(fin.slice(0, 4)) - 2}${fin.slice(4)}`) continue;
    const reseau = v[col.cdreseau];
    if (!desservies.has(reseau)) continue;
    if (!parReseau.has(reseau)) parReseau.set(reseau, new Map());
    parReseau.get(reseau)!.set(v[col.referenceprel], {
      date,
      b: v[col.plvconformitebacterio],
      c: v[col.plvconformitechimique],
      moa: v[col.moalib].trim(),
      distr: v[col.distrlib].trim(),
    });
  }
  if (!fin) throw new Error('aucun prélèvement daté');
  // Douze mois pleins, jusqu'au dernier prélèvement publié.
  const debut = new Date(`${fin}T00:00:00Z`);
  debut.setUTCFullYear(debut.getUTCFullYear() - 1);
  debut.setUTCDate(debut.getUTCDate() + 1);
  const du = debut.toISOString().slice(0, 10);

  // 3. Par commune, chaque prélèvement une fois.
  const parCommune = new Map<string, Map<string, Plv>>();
  for (const [reseau, plvs] of parReseau) {
    for (const commune of desservies.get(reseau)!) {
      if (!parCommune.has(commune)) parCommune.set(commune, new Map());
      const m = parCommune.get(commune)!;
      for (const [ref, p] of plvs) if (p.date >= du) m.set(ref, p);
    }
  }
  const plusFrequent = (v: string[]) => {
    const n = new Map<string, number>();
    for (const x of v) if (x) n.set(x, (n.get(x) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  };
  const communes = new Map<string, Qualite>();
  for (const [commune, m] of parCommune) {
    const p = [...m.values()];
    if (p.length === 0) continue;
    const nonConformes = p.filter((x) => x.b === 'N' || x.c === 'N').map((x) => x.date).sort();
    communes.set(commune, [
      p.length,
      p.filter((x) => x.b === 'N').length,
      p.filter((x) => x.c === 'N').length,
      p.filter((x) => x.c === 'D').length,
      nonConformes.at(-1) ?? null,
      plusFrequent(p.map((x) => x.moa)),
      plusFrequent(p.map((x) => x.distr)),
    ]);
  }
  return { du, au: fin, communes };
}

export async function collecterEauQualite(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<EauQualite | null> {
  const plv = join(cache, 'eau-controle-plv.csv.gz');
  const udi = join(cache, 'eau-controle-com-udi.csv.gz');
  try {
    await telecharger(RESEAUX, udi);
    await telecharger(PRELEVEMENTS, plv);
  } catch {
    dire('Contrôle sanitaire de l’eau indisponible : celui de l’ingestion précédente reste en place.');
    return null;
  }
  const e = await lireEauQualite(plv, udi);
  if (e.communes.size < 30000) {
    dire(`Contrôle sanitaire de l’eau : ${e.communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const touchees = [...e.communes.values()].filter((q) => q[1] + q[2] > 0).length;
  dire(
    `Contrôle sanitaire de l’eau du ${e.du} au ${e.au} : ${e.communes.size.toLocaleString('fr-FR')} communes, ` +
      `dont ${touchees.toLocaleString('fr-FR')} avec au moins un prélèvement non conforme à une limite.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...e };
}

export function ecrireEauQualite(sortie: string, e: EauQualite): number {
  return ecrireParDepartement(sortie, 'eau-qualite', e.communes, () => ({ maj: e.maj, du: e.du, au: e.au }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const e = await collecterEauQualite(telecharger, cache, console.log);
  if (e) console.log(`${ecrireEauQualite(sortie, e)} départements écrits.`);
}
