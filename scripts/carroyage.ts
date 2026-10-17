/**
 * Le carroyage de l'INSEE : la population des ménages fiscaux par carreau de
 * 200 m (Filosofi 2021, publié le 16 février 2026), pour croiser une donnée
 * localisée avec les habitants plutôt qu'avec la surface — d'abord la
 * couverture mobile (`couverture-emettre.ts`).
 *
 * **Le fichier** : une archive de trois CSV — la métropole (2,3 millions de
 * carreaux habités), la Martinique, La Réunion ; les autres territoires
 * d'outre-mer n'y sont pas. L'identifiant d'un carreau porte son coin
 * sud-ouest : `CRS3035RES200mN2029400E4259000` en LAEA Europe (EPSG:3035)
 * pour la métropole, en UTM pour la Martinique (zone 20 nord) et La Réunion
 * (zone 40 sud). On prend son centre, cent mètres plus loin.
 *
 * **Ce qu'il compte** : `ind`, les individus des ménages fiscaux — pas les
 * personnes en collectivité (maisons de retraite, internats, casernes), ni
 * les sans-domicile. Un carreau de moins de onze ménages a des valeurs
 * estimées par l'INSEE (`i_est_200`), pour le secret statistique. Vérifié le
 * 16 octobre 2026 : 99,4 % des carreaux de métropole tombent, une fois
 * projetés, dans l'une des communes que l'INSEE leur donne (`lcog_geo`) ; le
 * reste est en bordure ou dans un arrondissement de Paris, Lyon ou
 * Marseille, que l'INSEE nomme à la place de sa commune.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { depuisLaea3035, depuisUtm } from './geo-formats.ts';
import { champs } from './horaires-gtfs.ts';

export const FILOSOFI = {
  url: 'https://www.insee.fr/fr/statistiques/fichier/8735162/Filosofi2021_carreaux_200m_csv.zip',
  fichier: 'filosofi2021-carreaux-200m-csv.zip',
  annee: 2021,
  page: 'https://www.insee.fr/fr/statistiques/8735162',
};

export type Territoire = 'met' | 'mart' | 'reun';

const PROJECTIONS: Record<Territoire, (x: number, y: number) => [number, number]> = {
  met: depuisLaea3035,
  mart: (x, y) => depuisUtm(x, y, 20, false),
  reun: (x, y) => depuisUtm(x, y, 40, true),
};

export interface Carreau {
  lon: number;
  lat: number;
  /** Les individus des ménages fiscaux. */
  ind: number;
  /** Les communes que l'INSEE donne au carreau (un arrondissement à Paris, Lyon, Marseille). */
  communes: string[];
}

/** Les carreaux habités d'un territoire, lus en flux dans l'archive. */
export async function* lireCarreaux(zip: string, territoire: Territoire): AsyncGenerator<Carreau> {
  const p = spawn('unzip', ['-p', zip, `carreaux_200m_${territoire}.csv`]);
  const projeter = PROJECTIONS[territoire];
  let colonnes: string[] | null = null;
  let iId = 0;
  let iCog = 0;
  let iInd = 0;
  for await (const brute of createInterface({ input: p.stdout, crlfDelay: Infinity })) {
    const l = brute.replace(/^﻿/, '');
    if (!l.trim()) continue;
    const c = champs(l);
    if (!colonnes) {
      colonnes = c.map((x) => x.trim().toLowerCase());
      [iId, iCog, iInd] = ['idcar_200m', 'lcog_geo', 'ind'].map((n) => colonnes!.indexOf(n));
      if (iId < 0 || iCog < 0 || iInd < 0) throw new Error(`carroyage : colonnes attendues absentes (${colonnes.join(', ')})`);
      continue;
    }
    const m = /N(\d+)E(\d+)$/.exec(c[iId] ?? '');
    const ind = Number(c[iInd]);
    if (!m || !(ind > 0)) continue;
    const [lon, lat] = projeter(Number(m[2]) + 100, Number(m[1]) + 100);
    yield { lon, lat, ind, communes: (c[iCog] ?? '').split(',').map((x) => x.trim()).filter(Boolean) };
  }
}
