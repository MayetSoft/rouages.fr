/**
 * Les comptes de l'intercommunalité, du département et de la région.
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
 *
 * L'intercommunalité est celle à fiscalité propre — communauté de communes,
 * d'agglomération, urbaine, métropole —, repérée par son SIREN, le code que
 * BANATIC donne aussi : c'est lui qui relie ses comptes à ses communes. Les
 * syndicats n'ont pas de base à l'OFGL.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';
import { aSerie, controlerSommes, lireJson, parHabitant, partiels, PROFONDEUR, reperesDe } from './finances-emettre.ts';

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
  /** Ceux qui, faute d'une sœur à cet échelon, ne détaillent qu'une partie de leur parent. */
  partiels: Set<string>;
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
  /**
   * Des médianes par strate, quand une médiane de tout l'échelon ne voudrait
   * rien dire : une communauté de communes rurale et une métropole n'ont ni
   * les mêmes compétences ni les mêmes ressources.
   */
  strates?: {
    /** Code de la collectivité -> sa strate, au dernier exercice. */
    de: Map<string, string>;
    medianes: Record<string, (number | null)[]>;
    effectifs: Record<string, number[]>;
  };
}

/**
 * Les strates des intercommunalités : la nature juridique, et pour les
 * communautés de communes le régime fiscal. Une communauté à fiscalité
 * professionnelle unique perçoit l'impôt économique de ses communes et leur en
 * reverse une part : ses comptes ne se comparent pas à ceux d'une communauté
 * à fiscalité additionnelle. Les communautés urbaines et les métropoles sont
 * réunies — une vingtaine de métropoles, quatorze communautés urbaines, aux
 * compétences voisines. La Métropole de Lyon et celle du Grand Paris sont
 * seules de leur espèce : pas de médiane.
 */
function strateGfp(nature: string, financement: string): string | null {
  if (nature === 'CC') return financement === 'FA' ? 'CC-FA' : 'CC-FPU';
  if (nature === 'CA') return 'CA';
  if (nature === 'CU' || nature === 'M') return 'CU-M';
  if (nature === 'EPT') return 'EPT';
  return null;
}

/** En dessous, une médiane ne décrit plus une norme mais quelques cas. */
const EFFECTIF_MINIMUM = 10;

function medianeDe(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  valeurs.sort((a, b) => a - b);
  return valeurs[Math.floor(valeurs.length / 2)];
}

export interface Echelons {
  intercommunalites: ComptesEchelon | null;
  departements: ComptesEchelon | null;
  regions: ComptesEchelon | null;
  maj: string;
}

async function collecterUn(
  jeu: string,
  colonneCode: string,
  reperes: Repere[],
  tous: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
  strates?: Map<string, string>,
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
    const lignes = await lireJson(() => json<LigneEchelon[]>(url));
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
  const incomplets = partiels(lus, tous);
  controlerSommes(lus, (id, code) => bruts[rangDe.get(id)!]?.get(code)?.m[dernier] ?? null, [...codes], dire, incomplets);

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
  const parStrate: NonNullable<ComptesEchelon['strates']> | undefined = strates
    ? { de: strates, medianes: {}, effectifs: {} }
    : undefined;
  for (const i of lus.keys()) {
    const valeurs: number[] = [];
    const parS = new Map<string, number[]>();
    for (const [code, b] of bruts[i]) {
      const x = parHabitant(b.e[dernier]);
      if (x === null) continue;
      valeurs.push(x);
      const s = strates?.get(code);
      if (s) parS.set(s, [...(parS.get(s) ?? []), x]);
    }
    medianes.push(medianeDe(valeurs));
    effectifs.push(valeurs.length);
    if (parStrate) {
      for (const s of new Set(strates!.values())) {
        const v = parS.get(s) ?? [];
        (parStrate.medianes[s] ??= []).push(v.length >= EFFECTIF_MINIMUM ? medianeDe(v) : null);
        (parStrate.effectifs[s] ??= []).push(v.length);
      }
    }
  }
  const effectif = Math.max(0, ...effectifs);
  dire(`  ${jeu} : ${codes.size} collectivités, ${lus.length} postes, ${annees[0]} à ${annees[dernier]}.`);
  if (parStrate) {
    const tailles = Object.entries(parStrate.effectifs).map(([s, e]) => `${s} ${Math.max(0, ...e)}`);
    dire(`    strates : ${tailles.join(', ')}.`);
  }
  return {
    annees,
    reperes: lus,
    partiels: incomplets,
    principaux,
    series,
    montants,
    populations,
    medianes,
    effectifs,
    effectif,
    strates: parStrate,
  };
}

export async function collecterEchelons(
  tous: Repere[],
  annee: number,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Echelons | null> {
  const epci = reperesDe('intercommunalite', tous);
  const dep = reperesDe('departement', tous);
  const reg = reperesDe('region', tous);
  if (epci.length === 0 && dep.length === 0 && reg.length === 0) return null;
  dire(
    `Comptes de l'intercommunalité (${epci.length} postes), du département (${dep.length}) et de la région (${reg.length}) :`,
  );
  const strates = new Map<string, string>();
  if (epci.length > 0) {
    const url =
      `${BASE}/ofgl-base-gfp/exports/json?select=siren,nat_juridique,mode_financement` +
      `&where=${encodeURIComponent(`agregat="Recettes totales" and type_de_budget="Budget principal" and exer>=${annee} and exer<=${annee}`)}`;
    const lignes = await lireJson(() =>
      json<{ siren: string | null; nat_juridique: string | null; mode_financement: string | null }[]>(url),
    );
    for (const l of lignes) {
      const s = strateGfp(l.nat_juridique ?? '', l.mode_financement ?? '');
      if (l.siren && s) strates.set(String(l.siren).trim(), s);
    }
  }
  const intercommunalites = await collecterUn('ofgl-base-gfp', 'siren', epci, tous, annee, json, dire, strates);
  const departements = await collecterUn('ofgl-base-departements', 'dep_code', dep, tous, annee, json, dire);
  const regions = await collecterUn('ofgl-base-regions', 'reg_code', reg, tous, annee, json, dire);
  if (!intercommunalites && !departements && !regions) return null;
  return { intercommunalites, departements, regions, maj: new Date().toISOString().slice(0, 10) };
}

/**
 * Un seul fichier national : un peu plus de 1 250 intercommunalités, une
 * centaine de départements et une vingtaine de régions. Moins d'un mégaoctet,
 * chargé avec le reste plutôt qu'à part.
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
      reperes: c.reperes.map((r) => ({
        id: r.id,
        nom: r.nom,
        parent: r.parent,
        dont: r.dont || c.partiels.has(r.id) || undefined,
      })),
      principaux: c.principaux,
      medianes: c.medianes,
      effectifs: c.effectifs,
      effectif: c.effectif,
      h,
      ...(c.strates && {
        strates: {
          de: Object.fromEntries([...c.strates.de].filter(([code]) => h[code]).sort()),
          medianes: c.strates.medianes,
          effectifs: c.strates.effectifs,
        },
      }),
    };
  };
  const epci = rendre(e.intercommunalites);
  const dep = rendre(e.departements);
  const reg = rendre(e.regions);
  writeFileSync(
    join(sortie, 'echelons.json'),
    JSON.stringify({ maj: e.maj, intercommunalites: epci, departements: dep, regions: reg }),
  );
  return [epci, dep, reg].reduce((n, x) => n + (x ? Object.keys(x.h).length : 0), 0);
}
