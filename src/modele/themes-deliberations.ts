/**
 * Ranger un intitulé de délibération sous les compétences du réseau — le
 * niveau 2 du cadrage de la recherche (`docs/07-risques.md`, section 8).
 *
 * Des règles écrites, pas un modèle : une compétence est attribuée quand
 * l'intitulé contient l'un de ses termes, mots entiers, sans accents ni
 * majuscules — `*` en fin de mot accepte toute fin (« école* » prend
 * « écoles ») —, et qu'il ne contient aucun de ses termes d'exclusion. Un
 * intitulé peut relever de plusieurs compétences, ou d'aucune : le personnel,
 * les subventions aux associations, la commande publique n'ont pas de fiche,
 * et ne sont donc rangés nulle part.
 *
 * Les règles sont publiées telles quelles sur la page de recherche. Partagé
 * par la collecte (`scripts/deliberations-emettre.ts`), qui écrit l'index par
 * compétence, et par le navigateur, qui dit sous chaque résultat la fiche qui
 * l'explique : les deux rangent pareil.
 */

export type Theme = {
  /** L'identifiant de la compétence dans `contenu/competences.yaml`, donc la fiche `/n/<id>`. */
  fiche: string;
  termes: string[];
  sauf?: string[];
};

export const THEMES: Theme[] = [
  {
    fiche: 'ecoles-primaires',
    termes: [
      'école*',
      'scolaire*',
      'périscolaire*',
      'cantine*',
      'restauration scolaire',
      'restaurant* scolaire*',
      'garderie*',
      'ATSEM',
      'maternelle*',
      'élémentaire*',
      'scolaris*',
      'élève*',
      'regroupement* pédagogique*',
      'RPI',
      'classe* de découverte',
    ],
    sauf: ['musique', 'danse', 'conservatoire*', 'école* des sports', 'école* de sport*', 'transport* scolaire*', 'ramassage scolaire', 'circuit* scolaire*', 'assistant* maternel*', 'collège*', 'lycée*'],
  },
  { fiche: 'carte-scolaire', termes: ['carte scolaire', 'fermeture de classe*', 'fermeture d’une classe', 'ouverture de classe*', 'ouverture d’une classe'] },
  { fiche: 'avis-vie-ecole', termes: ['conseil* d’école'] },
  { fiche: 'colleges', termes: ['collège*'], sauf: ['collège des élus', 'collège des représentants', 'collège employeur*', 'collège* électora*', 'collège des usagers', 'premier collège', 'second collège', 'deuxième collège', 'troisième collège', 'membres fondateurs'] },
  { fiche: 'lycees', termes: ['lycée*'] },
  { fiche: 'transport-scolaire', termes: ['transport* scolaire*', 'ramassage scolaire', 'circuit* scolaire*'] },
  {
    fiche: 'voirie-communale',
    termes: [
      'voirie*',
      'trottoir*',
      'chemin* rur*',
      'voie* communale*',
      'éclairage public',
      'dénomination de* rue*',
      'dénomination de* voie*',
      'dénomination d’une rue',
      'dénomination d’une voie',
      'numérotage',
      'adressage',
      'enrobé*',
      'point à temps',
      'aménagement* de bourg',
      'aménagement* du bourg',
    ],
    sauf: ['route* départementale*', 'voirie départementale'],
  },
  { fiche: 'routes-departementales', termes: ['route* départementale*', 'voirie départementale', 'réseau routier départemental'] },
  {
    fiche: 'redaction-plu',
    termes: ['PLU', 'PLUi', 'PLUiH', 'plan local d’urbanisme', 'plan local de l’urbanisme', 'plans locaux d’urbanisme', 'carte* communale*', 'orientation* d’aménagement*'],
  },
  { fiche: 'planification-scot', termes: ['SCoT', 'schéma* de cohérence territoriale'] },
  {
    fiche: 'instruction-autorisations',
    termes: ['instruction des autorisations', 'instruction des demandes d’autorisation', 'droit des sols', 'service instructeur', 'service commun d’instruction', 'ADS'],
    sauf: ['sanitaire'],
  },
  {
    fiche: 'delivrance-autorisation-urbanisme',
    termes: ['permis de construire', 'permis d’aménager', 'permis de démolir', 'déclaration* préalable*', 'autorisation* d’urbanisme'],
  },
  { fiche: 'conseil-architecture', termes: ['CAUE', 'conseil d’architecture'] },
  {
    fiche: 'dechets-menagers',
    termes: [
      'déchet*',
      'ordure* ménagère*',
      'TEOM',
      'REOM',
      'redevance incitative',
      'redevance spéciale',
      'déchetterie*',
      'déchèterie*',
      'collecte sélective',
      'tri sélectif',
      'composteur*',
      'compostage',
      'recyclerie*',
      'ressourcerie*',
      'biodéchet*',
      'SMICTOM',
      'SICTOM',
      'SMITOM',
      'SIRTOM',
      'point* d’apport volontaire',
    ],
  },
  {
    fiche: 'eau-potable',
    termes: [
      'eau potable',
      'eaux potables',
      'adduction d’eau',
      'distribution d’eau',
      'distribution de l’eau',
      'production d’eau',
      'service de l’eau',
      'service des eaux',
      'service* d’eau',
      'régie des eaux',
      'régie de l’eau',
      'prix de l’eau',
      'tarif* de l’eau',
      'compteur* d’eau',
      'captage*',
      'château d’eau',
      'réservoir* d’eau',
      'budget eau',
      'budget annexe eau',
      'budget annexe de l’eau',
      'eau et assainissement',
      'eau et de l’assainissement',
      'eaux et assainissement',
    ],
  },
  {
    fiche: 'assainissement',
    termes: [
      'assainissement*',
      'eaux usées',
      'eaux pluviales',
      'station* d’épuration',
      'STEP',
      'SPANC',
      'lagunage',
      'réseau* séparatif*',
      'égout*',
      'PFAC',
    ],
  },
  { fiche: 'restrictions-eau', termes: ['sécheresse', 'restriction* d’eau', 'restriction* des usages de l’eau'] },
  {
    fiche: 'defense-incendie',
    termes: [
      'défense extérieure contre l’incendie',
      'défense incendie',
      'DECI',
      'poteau* incendie',
      'poteau* d’incendie',
      'borne* incendie',
      'borne* à incendie',
      'hydrant*',
      'bouche* d’incendie',
      'réserve* incendie',
      'réserve* d’incendie',
      'citerne* incendie',
      'bâche* incendie',
      'bâche* à incendie',
      'point* d’eau incendie',
      'PEI',
    ],
  },
  {
    fiche: 'secours-incendie',
    termes: ['SDIS', 'service départemental d’incendie', 'service d’incendie et de secours', 'sapeur* pompier*', 'pompier*', 'centre de secours', 'centre d’incendie et de secours'],
  },
  {
    fiche: 'developpement-economique',
    termes: [
      'développement économique',
      'zone* d’activité*',
      'zone* artisanale*',
      'zone* industrielle*',
      'parc* d’activité*',
      'ZA',
      'ZAE',
      'immobilier d’entreprise*',
      'pass commerce*',
      'pépinière* d’entreprise*',
      'hôtel* d’entreprise*',
      'atelier* relais',
      'commerce* de proximité',
      'dernier commerce',
    ],
  },
  {
    fiche: 'logement-social',
    termes: [
      'logement* social',
      'logement* sociaux',
      'logement* locatif* social',
      'logement* locatif* sociaux',
      'bailleur* social',
      'bailleur* sociaux',
      'HLM',
      'office public de l’habitat',
      'OPH',
      'programme local de l’habitat',
      'PLH',
      'conférence intercommunale du logement',
      'attribution* des logements',
    ],
  },
  {
    fiche: 'aides-renovation',
    termes: [
      'OPAH',
      'amélioration de l’habitat',
      'Anah',
      'habitat indigne',
      'habitat dégradé',
      'MaPrimeRénov*',
      'France Rénov*',
      'rénovation de l’habitat',
      'rénovation énergétique des logements',
      'rénovation énergétique de l’habitat',
      'précarité énergétique',
      'adaptation des logements',
      'adaptation du logement',
    ],
  },
  {
    fiche: 'aide-sociale-communale',
    termes: ['CCAS', 'CIAS', 'centre communal d’action sociale', 'centre intercommunal d’action sociale', 'action sociale', 'aide sociale', 'épicerie* sociale*', 'épicerie* solidaire*', 'analyse des besoins sociaux', 'domiciliation'],
    sauf: ['CNAS', 'comité national d’action sociale', 'personnel*', 'agent*', 'COS', 'œuvres sociales', 'enfance', 'conseil départemental', 'département'],
  },
  { fiche: 'rsa', termes: ['RSA', 'revenu de solidarité active'] },
  { fiche: 'apa', termes: ['allocation personnalisée d’autonomie', 'APA'], sauf: ['sport*', 'activité* physique*', 'yoga', 'relaxation', 'interphone'] },
  { fiche: 'aide-sociale-enfance', termes: ['protection de l’enfance', 'aide sociale à l’enfance', 'ASE', 'mineur* non accompagné*'] },
  { fiche: 'handicap', termes: ['MDPH', 'maison départementale des personnes handicapées', 'prestation de compensation', 'allocation aux adultes handicapés'] },
  {
    fiche: 'protection-maternelle',
    termes: ['PMI', 'protection maternelle', 'assistant* maternel*', 'relais petite enfance', 'relais d’assistant* maternel*'],
  },
  { fiche: 'insertion-jeunes', termes: ['mission* locale*'] },
  {
    fiche: 'offre-de-soins',
    termes: ['maison* de santé', 'MSP', 'centre* de santé', 'pôle* de santé', 'médecin*', 'professionnel* de santé', 'désert* médica*', 'hôpital', 'centre hospitalier', 'contrat local de santé', 'CLS'],
    sauf: ['médecine préventive', 'médecin* du travail', 'médecine du travail', 'santé au travail', 'médecin* agréé*', 'médecin* de prévention'],
  },
  {
    fiche: 'police-tranquillite',
    termes: [
      'pouvoir* de police',
      'police du maire',
      'tranquillité publique',
      'salubrité publique',
      'divagation',
      'fourrière*',
      'animaux errants',
      'chat* errant*',
      'chien* dangereux',
      'nuisance* sonore*',
      'débit* de boissons',
      'licence IV',
    ],
  },
  {
    fiche: 'securite-publique',
    termes: ['police municipale', 'police* intercommunale*', 'policier* municipa*', 'vidéoprotection', 'vidéosurveillance', 'ASVP', 'garde* champêtre*', 'sécurité publique'],
  },
  { fiche: 'securite-publique-etat', termes: ['gendarmerie*', 'police nationale'] },
  { fiche: 'protection-donnees', termes: ['RGPD', 'données personnelles', 'délégué à la protection des données', 'DPO', 'protection des données'] },
  {
    fiche: 'information-risques',
    termes: ['DICRIM', 'plan communal de sauvegarde', 'PCS', 'plan intercommunal de sauvegarde', 'réserve communale de sécurité civile', 'risques majeurs'],
  },
  { fiche: 'prevention-risques', termes: ['plan de prévention des risques', 'PPRI', 'PPRN', 'PPRT', 'PPRL', 'risques naturels', 'risques technologiques', 'submersion marine'] },
  {
    fiche: 'installations-classees',
    termes: ['installation* classée*', 'ICPE', 'autorisation environnementale', 'méthanis*'],
    sauf: ['indemnité*'],
  },
  {
    fiche: 'participation-public',
    termes: ['enquête* publique*', 'concertation préalable', 'participation du public', 'consultation du public', 'mise à disposition du public'],
  },
  {
    fiche: 'distribution-electricite',
    termes: [
      'distribution publique d’électricité',
      'distribution d’électricité',
      'concession* d’électricité',
      'électrification',
      'enfouissement* de* réseau*',
      'enfouissement* réseau*',
      'enfouissement* des lignes',
      'effacement* de* réseau*',
      'réseau* électrique*',
      'syndicat* d’énergie',
      'syndicat* départementa* d’énergie*',
      'syndicat* département d’énergie*',
      'SDE*',
      'Morbihan Énergies',
    ],
  },
  {
    fiche: 'organisation-mobilite',
    termes: [
      'mobilité*',
      'transport* à la demande',
      'TAD',
      'versement mobilité',
      'versement transport',
      'covoiturage',
      'plan de mobilité',
      'piste* cyclable*',
      'voie* verte*',
      'vélo*',
      'liaison* douce*',
      'schéma directeur cyclable',
      'schéma directeur vélo',
      'transport* urbain*',
      'transports en commun',
      'navette*',
      'AOM',
    ],
    sauf: ['mobilité interne', 'mobilité des agents', 'prime de mobilité', 'forfait* mobilité*', 'personnel*', 'agent*'],
  },
  { fiche: 'transport-regional', termes: ['transport régional', 'transports régionaux', 'BreizhGo', 'ligne* ferroviaire*', 'desserte ferroviaire'] },
  {
    fiche: 'reseaux-numeriques',
    termes: ['fibre optique', 'très haut débit', 'THD', 'haut débit', 'réseau* de communications électroniques', 'antenne* relais', 'antenne* de téléphonie', 'téléphonie mobile', 'relais de téléphonie', 'pylône*'],
  },
  {
    fiche: 'action-culturelle',
    termes: ['bibliothèque*', 'médiathèque*', 'lecture publique', 'école* de musique', 'conservatoire*', 'saison culturelle', 'spectacle*', 'culturel*', 'culture', 'musée*', 'festival*', 'cinéma*', 'concert', 'concerts'],
  },
  {
    fiche: 'equipements-culturels-sportifs',
    termes: [
      'salle* polyvalente*',
      'salle* des fêtes',
      'salle* omnisports',
      'salle* de sport*',
      'complexe* sporti*',
      'gymnase*',
      'piscine*',
      'centre* aquatique*',
      'espace* aquatique*',
      'terrain* de football',
      'terrain* de foot',
      'terrain* de sport*',
      'terrain* synthétique*',
      'stade*',
      'city stade',
      'skatepark*',
      'boulodrome*',
      'salle* de spectacle*',
      'espace* culturel*',
      'centre* culturel*',
    ],
  },
  { fiche: 'activites-sportives', termes: ['sport*', 'sportif*', 'sportive*'] },
  {
    fiche: 'cimetiere',
    termes: ['cimetière*', 'concession* funéraire*', 'concession* cinéraire*', 'columbarium*', 'colombarium*', 'jardin du souvenir', 'cavurne*', 'site* cinéraire*', 'ossuaire*', 'funéraire*', 'pompes funèbres', 'caveau*'],
  },
  {
    fiche: 'etat-civil',
    termes: ['état civil', 'carte* nationale* d’identité', 'titre* d’identité', 'dispositif de recueil', 'mariage*', 'PACS', 'livret* de famille'],
  },
  { fiche: 'listes-electorales', termes: ['liste* électorale*'] },
  { fiche: 'representation-collectivites', termes: ['élection* sénatoriale*', 'délégué* sénatoria*', 'grands électeurs'] },
  {
    fiche: 'vote-du-budget',
    termes: [
      'budget* primitif*',
      'BP',
      'budget* supplémentaire*',
      'décision* modificative*',
      'DM',
      'compte* administratif*',
      'compte* de gestion',
      'compte* financier* unique*',
      'CFU',
      'affectation* du résultat',
      'affectation* des résultats',
      'affectation* de résultat*',
      'orientation* budgétaire*',
      'DOB',
      'ROB',
      'vote du budget',
      'vote des taux',
      'taux d’imposition',
      'taux de fiscalité',
      'taux des taxes',
      'ouverture* de crédit*',
      'ouverture anticipée',
      'virement* de crédit*',
      'autorisation* de programme*',
      'reprise anticipée',
    ],
  },
  { fiche: 'evaluation-fonciere', termes: ['commission communale des impôts directs', 'commission intercommunale des impôts directs', 'CCID', 'CIID', 'valeur* locative*'] },
  {
    fiche: 'comptable-public',
    termes: ['non-valeur*', 'non valeur*', 'créance* éteinte*', 'créance* irrécouvrable*', 'comptable public', 'trésorier', 'service de gestion comptable', 'SGC', 'conseiller aux décideurs locaux'],
  },
  { fiche: 'controle-des-comptes', termes: ['chambre régionale des comptes', 'CRC', 'rapport d’observations définitives'] },
  { fiche: 'controle-legalite', termes: ['contrôle de légalité', 'observations du préfet', 'recours gracieux du préfet', 'déféré*'] },
  { fiche: 'juger-administration', termes: ['tribunal administratif', 'cour administrative d’appel'] },
  { fiche: 'communication-documents', termes: ['commission d’accès aux documents administratifs'] },
  { fiche: 'interet-communautaire', termes: ['intérêt communautaire', 'intérêt métropolitain'], sauf: ['manifestation*'] },
  {
    fiche: 'subventions-investissement',
    termes: ['DETR', 'DSIL', 'DSID', 'dotation d’équipement des territoires ruraux', 'dotation de soutien à l’investissement', 'fonds vert', 'fonds d’accélération de la transition écologique'],
  },
  { fiche: 'aides-transition', termes: ['ADEME', 'fonds chaleur'] },
  { fiche: 'ingenierie-etat', termes: ['ANCT', 'petites villes de demain', 'action cœur de ville', 'villages d’avenir', 'agence nationale de la cohésion des territoires'] },
  { fiche: 'ingenierie-territoriale', termes: ['agence d’urbanisme', 'agence technique départementale', 'ingénierie territoriale'] },
  { fiche: 'accueil-demarches', termes: ['France Services', 'MSAP'] },
  { fiche: 'budget-union', termes: ['FEDER', 'FEADER', 'LEADER', 'FSE', 'FEAMPA', 'fonds européen*'] },
  { fiche: 'accord-de-paris', termes: ['plan climat*', 'PCAET'] },
  { fiche: 'amenagement-territoire', termes: ['SRADDET'] },
  { fiche: 'signes-origine', termes: ['AOP', 'AOC', 'IGP', 'appellation* d’origine', 'indication* géographique*', 'INAO'] },
  { fiche: 'patrimoine-mondial', termes: ['patrimoine mondial'], sauf: ['immatériel'] },
  { fiche: 'bornage', termes: ['bornage*', 'géomètre*'] },
  { fiche: 'authentification-actes', termes: ['acte* authentique*', 'acte* notarié*', 'notaire*', 'forme administrative'] },
  { fiche: 'reglement-amiable', termes: ['conciliat* de justice'] },
  { fiche: 'acces-au-droit', termes: ['accès au droit', 'CDAD', 'point justice'] },
];

