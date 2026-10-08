/**
 * Les associations qui se créent dans une commune, d'après le RNA.
 *
 * Le site dit qui décide, ce que la commune dépense, ce qu'elle commande et ce
 * qu'elle verse aux associations. Il ne disait rien de ce qui se monte ici sans
 * qu'aucune collectivité ait à le décider — et c'est pourtant la forme
 * d'organisation collective la plus répandue du pays.
 *
 * **Le site compte des créations, pas des associations vivantes, et ce n'est
 * pas un pis-aller.** Le répertoire se lit en deux fichiers, que le ministère
 * partage ainsi : `waldec` porte les associations créées ou ayant déclaré un
 * changement depuis 2009, `import` celles créées depuis 1901 qui n'ont rien
 * déclaré depuis. Or `import` ne porte **aucun code INSEE** — seulement un code
 * postal, qui couvre plusieurs communes — et sa colonne de position marque
 * encore « active » des associations déclarées en 1903. En faire un compte
 * d'associations par commune donnerait un total faux dans les deux sens à la
 * fois : trop haut par les dormantes, mal placé par le code postal.
 *
 * Une date de création, elle, est un fait daté, et le partage annoncé se
 * vérifie dans la donnée : les créations d'`import` s'arrêtent en 2009 — 1 415
 * cette année-là, puis une poignée de dates manifestement fautives, jusqu'à
 * 2029. **Waldec est donc complet pour tout ce qui se crée depuis 2010.**
 *
 * Ce que le répertoire ne dit pas non plus : si une association fonctionne
 * encore. La dissolution se déclare, elle ne se constate pas, et beaucoup ne
 * sont jamais déclarées. Compter les créations d'une fenêtre récente évite
 * d'avoir à en juger.
 *
 * **L'Alsace-Moselle n'y figure pas, et ce n'est pas un trou.** Une association
 * n'y est pas déclarée en préfecture mais inscrite au registre des associations
 * tenu par le greffe du tribunal judiciaire, sous le code civil local : le
 * répertoire national porte vingt et une lignes pour le Bas-Rhin, onze pour la
 * Moselle et deux pour le Haut-Rhin, contre vingt-deux mille pour la
 * Meurthe-et-Moselle voisine. Aucun fichier n'est donc écrit pour ces trois
 * départements, et le panneau y dit où se consulte le registre plutôt que de
 * rester muet.
 *
 * **Le code de commune déclaré n'est pas toujours celui d'une commune
 * actuelle**, et le découpage sait le reporter : `commune` pour un
 * arrondissement municipal, `chefLieu` pour une commune déléguée ou associée.
 * Sans ce report, onze pour cent des créations ne tombaient sur rien ; avec
 * lui, deux centièmes de pour cent.
 *
 * **L'adresse déclarée n'est pas reprise.** Le siège d'une petite association
 * est souvent le domicile de celui qui l'a déclarée. Le site en retient la
 * commune, rien d'autre : ni la voie, ni le numéro, ni la civilité du
 * dirigeant, que le répertoire publie pourtant.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { debutFenetre, GENRES, type Evenement } from '../src/modele/journal.ts';

/**
 * Le fichier Waldec, en CSV consolidé.
 *
 * Le ministère publie chaque mois une archive dont le nom porte sa date ; la
 * plateforme de données ouvertes en tient à côté une version aplatie, sous une
 * adresse qui, elle, ne bouge pas. C'est celle-ci qu'on lit : l'autre
 * demanderait de découvrir le millésime à chaque ingestion, et le catalogue
 * n'est pas joignable depuis cet environnement. En contrepartie, un fichier
 * réécrit au même nom ne signale rien quand il cesse d'être tenu à jour —
 * d'où la veille sur sa date de dernière modification plutôt que sur sa
 * disponibilité.
 *
 * Licence Ouverte, comme tout ce que le site réutilise.
 */
const WALDEC = 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/rna/waldec.csv';

