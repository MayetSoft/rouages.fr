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
 * **Avant 2023**, les projets de loi de règlement (PLR) ne publient pas ces
 * annexes en données ouvertes. Ceux de 2019 et 2020 joignent une synthèse des
 * rapports annuels de performances (`RAP_synthese_*.xls`) qui donne, par
 * programme, la prévision de la loi de finances initiale et la consommation :
 * le voté et le dépensé, sans les étapes entre les deux (null dans le
 * fichier). Les budgets annexes, que les annexes des PLRG ne portent pas, sont
 * laissés de côté pour garder le même périmètre. Ni 2021 ni 2022 ne sont
 * publiés à ce niveau ; avant 2019, les PLR publiés donnent l'exécution sans
 * le voté à côté.
 *
 * Le recoupement vaut pour toutes les années, voté compris quand la situation
 * mensuelle le donne. Elle a changé de définition : jusqu'en 2020, ses
 * dépenses nettes retirent aussi les remboursements et dégrèvements d'impôts
 * locaux (programme 201), plus seulement ceux d'impôts d'État. La collecte
 * essaie les deux et garde, pour chaque année, celle qui tombe juste.
 *
 * Lancé seul — `npx tsx scripts/budget-programmes-emettre.ts` —, il réécrit
 * `public/territoires/budget-etat-programmes.json`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BudgetExecution, BudgetProgrammes, CheminCredits, ProgrammeExecution } from '../src/modele/budget-etat.ts';
import XLSX from 'xlsx';
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

/** Un programme, une année, d'après une source. */
type Ligne = { nom: string; mission: string; categorie: string | null; chemin: CheminCredits };
type Annee = { annee: number; jeu: string; version: string | null; nature: 'PLRG' | 'RAP'; lignes: Map<string, Ligne> };

const VIDE = (): CheminCredits => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

