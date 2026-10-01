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
