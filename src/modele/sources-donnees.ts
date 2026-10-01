/**
 * Les fichiers d'où viennent les chiffres, pour l'encadré « Sources et
 * méthode » de chaque bloc.
 *
 * Chaque bloc nomme déjà sa source en toutes lettres — « D'après la base
 * Mérimée du ministère de la Culture… ». Ce répertoire reconnaît ces mentions
 * et y ajoute les liens : la page du jeu de données, où l'on voit qui le
 * publie, sa licence et ses mises à jour, et, quand la collecte lit un fichier
 * fixe, le fichier lui-même. Les adresses sont celles que lisent les collectes
 * de `scripts/*-emettre.ts` : un lien qui casse ici casse d'abord l'ingestion.
 *
 * Un motif qui ne reconnaît rien ne fait pas d'erreur : l'encadré garde son
 * texte, sans liens. Les motifs ne sont essayés que sur les paragraphes de
 * source, jamais sur les réserves : une réserve qui parle de décès ou de
 * dotations n'appelle pas de lien.
 */

export interface LienSource {
  titre: string;
  url: string;
}

interface Entree {
  /** Reconnu dans le texte de l'encadré, sans tenir compte de la casse. */
  motif: RegExp;
  liens: LienSource[];
}

const dg = (id: string) => `https://www.data.gouv.fr/datasets/${id}/`;
const ofgl = (id: string) => `https://data.ofgl.fr/explore/dataset/${id}/`;
const melodi = (jeu: string, an: number) => `https://api.insee.fr/melodi/file/${jeu}/${jeu}_${an}_CSV_FR`;

