/**
 * De quoi un conseil municipal est fait, et qui sont les adjoints du maire.
 *
 * D'abord **de quoi l'assemblée est faite**, ce qu'on ne peut lire nulle part
 * ailleurs : un effectif, une part de femmes, des âges, des professions. Neuf
 * retraités et aucun ouvrier dans une commune ouvrière se voit d'un coup
 * d'œil, et aucune liste de noms ne le dirait.
 *
 * Puis **qui y siège**, depuis la décision du 1er octobre 2026 (`CLAUDE.md`,
 * « Les noms dans les données ») : chaque membre, avec son prénom, son nom et
 * son année de naissance — ni le jour, ni le sexe, ni la profession, qui
 * restent des décomptes. Et, pour chacun, s'il siège aussi au conseil
 * communautaire et avec quelle fonction : le répertoire publie les deux
 * fichiers, et le rapprochement se fait sur la commune, le nom, le prénom et
 * la date de naissance complète — quatre champs du même registre, jamais le
 * nom seul.
 *
 * **Le répertoire décrit le conseil tel qu'il est, pas tel qu'il a été élu**,
 * et c'est une information en soi. Comparé au nombre de sièges à pourvoir du
 * scrutin : 32 767 conseils coïncident, 2 016 diffèrent, et l'écart est presque
 * toujours négatif — un siège vacant qu'une démission ou un décès a laissé.
 * Le site affiche donc l'effectif réel, et dit «&nbsp;sur tant de sièges&nbsp;»
 * quand les deux divergent.
 *
 * **Les adjoints, eux, sont nommés** depuis la décision du 1er octobre 2026
 * (`CLAUDE.md`, « Les noms dans les données ») : un adjoint détient des
 * délégations du maire et signe en son nom, c'est une fonction exécutive. On
 * en garde la fonction et la date de prise de fonction en plus. Les maires
 * délégués d'une commune nouvelle, adjoints de droit, en sont.
 *
 * **Ce qu'on refuse encore : le nombre total de sièges d'une intercommunalité.**
 * Compter les lignes du répertoire donne 81 pour CA Vichy Communauté, qui en
 * publie 77, et ne rattache ses élus qu'à 38 de ses 39 communes.
 *
 * **Le nombre de représentants d'une commune n'est pas publié non plus.** Le
 * répertoire ne dit pas qui est titulaire et qui est suppléant, et ses
 * effectifs se contredisent : à Vichy Communauté, Bost (183 habitants) y a deux
 * conseillers communautaires, Vendat (2 292) un seul, Molles aucun ; sur les
 * quelque dix mille communes de moins de trois cents habitants, 192 en ont deux,
 * dispersées dans cent intercommunalités — la marque d'une saisie, pas d'un
 * accord local. Le compte `cc` reste collecté pour mesurer l'écart ; la page
 * prend les sièges dans les résultats du scrutin, qui n'en portent qu'à partir
 * de mille habitants.
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lignesCsvOuvert, ressourcesDuJeu } from './donnees-ouvertes.ts';
import { telechargerSiAbsent } from './par-departement.ts';
import { conseillerRetire, eluRetire } from './retraits.ts';

/** Le jeu du ministère, et les deux fichiers qu'on y prend. */
const JEU = 'repertoire-national-des-elus-1';

/**
 * Les huit groupes socioprofessionnels de la PCS 2003, dans l'ordre du premier
 * chiffre du code — c'est lui qui fait foi, comme pour les familles d'actes.
 *
 * Le répertoire emploie les quarante-deux catégories à deux chiffres ; l'INSEE
 * les agrège en ces huit groupes, dont six d'actifs. Les afficher toutes les
 * quarante-deux ferait une liste que personne ne lit.
 */
export const GROUPES = [
  'Agriculteurs exploitants',
  'Artisans, commerçants, chefs d’entreprise',
  'Cadres et professions intellectuelles supérieures',
  'Professions intermédiaires',
  'Employés',
  'Ouvriers',
  'Retraités',
  'Sans activité professionnelle',
] as const;

export interface ConseilCommune {
  /** Conseillers en fonction — pas sièges à pourvoir : voir l'en-tête. */
  n: number;
  /** Combien de femmes. La parité ne s'impose qu'au-dessus de mille habitants. */
  f: number;
  /**
   * Âges en années révolues à la date de l'ingestion : le plus jeune, le
   * médian, le plus âgé.
   *
   * L'étendue dit ce que la médiane cache — un conseil de 45 ans de médiane
   * dont le plus jeune a 23 ans et le plus âgé 78 ne ressemble pas à un
   * conseil où tout le monde a entre 42 et 48.
   */
  age: [number, number, number];
  /** Par groupe : son index dans `GROUPES`, puis le nombre. */
  p: [number, number][];
  /** Lignes du répertoire rattachées à la commune au conseil communautaire — non publié, voir l'en-tête. */
  cc: number;
  /**
   * Les adjoints, dans l'ordre du tableau : fonction, prénom, nom, date de
   * prise de fonction, année de naissance, et le siège au conseil
   * communautaire (vide : aucun ; sinon la fonction qu'il y occupe, ou
   * « conseiller communautaire »).
   */
  a?: [string, string, string, string, string?, string?][];
  /** Les autres conseillers, par nom : prénom, nom, année de naissance, siège communautaire. */
  m?: [string, string, string, string?][];
  /** Le siège communautaire du maire, s'il en a un. */
  mc?: string;
}

