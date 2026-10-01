/**
 * Ce que l'État a décidé pour la commune sans qu'elle le demande toujours :
 * les programmes de l'Agence nationale de la cohésion des territoires (ANCT)
 * dont elle bénéficie, et son classement en zone de montagne.
 *
 * **Les programmes.** L'ANCT publie un jeu par programme, chacun avec sa
 * liste de communes : Petites villes de demain, Action cœur de ville,
 * Villages d'avenir, Territoires d'industrie, contrats pour la réussite de la
 * transition écologique (CRTE). Les programmes plus petits — Avenir montagnes,
 * cités éducatives, cités de l'emploi, Fabriques prospectives, habitat
 * inclusif — ne sont réunis que dans son tableau de croisement des
 * dispositifs, mis à jour moins souvent. Chaque liste est lue dans sa dernière
 * version, cherchée dans le jeu de données.
 *
 * France services est exclu : le bloc des services publics situe déjà la
 * structure. France ruralités revitalisation (l'ancien zonage de
 * revitalisation rurale) aussi : aucune liste nationale ouverte, seulement des
 * listes départementales.
 *
 * **La zone de montagne.** La loi Montagne (loi n° 85-30 du 9 janvier 1985,
 * article 3) délimite la zone par arrêté, en renvoyant aux arrêtés pris pour
 * les zones agricoles défavorisées ; la liste du ministère de l'Agriculture
 * range ces communes sous l'article 18. Elle date de 2017 : une commune
 * nouvelle formée depuis est en zone de montagne si l'une de ses anciennes
 * communes l'était, « en partie » si toutes ne l'étaient pas.
 *
 * **Le zonage ABC** classe les communes selon le déséquilibre entre l'offre et
 * la demande de logements — A bis, A, B1, B2, C, par tension décroissante —,
 * d'après la liste du ministère chargé du logement ; il règle l'accès au prêt
 * à taux zéro, aux aides à l'investissement locatif et leurs plafonds.
 * **Les quartiers prioritaires** de la politique de la ville (2024) : leur
 * liste, par commune, d'après l'ANCT ; un quartier à cheval sur deux
 * communes compte dans chacune.
 *
 * Lancé seul — `tsx scripts/zonages-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-zonages.json`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEUX = {
  pvd: '5fc1259b703620ed60a49d97',
  acv: '5acc7eddc751df5e21efdf20',
  va: '65a11234a86f08c56f0c47b0',
  ti: '5fc1472f114718d419e42f8a',
  crte: '60799532757dbdef335c00c5',
  croisement: '617322c7c8e7b27041570e71',
  abc: '656715871172d08f8f680063',
  qpv: '5a561801c751df42d7fca9b6',
} as const;
export const MONTAGNE =
  'https://agriculture.gouv.fr/telecharger/119649?token=546df48fb3ab2cf098f40d87928c6013edeaa8116e31dfa6be1e582ec0032c85';

/** Les programmes lus dans le tableau de croisement, par sa colonne. */
const DU_CROISEMENT = { ami: 'id_ami', amm: 'id_amm', cite: 'id_cite', cde: 'id_cde', fabp: 'id_fabp', habinclus: 'id_habinclus' } as const;
export type Programme = 'pvd' | 'acv' | 'va' | keyof typeof DU_CROISEMENT;

/**
 * Par commune : ses programmes, le nom de son Territoire d'industrie et de son
 * CRTE (vides s'il n'y en a pas), la montagne — 0 non, 1 oui, 2 en partie —,
 * sa zone ABC (vide si inconnue) et le nom de ses quartiers prioritaires.
 */
export type ZonagesCommune = [Programme[], string, string, 0 | 1 | 2, string, string[]];

export interface Zonages {
  maj: string;
  /** La date de chaque liste, telle que data.gouv la donne. */
  dates: Record<string, string>;
  communes: Map<string, ZonagesCommune>;
}

type Ressource = { title?: string; url?: string; format?: string; last_modified?: string };