const ENTREES: Entree[] = [
  // --- L'argent -------------------------------------------------------------
  {
    motif: /comptes des communes publiés par l.OFGL|comptes consolidés des communes/i,
    liens: [{ titre: 'Comptes consolidés des communes (OFGL)', url: ofgl('ofgl-base-communes-consolidee') }],
  },
  {
    motif: /comptes des collectivités publiés par l.OFGL/i,
    liens: [
      { titre: 'Comptes des départements (OFGL)', url: ofgl('ofgl-base-departements') },
      { titre: 'Comptes des régions (OFGL)', url: ofgl('ofgl-base-regions') },
      { titre: 'Comptes des intercommunalités (OFGL)', url: ofgl('ofgl-base-gfp') },
    ],
  },
  {
    motif: /centres d.action sociale publiés par l.OFGL/i,
    liens: [{ titre: 'Comptes des CCAS et CIAS (OFGL)', url: ofgl('ofgl-base-ccas-cias') }],
  },
  {
    motif: /notifiés par la Direction générale des collectivités locales|dotations? (de l.État|globale de fonctionnement)/i,
    liens: [{ titre: 'Dotations des communes (OFGL)', url: ofgl('dotations-communes') }],
  },
  {
    motif: /projets financés par les dotations de soutien à l.investissement/i,
    liens: [{ titre: 'Projets financés par les dotations d’investissement (DGCL)', url: dg('6176785207139a929a2776fe') }],
  },
  {
    motif: /droits de mutation|\bDMTO\b|recettes mensuelles publiées par la direction générale des finances publiques/i,
    liens: [{ titre: 'Droits de mutation à titre onéreux (DGFiP)', url: 'https://data.economie.gouv.fr/explore/dataset/dmto_attrib/' }],
  },
  {
    motif: /fiscalité directe locale/i,
    liens: [
      {
        titre: 'Recensement des éléments d’imposition (DGFiP)',
        url: 'https://data.economie.gouv.fr/explore/dataset/impots-locaux-fichier-de-recensement-des-elements-dimposition-a-la-fiscalite-dir/',
      },
    ],
  },
  {
    motif: /données essentielles de la commande publique|marchés publics/i,
    liens: [{ titre: 'Marchés publics validés (DECP)', url: 'https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/' }],
  },
  {
    motif: /données essentielles des subventions/i,
    liens: [{ titre: 'Le schéma national des subventions', url: 'https://schema.data.gouv.fr/scdl/subventions/' }],
  },
  {
    motif: /délibérations versées/i,
    liens: [{ titre: 'Le schéma national des délibérations', url: 'https://schema.data.gouv.fr/scdl/deliberations/' }],
  },
  {
    motif: /BANATIC/,
    liens: [{ titre: 'BANATIC, la base nationale de l’intercommunalité', url: 'https://www.banatic.interieur.gouv.fr/' }],
  },
  {
    motif: /allocations familiales/i,
    liens: [{ titre: 'Foyers allocataires par commune (CNAF)', url: 'https://data.caf.fr/explore/dataset/s_ben_com_f/' }],
  },

  // --- La vie démocratique ------------------------------------------------
  {
    motif: /répertoire national des élus/i,
    liens: [{ titre: 'Répertoire national des élus', url: dg('repertoire-national-des-elus-1') }],
  },
  {
    motif: /résultats publiés par le ministère de l.Intérieur/i,
    liens: [
      { titre: 'Municipales 2026, premier tour', url: dg('69b82a7de5d58cc06ad35ce0') },
      { titre: 'Municipales 2026, second tour', url: dg('69c17fed9f18c7781fd11a14') },
    ],
  },

  {
    motif: /résultats définitifs publiés par le ministère de l.Intérieur/i,
    liens: [
      { titre: 'Présidentielle 2022, premier tour', url: dg('election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour') },
      { titre: 'Présidentielle 2022, second tour', url: dg('election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour') },
      { titre: 'Européennes 2024', url: dg('resultats-des-elections-europeennes-du-9-juin-2024') },
      { titre: 'Législatives 2024, premier tour', url: dg('elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour') },
      { titre: 'Législatives 2024, second tour', url: dg('elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour') },
    ],
  },

  // --- Les habitants --------------------------------------------------------
  {
    motif: /recensements de l.INSEE, de 1876|séries historiques/i,
    liens: [
      { titre: 'Séries historiques de population (INSEE)', url: 'https://www.insee.fr/fr/statistiques/3698339' },
      { titre: 'Le fichier', url: 'https://www.insee.fr/fr/statistiques/fichier/3698339/base-pop-historiques-1876-2023.xlsx' },
    ],
  },
  {
    motif: /naissances et (les )?décès|état civil/i,
    liens: [
      { titre: 'Naissances par commune (INSEE)', url: melodi('DS_ETAT_CIVIL_NAIS_COMMUNES', 2025) },
      { titre: 'Décès par commune (INSEE)', url: melodi('DS_ETAT_CIVIL_DECES_COMMUNES', 2025) },
    ],
  },
  {
    motif: /par sexe et âge|âge et sexe/i,
    liens: [{ titre: 'Population par âge et sexe, recensement 2023 (INSEE)', url: melodi('DS_RP_TD_POPULATION_AGESEX_PRINC', 2023) }],
  },
  {
    motif: /table « logements »/i,
    liens: [{ titre: 'Logements, recensement 2023 (INSEE)', url: melodi('DS_RP_LOGEMENT_PRINC', 2023) }],
  },
  {
    motif: /population active|domicile-travail/i,
    liens: [
      { titre: 'Emploi et activité, recensement 2023 (INSEE)', url: melodi('DS_RP_EMPLOI_LR_PRINC', 2023) },
      { titre: 'Déplacements domicile-travail, recensement 2023 (INSEE)', url: melodi('DS_RP_NAVETTES_PRINC', 2023) },
    ],
  },
  {
    motif: /diplômes et formation/i,
    liens: [{ titre: 'Diplômes et formation, recensement 2023 (INSEE)', url: melodi('DS_RP_DIPLOMES_PRINC', 2023) }],
  },
  {
    motif: /Filosofi|niveau de vie/i,
    liens: [{ titre: 'Revenus et pauvreté, Filosofi 2023 (INSEE)', url: melodi('DS_FILOSOFI_CC', 2023) }],
  },

  // --- Les logements et le sol -------------------------------------------
  {
    motif: /valeurs foncières/i,
    liens: [
      { titre: 'Demandes de valeurs foncières géolocalisées', url: dg('demandes-de-valeurs-foncieres-geolocalisees') },
      { titre: 'Les fichiers, année par année', url: 'https://files.data.gouv.fr/geo-dvf/latest/csv/' },
    ],
  },
  {
    motif: /performance énergétique/i,
    liens: [{ titre: 'Diagnostics de performance énergétique (ADEME)', url: 'https://data.ademe.fr/datasets/meg-83tjwtg8dyz4vv7h1dqe' }],
  },
  {
    motif: /Sitadel/,
    liens: [{ titre: 'Logements autorisés et commencés par commune (Sitadel)', url: dg('689c430033671e3d26466245') }],
  },
  {
    motif: /Géoportail de l.urbanisme|SuDocUH|documents? d.urbanisme/i,
    liens: [
      { titre: 'État des documents d’urbanisme par commune (SuDocUH)', url: dg('620b924d90e837a5ce0ba819') },
      { titre: 'Géoportail de l’urbanisme', url: 'https://www.geoportail-urbanisme.gouv.fr/' },
    ],
  },
  {
    motif: /artificialisation|fichiers fonciers retraités/i,
    liens: [
      { titre: 'Consommation d’espaces naturels, agricoles et forestiers', url: dg('6a01b9280dd2d45907e5fc61') },
      {
        titre: 'Le fichier',
        url: 'https://static.data.gouv.fr/resources/consommation-despaces-naturels-agricoles-et-forestiers-du-1er-janvier-2011-au-1er-janvier-2025/20260724-142909/conso-com.csv',
      },
    ],
  },
  {
    motif: /article 55 de la loi SRU|inventaire SRU/i,
    liens: [{ titre: 'Communes soumises à l’article 55 de la loi SRU', url: dg('communes-et-inventaire-sru') }],
  },

  // --- Les risques ----------------------------------------------------------
  {
    motif: /GASPAR/,
    liens: [
      { titre: 'Base GASPAR des procédures relatives aux risques', url: dg('536995eea3a729239d20486b') },
      { titre: 'Le fichier', url: 'https://files.georisques.fr/GASPAR/gaspar.zip' },
    ],
  },
  {
    motif: /radon/i,
    liens: [
      { titre: 'Potentiel radon des communes (IRSN)', url: dg('53834c53a3a72906c7ec5c4c') },
      { titre: 'Le fichier', url: 'https://static.data.gouv.fr/resources/connaitre-le-potentiel-radon-de-ma-commune/20190506-174309/radon.csv' },
    ],
  },

  // --- Vivre là -------------------------------------------------------------
  {
    motif: /base permanente des équipements/i,
    liens: [
      { titre: 'Base permanente des équipements (INSEE)', url: 'https://www.insee.fr/fr/statistiques/8217527' },
      { titre: 'Le fichier', url: 'https://www.insee.fr/fr/statistiques/fichier/8217527/DS_BPE_CSV_FR.zip' },
    ],
  },
  {
    motif: /annuaire de l.administration/i,
    liens: [{ titre: 'Annuaire de l’administration', url: dg('service-public-gouv-fr-annuaire-de-ladministration-base-de-donnees-locales') }],
  },
  {
    motif: /FINESS/,
    liens: [{ titre: 'Référentiel FINESS', url: dg('referentiel-finess-t-finess') }],
  },
  {
    motif: /annuaire de l.éducation/i,
    liens: [{ titre: 'Annuaire de l’éducation', url: 'https://data.education.gouv.fr/explore/dataset/fr-en-annuaire-education/' }],
  },
  {
    motif: /accessibilité potentielle localisée/i,
    liens: [
      { titre: 'Accessibilité potentielle localisée (DREES)', url: 'https://data.drees.solidarites-sante.gouv.fr/explore/dataset/530_l-accessibilite-potentielle-localisee-apl/' },
    ],
  },
  {
    motif: /effectifs (d.élèves|scolaires)|nombre de classes/i,
    liens: [{ titre: 'Effectifs et classes des écoles', url: 'https://data.education.gouv.fr/explore/dataset/fr-en-ecoles-effectifs-nb_classes/' }],
  },
  {
    motif: /position sociale/i,
    liens: [
      { titre: 'IPS des écoles', url: 'https://data.education.gouv.fr/explore/dataset/fr-en-ips-ecoles-ap2022/' },
      { titre: 'IPS des collèges', url: 'https://data.education.gouv.fr/explore/dataset/fr-en-ips-colleges-ap2023/' },
    ],
  },
  {
    motif: /Géo.DAE|défibrillateurs/i,
    liens: [{ titre: 'Géo’DAE, la base nationale des défibrillateurs', url: dg('61556e1e9d6adb2df86eb0fc') }],
  },
  {
    motif: /répertoire national des associations/i,
    liens: [
      { titre: 'Répertoire national des associations', url: dg('repertoire-national-des-associations') },
      { titre: 'Le fichier', url: 'https://data-pipeline-open.s3.sbg.io.cloud.ovh.net/rna/waldec.csv' },
    ],
  },
  {
    motif: /BODACC/,
    liens: [{ titre: 'Annonces commerciales du BODACC', url: 'https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/' }],
  },
  {
    motif: /SIRENE/,
    liens: [{ titre: 'Base SIRENE des établissements', url: 'https://public.opendatasoft.com/explore/dataset/economicref-france-sirene-v3/' }],
  },

  // --- Les réseaux ----------------------------------------------------------
  {
    motif: /SISPEA|prix de l.eau|services d.eau/i,
    liens: [{ titre: 'SISPEA, les services d’eau et d’assainissement', url: 'https://www.services.eaufrance.fr/' }],
  },
  {
    motif: /contrôle sanitaire/i,
    liens: [{ titre: 'Résultats du contrôle sanitaire de l’eau distribuée', url: dg('resultats-du-controle-sanitaire-de-leau-distribuee-commune-par-commune') }],
  },
  {
    motif: /France Très Haut Débit|fibre optique/i,
    liens: [
      {
        titre: 'Déploiement de la fibre et fin du cuivre (ANCT)',
        url: dg('indicateur-france-tres-haut-debit-etat-des-deploiements-de-la-fibre-optique-et-decommissionnement-du-cuivre'),
      },
    ],
  },
  {
    motif: /Agence ORE/,
    liens: [
      { titre: 'Consommation d’électricité et de gaz par commune (Agence ORE)', url: 'https://opendata.agenceore.fr/datasets/consommation-annuelle-d-electricite-et-gaz-par-commune' },
    ],
  },
  {
    motif: /sites que l.Arcep collecte/i,
    liens: [{ titre: 'Les sites mobiles, trimestre par trimestre (Arcep)', url: 'https://data.arcep.fr/mobile/sites/' }],
  },
  {
    motif: /registre national des installations de production/i,
    liens: [
      {
        titre: 'Registre national des installations de production (ODRÉ)',
        url: 'https://odre.opendatasoft.com/explore/dataset/registre-national-installation-production-stockage-electricite-agrege/',
      },
    ],
  },

  // --- Le territoire --------------------------------------------------------
  {
    motif: /Agence nationale de la cohésion des territoires/i,
    liens: [
      { titre: 'Petites villes de demain (ANCT)', url: dg('5fc1259b703620ed60a49d97') },
      { titre: 'Action cœur de ville (ANCT)', url: dg('5acc7eddc751df5e21efdf20') },
      { titre: 'Villages d’avenir (ANCT)', url: dg('65a11234a86f08c56f0c47b0') },
      { titre: 'Territoires d’industrie (ANCT)', url: dg('5fc1472f114718d419e42f8a') },
      { titre: 'Contrats pour la réussite de la transition écologique (ANCT)', url: dg('60799532757dbdef335c00c5') },
      { titre: 'Croisement des dispositifs de l’ANCT', url: dg('617322c7c8e7b27041570e71') },
    ],
  },
  {
    motif: /zones défavorisées/i,
    liens: [
      { titre: 'Communes classées en zones défavorisées (ministère de l’Agriculture)', url: dg('5369911ea3a729239d203b94') },
      { titre: 'Loi Montagne, article 3', url: 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006847491' },
    ],
  },
  {
    motif: /base Mérimée/i,
    liens: [
      { titre: 'Immeubles protégés au titre des monuments historiques', url: dg('5af120e5b595087cfabcde81') },
      { titre: 'Le fichier', url: 'https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/merimee.csv' },
    ],
  },
  {
    motif: /DATAtourisme/,
    liens: [{ titre: 'DATAtourisme, les fichiers régionaux', url: dg('5b598be088ee387c0c353714') }],
  },
  {
    motif: /délinquance enregistrée|SSMSI/i,
    liens: [
      {
        titre: 'Délinquance enregistrée par commune (SSMSI)',
        url: dg('bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales'),
      },
    ],
  },
  {
    motif: /ONISR|accidents corporels/i,
    liens: [{ titre: 'Bases des accidents corporels de la circulation', url: dg('53698f4ca3a729239d2036df') }],
  },
  {
    motif: /SNCF Gares/,
    liens: [
      { titre: 'Gares de voyageurs (SNCF)', url: 'https://ressources.data.sncf.com/explore/dataset/gares-de-voyageurs/' },
      { titre: 'Fréquentation des gares (SNCF)', url: 'https://ressources.data.sncf.com/explore/dataset/frequentation-gares/' },
    ],
  },
  {
    motif: /recensement agricole|Agreste/i,
    liens: [
      {
        titre: 'Recensement agricole 2020, surface par commune (Agreste)',
        url: 'https://agreste.agriculture.gouv.fr/agreste-web/download/publication/publie/RA2020_1013/RA2020_1013_SAU_Communes.zip',
      },
    ],
  },
];

/** Les liens des sources que nomme un texte, sans doublon, dans l'ordre du répertoire. */
export function liensDesSources(texte: string): LienSource[] {
  const vus = new Set<string>();
  const out: LienSource[] = [];
  for (const e of ENTREES) {
    if (!e.motif.test(texte)) continue;
    for (const l of e.liens) {
      if (vus.has(l.url)) continue;
      vus.add(l.url);
      out.push(l);
    }
  }
  return out;
}

/** Toutes les adresses, pour les vérifier. */
export function toutesLesAdresses(): string[] {
  return [...new Set(ENTREES.flatMap((e) => e.liens.map((l) => l.url)))];
}
