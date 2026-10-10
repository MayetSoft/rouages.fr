/**
 * Le budget de l'État, mission par mission, d'après le jeu « PLF 2026 —
 * Budget vert » de la direction du Budget (data.economie.gouv.fr).
 *
 * Le jeu sert au rapport sur l'impact environnemental du budget, mais il porte
 * les montants de toute la dépense de l'État sur le « périmètre des dépenses
 * de l'État » — 501 Md€ pour 2026 d'après sa description —, jusqu'à l'action,
 * pour trois exercices :
 *
 * - **l'exécution 2024**, ce qui a été dépensé ;
 * - **la loi de finances initiale 2025**, ce que le Parlement a voté ;
 * - **le projet de loi de finances 2026**, ce que le Gouvernement proposait à
 *   l'automne 2025, avant le vote.
 *
 * Trois natures de chiffres, que la page ne mélange pas. Les deux premiers
 * sont retraités au format du projet 2026 (périmètre, transferts, fonds de
 * concours) : ils sont comparables entre eux, et diffèrent pour cela des
 * comptes publiés l'année de l'exécution ou du vote.
 *
 * Trois types de dépense, gardés à part :
 *
 * - **les crédits budgétaires**, par mission, programme et action — avec les
 *   prélèvements sur recettes au profit des collectivités et de l'Union
 *   européenne, que le jeu range comme des missions ;
 * - **les taxes affectées plafonnées**, par organisme bénéficiaire ;
 * - **les dépenses fiscales** — exonérations, réductions et crédits d'impôt —,
 *   par impôt : une recette à laquelle l'État renonce, estimée, qui ne
 *   s'additionne pas aux crédits.
 *
 * Le jeu ne dit pas quel ministère gère un programme. On le prend aux
 * balances des comptes de l'État (même portail), pour le dernier exercice
 * publié : un programme y porte le libellé de son ministère.
 *
 * Lancé seul — `npx tsx scripts/budget-etat-emettre.ts` —, il réécrit
 * `public/territoires/budget-etat.json`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AffectataireBudget, ActionBudget, BudgetEtat, DepenseFiscale, ImpotBudget, MissionBudget, Montants, ProgrammeBudget, TaxeAffectee } from '../src/modele/budget-etat.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const PORTAIL = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets';
export const JEU_BUDGET = 'plf-2026-budget-vert';
const JEU_BALANCES = 'balances_des_comptes_etat';

const COLONNES = [
  'execution_2024_cp',
  'lfi_2025_cp_ou_prevision_2025_si_depense_fiscale',
  'plf_2026_cp_ou_prevision_2026_si_depense_fiscale',
] as const;

interface Ligne {
  type_depense: string;
  mission: string | null;
  numero_programme: number | null;
  programme: string | null;
  code_action_si_credit_budgetaire: string | null;
  action_si_credit_budgetaire: string | null;
  affectataire_si_taxe_affectee: string | null;
  impot_si_depense_fiscale: string | null;
  code_depense: string | null;
  libelle: string | null;
  depenses_fiscales_e_montant_inferieur_a_0_5_meur_nc_montant_non_calcule_en_prevision_2026: string | null;
  [colonne: string]: unknown;
}

const vide = (): Montants => [null, null, null];
function ajouter(a: Montants, b: Montants) {
  for (let i = 0; i < 3; i++) if (b[i] !== null) a[i] = (a[i] ?? 0) + b[i]!;
}
const arrondir = (v: Montants): Montants => v.map((x) => (x === null ? null : Math.round(x))) as Montants;
const montants = (l: Ligne): Montants =>
  COLONNES.map((c) => (typeof l[c] === 'number' && Number.isFinite(l[c]) ? (l[c] as number) : null)) as Montants;
/** Du plus gros au plus petit, sur le projet 2026, puis sur l'exécution 2024. */
const parTaille = (a: { v: Montants }, b: { v: Montants }) =>
  (b.v[2] ?? 0) - (a.v[2] ?? 0) || (b.v[0] ?? 0) - (a.v[0] ?? 0);
const propre = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Les noms que le jeu abrège, rendus en clair. */
const MISSIONS_EN_CLAIR: Record<string, { nom: string; psr: MissionBudget['psr'] }> = {
  PSRCT: { nom: 'Prélèvements sur recettes au profit des collectivités territoriales', psr: 'collectivites' },
  PSRUE: { nom: 'Prélèvement sur recettes au profit de l’Union européenne', psr: 'ue' },
};
const ACTION_SANS_CODE = /^MP\/MT - Mesure de périmètre\/transfert - (PLF \d{4})$/;

