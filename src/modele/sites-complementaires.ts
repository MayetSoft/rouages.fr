/**
 * Les sites qui présentent autrement ce que Rouages montre : un classement,
 * un tableau de bord de la transition énergétique, un explorateur des marchés
 * publics, des outils pour qui achète ou répond.
 *
 * Ce ne sont pas des sources : le site ne reprend rien d'eux. Ce sont des
 * renvois, et la page dit qui les édite, parce qu'un classement fait par une
 * société n'a pas le même statut qu'une donnée publiée par l'État.
 *
 * Chaque lien profond a été vérifié sur un échantillon de communes avant
 * d'être écrit ici, et la règle qui le construit dit où il ne vaut pas :
 * DataFrance ne classe que la métropole, TerriSTORY ne reconnaît pas les
 * communes de Corse. Un site qui n'a pas de page pour la commune ne reçoit
 * pas de lien plutôt qu'un lien vers une page vide.
 */

export interface SiteComplementaire {
  id: string;
  nom: string;
  /** Qui l'édite, en une expression : c'est ce qui dit quel crédit lui donner. */
  editeur: string;
  /** Ce qu'on y trouve, du point de vue du lecteur. */
  quoi: string;
  url: string;
}

const sansAccents = (s: string) =>
  s
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'Oe')
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
/** « L'Abergement-Clémenciat » → « l-abergement-clemenciat » : la règle de DataFrance, vérifiée sur huit communes. */
const slug = (s: string) =>
  sansAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Les régions de TerriSTORY qui reconnaissent les communes, par code de région. La Corse ne les reconnaît pas. */
const TERRISTORY: Record<string, string> = {
  '84': 'auvergne-rhone-alpes',
  '27': 'bourgogne-franche-comte',
  '53': 'bretagne',
  '24': 'centre-val-de-loire',
  '44': 'grand-est',
  '32': 'hauts-de-france',
  '11': 'ile-de-france',
  '28': 'normandie',
  '75': 'nouvelle-aquitaine',
  '76': 'occitanie',
  '93': 'paca',
  '52': 'paysdelaloire',
};

const metropole = (dep: string) => dep.length === 2;

/** Les autres regards sur une commune : ceux qui ont une page pour elle. */
export function sitesDeCommune(c: { code: string; nom: string; dep: string; depNom: string; codeRegion?: string }): SiteComplementaire[] {
  const sites: SiteComplementaire[] = [];
  if (metropole(c.dep)) {
    sites.push({
      id: 'datafrance',
      nom: 'DataFrance',
      editeur: 'une société, JBMS Tech',
      quoi: 'son rang parmi les communes du département sur neuf dimensions — services, santé, sécurité, coût de la vie… —, calculé à partir de données publiques',
      url: `https://datafrance.org/commune/${c.code}-${slug(c.nom)}`,
    });
  }
  const region = c.codeRegion ? TERRISTORY[c.codeRegion] : undefined;
  if (region) {
    sites.push({
      id: 'terristory',
      nom: 'TerriSTORY',
      editeur: 'un consortium d’agences régionales de l’énergie et de collectivités, avec l’ADEME',
      quoi: 'la consommation d’énergie, les émissions de gaz à effet de serre et la production renouvelable de la commune, en cartes et en séries',
      url: `https://terristory.fr/${region}?zone=commune&zone_id=${c.code}&maille=commune`,
    });
  }
  return sites;
}

/** Pour qui achète pour une collectivité, ou y répond : des outils, pas des données sur la commune. */
export const SITES_COMMANDE_PUBLIQUE: SiteComplementaire[] = [
  {
    id: 'magali-outils',
    nom: 'Magali parle marchés — les outils',
    editeur: 'le site personnel d’une acheteuse publique',
    quoi: 'des outils libres, sans inscription : dossier de candidature qui remplace le DC1 et le DC2, tableau de notation des offres, rétroplanning d’une procédure',
    url: 'https://magaliparlemarches.fr/#outils',
  },
  {
    id: 'onveillecp',
    nom: 'OnVeille CP',
    editeur: 'une veille partagée, tenue à titre personnel',
    quoi: 'la veille juridique de la commande publique, mise en commun par ses membres et résumée chaque semaine',
    url: 'https://onveillecp.fr/',
  },
];

/**
 * Vérifier une entreprise — un titulaire, un candidat, un fournisseur — aux
 * registres publics : qu'elle existe, qu'elle est active, que son numéro de TVA
 * et son adresse sont les bons. Des services de l'État ou de l'Union, sans
 * inscription.
 */
export const SITES_VERIFIER_ENTREPRISE: SiteComplementaire[] = [
  {
    id: 'annuaire-entreprises',
    nom: 'Annuaire des entreprises',
    editeur: 'l’État (direction interministérielle du numérique)',
    quoi: 'à partir d’un nom, d’un SIREN ou d’un SIRET : l’état administratif, les établissements, les dirigeants déclarés, les labels et certifications, les annonces légales',
    url: 'https://annuaire-entreprises.data.gouv.fr/',
  },
  {
    id: 'avis-situation-sirene',
    nom: 'Avis de situation au répertoire SIRENE',
    editeur: 'l’INSEE',
    quoi: 'le document officiel, à télécharger, qui atteste l’inscription d’une entreprise ou d’un établissement et son état, actif ou fermé',
    url: 'https://avis-situation-sirene.insee.fr/',
  },
  {
    id: 'data-inpi',
    nom: 'Data INPI',
    editeur: 'l’Institut national de la propriété industrielle',
    quoi: 'le registre national des entreprises : la forme juridique, le capital, les dirigeants, les actes et comptes déposés, et l’extrait gratuit',
    url: 'https://data.inpi.fr/',
  },
  {
    id: 'vies',
    nom: 'VIES',
    editeur: 'la Commission européenne',
    quoi: 'vérifier qu’un numéro de TVA intracommunautaire est valide, en France ou dans un autre pays de l’Union',
    url: 'https://ec.europa.eu/taxation_customs/vies/',
  },
  {
    id: 'bodacc',
    nom: 'BODACC',
    editeur: 'l’État (direction de l’information légale et administrative)',
    quoi: 'les annonces légales d’une entreprise : création, vente, modification, procédure collective, radiation',
    url: 'https://www.bodacc.fr/',
  },
  {
    id: 'ban',
    nom: 'Base adresse nationale',
    editeur: 'l’État, avec les communes qui la tiennent à jour',
    quoi: 'vérifier qu’une adresse existe et la retrouver telle qu’elle est référencée, avec sa position',
    url: 'https://adresse.data.gouv.fr/',
  },
];
