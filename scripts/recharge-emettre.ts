/**
 * Recharger une voiture électrique et covoiturer, commune par commune.
 *
 * **La recharge.** La base nationale des infrastructures de recharge (IRVE),
 * consolidée par data.gouv à partir des fichiers que publient les
 * aménageurs : une ligne par point de charge — une prise utilisable par une
 * voiture à la fois —, regroupés en stations. On compte les stations, les
 * points de charge, et ceux de 50 kW ou plus, la recharge rapide d'un
 * trajet. Ni nom de station ni aménageur : ce sont des enseignes, parfois des
 * personnes.
 *
 * Un quart des lignes n'a pas de code commune : la commune est alors
 * retrouvée par le code postal et le nom qui terminent l'adresse — « 03250
 * Le Mayet-de-Montagne » —, comme pour DATAtourisme.
 *
 * La puissance est déclarée en kW ; quelques fichiers la donnent en watts
 * (22 000 pour 22 kW) : au-delà de 1 000, on divise. Un point de charge
 * déclaré deux fois sous le même identifiant compte une fois.
 *
 * **Le covoiturage.** La base nationale des lieux de covoiturage (BNLC) :
 * aires, parkings relais, arrêts d'autostop organisé, avec leur nombre de
 * places quand il est déclaré.
 *
 * Lancé seul — `tsx scripts/recharge-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-recharge.json`.
 */
import { createReadStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { correspondances } from './lieux-emettre.ts';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU_IRVE = '5448d3e0c751df01f85d0572';
export const JEU_BNLC = '5d6eaffc8b4c417cdc452ac3';

/** Stations, points de charge, dont de 50 kW ou plus ; lieux de covoiturage, places déclarées. */
export type RechargeCommune = [number, number, number, number, number];

export interface Recharge {
  maj: string;
  /** La date de la consolidation IRVE et celle de la BNLC. */
  dates: { irve: string; bnlc: string };
  communes: Map<string, RechargeCommune>;
}

type Ressource = { title?: string; url?: string; format?: string; last_modified?: string };

export async function collecterRecharge(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Recharge | null> {
  const ressources = async (jeu: string) =>
    ((await lireJson(`https://www.data.gouv.fr/api/2/datasets/${jeu}/resources/?page_size=50`)) as { data?: Ressource[] }).data ?? [];
  const irve = (await ressources(JEU_IRVE)).find((x) => /csv/i.test(x.format ?? '') && /^Consolidation de la dernière version/i.test(x.title ?? ''));
  const bnlc = (await ressources(JEU_BNLC)).find((x) => /^bnlc\.csv$/i.test(x.title ?? ''));
  if (!irve?.url || !bnlc?.url) throw new Error('IRVE ou BNLC : fichier consolidé introuvable');
  const date = (r: Ressource) => (r.last_modified ?? '').slice(0, 10);

  const { actuelles, reports } = reportsDuDecoupage();
  const actuelle = (brut: string) => {
    const c = communeDe(brut.trim().padStart(5, '0'));
    return actuelles.has(c) ? c : (reports.get(c) ?? null);
  };
  const parCommune = new Map<string, { stations: Set<string>; pdc: Set<string>; rapides: Set<string>; lieux: number; places: number }>();
  const de = (code: string) => {
    let x = parCommune.get(code);
    if (!x) {
      x = { stations: new Set(), pdc: new Set(), rapides: new Set(), lieux: 0, places: 0 };
      parCommune.set(code, x);
    }
    return x;
  };

  const parAdresse = correspondances();
  let retrouvees = 0;
  const versIrve = join(cache, `irve-${date(irve)}.csv`);
  await telecharger(irve.url, versIrve);
  let col: Record<string, number> | null = null;
  let points = 0;
  for await (const v of lignesCsv(createReadStream(versIrve) as unknown as AsyncIterable<Uint8Array>, ',')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      for (const n of ['code_insee_commune', 'adresse_station', 'id_station_itinerance', 'id_pdc_itinerance', 'puissance_nominale']) {
        if (col[n] === undefined) throw new Error(`IRVE : colonne « ${n} » absente`);
      }
      continue;
    }
    let code = (v[col.code_insee_commune] ?? '').trim() ? actuelle(v[col.code_insee_commune] ?? '') : null;
    if (!code) {
      const m = /\b(\d{5})\s+([^,\d]+?)\s*$/.exec((v[col.adresse_station] ?? '').trim());
      code = m ? parAdresse(m[1], m[2]) : null;
      if (code) retrouvees++;
    }
    if (!code) continue;
    const station = (v[col.id_station_itinerance] ?? '').trim() || (v[col.id_station_local] ?? '').trim();
    const pdc = (v[col.id_pdc_itinerance] ?? '').trim() || `${station}/${(v[col.id_pdc_local] ?? '').trim()}`;
    if (!station || !pdc) continue;
    let kw = Number((v[col.puissance_nominale] ?? '').replace(',', '.'));
    if (kw > 1000) kw /= 1000;
    const x = de(code);
    x.stations.add(station);
    x.pdc.add(pdc);
    if (kw >= 50) x.rapides.add(pdc);
    points++;
  }
  if (points < 100000) {
    dire(`Recharge : ${points} points de charge seulement, on garde l’ingestion précédente.`);
    return null;
  }

  const versBnlc = join(cache, `bnlc-${date(bnlc)}.csv`);
  await telecharger(bnlc.url, versBnlc);
  col = null;
  let lieux = 0;
  for await (const v of lignesCsv([readFileSync(versBnlc, 'utf8')], ',')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      for (const n of ['insee', 'nbre_pl', 'ouvert']) {
        if (col[n] === undefined) throw new Error(`BNLC : colonne « ${n} » absente`);
      }
      continue;
    }
    if ((v[col.ouvert] ?? '').trim().toLowerCase() === 'false') continue;
    const code = actuelle(v[col.insee] ?? '');
    if (!code) continue;
    const x = de(code);
    x.lieux++;
    x.places += Math.max(0, Math.round(Number(v[col.nbre_pl]) || 0));
    lieux++;
  }
  if (lieux < 5000) {
    dire(`Covoiturage : ${lieux} lieux seulement, on garde l’ingestion précédente.`);
    return null;
  }

  const communes = new Map<string, RechargeCommune>();
  for (const [code, x] of parCommune) communes.set(code, [x.stations.size, x.pdc.size, x.rapides.size, x.lieux, x.places]);
  dire(
    `Recharge et covoiturage : ${points.toLocaleString('fr-FR')} lignes de points de charge ` +
      `(${retrouvees.toLocaleString('fr-FR')} par l’adresse), ` +
      `${lieux.toLocaleString('fr-FR')} lieux de covoiturage, ${communes.size.toLocaleString('fr-FR')} communes.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), dates: { irve: date(irve), bnlc: date(bnlc) }, communes };
}

export function ecrireRecharge(sortie: string, r: Recharge): number {
  return ecrireParDepartement(sortie, 'recharge', r.communes, () => ({ maj: r.maj, dates: r.dates }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const r = await collecterRecharge(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (r) console.log(`${ecrireRecharge(sortie, r)} départements écrits.`);
}
