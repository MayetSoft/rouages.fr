/**
 * Résolution territoriale : « chez moi, qui fait quoi ? »
 *
 * Le site répond partout « variable selon le territoire ». C'est honnête, et
 * c'est une impasse pour l'usager. Or la réponse est calculable : BANATIC
 * publie, pour chaque groupement de communes, les compétences que ses membres
 * lui ont transférées.
 *
 * Ce script fait la jointure une fois pour toutes et écrit le résultat dans le
 * dépôt. Le site n'appelle donc aucune API : il lit des fichiers versionnés.
 * C'est plus lourd à rafraîchir, et c'est le prix d'un build reproductible,
 * hors ligne, et dont la donnée est relisible dans un diff.
 *
 *   npm run territoires            rafraîchit à partir des sources
 *   npm run territoires -- --cache  réutilise le fichier déjà téléchargé
 *
 * Prérequis : `unzip` (l'export national fait 1,4 Go décompressé, on le lit en
 * flux plutôt que de le charger en mémoire).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chargerGraphe, RACINE } from '../src/modele/graphe.ts';

// Le `fetch` intégré de Node ne lit la configuration de proxy qu'à son
// démarrage : la poser depuis le script serait trop tard. Quand on tourne
// derrière un proxy sans elle, on se relance une fois, avec.
if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== '1') {
  const { status } = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(status ?? 1);
}

const EXPORT_NATIONAL =
  'https://www.banatic.interieur.gouv.fr/consultation/api/export/pregenere/telecharger/France';
const REFERENTIEL =
  'https://www.banatic.interieur.gouv.fr/consultation/api/referentiel/competence/all';
const REFERENTIEL_NATURES =
  'https://www.banatic.interieur.gouv.fr/consultation/api/referentiel/nature-juridique';

const CACHE = join(RACINE, '.cache');
const SORTIE = join(RACINE, 'public', 'territoires');
const XLSX = join(CACHE, 'banatic-france.xlsx');
const FINESS_CACHE = join(CACHE, 't-finess.csv');

const VERT = '\x1b[32m', JAUNE = '\x1b[33m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
const dire = (m: string) => console.log(m);

/** Le tunnel du proxy lâche par intermittence : on réessaie plutôt que d'abandonner. */
async function obstine(url: string, essais = 8): Promise<Response> {
  let derniere: unknown;
  for (let i = 0; i < essais; i++) {
    try {
      // Le catalogue de l'OFB refuse l'en-tête de langue par défaut de Node
      // (« Couldn't find 3-letter language code for * ») : on en pose un.
      const r = await fetch(url, {
        headers: { 'accept-language': 'fre' },
        signal: AbortSignal.timeout(180_000),
      });
      if (r.ok) return r;
      derniere = new Error(`HTTP ${r.status}`);
    } catch (e) {
      derniere = e;
    }
    await new Promise((r) => setTimeout(r, (i + 1) * 2000));
  }
  throw new Error(`${url} : ${(derniere as Error)?.message ?? 'injoignable'}`);
}

/**
 * Une collecte facultative qui échoue ne doit pas jeter l'ingestion entière.
 *
 * Le rapatriement complet dure une dizaine de minutes et touche huit sources.
 * Qu'une seule soit momentanément injoignable — c'est arrivé sur le répertoire
 * des élus — et tout était perdu, y compris ce qui avait déjà abouti. Les
 * fichiers de la source en échec ne sont alors pas réécrits : ceux de la
 * dernière ingestion restent en place, datés, plutôt que de disparaître.
 *
 * Ce qui reste fatal : un référentiel dont dépend la structure même du réseau,
 * comme BANATIC ou le découpage. Sans eux il n'y a rien à écrire.
 */
async function tenter<T>(quoi: string, f: () => Promise<T | null>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    dire(`${JAUNE}${quoi} : ${(e as Error).message}${RAZ}`);
    dire(`${JAUNE}  → les fichiers de cette source ne seront pas réécrits.${RAZ}`);
    return null;
  }
}

/**
 * Télécharge vers le cache, sauf si le fichier y est déjà et qu'on a demandé de
 * le réutiliser.
 *
 * L'écriture passe par un fichier temporaire renommé à la fin. Sans cela, un
 * transfert coupé en route — ce qui arrive : le référentiel FINESS pèse 244 Mo
 * et la connexion a lâché en pleine session — laisserait un fichier tronqué
 * que le passage suivant prendrait pour un cache valide, et l'ingestion
 * produirait des données incomplètes sans rien signaler.
 *
 * L'URL d'origine est déposée à côté du fichier. Le référentiel FINESS est
 * épinglé à une version datée : le jour où la veille en signale une plus
 * récente et qu'on change l'URL, le cache porterait toujours le même nom et
 * `--cache` servirait l'ancien millésime sans fin. Comparer l'URL est le seul
 * moyen de s'en apercevoir.
 */
async function telechargerEnCache(
  url: string,
  vers: string,
  reutiliser: boolean,
  annonce: string,
): Promise<void> {
  const provenance = `${vers}.source`;
  const sourceConnue = existsSync(provenance) ? readFileSync(provenance, 'utf8').trim() : null;
  if (reutiliser && existsSync(vers) && sourceConnue === url) {
    dire(`${GRIS}${annonce} : déjà en cache (${(statSync(vers).size / 1e6).toFixed(0)} Mo)${RAZ}`);
    return;
  }
  if (reutiliser && existsSync(vers)) {
    // Distinguer les deux : « je ne sais pas d'où vient ce fichier » n'est pas
    // « l'adresse a changé », et le journal ne doit pas laisser croire à une
    // mise à jour de la source là où il n'y en a pas eu.
    dire(
      sourceConnue === null
        ? `${GRIS}${annonce} : provenance du cache inconnue, on le refait${RAZ}`
        : `${GRIS}${annonce} : l'adresse a changé, le cache est périmé${RAZ}`,
    );
  }
  dire(`${GRIS}${annonce}…${RAZ}`);
  const partiel = `${vers}.partiel`;
  try {
    await telecharger(url, partiel);
    renameSync(partiel, vers);
    writeFileSync(provenance, `${url}\n`);
  } catch (e) {
    rmSync(partiel, { force: true });
    throw e;
  }
}

/**
 * Un flux coupé en route ne lève pas d'erreur : il laisse un fichier tronqué.
 * La réingestion du 30 septembre 2026 a perdu ainsi les trois tables du
 * recensement servies par Melodi — des archives incomplètes, qu'`unzip` a
 * refusées (code 9). On compare donc à la longueur annoncée, et on recommence.
 */
