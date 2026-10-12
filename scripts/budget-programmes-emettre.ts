/**
 * Le voté et l'exécuté, programme par programme, d'après les projets de loi
 * relatifs aux résultats de la gestion et portant approbation des comptes de
 * l'année (PLRG, ex-lois de règlement), publiés sur data.economie.gouv.fr.
 *
 * Leurs annexes 1 (budget général) et 2 (comptes spéciaux, budgets annexes)
 * donnent, pour chaque programme et chaque titre, le chemin des crédits de
 * paiement d'une année :
 *
 *   loi de finances initiale
 *   + loi de finances rectificative ou de fin de gestion
 *   + reports de l'année précédente
 *   + mouvements réglementaires (virements, transferts, décrets d'avance…)
 *   + fonds de concours et attributions de produits
 *   + fongibilité asymétrique
 *   = crédits ouverts
 *   − annulations et reports sur l'année suivante (± modifications)
 *   = dépenses constatées.
 *
 * La collecte vérifie ces deux égalités ligne par ligne, et recoupe le total :
 * les dépenses du budget général, moins les remboursements et dégrèvements
 * d'impôts d'État (programme 200), doivent égaler les dépenses nettes du
 * budget général que la situation mensuelle de décembre arrête
 * (`budget-etat-execution.json`). Le recoupement est gardé dans le fichier et
 * dit sur la page.
 *
 * Les titres sont additionnés : un programme, une année, un chemin.
 *
 * Lancé seul — `npx tsx scripts/budget-programmes-emettre.ts` —, il réécrit
 * `public/territoires/budget-etat-programmes.json`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BudgetExecution, BudgetProgrammes, CheminCredits, ProgrammeExecution } from '../src/modele/budget-etat.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const PORTAIL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets';
/** Les colonnes des annexes, dans l'ordre du chemin. */
const COLONNES = [
  'LFI',
  'LFR',
  'Report_N-1',
  'Mvts_reglementaires',
  'FDC_et_ADP',
  'Fongibilite_asymetrique',
  'Total_CP_Ouverts',
  'Depenses_constatees',
  'Modif_Ouvertures',
  'Modif_Annulations',
  'Report_N+1',
] as const;

type LireJson = (url: string) => Promise<unknown>;
type LireOctets = (url: string) => Promise<ArrayBuffer>;

const nombre = (s: string | undefined) => {
  const t = (s ?? '').replace(/\s/g, '').replace(',', '.');
  return t && Number.isFinite(Number(t)) ? Number(t) : 0;
};
const propre = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Un CSV d'annexe : UTF-8 (ou Latin-1 pour les plus anciens), point-virgule, virgule décimale. */
function lignesCsv(octets: ArrayBuffer): Record<string, string>[] {
  const b = Buffer.from(octets);
  let texte: string;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, '');
  } catch {
    texte = new TextDecoder('latin1').decode(b);
  }
  const rangs = texte.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(';'));
  const tete = (rangs[0] ?? []).map(propre);
  return rangs.slice(1).map((r) => Object.fromEntries(tete.map((h, i) => [h, r[i] ?? ''])));
}

/** « Action de la France en Europe et dans le monde - 105 » → [nom, 105]. */
function programme(libelle: string): [string, number] | null {
  const m = /^(.*\S)\s*-\s*(\d{3})\s*$/.exec(propre(libelle));
  return m ? [m[1], Number(m[2])] : null;
}

