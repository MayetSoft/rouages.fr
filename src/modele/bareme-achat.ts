/**
 * Les frais d'un achat immobilier dans l'ancien, poste par poste et
 * bénéficiaire par bénéficiaire. Chaque taux vient d'un texte relu à la
 * date de `RELU` ; quand un département vote un nouveau taux, on met à jour
 * la table d'après le tableau de la DGFiP, et rien d'autre.
 */

/** Relu le 13 octobre 2026. */
export const RELU = '2026-10-13';

export const SOURCES = {
  taux: {
    titre: 'DGFiP — Droits d’enregistrement et taxe de publicité foncière : taux applicables au 1er juin 2026',
    url: 'https://www.impots.gouv.fr/sites/default/files/media/1_metier/3_partenaire/notaires/dmto/dmto_2026-06.pdf',
  },
  bofip: {
    titre: 'BOFiP — BOI-ENR-DMTOI-10-20, mutations d’immeubles, régime de droit commun (17 juin 2026)',
    url: 'https://bofip.impots.gouv.fr/bofip/3311-PGP.html/identifiant=BOI-ENR-DMTOI-10-20-20260617',
  },
  impots: {
    titre: 'impots.gouv.fr — J’achète un bien immobilier : quels frais dois-je payer chez le notaire ?',
    url: 'https://www.impots.gouv.fr/particulier/questions/jachete-un-bien-immobilier-quaurai-je-payer-comme-frais-au-notaire',
  },
  tarif: {
    titre: 'Code de commerce — tarif des notaires : vente (art. A444-91), formalités (art. A444-169 à A444-173-1), remises (art. A444-174), écrêtement (art. R444-9 et A444-175), édition consolidée du 1er octobre 2026',
    url: 'https://codes.droit.org/PDF/Code%20de%20commerce.pdf',
  },
  servicePublic: {
    titre: 'Service-public.fr — Frais de notaire : qu’est-ce que c’est ? (vérifié le 5 août 2026)',
    url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F17701',
  },
  notaires: {
    titre: 'Notaires de France — Simulateur des frais d’acquisition : forfaits de formalités et de débours, relevés le 16 octobre 2026 sur son service de calcul',
    url: 'https://www.immobilier.notaires.fr/fr/frais-de-notaire',
  },
  communes: {
    titre: 'collectivites-locales.gouv.fr — Droits de mutation',
    url: 'https://www.collectivites-locales.gouv.fr/gerer-les-finances-publiques-locales/fiscalite-locale/fiscalite-indirecte-locale/droits-de-mutation',
  },
} as const;

/**
 * Les taux votés par chaque département au 1er juin 2026, en % : le taux
 * relevé jusqu'à 5 % par l'article 116 de la loi de finances pour 2025 (hors
 * primo-accédants), ou null si le département ne l'a pas voté ; puis le taux
 * de l'article 1594 D du CGI, qui s'applique aux primo-accédants et partout
 * ailleurs. La Corse, l'Alsace et la Guyane votent pour leurs deux
 * départements ou à l'échelle de la collectivité.
 */
