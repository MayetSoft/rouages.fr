/**
 * Le rapprochement par le nom : un titulaire de marché qui porte le même nom
 * qu'une société ou un organisme figurant dans la déclaration d'intérêts d'un
 * élu, quand le marché a été passé par une collectivité où l'élu siège.
 *
 * Décidé le 10 octobre 2026, d'après la méthode de `docs/07-risques.md`
 * (« Les recoupements ») :
 *
 * 1. **seulement les marchés de la collectivité où l'élu siège** — sa
 *    commune ; son intercommunalité quand il a un siège au conseil
 *    communautaire ; le département ou la région dont il est conseiller ;
 * 2. **affiché sous l'élu et sous le marché**, avec les deux liens, et la
 *    phrase qui dit que le rapprochement repose sur le nom seul, que la HATVP
 *    ne double d'aucun numéro ;
 * 3. **rien de plus** : ni conflit d'intérêts, ni participation au vote — le
 *    site ne sait pas si l'élu a pris part à la décision ;
 * 4. **un faux rapprochement signalé est retiré** : la page nominative de
 *    l'élu et le SIREN du titulaire, sous `rapprochements` dans
 *    `retraits.yaml`, l'écartent au build suivant.
 *
 * Le nom est plié — casse, accents, ponctuation, formes juridiques retirées —
 * puis comparé à l'identique : « SARL Serrat Cantalu » rejoint
 * « ETABLISSEMENTS SERRAT-CANTALU », « Serrat » seul ne rejoint rien. Seules
 * les rubriques qui parlent de l'élu lui-même sont lues : ses activités
 * professionnelles et de conseil, les organes dirigeants où il siège, ses
 * participations financières. Ni l'employeur du conjoint, ni celui d'un
 * collaborateur : ce sont d'autres personnes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { enClair, marchesCompletsDe } from './fiche-commune.ts';
import { RACINE } from './graphe.ts';

/** Ce qu'il faut d'une déclaration d'intérêts pour la rapprocher. */
export interface DeclarantRapproche {
  elu: string;
  page: string;
  contenu: {
    depot: string;
    lignes: { rubrique: string; intitule: string; precision: string; periode: string }[];
  } | null;
}

export interface Rapprochement {
  elu: string;
  /** La page nominative de l'élu à la HATVP. */
  page: string;
  /** Le dépôt de la déclaration d'intérêts où figure le nom (AAAA-MM-JJ). */
  depot: string;
  rubrique: string;
  /** Le nom tel que l'élu l'a déclaré. */
  declare: string;
  periode: string;
  acheteur: string;
  acheteurSiren: string;
  siren: string;
  titulaire: string;
  /** Les marchés de cet acheteur obtenus par ce titulaire, du plus récent au plus ancien. */
  marches: { objet: string; date: string }[];
}

/** Pour chaque rubrique lue, le champ qui porte le nom de la société ou de l'organisme. */
const CHAMP: Record<string, 'intitule' | 'precision'> = {
  'activité professionnelle': 'precision',
  'activité de conseil': 'precision',
  'organe dirigeant': 'precision',
  'participation financière': 'intitule',
};

const FORMES =
  /\b(sas|sasu|sarl|sarlu|eurl|sa|sci|snc|scop|scic|scea|gaec|earl|gie|selarl|selas|sca|sem|saem|societe|ste|ets|etablissements?)\b/g;

/** Le nom plié : sans casse, sans accents, sans ponctuation, sans forme juridique. */
export function plierNom(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&#?\w+;/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(FORMES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let retires: Set<string> | null = null;
/** « page nominative|SIREN » : les faux rapprochements signalés. */
function retraitsRapprochements(): Set<string> {
  if (retires) return retires;
  const chemin = join(RACINE, 'retraits.yaml');
  const brut = existsSync(chemin)
    ? ((parse(readFileSync(chemin, 'utf8')) ?? {}) as { rapprochements?: { page?: string; siren?: string | number }[] })
    : {};
  retires = new Set(
    (brut.rapprochements ?? [])
      .filter((r) => r?.page && r?.siren)
      .map((r) => `${String(r.page).trim()}|${String(r.siren).replace(/\D/g, '')}`),
  );
  return retires;
}

/**
 * Les titulaires des marchés d'un acheteur, indexés par nom plié. Calculé
 * une fois par acheteur : la page d'un département le demande pour chacun
 * de ses élus.
 */
const indexParAcheteur = new Map<string, Map<string, { siren: string; nom: string; marches: { objet: string; date: string }[] }[]>>();
function titulairesParNom(dep: string, acheteur: string) {
  const cle = `${dep}|${acheteur}`;
  const deja = indexParAcheteur.get(cle);
  if (deja) return deja;
  const parSiren = new Map<string, { siren: string; nom: string; marches: { objet: string; date: string }[] }>();
  for (const m of marchesCompletsDe(dep, acheteur)) {
    for (const [siren, nom] of m.t) {
      // Un acheteur déclaré titulaire de son propre marché est une erreur de saisie, pas un recoupement.
      if (siren === acheteur) continue;
      if (!parSiren.has(siren)) parSiren.set(siren, { siren, nom, marches: [] });
      parSiren.get(siren)!.marches.push({ objet: enClair(m.objet), date: m.date });
    }
  }
  const index = new Map<string, { siren: string; nom: string; marches: { objet: string; date: string }[] }[]>();
  for (const t of parSiren.values()) {
    t.marches.sort((a, b) => b.date.localeCompare(a.date));
    const k = plierNom(t.nom);
    if (k.length < 3) continue;
    if (!index.has(k)) index.set(k, []);
    index.get(k)!.push(t);
  }
  indexParAcheteur.set(cle, index);
  return index;
}

/**
 * Les rapprochements d'un élu avec les titulaires des collectivités où il
 * siège. `acheteurs` est la liste de ces collectivités, et rien d'autre.
 */
export function rapprocher(d: DeclarantRapproche, acheteurs: { siren: string; nom: string; dep: string }[]): Rapprochement[] {
  if (!d.contenu || acheteurs.length === 0) return [];
  const retraits = retraitsRapprochements();
  const out: Rapprochement[] = [];
  const vus = new Set<string>();
  for (const l of d.contenu.lignes) {
    const champ = CHAMP[l.rubrique];
    if (!champ) continue;
    const declare = l[champ].trim();
    const k = plierNom(declare);
    if (k.length < 3) continue;
    for (const a of acheteurs) {
      for (const t of titulairesParNom(a.dep, a.siren).get(k) ?? []) {
        if (retraits.has(`${d.page}|${t.siren}`)) continue;
        const cle = `${l.rubrique}|${k}|${a.siren}|${t.siren}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        out.push({
          elu: d.elu,
          page: d.page,
          depot: d.contenu.depot,
          rubrique: l.rubrique,
          declare,
          periode: l.periode,
          acheteur: a.nom,
          acheteurSiren: a.siren,
          siren: t.siren,
          titulaire: t.nom,
          marches: t.marches,
        });
      }
    }
  }
  return out;
}

/** Les rapprochements, rangés par titulaire d'un acheteur : `acheteur|siren`. */
export function parTitulaire(liste: Rapprochement[]): Map<string, Rapprochement[]> {
  const m = new Map<string, Rapprochement[]>();
  for (const r of liste) {
    const k = `${r.acheteurSiren}|${r.siren}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}