/**
 * Les vingt-neuf domaines de la nomenclature WALDEC, par le préfixe du code.
 *
 * Comme pour les actes des délibérations : **le code fait foi, pas le
 * libellé**, et c'est son préfixe de trois chiffres qui porte le domaine. La
 * nomenclature publie aussi, à côté, un rattachement explicite de chaque code
 * à son parent ; vingt de ses deux cent quatre-vingt-dix-sept entrées s'y
 * contredisent — « cantines, restaurants d'entreprises » (022510) y est rangé
 * sous la représentation d'intérêts économiques, « amicale de sapeurs
 * pompiers » (036510) sous un parent que la table des parents ne nomme même
 * pas. Le préfixe, lui, les range sous la conduite d'activités économiques et
 * sous la sécurité civile : il tombe juste dans les vingt cas.
 *
 * Les libellés sont ceux de la nomenclature, seule la casse a changé — elle y
 * est tout en capitales.
 */
export const DOMAINES: [string, string][] = [
  ['001', 'Activités politiques'],
  ['002', 'Clubs, cercles de réflexion'],
  ['003', 'Défense de droits fondamentaux, activités civiques'],
  ['004', 'Justice'],
  ['005', 'Information, communication'],
  ['006', "Culture, pratiques d'activités artistiques"],
  ['007', 'Clubs de loisirs, relations'],
  ['009', 'Action socioculturelle'],
  ['010', 'Préservation du patrimoine'],
  ['011', 'Sports, activités de plein air'],
  ['013', 'Chasse, pêche'],
  ['014', "Amicales, groupements d'entraide"],
  ['015', 'Éducation, formation'],
  ['016', 'Recherche'],
  ['017', 'Santé'],
  ['018', 'Services et établissements médico-sociaux'],
  ['019', 'Interventions sociales'],
  ['020', 'Associations caritatives, humanitaires, bénévolat'],
  ['021', 'Services familiaux, services aux personnes âgées'],
  ['022', "Conduite d'activités économiques"],
  ['023', "Représentation et défense d'intérêts économiques"],
  ['024', 'Environnement, cadre de vie'],
  ['030', "Aide à l'emploi, développement local, vie locale"],
  ['032', 'Logement'],
  ['034', 'Tourisme'],
  ['036', 'Sécurité, protection civile'],
  ['038', 'Armée, anciens combattants'],
  ['040', 'Activités religieuses, spirituelles ou philosophiques'],
  ['050', 'Domaines divers'],
];

const RANG_DOMAINE = new Map(DOMAINES.map(([code], i) => [code, i]));

/** Combien d'années civiles complètes la fenêtre couvre. */
const ANNEES = 6;

/** Combien de créations récentes le fichier du département nomme, par commune. */
const PAR_COMMUNE = 4;

/** Au-delà, l'intitulé cesse d'informer et pèse sur chaque ligne. */
const MAX_TITRE = 70;

/** Combien de domaines le fichier retient : ceux que le panneau montre. */
const DOMAINES_RETENUS = 6;

/**
 * Une création : le mois, l'intitulé, le domaine.
 *
 * Un triplet plutôt qu'un objet — trente octets de noms de champs par ligne,
 * quatre lignes par commune et trente mille communes finissent par peser
 * davantage que ce qu'ils nomment. Le mois et non le jour, pour la même
 * raison : le panneau écrit « avril 2025 », et le jour exact n'y paraît pas.
 */
export type Creation = [mois: string, titre: string, domaine: number];

/**
 * Une association existante : l'intitulé, le début de l'objet déclaré, le
 * domaine, l'année de création, le site qu'elle déclare.
 *
 * « Existante » au sens du fichier : non dissoute (position A, sans date de
 * dissolution), et ayant déclaré une création ou une modification depuis
 * 2009. Une association en sommeil qui n'a jamais déclaré sa dissolution y
 * reste ; une association qui n'a rien déclaré depuis 2009 n'y est pas, mais
 * dans le fichier historique, sans code de commune.
 */
export type Existante = [titre: string, objet: string, domaine: number, annee: number, site: string];
/**
 * Les existantes écrites dans le fichier du département, de la plus
 * récemment déclarée à la plus ancienne ; la suite a son propre fichier,
 * `associations/<code>.json`, que le bouton « Voir les autres » va chercher.
 */
