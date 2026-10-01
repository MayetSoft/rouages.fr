/**
 * Le dernier scrutin municipal, commune par commune.
 *
 * Le site dit qui décide ; celui-ci dit dans quelles conditions ce décideur a
 * été désigné. C'est le pendant civique du bloc « qui est le maire » : combien
 * d'électeurs se sont déplacés, combien ont glissé un bulletin blanc ou nul,
 * combien de listes se présentaient, et combien de sièges le conseil compte —
 * au conseil municipal comme au conseil communautaire.
 *
 * **Les listes, avec leur nuance, depuis le 1er octobre 2026.** Le module
 * taisait les nuances : relier une personne à une opinion était exclu. La
 * décision du 1er octobre 2026 (`CLAUDE.md`, « Les noms dans les données ») les
 * rend : un candidat a choisi de se présenter, la nuance est l'attribution
 * publique du ministère, et la page la donne comme telle — le libellé du
 * référentiel, jamais un commentaire. Le préfet n'en attribue que dans les
 * communes de 3 500 habitants et plus et les chefs-lieux d'arrondissement :
 * ailleurs, la liste a son nom et pas de nuance, et la page ne la devine pas.
 * Le fichier des résultats ne porte pas le nom des têtes de liste — ses
 * colonnes « Nom candidat » sont vides. Il vient du fichier des candidatures
 * du premier tour, rapproché sur la commune et le numéro de panneau, **et**
 * sur le libellé abrégé de la liste : une liste fusionnée au second tour, qui
 * change de libellé, reste sans tête plutôt que d'en recevoir une fausse.
 *
 * Ce qui reste est structurel et se compare : la participation, le refus
 * exprimé par un bulletin blanc ou nul, le nombre de listes en présence, et le
 * poids de la commune dans son intercommunalité.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Municipales 2026. L'adresse porte l'horodatage de la publication, si bien
 * qu'elle changera au prochain scrutin : la veille surveille le jeu de données
 * plutôt que le fichier, pour que sa disparition se voie au lieu de se deviner.
 */
const SCRUTIN = 'municipales 2026';
const TOURS = [
  {
    tour: 1,
    url:
      'https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-premier-tour/' +
      '20260320-164339/municipales-2026-resultats-communes-2026-03-20.csv',
  },
  {
    tour: 2,
    url:
      'https://static.data.gouv.fr/resources/elections-municipales-2026-resultats-du-scond-tour/' +
      '20260323-180124/municipales-2026-resultats-communes-2026-03-23-16h14.csv',
  },
] as const;

/** Un tour, tel qu'il se lit pour une commune. */
export interface TourCommune {
  inscrits: number;
  votants: number;
  exprimes: number;
  /** Blancs et nuls confondus : ils disent la même chose — être venu sans choisir. */
  refus: number;
  /**
   * Les deux, séparés. Le blanc est un choix déclaré — une enveloppe vide ou
   * un bulletin blanc —, le nul souvent un bulletin raturé ou annoté : au
   * Mayet-de-Montagne, en 2026, 41 blancs et 124 nuls.
   */
  blancs: number;
  nuls: number;
  /** Combien de listes se présentaient. Une seule dans deux communes sur trois. */
  listes: number;
  /**
   * Les voix de la liste arrivée en tête. Rapportées aux inscrits, elles
   * disent quelle part du corps électoral a choisi la liste qui tient le
   * conseil — la prime majoritaire lui donne la moitié des sièges, qu'elle ait
   * réuni 30 % des inscrits ou 80 %.
   */
  tete: number;
  /**
   * Les listes, dans l'ordre des voix : libellé, code de nuance (vide là où
   * le préfet n'en attribue pas), voix, sièges au conseil municipal, et la
   * tête de liste (« Prénom NOM »), vide quand le rapprochement échoue.
   */
  l?: [string, string, number, number, string?][];
}

export interface ElectionCommune {
  t1: TourCommune;
  /** Le second tour, dans les 1 526 communes qui en ont eu un. */
  t2?: TourCommune;
  /** Le tour qui a attribué les sièges : le premier, ou le second là où il a eu lieu. */
  decisif: 1 | 2;
  /** Sièges au conseil municipal. */
  cm: number;
  /** Sièges de la commune au conseil communautaire : son poids dans l'intercommunalité. */
  cc: number;
}