/** Plié comme les termes : sans accents, en minuscules, chaque suite de signes réduite à une espace. */
export const plierTexte = (s: string) =>
  ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9*]+/g, ' ')
    .trim()} `;

/**
 * Beaucoup d'intitulés perdent l'apostrophe (« dorientations budgétaires »,
 * « station depuration », « lécole ») : un mot du terme peut donc être collé
 * à un « d » ou un « l » qui le précède, et le « d » d'un terme peut manquer.
 */
function motif(termes: string[]): RegExp {
  const alternatives = termes.map((t) => {
    const mots = plierTexte(t).trim().split(' ');
    let r = '';
    mots.forEach((m, i) => {
      const corps = m.endsWith('*') ? `${m.slice(0, -1)}[a-z0-9]*` : m;
      if ((m === 'd' || m === 'l') && i && i < mots.length - 1) r += ` (?:${m} ?)?`;
      else r += `${i && !/^[dl]$/.test(mots[i - 1]) ? ' ' : ''}(?:[dl])?${corps}`;
    });
    return r;
  });
  return new RegExp(`(?<= )(?:${alternatives.join('|')})(?= )`);
}

const COMPILES = THEMES.map((t) => ({ oui: motif(t.termes), non: t.sauf?.length ? motif(t.sauf) : null }));

/** Les rangs, dans `THEMES`, des compétences dont relève un intitulé. */
export function themesDe(objet: string): number[] {
  const t = plierTexte(objet.replace(/\*/g, ' '));
  const sortie: number[] = [];
  COMPILES.forEach(({ oui, non }, i) => {
    if (oui.test(t) && !(non && non.test(t))) sortie.push(i);
  });
  return sortie;
}