const EXISTANTES_LISTEES = 20;
const MAX_OBJET = 70;

export interface AssociationsCommune {
  /** Créations sur la fenêtre. */
  n: number;
  /** Créations année par année, de la plus ancienne à la plus récente. */
  a: number[];
  /** Par domaine, du plus fourni au moins fourni : son index, puis le nombre. */
  d: [number, number][];
  /** Les plus récentes, chacune avec son mois. */
  r: Creation[];
  /** Les associations existantes : leur nombre complet. */
  e?: number;
  /** Les plus récemment déclarées, plafonnées à `EXISTANTES_LISTEES`. */
  x?: Existante[];
}

export interface Associations {
  maj: string;
  /** Les années civiles de la fenêtre. */
  annees: number[];
  communes: Map<string, AssociationsCommune>;
  /**
   * Les créations des derniers mois, pour le journal.
   *
   * Elles tombent hors de la fenêtre de comptage, qui s'arrête à la dernière
   * année civile complète : ce sont précisément celles qu'un habitant veut
   * voir passer, et le décompte ne les verra qu'au premier janvier.
   */
  evenements: Evenement[];
  /** Créations pour mille habitants sur la fenêtre : la médiane nationale. */
  mediane: number;
  /** Sur combien de communes cette médiane est calculée. */
  effectif: number;
  /** Créations qu'aucune commune du découpage ne réclame. */
  horsDecoupage: number;
  /** Les existantes au-delà des vingt du fichier du département, par commune. */
  suites: Map<string, Existante[]>;
  total: number;
}

/**
 * Le fichier fait 1,2 Go : il se lit en flux, jamais en mémoire.
 *
 * `lignes` est fourni par l'ingestion, qui sait déjà lire un CSV du cache
 * ligne à ligne — c'est ce qu'elle fait pour le référentiel FINESS.
 */
