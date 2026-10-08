/**
 * Les sites et sols pollués et les installations classées de chaque commune,
 * d'après Géorisques, lus sur le service de téléchargement du BRGM.
 *
 * **Deux registres, qui ne disent pas la même chose.**
 *
 * - La carte des anciens sites industriels et activités de services (CASIAS,
 *   qui a pris la suite de BASIAS), avec les sites pollués appelant une action
 *   des pouvoirs publics (ex-BASOL) et les secteurs d'information sur les sols
 *   (SIS) : la mémoire de ce qui a été exploité là. Le BRGM le dit lui-même,
 *   elle « ne préjuge pas de la pollution effective des sols des
 *   établissements recensés » — un ancien garage y figure comme une friche
 *   chimique, et le site ne les confond pas.
 * - Les installations classées pour la protection de l'environnement (ICPE) :
 *   ce qui est exploité aujourd'hui sous le contrôle de l'inspection, avec son
 *   régime (autorisation, enregistrement), son classement Seveso et la date de
 *   la dernière inspection.
 *
 * **Le service refuse les machines de GitHub.** `georisques.gouv.fr` et sa
 * copie au BRGM ont rejeté toutes les sondes faites depuis l'intégration
 * continue et depuis l'environnement de développement, et répondent depuis
 * l'hébergement français de Rouages (8 octobre 2026). La collecte est donc
 * facultative : là où elle échoue, les fichiers de l'ingestion précédente
 * restent en place (`docs/08-runner-auto-heberge.md`).
 *
 * **Chaque couche est comptée avant d'être lue.** Le service dit combien
 * d'objets elle porte (`resulttype=hits`) ; un fichier qui en rend moins est
 * un téléchargement tronqué ou un plafond du serveur, et la collecte s'arrête
 * plutôt que d'écrire des communes sans leurs sites.
 *
 * **Les noms.** Pour garder la trace historique, l'exploitant est nommé tel
 * que le registre le publie, anciennes entreprises comprises (`CLAUDE.md`,
 * « Les noms dans les données ») — sauf un entrepreneur individuel que
 * SIRENE dit en diffusion partielle : il a exercé son droit d'opposition, et
 * son nom n'est pas repris. Avec un SIRET connu de SIRENE, une société garde
 * le nom du registre et un entrepreneur prend celui de SIRENE. Une opposition
 * inscrite dans `retraits.yaml` — par SIREN, ou par le code du site quand il
 * n'y a pas de SIRET — s'applique. Justification : `docs/07-risques.md`.
 *
 * Lancé seul — `npx tsx scripts/georisques-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-sols-pollues.json` et `dep/XX-icpe.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';
import { retraits } from './retraits.ts';
import { diffusionSirene } from './sirene-noms.ts';

export const SERVICE = 'https://mapsref.brgm.fr/wxs/georisques/georisques_dl?service=wfs&version=2.0.0';
/** L'adresse que la fiche data.gouv de la CASIAS donne pour son fichier CSV, couche par couche. */
export const couche = (nom: string) => `${SERVICE}&request=getfeature&typename=${nom}&outputformat=csvtext`;
const compte = (nom: string) => `${SERVICE}&request=getfeature&typename=${nom}&resulttype=hits`;

/** Les établissements des sites et sols pollués : un point, ou un contour quand il est connu. */
export const COUCHES_SSP = ['etablissement_point', 'etablissement_polygon'];
/**
 * Les installations classées. La couche générale et celles des outre-mer : un
 * établissement présent dans deux couches n'est compté qu'une fois.
 */
export const COUCHES_ICPE = [
  'InstallationsClassees',
  'InstallationsClassees_Antilles',
  'InstallationsClassees_Guyane',
  'InstallationsClassees_Reunion',
  'InstallationsClassees_Mayotte',
];

/** Ce qu'une page montre en liste ; les décomptes, eux, portent sur tout. */
const MAX_LISTE = 40;
const FICHES_BRGM = 'https://fiches-risques.brgm.fr/georisques/';

/** [code, nom ou null, état, inventaires, fiche (chemin sous fiches-risques.brgm.fr/georisques/), activité ou -1] */
export type LigneSsp = [string, string | null, number, number[], string, number];
/** [code AIOT, nom ou null, régime, Seveso (0 non, 1 seuil bas, 2 seuil haut), drapeaux, dernière inspection, activité ou -1] */
export type LigneIcpe = [string, string | null, number, 0 | 1 | 2, number, string, number];