export interface Elections {
  scrutin: string;
  maj: string;
  /** Repères nationaux, tour par tour : un taux seul ne se discute pas. */
  medianes: { participation: number; refus: number }[];
  /** Part des communes où une seule liste se présentait au premier tour. */
  partListeUnique: number;
  /** La médiane nationale des voix de la liste en tête, en part des inscrits, au tour décisif. */
  medianeTete: number;
  /** Le libellé de chaque code de nuance, d'après le référentiel du ministère. */
  nuances: Record<string, string>;
  communes: Map<string, ElectionCommune>;
}

/** Les candidatures du premier tour : une ligne par candidat, la tête de liste marquée « OUI ». */
const CANDIDATURES =
  'https://static.data.gouv.fr/resources/elections-municipales-2026-listes-candidates-au-premier-tour/' +
  '20260313-152615/municipales-2026-candidatures-france-entiere-tour-1-2026-03-13.csv';

/** « commune|panneau » → [libellé abrégé, « Prénom NOM »]. */
export function lireTetes(texte: string): Map<string, [string, string]> {
  const tetes = new Map<string, [string, string]>();
  for (const r of lireCsv(texte)) {
    if ((r['Tête de liste'] ?? '').trim() !== 'OUI') continue;
    const code = (r['Code circonscription'] ?? '').trim();
    const panneau = (r['Numéro de panneau'] ?? '').trim();
    const nom = `${(r['Prénom sur le bulletin de vote'] ?? '').trim()} ${(r['Nom sur le bulletin de vote'] ?? '').trim()}`.trim();
    if (code && panneau && nom) tetes.set(`${code}|${panneau}`, [(r['Libellé abrégé de liste'] ?? '').trim(), nom]);
  }
  return tetes;
}

/** Le référentiel des nuances du scrutin, publié par le ministère à côté des résultats. */
const NUANCES = 'https://www.resultats-elections.interieur.gouv.fr/telechargements/MUNPF2026/nuances/nuances.xml';

/** `<NuanceListe><CodNuaListe>LDVD</CodNuaListe><LibNuaListe>Liste divers droite</LibNuaListe>…` */
export function lireNuances(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<NuanceListe>\s*<CodNuaListe>([^<]+)<\/CodNuaListe>\s*<LibNuaListe>([^<]+)<\/LibNuaListe>/g)) {
    out[m[1].trim()] = m[2].trim().replace(/&apos;/g, '’').replace(/'/g, '’').replace(/&amp;/g, '&');
  }
  return out;
}

/**
 * Le fichier du ministère : point-virgule, guillemets, et un bloc de colonnes
 * répété autant de fois qu'il y a de listes — jusqu'à treize.
 */
function lireCsv(texte: string): Record<string, string>[] {
  const lignes = texte.split(/\r?\n/);
  const entetes = decouper(lignes.shift() ?? '');
  const out: Record<string, string>[] = [];
  for (const l of lignes) {
    if (!l.trim()) continue;
    const champs = decouper(l);
    if (champs.length < 5) continue;
    const r: Record<string, string> = {};
    for (const [i, h] of entetes.entries()) r[h] = champs[i] ?? '';
    out.push(r);
  }
  return out;
}

