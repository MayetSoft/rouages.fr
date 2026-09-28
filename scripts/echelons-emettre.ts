/**
 * Les comptes du département et de la région.
 *
 * Le site nomme ces deux échelons à chaque écran — ils versent le revenu de
 * solidarité active, bâtissent les collèges et les lycées, paient les trains
 * régionaux — et ne montrait jamais leurs comptes, alors qu'il détaille ceux de
 * la commune depuis longtemps. Un lecteur pouvait savoir ce que sa commune de
 * 1 400 habitants dépense par habitant, et rien de ce que fait le département
 * qui décide de son collège.
 *
 * Le même arbre de postes qu'à l'échelon communal, pour que les ordres de
 * grandeur se comparent d'un coup d'œil — chaque échelon ne gardant que ceux
 * que ses comptes portent (`niveaux` dans `reperes.yaml`) : le RSA chez le
 * département, les cartes grises chez la région. Deux précautions propres à
 * ces bases, qui ne sont pas consolidées comme celle des communes :
 *
 *   — **le budget principal seulement.** 230 391 lignes sur 318 638 sont des
 *     budgets annexes : un domaine, un laboratoire, un service d'incendie.
 *     Les additionner au budget principal gonflerait tout sans rien expliquer.
 *   — **une ligne par exercice**, et non par mois : on prend tels quels le
 *     montant et la valeur en euros par habitant que l'OFGL publie.
 *
 * Les « impôts locaux » d'un département ou d'une région sont minces, voire
 * négatifs : depuis 2021, l'essentiel de ce qu'ils percevaient est remplacé
 * par une fraction de TVA, que l'OFGL range dans les autres impôts et taxes.
 * Le tableau montre l'un et l'autre, et le bloc le dit.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';
import { aSerie, controlerSommes, parHabitant, PROFONDEUR, reperesDe } from './finances-emettre.ts';

const BASE = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets';

interface LigneEchelon {
  exer: number | string;
  code: string | null;
  montant: number | null;
  ptot: number | null;
  euros_par_habitant: number | null;
}

export interface ComptesEchelon {
  annees: number[];
  /** Les repères de cet échelon, dans l'ordre des vecteurs. */
  reperes: Repere[];
  /** La position, dans `reperes`, de ceux qui ont leur ligne en tête. */
  principaux: number[];
  /** Code de la collectivité -> pour chaque repère de tête, les euros par habitant de chaque exercice. */
  series: Map<string, (number | null)[][]>;
  /** Code de la collectivité -> pour chaque repère, le montant du dernier exercice. */
  montants: Map<string, (number | null)[]>;
  /** Code de la collectivité -> la population que l'OFGL retient au dernier exercice. */
  populations: Map<string, number>;
  /** Médiane de chaque repère au dernier exercice, en euros par habitant, toutes collectivités confondues. */
  medianes: (number | null)[];
  /**
   * Combien de collectivités entrent dans *chaque* médiane.
   *
   * Un chiffre par repère, et non un pour l'échelon : les régions n'ont plus de
   * dotation globale de fonctionnement depuis 2018 — seules quelques-unes en
   * déclarent encore une — et annoncer « médiane des dix-sept régions » sous ce
   * repère ferait passer une poignée de cas particuliers pour la norme.
   */
  effectifs: number[];
  /** Le plus grand des effectifs : la taille de l'échelon tel qu'il est publié. */
  effectif: number;
}

export interface Echelons {
  departements: ComptesEchelon | null;
  regions: ComptesEchelon | null;
  maj: string;
}