export function lireBudget(lignes: Ligne[]): Omit<BudgetEtat, 'maj' | 'version' | 'anneeMinisteres'> {
  const missions = new Map<string, MissionBudget>();
  const programmes = new Map<string, ProgrammeBudget>();
  const poidsDuNom = new Map<ProgrammeBudget, number>();
  const actions = new Map<string, ActionBudget>();
  const retraitements = new Map<string, Montants>();
  const affectataires = new Map<string, AffectataireBudget>();
  const taxes = new Map<string, TaxeAffectee>();
  const impots = new Map<string, ImpotBudget>();
  const mesures = new Map<string, DepenseFiscale>();

  for (const l of lignes) {
    const v = montants(l);
    const mission = propre(l.mission);
    if (l.type_depense === 'Crédits budgétaires') {
      // Le jeu retranche du total une contribution qu'il compte déjà ailleurs.
      if (mission === 'T3_CAS') {
        const nom = propre(l.libelle) || mission;
        if (!retraitements.has(nom)) retraitements.set(nom, vide());
        ajouter(retraitements.get(nom)!, v);
        continue;
      }
      const clair = MISSIONS_EN_CLAIR[mission];
      if (!missions.has(mission))
        missions.set(mission, { nom: clair?.nom ?? mission, psr: clair?.psr ?? null, v: vide(), programmes: [] });
      const m = missions.get(mission)!;
      ajouter(m.v, v);
      if (clair || l.numero_programme === null) continue;
      const cleP = `${mission}|${l.numero_programme}`;
      if (!programmes.has(cleP)) {
        const p: ProgrammeBudget = { numero: l.numero_programme, nom: '', ministere: null, v: vide(), actions: [] };
        programmes.set(cleP, p);
        m.programmes.push(p);
      }
      const p = programmes.get(cleP)!;
      ajouter(p.v, v);
      // Un programme renommé d'un exercice à l'autre garde le nom de sa plus grosse ligne récente.
      const poids = Math.abs(v[2] ?? 0) + Math.abs(v[1] ?? 0) / 1e3;
      if (propre(l.programme) && poids > (poidsDuNom.get(p) ?? -Infinity)) {
        p.nom = propre(l.programme);
        poidsDuNom.set(p, poids);
      }
      const code = propre(l.code_action_si_credit_budgetaire) || null;
      const sansCode = ACTION_SANS_CODE.exec(propre(l.libelle));
      const nomAction = code
        ? propre(l.action_si_credit_budgetaire) || code
        : sansCode
          ? `Mesures de périmètre et de transfert du ${sansCode[1]}`
          : propre(l.libelle) || 'Sans action';
      const cleA = `${cleP}|${code ?? nomAction}`;
      if (!actions.has(cleA)) {
        const a = { code, nom: nomAction, v: vide() };
        actions.set(cleA, a);
        p.actions.push(a);
      }
      ajouter(actions.get(cleA)!.v, v);
    } else if (l.type_depense.startsWith('Taxes affectées')) {
      const nom = propre(l.affectataire_si_taxe_affectee) || 'Non précisé';
      if (!affectataires.has(nom)) affectataires.set(nom, { nom, mission, v: vide(), taxes: [] });
      const a = affectataires.get(nom)!;
      ajouter(a.v, v);
      // Le libellé répète l'affectataire : « Taxe … - affectée à l'ANSES ».
      const libelle = propre(l.libelle).replace(/\s+-\s+affecté(e|es|s)? (à|au|aux)\s.*$/i, '') || propre(l.code_depense);
      const cleT = `${nom}|${libelle}`;
      if (!taxes.has(cleT)) {
        const t = { libelle, v: vide() };
        taxes.set(cleT, t);
        a.taxes.push(t);
      }
      ajouter(taxes.get(cleT)!.v, v);
    } else if (l.type_depense === 'Dépenses fiscales') {
      const impot = propre(l.impot_si_depense_fiscale) || 'Non précisé';
      if (!impots.has(impot)) impots.set(impot, { impot, v: vide(), mesures: [] });
      const i = impots.get(impot)!;
      ajouter(i.v, v);
      // Une mesure cotée en partie favorable, en partie neutre, est coupée en
      // plusieurs lignes dont les montants sont déjà répartis : on les recoud.
      const code = propre(l.code_depense) || propre(l.libelle);
      const cleM = `${impot}|${code}`;
      if (!mesures.has(cleM)) {
        const d = {
          code,
          libelle: propre(l.libelle),
          mission,
          v: vide(),
          note: propre(l.depenses_fiscales_e_montant_inferieur_a_0_5_meur_nc_montant_non_calcule_en_prevision_2026) || null,
        };
        mesures.set(cleM, d);
        i.mesures.push(d);
      }
      ajouter(mesures.get(cleM)!.v, v);
    }
  }

  const credits = [...missions.values()]
    .filter((m) => m.v.some((x) => x !== null && Math.abs(x) >= 0.5))
    .map((m) => ({
      ...m,
      v: arrondir(m.v),
      programmes: m.programmes
        .filter((p) => p.v.some((x) => x !== null && Math.abs(x) >= 0.5))
        .map((p) => ({
          ...p,
          nom: p.nom || `Programme ${p.numero}`,
          v: arrondir(p.v),
          actions: p.actions.filter((a) => a.v.some((x) => x !== null && Math.abs(x) >= 0.5)).map((a) => ({ ...a, v: arrondir(a.v) })).sort(parTaille),
        }))
        .sort(parTaille),
    }))
    .sort(parTaille);
  return {
    credits,
    retraitements: [...retraitements].map(([nom, v]) => ({ nom, v: arrondir(v) })),
    taxes: [...affectataires.values()]
      .map((a) => ({ ...a, v: arrondir(a.v), taxes: a.taxes.map((t) => ({ ...t, v: arrondir(t.v) })).sort(parTaille) }))
      .sort(parTaille),
    fiscales: [...impots.values()]
      .map((i) => ({ ...i, v: arrondir(i.v), mesures: i.mesures.map((d) => ({ ...d, v: arrondir(d.v) })).sort(parTaille) }))
      .sort(parTaille),
  };
}