/** Ce qui rapproche une ligne du conseil municipal d'une ligne du conseil communautaire. */
const cle = (code: string, l: Record<string, string>) =>
  [code, (l["Nom de l'élu"] ?? '').trim().toUpperCase(), (l["Prénom de l'élu"] ?? '').trim().toUpperCase(), (l['Date de naissance'] ?? '').trim()].join('|');

/** La fonction au conseil communautaire, telle que le répertoire l'écrit ; sans fonction, « conseiller communautaire ». */
function fonctionCc(f: string): string {
  const t = f.trim();
  if (!t) return 'conseiller communautaire';
  return t;
}

/** Le rang d'une fonction dans le tableau : 1er adjoint, 2e…, puis les maires délégués. */
function rangAdjoint(fonction: string): number | null {
  const m = /^(\d+)\s*(?:er|e|ème|eme)\s+adjoint/i.exec(fonction);
  if (m) return Number(m[1]);
  if (/^maire délégué/i.test(fonction)) return 1000;
  return null;
}

export interface Conseils {
  maj: string;
  communes: Map<string, ConseilCommune>;
  /** Part de femmes dans l'ensemble des conseils, pour situer la sienne. */
  partFemmes: number;
  /** Âge médian de tous les conseillers du pays. */
  ageMedian: number;
}

