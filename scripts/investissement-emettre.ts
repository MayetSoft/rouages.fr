/**
 * Les projets d'investissement des communes que l'État a subventionnés, un par
 * un, d'après la liste que publie la direction générale des collectivités
 * locales (DGCL) : la dotation d'équipement des territoires ruraux (DETR), la
 * dotation de soutien à l'investissement local (DSIL), la dotation politique
 * de la ville (DPV) et la dotation de soutien à l'investissement des
 * départements (DSID, absente des communes).
 *
 * Ce que la page en tire : ce qui a été financé ici, avec quel argent de
 * l'État et pour quel coût total. Les dotations de fonctionnement — la DGF —
 * sont dans un autre bloc ; ici, ce sont des subventions accordées projet par
 * projet, par le préfet le plus souvent.
 *
 * S'y ajoutent les projets des communes subventionnés par le Fonds vert —
 * le fonds d'accélération de la transition écologique dans les territoires —,
 * publiés par le ministère de la Transition écologique : le montant engagé,
 * sans coût total. Les exports « p113 », une autre ligne budgétaire publiée à
 * part, ne sont pas lus.
 *
 * Trois exercices, les derniers publiés. Un projet porté par
 * l'intercommunalité ou un syndicat n'est pas compté dans la commune : le
 * fichier ne dit pas où il se trouve. L'intitulé est repris tel que la
 * préfecture l'a saisi, accents manquants compris ; un intitulé qui nomme une
 * personne — civilité suivie d'un nom — est écarté, comme pour les
 * délibérations.
 *
 * Lancé seul — `tsx scripts/investissement-emettre.ts` —, il réécrit les
 * fichiers `public/territoires/dep/XX-investissement.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '6176785207139a929a2776fe';
export const JEU_FONDS_VERT = '66a215a463a9da4fb801b8cf';
const EXERCICES = 3;

/** Exercice, dispositif, intitulé, coût hors taxes (0 s'il n'est pas publié), subvention — en euros. */
export type Projet = [number, string, string, number, number];

export interface Investissement {
  maj: string;
  exercices: number[];
  communes: Map<string, Projet[]>;
}

