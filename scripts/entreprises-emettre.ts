/**
 * Ce que le Bulletin officiel des annonces civiles et commerciales dit des
 * entreprises d'une commune : les créations, les radiations, les ventes de
 * fonds, les procédures collectives.
 *
 * **Beaucoup d'entreprises sont des personnes.** Un entrepreneur individuel est
 * publié sous son nom et son prénom. Depuis la décision du 1er octobre 2026
 * (`CLAUDE.md`, « Les noms dans les données »), le site le nomme comme une
 * société, à trois conditions :
 *
 *   — tout est compté, personnes et sociétés confondues ;
 *   — un entrepreneur individuel n'est nommé que si le répertoire SIRENE le dit
 *     **diffusible**. Celui qui s'est opposé à la diffusion de son identité
 *     (article R123-232-1 du code de commerce) y apparaît « [ND] », alors que le
 *     BODACC publie son nom : le statut est relu à chaque ingestion, et un
 *     statut inconnu — une immatriculation plus récente que la copie du
 *     répertoire — vaut refus. Aucun dirigeant, aucune adresse ;
 *   — les procédures collectives ne sont que comptées : c'est la défaillance
 *     d'une entreprise, souvent d'une personne, et la page renvoie vers la
 *     source, où chacun peut les lire.

 * Ce sont des **annonces**, pas des événements : une même procédure en publie
 * plusieurs, de l'ouverture à la clôture. La page le dit.
 *
 * Les dépôts de comptes, les plus nombreux, ne sont pas repris : ils
 * n'apprennent rien sur la vie d'une commune.
 *
 * Le BODACC ne donne pas de code commune, mais la ville et le code postal de
 * chaque établissement. Le rattachement se fait sur le découpage
 * administratif : le code postal d'abord, le nom quand un code postal en
 * couvre plusieurs ou n'en désigne aucune (voir `rattacheur`).
 *
 * Lancé seul — `tsx scripts/entreprises-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-entreprises.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliser } from '../src/client/recherche-commune.ts';
import { retraits } from './retraits.ts';

/** Le lien d'une annonce sur bodacc.fr, depuis son identifiant. */
export const ANNONCE = 'https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:';

const BODACC =
  'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/exports/csv';

/** Les familles d'annonces retenues, dans l'ordre où la page les nomme. */
export const FAMILLES = ['creation', 'immatriculation', 'modification', 'vente', 'radiation', 'collective'] as const;
/** Celles dont les sociétés sont nommées : les procédures collectives n'en sont pas. */
const NOMMEES = ['creation', 'immatriculation', 'modification', 'vente', 'radiation'];
/** Depuis quand on compte. */
const DEPUIS = 2016;
/** Combien d'annonces nommées une commune garde. */
const RECENTES = 8;

export type Recente = [string, number, string, string, string, 0 | 1];

/** La copie de SIRENE qu'Opendatasoft tient à jour, pour relire le statut de diffusion. */
const SIRENE =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/csv';

export interface Entreprises {
  maj: string;
  annees: number[];
  /** Code commune -> par famille, le nombre d'annonces de chaque année. */
  comptes: Map<string, number[][]>;
  /**
   * Code commune -> les dernières annonces nommées : date, famille, nom,
   * identifiant de l'annonce, activité, et 1 pour un entrepreneur individuel.
   */
  recentes: Map<string, Recente[]>;
  /** La part des annonces qu'aucune commune ne reçoit, faute d'adresse reconnue. */
  partSansCommune: number;
}

function champs(ligne: string): string[] {
  const out: string[] = [];
  let cur = '';
  let cite = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i];
    if (ch === '"') {
      if (cite && ligne[i + 1] === '"') {
        cur += '"';
        i++;
      } else cite = !cite;
    } else if (ch === ';' && !cite) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function lignes(texte: string): string[][] {
  return texte.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(champs);
}

/**
 * Le rattachement d'une ville et d'un code postal du BODACC à un code commune.
 *
 * Le code postal d'abord, le nom quand il en couvre plusieurs. Un code Cedex
 * — « Nanterre Cedex 92741 », « Paris 8e 75380 » — ne désigne aucune commune :
 * on se rabat alors sur le nom, débarrassé de sa mention Cedex et de son
 * arrondissement, parmi les communes du même département. Ce qui reste sans
 * commune n'est pas compté, et la page le dit.
 */
