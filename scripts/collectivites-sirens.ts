/**
 * Régénère `src/modele/collectivites-sirens.ts` : le SIREN de chaque
 * département, de chaque région et de chaque collectivité qui en tient lieu,
 * avec son nom et les départements qu'elle couvre.
 *
 *   npx tsx scripts/collectivites-sirens.ts
 *
 * Lu au répertoire SIRENE (copie d'Opendatasoft) : les unités légales actives
 * de catégorie juridique 7220 (département) et 7230 (région), et quatre
 * collectivités à statut particulier (7229) qui exercent les compétences d'un
 * département ou d'une région. Le département d'un siège se lit à son code
 * commune ; la région, au découpage Etalab.
 *
 * Pourquoi une table plutôt que le préfixe de SIREN (`prefixesEchelon`) : le
 * préfixe `23` suivi du chef-lieu ne vaut que pour les régions d'avant 2016.
 * Les sept régions nées de la fusion — Auvergne-Rhône-Alpes, Grand Est,
 * Hauts-de-France, Normandie, Nouvelle-Aquitaine, Occitanie,
 * Bourgogne-Franche-Comté — ont un SIREN en `200…`, comme la Collectivité
 * européenne d'Alsace, la Collectivité de Corse, celles de Guyane et de
 * Martinique (vérifié au répertoire le 9 octobre 2026). Le préfixe ne les
 * reconnaît pas.
 *
 * Restent dehors, parce que le site les connaît déjà autrement : la Ville de
 * Paris (le SIREN de la commune) et la Métropole de Lyon (un groupement de
 * BANATIC). Et, parce que le site ne les couvre pas : Saint-Barthélemy,
 * Saint-Martin, Saint-Pierre-et-Miquelon, les collectivités du Pacifique et les
 * Terres australes.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIRENE = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/json';

/** Les collectivités à statut particulier retenues, avec l'échelon dont elles tiennent lieu. */
const PARTICULIERES: Record<string, { echelon: 'departement' | 'region'; code: string; nom: string; deps: string[] }> = {
  // Les deux départements alsaciens, réunis le 1er janvier 2021.
  '200094332': { echelon: 'departement', code: '67A', nom: 'Collectivité européenne d’Alsace', deps: ['67', '68'] },
  // Département et région à la fois : rangées comme région, à la façon des comptes de l'OFGL.
  '200076958': { echelon: 'region', code: '94', nom: 'Collectivité de Corse', deps: ['2A', '2B'] },
  '200055507': { echelon: 'region', code: '02', nom: 'Collectivité territoriale de Martinique', deps: ['972'] },
  '200052678': { echelon: 'region', code: '03', nom: 'Collectivité territoriale de Guyane', deps: ['973'] },
  // Département-région : rangé comme département, comme l'OFGL et le site le font.
  '229850003': { echelon: 'departement', code: '976', nom: 'Département de Mayotte', deps: ['976'] },
};

interface Ligne {
  siren: string;
  categoriejuridiqueunitelegale: string;
  codecommuneetablissement: string | null;
  etatadministratifunitelegale: string;
  denominationunitelegale: string | null;
}

interface Dep {
  code: string;
  region?: string;
  nom: string;
  typeLiaison: number;
}

const lire = <T>(f: string): T =>
  JSON.parse(readFileSync(createRequire(import.meta.url).resolve(`@etalab/decoupage-administratif/data/${f}`), 'utf8')) as T;

/** « de l’Allier », « du Rhône », « des Landes » : la charnière que donne le type de liaison de l'INSEE. */
export function deDepartement(d: { nom: string; typeLiaison: number }): string {
  const charnieres = ['de ', 'd’', 'du ', 'de la ', 'des ', 'de l’', 'des ', 'de las ', 'de los '];
  // L'apostrophe typographique, comme dans le reste des noms de la table : le découpage écrit « Côte-d'Or ».
  return `${charnieres[d.typeLiaison] ?? 'de '}${d.nom}`.replace(/'/g, '’');
}

/** Le code du département d'une commune : trois chiffres outre-mer, deux ailleurs. */
const depDeCommune = (code: string) => (code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = new URL(SIRENE);
  url.searchParams.set(
    'select',
    'siren,categoriejuridiqueunitelegale,codecommuneetablissement,etatadministratifunitelegale,denominationunitelegale',
  );
  url.searchParams.set(
    'where',
    `etablissementsiege="oui" and (categoriejuridiqueunitelegale in ("7220","7230") or siren in (${Object.keys(PARTICULIERES)
      .map((s) => `"${s}"`)
      .join(',')}))`,
  );
  const lignes = ((await (await fetch(url)).json()) as Ligne[]).filter((l) => l.etatadministratifunitelegale === 'Active');
  const deps = lire<Dep[]>('departements.json');
  const depParCode = new Map(deps.map((d) => [d.code, d]));
  const regions = new Map(lire<{ code: string; nom: string }[]>('regions.json').map((r) => [r.code, r.nom]));
  const table: [string, { echelon: 'departement' | 'region'; code: string; nom: string; deps: string[] }][] = [];
  for (const l of lignes) {
    const particuliere = PARTICULIERES[l.siren];
    if (particuliere) {
      table.push([l.siren, particuliere]);
      continue;
    }
    const dep = depParCode.get(depDeCommune(l.codecommuneetablissement ?? ''));
    if (!dep) throw new Error(`${l.siren} ${l.denominationunitelegale} : siège hors du découpage (${l.codecommuneetablissement})`);
    if (l.categoriejuridiqueunitelegale === '7220') {
      table.push([l.siren, { echelon: 'departement', code: dep.code, nom: `Département ${deDepartement(dep)}`, deps: [dep.code] }]);
    } else {
      const code = dep.region!;
      const membres = deps.filter((d) => d.region === code).map((d) => d.code).sort();
      table.push([l.siren, { echelon: 'region', code, nom: `Région ${regions.get(code)}`.replace(/'/g, '’'), deps: membres }]);
    }
  }
  const manquantes = Object.keys(PARTICULIERES).filter((s) => !table.some(([x]) => x === s));
  if (manquantes.length > 0) throw new Error(`absentes du répertoire : ${manquantes.join(', ')}`);
  // Un département couvert deux fois au même échelon serait une erreur de la table.
  for (const echelon of ['departement', 'region'] as const) {
    const vus = new Map<string, string>();
    for (const [siren, c] of table.filter(([, c]) => c.echelon === echelon)) {
      for (const d of c.deps) {
        if (vus.has(d)) throw new Error(`${d} couvert deux fois (${vus.get(d)} et ${siren})`);
        vus.set(d, siren);
      }
    }
  }
  table.sort(([, a], [, b]) => a.echelon.localeCompare(b.echelon) || a.code.localeCompare(b.code));
  const sortie = fileURLToPath(new URL('../src/modele/collectivites-sirens.ts', import.meta.url));
  const source = readFileSync(sortie, 'utf8');
  const debut = source.indexOf('// <table>');
  const fin = source.indexOf('// </table>');
  writeFileSync(
    sortie,
    source.slice(0, debut) +
      `// <table>\n` +
      table
        .map(
          ([s, c]) =>
            `  ['${s}', { echelon: '${c.echelon}', code: '${c.code}', nom: '${c.nom}', deps: [${c.deps.map((d) => `'${d}'`).join(', ')}] }],\n`,
        )
        .join('') +
      source.slice(fin),
  );
  console.log(
    `${table.length} collectivités : ${table.filter(([, c]) => c.echelon === 'departement').length} au rang du département, ` +
      `${table.filter(([, c]) => c.echelon === 'region').length} au rang de la région.`,
  );
}