async function telecharger(url: string, vers: string): Promise<void> {
  const { Readable } = await import('node:stream');
  for (let essai = 1; ; essai++) {
    const r = await obstine(url);
    if (!r.body) throw new Error(`${url} : réponse sans corps`);
    const attendu = Number(r.headers.get('content-length') ?? 0);
    const flux = createWriteStream(vers);
    let coupe = false;
    await new Promise<void>((ok, ko) => {
      Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0])
        .on('error', ko)
        .pipe(flux)
        .on('finish', () => ok())
        .on('error', ko);
    }).catch((e) => {
      if (essai >= 4) throw e;
      coupe = true;
    });
    const recu = existsSync(vers) ? statSync(vers).size : 0;
    // Une réponse compressée à la volée n'annonce que sa taille compressée.
    const compresse = !!r.headers.get('content-encoding');
    if (!coupe && (!attendu || compresse || recu === attendu)) return;
    if (essai >= 4) throw new Error(`${url} : ${recu} octets reçus sur ${attendu}, quatre fois de suite`);
    dire(`${GRIS}  ${recu} octets reçus sur ${attendu}, on recommence${RAZ}`);
  }
}

/**
 * Lit un CSV du cache ligne à ligne : le référentiel FINESS pèse 244 Mo, et le
 * flux évite d'avoir à se demander, à chaque nouveau millésime, s'il tient
 * encore en mémoire.
 *
 * Analyse les guillemets plutôt que de découper sur la virgule : plusieurs
 * raisons sociales en contiennent une.
 */
async function* lignesCsv(chemin: string): AsyncIterable<Record<string, string>> {
  let reste = '';
  let entetes: string[] | null = null;
  const decoder = new TextDecoder('utf-8');
  for await (const morceau of createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>) {
    reste += decoder.decode(morceau, { stream: true });
    let coupe: number;
    while ((coupe = prochaineFinDeLigne(reste)) !== -1) {
      const ligne = reste.slice(0, coupe).replace(/\r$/, '');
      reste = reste.slice(coupe + 1);
      const champs = decouper(ligne);
      if (!entetes) entetes = champs;
      else if (champs.length > 1) yield Object.fromEntries(entetes.map((h, i) => [h, champs[i] ?? '']));
    }
  }
  if (reste.trim() !== '' && entetes) {
    const champs = decouper(reste);
    if (champs.length > 1) yield Object.fromEntries(entetes.map((h, i) => [h, champs[i] ?? '']));
  }
}

/**
 * Ce que le découpage sait des communes, pour le collecteur des associations.
 *
 * Deux tables, tirées du même fichier :
 *
 *   — la **population** de chaque commune actuelle, parce qu'une commune de
 *     cinq cents âmes et une de cinquante mille ne montent pas le même nombre
 *     d'associations, et que le nombre brut ne se compare à rien ;
 *   — le **report** d'un code qui n'est plus celui d'une commune actuelle vers
 *     celle qui l'a repris. Le découpage porte les arrondissements municipaux
 *     (`commune`) et les communes déléguées ou associées (`chefLieu`) : deux
 *     mille codes que le répertoire des associations emploie encore, et qui
 *     sans cela ne se rattacheraient à rien.
 */
function tablesDuDecoupage(): { populations: Map<string, number>; reports: Map<string, string> } {
  const chemin = createRequire(import.meta.url).resolve(
    '@etalab/decoupage-administratif/data/communes.json',
  );
  const communes = JSON.parse(readFileSync(chemin, 'utf8')) as {
    code: string;
    type: string;
    population?: number;
    chefLieu?: string;
    commune?: string;
  }[];
  const populations = new Map<string, number>();
  for (const c of communes) {
    if (c.type === 'commune-actuelle') populations.set(c.code, c.population ?? 0);
  }
  const reports = new Map<string, string>();
  for (const c of communes) {
    if (c.type === 'commune-actuelle') continue;
    const vers = c.chefLieu ?? c.commune;
    // Un code qui est déjà celui d'une commune actuelle n'a rien à reporter :
    // une commune déléguée porte souvent le code de la commune nouvelle.
    if (vers && populations.has(vers) && !populations.has(c.code)) reports.set(c.code, vers);
  }
  return { populations, reports };
}

