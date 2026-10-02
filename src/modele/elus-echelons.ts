/**
 * Les élus des départements, des régions et du Parlement, pour la page d'une
 * collectivité. Voir `scripts/elus-echelons-emettre.ts`.
 */
import { parDepartement } from './fiche-commune.ts';

type DeclarationBrute = [string, [string, string, string, string][], [string, string, [string, string, string, string, string, string?][]]?];
type EluBrut = [string, string, string, string, string, DeclarationBrute?];
type Fichier = { maj: string; cd: EluBrut[]; cr: EluBrut[]; sen: EluBrut[]; dep: EluBrut[] };
const fichiers = parDepartement<Fichier>('elus-echelons');

export interface DeclarationElu {
  page: string;
  liste: { type: string; qualite: string; statut: string; date: string }[];
  contenu: {
    depot: string;
    qualite: string;
    lignes: { rubrique: string; intitule: string; precision: string; periode: string; montant: string; commentaire: string }[];
  } | null;
}

export interface EluEchelon {
  groupe: string;
  libelle: string;
  nom: string;
  naissance: string;
  fonction: string;
  declaration: DeclarationElu | null;
}

export interface ElusCollectivite {
  /** Le président et les vice-présidents, dans l'ordre. */
  executif: EluEchelon[];
  /** Les autres membres de l'assemblée, par canton ou par section départementale. */
  groupes: { code: string; libelle: string; elus: EluEchelon[] }[];
  /** Le nom de l'assemblée : conseil départemental ou régional. */
  assemblee: string;
  senateurs: EluEchelon[];
  deputes: EluEchelon[];
  maj: string;
}

const lire = (e: EluBrut): EluEchelon => ({
  groupe: e[0],
  libelle: e[1],
  nom: e[2],
  naissance: e[3],
  fonction: e[4],
  declaration: e[5]
    ? {
        page: e[5][0],
        liste: e[5][1].map(([type, qualite, statut, date]) => ({ type, qualite, statut, date })),
        contenu: e[5][2]
          ? {
              depot: e[5][2][0],
              qualite: e[5][2][1],
              lignes: e[5][2][2].map(([rubrique, intitule, precision, periode, montant, commentaire]) => ({
                rubrique,
                intitule,
                precision,
                periode,
                montant,
                commentaire: commentaire ?? '',
              })),
            }
          : null,
      }
    : null,
});

/** « Président », puis « 1er Vice-président », « 2ème Vice-président »… */
function rang(fonction: string): number {
  if (/^pr[ée]sident/i.test(fonction)) return 0;
  const m = /^(\d+)/.exec(fonction);
  return m ? Number(m[1]) : 999;
}

/** Les élus d'un département ou d'une région, d'après les fichiers de ses départements. */
export function elusDeCollectivite(echelon: 'departement' | 'region', deps: string[]): ElusCollectivite | null {
  const lus = deps.map((d) => [d, fichiers.get(d)] as const).filter((x): x is readonly [string, Fichier] => !!x[1]);
  if (lus.length === 0) return null;
  // Un conseiller régional est rangé par section départementale : le département de son fichier.
  const membres = lus.flatMap(([d, f]) =>
    (echelon === 'departement' ? f.cd : f.cr).map((e) => ({ ...lire(e), ...(echelon === 'region' ? { groupe: d, libelle: d } : {}) })),
  );
  const executif = membres.filter((e) => e.fonction).sort((a, b) => rang(a.fonction) - rang(b.fonction));
  const groupes = new Map<string, { code: string; libelle: string; elus: EluEchelon[] }>();
  for (const e of membres.filter((x) => !x.fonction)) {
    const g = groupes.get(e.groupe) ?? { code: e.groupe, libelle: e.libelle, elus: [] };
    g.elus.push(e);
    groupes.set(e.groupe, g);
  }
  return {
    executif,
    groupes: [...groupes.values()].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true })),
    assemblee: echelon === 'departement' ? 'conseil départemental' : 'conseil régional',
    senateurs: echelon === 'departement' ? lus.flatMap(([, f]) => f.sen).map(lire) : [],
    deputes: echelon === 'departement' ? lus.flatMap(([, f]) => f.dep).map(lire) : [],
    maj: lus[0][1].maj,
  };
}
