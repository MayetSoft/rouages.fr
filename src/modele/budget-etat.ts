/**
 * Le budget de l'État tel que `scripts/budget-etat-emettre.ts` l'écrit dans
 * `public/territoires/budget-etat.json`, lu une fois au build par la page
 * « L'argent public ».
 */
import { national } from './fiche-commune.ts';

/** Trois montants en euros — exécution 2024, LFI 2025, PLF 2026 —, null quand le jeu n'en donne pas. */
export type Montants = [number | null, number | null, number | null];

export interface ActionBudget {
  code: string | null;
  nom: string;
  v: Montants;
}
export interface ProgrammeBudget {
  numero: number;
  nom: string;
  /** Le ministère d'après les balances des comptes, quand il y est nommé. */
  ministere: string | null;
  v: Montants;
  actions: ActionBudget[];
}
export interface MissionBudget {
  nom: string;
  /** Un prélèvement sur recettes, pas une mission : le jeu le range comme tel. */
  psr: 'collectivites' | 'ue' | null;
  v: Montants;
  programmes: ProgrammeBudget[];
}
export interface TaxeAffectee {
  libelle: string;
  v: Montants;
}
export interface AffectataireBudget {
  nom: string;
  mission: string;
  v: Montants;
  taxes: TaxeAffectee[];
}
export interface DepenseFiscale {
  code: string;
  libelle: string;
  mission: string;
  v: Montants;
  /** « ε » : moins de 0,5 M€ ; « nc » : non chiffrée pour 2026. */
  note: string | null;
}
export interface ImpotBudget {
  impot: string;
  v: Montants;
  mesures: DepenseFiscale[];
}
export interface BudgetEtat {
  maj: string;
  /** La date de mise à jour du jeu, telle que le portail la publie. */
  version: string | null;
  /** L'exercice des balances d'où vient le ministère de chaque programme. */
  anneeMinisteres: number | null;
  credits: MissionBudget[];
  /** Les lignes négatives que le jeu retranche du total, telles qu'il les nomme. */
  retraitements: { nom: string; v: Montants }[];
  taxes: AffectataireBudget[];
  fiscales: ImpotBudget[];
}


// Le signe moins typographique, pas le trait d'union que donne toLocaleString.
const nombre = (v: number, chiffres: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: chiffres }).replace('-', '−');
/** Un montant du budget, en milliards ou en millions selon sa taille ; un tiret quand le fichier n'en donne pas. */
export function montantBudget(v: number | null): string {
  if (v === null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `${nombre(v / 1e9, a < 1e10 ? 2 : 1)} Md€`;
  if (a >= 1e5) return `${nombre(v / 1e6, a < 1e7 ? 1 : 0)} M€`;
  return `${nombre(v, 0)} €`;
}

/** Le fichier, ou null s'il n'a pas encore été produit. */
export const budgetEtat = national<BudgetEtat>('budget-etat.json');

/**
 * Les lignes du budget qui financent un acteur du réseau, quand leur libellé
 * le nomme : rien n'est rapproché sur une intuition. La clé est le numéro du
 * programme, ou `psr-…` pour un prélèvement sur recettes.
 */
export const DANS_LE_RESEAU: Record<string, string[]> = {
  'psr-collectivites': ['commune', 'epci', 'departement', 'region'],
  'psr-ue': ['union-europeenne'],
  '119': ['commune', 'epci', 'departement', 'region'],
  '152': ['gendarmerie'],
  '165': ['conseil-etat', 'cour-administrative-appel', 'tribunal-administratif'],
  '176': ['police-nationale'],
  '501': ['president-republique'],
  '511': ['assemblee-nationale'],
  '521': ['senat'],
  '531': ['conseil-constitutionnel'],
};

/** Ce que le budget de l'État consacre à un acteur du réseau : de quoi renvoyer vers la page. */
export function lignesDuBudget(acteur: string): { ancre: string; libelle: string; v: Montants }[] {
  const b = budgetEtat();
  if (!b) return [];
  const cles = Object.entries(DANS_LE_RESEAU)
    .filter(([, ids]) => ids.includes(acteur))
    .map(([cle]) => cle);
  const lignes: { ancre: string; libelle: string; v: Montants }[] = [];
  for (const cle of cles) {
    if (cle.startsWith('psr-')) {
      const m = b.credits.find((x) => `psr-${x.psr}` === cle);
      if (m) lignes.push({ ancre: cle, libelle: m.nom, v: m.v });
      continue;
    }
    for (const m of b.credits) {
      const p = m.programmes.find((x) => String(x.numero) === cle);
      if (p) {
        lignes.push({ ancre: `programme-${p.numero}`, libelle: `${p.nom}, programme ${p.numero} de la mission « ${m.nom} »`, v: p.v });
        break;
      }
    }
  }
  return lignes;
}