export const TAUX_DEPARTEMENT: Record<string, [number | null, number]> = {
  '01': [5.0, 4.5],
  '02': [5.0, 4.5],
  '03': [5.0, 4.5],
  '04': [5.0, 4.5],
  '05': [null, 4.5],
  '06': [null, 4.5],
  '07': [null, 4.5],
  '08': [5.0, 4.5],
  '09': [5.0, 4.5],
  '10': [5.0, 4.5],
  '11': [5.0, 4.5],
  '12': [5.0, 4.5],
  '13': [5.0, 4.5],
  '14': [5.0, 4.5],
  '15': [5.0, 4.5],
  '16': [null, 4.5],
  '17': [5.0, 4.5],
  '18': [5.0, 4.5],
  '19': [5.0, 4.5],
  '21': [5.0, 4.5],
  '22': [5.0, 4.5],
  '23': [5.0, 4.5],
  '24': [5.0, 4.5],
  '25': [5.0, 4.5],
  '26': [null, 4.5],
  '27': [5.0, 4.5],
  '28': [5.0, 4.5],
  '29': [5.0, 4.5],
  '2A': [5.0, 4.5],
  '2B': [5.0, 4.5],
  '30': [5.0, 4.5],
  '31': [5.0, 4.5],
  '32': [5.0, 4.5],
  '33': [5.0, 4.5],
  '34': [5.0, 4.5],
  '35': [5.0, 4.5],
  '36': [null, 3.8],
  '37': [5.0, 4.5],
  '38': [5.0, 4.5],
  '39': [5.0, 4.5],
  '40': [5.0, 4.5],
  '41': [5.0, 4.5],
  '42': [5.0, 4.5],
  '43': [5.0, 4.5],
  '44': [5.0, 4.5],
  '45': [5.0, 4.5],
  '46': [5.0, 4.5],
  '47': [5.0, 4.5],
  '48': [null, 4.5],
  '49': [5.0, 4.5],
  '50': [5.0, 4.5],
  '51': [5.0, 4.5],
  '52': [5.0, 4.5],
  '53': [5.0, 4.5],
  '54': [5.0, 4.5],
  '55': [5.0, 4.5],
  '56': [5.0, 4.5],
  '57': [5.0, 4.5],
  '58': [5.0, 4.5],
  '59': [5.0, 4.5],
  '60': [null, 4.5],
  '61': [5.0, 4.5],
  '62': [5.0, 4.5],
  '63': [5.0, 4.5],
  '64': [5.0, 4.5],
  '65': [null, 4.5],
  '66': [5.0, 4.5],
  '67': [5.0, 4.5],
  '68': [5.0, 4.5],
  '69': [5.0, 4.5],
  '70': [5.0, 4.5],
  '71': [null, 4.5],
  '72': [5.0, 4.5],
  '73': [5.0, 4.5],
  '74': [5.0, 4.5],
  '75': [5.0, 4.5],
  '76': [5.0, 4.5],
  '77': [5.0, 4.5],
  '78': [5.0, 4.5],
  '79': [5.0, 4.5],
  '80': [5.0, 4.5],
  '81': [5.0, 4.5],
  '82': [5.0, 4.5],
  '83': [5.0, 4.5],
  '84': [5.0, 4.5],
  '85': [5.0, 4.5],
  '86': [5.0, 4.5],
  '87': [5.0, 4.5],
  '88': [5.0, 4.5],
  '89': [5.0, 4.5],
  '90': [5.0, 4.5],
  '91': [5.0, 4.5],
  '92': [5.0, 4.5],
  '93': [5.0, 4.5],
  '94': [5.0, 4.5],
  '95': [5.0, 4.5],
  '971': [null, 4.5],
  '972': [5.0, 4.5],
  '973': [5.0, 4.5],
  '974': [5.0, 4.5],
  '976': [null, 4.5],
};

/** La Savoie réduit le taux à 4 % pour une première propriété (CGI, art. 1594 F septies). */
export const PREMIERE_PROPRIETE: Record<string, number> = { '73': 4.0 };

/** La hausse jusqu'à 5 % vaut pour les actes passés du 1er avril 2025 au 31 mars 2028. */
export const FIN_HAUSSE = '2028-03-31';

/** La taxe communale additionnelle (CGI, art. 1584), en %. */
export const TAXE_COMMUNALE = 1.2;
/** Au-delà de ce nombre d'habitants, ou station classée de tourisme, la commune la perçoit elle-même ; sinon le fonds départemental de péréquation (art. 1595 bis). */
export const SEUIL_COMMUNE = 5000;
/** Les frais d'assiette et de recouvrement de l'État, en % de la part départementale (CGI, art. 1647 V). */
export const FRAIS_ASSIETTE = 2.37;
/** La contribution de sécurité immobilière : 0,10 % du prix, 15 € au moins (CGI, art. 879). */
export const CSI = { taux: 0.1, minimum: 15 };
/** Les émoluments proportionnels du notaire pour une vente (code de commerce, art. A444-91), HT, par tranche ; TVA à 20 %. */
export const EMOLUMENTS: [number, number][] = [
  [6_500, 3.87],
  [17_000, 1.596],
  [60_000, 1.064],
  [Infinity, 0.799],
];
export const TVA_EMOLUMENTS = 0.2;

/**
 * Les émoluments de formalités d'une vente de logement : des montants fixes,
 * HT, tels que le tarif les écrit (code de commerce, art. A444-169 à
 * A444-173-1, numéros du tableau 5 de l'annexe 4-7). `quand` dit dans quel
 * dossier la formalité est due :
 * - `toujours` : toute vente publiée au fichier immobilier ; la vérification
 *   du casier de l'acquéreur est exigée pour tout logement (code de la
 *   construction et de l'habitation, art. L551-1) ;
 * - `copro` : un lot de copropriété ;
 * - `preemption` : un bien soumis à un droit de préemption, par notification.
 */