/** Les annexes 1 et 2 d'un PLRG : le chemin complet, vérifié ligne par ligne. */
async function lirePlrg(lireOctets: LireOctets, annexes: { title: string; url: string }[], annee: number, dire: (m: string) => void) {
  const lignes = new Map<string, Ligne>();
  let lues = 0;
  let arrondis = 0;
  for (const a of annexes) {
    const generale = /^Annexe1/i.test(a.title);
    for (const l of lignesCsv(await lireOctets(a.url))) {
      const p = programme(l.Programme);
      if (!p) continue;
      const v = COLONNES.map((c) => nombre(l[c]));
      // Les deux égalités du chemin : rien n'est publié qui ne les tienne, à l'arrondi près.
      // (Le PLRG 2023 arrondit le programme 200 à 0,4 M€ près sur 139,5 Md€.)
      const ouverts = v[0] + v[1] + v[2] + v[3] + v[4] + v[5];
      const depenses = v[6] + v[8] - v[9] - v[10];
      const ecart = Math.max(Math.abs(ouverts - v[6]), Math.abs(depenses - v[7]));
      if (ecart > 1e6) throw new Error(`${annee}, ${l.Programme} : le chemin des crédits ne se referme pas`);
      if (ecart > 2) arrondis++;
      // L'annexe 2 de 2023 ne porte pas de colonne « Categorie » : un compte spécial
      // s'identifie par son numéro, et prend la catégorie de l'année qui la donne.
      const cle = `${generale ? 'BG' : 'CS'}|${p[1]}`;
      const ligne = lignes.get(cle) ?? { nom: p[0], mission: propre(l.Mission), categorie: generale ? 'Budget général' : propre(l.Categorie) || null, chemin: VIDE() };
      v.forEach((x, i) => ((ligne.chemin[i] as number) += x));
      lignes.set(cle, ligne);
      lues++;
    }
  }
  for (const l of lignes.values()) l.chemin = l.chemin.map((x) => Math.round(x as number)) as CheminCredits;
  dire(`PLRG ${annee} : ${lues} lignes${arrondis ? `, dont ${arrondis} refermée${arrondis > 1 ? 's' : ''} à l'arrondi près` : ''}`);
  return lignes;
}

/** La synthèse des RAP d'un PLR : le voté (prévision en LFI) et le dépensé (consommation), crédits de paiement. */
const BUDGETS_RAP: Record<string, [string, string] | undefined> = {
  BG: ['BG', 'Budget général'],
  CAS: ['CS', 'Comptes d’affectation spéciale'],
  CCF: ['CS', 'Comptes de concours financiers'],
};
function lireRap(octets: ArrayBuffer, annee: number, dire: (m: string) => void) {
  const classeur = XLSX.read(Buffer.from(octets));
  const nom = classeur.SheetNames.find((n) => /cr[ée]dits/i.test(n));
  if (!nom) throw new Error(`RAP ${annee} : feuille des crédits introuvable`);
  const rangs = XLSX.utils.sheet_to_json<(string | number | null)[]>(classeur.Sheets[nom], { header: 1, blankrows: false, defval: null });
  const groupes = (rangs[0] ?? []).map((x) => propre(String(x ?? '')));
  const tetes = (rangs[1] ?? []).map((x) => propre(String(x ?? '')));
  const prevision = groupes.findIndex((g) => /^Prévision/i.test(g));
  const consommation = groupes.findIndex((g, i) => i > prevision && /^Consommation/i.test(g));
  const colonne = (de: number, a: number) => tetes.findIndex((t, i) => i >= de && i < a && t === `CP ${annee}`);
  const vote = colonne(prevision, consommation);
  const depense = colonne(consommation, tetes.length);
  if (prevision < 0 || consommation < 0 || vote < 0 || depense < 0) throw new Error(`RAP ${annee} : colonnes du voté et du dépensé introuvables`);
  const lignes = new Map<string, Ligne>();
  let mission = '';
  for (const r of rangs.slice(2)) {
    const nature = propre(String(r[0] ?? ''));
    if (nature === 'Mission') mission = propre(String(r[3] ?? ''));
    if (nature !== 'Programme') continue;
    const budget = BUDGETS_RAP[propre(String(r[1] ?? ''))];
    const numero = Number(r[2]);
    if (!budget || !Number.isInteger(numero)) continue;
    const chemin: CheminCredits = [Math.round(Number(r[vote] ?? 0)), null, null, null, null, null, null, Math.round(Number(r[depense] ?? 0)), null, null, null];
    lignes.set(`${budget[0]}|${numero}`, { nom: propre(String(r[3] ?? '')), mission, categorie: budget[1], chemin });
  }
  dire(`RAP ${annee} : ${lignes.size} programmes, voté et dépensé`);
  return lignes;
}

export async function collecterProgrammes(
  lireJson: LireJson,
  lireOctets: LireOctets,
  sortie: string,
  dire: (m: string) => void,
): Promise<BudgetProgrammes> {
  type Jeu = { dataset_id: string; metas: { default: { title: string; modified?: string } } };
  const chercher = async (texte: string) => {
    const q = new URLSearchParams({ where: `search("${texte}")`, limit: '100' });
    return ((await lireJson(`${PORTAIL}?${q}`)) as { results?: Jeu[] }).results ?? [];
  };
  const pieces = async (id: string) =>
    ((await lireJson(`${PORTAIL}/${id}/attachments`)) as { attachments?: { metas: { title: string; url: string } }[] }).attachments?.map((a) => a.metas) ?? [];

  const annees: Annee[] = [];
  for (const r of await chercher('résultats de la gestion')) {
    const m = r.metas.default;
    const annee = Number(/\(PLRG\)\s*(\d{4})/.exec(m.title)?.[1]);
    if (!(annee > 2000)) continue;
    const annexes = (await pieces(r.dataset_id)).filter((p) => /^Annexe[12]-Etat_CP-/i.test(p.title));
    if (annexes.length < 2) throw new Error(`${m.title} : annexes des crédits de paiement introuvables`);
    annees.push({ annee, jeu: r.dataset_id, version: m.modified?.slice(0, 10) ?? null, nature: 'PLRG', lignes: await lirePlrg(lireOctets, annexes, annee, dire) });
  }
  if (!annees.length) throw new Error('aucun jeu PLRG trouvé');
  for (const r of await chercher('loi de règlement')) {
    const m = r.metas.default;
    const annee = Number(/Projet de loi de règlement (\d{4})/i.exec(m.title)?.[1]);
    if (!(annee > 2000) || annees.some((a) => a.annee === annee)) continue;
    // Seuls les PLR qui joignent la synthèse des RAP donnent le voté à côté du dépensé.
    const synthese = (await pieces(r.dataset_id)).find((p) => /synth/i.test(p.title) && /\.xlsx?$/i.test(p.title));
    if (!synthese) continue;
    annees.push({ annee, jeu: r.dataset_id, version: m.modified?.slice(0, 10) ?? null, nature: 'RAP', lignes: lireRap(await lireOctets(synthese.url), annee, dire) });
  }
  annees.sort((a, b) => a.annee - b.annee);

  const execution = existsSync(join(sortie, 'budget-etat-execution.json'))
    ? (JSON.parse(readFileSync(join(sortie, 'budget-etat-execution.json'), 'utf8')) as BudgetExecution)
    : null;
  const nettes = execution?.lignes.find((l) => l.ligne === 'Total dépenses nettes du budget général');

  const programmes = new Map<string, ProgrammeExecution>();
  const controles: BudgetProgrammes['controles'] = {};
  for (const a of annees) {
    for (const [cle, l] of a.lignes) {
      const p = programmes.get(cle) ?? { numero: Number(cle.split('|')[1]), nom: l.nom, mission: l.mission, categorie: l.categorie ?? 'Comptes spéciaux', annees: {} };
      // Le nom et la mission les plus récents ; la catégorie, de la dernière année qui la donne.
      p.nom = l.nom;
      p.mission = l.mission;
      if (l.categorie) p.categorie = l.categorie;
      p.annees[a.annee] = l.chemin;
      programmes.set(cle, p);
    }
    // Le recoupement avec la situation de décembre, sur le dépensé et, quand elle le donne, sur le voté.
    const total = (i: number, deduits: number[]) =>
      [...a.lignes].filter(([cle]) => cle.startsWith('BG|') && !deduits.includes(Number(cle.split('|')[1]))).reduce((s, [, l]) => s + (l.chemin[i] ?? 0), 0);
    const smb = nettes?.execution[a.annee] ?? null;
    const smbVote = nettes?.lfi[a.annee] ?? null;
    const tombe = (deduits: number[]) =>
      (smb === null || Math.abs(total(7, deduits) - smb) <= 1e6) && (smbVote === null || Math.abs(total(0, deduits) - smbVote) <= 1e6);
    const deduits = [[200], [200, 201]].find(tombe);
    if (!deduits) throw new Error(`${a.annee} : dépenses nettes du budget général ${Math.round(total(7, [200]))} ≠ situation de décembre ${smb}`);
    controles[a.annee] = { plrg: Math.round(total(7, deduits)), smb, deduits };
    if (smb !== null) dire(`${a.annee} : recoupé avec la situation de décembre, hors programme${deduits.length > 1 ? 's' : ''} ${deduits.join(' et ')}${smbVote !== null ? ', voté compris' : ''}.`);
  }

  return {
    maj: new Date().toISOString().slice(0, 10),
    annees: annees.map((a) => a.annee),
    sources: annees.map((a) => ({ annee: a.annee, jeu: a.jeu, version: a.version, nature: a.nature })),
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