async function collecterUn(
  jeu: string,
  colonneCode: string,
  reperes: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<ComptesEchelon | null> {
  const annees: number[] = [];
  for (let a = annee - PROFONDEUR + 1; a <= annee; a++) annees.push(a);
  const rang = new Map(annees.map((a, i) => [a, i]));
  const dernier = annees.length - 1;
  const serie = aSerie(reperes);
  // Les repères calculés sont propres aux communes : ici, seuls les agrégats.
  const lus = reperes.filter((r) => r.agregat);
  const principaux = lus.flatMap((r, i) => (r.principal ? [i] : []));

  // Par repère, par collectivité : [montants, euros par habitant, population] de chaque exercice.
  const bruts = lus.map(() => new Map<string, { m: (number | null)[]; e: (number | null)[]; p: (number | null)[] }>());
  for (const [i, r] of lus.entries()) {
    const voulues = serie.has(r.id) ? annees : [annee];
    const url =
      `${BASE}/${jeu}/exports/json?select=exer,${colonneCode} as code,montant,ptot,euros_par_habitant` +
      `&where=${encodeURIComponent(
        `agregat="${r.agregat}" and type_de_budget="Budget principal" and ` +
          `exer>=${voulues[0]} and exer<=${voulues[voulues.length - 1]}`,
      )}`;
    const lignes = await json<LigneEchelon[]>(url);
    if (lignes.length === 0) {
      throw new Error(`l'agrégat « ${r.agregat} » ne renvoie rien dans ${jeu} : le libellé a-t-il changé ?`);
    }
    for (const l of lignes) {
      const j = rang.get(Number(l.exer));
      const code = String(l.code ?? '').trim();
      if (j === undefined || !code) continue;
      let b = bruts[i].get(code);
      if (!b) {
        const n = () => new Array<number | null>(annees.length).fill(null);
        bruts[i].set(code, (b = { m: n(), e: n(), p: n() }));
      }
      b.m[j] = l.montant;
      b.e[j] = l.euros_par_habitant;
      b.p[j] = l.ptot;
    }
  }
  const codes = new Set<string>();
  for (const b of bruts) for (const c of b.keys()) codes.add(c);
  if (codes.size === 0) return null;

  const rangDe = new Map(lus.map((r, i) => [r.id, i]));
  controlerSommes(lus, (id, code) => bruts[rangDe.get(id)!]?.get(code)?.m[dernier] ?? null, [...codes], dire);

  const series = new Map<string, (number | null)[][]>();
  const montants = new Map<string, (number | null)[]>();
  const populations = new Map<string, number>();
  for (const code of codes) {
    const b = bruts.map((x) => x.get(code));
    series.set(code, principaux.map((i) => (b[i]?.e ?? []).map((v) => parHabitant(v ?? null))));
    montants.set(code, b.map((x) => (x?.m[dernier] == null ? null : Math.round(x.m[dernier]!))));
    const p = b.find((x) => x?.p[dernier])?.p[dernier];
    if (p) populations.set(code, p);
  }

  const medianes: (number | null)[] = [];
  const effectifs: number[] = [];
  for (const i of lus.keys()) {
    const valeurs: number[] = [];
    for (const b of bruts[i].values()) {
      const x = parHabitant(b.e[dernier]);
      if (x !== null) valeurs.push(x);
    }
    valeurs.sort((a, b) => a - b);
    medianes.push(valeurs.length > 0 ? valeurs[Math.floor(valeurs.length / 2)] : null);
    effectifs.push(valeurs.length);
  }
  const effectif = Math.max(0, ...effectifs);
  dire(`  ${jeu} : ${codes.size} collectivités, ${lus.length} postes, ${annees[0]} à ${annees[dernier]}.`);
  return { annees, reperes: lus, principaux, series, montants, populations, medianes, effectifs, effectif };
}

export async function collecterEchelons(
  tous: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Echelons | null> {
  const dep = reperesDe('departement', tous);
  const reg = reperesDe('region', tous);
  if (dep.length === 0 && reg.length === 0) return null;
  dire(`Comptes du département (${dep.length} postes) et de la région (${reg.length}) :`);
  const departements = await collecterUn('ofgl-base-departements', 'dep_code', dep, annee, json, dire);
  const regions = await collecterUn('ofgl-base-regions', 'reg_code', reg, annee, json, dire);
  if (!departements && !regions) return null;
  return { departements, regions, maj: new Date().toISOString().slice(0, 10) };
}

/**
 * Un seul fichier national : une centaine de départements et une vingtaine de
 * régions. Quelques centaines de kilo-octets, chargés avec le reste plutôt
 * qu'à part.
 *
 * Le nom du repère seulement, pas son explication : celles de `reperes.yaml`
 * sont écrites pour une commune — « ce que l'État verse à la commune » — et les
 * recopier sous les comptes d'un département dirait autre chose que le chiffre
 * affiché.
 */
export function ecrireEchelons(sortie: string, e: Echelons): number {
  const rendre = (c: ComptesEchelon | null) => {
    if (!c) return null;
    const h: Record<string, [(number | null)[][], (number | null)[], number | null]> = {};
    for (const code of [...c.montants.keys()].sort()) {
      h[code] = [c.series.get(code) ?? [], c.montants.get(code)!, c.populations.get(code) ?? null];
    }
    return {
      annees: c.annees,
      reperes: c.reperes.map((r) => ({ id: r.id, nom: r.nom, parent: r.parent, dont: r.dont || undefined })),
      principaux: c.principaux,
      medianes: c.medianes,
      effectifs: c.effectifs,
      effectif: c.effectif,
      h,
    };
  };
  const dep = rendre(e.departements);
  const reg = rendre(e.regions);
  writeFileSync(join(sortie, 'echelons.json'), JSON.stringify({ maj: e.maj, departements: dep, regions: reg }));
  return (dep ? Object.keys(dep.h).length : 0) + (reg ? Object.keys(reg.h).length : 0);
}