/** La liste des communes d'un jeu de l'ANCT, dans sa version la plus récente. */
async function listeCommunes(
  lireJson: (url: string) => Promise<unknown>,
  jeu: string,
  motif: RegExp,
): Promise<{ url: string; date: string }> {
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${jeu}/resources/?page_size=50`)) as { data?: Ressource[] };
  const candidates = (r.data ?? [])
    .filter((x) => x.url && /csv/i.test(x.format ?? '') && motif.test(x.title ?? '') && !/2018-2023/.test(x.title ?? ''))
    .sort((a, b) => (b.last_modified ?? '').localeCompare(a.last_modified ?? ''));
  const c = candidates[0];
  if (!c) throw new Error(`ANCT ${jeu} : aucune liste de communes`);
  return { url: c.url!, date: (c.last_modified ?? '').slice(0, 10) };
}

async function* lignes(chemin: string, separateur: ',' | ';') {
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv([readFileSync(chemin, 'utf8')], separateur)) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim().replace(/^﻿/, ''), i]));
      continue;
    }
    const lire = (nom: string) => (col![nom] === undefined ? undefined : (v[col![nom]] ?? '').trim());
    // Une colonne dont le nom change — il porte une date —, cherchée par motif.
    lire.colonne = (motif: RegExp) => {
      const nom = Object.keys(col!).find((n) => motif.test(n));
      return nom === undefined ? undefined : (v[col![nom]] ?? '').trim();
    };
    yield lire;
  }
}

export async function collecterZonages(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Zonages | null> {
  const { actuelles, reports } = reportsDuDecoupage();
  const actuelle = (brut: string) => {
    const c = communeDe(brut);
    return actuelles.has(c) ? c : (reports.get(c) ?? null);
  };
  const programmes = new Map<string, Set<Programme>>();
  const ajouter = (code: string | null, p: Programme) => {
    if (!code) return;
    const s = programmes.get(code) ?? new Set<Programme>();
    s.add(p);
    programmes.set(code, s);
  };
  const dates: Record<string, string> = {};
  const lire = async (cle: string, jeu: string, motif: RegExp) => {
    const { url, date } = await listeCommunes(lireJson, jeu, motif);
    dates[cle] = date;
    const vers = join(cache, `anct-${cle}-${date}.csv`);
    await telecharger(url, vers);
    return vers;
  };

  // Les trois programmes de commune, chacun sa liste.
  for (const p of ['pvd', 'acv', 'va'] as const) {
    const vers = await lire(p, JEUX[p], /liste des communes/i);
    let n = 0;
    for await (const v of lignes(vers, ',')) {
      ajouter(actuelle(v('insee_com') ?? ''), p);
      n++;
    }
    if (n < { pvd: 1000, acv: 200, va: 2000 }[p]) {
      dire(`Zonages : ${n} communes seulement pour ${p}, on garde l’ingestion précédente.`);
      return null;
    }
  }

  // Territoires d'industrie et CRTE : le nom du territoire, commune par commune.
  const nomDe = new Map<string, [string, string]>();
  const nommer = (code: string | null, i: 0 | 1, nom: string) => {
    if (!code || !nom) return;
    const x = nomDe.get(code) ?? ['', ''];
    x[i] = nom;
    nomDe.set(code, x);
  };
  const ti = await lire('ti', JEUX.ti, /liste des communes couvertes/i);
  for await (const v of lignes(ti, ',')) nommer(actuelle(v('insee_com') ?? ''), 0, v('lib_ti') ?? '');
  // La liste des communes des CRTE ne porte que l'identifiant : le nom vient de la liste des contrats.
  const crteNoms = new Map<string, string>();
  {
    const { url, date } = await listeCommunes(lireJson, JEUX.crte, /liste des contrats/i);
    const vers = join(cache, `anct-crte-noms-${date}.csv`);
    await telecharger(url, vers);
    for await (const v of lignes(vers, ',')) crteNoms.set(v('id_crte') ?? '', v('lib_crte') ?? '');
  }
  const crte = await lire('crte', JEUX.crte, /liste des communes couvertes/i);
  for await (const v of lignes(crte, ',')) nommer(actuelle(v('insee_com') ?? ''), 1, crteNoms.get(v('id_crte') ?? '') ?? '');

  // Les petits programmes, depuis le tableau de croisement.
  const croisement = await lire('croisement', JEUX.croisement, /croisement/i);
  for await (const v of lignes(croisement, ';')) {
    const code = actuelle(v('insee_com') ?? '');
    for (const [p, colonne] of Object.entries(DU_CROISEMENT) as [Programme, string][]) {
      if (v(colonne)) ajouter(code, p);
    }
  }

  // La zone de montagne : les anciennes communes classées sous l'article 18.
  const zd = join(cache, 'agriculture-zones-defavorisees-2017.xls');
  await telecharger(MONTAGNE, zd);
  const feuille = XLSX.read(readFileSync(zd)).Sheets;
  const lignesZd = XLSX.utils.sheet_to_json<unknown[]>(Object.values(feuille)[0], { header: 1 });
  const entete = lignesZd.findIndex((l) => Array.isArray(l) && l[0] === 'Code Commune');
  if (entete < 0) throw new Error('zones défavorisées : en-tête « Code Commune » introuvable');
  const iArticle = (lignesZd[entete] as string[]).indexOf('Classement par article');
  const iPartie = (lignesZd[entete] as string[]).indexOf('Partie de commune');
  const classees = new Map<string, boolean>(); // ancienne commune → entière ?
  for (const l of lignesZd.slice(entete + 1)) {
    const code = String(l[0] ?? '').trim();
    if (!/^\d[\dAB]\d{3}$/.test(code) || String(l[iArticle] ?? '').trim() !== 'Art 18') continue;
    classees.set(code, !String(l[iPartie] ?? '').trim());
  }
  if (classees.size < 5000) {
    dire(`Zonages : ${classees.size} communes de montagne seulement, on garde l’ingestion précédente.`);
    return null;
  }
  // Pour chaque commune actuelle, ses anciennes communes : elle-même et celles qui s'y reportent.
  const anciennes = new Map<string, string[]>();
  for (const c of actuelles) anciennes.set(c, [c]);
  for (const [vieux, neuf] of reports) anciennes.get(neuf)?.push(vieux);
  const montagne = new Map<string, 1 | 2>();
  for (const [code, liste] of anciennes) {
    const dedans = liste.filter((x) => classees.has(x));
    if (dedans.length === 0) continue;
    // Les anciennes communes absentes de la liste de 2017 parce que déjà fusionnées n'y figurent
    // pas : seules celles qui y sont comptent pour dire « en partie ».
    const connues = liste.filter((x) => classees.has(x) || x === code);
    const entiere = dedans.length === connues.length && dedans.every((x) => classees.get(x));
    montagne.set(code, entiere ? 1 : 2);
  }

  // Le zonage ABC : la liste complète en vigueur, la plus récente.
  const abc = new Map<string, string>();
  {
    const vers = await lire('abc', JEUX.abc, /^liste ensemble des communes/i);
    for await (const v of lignes(vers, ';')) {
      const code = actuelle(v('CODGEO') ?? '');
      // La colonne porte la date dans son nom : « Zonage ABC en vigueur depuis le 26 juin 2026 ».
      const zone = (v.colonne(/^zonage abc/i) ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
      if (code && /^(A BIS|ABIS|A|B1|B2|C)$/.test(zone)) abc.set(code, zone.replace('ABIS', 'A BIS'));
    }
    if (abc.size < 30000) {
      dire(`Zonages : ${abc.size} communes seulement au zonage ABC, on garde l’ingestion précédente.`);
      return null;
    }
  }
  // Les quartiers prioritaires de 2024, par commune.
  const qpv = new Map<string, string[]>();
  {
    const vers = await lire('qpv', JEUX.qpv, /liste des quartiers prioritaires de la politique de la ville 2024/i);
    let n = 0;
    for await (const v of lignes(vers, ';')) {
      const nom = (v('lib_qp') ?? '').trim();
      // « ="03095;03310" » : le code est protégé contre les tableurs, et un quartier peut couvrir deux communes.
      for (const brut of (v('insee_com') ?? '').replace(/[^\d;AB]/g, '').split(';')) {
        const code = actuelle(brut);
        if (!code || !nom) continue;
        qpv.set(code, [...(qpv.get(code) ?? []), nom]);
      }
      n++;
    }
    if (n < 1000) {
      dire(`Zonages : ${n} quartiers prioritaires seulement, on garde l’ingestion précédente.`);
      return null;
    }
  }

  const communes = new Map<string, ZonagesCommune>();
  const ordre: Programme[] = ['pvd', 'acv', 'va', 'ami', 'amm', 'cite', 'cde', 'fabp', 'habinclus'];
  for (const code of actuelles) {
    const p = programmes.get(code);
    const [nomTi, nomCrte] = nomDe.get(code) ?? ['', ''];
    const m = montagne.get(code) ?? 0;
    const zone = abc.get(code) ?? '';
    const quartiers = (qpv.get(code) ?? []).sort((x, y) => x.localeCompare(y, 'fr'));
    if (!p && !nomTi && !nomCrte && !m && !zone && quartiers.length === 0) continue;
    communes.set(code, [ordre.filter((x) => p?.has(x)), nomTi, nomCrte, m, zone, quartiers]);
  }
  const compte = (p: Programme) => [...communes.values()].filter((x) => x[0].includes(p)).length;
  dire(
    `Zonages : ${communes.size.toLocaleString('fr-FR')} communes ; Petites villes de demain ${compte('pvd')}, ` +
      `Action cœur de ville ${compte('acv')}, Villages d’avenir ${compte('va')}, ` +
      `zone de montagne ${montagne.size.toLocaleString('fr-FR')}, zonage ABC ${abc.size.toLocaleString('fr-FR')}, ` +
      `communes à quartier prioritaire ${qpv.size.toLocaleString('fr-FR')}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), dates, communes };
}

export function ecrireZonages(sortie: string, z: Zonages): number {
  return ecrireParDepartement(sortie, 'zonages', z.communes, () => ({ maj: z.maj, dates: z.dates }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const z = await collecterZonages(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (z) console.log(`${ecrireZonages(sortie, z)} départements écrits.`);
}
