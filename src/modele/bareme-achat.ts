/**
 * Les frais d'un achat immobilier dans l'ancien, poste par poste et
 * bénéficiaire par bénéficiaire. Chaque taux vient d'un texte relu à la
 * date de `RELU` ; quand un département vote un nouveau taux, on met à jour
 * la table d'après le tableau de la DGFiP, et rien d'autre.
 */

/** Relu le 12 octobre 2026. */
export const RELU = '2026-10-12';

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
/** Dans le neuf (vente en l'état futur d'achèvement, soumise à la TVA) : 0,70 % pour le département, 2,14 % de frais d'assiette, pas de taxe communale (impots.gouv.fr). */
export const NEUF = { departement: 0.7, assiette: 2.14 };

export function emoluments(prix: number): number {
  let reste = prix;
  let bas = 0;
  let total = 0;
  for (const [haut, taux] of EMOLUMENTS) {
    const tranche = Math.max(0, Math.min(reste, haut - bas));
    total += (tranche * taux) / 100;
    reste -= tranche;
    bas = haut;
    if (reste <= 0) break;
  }
  return total;
}

export interface Frais {
  tauxDepartement: number;
  /** Le taux qu'aurait appliqué le département sans la hausse, pour comparer. */
  tauxSansHausse: number;
  departement: number;
  commune: number;
  etatAssiette: number;
  csi: number;
  emolumentsHt: number;
  tva: number;
  total: number;
}

export function fraisAchat(prix: number, dep: string, primo: boolean, neuf = false): Frais | null {
  const t = TAUX_DEPARTEMENT[dep];
  if (!t) return null;
  if (neuf) {
    const departement = (prix * NEUF.departement) / 100;
    const etatAssiette = (departement * NEUF.assiette) / 100;
    const csi = Math.max(CSI.minimum, (prix * CSI.taux) / 100);
    const emolumentsHt = emoluments(prix);
    const tva = emolumentsHt * TVA_EMOLUMENTS;
    return { tauxDepartement: NEUF.departement, tauxSansHausse: NEUF.departement, departement, commune: 0, etatAssiette, csi, emolumentsHt, tva, total: departement + etatAssiette + csi + emolumentsHt + tva };
  }
  const [majore, base] = t;
  const reduit = primo ? PREMIERE_PROPRIETE[dep] : undefined;
  const tauxDepartement = reduit ?? (primo || majore === null ? base : majore);
  const departement = (prix * tauxDepartement) / 100;
  const commune = (prix * TAXE_COMMUNALE) / 100;
  const etatAssiette = (departement * FRAIS_ASSIETTE) / 100;
  const csi = Math.max(CSI.minimum, (prix * CSI.taux) / 100);
  const emolumentsHt = emoluments(prix);
  const tva = emolumentsHt * TVA_EMOLUMENTS;
  return {
    tauxDepartement,
    tauxSansHausse: reduit ?? base,
    departement,
    commune,
    etatAssiette,
    csi,
    emolumentsHt,
    tva,
    total: departement + commune + etatAssiette + csi + emolumentsHt + tva,
  };
}