/** Les drapeaux d'une installation, tels que Géorisques les publie (0 ou 1). */
export const DRAPEAUX = [
  ['bovins', 1],
  ['porcs', 2],
  ['volailles', 4],
  ['carriere', 8],
  ['eolienne', 16],
  ['industrie', 32],
  ['ied', 64],
  ['priorite_nationale', 128],
] as const;

export interface Georisques {
  maj: string;
  inventaires: string[];
  etats: string[];
  regimes: string[];
  activites: string[];
  ssp: Map<string, { n: number; i: number[]; s: LigneSsp[] }>;
  icpe: Map<string, { n: number; r: number[]; sv: [number, number]; l: LigneIcpe[] }>;
}

function indexer(table: string[], rangs: Map<string, number>, libelle: string): number {
  const deja = rangs.get(libelle);
  if (deja !== undefined) return deja;
  rangs.set(libelle, table.length);
  table.push(libelle);
  return table.length - 1;
}

/** Le nombre d'objets que le service annonce pour une couche. */
export function nombreAnnonce(xml: string): number {
  if (/Request Rejected/i.test(xml)) throw new Error('le pare-feu du BRGM refuse cette machine (« Request Rejected ») — voir docs/08-runner-auto-heberge.md');
  const m = /numberMatched="(\d+)"/.exec(xml);
  if (!m) throw new Error('le service ne dit pas combien d’objets porte la couche : impossible de vérifier le fichier');
  return Number(m[1]);
}

/** Les lignes d'une couche, en objets par nom de colonne, et leur nombre. */
async function* lireCouche(chemin: string, requises: string[]): AsyncGenerator<Record<string, string>> {
  let col: string[] | null = null;
  for await (const v of lignesCsv(createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>, ';')) {
    if (!col) {
      col = v.map((x) => x.trim());
      for (const n of requises) if (!col.includes(n)) throw new Error(`colonne « ${n} » absente — la couche a changé de forme`);
      continue;
    }
    if (v.length === 1 && v[0] === '') continue;
    // Une ligne qui n'a pas le nombre de colonnes de l'en-tête décalerait
    // tous ses champs : la commune deviendrait un code postal.
    if (v.length !== col.length) throw new Error(`une ligne a ${v.length} champs pour ${col.length} colonnes — la couche a changé de forme`);
    yield Object.fromEntries(col.map((n, i) => [n, (v[i] ?? '').trim()]));
  }
}

const dateIso = (brut: string) => (/^(\d{4})\/(\d{2})\/(\d{2})/.exec(brut) ?? []).slice(1).join('-');

