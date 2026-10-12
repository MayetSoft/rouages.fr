/**
 * La performance des programmes du budget de l'État : les objectifs que
 * chaque programme se donne dans son projet annuel de performances, leurs
 * indicateurs, la cible de l'année et ce qui a été réalisé, d'après le
 * dernier jeu « Performance de la dépense (RAP) » de data.economie.gouv.fr —
 * les données des rapports annuels de performances annexés au projet de loi
 * qui arrête les comptes de l'année.
 *
 * Tout est repris **tel que publié** : les valeurs sont des textes (« 180,9 »,
 * « ≥ 95 », « En baisse », « Suivi », « Non déterminé »), et l'atteinte de la
 * cible est celle que le ministère cote — « cible atteinte », « amélioration »,
 * « absence amélioration », « donnée non renseignée », « donnée non retenue ».
 * Rien n'est recalculé : on ne publie pas de taux d'atteinte de notre cru.
 * Le taux national, lui, est repris de la série que le ministère publie depuis
 * 2007 (« Performance : atteinte de la cible générale »).
 *
 * Seuls les indicateurs de programme sont gardés ; ceux de mission en
 * reprennent une partie.
 *
 * Écrit `public/territoires/performance/index.json` (l'année, la série
 * nationale, et par programme le compte des cotations) et un fichier par
 * programme, `performance/<numéro>.json`, que la page charge au choix.
 *
 * Lancé seul — `npx tsx scripts/budget-performance-emettre.ts` —, il réécrit
 * `public/territoires/performance/`.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexPerformance, PerformanceProgramme, SousIndicateur } from '../src/modele/budget-etat.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const PORTAIL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets';
export const JEU_SERIE = 'performance-atteinte-de-la-cible-generale-du-budget-de-l-etat-depuis-2007';

type LireJson = (url: string) => Promise<unknown>;
type Ligne = Record<string, string | number | null>;

const texte = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

export interface Performance {
  index: IndexPerformance;
  programmes: Map<number, PerformanceProgramme>;
}

export async function collecterPerformance(lireJson: LireJson, dire: (m: string) => void): Promise<Performance> {
  const q = new URLSearchParams({ where: 'search("Performance de la dépense")', limit: '50' });
  const cat = (await lireJson(`${PORTAIL}?${q}`)) as { results?: { dataset_id: string; metas: { default: { title: string; modified?: string } } }[] };
  const jeux = (cat.results ?? [])
    .map((r) => ({ id: r.dataset_id, version: r.metas.default.modified?.slice(0, 10) ?? null, annee: Number(/\(RAP\)\s*(\d{4})/.exec(r.metas.default.title)?.[1]) }))
    .filter((j) => j.annee > 2000)
    .sort((a, b) => b.annee - a.annee);
  const jeu = jeux[0];
  if (!jeu) throw new Error('aucun jeu « Performance de la dépense (RAP) » trouvé');
  const n = jeu.annee;
  const lignes = (await lireJson(`${PORTAIL}/${jeu.id}/exports/json`)) as Ligne[];
  if (!Array.isArray(lignes) || !lignes.length) throw new Error(`${jeu.id} : export vide`);

  // Les colonnes changent de nom d'une année à l'autre : on les cherche par motif.
  const cles = Object.keys(lignes[0]);
  const trouver = (...motifs: RegExp[]) => cles.find((k) => motifs.some((m) => m.test(k))) ?? null;
  const col = {
    atteinte: trouver(new RegExp(`^atteinte_de_la_cible_${n}$`)),
    cible: trouver(new RegExp(`^${n}_cible$`)),
    absCible: trouver(new RegExp(`^abs_?${n}_cible$`)),
    cibleSuivante: trouver(new RegExp(`^${n + 1}_cible$`)),
    objectif: trouver(/^code_externe_objectif$/, /^code_objectif$/),
    indicateur: trouver(/^code_externe_indicateur$/, /^code_indicateur$/),
  };
  const exec = (a: number) => trouver(new RegExp(`^exec_${a}$`));
  const absExec = (a: number) => trouver(new RegExp(`^abs_?exec_${a}$`));
  if (!col.atteinte || !col.cible || !exec(n) || !col.objectif || !col.indicateur) {
    throw new Error(`${jeu.id} : colonnes de l'année ${n} introuvables`);
  }
  const annees = [n - 2, n - 1, n].filter((a) => exec(a));
  const valeur = (l: Ligne, k: string | null, abs: string | null) => texte(k ? l[k] : '') || texte(abs ? l[abs] : '');

  // Dans l'ordre du rapport : objectif, indicateur, sous-indicateur (colonnes « ordre_* » quand le jeu les donne).
  const ordre = (l: Ligne, k: string) => (typeof l[k] === 'number' ? (l[k] as number) : Number.MAX_SAFE_INTEGER);
  const ranges = [...lignes].sort(
    (a, b) => ordre(a, 'ordre_obj') - ordre(b, 'ordre_obj') || ordre(a, 'ordre_ind') - ordre(b, 'ordre_ind') || ordre(a, 'ordre_ssi') - ordre(b, 'ordre_ssi'),
  );
  const programmes = new Map<number, PerformanceProgramme>();
  let gardees = 0;
  for (const l of ranges) {
    if (texte(l.type_de_secteur) !== 'Programme') continue;
    const numero = Number(l.code_programme);
    if (!Number.isInteger(numero)) continue;
    const p = programmes.get(numero) ?? { numero, nom: texte(l.programme), objectifs: [] };
    const codeObj = texte(l[col.objectif]);
    let o = p.objectifs.find((x) => x.code === codeObj);
    if (!o) p.objectifs.push((o = { code: codeObj, libelle: texte(l.libelle_objectif), indicateurs: [] }));
    const codeInd = texte(l[col.indicateur]);
    let ind = o.indicateurs.find((x) => x.code === codeInd);
    if (!ind) o.indicateurs.push((ind = { code: codeInd, libelle: texte(l.libelle_indicateur), sous: [] }));
    const s: SousIndicateur = {
      libelle: texte(l.libelle_sous_indicateur) || ind.libelle,
      unite: texte(l.unite),
      contexte: texte(l.contexte) === 'Oui',
      realise: annees.map((a) => valeur(l, exec(a), absExec(a))),
      cible: valeur(l, col.cible, col.absCible),
      atteinte: texte(l[col.atteinte]),
      cibleSuivante: valeur(l, col.cibleSuivante, null),
    };
    ind.sous.push(s);
    programmes.set(numero, p);
    gardees++;
  }

  // La série nationale, telle que le ministère la publie.
  const serie = ((await lireJson(`${PORTAIL}/${JEU_SERIE}/records?limit=100&order_by=rap`)) as { results?: Record<string, number>[] }).results ?? [];

  const cotations = ['cible atteinte', 'amélioration', 'absence amélioration', 'donnée non renseignée', 'donnée non retenue'];
  const index: IndexPerformance = {
    maj: new Date().toISOString().slice(0, 10),
    rap: n,
    annees,
    jeu: jeu.id,
    version: jeu.version,
    cotations,
    serie: serie
      .filter((r) => Number.isInteger(r.rap))
      .map((r) => ({ rap: r.rap, atteinte: r.cible_atteinte, amelioration: r.amelioration, absence: r.absence_amelioration, nonRenseigne: r.donnees_non_renseignees })),
    programmes: Object.fromEntries(
      [...programmes.values()].map((p) => {
        const toutes = p.objectifs.flatMap((o) => o.indicateurs.flatMap((i) => i.sous));
        return [p.numero, { sous: toutes.length, cotes: cotations.map((c) => toutes.filter((s) => s.atteinte === c).length) }];
      }),
    ),
  };
  dire(`Performance (RAP ${n}) : ${programmes.size} programmes, ${gardees} sous-indicateurs ; série nationale de ${index.serie[0]?.rap} à ${index.serie.at(-1)?.rap}.`);
  return { index, programmes };
}

export function ecrirePerformance(sortie: string, p: Performance): void {
  const dossier = join(sortie, 'performance');
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, 'index.json'), JSON.stringify(p.index));
  for (const [numero, prog] of p.programmes) writeFileSync(join(dossier, `${numero}.json`), JSON.stringify(prog));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrirePerformance(sortie, await collecterPerformance(lireJson, console.log));
}