export function rattacheur(index: [string, string, string, string, number][]) {
  const parCp = new Map<string, { code: string; nom: string }[]>();
  const parNom = new Map<string, { code: string; dep: string }[]>();
  for (const [code, nom, cps, dep] of index) {
    const n = normaliser(nom);
    for (const cp of cps.split(' ').filter(Boolean)) {
      if (!parCp.has(cp)) parCp.set(cp, []);
      parCp.get(cp)!.push({ code, nom: n });
    }
    if (!parNom.has(n)) parNom.set(n, []);
    parNom.get(n)!.push({ code, dep });
  }
  const nettoyer = (ville: string) =>
    normaliser(ville)
      .replace(/ cedex( \d+)?$/, '')
      .replace(/ (\d+)(e|er) arrondissement$/, '')
      .replace(/ (\d+)(e|er)$/, '');
  return (ville: string, cp: string): string | null => {
    const c = cp.trim();
    const candidats = parCp.get(c);
    const v = normaliser(ville);
    if (candidats) {
      // Une commune et ses communes déléguées partagent souvent un code : un seul code commune, c'est réglé.
      if (candidats.every((x) => x.code === candidats[0].code)) return candidats[0].code;
      const trouve = candidats.find((x) => x.nom === v) ?? candidats.find((x) => v.startsWith(x.nom));
      if (trouve) return trouve.code;
    }
    // Code inconnu, ou ambigu sans nom qui tranche : le nom seul, dans le département du code.
    const dep = c.startsWith('97') ? c.slice(0, 3) : c.startsWith('20') ? null : c.slice(0, 2);
    const parLeNom = parNom.get(nettoyer(ville))?.filter((x) => dep === null || x.dep === dep) ?? [];
    return parLeNom.length > 0 && parLeNom.every((x) => x.code === parLeNom[0].code) ? parLeNom[0].code : null;
  };
}

/**
 * La table de rattachement, tirée du découpage administratif : les communes
 * actuelles, et les communes déléguées ou associées sous le code de celle qui
 * les a reprises, et les arrondissements de Paris, Lyon et Marseille sous le
 * code de la ville. Une annonce de Lomme ou d'Hellemmes est une annonce de
 * Lille, et le BODACC écrit encore le nom de l'ancienne commune.
 */
export function indexDuDecoupage(): [string, string, string, string, number][] {
  const chemin = createRequire(import.meta.url).resolve('@etalab/decoupage-administratif/data/communes.json');
  const toutes = JSON.parse(readFileSync(chemin, 'utf8')) as {
    code: string;
    nom: string;
    type: string;
    departement?: string;
    codesPostaux?: string[];
    chefLieu?: string;
    commune?: string;
    population?: number;
  }[];
  const actuelles = new Map(toutes.filter((c) => c.type === 'commune-actuelle' && c.departement).map((c) => [c.code, c]));
  const lignes: [string, string, string, string, number][] = [];
  for (const c of toutes) {
    const parent = c.type === 'arrondissement-municipal' ? c.commune : c.chefLieu;
    const cible = c.type === 'commune-actuelle' ? c : parent ? actuelles.get(parent) : undefined;
    if (!cible?.departement) continue;
    lignes.push([cible.code, c.nom, (c.codesPostaux ?? cible.codesPostaux ?? []).join(' '), cible.departement, cible.population ?? 0]);
  }
  return lignes;
}

/**
 * Les noms d'une annonce, pris dans la liste des personnes qu'elle concerne —
 * jamais dans le champ « commerçant », qui mêle, pour une vente, le nom de la
 * société et celui d'un ancien exploitant. Une personne morale l'est par sa
 * dénomination ; un entrepreneur individuel par son prénom et son nom, tels que
 * publiés, avec son nom commercial s'il en a un, et son SIREN pour qu'on relise
 * son statut de diffusion. Une personne sans nom rend l'annonce innommable.
 */