/** Une fin de ligne hors guillemets : un champ peut contenir un saut de ligne. */
function prochaineFinDeLigne(s: string): number {
  let dansGuillemets = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') dansGuillemets = !dansGuillemets;
    else if (s[i] === '\n' && !dansGuillemets) return i;
  }
  return -1;
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
    } else if (c === ',' && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

/** Colonne Excel (A, B, …, AA) vers son index, et retour. */
function indiceColonne(ref: string): number {
  let n = 0;
  for (const c of ref) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

interface Groupement {
  siren: string;
  nom: string;
  nature: string;
  /** Codes BANATIC suivis que ce groupement exerce. */
  codes: Set<string>;
  /** Sirens de ses membres, communes ou autres groupements. */
  membres: Set<string>;
}

async function principal() {
  const reutiliser = process.argv.includes('--cache');
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(SORTIE, { recursive: true });

  // 1. Les codes à suivre viennent du contenu : c'est chaque compétence qui
  //    déclare comment elle se résout.
  const graphe = chargerGraphe();
  const codesSuivis = new Map<string, string[]>(); // code BANATIC -> compétences Rouages
  for (const c of graphe.competences.values()) {
    for (const code of c.banatic) {
      if (!codesSuivis.has(code)) codesSuivis.set(code, []);
      codesSuivis.get(code)!.push(c.id);
    }
  }
  if (codesSuivis.size === 0) {
    dire(`${JAUNE}Aucune compétence ne déclare de code BANATIC — rien à faire.${RAZ}`);
    return;
  }
  dire(`${GRIS}${codesSuivis.size} codes BANATIC suivis, pour ${graphe.competences.size} compétences.${RAZ}`);

  // 2. Référentiel : code -> libellé, pour retrouver les colonnes de l'export.
  dire(`${GRIS}Référentiel des compétences…${RAZ}`);
  const ref = (await (await obstine(REFERENTIEL)).json()) as {
    data: { code: string; libelle: string }[];
  };
  const libelleDeCode = new Map(ref.data.map((r) => [r.code, r.libelle.trim()]));
  for (const code of codesSuivis.keys()) {
    if (!libelleDeCode.has(code)) throw new Error(`code BANATIC inconnu au référentiel : ${code}`);
  }

  // 3. L'export national.
  await telechargerEnCache(EXPORT_NATIONAL, XLSX, reutiliser, "Export national BANATIC (environ 75 Mo)");
  dire(`${GRIS}Export : ${(statSync(XLSX).size / 1e6).toFixed(0)} Mo${RAZ}`);

  // Les natures juridiques sont elles-mêmes des sigles — SIVU, SMF, PETR — que
  // personne n'est censé connaître : on emporte leurs libellés.
  const natures = new Map<string, string>();
  try {
    const rn = (await (await obstine(REFERENTIEL_NATURES)).json()) as {
      data: { code: string; libelle: string }[];
    };
    for (const n of rn.data ?? []) natures.set(n.code, n.libelle);
    dire(`${GRIS}${natures.size} natures juridiques.${RAZ}`);
  } catch {
    dire(`${JAUNE}Référentiel des natures juridiques injoignable : les codes resteront bruts.${RAZ}`);
  }

  const { groupements, dateExport } = await lireExport(XLSX, libelleDeCode, codesSuivis);
  dire(`${GRIS}${groupements.size.toLocaleString('fr-FR')} groupements lus.${RAZ}`);

  // Les repères financiers : les comptes des communes, en euros par habitant.
  // Un repère déclare l'échelon où sa mesure a un sens ; les deux collectes
  // n'interrogent pas le même jeu de données.
  const { collecterFinances } = await import('./finances-emettre.ts');
  const tous = [...graphe.reperes.values()];
  const reperes = tous.filter((r) => r.echelon === 'commune');
  const reperesGfp = tous.filter((r) => r.echelon === 'groupement');
  dire(`${GRIS}Repères financiers (${reperes.length}) :${RAZ}`);
  const finances = await collecterFinances(reperes, obstine, (m) => dire(`${GRIS}${m}${RAZ}`));

  // Les flux perçus par l'intercommunalité. Ils suivent le même exercice que
  // les comptes communaux : deux millésimes différents sur la même page ne se
  // compareraient pas, et personne ne verrait pourquoi.
  const { collecterFluxGroupements } = await import('./flux-emettre.ts');
  let fluxGfp = null;
  if (reperesGfp.length > 0 && finances) {
    dire(`${GRIS}Flux perçus par les groupements (${reperesGfp.length}) :${RAZ}`);
    fluxGfp = await collecterFluxGroupements(reperesGfp, finances.annee, obstine, (m) =>
      dire(`${GRIS}${m}${RAZ}`),
    );
  }

  // Le prix de l'eau, rattaché à la structure qui la distribue réellement.
  const { collecterEau } = await import('./eau-emettre.ts');
  const eau = await collecterEau(telecharger, CACHE, (m) => dire(`${GRIS}${m}${RAZ}`));

  // Où sont les services publics : écoles, France services, CCAS, santé.
  const { collecterServices, FINESS } = await import('./services-emettre.ts');
  await telechargerEnCache(FINESS, FINESS_CACHE, reutiliser, 'Référentiel FINESS (environ 244 Mo)');
  const services = await collecterServices(
    async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
    () => lignesCsv(FINESS_CACHE),
    (m) => dire(`${GRIS}${m}${RAZ}`),
  );

  // Les effectifs d'élèves, école par école : ce que le site disait ne pas
  // pouvoir tracer. La clé est l'UAI, jamais le code de commune du jeu — il
  // contient un code postal (voir scripts/ecoles-emettre.ts).
  const { collecterEffectifs } = await import('./ecoles-emettre.ts');
  const effectifs = await tenter('Effectifs scolaires', () =>
    collecterEffectifs(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Les marchés publics du bloc communal. Le filtre est donné ici : le module
  // ne retient que les acheteurs dont le site connaît le SIREN — communes du
  // découpage et groupements de BANATIC.
  const { collecterMarches } = await import('./marches-emettre.ts');
  const sirensSuivis = new Set<string>();
  for (const g of groupements.values()) sirensSuivis.add(g.siren);
  // Le même registre que l'émetteur, lu ici pour connaître les SIREN communaux :
  // un paquet npm épinglé, donc reproductible.
  {
    const { createRequire } = await import('node:module');
    const chemin = createRequire(import.meta.url).resolve(
      '@etalab/decoupage-administratif/data/communes.json',
    );
    const communes = JSON.parse(readFileSync(chemin, 'utf8')) as {
      type: string;
      siren?: string;
    }[];
    for (const c of communes) {
      if (c.type === 'commune-actuelle' && c.siren) sirensSuivis.add(c.siren);
    }
  }
  const marches = await tenter('Marchés publics', () =>
    collecterMarches(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      sirensSuivis,
      (m) => dire(`${GRIS}${m}${RAZ}`),
      async (url: string) => (await obstine(url)).text(),
    ),
  );

  // Les comptes du département et de la région : le même arbre de postes qu'à
  // l'échelon communal, chacun gardant ceux que ses comptes portent.
  const { collecterEchelons } = await import('./echelons-emettre.ts');
  const echelons = finances
    ? await tenter('Comptes du département et de la région', () =>
        collecterEchelons(
          reperes,
          finances.annee,
          async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
          (m) => dire(`${GRIS}${m}${RAZ}`),
        ),
      )
    : null;

  // Les droits de mutation : ce que rapporte une vente immobilière, et à qui.
  const { collecterDmto } = await import('./dmto-emettre.ts');
  const dmto = await tenter('Droits de mutation', () =>
    collecterDmto(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // L'inventaire SRU : l'obligation de logements sociaux, commune par commune.
  const { collecterSru } = await import('./sru-emettre.ts');
  const sru = await tenter('Inventaire SRU', () =>
    collecterSru(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Le maire de chaque commune. Le graphe garde la fonction ; le nom est une
  // précision de donnée, et rien d'autre du répertoire n'est retenu.
  const { collecterMaires } = await import('./elus-emettre.ts');
  const elus = await tenter('Répertoire des élus', () =>
    collecterMaires(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Ce que le site sait rattacher. Les communes et les groupements sont connus
  // nommément ; les départements et les régions se reconnaissent au préfixe de
  // leur SIREN, que le découpage suffit à construire.
  const { prefixesEchelon } = await import('./donnees-ouvertes.ts');
  const prefixesSuivis: string[] = [];
  {
    const { createRequire } = await import('node:module');
    const lire = <T,>(f: string): T =>
      JSON.parse(
        readFileSync(
          createRequire(import.meta.url).resolve(`@etalab/decoupage-administratif/data/${f}`),
          'utf8',
        ),
      ) as T;
    const chefLieux = new Map(
      lire<{ code: string; chefLieu: string }[]>('regions.json').map((r) => [r.code, r.chefLieu]),
    );
    for (const d of lire<{ code: string; region?: string }[]>('departements.json')) {
      prefixesSuivis.push(...prefixesEchelon(d.code, d.region ? chefLieux.get(d.region) : undefined));
    }
  }
  const estSuivi = (siren: string) =>
    sirensSuivis.has(siren) || prefixesSuivis.some((p) => siren.startsWith(p));

  // Les délibérations publiées en données ouvertes. Même filtre de SIREN que
  // les marchés : le site n'ingère que ce qu'il sait rattacher.
  const { collecterDeliberations } = await import('./deliberations-emettre.ts');
  const deliberations = await tenter('Délibérations', () =>
    collecterDeliberations(
      // Des octets, pas du texte : tous les producteurs n'écrivent pas en
      // UTF-8, et c'est le module qui sait le reconnaître.
      async (url: string) => new Uint8Array(await (await obstine(url)).arrayBuffer()),
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      estSuivi,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );


  // Les subventions aux associations : même schéma commun, même découverte,
  // et le même refus d'additionner — le seuil de publication est à 23 000 €.
  const { collecterSubventions } = await import('./subventions-emettre.ts');
  const subventions = await tenter('Subventions', () =>
    collecterSubventions(
      async (url: string) => new Uint8Array(await (await obstine(url)).arrayBuffer()),
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      estSuivi,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Le dernier scrutin municipal : la participation, le refus exprimé par un
  // bulletin blanc ou nul, et le nombre de listes en présence.
  const { collecterElections } = await import('./elections-emettre.ts');
  const elections = await tenter('Élections municipales', () =>
    collecterElections(
      async (url: string) => (await obstine(url)).text(),
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Les risques majeurs : une archive de 8 Mo qui porte les risques recensés,
  // les arrêtés de catastrophe naturelle, les plans de prévention et les
  // documents d'information communaux.
  const { collecterRisques } = await import('./risques-emettre.ts');
  const risques = await tenter('Risques majeurs', () =>
    collecterRisques(telecharger, CACHE, (m) => dire(`${GRIS}${m}${RAZ}`)),
  );

  // Ce qui se monte ici sans qu'aucune collectivité l'ait décidé : les
  // créations d'associations. Un fichier de 1,2 Go, lu en flux comme FINESS,
  // et une fenêtre récente — le répertoire dit ce qui se crée, jamais ce qui
  // vit encore.
  // De quoi le conseil municipal est fait : un effectif, une part de femmes,
  // un âge médian, huit compteurs. Aucun nom — voir l'en-tête du collecteur.
  const { collecterConseils } = await import('./conseils-emettre.ts');
  const conseils = await tenter('Conseils municipaux', () =>
    collecterConseils(
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Répertoire des élus — conseillers (75 Mo)'),
      CACHE,
      (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Les déclarations d'intérêts des élus à la HATVP, rapprochées du fichier
  // des conseillers que la collecte précédente vient de mettre en cache.
  // Jamais une déclaration de patrimoine : voir l'en-tête de l'émetteur.
  {
    const { collecterDeclarations, ecrireDeclarations } = await import('./declarations-emettre.ts');
    const { indexDuDecoupage } = await import('./entreprises-emettre.ts');
    const declarations = await tenter('Déclarations des élus (HATVP)', () =>
      collecterDeclarations(
        telecharger,
        CACHE,
        (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
        new Map(indexDuDecoupage().map(([code, nom]) => [code, nom])),
        (m) => dire(`${GRIS}${m}${RAZ}`),
      ),
    );
    if (declarations) dire(`${GRIS}${ecrireDeclarations(SORTIE, declarations)} départements de déclarations écrits.${RAZ}`);
  }

  // Les élus des départements, des régions et du Parlement, avec leurs
  // déclarations d'intérêts : un fichier par département.
  {
    const { collecterElusEchelons, ecrireElusEchelons } = await import('./elus-echelons-emettre.ts');
    const echelons = await tenter('Élus des départements, des régions et du Parlement', () =>
      collecterElusEchelons(
        telecharger,
        CACHE,
        (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
        async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
        (m) => dire(`${GRIS}${m}${RAZ}`),
      ),
    );
    if (echelons) dire(`${GRIS}${ecrireElusEchelons(SORTIE, echelons)} départements d’élus écrits.${RAZ}`);
  }

  // La population dans le temps : le dénominateur de tous les autres chiffres
  // du site méritait sa propre histoire.
  // Qui écrit la règle de ce qui peut se construire : un document par commune,
  // et la collectivité qui le porte. Le Géoportail de l'urbanisme ne répond que
  // commune par commune ; SuDocUH publie le même état en un fichier.
  const { collecterUrbanisme } = await import('./urbanisme-emettre.ts');
  const urbanisme = await tenter('Documents d’urbanisme', () =>
    collecterUrbanisme(
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Enquête SuDocUH (environ 5 Mo)'),
      CACHE,
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Ce que l'enquête annuelle ne peut pas voir : une version déposée après sa
  // clôture. Le Géoportail est alimenté au fil de l'eau par les collectivités.
  const { collecterPlu } = await import('./plu-emettre.ts');
  const plu = await tenter('Géoportail de l’urbanisme', () =>
    collecterPlu(
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  const { collecterPopulations } = await import('./population-emettre.ts');
  const decoupage = tablesDuDecoupage();
  const populations = await tenter('Séries de population', () =>
    collecterPopulations(
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Séries de population INSEE (environ 7 Mo)'),
      CACHE,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Ce qui sort du plan d'urbanisme : les logements autorisés et commencés,
  // commune par commune, depuis 2013. L'autre moitié du bloc précédent.
  const { collecterLogements } = await import('./logements-emettre.ts');
  const logements = await tenter('Logements autorisés', () =>
    collecterLogements(
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Sitadel — séries communales (environ 500 Mo)'),
      CACHE,
      lignesCsv,
      decoupage.populations,
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Ce qui est prélevé sur place, et par qui : la ligne « taxe foncière » d'un
  // avis n'est pas un taux, c'est une somme de taux votés par des assemblées
  // différentes. Le REI les sépare, personne d'autre ne le fait.
  const { collecterFiscalite } = await import('./fiscalite-emettre.ts');
  const { lignesCsvOuvert } = await import('./donnees-ouvertes.ts');
  const fiscalite = await tenter('Taux d’imposition', () =>
    collecterFiscalite(
      (url, vers) => telechargerEnCache(url, vers, reutiliser, 'REI — taux d’imposition (18 Mo)'),
      CACHE,
      (lire) => lignesCsvOuvert('rei', lire),
      async <T,>(url: string) => (await obstine(url)).json() as Promise<T>,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Ce qu'on trouve sur place, commerces compris : la gamme de proximité de
  // l'INSEE, qui est un objet statistique publié et non une liste maison.
  const { collecterEquipements } = await import('./equipements-emettre.ts');
  const equipements = await tenter('Équipements', () =>
    collecterEquipements(
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Base permanente des équipements (15 Mo)'),
      CACHE,
      (lire) => lignesCsvOuvert('bpe', lire),
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  // Les naissances et les décès : le solde naturel explique la moitié de ce
  // que la courbe des habitants montre. Écrits à part, par département, sans
  // passer par l'émetteur principal — le jeu ne dépend de rien d'autre.
  const { collecterEtatCivil, ecrireEtatCivil } = await import('./etat-civil-emettre.ts');
  const etatCivil = await tenter('Naissances et décès', () =>
    collecterEtatCivil(
      (url, vers) => telechargerEnCache(url, vers, reutiliser, 'État civil INSEE (environ 6 Mo)'),
      CACHE,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (etatCivil) dire(`${GRIS}${ecrireEtatCivil(SORTIE, etatCivil)} départements d’état civil écrits.${RAZ}`);

  // La pyramide des âges du recensement : 650 Mo décompressés, lus en flux.
  // Écrite à part, par département, comme l'état civil.
  const { collecterAges, ecrireAges } = await import('./ages-emettre.ts');
  const ages = await tenter('Pyramide des âges', () =>
    collecterAges(
      (url, vers) => telechargerEnCache(url, vers, reutiliser, 'Population par sexe et âge INSEE (73 Mo)'),
      CACHE,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (ages) dire(`${GRIS}${ecrireAges(SORTIE, ages)} départements de pyramides des âges écrits.${RAZ}`);

  // Qui sont les habitants, au-delà de leur âge : leurs diplômes, d'après le
  // même recensement, et leur niveau de vie, d'après Filosofi. Écrits à part,
  // par département, comme la pyramide.
  const { collecterDiplomes, ecrireDiplomes } = await import('./diplomes-emettre.ts');
  const diplomes = await tenter('Diplômes', () =>
    collecterDiplomes(
      (url, vers) => telechargerEnCache(url, vers, reutiliser, 'Diplômes et formation INSEE (26 Mo)'),
      CACHE,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (diplomes) dire(`${GRIS}${ecrireDiplomes(SORTIE, diplomes)} départements de diplômes écrits.${RAZ}`);

  const { collecterRevenus, ecrireRevenus } = await import('./revenus-emettre.ts');
  const revenus = await tenter('Niveau de vie', () =>
    collecterRevenus(
      (url, vers) => telechargerEnCache(url, vers, reutiliser, 'Filosofi — niveau de vie INSEE (5 Mo)'),
      CACHE,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (revenus) dire(`${GRIS}${ecrireRevenus(SORTIE, revenus)} départements de niveau de vie écrits.${RAZ}`);

  // La vie qu'on mène dans la commune : se soigner, l'eau du robinet, la
  // fibre, l'électricité et le gaz, le logement et son prix, l'emploi et les
  // trajets, les écoles, la délinquance enregistrée, la terre agricole, les
  // votes nationaux. Dix collectes, chacune isolée : celle qui échoue laisse en
  // place ses fichiers de l'ingestion précédente.
  const grise = (m: string) => dire(`${GRIS}${m}${RAZ}`);
  const lireJson = async (url: string) => (await obstine(url)).json();
  const enCache = (annonce: string) => (url: string, vers: string) => telechargerEnCache(url, vers, reutiliser, annonce);

  const { collecterSante, ecrireSante } = await import('./sante-emettre.ts');
  const sante = await tenter('Accès aux généralistes', () => collecterSante(enCache('APL de la DREES (7 Mo)'), CACHE, grise));
  if (sante) grise(`${ecrireSante(SORTIE, sante)} départements d’accès aux généralistes écrits.`);

  const { collecterEauQualite, ecrireEauQualite } = await import('./eau-qualite-emettre.ts');
  const eauQualite = await tenter('Contrôle sanitaire de l’eau', () =>
    collecterEauQualite(enCache('Contrôle sanitaire de l’eau (85 Mo)'), CACHE, grise),
  );
  if (eauQualite) grise(`${ecrireEauQualite(SORTIE, eauQualite)} départements de qualité de l’eau écrits.`);

  const { collecterFibre, ecrireFibre } = await import('./fibre-emettre.ts');
  const fibre = await tenter('Fibre optique', () => collecterFibre(lireJson, enCache('France Très Haut Débit (6 Mo)'), CACHE, grise));
  if (fibre) grise(`${ecrireFibre(SORTIE, fibre)} départements de fibre écrits.`);

  const { collecterEnergie, ecrireEnergie } = await import('./energie-emettre.ts');
  const energie = await tenter('Électricité et gaz', () => collecterEnergie(lireJson, obstine, grise));
  if (energie) grise(`${ecrireEnergie(SORTIE, energie)} départements d’électricité et de gaz écrits.`);

  const { collecterRecensement, ecrireRecensement } = await import('./recensement-emettre.ts');
  const recensement = await tenter('Logements, activité et trajets', () =>
    collecterRecensement(enCache('Recensement — logement, activité, trajets (230 Mo)'), CACHE, grise),
  );
  if (recensement) grise(`${ecrireRecensement(SORTIE, recensement)} fichiers de logements et d’emploi écrits.`);

  const { anneesDvf, collecterDvf, ecrireDvf } = await import('./dvf-emettre.ts');
  const dvf = await tenter('Ventes immobilières', () => collecterDvf(anneesDvf(), enCache('DVF géolocalisé (100 Mo par an)'), CACHE, grise));
  if (dvf) grise(`${ecrireDvf(SORTIE, dvf)} départements de prix immobiliers écrits.`);

  const { collecterIps, ecrireIps } = await import('./ips-emettre.ts');
  const ips = await tenter('Indices de position sociale', () =>
    collecterIps(lireJson, enCache('IPS des écoles et collèges'), (c) => createReadStream(c) as unknown as AsyncIterable<Uint8Array>, CACHE, grise),
  );
  if (ips) grise(`${ecrireIps(SORTIE, ips)} départements d’IPS écrits.`);

  const { collecterDelinquance, ecrireDelinquance } = await import('./delinquance-emettre.ts');
  const delinquance = await tenter('Délinquance enregistrée', () =>
    collecterDelinquance(lireJson, enCache('Base communale du SSMSI (40 Mo)'), CACHE, grise),
  );
  if (delinquance) grise(`${ecrireDelinquance(SORTIE, delinquance)} départements de délinquance écrits.`);

  // Agreste présente une chaîne de certificats incomplète : son téléchargement
  // passe par un processus à part, qui ajoute l'intermédiaire publié par
  // l'autorité de certification (voir le module).
  const { collecterAgriculture, ecrireAgriculture, telechargerAvecIntermediaire } = await import('./agriculture-emettre.ts');
  const agriculture = await tenter('Recensement agricole', () =>
    collecterAgriculture(
      async (url, vers) => {
        if (reutiliser && existsSync(vers)) return;
        grise('Recensement agricole 2020 — Agreste (1 Mo)…');
        await telechargerAvecIntermediaire(url, vers);
      },
      CACHE,
      grise,
    ),
  );
  if (agriculture) grise(`${ecrireAgriculture(SORTIE, agriculture)} départements de surface agricole écrits.`);

  const { collecterVotes, ecrireVotes } = await import('./votes-emettre.ts');
  const votes = await tenter('Élections nationales', () => collecterVotes(enCache('Résultats des élections nationales (240 Mo)'), CACHE, grise));
  if (votes) grise(`${ecrireVotes(SORTIE, votes)} départements de votes nationaux écrits.`);

  const { collecterArtificialisation, ecrireArtificialisation } = await import('./artificialisation-emettre.ts');
  const conso = await tenter('Consommation d’espaces', () =>
    collecterArtificialisation(enCache('Consommation d’espaces du Cerema (33 Mo)'), CACHE, grise),
  );
  if (conso) grise(`${ecrireArtificialisation(SORTIE, conso)} départements de consommation d’espaces écrits.`);

  const { collecterRadon, ecrireRadon } = await import('./radon-emettre.ts');
  const radon = await tenter('Potentiel radon', () => collecterRadon(enCache('Zonage radon (1 Mo)'), CACHE, grise));
  if (radon) grise(`${ecrireRadon(SORTIE, radon)} départements de zonage radon écrits.`);

  // Les départements de l'ingestion précédente : l'index de celle-ci n'est
  // écrit que plus bas, et l'ADEME s'interroge département par département.
  const { collecterDpe, ecrireDpe } = await import('./dpe-emettre.ts');
  const dpe = await tenter('Diagnostics de performance énergétique', () =>
    collecterDpe(
      lireJson,
      Object.keys((JSON.parse(readFileSync(join(SORTIE, 'index.json'), 'utf8')) as { deps: Record<string, string> }).deps),
      grise,
    ),
  );
  if (dpe) grise(`${ecrireDpe(SORTIE, dpe)} départements de DPE écrits.`);

  const { collecterDotations, ecrireDotations } = await import('./dotations-emettre.ts');
  const dotations = await tenter('Dotations de l’État', () => collecterDotations(obstine, lireJson, grise));
  if (dotations) grise(`${ecrireDotations(SORTIE, dotations)} départements de dotations écrits.`);

  const { collecterCaf, ecrireCaf } = await import('./caf-emettre.ts');
  const caf = await tenter('Allocataires de la CAF', () => collecterCaf(obstine, grise));
  if (caf) grise(`${ecrireCaf(SORTIE, caf)} départements d’allocataires de la CAF écrits.`);

  const { collecterDae, ecrireDae } = await import('./dae-emettre.ts');
  const dae = await tenter('Défibrillateurs', () => collecterDae(lireJson, enCache('Géo’DAE (78 Mo)'), CACHE, grise));
  if (dae) grise(`${ecrireDae(SORTIE, dae)} départements de défibrillateurs écrits.`);

  const { collecterGares, ecrireGares } = await import('./gares-emettre.ts');
  const gares = await tenter('Gares de voyageurs', () => collecterGares(lireJson, grise));
  if (gares) grise(`${ecrireGares(SORTIE, gares)} départements de gares écrits.`);

  const { collecterAntennes, ecrireAntennes } = await import('./antennes-emettre.ts');
  const antennes = await tenter('Sites mobiles', () =>
    collecterAntennes(async (url) => (await obstine(url)).text(), enCache('Arcep — sites mobiles (20 Mo)'), CACHE, grise),
  );
  if (antennes) grise(`${ecrireAntennes(SORTIE, antennes)} départements de sites mobiles écrits.`);

  const { collecterProduction, ecrireProduction } = await import('./production-emettre.ts');
  const production = await tenter('Production d’électricité', () => collecterProduction(lireJson, grise));
  if (production) grise(`${ecrireProduction(SORTIE, production)} départements de production écrits.`);

  const { collecterMonuments, ecrireMonuments } = await import('./monuments-emettre.ts');
  const monuments = await tenter('Monuments historiques', () =>
    collecterMonuments(enCache('Base Mérimée — monuments historiques (100 Mo)'), CACHE, grise),
  );
  if (monuments) grise(`${ecrireMonuments(SORTIE, monuments)} départements de monuments écrits.`);

  const { collecterLieux, ecrireLieux } = await import('./lieux-emettre.ts');
  const lieux = await tenter('Lieux à voir', () =>
    collecterLieux(lireJson, enCache('DATAtourisme — lieux, par région (400 Mo)'), CACHE, grise),
  );
  if (lieux) grise(`${ecrireLieux(SORTIE, lieux)} départements de lieux écrits.`);

  const { collecterZonages, ecrireZonages } = await import('./zonages-emettre.ts');
  const zonages = await tenter('Programmes de l’ANCT et zone de montagne', () =>
    collecterZonages(lireJson, enCache('ANCT et zones défavorisées (10 Mo)'), CACHE, grise),
  );
  if (zonages) grise(`${ecrireZonages(SORTIE, zonages)} départements de zonages écrits.`);

  const { collecterInvestissement, ecrireInvestissement } = await import('./investissement-emettre.ts');
  const investissement = await tenter('Subventions d’investissement de l’État', () =>
    collecterInvestissement(lireJson, enCache('DGCL — projets subventionnés (10 Mo)'), CACHE, grise, SORTIE),
  );
  if (investissement) grise(`${ecrireInvestissement(SORTIE, investissement)} départements de projets subventionnés écrits.`);

  const { collecterLoyers, ecrireLoyers } = await import('./loyers-emettre.ts');
  const loyers = await tenter('Carte des loyers', () => collecterLoyers(lireJson, enCache('Carte des loyers (10 Mo)'), CACHE, grise));
  if (loyers) grise(`${ecrireLoyers(SORTIE, loyers)} départements de loyers écrits.`);

  const { collecterRecharge, ecrireRecharge } = await import('./recharge-emettre.ts');
  const recharge = await tenter('Recharge et covoiturage', () =>
    collecterRecharge(lireJson, enCache('IRVE et lieux de covoiturage (160 Mo)'), CACHE, grise),
  );
  if (recharge) grise(`${ecrireRecharge(SORTIE, recharge)} départements de recharge écrits.`);

  const { collecterObjets, ecrireObjets } = await import('./objets-emettre.ts');
  const objets = await tenter('Objets protégés', () => collecterObjets(enCache('Palissy — objets protégés (365 Mo)'), CACHE, grise));
  if (objets) grise(`${ecrireObjets(SORTIE, objets)} départements d’objets protégés écrits.`);

  const { collecterTravail, ecrireTravail } = await import('./travail-emettre.ts');
  const travail = await tenter('Salariés et inscrits à France Travail', () => collecterTravail(obstine, grise));
  if (travail) grise(`${ecrireTravail(SORTIE, travail)} départements de travail écrits.`);

  const { collecterAppellations, ecrireAppellations } = await import('./appellations-emettre.ts');
  const appellations = await tenter('Appellations de l’INAO', () =>
    collecterAppellations(lireJson, enCache('INAO — aires des appellations (45 Mo)'), CACHE, grise),
  );
  if (appellations) grise(`${ecrireAppellations(SORTIE, appellations)} départements d’appellations écrits.`);

  const { collecterSecheresse, ecrireSecheresse } = await import('./secheresse-emettre.ts');
  const secheresse = await tenter('Restrictions d’eau', () =>
    collecterSecheresse(lireJson, enCache('VigiEau — historique des restrictions (590 Mo, 12 Go décompressé)'), CACHE, grise),
  );
  if (secheresse) grise(`${ecrireSecheresse(SORTIE, secheresse)} départements de restrictions d’eau écrits.`);

  const { collecterContours, ecrireContours } = await import('./contours-emettre.ts');
  const contours = await tenter('Contours des communes', () => collecterContours(CACHE, grise));
  if (contours) grise(`${ecrireContours(SORTIE, contours)} départements de contours écrits.`);

  // Les espaces naturels se croisent avec les contours que la collecte précédente vient d'écrire.
  const { collecterEspaces, ecrireEspaces } = await import('./espaces-emettre.ts');
  const espaces = await tenter('Espaces naturels', () => collecterEspaces(SORTIE, CACHE, grise));
  if (espaces) grise(`${ecrireEspaces(SORTIE, espaces)} départements d’espaces naturels écrits.`);

  const { collecterPetiteEnfance, ecrirePetiteEnfance } = await import('./petite-enfance-emettre.ts');
  const petiteEnfance = await tenter('Accueil du jeune enfant', () => collecterPetiteEnfance(lireJson, grise));
  if (petiteEnfance) {
    ecrirePetiteEnfance(SORTIE, petiteEnfance);
    grise('Taux de couverture de l’accueil du jeune enfant écrit.');
  }

  const { collecterAccidents, ecrireAccidents } = await import('./accidents-emettre.ts');
  const accidents = await tenter('Accidents de la route', () =>
    collecterAccidents(lireJson, enCache('Bases des accidents corporels (100 Mo)'), CACHE, grise),
  );
  if (accidents) grise(`${ecrireAccidents(SORTIE, accidents)} départements d’accidents de la route écrits.`);

  // Les annonces légales des entreprises : décomptes par commune, et les
  // dernières annonces des sociétés, que le journal reprend. Avant l'émetteur
  // principal, qui rassemble le journal ; le rattachement lit le découpage
  // lui-même, pas l'index que l'émetteur va écrire.
  const { collecterEntreprises, ecrireEntreprises, indexDuDecoupage } = await import('./entreprises-emettre.ts');
  const entreprises = await tenter('Annonces du BODACC', () =>
    collecterEntreprises(
      async (url) => (await obstine(url)).text(),
      indexDuDecoupage(),
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (entreprises) dire(`${GRIS}${ecrireEntreprises(SORTIE, entreprises)} départements d’annonces d’entreprises écrits.${RAZ}`);

  // Les représentants d'intérêts de la HATVP, rattachés par l'adresse qu'ils
  // déclarent, avec la même table que le BODACC.
  const { collecterHatvp, ecrireHatvp } = await import('./hatvp-emettre.ts');
  const hatvp = await tenter('Représentants d’intérêts (HATVP)', () =>
    collecterHatvp(telecharger, CACHE, indexDuDecoupage(), (m) => dire(`${GRIS}${m}${RAZ}`)),
  );
  if (hatvp) dire(`${GRIS}${ecrireHatvp(SORTIE, hatvp)} départements de représentants d’intérêts écrits.${RAZ}`);

  const { collecterAssociations } = await import('./associations-emettre.ts');
  const associations = await tenter('Associations', () =>
    collecterAssociations(
      // Le fichier pèse 1,2 Go : il passe par le cache, comme FINESS, sinon
      // chaque essai d'ingestion le retéléchargerait pour rien.
      (url, vers) =>
        telechargerEnCache(url, vers, reutiliser, 'Répertoire national des associations (environ 1,2 Go)'),
      CACHE,
      lignesCsv,
      decoupage.populations,
      decoupage.reports,
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );

  await ecrire(
    graphe,
    groupements,
    codesSuivis,
    libelleDeCode,
    dateExport,
    natures,
    finances,
    eau,
    services,
    reperesGfp,
    fluxGfp,
    effectifs,
    elus,
    marches,
    sru,
    dmto,
    echelons,
    risques,
    elections,
    deliberations,
    subventions,
    associations,
    populations,
    conseils,
    urbanisme,
    plu,
    logements,
    fiscalite,
    equipements,
    etatCivil,
    entreprises,
  );

  // Le centre d'action sociale : son budget, ses budgets annexes, ce qu'il
  // gère. Après l'écriture des structures, dont il lit l'appartenance de chaque
  // commune à son intercommunalité — c'est par elle qu'un CIAS se rattache.
  const { collecterCcas, ecrireCcas } = await import('./ccas-emettre.ts');
  const ccas = await tenter('Centres d’action sociale', () =>
    collecterCcas(
      async (url) => (await obstine(url)).text(),
      join(CACHE, 't-finess.csv'),
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (ccas) dire(`${GRIS}${ecrireCcas(SORTIE, ccas)} départements de centres d’action sociale écrits.${RAZ}`);

  // Ce qui est installé : les établissements actifs au répertoire SIRENE, par
  // secteur. Après l'écriture, dont il lit l'index — les départements et les
  // populations — pour rapporter les employeurs aux habitants.
  const { collecterSirene, ecrireSirene } = await import('./sirene-emettre.ts');
  const index = JSON.parse(readFileSync(join(SORTIE, 'index.json'), 'utf8')) as {
    c: [string, string, string, string, number][];
  };
  const sirene = await tenter('Établissements SIRENE', () =>
    collecterSirene(
      async (url) => (await obstine(url)).text(),
      [...new Set(index.c.map((c) => c[3]))].sort(),
      new Map(index.c.map((c) => [c[0], c[4]] as const)),
      (m) => dire(`${GRIS}${m}${RAZ}`),
    ),
  );
  if (sirene) dire(`${GRIS}${ecrireSirene(SORTIE, sirene)} départements d’établissements écrits.${RAZ}`);
}

/** Lit l'export en flux : 1,4 Go de XML ne tiennent pas en mémoire. */
async function lireExport(
  chemin: string,
  libelleDeCode: Map<string, string>,
  codesSuivis: Map<string, string[]>,
): Promise<{ groupements: Map<string, Groupement>; dateExport: string }> {
  const flux = spawn('unzip', ['-p', chemin, 'xl/worksheets/sheet1.xml']);
  flux.on('error', () => {
    throw new Error("« unzip » est requis pour lire l'export BANATIC");
  });

  const groupements = new Map<string, Groupement>();
  let colonnes: Map<string, number> | null = null; // code BANATIC -> indice
  let colSiren = -1, colNom = -1, colNature = -1, colMembre = -1, colCategorie = -1;
  let reste = '';
  let lignes = 0;

  const cellules = (ligne: string): Map<number, string> => {
    const out = new Map<number, string>();
    const re = /<c\b([^>]*)>(.*?)<\/c>/gs;
    for (let m = re.exec(ligne); m; m = re.exec(ligne)) {
      const ref = /r="([A-Z]+)\d+"/.exec(m[1]);
      if (!ref) continue;
      const t = /<t[^>]*>(.*?)<\/t>/s.exec(m[2]) ?? /<v>(.*?)<\/v>/s.exec(m[2]);
      out.set(indiceColonne(ref[1]), t ? decoder(t[1]) : '');
    }
    return out;
  };

  for await (const morceau of flux.stdout) {
    reste += (morceau as Buffer).toString('utf8');
    let coupe: number;
    while ((coupe = reste.indexOf('</row>')) !== -1) {
      const ligne = reste.slice(0, coupe + 6);
      reste = reste.slice(coupe + 6);
      const cs = cellules(ligne);
      if (!colonnes) {
        // La première ligne est l'en-tête : on y retrouve chaque compétence par
        // son libellé exact, plutôt que par une position qui pourrait bouger.
        const parLibelle = new Map<string, number>();
        for (const [i, v] of cs) parLibelle.set(v.trim(), i);
        colonnes = new Map();
        for (const code of codesSuivis.keys()) {
          const i = parLibelle.get(libelleDeCode.get(code)!);
          if (i === undefined) throw new Error(`colonne introuvable pour le code ${code}`);
          colonnes.set(code, i);
        }
        colSiren = parLibelle.get('N° SIREN')!;
        colNom = parLibelle.get('Nom du groupement')!;
        colNature = parLibelle.get('Nature juridique')!;
        colMembre = parLibelle.get('Siren membre')!;
        colCategorie = parLibelle.get('Catégorie des membres du groupement')!;
        continue;
      }
      lignes++;
      const siren = cs.get(colSiren)?.trim();
      if (!siren) continue;
      let g = groupements.get(siren);
      if (!g) {
        const codes = new Set<string>();
        for (const [code, i] of colonnes) if (cs.get(i)?.trim() === 'OUI') codes.add(code);
        g = {
          siren,
          nom: cs.get(colNom)?.trim() ?? '',
          nature: cs.get(colNature)?.trim() ?? '',
          codes,
          membres: new Set(),
        };
        groupements.set(siren, g);
      }
      const membre = cs.get(colMembre)?.trim();
      if (membre) g.membres.add(membre);
      void colCategorie;
    }
  }
  await new Promise((r) => flux.on('close', r));
  dire(`${GRIS}${lignes.toLocaleString('fr-FR')} lignes lues.${RAZ}`);
  return { groupements, dateExport: new Date().toISOString().slice(0, 10) };
}

function decoder(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* L'écriture est dans un second fichier pour garder celui-ci lisible. */
async function ecrire(
  graphe: ReturnType<typeof chargerGraphe>,
  groupements: Map<string, Groupement>,
  codesSuivis: Map<string, string[]>,
  /** Le libellé de chaque code BANATIC, pour nommer ce qui est transféré. */
  libelleDeCode: Map<string, string>,
  dateExport: string,
  natures: Map<string, string>,
  finances: Awaited<ReturnType<typeof import('./finances-emettre.ts')['collecterFinances']>>,
  eau: Awaited<ReturnType<typeof import('./eau-emettre.ts')['collecterEau']>>,
  services: Awaited<ReturnType<typeof import('./services-emettre.ts')['collecterServices']>>,
  reperesGfp: import('../src/modele/schemas.ts').Repere[],
  fluxGfp: Awaited<ReturnType<typeof import('./flux-emettre.ts')['collecterFluxGroupements']>>,
  effectifs: Awaited<ReturnType<typeof import('./ecoles-emettre.ts')['collecterEffectifs']>>,
  elus: Awaited<ReturnType<typeof import('./elus-emettre.ts')['collecterMaires']>>,
  marches: Awaited<ReturnType<typeof import('./marches-emettre.ts')['collecterMarches']>>,
  sru: Awaited<ReturnType<typeof import('./sru-emettre.ts')['collecterSru']>>,
  dmto: Awaited<ReturnType<typeof import('./dmto-emettre.ts')['collecterDmto']>>,
  echelons: Awaited<ReturnType<typeof import('./echelons-emettre.ts')['collecterEchelons']>>,
  risques: Awaited<ReturnType<typeof import('./risques-emettre.ts')['collecterRisques']>>,
  elections: Awaited<ReturnType<typeof import('./elections-emettre.ts')['collecterElections']>>,
  deliberations: Awaited<
    ReturnType<typeof import('./deliberations-emettre.ts')['collecterDeliberations']>
  >,
  subventions: Awaited<
    ReturnType<typeof import('./subventions-emettre.ts')['collecterSubventions']>
  >,
  associations: Awaited<
    ReturnType<typeof import('./associations-emettre.ts')['collecterAssociations']>
  >,
  populations: Awaited<
    ReturnType<typeof import('./population-emettre.ts')['collecterPopulations']>
  >,
  conseils: Awaited<ReturnType<typeof import('./conseils-emettre.ts')['collecterConseils']>>,
  urbanisme: Awaited<ReturnType<typeof import('./urbanisme-emettre.ts')['collecterUrbanisme']>>,
  plu: Awaited<ReturnType<typeof import('./plu-emettre.ts')['collecterPlu']>>,
  logements: Awaited<ReturnType<typeof import('./logements-emettre.ts')['collecterLogements']>>,
  fiscalite: Awaited<ReturnType<typeof import('./fiscalite-emettre.ts')['collecterFiscalite']>>,
  equipements: Awaited<
    ReturnType<typeof import('./equipements-emettre.ts')['collecterEquipements']>
  >,
  etatCivil: import('./etat-civil-emettre.ts').EtatCivil | null,
  entreprises: import('./entreprises-emettre.ts').Entreprises | null,
) {
  const { emettre } = await import('./territoires-emettre.ts');
  emettre({
    graphe,
    groupements,
    codesSuivis,
    libelleDeCode,
    dateExport,
    natures,
    finances,
    eau,
    services,
    reperesGfp,
    fluxGfp,
    effectifs,
    elus,
    marches,
    sru,
    dmto,
    echelons,
    risques,
    elections,
    deliberations,
    subventions,
    associations,
    populations,
    conseils,
    urbanisme,
    plu,
    logements,
    fiscalite,
    equipements,
    etatCivil,
    entreprises,
    sortie: SORTIE,
    dire,
    VERT,
    RAZ,
    GRIS,
  });
}

await principal();