export async function collecterAssociations(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lignes: (chemin: string) => AsyncIterable<Record<string, string>>,
  /** Population par commune : la comparaison se fait pour mille habitants. */
  populations: Map<string, number>,
  /**
   * Le report d'un code qui n'est plus celui d'une commune actuelle vers celle
   * qui l'a repris : un arrondissement vers sa commune, une commune déléguée ou
   * associée vers sa commune nouvelle.
   *
   * Sans lui, onze pour cent des créations ne se rattachaient à rien — quatre
   * cinquièmes parce que Paris, Lyon et Marseille déclarent par arrondissement,
   * et le reste parce qu'une association déclarée à Annecy-le-Vieux porte
   * encore le code d'avant la fusion.
   */
  reports: Map<string, string>,
  dire: (m: string) => void,
): Promise<Associations | null> {
  const fichier = join(cache, 'rna-waldec.csv');
  try {
    await telecharger(WALDEC, fichier);
  } catch {
    dire('RNA indisponible : les associations restent celles de l’ingestion précédente.');
    return null;
  }

  // La fenêtre s'arrête à la dernière année civile complète : l'année en cours
  // est tronquée, et son barreau ferait croire à une chute.
  const derniere = new Date().getFullYear() - 1;
  const annees = Array.from({ length: ANNEES }, (_, i) => derniere - ANNEES + 1 + i);
  const premiere = annees[0];

  const communes = new Map<string, AssociationsCommune>();
  let total = 0;
  let horsDecoupage = 0;
  let ecartees = 0;

  // Le journal regarde plus près que le décompte : les créations des derniers
  // mois sont celles qu'on veut voir passer, et le comptage par année civile
  // close ne les verra qu'au premier janvier.
  const debutJournal = debutFenetre();
  const evenements: Evenement[] = [];
  const GENRE = GENRES.indexOf('Association créée');

  // Les existantes, avec la date de leur dernière déclaration le temps du tri.
  const existantes = new Map<string, { n: number; l: [string, Existante][] }>();
  const garder = (code: string, decla: string, x: Existante) => {
    let e = existantes.get(code);
    if (!e) {
      e = { n: 0, l: [] };
      existantes.set(code, e);
    }
    e.n++;
    e.l.push([decla, x]);
  };
  const siteDe = (brut: string) => {
    try {
      const u = new URL(/^https?:\/\//i.test(brut) ? brut : `https://${brut}`);
      return brut && u.hostname.includes('.') ? u.href : '';
    } catch {
      return '';
    }
  };

  for await (const l of lignes(fichier)) {
    const disso = (l['date_disso'] ?? '').trim();
    if (l['position'] === 'A' && (!disso || disso.startsWith('0001'))) {
      const brutX = (l['adrs_codeinsee'] ?? '').trim();
      const codeX = reports.get(brutX) ?? brutX;
      const titreX = (l['titre'] ?? '').trim();
      if (populations.has(codeX) && titreX && !nommeUnePersonne(titreX)) {
        const objet = (l['objet'] ?? '').replace(/\s+/g, ' ').trim();
        garder(codeX, (l['date_decla'] ?? '').slice(0, 10), [
          titreX.length > MAX_TITRE ? `${titreX.slice(0, MAX_TITRE - 1)}…` : titreX,
          objet.length > MAX_OBJET ? `${objet.slice(0, MAX_OBJET - 1)}…` : objet,
          RANG_DOMAINE.get((l['objet_social1'] ?? '').slice(0, 3)) ?? -1,
          Number.parseInt((l['date_creat'] ?? '').slice(0, 4), 10) || 0,
          siteDe((l['siteweb'] ?? '').trim()),
        ]);
      }
    }
    const jour = (l['date_creat'] ?? '').slice(0, 10);
    const annee = Number.parseInt(jour.slice(0, 4), 10);
    const pourCompte = Number.isFinite(annee) && annee >= premiere && annee <= derniere;
    const pourJournal = jour >= debutJournal;
    if (!pourCompte && !pourJournal) continue;
    const brut = (l['adrs_codeinsee'] ?? '').trim();
    const code = reports.get(brut) ?? brut;
    if (pourCompte) total++;
    if (!populations.has(code)) {
      if (pourCompte) horsDecoupage++;
      continue;
    }
    const titre = (l['titre'] ?? '').trim();
    if (!titre) continue;
    // Une association porte un nom de personne morale. Le filtre qui vaut pour
    // le reste du site s'applique quand même : un intitulé qui commence par une
    // civilité désigne quelqu'un, pas un groupement.
    if (nommeUnePersonne(titre)) {
      if (pourCompte) ecartees++;
      continue;
    }
    const domaine = RANG_DOMAINE.get((l['objet_social1'] ?? '').slice(0, 3)) ?? -1;
    if (pourJournal) {
      evenements.push({
        genre: GENRE,
        date: jour,
        quoi: titre.length > MAX_TITRE ? `${titre.slice(0, MAX_TITRE - 1)}…` : titre,
        detail: domaine >= 0 ? DOMAINES[domaine][1] : undefined,
        commune: code,
      });
    }
    if (!pourCompte) continue;

    let c = communes.get(code);
    if (!c) {
      c = { n: 0, a: new Array<number>(ANNEES).fill(0), d: [], r: [] };
      communes.set(code, c);
    }
    c.n++;
    c.a[annee - premiere]++;
    if (domaine >= 0) {
      const deja = c.d.find(([i]) => i === domaine);
      if (deja) deja[1]++;
      else c.d.push([domaine, 1]);
    }
    // La date entière le temps du tri : deux créations du même mois ne se
    // départageraient pas si on tronquait avant de trier.
    c.r.push([
      (l['date_creat'] ?? '').slice(0, 10),
      titre.length > MAX_TITRE ? `${titre.slice(0, MAX_TITRE - 1)}…` : titre,
      domaine,
    ]);
  }

  if (communes.size === 0) {
    dire('RNA : aucune création rattachée, rien à écrire.');
    return null;
  }

  let nExistantes = 0;
  const suites = new Map<string, Existante[]>();
  for (const [code, e] of existantes) {
    let c = communes.get(code);
    if (!c) {
      c = { n: 0, a: new Array<number>(ANNEES).fill(0), d: [], r: [] };
      communes.set(code, c);
    }
    e.l.sort((a, b) => b[0].localeCompare(a[0]));
    c.e = e.n;
    c.x = e.l.slice(0, EXISTANTES_LISTEES).map(([, x]) => x);
    if (e.l.length > EXISTANTES_LISTEES) suites.set(code, e.l.slice(EXISTANTES_LISTEES).map(([, x]) => x));
    nExistantes += e.n;
  }

  for (const c of communes.values()) {
    c.d.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    c.d = c.d.slice(0, DOMAINES_RETENUS);
    c.r.sort((a, b) => b[0].localeCompare(a[0]));
    c.r = c.r.slice(0, PAR_COMMUNE).map(([date, titre, dom]) => [date.slice(0, 7), titre, dom]);
  }

  // La médiane porte sur toutes les communes peuplées, celles sans création
  // comprises : les écarter ferait remonter la référence de tout ce que le
  // silence pèse, et c'est précisément à ce silence qu'on se compare.
  const taux: number[] = [];
  for (const [code, pop] of populations) {
    if (pop > 0) taux.push(((communes.get(code)?.n ?? 0) / pop) * 1000);
  }
  taux.sort((a, b) => a - b);
  const mediane = taux.length > 0 ? taux[Math.floor(taux.length / 2)] : 0;

  dire(
    `RNA : ${total.toLocaleString('fr-FR')} créations de ${premiere} à ${derniere} pour ` +
      `${communes.size.toLocaleString('fr-FR')} communes` +
      (horsDecoupage > 0
        ? `, ${horsDecoupage.toLocaleString('fr-FR')} sur un code hors découpage ` +
          `(${((horsDecoupage / total) * 100).toFixed(2)} %)`
        : '') +
      (ecartees > 0 ? `, ${ecartees.toLocaleString('fr-FR')} écartées (intitulé nommant une personne)` : '') +
      `. Médiane ${mediane.toFixed(1)} pour mille habitants sur ${ANNEES} ans, ` +
      `${evenements.length.toLocaleString('fr-FR')} créations pour le journal, ` +
      `${nExistantes.toLocaleString('fr-FR')} associations existantes dans ${existantes.size.toLocaleString('fr-FR')} communes.`,
  );

  return {
    maj: new Date().toISOString().slice(0, 10),
    annees,
    communes,
    evenements,
    mediane,
    effectif: taux.length,
    horsDecoupage,
    suites,
    total,
  };
}

/**
 * Un fichier par département, comme le reste : le panneau n'en charge qu'un.
 *
 * La table des domaines y est recopiée — vingt-neuf entrées, un kilo-octet —
 * pour que le fichier se suffise à lui-même, comme celui des marchés recopie
 * la liste des procédures.
 */
export function ecrireAssociations(
  sortie: string,
  dep: string,
  codes: string[],
  a: Associations,
): number {
  const c: Record<string, AssociationsCommune> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const fiche = a.communes.get(code);
    if (!fiche || (fiche.n === 0 && !fiche.e)) continue;
    c[code] = fiche;
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(
    join(sortie, 'dep', `${dep}-associations.json`),
    JSON.stringify({
      maj: a.maj,
      annees: a.annees,
      domaines: DOMAINES.map(([, nom]) => nom),
      mediane: Number(a.mediane.toFixed(2)),
      effectif: a.effectif,
      c,
    }),
  );
  return n;
}

/**
 * La liste complète des associations existantes, à la demande : un fichier par
 * commune qui en compte plus que le fichier du département n'en porte. Le
 * dossier est refait à chaque fois, pour qu'une commune qui en a perdu ne
 * garde pas l'ancienne liste.
 */
export function ecrireSuitesAssociations(sortie: string, a: Associations): number {
  if (a.suites.size === 0) return 0;
  const dossier = join(sortie, 'associations');
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(dossier, { recursive: true });
  for (const [code, x] of a.suites) writeFileSync(join(dossier, `${code}.json`), JSON.stringify({ x }));
  return a.suites.size;
}