function decouper(ligne: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else dansGuillemets = !dansGuillemets;
    } else if (c === ';' && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

const entier = (v: string | undefined): number => {
  const n = Number.parseInt((v ?? '').replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

/** La médiane d'une série, ou 0 quand elle est vide. */
function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0;
  const t = [...valeurs].sort((a, b) => a - b);
  return Math.round(t[Math.floor(t.length / 2)] * 10) / 10;
}

/**
 * Le nombre de listes, et les sièges qu'elles ont obtenus.
 *
 * Les colonnes sont numérotées : `Voix 1`, `Voix 2`… On s'arrête à la première
 * absente plutôt que de fixer un maximum, parce que le ministère en ajoute
 * autant que nécessaire — treize dans la commune la plus disputée.
 */
function listesDe(r: Record<string, string>, tetes: Map<string, [string, string]> = new Map()): {
  listes: number;
  cm: number;
  cc: number;
  tete: number;
  teteIns: number | null;
  l: [string, string, number, number, string?][];
  tetesTrouvees: number;
} {
  const l: [string, string, number, number, string?][] = [];
  let tetesTrouvees = 0;
  const code = (r['Code commune'] ?? '').trim();
  let listes = 0;
  let cm = 0;
  let cc = 0;
  let tete = 0;
  let teteIns: number | null = null;
  for (let i = 1; ; i++) {
    if (r[`Voix ${i}`] === undefined) break;
    if ((r[`Voix ${i}`] ?? '').trim() === '') continue;
    listes++;
    cm += entier(r[`Sièges au CM ${i}`]);
    cc += entier(r[`Sièges au CC ${i}`]);
    const voix = entier(r[`Voix ${i}`]);
    const libelle = (r[`Libellé de liste ${i}`] || r[`Libellé abrégé de liste ${i}`] || '').trim();
    const ligne: [string, string, number, number, string?] = [libelle, (r[`Nuance liste ${i}`] ?? '').trim(), voix, entier(r[`Sièges au CM ${i}`])];
    const t = tetes.get(`${code}|${(r[`Numéro de panneau ${i}`] ?? '').trim()}`);
    if (t && t[0] === (r[`Libellé abrégé de liste ${i}`] ?? '').trim()) {
      ligne.push(t[1]);
      tetesTrouvees++;
    }
    l.push(ligne);
    if (voix > tete) {
      tete = voix;
      // Le pourcentage que publie le ministère, pour recouper le nôtre.
      const p = Number.parseFloat((r[`% Voix/inscrits ${i}`] ?? '').replace('%', '').replace(',', '.'));
      teteIns = Number.isFinite(p) ? p : null;
    }
  }
  l.sort((a, b) => b[2] - a[2]);
  return { listes, cm, cc, tete, teteIns, l, tetesTrouvees };
}

export async function collecterElections(
  texteDe: (url: string) => Promise<string>,
  dire: (m: string) => void,
): Promise<Elections | null> {
  const communes = new Map<string, ElectionCommune>();
  let nuances: Record<string, string> = {};
  try {
    nuances = lireNuances(await texteDe(NUANCES));
  } catch {
    // Sans le référentiel, la page montre le code, comme aux législatives.
  }
  if (Object.keys(nuances).length === 0) dire('Élections : le référentiel des nuances n’a pas répondu, les codes seront montrés seuls.');
  let tetes = new Map<string, [string, string]>();
  try {
    tetes = lireTetes(await texteDe(CANDIDATURES));
  } catch {
    dire('Élections : les candidatures n’ont pas répondu, les listes resteront sans tête.');
  }
  let tetesTrouvees = 0;
  let listesVues = 0;
  const medianes: { participation: number; refus: number }[] = [];
  let listeUnique = 0;
  let ecarts = 0;
  let recoupees = 0;

  for (const { tour, url } of TOURS) {
    let lignes: Record<string, string>[];
    try {
      lignes = lireCsv(await texteDe(url));
    } catch {
      dire(`Élections : le tour ${tour} n'a pas répondu.`);
      // Un second tour manquant laisse le premier en place ; un premier tour
      // manquant ne laisse rien, et mieux vaut alors ne rien écrire du tout.
      if (tour === 1) return null;
      continue;
    }
    if (lignes.length === 0) {
      if (tour === 1) return null;
      continue;
    }

    const participations: number[] = [];
    const refus: number[] = [];
    for (const l of lignes) {
      const code = (l['Code commune'] ?? '').trim();
      if (code.length !== 5) continue;
      const inscrits = entier(l['Inscrits']);
      const votants = entier(l['Votants']);
      const t: TourCommune = {
        inscrits,
        votants,
        exprimes: entier(l['Exprimés']),
        refus: entier(l['Blancs']) + entier(l['Nuls']),
        blancs: entier(l['Blancs']),
        nuls: entier(l['Nuls']),
        listes: 0,
        tete: 0,
      };
      const { listes, cm, cc, tete, teteIns, l: parListe, tetesTrouvees: tt } = listesDe(l, tetes);
      tetesTrouvees += tt;
      listesVues += listes;
      t.listes = listes;
      t.tete = tete;
      t.l = parListe;
      if (teteIns !== null && inscrits > 0) {
        recoupees++;
        if (Math.abs((tete / inscrits) * 100 - teteIns) > 0.01) ecarts++;
      }
      if (inscrits > 0) participations.push((votants / inscrits) * 100);
      if (votants > 0) refus.push((t.refus / votants) * 100);

      if (tour === 1) {
        if (listes === 1) listeUnique++;
        communes.set(code, { t1: t, decisif: 1, cm, cc });
      } else {
        const deja = communes.get(code);
        if (!deja) continue;
        deja.t2 = t;
        // Les sièges ne sont attribués qu'au tour qui élit le conseil : dans
        // ces 1 526 communes, le premier tour en a attribué zéro.
        if (cm > 0) {
          deja.cm = cm;
          deja.decisif = 2;
        }
        if (cc > 0) deja.cc = cc;
      }
    }
    medianes[tour - 1] = {
      participation: mediane(participations),
      refus: mediane(refus),
    };
    dire(
      `  tour ${tour} : ${lignes.length.toLocaleString('fr-FR')} communes, ` +
        `participation médiane ${medianes[tour - 1].participation} %, ` +
        `blancs et nuls ${medianes[tour - 1].refus} %.`,
    );
  }

  dire(`  têtes de liste : ${tetesTrouvees.toLocaleString('fr-FR')} rapprochées sur ${listesVues.toLocaleString('fr-FR')} listes, aux deux tours.`);
  const partListeUnique = communes.size > 0 ? Math.round((listeUnique / communes.size) * 100) : 0;
  // Au tour qui a attribué les sièges : c'est la liste arrivée en tête de
  // celui-là qui tient le conseil.
  const parts: number[] = [];
  for (const c of communes.values()) {
    const t = c.decisif === 2 && c.t2 ? c.t2 : c.t1;
    if (t.inscrits > 0 && t.tete > 0) parts.push((t.tete / t.inscrits) * 100);
  }
  const medianeTete = mediane(parts);
  if (ecarts > 0) dire(`Élections : ${ecarts} communes où nos voix sur inscrits s'écartent de celles du ministère.`);
  dire(
    `  liste en tête : médiane ${medianeTete} % des inscrits au tour décisif ; ` +
      `${recoupees.toLocaleString('fr-FR')} pourcentages recoupés avec ceux du ministère.`,
  );
  dire(
    `Élections (${SCRUTIN}) : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${listeUnique.toLocaleString('fr-FR')} avec une seule liste au premier tour (${partListeUnique} %).`,
  );
  return {
    scrutin: SCRUTIN,
    maj: new Date().toISOString().slice(0, 10),
    medianes,
    partListeUnique,
    medianeTete,
    nuances,
    communes,
  };
}

/**
 * Un fichier par département. Les repères nationaux y sont recopiés — quelques
 * dizaines d'octets — pour que le fichier se suffise à lui-même.
 */
export function ecrireElections(
  sortie: string,
  dep: string,
  codes: string[],
  e: Elections,
): number {
  const c: Record<string, ElectionCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const fiche = e.communes.get(code);
    if (!fiche) continue;
    c[code] = fiche;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-elections.json`),
    JSON.stringify({
      scrutin: e.scrutin,
      maj: e.maj,
      medianes: e.medianes,
      listeUnique: e.partListeUnique,
      medianeTete: e.medianeTete,
      nuances: e.nuances,
      c,
    }),
  );
  return n;
}

// Lancé seul : lit les résultats dans `.cache/munic-t1.csv` et `munic-t2.csv`
// s'ils y sont, sinon sur data.gouv.fr, et réécrit `dep/XX-elections.json`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const sortie = join(racine, 'public', 'territoires');
  const local = new Map<string, string>([
    ...TOURS.map((t): [string, string] => [t.url, join(racine, '.cache', `munic-t${t.tour}.csv`)]),
    [CANDIDATURES, join(racine, '.cache', 'munic-candidatures.csv')],
  ]);
  const texte = async (url: string) => {
    const f = local.get(url);
    if (f && existsSync(f)) return readFileSync(f, 'utf8');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    return r.text();
  };
  const e = await collecterElections(texte, console.log);
  if (e) {
    const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { c: [string, string, string, string, number][] };
    const parDep = new Map<string, string[]>();
    for (const [code, , , dep] of index.c) parDep.set(dep, [...(parDep.get(dep) ?? []), code]);
    let n = 0;
    for (const [dep, codes] of parDep) n += ecrireElections(sortie, dep, codes, e);
    console.log(`${n} communes écrites, ${Object.keys(e.nuances).length} nuances au référentiel.`);
  }
}
