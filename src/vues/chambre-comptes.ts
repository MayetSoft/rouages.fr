/**
 * La chambre régionale des comptes de chaque région, et le lien vers ses
 * publications sur ccomptes.fr.
 *
 * Ni les rapports ni les recommandations ne sont publiés en données ouvertes
 * tenues à jour : le jeu de data.gouv s'arrête aux rapports de 2019, et le
 * suivi des recommandations n'existe qu'en PDF, à l'échelle nationale. Le
 * site ne liste donc rien : il renvoie à la recherche de la chambre, filtrée
 * sur le nom de la collectivité — `region` et `search` sont les paramètres que
 * la page des publications emploie elle-même.
 *
 * Adresses relevées sur ccomptes.fr le 30 septembre 2026. Les Antilles et la
 * Guyane ont une chambre commune, La Réunion et Mayotte aussi.
 */
const CHAMBRES: Record<string, { chemin: string; nom: string }> = {
  '84': { chemin: '/fr/crc-auvergne-rhone-alpes', nom: 'Auvergne-Rhône-Alpes' },
  '27': { chemin: '/fr/crc-bourgogne-franche-comte', nom: 'Bourgogne-Franche-Comté' },
  '53': { chemin: '/fr/crc-bretagne', nom: 'Bretagne' },
  '24': { chemin: '/fr/crc-centre-val-de-loire', nom: 'Centre-Val de Loire' },
  '94': { chemin: '/fr/crc-corse', nom: 'Corse' },
  '44': { chemin: '/fr/crc-grand-est', nom: 'Grand Est' },
  '32': { chemin: '/fr/crc-hauts-de-france', nom: 'Hauts-de-France' },
  '11': { chemin: '/fr/crc-ile-de-france', nom: 'Île-de-France' },
  '28': { chemin: '/fr/crc-normandie', nom: 'Normandie' },
  '75': { chemin: '/fr/crc-nouvelle-aquitaine', nom: 'Nouvelle-Aquitaine' },
  '76': { chemin: '/fr/crc-occitanie', nom: 'Occitanie' },
  '52': { chemin: '/fr/crc-pays-de-la-loire', nom: 'Pays de la Loire' },
  '93': { chemin: '/fr/crc-provence-alpes-cote-dazur', nom: 'Provence-Alpes-Côte d’Azur' },
  '01': { chemin: '/fr/antilles-guyane', nom: 'Guadeloupe, Guyane et Martinique' },
  '02': { chemin: '/fr/antilles-guyane', nom: 'Guadeloupe, Guyane et Martinique' },
  '03': { chemin: '/fr/antilles-guyane', nom: 'Guadeloupe, Guyane et Martinique' },
  '04': { chemin: '/fr/crc-la-reunion-et-mayotte', nom: 'La Réunion et Mayotte' },
  '06': { chemin: '/fr/crc-la-reunion-et-mayotte', nom: 'La Réunion et Mayotte' },
};

export interface LienChambre {
  nom: string;
  accueil: string;
  recherche: string;
}

/** La chambre d'une région, et la recherche d'un nom dans ses publications. */
export function chambreDesComptes(codeRegion: string | undefined, recherche: string): LienChambre | null {
  const c = codeRegion ? CHAMBRES[codeRegion] : undefined;
  if (!c) return null;
  const base = 'https://www.ccomptes.fr';
  return {
    nom: c.nom,
    accueil: `${base}${c.chemin}`,
    recherche: `${base}/fr/publications?region=${encodeURIComponent(c.chemin)}&search=${encodeURIComponent(recherche)}`,
  };
}