export const FORMALITES: { numero: number; libelle: string; montant: number; quand: 'toujours' | 'copro' | 'preemption' }[] = [
  { numero: 194, libelle: 'Forfait des formalités d’un acte publié au fichier immobilier : état civil, cadastre, copies, réquisitions d’état', montant: 339.58, quand: 'toujours' },
  { numero: 188, libelle: 'Réquisition de publication au service de la publicité foncière', montant: 18.87, quand: 'toujours' },
  { numero: 181, libelle: 'Vérification du casier judiciaire de l’acquéreur (interdiction d’acheter un logement)', montant: 37.73, quand: 'toujours' },
  { numero: 195, libelle: 'Transmission de la vente au Conseil supérieur du notariat (base des prix immobiliers)', montant: 15.31, quand: 'toujours' },
  { numero: 182, libelle: 'Vérification de l’immatriculation du syndicat des copropriétaires', montant: 15.09, quand: 'copro' },
  { numero: 220, libelle: 'Obtention et vérification du certificat de mesurage (loi Carrez)', montant: 15.09, quand: 'copro' },
  { numero: 187, libelle: 'Notification pour la purge du droit de préemption (déclaration d’intention d’aliéner)', montant: 37.73, quand: 'preemption' },
];
/** Ce qui peut s'ajouter selon les pièces que le notaire obtient lui-même, par pièce (art. A444-172 et A444-172-1). */
export const FORMALITES_PAR_PIECE = { document: 56.6, diagnostic: 15.09 };
/** Le total des émoluments d'une mutation est écrêté à 10 % de la valeur, 90 € au moins (art. R444-9 et A444-175). */
export const ECRETEMENT = { taux: 10, minimum: 90 };
/** La remise que le notaire peut consentir, la même pour tous ses clients : 20 % au plus de l'émolument calculé sur les tranches de 100 000 € et plus (art. A444-174). */
export const REMISE = { taux: 20, seuil: 100_000 };
/**
 * Ce qu'un dossier ordinaire coûte en plus du minimum : les forfaits du
 * simulateur des notaires de France, relevés le 16 octobre 2026 sur son
 * service de calcul (`/pub-services/inotr-www-calculs/v1/frais-acquisition`),
 * les mêmes à 20 000, 50 000, 150 000 et 500 000 € dans l'ancien —
 * 850 € HT de formalités, à la place des seules formalités obligatoires, et
 * 400 € de débours, sans TVA. Le tarif fixe le prix de chaque formalité, pas
 * leur nombre : le notaire en ajoute selon les pièces du dossier
 * (urbanisme, état hypothécaire, diagnostics). Ce service applique encore
 * les taux de l'acte d'avant 2021 ; on n'en reprend que les deux forfaits.
 */
export const FORFAITS_NOTAIRES = { formalitesHt: 850, debours: 400, releve: '2026-10-16' } as const;

/** Dans le neuf (vente en l'état futur d'achèvement, soumise à la TVA) : 0,70 % pour le département, 2,14 % de frais d'assiette, pas de taxe communale (impots.gouv.fr). */
export const NEUF = { departement: 0.7, assiette: 2.14 };

/** L'émolument de l'acte, tranche par tranche : de, à, taux, la part du prix dans la tranche, le montant HT. */
export interface Tranche {
  de: number;
  a: number;
  taux: number;
  assiette: number;
  montant: number;
}

export function tranches(prix: number): Tranche[] {
  const t: Tranche[] = [];
  let bas = 0;
  for (const [haut, taux] of EMOLUMENTS) {
    const assiette = Math.max(0, Math.min(prix, haut) - bas);
    if (assiette <= 0) break;
    t.push({ de: bas, a: haut, taux, assiette, montant: (assiette * taux) / 100 });
    bas = haut;
  }
  return t;
}

export function emoluments(prix: number): number {
  return tranches(prix).reduce((s, t) => s + t.montant, 0);
}

/** La remise la plus forte que le tarif permet : 20 % de l'émolument calculé sur la part du prix au-delà de 100 000 €. */
export function remiseMaximale(prix: number): number {
  const partHaute = Math.max(0, prix - REMISE.seuil);
  const taux = EMOLUMENTS.find(([haut]) => REMISE.seuil < haut)![1];
  return (((partHaute * taux) / 100) * REMISE.taux) / 100;
}

export interface Dossier {
  copro: boolean;
  preemption: boolean;
}

