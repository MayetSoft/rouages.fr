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
const EXERCICES = 3;

/** Exercice, dispositif, intitulé, coût hors taxes, subvention — en euros. */
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
  if (lus < 30000) {
    dire(`Subventions d’investissement : ${lus} projets seulement, on garde l’ingestion précédente.`);
    return null;
  }
  for (const l of communes.values()) l.sort((a, b) => b[0] - a[0] || b[4] - a[4]);
  dire(
    `Subventions d’investissement ${fichiers.map((f) => f.annee).join(', ')} : ${lus.toLocaleString('fr-FR')} projets de communes ` +
      `dans ${communes.size.toLocaleString('fr-FR')} communes` +
      (ecartes ? `, ${ecartes} écartés (intitulé nommant une personne)` : '') +
      '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), exercices: fichiers.map((f) => f.annee).sort(), communes };
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