const mediane = (v: number[]): number =>
  v.length === 0 ? 0 : [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** Années révolues, à la date du jour. */
function age(naissance: string, aujourdhui: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(naissance);
  if (!m) return null;
  const [, a, mo, j] = m;
  let ans = aujourdhui.getFullYear() - Number(a);
  const avant =
    aujourdhui.getMonth() + 1 < Number(mo) ||
    (aujourdhui.getMonth() + 1 === Number(mo) && aujourdhui.getDate() < Number(j));
  if (avant) ans--;
  // Un âge hors de tout plausible signale une date fautive, pas un doyen.
  return ans >= 18 && ans <= 110 ? ans : null;
}

export async function collecterConseils(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lire: (chemin: string) => AsyncIterable<Uint8Array>,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Conseils | null> {
  const [municipaux] = await ressourcesDuJeu(JEU, 'conseillers-municipaux', json, dire);
  const [communautaires] = await ressourcesDuJeu(JEU, 'conseillers-communautaires', json, dire);
  if (!municipaux) {
    dire('Conseils : le fichier des conseillers municipaux est introuvable.');
    return null;
  }

  const aujourdhui = new Date();
  const communes = new Map<string, ConseilCommune>();
  const ages = new Map<string, number[]>();
  const tousAges: number[] = [];
  let femmes = 0;
  let total = 0;
  let adjoints = 0;
  let nommes = 0;
  // Les lignes à compléter du siège communautaire, une fois ce fichier-là lu.
  const aCompleter = new Map<string, (cc: string) => void>();

  const fichierCm = join(cache, 'rne-conseillers-municipaux.csv');
  try {
    await telecharger(municipaux, fichierCm);
  } catch {
    dire('Conseils : le répertoire n’a pas répondu, les fichiers précédents restent en place.');
    return null;
  }
  for await (const l of lignesCsvOuvert(fichierCm, lire)) {
    const code = (l['Code de la commune'] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    let c = communes.get(code);
    if (!c) {
      c = { n: 0, f: 0, age: [0, 0, 0], p: [], cc: 0 };
      communes.set(code, c);
      ages.set(code, []);
    }
    c.n++;
    total++;
    if ((l['Code sexe'] ?? '').trim() === 'F') {
      c.f++;
      femmes++;
    }
    const groupe = Number.parseInt((l['Code de la catégorie socio-professionnelle'] ?? '').slice(0, 1), 10);
    if (groupe >= 1 && groupe <= GROUPES.length) {
      const deja = c.p.find(([i]) => i === groupe - 1);
      if (deja) deja[1]++;
      else c.p.push([groupe - 1, 1]);
    }
    const fonction = (l['Libellé de la fonction'] ?? '').trim();
    const prenom = (l["Prénom de l'élu"] ?? '').trim();
    const nom = (l["Nom de l'élu"] ?? '').trim();
    // L'année de naissance seule : le répertoire publie le jour, on ne le reprend pas.
    const annee = /^(\d{4})-/.exec((l['Date de naissance'] ?? '').trim())?.[1] ?? '';
    const ici = c;
    if (fonction === 'Maire') {
      aCompleter.set(cle(code, l), (cc) => (ici.mc = cc));
    } else if (rangAdjoint(fonction) !== null) {
      if (!eluRetire(code, fonction)) {
        const ligne: [string, string, string, string, string?, string?] = [
          fonction,
          prenom,
          nom,
          (l['Date de début de la fonction'] ?? '').trim(),
          annee,
        ];
        (c.a ??= []).push(ligne);
        aCompleter.set(cle(code, l), (cc) => (ligne[5] = cc));
        adjoints++;
      }
    } else if (nom && !conseillerRetire(code, nom, prenom, (l['Date de naissance'] ?? '').trim())) {
      const ligne: [string, string, string, string?] = [prenom, nom, annee];
      (c.m ??= []).push(ligne);
      aCompleter.set(cle(code, l), (cc) => (ligne[3] = cc));
      nommes++;
    }
    const a = age((l['Date de naissance'] ?? '').trim(), aujourdhui);
    if (a !== null) {
      ages.get(code)!.push(a);
      tousAges.push(a);
    }
  }

  if (communes.size === 0) {
    dire('Conseils : aucun conseiller lu.');
    return null;
  }

  // Les représentants au conseil communautaire, comptés pour mesurer l'écart
  // avec les résultats du scrutin : la page ne les affiche pas (voir l'en-tête).
  let avecCc = 0;
  let rapproches = 0;
  if (communautaires) {
    const fichierCc = join(cache, 'rne-conseillers-communautaires.csv');
    try {
      await telecharger(communautaires, fichierCc);
      for await (const l of lignesCsvOuvert(fichierCc, lire)) {
        const code = (l['Code de la commune de rattachement'] ?? '').trim();
        const c = communes.get(code);
        if (c) {
          c.cc++;
          avecCc++;
          const completer = aCompleter.get(cle(code, l));
          if (completer) {
            completer(fonctionCc(l['Libellé de la fonction'] ?? ''));
            rapproches++;
          }
        }
      }
    } catch {
      dire('  les conseillers communautaires n’ont pas répondu : la commune dira ses seuls sièges municipaux.');
    }
  }

  for (const [code, c] of communes) {
    const v = ages.get(code) ?? [];
    c.age = v.length === 0 ? [0, 0, 0] : [Math.min(...v), mediane(v), Math.max(...v)];
    c.p.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    c.a?.sort((x, y) => (rangAdjoint(x[0]) ?? 0) - (rangAdjoint(y[0]) ?? 0) || x[2].localeCompare(y[2], 'fr'));
    c.m?.sort((x, y) => x[1].localeCompare(y[1], 'fr') || x[0].localeCompare(y[0], 'fr'));
  }

  const partFemmes = Math.round((femmes / total) * 1000) / 10;
  dire(
    `Conseils : ${total.toLocaleString('fr-FR')} conseillers dans ` +
      `${communes.size.toLocaleString('fr-FR')} communes, ${partFemmes} % de femmes, ` +
      `âge médian ${mediane(tousAges)} ans` +
      (avecCc > 0 ? `, ${avecCc.toLocaleString('fr-FR')} sièges communautaires rattachés` : '') +
      `, ${adjoints.toLocaleString('fr-FR')} adjoints et maires délégués, ${nommes.toLocaleString('fr-FR')} autres conseillers nommés` +
      (avecCc > 0 ? ` ; ${rapproches.toLocaleString('fr-FR')} sièges communautaires rapprochés sur ${avecCc.toLocaleString('fr-FR')}.` : '.'),
  );
  return { maj: aujourdhui.toISOString().slice(0, 10), communes, partFemmes, ageMedian: mediane(tousAges) };
}

/** Un fichier par département, comme le reste. */
export function ecrireConseils(sortie: string, dep: string, codes: string[], k: Conseils): number {
  const c: Record<string, ConseilCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = k.communes.get(code);
    if (!f || f.n === 0) continue;
    c[code] = f;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-conseils.json`),
    JSON.stringify({
      maj: k.maj,
      groupes: GROUPES,
      femmes: k.partFemmes,
      age: k.ageMedian,
      c,
    }),
  );
  return n;
}

// Lancé seul : relit le fichier des conseillers (dans `.cache/` s'il y est) et réécrit `dep/XX-conseils.json`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const k = await collecterConseils(
    telecharger,
    cache,
    (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
    lireJson as <T>(url: string) => Promise<T>,
    console.log,
  );
  if (k) {
    const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { c: [string, string, string, string, number][] };
    const parDep = new Map<string, string[]>();
    for (const [code, , , dep] of index.c) parDep.set(dep, [...(parDep.get(dep) ?? []), code]);
    let n = 0;
    for (const [dep, codes] of parDep) n += ecrireConseils(sortie, dep, codes, k);
    console.log(`${n} communes écrites.`);
  }
}
