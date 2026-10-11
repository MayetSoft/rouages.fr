/**
 * Les activités qu'on cherche près de chez soi, pour « Le plus proche » :
 * chacune avec ses codes de la nomenclature d'activités française (NAF
 * rév. 2), dont le libellé officiel est vérifié contre la liste de l'INSEE
 * (`naf2008_liste_n5.xls`, 11 octobre 2026).
 *
 * Ce sont des commerces, des artisans, des professions de santé et des
 * services qu'un habitant cherche quand ils manquent sur place. Le code dit
 * l'activité principale déclarée au répertoire SIRENE, pas ce que fait
 * vraiment l'établissement : une boulangerie peut être déclarée en
 * « commerce d'alimentation générale ». La page le dit.
 */
export interface ActiviteProche {
  id: string;
  nom: string;
  groupe: string;
  /** Les codes NAF rév. 2, et leur libellé INSEE. */
  naf: [string, string][];
}

export const ACTIVITES_PROCHES: ActiviteProche[] = [
  { id: 'boulangerie', nom: 'Boulangerie, pâtisserie', groupe: 'Commerces', naf: [['10.71C', 'Boulangerie et boulangerie-pâtisserie'], ['10.71D', 'Pâtisserie'], ['47.24Z', 'Commerce de détail de pain, pâtisserie et confiserie en magasin spécialisé']] },
  { id: 'epicerie', nom: 'Épicerie, supérette, supermarché', groupe: 'Commerces', naf: [['47.11B', 'Commerce d’alimentation générale'], ['47.11C', 'Supérettes'], ['47.11D', 'Supermarchés']] },
  { id: 'boucherie', nom: 'Boucherie', groupe: 'Commerces', naf: [['47.22Z', 'Commerce de détail de viandes et de produits à base de viande en magasin spécialisé']] },
  { id: 'primeur', nom: 'Fruits et légumes', groupe: 'Commerces', naf: [['47.21Z', 'Commerce de détail de fruits et légumes en magasin spécialisé']] },
  { id: 'presse', nom: 'Presse, papeterie, librairie', groupe: 'Commerces', naf: [['47.62Z', 'Commerce de détail de journaux et papeterie en magasin spécialisé'], ['47.61Z', 'Commerce de détail de livres en magasin spécialisé']] },
  { id: 'quincaillerie', nom: 'Quincaillerie, bricolage', groupe: 'Commerces', naf: [['47.52A', 'Commerce de détail de quincaillerie, peintures et verres en petites surfaces (moins de 400 m²)'], ['47.52B', 'Commerce de détail de quincaillerie, peintures et verres en grandes surfaces (400 m² et plus)']] },
  { id: 'fleuriste', nom: 'Fleuriste, jardinerie, animalerie', groupe: 'Commerces', naf: [['47.76Z', 'Commerce de détail de fleurs, plantes, graines, engrais, animaux de compagnie et aliments pour ces animaux en magasin spécialisé']] },
  { id: 'carburant', nom: 'Station-service', groupe: 'Commerces', naf: [['47.30Z', 'Commerce de détail de carburants en magasin spécialisé']] },
  { id: 'pharmacie', nom: 'Pharmacie', groupe: 'Santé', naf: [['47.73Z', 'Commerce de détail de produits pharmaceutiques en magasin spécialisé']] },
  { id: 'medecin', nom: 'Médecin généraliste', groupe: 'Santé', naf: [['86.21Z', 'Activité des médecins généralistes']] },
  { id: 'infirmier', nom: 'Infirmier, sage-femme', groupe: 'Santé', naf: [['86.90D', 'Activités des infirmiers et des sages-femmes']] },
  { id: 'reeducation', nom: 'Kinésithérapeute, podologue, rééducation', groupe: 'Santé', naf: [['86.90E', 'Activités des professionnels de la rééducation, de l’appareillage et des pédicures-podologues']] },
  { id: 'dentiste', nom: 'Dentiste', groupe: 'Santé', naf: [['86.23Z', 'Pratique dentaire']] },
  { id: 'opticien', nom: 'Opticien', groupe: 'Santé', naf: [['47.78A', 'Commerces de détail d’optique']] },
  { id: 'veterinaire', nom: 'Vétérinaire', groupe: 'Santé', naf: [['75.00Z', 'Activités vétérinaires']] },
  { id: 'plombier', nom: 'Plombier, chauffagiste', groupe: 'Artisans du bâtiment', naf: [['43.22A', 'Travaux d’installation d’eau et de gaz en tous locaux'], ['43.22B', 'Travaux d’installation d’équipements thermiques et de climatisation']] },
  { id: 'electricien', nom: 'Électricien', groupe: 'Artisans du bâtiment', naf: [['43.21A', 'Travaux d’installation électrique dans tous locaux']] },
  { id: 'macon', nom: 'Maçon', groupe: 'Artisans du bâtiment', naf: [['43.99C', 'Travaux de maçonnerie générale et gros œuvre de bâtiment']] },
  { id: 'menuisier', nom: 'Menuisier', groupe: 'Artisans du bâtiment', naf: [['43.32A', 'Travaux de menuiserie bois et PVC']] },
  { id: 'couvreur', nom: 'Couvreur', groupe: 'Artisans du bâtiment', naf: [['43.91B', 'Travaux de couverture par éléments']] },
  { id: 'paysagiste', nom: 'Paysagiste', groupe: 'Artisans du bâtiment', naf: [['81.30Z', 'Services d’aménagement paysager']] },
  { id: 'garage', nom: 'Garage automobile', groupe: 'Services', naf: [['45.20A', 'Entretien et réparation de véhicules automobiles légers'], ['45.20B', 'Entretien et réparation d’autres véhicules automobiles']] },
  { id: 'taxi', nom: 'Taxi', groupe: 'Services', naf: [['49.32Z', 'Transports de voyageurs par taxis']] },
  { id: 'auto-ecole', nom: 'Auto-école', groupe: 'Services', naf: [['85.53Z', 'Enseignement de la conduite']] },
  { id: 'coiffure', nom: 'Coiffeur', groupe: 'Services', naf: [['96.02A', 'Coiffure']] },
  { id: 'pressing', nom: 'Pressing, blanchisserie', groupe: 'Services', naf: [['96.01B', 'Blanchisserie-teinturerie de détail']] },
  { id: 'banque', nom: 'Banque', groupe: 'Services', naf: [['64.19Z', 'Autres intermédiations monétaires']] },
  { id: 'juridique', nom: 'Notaire, avocat', groupe: 'Services', naf: [['69.10Z', 'Activités juridiques']] },
  { id: 'aide-domicile', nom: 'Aide à domicile', groupe: 'Services', naf: [['88.10A', 'Aide à domicile']] },
  { id: 'jeunes-enfants', nom: 'Accueil de jeunes enfants', groupe: 'Services', naf: [['88.91A', 'Accueil de jeunes enfants']] },
  { id: 'funeraire', nom: 'Pompes funèbres', groupe: 'Services', naf: [['96.03Z', 'Services funéraires']] },
  { id: 'restaurant', nom: 'Restaurant', groupe: 'Se restaurer, se loger', naf: [['56.10A', 'Restauration traditionnelle'], ['56.10C', 'Restauration de type rapide']] },
  { id: 'bar', nom: 'Café, bar', groupe: 'Se restaurer, se loger', naf: [['56.30Z', 'Débits de boissons']] },
  { id: 'hotel', nom: 'Hôtel', groupe: 'Se restaurer, se loger', naf: [['55.10Z', 'Hôtels et hébergement similaire']] },
];
