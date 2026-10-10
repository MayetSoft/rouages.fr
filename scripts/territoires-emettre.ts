/**
 * Écriture des fichiers de résolution territoriale.
 *
 * Deux niveaux, pour ne pas faire télécharger la France entière à quelqu'un qui
 * cherche sa commune :
 *
 *   index.json      un index de recherche léger — code, nom, code postal ;
 *   dep/<dep>.json  le détail d'un département : ses communes, les groupements
 *                   dont elles dépendent, et les compétences que ceux-ci
 *                   exercent réellement.
 *
 * Les formats sont colonnaires et sans clés répétées : la donnée est faite pour
 * être transférée, pas pour être lue à l'œil nu — le script, lui, se relit.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { chargerGraphe } from '../src/modele/graphe.ts';
import type { Repere } from '../src/modele/schemas.ts';
import { ecrireFinances, metaFinances, type ComptesCommunes } from './finances-emettre.ts';
import { ecrireFlux, type FluxGroupements } from './flux-emettre.ts';
import { ecrireEcoles, type Effectifs } from './ecoles-emettre.ts';
import { ecrireElus, type Elus } from './elus-emettre.ts';
import { echelonsDuDepartement } from '../src/modele/collectivites-sirens.ts';
import { ecrireAttributionsNationales, ecrireAvisNationaux, ecrireEcheancesNationales, ecrireMarches, ecrireSuitesMarches, type Marches } from './marches-emettre.ts';
import { ecrireSru, type InventaireSru } from './sru-emettre.ts';
import { ecrireDmto, type Dmto } from './dmto-emettre.ts';
import { ecrireEchelons, type Echelons } from './echelons-emettre.ts';
import { ecrireAssociations, ecrireSuitesAssociations, type Associations } from './associations-emettre.ts';
import { ecrirePopulations, type Populations } from './population-emettre.ts';
import { ecrireConseils, type Conseils } from './conseils-emettre.ts';
import { ecrireUrbanisme, type Urbanisme } from './urbanisme-emettre.ts';
import { ecrirePlu, type Plu } from './plu-emettre.ts';
import { ecrireLogements, type Logements } from './logements-emettre.ts';
import { ecrireFiscalite, type Fiscalite } from './fiscalite-emettre.ts';
import { ecrireEquipements, type Equipements } from './equipements-emettre.ts';
import { ecrireJournal, rassembler } from './journal-emettre.ts';
import { comparerTransferts, type EtatDep } from './transferts-emettre.ts';
import { retenir } from '../src/modele/journal.ts';
import { ecrireRisques, type Risques } from './risques-emettre.ts';
import { ecrireElections, type Elections } from './elections-emettre.ts';
import { ecrireDeliberations, type Deliberations } from './deliberations-emettre.ts';
import { ecrireSubventions, type Subventions } from './subventions-emettre.ts';
import { prefixesEchelon, sirensParPrefixe } from './donnees-ouvertes.ts';
import { ecrireEau, serviceDe, type Eau, type ServiceEau } from './eau-emettre.ts';
import {
  ecrireServices,
  replierArrondissements,
  FAMILLES_SERVICE,
  FAMILLES_VOISINAGE,
  type Services,
} from './services-emettre.ts';

interface Groupement {
  siren: string;
  nom: string;
  nature: string;
  codes: Set<string>;
  membres: Set<string>;
}

interface DepartementEtalab {
  code: string;
  nom: string;
  /** Code de la région dont il relève. */
  region?: string;
}

interface RegionEtalab {
  code: string;
  nom: string;
}

interface CommuneEtalab {
  code: string;
  nom: string;
  type: string;
  siren?: string;
  departement?: string;
  region?: string;
  codesPostaux?: string[];
  population?: number;
  /** Renseigné pour un arrondissement municipal : la commune dont il relève. */
  commune?: string;
}