export async function collecterGeorisques(
  telecharger: (url: string, vers: string) => Promise<void>,
  texte: (url: string) => Promise<string>,
  cache: string,
  dire: (m: string) => void,
): Promise<Georisques | null> {
  const { actuelles, reports } = reportsDuDecoupage();
  const commune = (brut: string) => {
    const c = communeDe(codeCommune(brut));
    return actuelles.has(c) ? c : reports.get(c);
  };

  /** Télécharge une couche, et vérifie qu'elle porte autant de lignes que le service en annonce. */
  async function chaqueLigne(nom: string, requises: string[], f: (r: Record<string, string>) => void) {
    const annonce = nombreAnnonce(await texte(compte(nom)));
    if (annonce === 0) {
      dire(`  ${nom} : vide`);
      return;
    }
    const vers = join(cache, `georisques-${nom}.csv`);
    await telecharger(couche(nom), vers);
    let lues = 0;
    for await (const r of lireCouche(vers, requises)) {
      lues++;
      f(r);
    }
    if (lues !== annonce) throw new Error(`${nom} : ${lues} lignes lues pour ${annonce} annoncées — fichier tronqué`);
    dire(`  ${nom} : ${lues.toLocaleString('fr-FR')} lignes`);
  }

  const inventaires: string[] = [];
  const rangInventaire = new Map<string, number>();
  const etats: string[] = [];
  const rangEtat = new Map<string, number>();
  const regimes: string[] = [];
  const rangRegime = new Map<string, number>();
  const activites: string[] = [];
  const rangActivite = new Map<string, number>();

  // --- Les sites et sols pollués --------------------------------------------
  type Site = { code: string; commune: string; nom: string; siret: string; etat: number; inv: number[]; fiche: string; act: number };
  const sites = new Map<string, Site>();
  let sansCommune = 0;
  for (const nom of COUCHES_SSP) {
    await chaqueLigne(
      nom,
      ['code_metier', 'nom_inventaire', 'nom_etablissement', 'code_siret', 'code_insee', 'etat_activite', 'fiche_risque'],
      (r) => {
        const code = r.code_metier;
        if (!code || sites.has(code)) return;
        const c = commune(r.code_insee);
        if (!c) {
          sansCommune++;
          return;
        }
        // « SIS|BASOL » : un même site peut figurer à plusieurs inventaires.
        const inv = r.nom_inventaire
          .split('|')
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => indexer(inventaires, rangInventaire, x));
        const fiche = r.fiche_risque.startsWith(FICHES_BRGM) ? r.fiche_risque.slice(FICHES_BRGM.length) : '';
        const act = r.activite_principale ? indexer(activites, rangActivite, r.activite_principale) : -1;
        sites.set(code, {
          code,
          commune: c,
          nom: r.nom_etablissement,
          siret: r.code_siret.replace(/\D/g, ''),
          etat: indexer(etats, rangEtat, r.etat_activite || 'Non renseigné'),
          inv,
          fiche,
          act,
        });
      },
    );
  }

  // --- Les installations classées ------------------------------------------
  type Installation = {
    code: string;
    commune: string;
    nom: string;
    siret: string;
    regime: number;
    ordre: number;
    seveso: 0 | 1 | 2;
    drapeaux: number;
    inspection: string;
    act: number;
  };
  const installations = new Map<string, Installation>();
  let fichesAilleurs = 0;
  for (const nom of COUCHES_ICPE) {
    await chaqueLigne(
      nom,
      ['code_aiot', 'nom_ets', 'cd_insee', 'num_siret', 'cd_regime', 'lib_regime', 'lib_seveso', 'derniere_inspection', 'url_fiche'],
      (r) => {
        const code = r.code_aiot;
        if (!code || installations.has(code)) return;
        const c = commune(r.cd_insee);
        if (!c) {
          sansCommune++;
          return;
        }
        // La fiche se déduit du code ; on vérifie que la source dit la même chose.
        if (r.url_fiche && !r.url_fiche.endsWith(`/details/${code}`)) fichesAilleurs++;
        const s = r.lib_seveso.toLowerCase();
        let drapeaux = 0;
        for (const [col, bit] of DRAPEAUX) if (r[col] === '1') drapeaux |= bit;
        installations.set(code, {
          code,
          commune: c,
          nom: r.nom_ets,
          siret: r.num_siret.replace(/\D/g, ''),
          regime: indexer(regimes, rangRegime, r.lib_regime || 'Non renseigné'),
          ordre: ({ A: 0, E: 1, D: 2 } as Record<string, number>)[r.cd_regime] ?? 3,
          seveso: s.includes('haut') ? 2 : s.includes('bas') ? 1 : 0,
          drapeaux,
          inspection: dateIso(r.derniere_inspection),
          act: r.lib_naf ? indexer(activites, rangActivite, r.lib_naf) : -1,
        });
      },
    );
  }
  if (fichesAilleurs > 0) throw new Error(`${fichesAilleurs} installations ont une fiche à une autre adresse que /details/<code>`);
  if (sites.size === 0 || installations.size === 0) {
    dire('Géorisques : une des deux bases est vide, on garde l’ingestion précédente.');
    return null;
  }

  // --- Les noms --------------------------------------------------------------
  // Seules les lignes montrées en liste ont besoin d'un nom : c'est elles qu'on
  // soumet au répertoire, pas les cent mille.
  const parCommuneSites = new Map<string, Site[]>();
  for (const s of sites.values()) {
    if (!parCommuneSites.has(s.commune)) parCommuneSites.set(s.commune, []);
    parCommuneSites.get(s.commune)!.push(s);
  }
  const parCommuneIcpe = new Map<string, Installation[]>();
  for (const i of installations.values()) {
    if (!parCommuneIcpe.has(i.commune)) parCommuneIcpe.set(i.commune, []);
    parCommuneIcpe.get(i.commune)!.push(i);
  }
  // Une installation Seveso, puis soumise à autorisation, passe avant une
  // installation enregistrée ; un site pollué connu (SIS, ex-BASOL) avant une
  // ancienne activité.
  const poidsInventaire = (s: Site) => (s.inv.some((i) => /SIS|BASOL/.test(inventaires[i])) ? 0 : 1);
  for (const l of parCommuneSites.values()) l.sort((a, b) => poidsInventaire(a) - poidsInventaire(b) || a.code.localeCompare(b.code));
  for (const l of parCommuneIcpe.values()) {
    l.sort((a, b) => b.seveso - a.seveso || a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr'));
  }
  const montres = [
    ...[...parCommuneSites.values()].flatMap((l) => l.slice(0, MAX_LISTE)),
    ...[...parCommuneIcpe.values()].flatMap((l) => l.slice(0, MAX_LISTE)),
  ];
  const sirens = montres.map((x) => x.siret.slice(0, 9)).filter((x) => /^\d{9}$/.test(x));
  const { noms, refuses } = await diffusionSirene(texte, sirens);
  const r = retraits();
  let nommes = 0;
  let tus = 0;
  const nommer = (x: { code: string; nom: string; siret: string }): string | null => {
    const siren = x.siret.slice(0, 9);
    let n: string | null = x.nom || null;
    if (r.sites.has(x.code) || r.entreprises.has(siren) || refuses.has(siren)) n = null;
    else {
      // Une société sous le nom que le registre publie, un entrepreneur sous celui de SIRENE.
      const s = noms.get(siren);
      if (s?.ei) n = s.nom;
      else if (!n && s) n = s.nom;
    }
    if (n) nommes++;
    else tus++;
    return n;
  };

  const ssp = new Map<string, { n: number; i: number[]; s: LigneSsp[] }>();
  for (const [c, l] of parCommuneSites) {
    const i = inventaires.map(() => 0);
    for (const s of l) for (const k of s.inv) i[k]++;
    ssp.set(c, {
      n: l.length,
      i,
      s: l.slice(0, MAX_LISTE).map((s) => [s.code, nommer(s), s.etat, s.inv, s.fiche, s.act]),
    });
  }
  const icpe = new Map<string, { n: number; r: number[]; sv: [number, number]; l: LigneIcpe[] }>();
  for (const [c, l] of parCommuneIcpe) {
    const r = regimes.map(() => 0);
    const sv: [number, number] = [0, 0];
    for (const x of l) {
      r[x.regime]++;
      if (x.seveso) sv[x.seveso - 1]++;
    }
    icpe.set(c, {
      n: l.length,
      r,
      sv,
      l: l.slice(0, MAX_LISTE).map((x) => [x.code, nommer(x), x.regime, x.seveso, x.drapeaux, x.inspection, x.act]),
    });
  }

  dire(
    `Géorisques : ${sites.size.toLocaleString('fr-FR')} sites et sols pollués dans ${ssp.size.toLocaleString('fr-FR')} communes, ` +
      `${installations.size.toLocaleString('fr-FR')} installations classées dans ${icpe.size.toLocaleString('fr-FR')} communes` +
      (sansCommune ? `, ${sansCommune.toLocaleString('fr-FR')} lignes sans commune connue écartées` : '') +
      ` ; exploitants : ${nommes.toLocaleString('fr-FR')} nommés, ${tus.toLocaleString('fr-FR')} non nommés.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), inventaires, etats, regimes, activites, ssp, icpe };
}

/** Deux fichiers par département ; les tables de libellés y sont recopiées pour que chacun se suffise. */
export function ecrireGeorisques(sortie: string, g: Georisques): number {
  const a = ecrireParDepartement(sortie, 'sols-pollues', g.ssp, () => ({
    maj: g.maj,
    inventaires: g.inventaires,
    etats: g.etats,
    activites: g.activites,
  }));
  const b = ecrireParDepartement(sortie, 'icpe', g.icpe, () => ({ maj: g.maj, regimes: g.regimes, activites: g.activites }));
  return Math.max(a, b);
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const g = await collecterGeorisques(telecharger, async (url) => (await obstine(url)).text(), cache, console.log);
  if (g) console.log(`${ecrireGeorisques(sortie, g)} départements écrits.`);
}