const euros = (s: string | undefined) => {
  const n = Number((s ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export async function collecterInvestissement(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Investissement | null> {
  type Ressource = { title?: string; url?: string };
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEU}/resources/?page_size=50`)) as { data?: Ressource[] };
  // Le titre du fichier de 2025 commence par une majuscule : la casse est ignorée.
  const fichiers = (r.data ?? [])
    .map((x) => ({ url: x.url ?? '', annee: Number(/-(\d{4})\.csv$/i.exec(x.title ?? '')?.[1] ?? 0) }))
    .filter((x) => x.url && x.annee > 2000)
    .sort((a, b) => b.annee - a.annee)
    .slice(0, EXERCICES);
  if (fichiers.length < EXERCICES) throw new Error(`DGCL : ${fichiers.length} exercices seulement dans le jeu`);

  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Projet[]>();
  let lus = 0;
  let ecartes = 0;
  for (const f of fichiers) {
    const vers = join(cache, `dgcl-projets-${f.annee}.csv`);
    await telecharger(f.url, vers);
    let col: Record<string, number> | null = null;
    for await (const v of lignesCsv([readFileSync(vers, 'utf8')], ';')) {
      if (!col) {
        col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
        for (const n of ['exercice', 'dispositif', 'beneficiaire_type', 'beneficiaire_code_insee', 'intitule', 'cout_ht', 'subvention']) {
          if (col[n] === undefined) throw new Error(`DGCL ${f.annee} : colonne « ${n} » absente`);
        }
        continue;
      }
      if ((v[col.beneficiaire_type] ?? '').trim().toLowerCase() !== 'commune') continue;
      const brut = communeDe((v[col.beneficiaire_code_insee] ?? '').trim().padStart(5, '0'));
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      if (!code) continue;
      const intitule = (v[col.intitule] ?? '').replace(/\s+/g, ' ').trim();
      if (!intitule) continue;
      lus++;
      if (nommeUnePersonne(intitule)) {
        ecartes++;
        continue;
      }
      const l = communes.get(code) ?? [];
      l.push([
        Number(v[col.exercice]) || f.annee,
        (v[col.dispositif] ?? '').trim(),
        intitule.length > 180 ? `${intitule.slice(0, 177)}…` : intitule,
        euros(v[col.cout_ht]),
        euros(v[col.subvention]),
      ]);
      communes.set(code, l);
    }
  }
  // Le Fonds vert : les projets dont la commune est elle-même bénéficiaire.
  const fv = (
    (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEU_FONDS_VERT}/resources/?page_size=50`)) as { data?: Ressource[] }
  ).data ?? [];
  const exportsFv = fv
    .map((x) => ({ url: x.url ?? '', annee: Number(/^fonds-vert-(\d{4})-export\.csv$/i.exec(x.title ?? '')?.[1] ?? 0) }))
    .filter((x) => x.url && x.annee > 2000)
    .sort((a, b) => b.annee - a.annee)
    .slice(0, EXERCICES);
  let fondsVert = 0;
  for (const f of exportsFv) {
    const vers = join(cache, `fonds-vert-${f.annee}.csv`);
    await telecharger(f.url, vers);
    let col: Record<string, number> | null = null;
    for await (const v of lignesCsv([readFileSync(vers, 'utf8')], ',')) {
      if (!col) {
        // Les en-têtes changent d'une année à l'autre : « forme juridique_beneficiaire » en 2024.
        col = Object.fromEntries(
          v.map((n, i) => [n.trim().replace(/^﻿/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '_'), i]),
        );
        for (const n of ['nom_du_projet', 'montant_engage', 'code_commune']) {
          if (col[n] === undefined) throw new Error(`Fonds vert ${f.annee} : colonne « ${n} » absente`);
        }
        if (col.forme_juridique_beneficiaire === undefined && col.siren === undefined && col.siret_beneficiaire === undefined) {
          throw new Error(`Fonds vert ${f.annee} : ni forme juridique ni SIREN du bénéficiaire`);
        }
        continue;
      }
      // La forme juridique quand elle est publiée ; sinon le SIREN, qui
      // commence par 21 pour une commune (export de 2023).
      const forme = col.forme_juridique_beneficiaire === undefined ? null : (v[col.forme_juridique_beneficiaire] ?? '').trim();
      const siren = (v[col.siren ?? col.siret_beneficiaire] ?? '').trim();
      if (forme !== null ? forme !== 'Commune et commune nouvelle' : !siren.startsWith('21')) continue;
      const brut = communeDe((v[col.code_commune] ?? '').trim().padStart(5, '0'));
      const code = actuelles.has(brut) ? brut : reports.get(brut);
      const intitule = (v[col.nom_du_projet] ?? '').replace(/\s+/g, ' ').trim();
      if (!code || !intitule) continue;
      if (nommeUnePersonne(intitule)) {
        ecartes++;
        continue;
      }
      const l = communes.get(code) ?? [];
      l.push([f.annee, 'Fonds vert', intitule.length > 180 ? `${intitule.slice(0, 177)}…` : intitule, 0, euros(v[col.montant_engage])]);
      communes.set(code, l);
      fondsVert++;
    }
  }
  if (fondsVert < 3000) {
    dire(`Subventions d’investissement : ${fondsVert} projets du Fonds vert seulement, on garde l’ingestion précédente.`);
    return null;
  }
  if (lus < 30000) {
    dire(`Subventions d’investissement : ${lus} projets seulement, on garde l’ingestion précédente.`);
    return null;
  }
  for (const l of communes.values()) l.sort((a, b) => b[0] - a[0] || b[4] - a[4]);
  dire(
    `Subventions d’investissement ${fichiers.map((f) => f.annee).join(', ')} : ${lus.toLocaleString('fr-FR')} projets de communes, ` +
      `${fondsVert.toLocaleString('fr-FR')} du Fonds vert, ` +
      `dans ${communes.size.toLocaleString('fr-FR')} communes` +
      (ecartes ? `, ${ecartes} écartés (intitulé nommant une personne)` : '') +
      '.',
  );
  const exercices = [...new Set([...fichiers, ...exportsFv].map((f) => f.annee))].sort();
  return { maj: new Date().toISOString().slice(0, 10), exercices, communes };
}

export function ecrireInvestissement(sortie: string, i: Investissement): number {
  return ecrireParDepartement(sortie, 'investissement', i.communes, () => ({ maj: i.maj, exercices: i.exercices }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const i = await collecterInvestissement(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (i) console.log(`${ecrireInvestissement(sortie, i)} départements écrits.`);
}