export function emettre(o: {
  graphe: ReturnType<typeof chargerGraphe>;
  groupements: Map<string, Groupement>;
  codesSuivis: Map<string, string[]>;
  /** Le libellé de chaque code BANATIC : le journal nomme ce qui est transféré. */
  libelleDeCode: Map<string, string>;
  dateExport: string;
  natures: Map<string, string>;
  finances: ComptesCommunes | null;
  eau: Eau | null;
  services: Services | null;
  reperesGfp: Repere[];
  fluxGfp: FluxGroupements | null;
  effectifs: Effectifs | null;
  elus: Elus | null;
  marches: Marches | null;
  sru: InventaireSru | null;
  dmto: Dmto | null;
  echelons: Echelons | null;
  risques: Risques | null;
  associations: Associations | null;
  populations: Populations | null;
  conseils: Conseils | null;
  urbanisme: Urbanisme | null;
  plu: Plu | null;
  logements: Logements | null;
  fiscalite: Fiscalite | null;
  equipements: Equipements | null;
  elections: Elections | null;
  deliberations: Deliberations | null;
  subventions: Subventions | null;
  etatCivil?: import('./etat-civil-emettre.ts').EtatCivil | null;
  entreprises?: import('./entreprises-emettre.ts').Entreprises | null;
  sortie: string;
  dire: (m: string) => void;
  VERT: string;
  RAZ: string;
  GRIS: string;
}) {
  const { groupements, codesSuivis, dateExport, natures, finances, eau, services, sortie, dire, VERT, RAZ, GRIS } = o;

  // Le découpage administratif vient d'un paquet npm plutôt que d'une API :
  // le registre est autrement plus fiable qu'un service web, et la version est
  // épinglée dans package.json — donc reproductible.
  const lire = <T,>(f: string): T =>
    JSON.parse(
      readFileSync(createRequire(import.meta.url).resolve(`@etalab/decoupage-administratif/data/${f}`), 'utf8'),
    ) as T;
  const toutesLesEntrees = lire<CommuneEtalab[]>('communes.json');
  const communes = toutesLesEntrees.filter(
    (c) => c.type === 'commune-actuelle' && c.siren && c.departement,
  );

  // Paris, Lyon et Marseille n'existent pas dans les référentiels de services :
  // une école parisienne est déposée sous le code de son arrondissement (75112),
  // jamais sous celui de la commune (75056). Sans ce repli, les trois plus
  // grandes villes de France apparaîtraient dépourvues d'école et d'hôpital.
  // Le rattachement vient du découpage lui-même, pas de plages de codes écrites
  // à la main.
  const communeDeArrondissement = new Map<string, string>();
  for (const c of toutesLesEntrees) {
    if (c.type === 'arrondissement-municipal' && c.commune) {
      communeDeArrondissement.set(c.code, c.commune);
    }
  }
  if (services) {
    const replies = replierArrondissements(services, communeDeArrondissement);
    if (replies > 0) {
      dire(
        `${GRIS}${replies.toLocaleString('fr-FR')} services d'arrondissement rattachés ` +
          `à Paris, Lyon et Marseille.${RAZ}`,
      );
    }
  }
  // Le nom du département, pas son numéro : « Sarthe » se reconnaît, « 72 » non.
  // Plus d'une commune sur dix porte un nom qu'une autre porte aussi.
  const departements = lire<DepartementEtalab[]>('departements.json');
  const nomsDep = new Map(departements.map((d) => [d.code, d.nom]));
  // La région de chaque département : c'est elle qui répond quand la loi la
  // désigne à défaut d'intercommunalité — pour la mobilité, notamment.
  const nomsRegion = new Map(lire<RegionEtalab[]>('regions.json').map((r) => [r.code, r.nom]));
  const regionDeDep = new Map(
    departements.filter((d) => d.region).map((d) => [d.code, nomsRegion.get(d.region!) ?? d.region!]),
  );
  // Le code, à côté du nom : les comptes de l'OFGL sont classés par code de
  // région, et un nom ne retrouve pas une ligne de compte.
  const codeRegionDeDep = new Map(
    departements.filter((d) => d.region).map((d) => [d.code, d.region!]),
  );
  // Le chef-lieu de la région : c'est son code de département qui compose le
  // SIREN de la collectivité régionale.
  const chefLieuxRegion = new Map(
    lire<(RegionEtalab & { chefLieu?: string })[]>('regions.json').map((r) => [r.code, r.chefLieu]),
  );
  const chefLieuDeRegion = new Map(
    departements
      .filter((d) => d.region)
      .map((d) => [d.code, chefLieuxRegion.get(d.region!)] as const),
  );
  dire(`${GRIS}${communes.length.toLocaleString('fr-FR')} communes au découpage Etalab.${RAZ}`);

  // Qui est membre de quoi. Un membre peut être une commune ou un autre
  // groupement : c'est ainsi qu'une commune se retrouve rattachée à un syndicat
  // auquel elle n'a jamais adhéré directement, via son intercommunalité.
  const appartient = new Map<string, string[]>();
  for (const g of groupements.values()) {
    for (const m of g.membres) {
      if (!appartient.has(m)) appartient.set(m, []);
      appartient.get(m)!.push(g.siren);
    }
  }

  /** Fermeture transitive : tous les groupements qui pèsent sur une commune. */
  const closure = (sirenCommune: string): string[] => {
    const vus = new Set<string>();
    const file = [sirenCommune];
    while (file.length > 0) {
      for (const g of appartient.get(file.shift()!) ?? []) {
        if (vus.has(g)) continue;
        vus.add(g);
        file.push(g);
      }
    }
    return [...vus];
  };

  const utiles = (sirens: string[]) =>
    sirens.filter((s) => (groupements.get(s)?.codes.size ?? 0) > 0);

  // --- index de recherche ------------------------------------------------
  // La population accompagne chaque entrée : entre deux homonymes, la taille
  // départage bien plus sûrement qu'un code postal que personne ne retient.
  // Tous les codes postaux, pas seulement le premier : une commune un peu
  // étendue en a plusieurs, et l'habitant ne connaît que le sien.
  const index = communes.map((c) => [
    c.code,
    c.nom,
    (c.codesPostaux ?? []).join(' '),
    c.departement!,
    c.population ?? 0,
  ]);
  ecrireJson(join(sortie, 'index.json'), {
    maj: dateExport,
    deps: Object.fromEntries(nomsDep),
    c: index,
  });
  // Les noms de département seuls : deux kilo-octets, là où l'index entier en
  // pèse 1 400. Arriver sur une commune déjà choisie ne doit pas coûter le
  // catalogue de la France.
  ecrireJson(join(sortie, 'deps.json'), Object.fromEntries(nomsDep));

  // --- un fichier par département ---------------------------------------
  mkdirSync(join(sortie, 'dep'), { recursive: true });
  const parDep = new Map<string, CommuneEtalab[]>();
  for (const c of communes) {
    if (!parDep.has(c.departement!)) parDep.set(c.departement!, []);
    parDep.get(c.departement!)!.push(c);
  }

  // Couverture : la part des communes d'un département pour lesquelles un
  // exerçant est identifié, compétence par compétence.
  //
  // Elle n'est pas cosmétique. BANATIC a des trous : dans la Sarthe, 54 communes
  // sur 352 ont un exerçant identifié pour la concession électrique, contre
  // 391/391 dans l'Ain. Sans cette mesure, le site conclurait « la commune s'en
  // charge » là où le registre est simplement muet — se tromper avec aplomb est
  // exactement ce qu'on ne peut pas se permettre ici.
  const compsSuivies = [...new Set([...codesSuivis.values()].flat())];
  const codesDeComp = new Map(
    compsSuivies.map((c) => [c, [...codesSuivis].filter(([, v]) => v.includes(c)).map(([k]) => k)]),
  );
  const couvertureNationale = new Map<string, number>(compsSuivies.map((c) => [c, 0]));
  const totalCommunes = communes.length;

  // La compétence qui déclare un indicateur SISPEA : c'est elle qui dit quelle
  // structure interroger pour le prix.
  const compEau = [...o.graphe.competences.values()].find((c) => c.sispea)?.id;
  const codesEau = compEau ? (codesDeComp.get(compEau) ?? []) : [];
  let servicesEau = 0;

  // Une France services ne déclare pas le territoire qu'elle dessert. Mais la
  // commune qui n'en accueille pas appartient à une intercommunalité, et celle
  // d'à côté en a peut-être une : c'est un rattachement réel, que le site
  // résout déjà, là où une distance à vol d'oiseau ne dirait que la géométrie.
  const A_FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'EPT', 'SAN']);
  const epciDe = new Map<string, string>();
  for (const c of communes) {
    const epci = closure(c.siren!).find((s) => A_FISCALITE_PROPRE.has(groupements.get(s)?.nature ?? ''));
    if (epci) epciDe.set(c.code, epci);
  }
  // famille -> EPCI -> les guichets que ses communes accueillent. Une école ne
  // s'y trouve pas : elle est dans la commune ou elle n'y est pas.
  const parEpci = new Map<string, Map<string, { nom: string; commune: string; code: string }[]>>();
  if (services) {
    for (const famille of FAMILLES_VOISINAGE) parEpci.set(famille, new Map());
    for (const c of communes) {
      const epci = epciDe.get(c.code);
      if (!epci) continue;
      for (const s of services.parCommune.get(c.code) ?? []) {
        const index = parEpci.get(s.famille);
        if (!index) continue;
        if (!index.has(epci)) index.set(epci, []);
        index.get(epci)!.push({ nom: s.nom, commune: c.nom, code: c.code });
      }
    }
  }
  let servicesEcrits = 0;
  let ecolesEcrites = 0;
  let elusEcrits = 0;
  let marchesEcrits = 0;
  let sruEcrits = 0;
  let risquesEcrits = 0;
  let assoEcrites = 0;
  let popEcrites = 0;
  let conseilsEcrits = 0;
  let urbanismeEcrit = 0;
  let pluEcrit = 0;
  let logementsEcrits = 0;
  let fiscaliteEcrite = 0;
  let equipementsEcrits = 0;
  let journalEcrit = 0;
  let transfertsVus = 0;
  let electionsEcrites = 0;
  let delibEcrites = 0;
  let subvEcrites = 0;

  // Rassemblé une fois pour toute la France : chaque département n'en prend
  // ensuite que ce qui le concerne.
  const journal = rassembler({
    marches: o.marches,
    risques: o.risques,
    elus: o.elus,
    deliberations: o.deliberations,
    subventions: o.subventions,
    associations: o.associations,
    etatCivil: o.etatCivil ?? null,
    entreprises: o.entreprises ?? null,
  });
  const majJournal = new Date().toISOString().slice(0, 10);

  let couvertes = 0;
  let sansRattachement = 0;
  for (const [dep, liste] of parDep) {
    // Le maire ne dépend d'aucun autre référentiel : il s'écrit même si
    // l'annuaire des services n'a pas répondu.
    if (o.elus) elusEcrits += ecrireElus(sortie, dep, liste.map((c) => c.code), o.elus);

    if (o.sru) sruEcrits += ecrireSru(sortie, dep, liste.map((c) => c.code), o.sru);

    if (o.risques) {
      risquesEcrits += ecrireRisques(sortie, dep, liste.map((c) => c.code), o.risques);
    }

    if (o.associations) {
      assoEcrites += ecrireAssociations(sortie, dep, liste.map((c) => c.code), o.associations);
    }

    if (o.populations) {
      popEcrites += ecrirePopulations(sortie, dep, liste.map((c) => c.code), o.populations);
    }

    if (o.conseils) {
      conseilsEcrits += ecrireConseils(sortie, dep, liste.map((c) => c.code), o.conseils);
    }

    if (o.urbanisme) {
      urbanismeEcrit += ecrireUrbanisme(sortie, dep, liste.map((c) => c.code), o.urbanisme);
      // Le filtre a besoin de l'horizon de l'enquête : sans elle, rien à dire.
      if (o.plu) {
        pluEcrit += ecrirePlu(
          sortie,
          dep,
          liste.map((c) => c.code),
          o.plu,
          o.urbanisme.jusquau,
        );
      }
    }

    if (o.logements) {
      logementsEcrits += ecrireLogements(sortie, dep, liste.map((c) => c.code), o.logements);
    }

    if (o.fiscalite) {
      fiscaliteEcrite += ecrireFiscalite(sortie, dep, liste.map((c) => c.code), o.fiscalite);
    }

    if (o.equipements) {
      equipementsEcrits += ecrireEquipements(sortie, dep, liste.map((c) => c.code), o.equipements);
    }

    if (o.elections) {
      electionsEcrites += ecrireElections(sortie, dep, liste.map((c) => c.code), o.elections);
    }

    // Les structures dont dépend ce département, indexées par SIREN : les
    // communes elles-mêmes, et tous les groupements auxquels elles adhèrent.
    // Les mêmes que le panneau sait nommer, et pas d'autres — écrire les
    // marchés d'un groupement que le client n'affiche jamais alourdirait le
    // fichier sans que personne ne les voie.
    const sirens = [
      ...liste.map((c) => c.siren).filter((x): x is string => !!x),
      ...liste.flatMap((c) => (c.siren ? utiles(closure(c.siren)) : [])),
    ];
    const sirenDeCommune = new Map(
      liste.filter((c) => c.siren).map((c) => [c.code, c.siren!] as const),
    );
    // Le département et sa région versent et délibèrent aussi, et c'est là que
    // se décide l'essentiel de ce que le site décrit par ailleurs. Leur SIREN
    // vient de la table tirée de SIRENE, dans l'ordre département puis région ;
    // le préfixe le reconnaît aussi, pour un ancien SIREN que la table ne porte
    // plus — mais pas celui des sept régions de 2016. On ne retient que ceux
    // qui figurent réellement dans la donnée.
    const prefixes = prefixesEchelon(dep, chefLieuDeRegion.get(dep));
    const echelons = echelonsDuDepartement(dep);
    const echelonsDe = (publies: Iterable<string>) => {
      const presents = new Set(publies);
      const parTable = echelons.filter((s) => presents.has(s));
      return [...parTable, ...sirensParPrefixe(prefixes, presents).filter((s) => !parTable.includes(s))];
    };
    const echelonsDelib = o.deliberations ? echelonsDe(o.deliberations.parCollectivite.keys()) : [];
    const echelonsSubv = o.subventions ? echelonsDe(o.subventions.parCollectivite.keys()) : [];

    if (o.marches) {
      marchesEcrits += ecrireMarches(sortie, dep, sirens, sirenDeCommune, o.marches, echelons);
      if (o.deliberations) {
        delibEcrites += ecrireDeliberations(
          sortie,
          dep,
          [...sirens, ...echelonsDelib],
          sirenDeCommune,
          o.deliberations,
          echelonsDelib,
        );
      }
      if (o.subventions) {
        subvEcrites += ecrireSubventions(
          sortie,
          dep,
          [...sirens, ...echelonsSubv],
          sirenDeCommune,
          o.subventions,
          echelonsSubv,
        );
      }
    }

    const refs = new Map<string, number>();
    const table: [string, string, string, string[]][] = [];
    const rows: EtatDep['c'] = liste.map((c) => {
      const g = utiles(closure(c.siren!));
      if (g.length === 0) sansRattachement++;
      else couvertes++;
      const indices = g.map((siren) => {
        if (!refs.has(siren)) {
          const gr = groupements.get(siren)!;
          refs.set(siren, table.length);
          table.push([gr.siren, gr.nom, gr.nature, [...gr.codes]]);
        }
        return refs.get(siren)!;
      });
      // Les codes postaux voyagent ici aussi, pour trois kilo-octets par
      // département : c'est ce qui permet de résoudre une commune connue sans
      // charger l'index national, qui pèse 1,4 Mo (voir `trouverParCode`).
      return [c.code, c.nom, c.population ?? 0, indices, (c.codesPostaux ?? []).join(' ')];
    });

    // Une commune « couverte » pour une compétence est une commune dont l'un des
    // groupements porte l'un des codes de cette compétence.
    const couvertureDep: Record<string, number> = {};
    for (const comp of compsSuivies) {
      const codes = codesDeComp.get(comp)!;
      let n = 0;
      for (const r of rows) {
        const trouve = (r[3] as number[]).some((i) => table[i][3].some((c) => codes.includes(c)));
        if (trouve) n++;
      }
      couvertureDep[comp] = Math.round((n / rows.length) * 100) / 100;
      couvertureNationale.set(comp, couvertureNationale.get(comp)! + n);
    }

    // Ce que le registre a changé depuis l'export précédent. Se lit avant
    // d'écrire : le fichier qu'on s'apprête à remplacer est l'état d'avant.
    const etatNouveau: EtatDep = { maj: dateExport, g: table, c: rows };
    const transferts = comparerTransferts(
      lireEtat(join(sortie, 'dep', `${dep}.json`)),
      etatNouveau,
      o.libelleDeCode,
    );
    transfertsVus += transferts.length;

    ecrireJson(join(sortie, 'dep', `${dep}.json`), {
      dep,
      maj: dateExport,
      g: table,
      c: rows,
      couverture: couvertureDep,
    });

    // Le journal réunit ce que les autres écrivent séparément : il ne
    // s'attache à aucune source, seulement à ce qui est daté — sauf les
    // transferts, qui n'ont pas de date et se déduisent d'une comparaison.
    const duDep = retenir([...journal, ...transferts]);
    if (duDep.length > 0) {
      journalEcrit += ecrireJournal(
        sortie,
        dep,
        liste.map((c) => c.code),
        [...sirens, ...echelonsDelib, ...echelonsSubv],
        sirenDeCommune,
        duDep,
        majJournal,
      );
    }

    if (eau && codesEau.length > 0) {
      const eauxCommunes = new Map<string, ServiceEau>();
      for (const c of liste) {
        const competents = closure(c.siren!).filter((s) =>
          [...(groupements.get(s)?.codes ?? [])].some((code) => codesEau.includes(code)),
        );
        const s = serviceDe(eau, c.siren!, c.code, competents);
        if (s) eauxCommunes.set(c.code, s);
      }
      servicesEau += eauxCommunes.size;
      ecrireEau(sortie, dep, eau, eauxCommunes);
    }

    if (finances) {
      ecrireFinances(
        sortie,
        dep,
        finances,
        liste.map((c) => c.code),
      );
    }

    if (services) {
      const voisines = new Map<string, Map<string, { nom: string; commune: string }[]>>();
      for (const famille of FAMILLES_VOISINAGE) {
        const index = parEpci.get(famille);
        if (!index) continue;
        const parCode = new Map<string, { nom: string; commune: string }[]>();
        for (const c of liste) {
          const epci = epciDe.get(c.code);
          if (!epci) continue;
          // Sans la commune elle-même : ce bloc ne sert qu'à dire ce qui se
          // trouve ailleurs, le reste du panneau nomme déjà ce qui est sur place.
          const autres = (index.get(epci) ?? []).filter((f) => f.code !== c.code);
          if (autres.length > 0) {
            parCode.set(c.code, autres.map((f) => ({ nom: f.nom, commune: f.commune })));
          }
        }
        voisines.set(famille, parCode);
      }
      servicesEcrits += ecrireServices(sortie, dep, liste.map((c) => c.code), services, voisines);

      // Les effectifs des écoles du département, dans leur propre fichier :
      // ils ne servent qu'à qui ouvre le détail d'une commune, et les joindre
      // au fichier des services alourdirait tout le monde.
      if (o.effectifs) {
        const uais = liste
          .flatMap((c) => services.parCommune.get(c.code) ?? [])
          .map((s) => s.uai)
          .filter((u): u is string => !!u);
        ecolesEcrites += ecrireEcoles(sortie, dep, uais, o.effectifs);
      }
    }
  }

  if (o.echelons) {
    const n = ecrireEchelons(sortie, o.echelons);
    dire(`${GRIS}Comptes de l’intercommunalité, du département et de la région : ${n} collectivités.${RAZ}`);
  }

  if (o.dmto) {
    const n = ecrireDmto(sortie, o.dmto);
    dire(`${GRIS}Droits de mutation : ${n} départements chiffrés.${RAZ}`);
  }

  // --- les flux perçus par les groupements, dans leur propre fichier -----
  // Il n'est chargé que si l'on ouvre un flux : le fondre dans meta.json, que
  // toute visite télécharge, ferait payer ce poids à qui ne le lira jamais.
  if (o.fluxGfp && o.reperesGfp.length > 0) {
    const n = ecrireFlux(sortie, o.reperesGfp, o.fluxGfp);
    dire(`${GRIS}Flux des groupements : ${n.toLocaleString('fr-FR')} structures chiffrées.${RAZ}`);
  }

  // --- métadonnées : la correspondance est aussi de la donnée ------------
  ecrireJson(join(sortie, 'meta.json'), {
    maj: dateExport,
    source: 'BANATIC — export national des groupements de communes',
    decoupage: '@etalab/decoupage-administratif',
    // code BANATIC -> compétences de Rouages qu'il permet de résoudre
    codes: Object.fromEntries(codesSuivis),
    // Compétence -> catégories d'intercommunalité auxquelles la loi la
    // transfère de plein droit. BANATIC n'enregistre que les transferts
    // déclarés, et il en manque beaucoup : conclure « la commune » de son
    // silence serait faux là où la loi a déjà tranché.
    obligatoires: Object.fromEntries(
      [...o.graphe.competences.values()]
        .filter((c) => c.obligatoire_pour.length > 0)
        .map((c) => [c.id, c.obligatoire_pour]),
    ),
    // Les réserves : ce que la réponse territoriale ne dit pas d'elle-même.
    reserves: Object.fromEntries(
      [...o.graphe.competences.values()].filter((c) => c.reserve).map((c) => [c.id, c.reserve]),
    ),
    // Qui répond quand personne ne s'est saisi de la compétence. Une réponse,
    // pas une incertitude : la loi désigne un échelon, et le site le nomme.
    aDefaut: Object.fromEntries(
      [...o.graphe.competences.values()].filter((c) => c.a_defaut).map((c) => [c.id, c.a_defaut]),
    ),
    // Département -> nom de sa région, pour pouvoir nommer celle qui répond.
    regions: Object.fromEntries(regionDeDep),
    // Département -> code de sa région, pour retrouver ses comptes.
    codesRegion: Object.fromEntries(codeRegionDeDep),
    natures: Object.fromEntries(natures),
    // Part nationale des communes pour lesquelles un exerçant est identifié.
    couverture: Object.fromEntries(
      [...couvertureNationale].map(([k, v]) => [k, Math.round((v / totalCommunes) * 100) / 100]),
    ),
    ...(services
      ? {
          services: {
            maj: services.maj,
            // L'ordre fait foi : les fichiers départementaux désignent une
            // famille par son index dans cette liste.
            familles: [...FAMILLES_SERVICE],
            totaux: services.totaux,
            // Les casernes n'existent pas en open data national : l'annuaire ne
            // publie que les états-majors départementaux. On nomme le SDIS
            // compétent plutôt que de situer une caserne qu'on ne connaît pas.
            sdis: Object.fromEntries(services.sdis),
          },
        }
      : {}),
    ...(eau
      ? {
          eau: {
            annee: eau.annee,
            indicateur: eau.indicateur,
            competence: compEau,
            prixMedian: eau.prixMedian,
          },
        }
      : {}),
    ...(finances
      ? {
          finances: metaFinances(finances, new Map(communes.map((c) => [c.code, c.population ?? 0]))),
        }
      : {}),
  });

  if (eau) {
    dire(
      `${GRIS}Prix de l'eau rattaché à ${servicesEau.toLocaleString('fr-FR')} communes ` +
        `sur ${communes.length.toLocaleString('fr-FR')}.${RAZ}`,
    );
  }
  if (o.sru) {
    dire(`${GRIS}Inventaire SRU : ${sruEcrits.toLocaleString('fr-FR')} communes soumises.${RAZ}`);
  }
  if (o.conseils) {
    dire(
      `${GRIS}Conseils municipaux : ${conseilsEcrits.toLocaleString('fr-FR')} composés.${RAZ}`,
    );
  }
  if (o.plu) {
    dire(
      `${GRIS}Géoportail de l’urbanisme : ${pluEcrit.toLocaleString('fr-FR')} communes dont le ` +
        `document approuvé est postérieur à l’enquête.${RAZ}`,
    );
  }
  if (o.urbanisme) {
    dire(
      `${GRIS}Documents d’urbanisme : ${urbanismeEcrit.toLocaleString('fr-FR')} communes situées, ` +
        `dont ${o.urbanisme.sansDocument.toLocaleString('fr-FR')} au règlement national.${RAZ}`,
    );
  }
  if (o.logements) {
    dire(
      `${GRIS}Logements autorisés : ${logementsEcrits.toLocaleString('fr-FR')} communes, ` +
        `${o.logements.total.toLocaleString('fr-FR')} logements depuis ${o.logements.annees[0]}.${RAZ}`,
    );
  }
  if (o.fiscalite) {
    dire(
      `${GRIS}Taux d’imposition ${o.fiscalite.millesime} : ` +
        `${fiscaliteEcrite.toLocaleString('fr-FR')} communes, foncier bâti médian ` +
        `${o.fiscalite.medianeFb} %.${RAZ}`,
    );
  }
  if (o.equipements) {
    dire(
      `${GRIS}Équipements ${o.equipements.millesime} : ` +
        `${equipementsEcrits.toLocaleString('fr-FR')} communes, médiane ` +
        `${o.equipements.medianeProximite} des ${o.equipements.nombreProximite} ` +
        `équipements de proximité.${RAZ}`,
    );
  }
  if (o.populations) {
    dire(
      `${GRIS}Séries de population : ${popEcrites.toLocaleString('fr-FR')} communes datées ` +
        `depuis ${o.populations.annees[0]}.${RAZ}`,
    );
  }
  if (o.associations) {
    const suitesAsso = ecrireSuitesAssociations(sortie, o.associations);
    dire(
      `${GRIS}Associations : ${assoEcrites.toLocaleString('fr-FR')} communes écrites, ` +
        `${suitesAsso.toLocaleString('fr-FR')} listes complètes à la demande.${RAZ}`,
    );
  }
  if (journal.length > 0) {
    dire(
      `${GRIS}Journal : ${journal.length.toLocaleString('fr-FR')} événements datés` +
        (transfertsVus > 0
          ? `, ${transfertsVus.toLocaleString('fr-FR')} changements au registre des transferts`
          : ', aucun changement au registre des transferts') +
        `, ${journalEcrit.toLocaleString('fr-FR')} lignes écrites.${RAZ}`,
    );
  }
  if (o.risques) {
    dire(
      `${GRIS}Risques majeurs : ${risquesEcrits.toLocaleString('fr-FR')} communes documentées.${RAZ}`,
    );
  }
  if (o.elections) {
    dire(
      `${GRIS}Élections : ${electionsEcrites.toLocaleString('fr-FR')} communes chiffrées.${RAZ}`,
    );
  }
  if (o.deliberations) {
    dire(
      `${GRIS}Délibérations : ${delibEcrites.toLocaleString('fr-FR')} collectivités qui publient.${RAZ}`,
    );
  }
  if (o.subventions) {
    dire(
      `${GRIS}Subventions : ${subvEcrites.toLocaleString('fr-FR')} collectivités qui publient.${RAZ}`,
    );
  }
  if (o.marches) {
    // La suite des listes, un fichier par acheteur, écrite une fois pour tout
    // le pays : un acheteur peut servir plusieurs départements.
    const suites = ecrireSuitesMarches(sortie, o.marches);
    // Après les fichiers par département, qu'il relit pour nommer les acheteurs.
    const nationales = ecrireEcheancesNationales(sortie, o.marches);
    const attributions = ecrireAttributionsNationales(sortie, o.marches);
    // Les avis ouverts du BOAMP, rattachés aux mêmes acheteurs ; sans collecte, l'ancien fichier reste.
    const avis = ecrireAvisNationaux(sortie, o.marches);
    dire(
      `${GRIS}Marchés publics : ${marchesEcrits.toLocaleString('fr-FR')} acheteurs chiffrés, ` +
        `${suites.toLocaleString('fr-FR')} listes complètes à la demande, ` +
        `${nationales.toLocaleString('fr-FR')} échéances dans echeances.json, ` +
        `${attributions.toLocaleString('fr-FR')} marchés récents dans attributions.json, ` +
        (avis ? `${avis.avis.toLocaleString('fr-FR')} avis ouverts dans avis.json.` : 'avis.json inchangé.') +
        RAZ,
    );
  }
  if (o.elus) {
    dire(`${GRIS}Maires : ${elusEcrits.toLocaleString('fr-FR')} communes nommées.${RAZ}`);
  }
  if (o.effectifs) {
    dire(
      `${GRIS}Effectifs scolaires : ${ecolesEcrites.toLocaleString('fr-FR')} écoles ` +
        `suivies sur ${o.effectifs.rentrees.length} rentrées.${RAZ}`,
    );
  }
  if (services) {
    const communesServies = [...services.parCommune.keys()].length;
    dire(
      `${GRIS}Services publics : ${servicesEcrits.toLocaleString('fr-FR')} implantations ` +
        `dans ${communesServies.toLocaleString('fr-FR')} communes.${RAZ}`,
    );
  }
  dire(
    `${VERT}Écrit${RAZ} ${parDep.size} départements · ` +
      `${couvertes.toLocaleString('fr-FR')} communes rattachées à au moins un groupement suivi · ` +
      `${sansRattachement.toLocaleString('fr-FR')} sans rattachement.`,
  );
}

/**
 * L'état précédent d'un département, quand il existe.
 *
 * Un fichier absent — première ingestion, nouveau département — ne vaut pas un
 * registre vide : la comparaison le refuse et n'annonce rien.
 */
function lireEtat(chemin: string): EtatDep | null {
  try {
    return JSON.parse(readFileSync(chemin, 'utf8')) as EtatDep;
  } catch {
    return null;
  }
}

function ecrireJson(chemin: string, donnee: unknown) {
  writeFileSync(chemin, JSON.stringify(donnee));
}