export interface Frais {
  tauxDepartement: number;
  /** Le taux qu'aurait appliqué le département sans la hausse, pour comparer. */
  tauxSansHausse: number;
  departement: number;
  commune: number;
  etatAssiette: number;
  csi: number;
  /** L'émolument de l'acte et celui des formalités, HT, avant écrêtement. */
  acte: number;
  tranches: Tranche[];
  formalites: { numero: number; libelle: string; montant: number }[];
  formalitesHt: number;
  /** Ce que l'écrêtement à 10 % du prix retire, 0 le plus souvent. */
  ecretement: number;
  /** Ce que touche le notaire, HT, après écrêtement. */
  emolumentsHt: number;
  tva: number;
  remiseMaximale: number;
  /** Le minimum que fixe le tarif : les impôts, l'acte et les seules formalités obligatoires. */
  total: number;
  /** Dans l'ancien : le même achat avec les forfaits des notaires de France. Absent dans le neuf. */
  usuel: Usuel | null;
}

export interface Usuel {
  formalitesHt: number;
  emolumentsHt: number;
  tva: number;
  debours: number;
  total: number;
}

/** Le minimum, avec les forfaits de formalités et de débours d'un dossier ordinaire ; l'écrêtement vaut toujours. */
function usuel(prix: number, f: Omit<Frais, 'usuel'>): Usuel {
  const formalitesHt = Math.max(f.formalitesHt, FORFAITS_NOTAIRES.formalitesHt);
  const plafond = Math.max(ECRETEMENT.minimum, (prix * ECRETEMENT.taux) / 100);
  const emolumentsHt = Math.min(f.acte + formalitesHt, plafond);
  const tva = emolumentsHt * TVA_EMOLUMENTS;
  const impots = f.total - f.emolumentsHt - f.tva;
  return { formalitesHt, emolumentsHt, tva, debours: FORFAITS_NOTAIRES.debours, total: impots + emolumentsHt + tva + FORFAITS_NOTAIRES.debours };
}

function notaire(prix: number, dossier: Dossier) {
  const t = tranches(prix);
  const acte = t.reduce((s, x) => s + x.montant, 0);
  const formalites = FORMALITES.filter((f) => f.quand === 'toujours' || (f.quand === 'copro' && dossier.copro) || (f.quand === 'preemption' && dossier.preemption)).map(
    ({ numero, libelle, montant }) => ({ numero, libelle, montant }),
  );
  const formalitesHt = formalites.reduce((s, f) => s + f.montant, 0);
  const plafond = Math.max(ECRETEMENT.minimum, (prix * ECRETEMENT.taux) / 100);
  const emolumentsHt = Math.min(acte + formalitesHt, plafond);
  return { tranches: t, acte, formalites, formalitesHt, ecretement: acte + formalitesHt - emolumentsHt, emolumentsHt, tva: emolumentsHt * TVA_EMOLUMENTS, remiseMaximale: Math.min(remiseMaximale(prix), emolumentsHt) };
}

export function fraisAchat(prix: number, dep: string, primo: boolean, neuf = false, dossier: Dossier = { copro: false, preemption: false }): Frais | null {
  const t = TAUX_DEPARTEMENT[dep];
  if (!t) return null;
  const n = notaire(prix, dossier);
  if (neuf) {
    const departement = (prix * NEUF.departement) / 100;
    const etatAssiette = (departement * NEUF.assiette) / 100;
    const csi = Math.max(CSI.minimum, (prix * CSI.taux) / 100);
    return { tauxDepartement: NEUF.departement, tauxSansHausse: NEUF.departement, departement, commune: 0, etatAssiette, csi, ...n, total: departement + etatAssiette + csi + n.emolumentsHt + n.tva, usuel: null };
  }
  const [majore, base] = t;
  const reduit = primo ? PREMIERE_PROPRIETE[dep] : undefined;
  const tauxDepartement = reduit ?? (primo || majore === null ? base : majore);
  const departement = (prix * tauxDepartement) / 100;
  const commune = (prix * TAXE_COMMUNALE) / 100;
  const etatAssiette = (departement * FRAIS_ASSIETTE) / 100;
  const csi = Math.max(CSI.minimum, (prix * CSI.taux) / 100);
  const f = {
    tauxDepartement,
    tauxSansHausse: reduit ?? base,
    departement,
    commune,
    etatAssiette,
    csi,
    ...n,
    total: departement + commune + etatAssiette + csi + n.emolumentsHt + n.tva,
  };
  return { ...f, usuel: usuel(prix, f) };
}