export function nommables(listepersonnes: string): { noms: string[]; sirensPp: string[]; sirens: string[] } | null {
  let brut: unknown;
  try {
    brut = JSON.parse(listepersonnes);
  } catch {
    return null;
  }
  const p = (brut as { personne?: unknown })?.personne;
  type Personne = {
    typePersonne?: string;
    denomination?: string;
    nom?: unknown;
    prenom?: unknown;
    nomCommercial?: unknown;
    numeroImmatriculation?: { numeroIdentification?: string };
  };
  const personnes = (Array.isArray(p) ? p : p ? [p] : []) as Personne[];
  if (personnes.length === 0) return null;
  // Un champ peut être une chaîne, ou une liste quand l'annonce en porte plusieurs : on prend le premier.
  const chaine = (v: unknown): string => (Array.isArray(v) ? chaine(v[0]) : typeof v === 'string' ? v : '');
  const noms: string[] = [];
  const sirensPp: string[] = [];
  const sirens: string[] = [];
  for (const x of personnes) {
    if (x.typePersonne === 'pm') {
      const d = (x.denomination ?? '').trim();
      if (!d) return null;
      noms.push(d);
      const siren = (x.numeroImmatriculation?.numeroIdentification ?? '').replace(/\D/g, '');
      if (siren) sirens.push(siren);
    } else if (x.typePersonne === 'pp') {
      const siren = (x.numeroImmatriculation?.numeroIdentification ?? '').replace(/\D/g, '');
      const prenom = chaine(x.prenom).split(',')[0].trim();
      const nom = chaine(x.nom).trim();
      if (!/^\d{9}$/.test(siren) || !nom) return null;
      const commercial = chaine(x.nomCommercial).trim();
      noms.push(`${prenom ? `${prenom} ` : ''}${nom}${commercial ? ` (${commercial})` : ''}`);
      sirensPp.push(siren);
      sirens.push(siren);
    } else return null;
  }
  return { noms, sirensPp, sirens };
}

/** L'activité déclarée du premier établissement, coupée à un mot près. */
export function activite(listeetablissements: string): string {
  try {
    const e = (JSON.parse(listeetablissements) as { etablissement?: unknown })?.etablissement;
    const premier = (Array.isArray(e) ? e[0] : e) as { activite?: string } | undefined;
    const a = (premier?.activite ?? '').replace(/\s+/g, ' ').trim();
    if (a.length <= 90) return a;
    return `${a.slice(0, 90).replace(/\s+\S*$/, '')}…`;
  } catch {
    return '';
  }
}

/**
 * Les SIREN que le répertoire dit diffusibles, parmi ceux qu'on lui soumet.
 * Un SIREN absent de la réponse n'est pas diffusible : c'est le refus qui est
 * le cas par défaut.
 */
export async function diffusibles(texte: (url: string) => Promise<string>, sirens: string[]): Promise<Set<string>> {
  const ok = new Set<string>();
  const uniques = [...new Set(sirens)];
  for (let i = 0; i < uniques.length; i += 100) {
    const lot = uniques.slice(i, i + 100);
    const t = await texte(
      `${SIRENE}?select=${encodeURIComponent('siren, statutdiffusionunitelegale')}` +
        `&where=${encodeURIComponent(`siren in (${lot.map((x) => `"${x}"`).join(',')})`)}` +
        `&group_by=${encodeURIComponent('siren, statutdiffusionunitelegale')}&delimiter=%3B`,
    );
    const l = lignes(t);
    const [jS, jD] = ['siren', 'statutdiffusionunitelegale'].map((c) => l[0]?.indexOf(c) ?? -1);
    if (jS === -1 || jD === -1) throw new Error('SIRENE : l’export du statut de diffusion a changé de forme');
    const refuses = new Set(l.slice(1).filter((r) => r[jD] !== 'O').map((r) => r[jS]));
    for (const r of l.slice(1)) if (r[jD] === 'O' && !refuses.has(r[jS])) ok.add(r[jS]);
  }
  return ok;
}

/** Une annonce peut porter plusieurs établissements : « Tronget, Le Mayet-d'École » et « 03240, 03800 ». */
function paires(villes: string, cps: string): [string, string][] {
  const v = villes.split(', ');
  const c = cps.split(', ');
  return v.length === c.length ? v.map((x, i) => [x, c[i]]) : [[villes, cps.split(', ')[0] ?? '']];
}