export async function collecterProgrammes(
  lireJson: LireJson,
  lireOctets: LireOctets,
  sortie: string,
  dire: (m: string) => void,
): Promise<BudgetProgrammes> {
  const q = new URLSearchParams({ where: 'search("résultats de la gestion")', limit: '50' });
  const cat = (await lireJson(`${PORTAIL}?${q}`)) as {
    results?: { dataset_id: string; metas: { default: { title: string; modified?: string } } }[];
  };
  const jeux = (cat.results ?? [])
    .map((r) => ({ id: r.dataset_id, titre: r.metas.default.title, version: r.metas.default.modified?.slice(0, 10) ?? null, annee: Number(/\(PLRG\)\s*(\d{4})/.exec(r.metas.default.title)?.[1]) }))
    .filter((j) => j.annee > 2000)
    .sort((a, b) => a.annee - b.annee);
  if (!jeux.length) throw new Error('aucun jeu PLRG trouvé');

  const execution = existsSync(join(sortie, 'budget-etat-execution.json'))
    ? (JSON.parse(readFileSync(join(sortie, 'budget-etat-execution.json'), 'utf8')) as BudgetExecution)
    : null;
  const nettes = execution?.lignes.find((l) => l.ligne === 'Total dépenses nettes du budget général')?.execution ?? {};

  const programmes = new Map<string, ProgrammeExecution>();
  const sources: BudgetProgrammes['sources'] = [];
  const controles: BudgetProgrammes['controles'] = {};
  for (const j of jeux) {
    const pj = (await lireJson(`${PORTAIL}/${j.id}/attachments`)) as { attachments?: { metas: { title: string; url: string } }[] };
    const annexes = (pj.attachments ?? []).map((a) => a.metas).filter((m) => /^Annexe[12]-Etat_CP-/i.test(m.title));
    if (annexes.length < 2) throw new Error(`${j.titre} : annexes des crédits de paiement introuvables`);
    let depensesBg = 0;
    let remboursementsEtat = 0;
    let lignesLues = 0;
    let arrondis = 0;
    for (const a of annexes) {
      const generale = /^Annexe1/i.test(a.title);
      for (const l of lignesCsv(await lireOctets(a.url))) {
        const p = programme(l.Programme);
        if (!p) continue;
        const v = COLONNES.map((c) => nombre(l[c])) as unknown as CheminCredits;
        // Les deux égalités du chemin : rien n'est publié qui ne les tienne, à l'arrondi près.
        // (Le PLRG 2023 arrondit le programme 200 à 0,4 M€ près sur 139,5 Md€.)
        const ouverts = v[0] + v[1] + v[2] + v[3] + v[4] + v[5];
        const depenses = v[6] + v[8] - v[9] - v[10];
        const ecart = Math.max(Math.abs(ouverts - v[6]), Math.abs(depenses - v[7]));
        if (ecart > 1e6) throw new Error(`${j.annee}, ${l.Programme} : le chemin des crédits ne se referme pas`);
        if (ecart > 2) arrondis++;
        // L'annexe 2 de 2023 ne porte pas de colonne « Categorie » : un compte spécial
        // s'identifie par son numéro, et prend la catégorie de l'année qui la donne.
        const cle = `${generale ? 'BG' : 'CS'}|${p[1]}`;
        if (!programmes.has(cle)) {
          programmes.set(cle, { numero: p[1], nom: p[0], mission: propre(l.Mission), categorie: generale ? 'Budget général' : 'Comptes spéciaux', annees: {} });
        }
        const prog = programmes.get(cle)!;
        // Le nom, la mission et la catégorie les plus récents.
        prog.nom = p[0];
        prog.mission = propre(l.Mission);
        if (!generale && propre(l.Categorie)) prog.categorie = propre(l.Categorie);
        const cumul = (prog.annees[j.annee] ??= [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        v.forEach((x, i) => (cumul[i] += x));
        if (generale) {
          depensesBg += v[7];
          if (p[1] === 200) remboursementsEtat += v[7];
        }
        lignesLues++;
      }
    }
    for (const prog of programmes.values()) {
      const c = prog.annees[j.annee];
      if (c) prog.annees[j.annee] = c.map((x) => Math.round(x)) as CheminCredits;
    }
    const smb = nettes[j.annee] ?? null;
    controles[j.annee] = { plrg: Math.round(depensesBg - remboursementsEtat), smb };
    if (smb !== null && Math.abs(depensesBg - remboursementsEtat - smb) > 1e6) {
      throw new Error(`${j.annee} : dépenses nettes du budget général ${Math.round(depensesBg - remboursementsEtat)} ≠ situation de décembre ${smb}`);
    }
    sources.push({ annee: j.annee, jeu: j.id, version: j.version });
    dire(
      `PLRG ${j.annee} : ${lignesLues} lignes${arrondis ? `, dont ${arrondis} refermée${arrondis > 1 ? 's' : ''} à l'arrondi près` : ''}` +
        `${smb !== null ? ', dépenses nettes du budget général recoupées avec la situation de décembre' : ''}.`,
    );
  }

  return {
    maj: new Date().toISOString().slice(0, 10),
    annees: jeux.map((j) => j.annee),
    sources,
    controles,
    programmes: [...programmes.values()].sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.mission.localeCompare(b.mission, 'fr') || a.numero - b.numero),
  };
}

export function ecrireProgrammes(sortie: string, p: BudgetProgrammes): void {
  writeFileSync(join(sortie, 'budget-etat-programmes.json'), JSON.stringify(p));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, obstine, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrireProgrammes(sortie, await collecterProgrammes(lireJson, async (url) => (await obstine(url)).arrayBuffer(), sortie, console.log));
}