type LireJson = (url: string) => Promise<unknown>;

/** Le ministère de chaque programme, d'après le dernier exercice des balances des comptes de l'État. */
async function lireMinisteres(lireJson: LireJson): Promise<{ annee: number; parProgramme: Map<number, string> }> {
  const dernier = (await lireJson(
    `${PORTAIL}/${JEU_BALANCES}/records?select=max(annee)%20as%20a&limit=1`,
  )) as { results?: { a?: string }[] };
  const annee = Number(String(dernier.results?.[0]?.a ?? '').slice(0, 4));
  if (!annee) throw new Error('balances des comptes : exercice introuvable');
  const q = new URLSearchParams({
    select: 'programme,libelle_ministere',
    group_by: 'programme,libelle_ministere',
    where: `year(annee)=${annee} and libelle_ministere is not null and programme is not null`,
    limit: '-1',
  });
  const r = (await lireJson(`${PORTAIL}/${JEU_BALANCES}/records?${q}`)) as {
    results?: { programme?: string; libelle_ministere?: string }[];
  };
  const vus = new Map<number, Set<string>>();
  for (const x of r.results ?? []) {
    const n = Number(x.programme);
    const nom = propre(x.libelle_ministere);
    if (!Number.isInteger(n) || !nom) continue;
    if (!vus.has(n)) vus.set(n, new Set());
    vus.get(n)!.add(nom);
  }
  // Un programme rattaché à deux ministères n'en reçoit aucun plutôt qu'un deviné.
  const parProgramme = new Map<number, string>();
  for (const [n, noms] of vus) if (noms.size === 1) parProgramme.set(n, [...noms][0]!);
  return { annee, parProgramme };
}

export async function collecterBudgetEtat(lireJson: LireJson, dire: (m: string) => void): Promise<BudgetEtat> {
  const fiche = (await lireJson(`${PORTAIL}/${JEU_BUDGET}`)) as { metas?: { default?: { modified?: string } } };
  const lignes = (await lireJson(`${PORTAIL}/${JEU_BUDGET}/exports/json`)) as Ligne[];
  if (!Array.isArray(lignes) || lignes.length < 1000) throw new Error(`${JEU_BUDGET} : ${Array.isArray(lignes) ? lignes.length : 0} lignes`);
  const budget = lireBudget(lignes);

  let anneeMinisteres: number | null = null;
  try {
    const { annee, parProgramme } = await lireMinisteres(lireJson);
    anneeMinisteres = annee;
    for (const m of budget.credits) for (const p of m.programmes) p.ministere = parProgramme.get(p.numero) ?? null;
  } catch (e) {
    dire(`Budget de l'État : ministères non rattachés (${(e as Error).message}).`);
  }

  const total = (i: number) => budget.credits.reduce((s, m) => s + (m.v[i] ?? 0), 0) + budget.retraitements.reduce((s, r) => s + (r.v[i] ?? 0), 0);
  const md = (v: number) => `${(v / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Md€`;
  dire(
    `Budget de l'État : ${budget.credits.length} missions, ` +
      `${budget.credits.reduce((s, m) => s + m.programmes.length, 0)} programmes, ` +
      `crédits ${md(total(0))} (exécution 2024), ${md(total(1))} (LFI 2025), ${md(total(2))} (PLF 2026) ; ` +
      `${budget.taxes.length} organismes bénéficiaires de taxes affectées, ` +
      `${budget.fiscales.reduce((s, i) => s + i.mesures.length, 0)} dépenses fiscales.`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    version: fiche.metas?.default?.modified?.slice(0, 10) ?? null,
    anneeMinisteres,
    ...budget,
  };
}

export function ecrireBudgetEtat(sortie: string, b: BudgetEtat): void {
  writeFileSync(join(sortie, 'budget-etat.json'), JSON.stringify(b));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrireBudgetEtat(sortie, await collecterBudgetEtat(lireJson, console.log));
}