export async function collecterEntreprises(
  texte: (url: string) => Promise<string>,
  index: [string, string, string, string, number][],
  dire: (m: string) => void,
  aujourdhui = new Date(),
): Promise<Entreprises | null> {
  const rattacher = rattacheur(index);
  const liste = FAMILLES.map((f) => `'${f}'`).join(',');
  const annees: number[] = [];
  for (let a = DEPUIS; a <= aujourdhui.getFullYear(); a++) annees.push(a);
  const comptes = new Map<string, number[][]>();
  let sansCommune = 0;
  let total = 0;
  // Une année par requête : les dix ensemble demandent deux minutes et demie
  // au serveur, trop près du délai au-delà duquel l'ingestion abandonne.
  for (const [a, annee] of annees.entries()) {
    const comptesCsv = lignes(
      await texte(
        `${BODACC}?select=${encodeURIComponent('ville, cp, familleavis, count(*) as n')}` +
          `&where=${encodeURIComponent(
            `familleavis in (${liste}) and dateparution >= date'${annee}-01-01' and dateparution < date'${annee + 1}-01-01'`,
          )}` +
          `&group_by=${encodeURIComponent('ville, cp, familleavis')}&delimiter=%3B`,
      ),
    );
    const e = comptesCsv[0] ?? [];
    const [iVille, iCp, iFamille, iN] = ['ville', 'cp', 'familleavis', 'n'].map((c) => e.indexOf(c));
    if ([iVille, iCp, iFamille, iN].some((i) => i === -1)) {
      dire('BODACC : l’export des décomptes a changé de forme.');
      return null;
    }
    for (const l of comptesCsv.slice(1)) {
      const f = FAMILLES.indexOf(l[iFamille] as (typeof FAMILLES)[number]);
      if (f === -1) continue;
      total += Number(l[iN]);
      for (const [ville, cp] of paires(l[iVille], l[iCp])) {
        const code = rattacher(ville, cp);
        if (!code) {
          sansCommune += Number(l[iN]);
          continue;
        }
        if (!comptes.has(code)) comptes.set(code, FAMILLES.map(() => annees.map(() => 0)));
        comptes.get(code)![f][a] += Number(l[iN]);
      }
    }
  }

  // Les annonces nommables, sur douze mois : c'est ce que la page nomme, et ce
  // que le flux de chaque commune annonce. Mois par mois, et chaque mois
  // traité aussitôt : la liste des personnes pèse, et l'année entière dépasse
  // ce qu'une chaîne JavaScript peut tenir. On en garde plus qu'il n'en faut
  // par commune : un entrepreneur que SIRENE ne dit pas diffusible laisse sa
  // place au suivant.
  type Candidate = { r: Recente; sirensPp: string[] };
  const candidates = new Map<string, Candidate[]>();
  for (let m = 0; m < 12; m++) {
    const fin = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - m + 1, 1));
    const debut = new Date(Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth() - m, 1));
    const mois = lignes(
      await texte(
        `${BODACC}?select=${encodeURIComponent('dateparution, familleavis, ville, cp, listepersonnes, listeetablissements, url_complete')}` +
          `&where=${encodeURIComponent(
            `familleavis in (${NOMMEES.map((f) => `'${f}'`).join(',')})` +
              ` and dateparution >= date'${debut.toISOString().slice(0, 10)}' and dateparution < date'${fin.toISOString().slice(0, 10)}'`,
          )}&order_by=${encodeURIComponent('dateparution desc')}&delimiter=%3B`,
      ),
    );
    const r = mois[0];
    const [jDate, jFamille, jVille, jCp, jPersonnes, jEtab, jUrl] = ['dateparution', 'familleavis', 'ville', 'cp', 'listepersonnes', 'listeetablissements', 'url_complete'].map((c) => r.indexOf(c));
    if ([jDate, jFamille, jVille, jCp, jPersonnes, jEtab, jUrl].some((i) => i === -1)) {
      dire('BODACC : l’export des annonces a changé de forme.');
      return null;
    }
    for (const l of mois.slice(1)) {
      const f = FAMILLES.indexOf(l[jFamille] as (typeof FAMILLES)[number]);
      const n = nommables(l[jPersonnes]);
      if (f === -1 || !n) continue;
      // Une opposition reçue : l'annonce reste comptée, elle n'est plus nommée.
      if (n.sirens.some((x) => retraits().entreprises.has(x))) continue;
      // L'identifiant seul : le lien se reconstruit, et le préfixe répété pèserait
      // plus lourd que tout le reste du fichier.
      const id = /[?&]q\.id=id:([A-Z0-9]+)$/.exec(l[jUrl])?.[1];
      if (!id) continue;
      const ei: 0 | 1 = n.sirensPp.length > 0 ? 1 : 0;
      for (const [ville, cp] of paires(l[jVille], l[jCp])) {
        const code = rattacher(ville, cp);
        if (!code) continue;
        const liste = candidates.get(code) ?? [];
        // Une annonce qui cite deux établissements de la même commune n'y compte qu'une fois.
        if (liste.length < RECENTES * 3 && !liste.some((x) => x.r[3] === id)) {
          liste.push({ r: [l[jDate], f, n.noms.join(', '), id, activite(l[jEtab]), ei], sirensPp: n.sirensPp });
        }
        candidates.set(code, liste);
      }
    }
  }

  // Le statut de diffusion de chaque entrepreneur candidat, relu dans SIRENE.
  const aVerifier = [...candidates.values()].flatMap((l) => l.flatMap((x) => x.sirensPp));
  const ok = await diffusibles(texte, aVerifier);
  const recentes = new Map<string, Recente[]>();
  let nommees = 0;
  let entrepreneurs = 0;
  let tus = 0;
  for (const [code, liste] of candidates) {
    const gardees: Recente[] = [];
    for (const { r, sirensPp } of liste) {
      if (gardees.length >= RECENTES) break;
      if (sirensPp.some((x) => !ok.has(x))) {
        tus++;
        continue;
      }
      gardees.push(r);
      nommees++;
      if (r[5] === 1) entrepreneurs++;
    }
    if (gardees.length) recentes.set(code, gardees);
  }
  dire(
    `BODACC : ${comptes.size.toLocaleString('fr-FR')} communes, de ${DEPUIS} à ${annees[annees.length - 1]} ; ` +
      `${nommees.toLocaleString('fr-FR')} annonces nommées sur douze mois, dont ${entrepreneurs.toLocaleString('fr-FR')} d’entrepreneurs individuels ; ` +
      `${tus.toLocaleString('fr-FR')} écartées faute de diffusion au répertoire SIRENE (${new Set(aVerifier).size.toLocaleString('fr-FR')} SIREN relus) ; ` +
      `${sansCommune.toLocaleString('fr-FR')} annonces sans commune reconnue, soit ` +
      `${total > 0 ? ((sansCommune / total) * 100).toFixed(1) : 0} %.`,
  );
  return {
    maj: aujourdhui.toISOString().slice(0, 10),
    annees,
    comptes,
    recentes,
    partSansCommune: total > 0 ? Math.round((sansCommune / total) * 1000) / 10 : 0,
  };
}

function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

export function ecrireEntreprises(sortie: string, e: Entreprises): number {
  const parDep = new Map<string, Record<string, unknown>>();
  for (const code of [...new Set([...e.comptes.keys(), ...e.recentes.keys()])].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = [e.comptes.get(code) ?? null, e.recentes.get(code) ?? []];
  }
  mkdirSync(join(sortie, 'dep'), { recursive: true });
  for (const [dep, c] of parDep) {
    // Seulement les départements que le site décrit : Saint-Martin ou la
    // Polynésie ont leurs annonces, pas de page de commune pour les recevoir.
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) {
      parDep.delete(dep);
      continue;
    }
    writeFileSync(
      join(sortie, 'dep', `${dep}-entreprises.json`),
      JSON.stringify({ maj: e.maj, annees: e.annees, familles: FAMILLES, sansCommune: e.partSansCommune, c }),
    );
  }
  return parDep.size;
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const sortie = join(racine, 'public', 'territoires');
  const index = indexDuDecoupage();
  const texte = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    return r.text();
  };
  const e = await collecterEntreprises(texte, index, console.log);
  if (e) console.log(`${ecrireEntreprises(sortie, e)} départements écrits.`);
}
