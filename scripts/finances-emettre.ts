/**
 * Les repères financiers, commune par commune.
 *
 * « 90 € par habitant » ne dit rien. Chaque repère est donc restitué en euros
 * par habitant — la seule forme comparable — et confronté à la médiane des
 * communes de taille voisine. C'est exactement ce que le site recommande par
 * ailleurs de faire avant de conclure : comparer à strate équivalente, sinon
 * les écarts ne veulent rien dire.
 *
 * Les comptes viennent de l'OFGL, qui les publie sous licence ouverte.
 *
 * Chaque repère est collecté sur toute la profondeur disponible, pas seulement
 * sur le dernier exercice. Un chiffre isolé ne se discute pas ; une série dit
 * ce qui a changé — et c'est de là que part toute question à un élu. L'OFGL
 * couvre 2018 à 2025, huit exercices complets.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Repere } from '../src/modele/schemas.ts';

const OFGL = 'https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/ofgl-base-communes-consolidee';

/**
 * Les strates de population de référence : comparer un village à une ville n'a
 * aucun sens. Les libellés se lisent à la suite de « les communes … ».
 */
export const STRATES: { max: number; libelle: string }[] = [
  { max: 500, libelle: 'de moins de 500 habitants' },
  { max: 2000, libelle: 'de 500 à 2 000 habitants' },
  { max: 10000, libelle: 'de 2 000 à 10 000 habitants' },
  { max: 50000, libelle: 'de 10 000 à 50 000 habitants' },
  { max: Infinity, libelle: 'de plus de 50 000 habitants' },
];

export function strateDe(population: number): number {
  return STRATES.findIndex((s) => population < s.max);
}

/**
 * Un export JSON de l'OFGL, relu s'il arrive tronqué. Les plus gros pèsent une
 * cinquantaine de mégaoctets ; la connexion en a coupé un à 865 Ko, et la
 * reprise de `obstine` ne couvre que la requête, pas la lecture du corps.
 */
export async function lireJson<T>(lire: () => Promise<T>, essais = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await lire();
    } catch (e) {
      if (i >= essais - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 5000 * (i + 1)));
    }
  }
}

/** Les repères qu'un échelon porte, dans l'ordre du contenu : c'est celui des fichiers. */
export function reperesDe(niveau: 'commune' | 'departement' | 'region', tous: Repere[]): Repere[] {
  return tous.filter((r) => r.echelon === 'commune' && r.niveaux.includes(niveau));
}

/**
 * Les repères dont il faut la série entière : ceux qui ont leur ligne en tête,
 * et ceux dont un repère de tête se déduit. Les autres ne servent qu'au
 * tableau, au dernier exercice.
 */
export function aSerie(reperes: Repere[]): Set<string> {
  const ids = new Set<string>();
  for (const r of reperes) {
    if (!r.principal) continue;
    ids.add(r.id);
    for (const d of r.difference ?? []) ids.add(d);
  }
  return ids;
}

/**
 * L'euro par habitant tel que le site l'écrit. Arrondir à l'euro près écrirait
 * « 0 € » là où la valeur est faible mais non nulle — la dotation communale de
 * Paris vaut 0,06 € par habitant, et « 0 » se lirait « Paris ne reçoit rien ».
 */
export function parHabitant(brut: number | null): number | null {
  return brut === null ? null : Math.abs(brut) < 10 ? Math.round(brut * 10) / 10 : Math.round(brut);
}

interface LigneOfgl {
  com_code: string;
  categ: string;
  annee_join: number | string;
  montant: number | null;
  ptot: number | null;
  euros_par_habitant: number | null;
}

/** Montant, population et euros par habitant, exercice par exercice. */
type Brut = { m: (number | null)[]; p: (number | null)[]; e: (number | null)[] };

/**
 * La série ne remonte pas plus loin que l'OFGL ne publie, et huit points
 * suffisent largement à voir une tendance. Au-delà, on alourdirait chaque
 * fichier départemental pour une précision que personne ne lit.
 */
export const PROFONDEUR = 8;

