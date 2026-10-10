/**
 * Le SIREN de chaque département, de chaque région, et des collectivités qui
 * en tiennent lieu — la Collectivité européenne d'Alsace, la Collectivité de
 * Corse, celles de Guyane et de Martinique, le Département de Mayotte —, avec
 * leur nom et les départements qu'elles couvrent.
 *
 * Généré par `npx tsx scripts/collectivites-sirens.ts` depuis le répertoire
 * SIRENE et le découpage Etalab : la table entre les deux marques se réécrit,
 * le reste du fichier non. Ne pas la modifier à la main. Dernière génération :
 * 9 octobre 2026.
 *
 * `code` est celui de la page du site : le code du département, `67A` pour
 * l'Alsace, le code de la région.
 */
export interface CollectiviteEchelon {
  echelon: 'departement' | 'region';
  code: string;
  nom: string;
  deps: string[];
}

export const COLLECTIVITES_SIRENS: ReadonlyMap<string, CollectiviteEchelon> = new Map<string, CollectiviteEchelon>([
// <table>
  ['220100010', { echelon: 'departement', code: '01', nom: 'Département de l’Ain', deps: ['01'] }],
  ['220200026', { echelon: 'departement', code: '02', nom: 'Département de l’Aisne', deps: ['02'] }],
  ['220300016', { echelon: 'departement', code: '03', nom: 'Département de l’Allier', deps: ['03'] }],
  ['220400014', { echelon: 'departement', code: '04', nom: 'Département des Alpes-de-Haute-Provence', deps: ['04'] }],
  ['220500011', { echelon: 'departement', code: '05', nom: 'Département des Hautes-Alpes', deps: ['05'] }],
  ['220600019', { echelon: 'departement', code: '06', nom: 'Département des Alpes-Maritimes', deps: ['06'] }],
  ['220700017', { echelon: 'departement', code: '07', nom: 'Département de l’Ardèche', deps: ['07'] }],
  ['220800049', { echelon: 'departement', code: '08', nom: 'Département des Ardennes', deps: ['08'] }],
  ['220900013', { echelon: 'departement', code: '09', nom: 'Département de l’Ariège', deps: ['09'] }],
  ['221000052', { echelon: 'departement', code: '10', nom: 'Département de l’Aube', deps: ['10'] }],
  ['221100019', { echelon: 'departement', code: '11', nom: 'Département de l’Aude', deps: ['11'] }],
  ['221200017', { echelon: 'departement', code: '12', nom: 'Département de l’Aveyron', deps: ['12'] }],
  ['221300015', { echelon: 'departement', code: '13', nom: 'Département des Bouches-du-Rhône', deps: ['13'] }],
  ['221401185', { echelon: 'departement', code: '14', nom: 'Département du Calvados', deps: ['14'] }],
  ['221500010', { echelon: 'departement', code: '15', nom: 'Département du Cantal', deps: ['15'] }],
  ['221600018', { echelon: 'departement', code: '16', nom: 'Département de la Charente', deps: ['16'] }],
  ['221700016', { echelon: 'departement', code: '17', nom: 'Département de la Charente-Maritime', deps: ['17'] }],
  ['221800014', { echelon: 'departement', code: '18', nom: 'Département du Cher', deps: ['18'] }],
  ['221927205', { echelon: 'departement', code: '19', nom: 'Département de la Corrèze', deps: ['19'] }],
  ['222100018', { echelon: 'departement', code: '21', nom: 'Département de la Côte-d’Or', deps: ['21'] }],
  ['222200016', { echelon: 'departement', code: '22', nom: 'Département des Côtes-d’Armor', deps: ['22'] }],
  ['222309627', { echelon: 'departement', code: '23', nom: 'Département de la Creuse', deps: ['23'] }],
  ['222400012', { echelon: 'departement', code: '24', nom: 'Département de la Dordogne', deps: ['24'] }],
  ['222500019', { echelon: 'departement', code: '25', nom: 'Département du Doubs', deps: ['25'] }],
  ['222600017', { echelon: 'departement', code: '26', nom: 'Département de la Drôme', deps: ['26'] }],
  ['222702292', { echelon: 'departement', code: '27', nom: 'Département de l’Eure', deps: ['27'] }],
  ['222800013', { echelon: 'departement', code: '28', nom: 'Département d’Eure-et-Loir', deps: ['28'] }],
  ['222900011', { echelon: 'departement', code: '29', nom: 'Département du Finistère', deps: ['29'] }],
  ['223000019', { echelon: 'departement', code: '30', nom: 'Département du Gard', deps: ['30'] }],
  ['223100017', { echelon: 'departement', code: '31', nom: 'Département de la Haute-Garonne', deps: ['31'] }],
  ['223200015', { echelon: 'departement', code: '32', nom: 'Département du Gers', deps: ['32'] }],
  ['223300013', { echelon: 'departement', code: '33', nom: 'Département de la Gironde', deps: ['33'] }],
  ['223400011', { echelon: 'departement', code: '34', nom: 'Département de l’Hérault', deps: ['34'] }],
  ['223500018', { echelon: 'departement', code: '35', nom: 'Département d’Ille-et-Vilaine', deps: ['35'] }],
  ['223600016', { echelon: 'departement', code: '36', nom: 'Département de l’Indre', deps: ['36'] }],
  ['223700014', { echelon: 'departement', code: '37', nom: 'Département d’Indre-et-Loire', deps: ['37'] }],
  ['223800012', { echelon: 'departement', code: '38', nom: 'Département de l’Isère', deps: ['38'] }],
  ['223900010', { echelon: 'departement', code: '39', nom: 'Département du Jura', deps: ['39'] }],
  ['224000018', { echelon: 'departement', code: '40', nom: 'Département des Landes', deps: ['40'] }],
  ['224100016', { echelon: 'departement', code: '41', nom: 'Département du Loir-et-Cher', deps: ['41'] }],
  ['224200014', { echelon: 'departement', code: '42', nom: 'Département de la Loire', deps: ['42'] }],
  ['224300012', { echelon: 'departement', code: '43', nom: 'Département de la Haute-Loire', deps: ['43'] }],
  ['224400028', { echelon: 'departement', code: '44', nom: 'Département de la Loire-Atlantique', deps: ['44'] }],
  ['224500017', { echelon: 'departement', code: '45', nom: 'Département du Loiret', deps: ['45'] }],
  ['224600015', { echelon: 'departement', code: '46', nom: 'Département du Lot', deps: ['46'] }],
  ['224700013', { echelon: 'departement', code: '47', nom: 'Département du Lot-et-Garonne', deps: ['47'] }],
  ['224800011', { echelon: 'departement', code: '48', nom: 'Département de la Lozère', deps: ['48'] }],
  ['224900019', { echelon: 'departement', code: '49', nom: 'Département de Maine-et-Loire', deps: ['49'] }],
  ['225005024', { echelon: 'departement', code: '50', nom: 'Département de la Manche', deps: ['50'] }],
  ['225100015', { echelon: 'departement', code: '51', nom: 'Département de la Marne', deps: ['51'] }],
  ['225200013', { echelon: 'departement', code: '52', nom: 'Département de la Haute-Marne', deps: ['52'] }],
  ['225300011', { echelon: 'departement', code: '53', nom: 'Département de la Mayenne', deps: ['53'] }],
  ['225400019', { echelon: 'departement', code: '54', nom: 'Département de Meurthe-et-Moselle', deps: ['54'] }],
  ['225500016', { echelon: 'departement', code: '55', nom: 'Département de la Meuse', deps: ['55'] }],
  ['225600014', { echelon: 'departement', code: '56', nom: 'Département du Morbihan', deps: ['56'] }],
  ['225700012', { echelon: 'departement', code: '57', nom: 'Département de la Moselle', deps: ['57'] }],
  ['225800010', { echelon: 'departement', code: '58', nom: 'Département de la Nièvre', deps: ['58'] }],
  ['225900018', { echelon: 'departement', code: '59', nom: 'Département du Nord', deps: ['59'] }],
  ['226000016', { echelon: 'departement', code: '60', nom: 'Département de l’Oise', deps: ['60'] }],
  ['226100014', { echelon: 'departement', code: '61', nom: 'Département de l’Orne', deps: ['61'] }],
  ['226200012', { echelon: 'departement', code: '62', nom: 'Département du Pas-de-Calais', deps: ['62'] }],
  ['226300010', { echelon: 'departement', code: '63', nom: 'Département du Puy-de-Dôme', deps: ['63'] }],
  ['226400018', { echelon: 'departement', code: '64', nom: 'Département des Pyrénées-Atlantiques', deps: ['64'] }],
  ['226500015', { echelon: 'departement', code: '65', nom: 'Département des Hautes-Pyrénées', deps: ['65'] }],
  ['226600013', { echelon: 'departement', code: '66', nom: 'Département des Pyrénées-Orientales', deps: ['66'] }],
  ['200094332', { echelon: 'departement', code: '67A', nom: 'Collectivité européenne d’Alsace', deps: ['67', '68'] }],
  ['226900017', { echelon: 'departement', code: '69', nom: 'Département du Rhône', deps: ['69'] }],
  ['227000015', { echelon: 'departement', code: '70', nom: 'Département de la Haute-Saône', deps: ['70'] }],
  ['227100013', { echelon: 'departement', code: '71', nom: 'Département de Saône-et-Loire', deps: ['71'] }],
  ['227200029', { echelon: 'departement', code: '72', nom: 'Département de la Sarthe', deps: ['72'] }],
  ['227300019', { echelon: 'departement', code: '73', nom: 'Département de la Savoie', deps: ['73'] }],
  ['227400017', { echelon: 'departement', code: '74', nom: 'Département de la Haute-Savoie', deps: ['74'] }],
  ['227605409', { echelon: 'departement', code: '76', nom: 'Département de la Seine-Maritime', deps: ['76'] }],
  ['227700010', { echelon: 'departement', code: '77', nom: 'Département de Seine-et-Marne', deps: ['77'] }],
  ['227806460', { echelon: 'departement', code: '78', nom: 'Département des Yvelines', deps: ['78'] }],
  ['227900016', { echelon: 'departement', code: '79', nom: 'Département des Deux-Sèvres', deps: ['79'] }],
  ['228000014', { echelon: 'departement', code: '80', nom: 'Département de la Somme', deps: ['80'] }],
  ['228100012', { echelon: 'departement', code: '81', nom: 'Département du Tarn', deps: ['81'] }],
  ['228200010', { echelon: 'departement', code: '82', nom: 'Département du Tarn-et-Garonne', deps: ['82'] }],
  ['228300018', { echelon: 'departement', code: '83', nom: 'Département du Var', deps: ['83'] }],
  ['228400016', { echelon: 'departement', code: '84', nom: 'Département du Vaucluse', deps: ['84'] }],
  ['228500013', { echelon: 'departement', code: '85', nom: 'Département de la Vendée', deps: ['85'] }],
  ['228600011', { echelon: 'departement', code: '86', nom: 'Département de la Vienne', deps: ['86'] }],
  ['228708517', { echelon: 'departement', code: '87', nom: 'Département de la Haute-Vienne', deps: ['87'] }],
  ['228800017', { echelon: 'departement', code: '88', nom: 'Département des Vosges', deps: ['88'] }],
  ['228900015', { echelon: 'departement', code: '89', nom: 'Département de l’Yonne', deps: ['89'] }],
  ['229000013', { echelon: 'departement', code: '90', nom: 'Département du Territoire de Belfort', deps: ['90'] }],
  ['229102280', { echelon: 'departement', code: '91', nom: 'Département de l’Essonne', deps: ['91'] }],
  ['229200506', { echelon: 'departement', code: '92', nom: 'Département des Hauts-de-Seine', deps: ['92'] }],
  ['229300082', { echelon: 'departement', code: '93', nom: 'Département de la Seine-Saint-Denis', deps: ['93'] }],
  ['229400288', { echelon: 'departement', code: '94', nom: 'Département du Val-de-Marne', deps: ['94'] }],
  ['229501275', { echelon: 'departement', code: '95', nom: 'Département du Val-d’Oise', deps: ['95'] }],
  ['229710017', { echelon: 'departement', code: '971', nom: 'Département de la Guadeloupe', deps: ['971'] }],
  ['229740014', { echelon: 'departement', code: '974', nom: 'Département de La Réunion', deps: ['974'] }],
  ['229850003', { echelon: 'departement', code: '976', nom: 'Département de Mayotte', deps: ['976'] }],
  ['239710015', { echelon: 'region', code: '01', nom: 'Région Guadeloupe', deps: ['971'] }],
  ['200055507', { echelon: 'region', code: '02', nom: 'Collectivité territoriale de Martinique', deps: ['972'] }],
  ['200052678', { echelon: 'region', code: '03', nom: 'Collectivité territoriale de Guyane', deps: ['973'] }],
  ['239740012', { echelon: 'region', code: '04', nom: 'Région La Réunion', deps: ['974'] }],
  ['237500079', { echelon: 'region', code: '11', nom: 'Région Île-de-France', deps: ['75', '77', '78', '91', '92', '93', '94', '95'] }],
  ['234500023', { echelon: 'region', code: '24', nom: 'Région Centre-Val de Loire', deps: ['18', '28', '36', '37', '41', '45'] }],
  ['200053726', { echelon: 'region', code: '27', nom: 'Région Bourgogne-Franche-Comté', deps: ['21', '25', '39', '58', '70', '71', '89', '90'] }],
  ['200053403', { echelon: 'region', code: '28', nom: 'Région Normandie', deps: ['14', '27', '50', '61', '76'] }],
  ['200053742', { echelon: 'region', code: '32', nom: 'Région Hauts-de-France', deps: ['02', '59', '60', '62', '80'] }],
  ['200052264', { echelon: 'region', code: '44', nom: 'Région Grand Est', deps: ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'] }],
  ['234400034', { echelon: 'region', code: '52', nom: 'Région Pays de la Loire', deps: ['44', '49', '53', '72', '85'] }],
  ['233500016', { echelon: 'region', code: '53', nom: 'Région Bretagne', deps: ['22', '29', '35', '56'] }],
  ['200053759', { echelon: 'region', code: '75', nom: 'Région Nouvelle-Aquitaine', deps: ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'] }],
  ['200053791', { echelon: 'region', code: '76', nom: 'Région Occitanie', deps: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'] }],
  ['200053767', { echelon: 'region', code: '84', nom: 'Région Auvergne-Rhône-Alpes', deps: ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'] }],
  ['231300021', { echelon: 'region', code: '93', nom: 'Région Provence-Alpes-Côte d’Azur', deps: ['04', '05', '06', '13', '83', '84'] }],
  ['200076958', { echelon: 'region', code: '94', nom: 'Collectivité de Corse', deps: ['2A', '2B'] }],
// </table>
]);

/**
 * Les collectivités au-dessus des communes d'un département : celle qui en
 * exerce les compétences départementales, puis la région — dans cet ordre,
 * sans trou. Une collectivité unique (Corse, Guyane, Martinique) n'apparaît
 * qu'une fois, au rang de la région.
 */
export function echelonsDuDepartement(dep: string): string[] {
  const rang = (echelon: CollectiviteEchelon['echelon']) =>
    [...COLLECTIVITES_SIRENS].filter(([, c]) => c.echelon === echelon && c.deps.includes(dep)).map(([s]) => s);
  return [...rang('departement'), ...rang('region')];
}
