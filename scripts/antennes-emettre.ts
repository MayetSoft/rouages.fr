/**
 * Les sites mobiles installés dans chaque commune, par opérateur : combien, et
 * combien en 4G et en 5G. D'après la liste que l'Arcep collecte chaque
 * trimestre auprès des opérateurs — les sites ouverts commercialement, d'une
 * puissance rayonnée de plus de 5 W.
 *
 * **Ce sont des antennes, pas une couverture.** Un site dans la commune voisine
 * peut couvrir celle-ci, et un site ici ne couvre pas tout son territoire. La
 * couverture elle-même, l'Arcep la publie en cartes, par opérateur et par
 * technologie : des polygones de plusieurs centaines de mégaoctets, qu'on ne
 * ramènerait à la commune qu'avec des contours communaux que le site n'a pas.
 * La page renvoie à la carte de l'Arcep pour savoir si l'on capte à une
 * adresse.
 *
 * Un site partagé entre opérateurs — « mutualisé » — compte une fois pour
 * chacun : on ne sait pas les réunir tous, l'identifiant de partage n'étant
 * renseigné que pour certains programmes.
 *
 * Le fichier se dit en UTF-8 ; celui du deuxième trimestre 2026 était en
 * Latin-1. On essaie l'un, puis l'autre.
 *
 * Lancé seul — `tsx scripts/antennes-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-antennes.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const DOSSIER = 'https://data.arcep.fr/mobile/sites/';

/** Par opérateur présent : son rang dans la liste des opérateurs, ses sites, dont en 4G, dont en 5G. */
export type AntennesCommune = [number, number, number, number][];

export interface Antennes {
  maj: string;
  /** Le trimestre de la liste, « 2026_T2 ». */
  trimestre: string;
  operateurs: string[];
  communes: Map<string, AntennesCommune>;
}

/** Le dernier trimestre publié, lu dans la page du dossier. */
export function dernierTrimestre(page: string): string | null {
  const t = [...page.matchAll(/(\d{4})_T([1-4])/g)].map((m) => `${m[1]}_T${m[2]}`);
  return [...new Set(t)].sort().pop() ?? null;
}

function decoder(octets: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('latin1').decode(octets);
  }
}

/** Les libellés de l'Arcep, sans les variantes d'écriture d'un trimestre à l'autre. */
function operateur(brut: string): string {
  const n = brut.trim().replace(/\s+/g, ' ');
  if (/^bouygues/i.test(n)) return 'Bouygues Telecom';
  if (/^free/i.test(n)) return 'Free Mobile';
  if (/^sfr$/i.test(n)) return 'SFR';
  if (/^orange$/i.test(n)) return 'Orange';
  return n;
}

export async function collecterAntennes(
  lireTexte: (url: string) => Promise<string>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Antennes | null> {
  const trimestre = dernierTrimestre(await lireTexte(DOSSIER));
  if (!trimestre) throw new Error('sites mobiles : aucun trimestre dans le dossier de l’Arcep');
  const { actuelles, reports } = reportsDuDecoupage();

  const operateurs: string[] = [];
  const rang = (nom: string) => {
    const i = operateurs.indexOf(nom);
    if (i >= 0) return i;
    operateurs.push(nom);
    return operateurs.length - 1;
  };
  const parCommune = new Map<string, Map<number, [number, number, number]>>();
  let total = 0;

  for (const zone of ['Metropole', 'Outremer']) {
    const vers = join(cache, `arcep-sites-${trimestre}-${zone}.csv`);
    await telecharger(`${DOSSIER}${trimestre}/${trimestre}_sites_${zone}.csv`, vers);
    let col: Record<string, number> | null = null;
    for await (const v of lignesCsv([decoder(readFileSync(vers))], ';')) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
        for (const n of ['nom_op', 'insee_com', 'site_4g', 'site_5g']) {
          if (col[n] === undefined) throw new Error(`sites ${zone} : colonne « ${n} » absente`);
        }
        continue;
      }
      const brut = communeDe(codeCommune(v[col.insee_com] ?? ''));
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      const nom = operateur(v[col.nom_op] ?? '');
      if (!code || !nom) continue;
      const parOp = parCommune.get(code) ?? new Map<number, [number, number, number]>();
      const x = parOp.get(rang(nom)) ?? [0, 0, 0];
      x[0]++;
      if (v[col.site_4g]?.trim() === '1') x[1]++;
      if (v[col.site_5g]?.trim() === '1') x[2]++;
      parOp.set(rang(nom), x);
      parCommune.set(code, parOp);
      total++;
    }
  }
  if (total < 80000) {
    dire(`Sites mobiles : ${total} seulement, on garde l’ingestion précédente.`);
    return null;
  }

  const communes = new Map<string, AntennesCommune>();
  for (const [code, parOp] of parCommune) {
    communes.set(
      code,
      [...parOp].sort((a, b) => a[0] - b[0]).map(([op, [n, g4, g5]]) => [op, n, g4, g5]),
    );
  }
  dire(
    `Sites mobiles ${trimestre} : ${total.toLocaleString('fr-FR')} sites d’opérateur dans ` +
      `${communes.size.toLocaleString('fr-FR')} communes, ${operateurs.length} opérateurs.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), trimestre, operateurs, communes };
}

export function ecrireAntennes(sortie: string, a: Antennes): number {
  return ecrireParDepartement(sortie, 'antennes', a.communes, () => ({
    maj: a.maj,
    trimestre: a.trimestre,
    operateurs: a.operateurs,
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const a = await collecterAntennes(async (url) => (await obstine(url)).text(), telecharger, cache, console.log);
  if (a) console.log(`${ecrireAntennes(sortie, a)} départements écrits.`);
}