export interface ComptesCommunes {
  annee: number;
  /** Les exercices retenus, du plus ancien au plus récent. */
  annees: number[];
  /** Les repères de la commune, dans l'ordre des vecteurs ci-dessous. */
  reperes: Repere[];
  /** La position, dans `reperes`, de ceux qui ont leur ligne en tête. */
  principaux: number[];
  /** Par commune, pour chaque repère de tête, les euros par habitant de chaque exercice. */
  series: Map<string, (number | null)[][]>;
  /** Par commune, pour chaque repère, le montant du dernier exercice, à l'euro. */
  montants: Map<string, (number | null)[]>;
  /** Par commune, la population que l'OFGL retient au dernier exercice. */
  populations: Map<string, number>;
  /** Par commune, les euros par habitant du dernier exercice : c'est sur eux que portent les médianes. */
  parCommune: Map<string, (number | null)[]>;
  /** Communes au statut particulier : leurs comptes ne se comparent pas. */
  statutParticulier: Map<string, string>;
}

export async function collecterFinances(
  tous: Repere[],
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<ComptesCommunes | null> {
  const reperes = reperesDe('commune', tous);
  const premier = reperes.find((r) => r.agregat);
  if (!premier) return null;

  const annee = await dernierExercice(premier.agregat!, obstine, dire);
  if (!annee) {
    dire("Aucun exercice exploitable à l'OFGL : les repères financiers sont ignorés.");
    return null;
  }
  const annees: number[] = [];
  for (let a = annee - PROFONDEUR + 1; a <= annee; a++) annees.push(a);
  const rang = new Map(annees.map((a, i) => [a, i]));
  const dernier = annees.length - 1;
  const serie = aSerie(reperes);

  // Par repère, par commune : le brut de chaque exercice.
  const bruts = new Map<string, Map<string, Brut>>();
  const statutParticulier = new Map<string, string>();
  const vide = () => ({
    m: new Array<number | null>(annees.length).fill(null),
    p: new Array<number | null>(annees.length).fill(null),
    e: new Array<number | null>(annees.length).fill(null),
  });
  for (const r of reperes) {
    if (!r.agregat) continue;
    // Un seul export par repère, tous exercices confondus : huit requêtes
    // séparées ramèneraient les mêmes lignes en huit fois plus d'allers-retours.
    // Le dernier exercice seul pour les postes qui n'ont pas de série.
    const voulues = serie.has(r.id) ? annees : [annee];
    const url =
      `${OFGL}/exports/json?select=com_code,categ,annee_join,montant,ptot,euros_par_habitant` +
      // `annee_join` est un champ texte à l'OFGL : une comparaison numérique y
      // renvoie une erreur 400. On énumère donc les exercices voulus.
      `&where=${encodeURIComponent(
        `agregat="${r.agregat}" and annee_join in (${voulues.map((a) => `"${a}"`).join(',')})`,
      )}`;
    const lignes = await lireJson(async () => (await (await obstine(url)).json()) as LigneOfgl[]);
    if (lignes.length === 0) {
      throw new Error(
        `l'agrégat « ${r.agregat} » (repère ${r.id}) ne renvoie rien : le libellé a-t-il changé à l'OFGL ?`,
      );
    }
    const parCode = new Map<string, Brut>();
    for (const l of lignes) {
      const j = rang.get(Number(l.annee_join));
      if (j === undefined) continue;
      // Paris fusionne les fonctions communales et départementales : ses
      // comptes sont hors d'échelle par rapport aux autres communes, et sa
      // dotation communale est quasi nulle par construction. On garde les
      // chiffres, on retire la comparaison.
      if (l.categ && l.categ !== 'Commune') statutParticulier.set(l.com_code, l.categ);
      let b = parCode.get(l.com_code);
      if (!b) parCode.set(l.com_code, (b = vide()));
      b.m[j] = l.montant;
      b.p[j] = l.ptot;
      b.e[j] = l.euros_par_habitant;
    }
    bruts.set(r.id, parCode);
    dire(`  ${r.agregat} : ${lignes.length.toLocaleString('fr-FR')} lignes sur ${voulues.length} exercice(s)`);
  }

  // Les repères calculés : le premier moins le second, montant par montant, et
  // l'euro par habitant sur la population que l'OFGL retient pour le premier.
  //
  // Un second terme absent compte pour zéro. L'OFGL n'écrit pas la ligne d'un
  // poste que la commune n'a pas : 3 807 communes n'ont pas de fiscalité
  // reversée en 2025, 515 pas de dotation globale, 631 pas d'autres impôts —
  // et pour ces deux derniers, le contrôle des sommes ci-dessous tombe juste
  // sur les 34 778 communes en les comptant pour zéro. C'est donc ce que
  // l'absence veut dire.
  for (const r of reperes) {
    if (!r.difference) continue;
    const [a, b] = r.difference.map((id) => bruts.get(id));
    if (!a || !b) throw new Error(`repère ${r.id} : ${r.difference.join(' ou ')} n'a pas été collecté`);
    const parCode = new Map<string, Brut>();
    let sansSecond = 0;
    for (const [code, x] of a) {
      const y = b.get(code);
      if (!y || y.m[dernier] === null) sansSecond++;
      const d = vide();
      for (let j = 0; j < annees.length; j++) {
        const [ma, mb, p] = [x.m[j], y?.m[j] ?? 0, x.p[j]];
        if (ma === null) continue;
        d.m[j] = ma - mb;
        d.p[j] = p;
        d.e[j] = p ? (ma - mb) / p : null;
      }
      parCode.set(code, d);
    }
    bruts.set(r.id, parCode);
    dire(`  ${r.nom} : calculé${sansSecond ? `, ${sansSecond.toLocaleString('fr-FR')} commune(s) sans le second terme, compté pour zéro` : ''}`);
  }

  // Tout ce que l'OFGL dit s'additionner s'additionne-t-il ? Au dernier
  // exercice, commune par commune, à l'euro près.
  controlerSommes(reperes, (id, code) => bruts.get(id)?.get(code)?.m[dernier] ?? null, [...(bruts.get(premier.id)?.keys() ?? [])], dire);

  const series = new Map<string, (number | null)[][]>();
  const montants = new Map<string, (number | null)[]>();
  const parCommune = new Map<string, (number | null)[]>();
  const populations = new Map<string, number>();
  const principaux = reperes.flatMap((r, i) => (r.principal ? [i] : []));
  const codes = new Set<string>();
  for (const parCode of bruts.values()) for (const c of parCode.keys()) codes.add(c);
  for (const code of codes) {
    const b = reperes.map((r) => bruts.get(r.id)?.get(code));
    montants.set(code, b.map((x) => (x?.m[dernier] == null ? null : Math.round(x.m[dernier]!))));
    parCommune.set(code, b.map((x) => parHabitant(x?.e[dernier] ?? null)));
    series.set(code, principaux.map((i) => (b[i]?.e ?? []).map((v) => parHabitant(v ?? null))));
    const p = b.find((x) => x?.p[dernier])?.p[dernier];
    if (p) populations.set(code, p);
  }

  if (statutParticulier.size > 0) {
    dire(`  ${statutParticulier.size} commune(s) au statut particulier, exclue(s) des médianes.`);
  }
  return { annee, annees, reperes, principaux, series, montants, populations, parCommune, statutParticulier };
}

/**
 * Les postes qui, à cet échelon, ne détaillent plus qu'une partie de leur
 * parent : une de leurs sœurs n'y existe pas. Sous les impôts locaux d'une
 * région, la fiscalité reversée est seule — les impôts levés sur place sont
 * propres aux communes — et la donner comme leur décomposition serait faux.
 */
export function partiels(reperes: Repere[], tous: Repere[]): Set<string> {
  const ici = new Set(reperes.map((r) => r.id));
  const out = new Set<string>();
  for (const r of reperes) {
    if (!r.parent || r.dont) continue;
    const soeurs = tous.filter((x) => x.echelon === 'commune' && x.parent === r.parent && !x.dont);
    if (soeurs.some((x) => !ici.has(x.id))) out.add(r.id);
  }
  return out;
}

/**
 * Pour chaque poste dont toutes les parts sont données — aucune n'est un
 * « dont », aucune ne manque à l'échelon —, la somme des parts doit refaire le
 * total. On compte les écarts
 * de plus d'un euro ; au-delà d'un pour mille des collectivités, c'est que
 * l'arbre de `reperes.yaml` ne dit plus ce que l'OFGL calcule.
 */
export function controlerSommes(
  reperes: Repere[],
  montant: (id: string, code: string) => number | null,
  codes: string[],
  dire: (m: string) => void,
  incomplets: Set<string> = new Set(),
): number {
  let graves = 0;
  for (const parent of reperes) {
    const parts = reperes.filter((r) => r.parent === parent.id && !r.dont);
    if (parts.some((r) => incomplets.has(r.id))) continue;
    if (parts.length === 0) continue;
    let controles = 0;
    let ecarts = 0;
    for (const code of codes) {
      const total = montant(parent.id, code);
      if (total === null) continue;
      controles++;
      const somme = parts.reduce((s, r) => s + (montant(r.id, code) ?? 0), 0);
      if (Math.abs(total - somme) > 1) ecarts++;
    }
    if (controles === 0) continue;
    const grave = ecarts > controles / 1000;
    if (grave) graves++;
    dire(
      `  ${grave ? '⚠ ' : ''}${parent.nom} = ${parts.map((r) => r.nom).join(' + ')} : ` +
        `${ecarts.toLocaleString('fr-FR')} écart(s) sur ${controles.toLocaleString('fr-FR')}`,
    );
  }
  return graves;
}

/** Le dernier exercice réellement renseigné : le plus récent est souvent partiel. */
async function dernierExercice(
  agregat: string,
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<number | null> {
  const cette = new Date().getFullYear();
  for (let annee = cette; annee >= cette - 4; annee--) {
    const url =
      `${OFGL}/records?limit=1&select=com_code` +
      `&where=${encodeURIComponent(`annee_join=${annee} and agregat="${agregat}"`)}`;
    const r = (await (await obstine(url)).json()) as { total_count: number };
    if (r.total_count > 30_000) {
      dire(`Exercice retenu : ${annee} (${r.total_count.toLocaleString('fr-FR')} communes).`);
      return annee;
    }
  }
  return null;
}

/** Médiane par strate : la moyenne serait tirée par quelques communes atypiques. */
export function medianesParStrate(
  reperes: Repere[],
  parCommune: Map<string, (number | null)[]>,
  populations: Map<string, number>,
  statutParticulier: Map<string, string>,
): (number | null)[][] {
  const paquets: number[][][] = STRATES.map(() => reperes.map(() => []));
  for (const [code, valeurs] of parCommune) {
    const pop = populations.get(code);
    // Une commune hors norme fausserait la référence à laquelle les autres se
    // comparent : elle est écartée du calcul comme de l'affichage.
    if (pop === undefined || statutParticulier.has(code)) continue;
    const s = strateDe(pop);
    valeurs.forEach((v, i) => {
      if (v !== null) paquets[s][i].push(v);
    });
  }
  return paquets.map((parRepere) =>
    parRepere.map((liste) => {
      if (liste.length === 0) return null;
      liste.sort((a, b) => a - b);
      return liste[Math.floor(liste.length / 2)];
    }),
  );
}

/**
 * Un fichier par département. Par commune : les séries des repères de tête, en
 * euros par habitant ; le montant de chaque repère au dernier exercice ; la
 * population que l'OFGL retient. L'euro par habitant du tableau se déduit des
 * deux derniers, au build — le stocker aussi doublerait le fichier.
 */
export function ecrireFinances(sortie: string, dep: string, c: ComptesCommunes, codes: string[]): number {
  const h: Record<string, [(number | null)[][], (number | null)[], number | null]> = {};
  let n = 0;
  for (const code of codes) {
    const m = c.montants.get(code);
    if (!m) continue;
    h[code] = [c.series.get(code) ?? [], m, c.populations.get(code) ?? null];
    n++;
  }
  writeFileSync(join(sortie, 'dep', `${dep}-finances.json`), JSON.stringify({ dep, annee: c.annee, annees: c.annees, c: h }));
  return n;
}

/** Ce que `meta.json` dit des comptes : l'arbre des repères, les strates, les médianes. */
export function metaFinances(c: ComptesCommunes, populations: Map<string, number>) {
  return {
    annee: c.annee,
    // Les exercices de la série, du plus ancien au plus récent.
    annees: c.annees,
    // L'ordre des repères est celui du contenu : les vecteurs de valeurs y
    // font référence par position. Le parent et le « dont » font l'arbre du
    // tableau poste par poste.
    reperes: c.reperes.map((r) => ({
      id: r.id,
      nom: r.nom,
      explication: r.explication,
      flux: r.flux,
      parent: r.parent,
      dont: r.dont || undefined,
    })),
    // Ceux qui ont leur ligne en tête, avec leur série.
    principaux: c.principaux,
    strates: STRATES.map((s) => s.libelle),
    // Médiane par strate : la moyenne serait tirée par quelques communes
    // atypiques, et c'est à la médiane qu'on se compare.
    medianes: medianesParStrate(c.reperes, c.parCommune, populations, c.statutParticulier),
    // Rares — Paris seulement à ce jour — mais il faut le dire plutôt que de
    // proposer une comparaison qui n'a pas de sens.
    statutParticulier: Object.fromEntries(c.statutParticulier),
  };
}
