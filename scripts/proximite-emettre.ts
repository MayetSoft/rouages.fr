/**
 * Ce qu'il faut au navigateur pour trouver « le plus proche » : le centre de
 * chaque commune, et, pour chaque type d'équipement et chaque domaine
 * d'association, les communes qui en ont.
 *
 * Rien n'est collecté ici : tout vient des fichiers que l'ingestion vient
 * d'écrire — les contours de l'IGN, la base permanente des équipements de
 * l'INSEE, le répertoire national des associations. Le script les réordonne
 * pour qu'une question — « la piscine la plus proche du Mayet-de-Montagne » —
 * ne charge qu'un petit fichier.
 *
 * - `proximite/centres.json` : le centre de chaque commune, dans l'ordre de
 *   `index.json`, au millième de degré (une centaine de mètres). C'est le
 *   barycentre du plus grand anneau de son contour : une distance « de
 *   commune à commune » se mesure entre ces points, à vol d'oiseau.
 * - `proximite/equipements/<n>.json` : pour le type n de la base, les
 *   communes qui en ont au moins un, et combien.
 * - `proximite/associations/<n>.json` : pour le domaine n du répertoire, les
 *   communes où au moins une association existante le déclare, et combien.
 * - `proximite/indicateurs/<clé>.json` : pour le requêteur, une valeur par
 *   commune (dans l'ordre de `index.json`, null quand le fichier source ne la
 *   donne pas) — le taux de foncier bâti voté, la part de logements vacants
 *   et de résidences secondaires, la part des 65 ans et plus et des moins de
 *   20 ans, le nombre de reconnaissances de catastrophe naturelle, le prix
 *   médian au mètre carré des maisons et des appartements, le niveau de vie
 *   médian et le taux de pauvreté. Rien n'est estimé : chaque valeur se lit dans les
 *   fichiers que la page de commune affiche déjà.
 * - `proximite/index.json` : les types, les domaines, les indicateurs, les millésimes.
 * - `dep/XX-manques.json` : pour chaque commune, chaque regroupement de la
 *   gamme de proximité de l'INSEE qu'elle n'a pas, et la commune la plus
 *   proche qui l'a, avec la distance entre les deux centres, en hectomètres.
 *   Calculé ici une fois pour toutes, lu par la page de commune au build.
 *   La recherche reste dans l'Hexagone et la Corse pour une commune de
 *   métropole, dans le département pour une commune d'outre-mer.
 *
 * Les communes sont désignées par leur rang dans `index.json`, écrit en écart
 * au précédent : les fichiers restent petits.
 *
 * Lancé seul — `npx tsx scripts/proximite-emettre.ts` —, il relit
 * `public/territoires` et réécrit `public/territoires/proximite/`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Index = { maj: string; c: [string, string, string, string, number][] };
type ContoursDep = { millesime: string; c: Record<string, [number[][], string[], number[][]]> };
type EquipementsDep = { maj: string; millesime: string; types: [string, number, string][]; groupes: [string, number, number[]][]; c: Record<string, [number, number][]> };
type Existante = [string, string, number, number, string];
type AssociationsDep = { maj: string; domaines: string[]; c: Record<string, { x?: Existante[] }> };

const lire = <T,>(chemin: string): T | null => (existsSync(chemin) ? (JSON.parse(readFileSync(chemin, 'utf8')) as T) : null);

/** Le barycentre d'un anneau (formule de l'aire signée), en dix-millièmes de degré ; et son aire. */
function barycentre(r: number[]): { x: number; y: number; aire: number } | null {
  const pts: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < r.length; i += 2) {
    x += r[i];
    y += r[i + 1];
    pts.push([x, y]);
  }
  if (pts.length < 3) return null;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (a === 0) return null;
  return { x: cx / (3 * a), y: cy / (3 * a), aire: Math.abs(a / 2) };
}

/** Des rangs croissants, écrits en écart au précédent. */
function ecarts(rangs: number[]): number[] {
  const out: number[] = [];
  let avant = 0;
  for (const r of rangs) {
    out.push(r - avant);
    avant = r;
  }
  return out;
}

/** Distance à vol d'oiseau entre deux centres, en kilomètres (millièmes de degré en entrée). */
function km(x1: number, y1: number, x2: number, y2: number): number {
  const rad = Math.PI / 180000;
  const dlat = (y2 - y1) * rad;
  const dlon = (x2 - x1) * rad;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Un dixième de degré par case : 11 km en latitude, au moins 7 km en longitude jusqu'au nord de la France. */
const CASE = 100;
const KM_PAR_CASE = 7;

function emettreManques(
  sortie: string,
  index: Index,
  centres: (number | null)[],
  groupes: [string, number, number[]][],
  parType: Map<number, [number, number][]>,
): number {
  const zone = (i: number) => (index.c[i][3].startsWith('97') ? index.c[i][3] : 'métropole');
  const proximite = groupes.map((g, k) => ({ k, membres: g[2] })).filter((_, k) => groupes[k][1] === 0);
  // Pour chaque regroupement, les communes qui l'ont, rangées par case et par zone.
  const grilles = proximite.map(({ membres }) => {
    const ont = new Set<number>();
    for (const t of membres) for (const [i] of parType.get(t) ?? []) ont.add(i);
    const cases = new Map<string, number[]>();
    for (const i of ont) {
      const x = centres[2 * i];
      const y = centres[2 * i + 1];
      if (x === null || y === null) continue;
      const cle = `${zone(i)}|${Math.floor(x / CASE)}|${Math.floor(y / CASE)}`;
      if (!cases.has(cle)) cases.set(cle, []);
      cases.get(cle)!.push(i);
    }
    return { ont, cases };
  });
  const plusProche = (g: (typeof grilles)[number], i: number): [number, number] | null => {
    const x = centres[2 * i]!;
    const y = centres[2 * i + 1]!;
    const cx = Math.floor(x / CASE);
    const cy = Math.floor(y / CASE);
    const z = zone(i);
    let meilleur: [number, number] | null = null;
    for (let r = 0; r <= 60; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const j of g.cases.get(`${z}|${cx + dx}|${cy + dy}`) ?? []) {
            const d = km(x, y, centres[2 * j]!, centres[2 * j + 1]!);
            if (!meilleur || d < meilleur[1]) meilleur = [j, d];
          }
        }
      }
      // Tout ce qui reste hors des r premiers anneaux est à plus de r cases.
      if (meilleur && meilleur[1] <= r * KM_PAR_CASE) break;
    }
    return meilleur;
  };

  const parDep = new Map<string, Record<string, [number, string, number][]>>();
  let situes = 0;
  for (const c of index.c) if (!parDep.has(c[3])) parDep.set(c[3], {});
  const fichierEquipements = new Map<string, Set<string>>();
  for (let i = 0; i < index.c.length; i++) {
    const [code, , , dep] = index.c[i];
    if (centres[2 * i] === null) continue;
    // Une commune absente de la base des équipements n'a pas de « manque » : on ne sait rien d'elle.
    if (!fichierEquipements.has(dep)) {
      const d = lire<EquipementsDep>(join(sortie, 'dep', `${dep}-equipements.json`));
      fichierEquipements.set(dep, new Set(Object.keys(d?.c ?? {})));
    }
    if (!fichierEquipements.get(dep)!.has(code)) continue;
    const liste: [number, string, number][] = [];
    proximite.forEach(({ k }, n) => {
      const g = grilles[n];
      if (g.ont.has(i)) return;
      const p = plusProche(g, i);
      if (!p) return;
      liste.push([k, index.c[p[0]][0], Math.round(p[1] * 10)]);
      situes++;
    });
    if (liste.length) parDep.get(dep)![code] = liste;
  }
  for (const [dep, c] of parDep) {
    writeFileSync(join(sortie, 'dep', `${dep}-manques.json`), JSON.stringify({ maj: index.maj, c }));
  }
  return situes;
}

/**
 * Un indicateur du requêteur : sa clé, son libellé, son unité, son millésime,
 * combien de communes le renseignent, et pour un indicateur qui vaut oui ou
 * non, ce qu'on peut chercher : « oui-non » quand l'absence est une donnée
 * (une commune hors de tout parc), « oui » seulement quand elle n'en est pas
 * une (un registre qui ne porte pas tout).
 */
type Indicateur = [string, string, string, string, number] | [string, string, string, string, number, 'oui' | 'oui-non'];

const FISCALITE_PROPRE = new Set(['CC', 'CA', 'CU', 'METRO', 'MET69', 'SAN', 'EPT']);

function emettreIndicateurs(sortie: string, index: Index, fichiers: string[], dossier: string): Indicateur[] {
  const rang = new Map(index.c.map(([code], i) => [code, i]));
  const pcaet = lire<{ maj: string; c: Record<string, unknown> }>(join(sortie, 'pcaet.json'));
  const n = index.c.length;
  const valeurs: Record<string, (number | null)[]> = {
    fb: new Array(n).fill(null),
    vacants: new Array(n).fill(null),
    plus65: new Array(n).fill(null),
    moins20: new Array(n).fill(null),
    catnat: new Array(n).fill(null),
    secondaires: new Array(n).fill(null),
    m2maison: new Array(n).fill(null),
    m2appart: new Array(n).fill(null),
    niveauvie: new Array(n).fill(null),
    pauvrete: new Array(n).fill(null),
    pnr: new Array(n).fill(null),
    parcnational: new Array(n).fill(null),
    natura2000: new Array(n).fill(null),
    mondial: new Array(n).fill(null),
    pcaet: new Array(n).fill(null),
  };
  const millesimes: Record<string, string> = {};
  const arrondi = (x: number) => Math.round(x * 10) / 10;
  for (const f of fichiers) {
    if (f.endsWith('-fiscalite.json')) {
      const d = lire<{ millesime: number; c: Record<string, [number[], ...unknown[]]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.fb = String(d.millesime);
      for (const [code, v] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i !== undefined && Array.isArray(v[0])) valeurs.fb[i] = arrondi(v[0].reduce((a, x) => a + x, 0));
      }
    } else if (f.endsWith('-parc.json')) {
      const d = lire<{ millesimes: number[]; c: Record<string, (number | null)[][]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.vacants = millesimes.secondaires = String(d.millesimes[0]);
      for (const [code, v] of Object.entries(d.c)) {
        const i = rang.get(code);
        const [logements, , secondaires, vacants] = v[0] ?? [];
        if (i === undefined || !logements) continue;
        if (vacants !== null && vacants !== undefined) valeurs.vacants[i] = arrondi((100 * vacants) / logements);
        if (secondaires !== null && secondaires !== undefined) valeurs.secondaires[i] = arrondi((100 * secondaires) / logements);
      }
    } else if (f.endsWith('-dvf.json')) {
      // [maisons vendues, prix médian au m² des maisons, prix médian, appartements vendus, prix médian au m² des appartements, …]
      const d = lire<{ annees: number[]; c: Record<string, (number | null)[]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.m2maison = millesimes.m2appart = `${d.annees[0]}-${d.annees.at(-1)}`;
      for (const [code, v] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i === undefined) continue;
        if (typeof v[1] === 'number') valeurs.m2maison[i] = v[1];
        if (typeof v[4] === 'number') valeurs.m2appart[i] = v[4];
      }
    } else if (f.endsWith('-revenus.json')) {
      const d = lire<{ millesime: number; c: Record<string, [number | null, number | null]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.niveauvie = millesimes.pauvrete = String(d.millesime);
      for (const [code, [mediane, pauvrete]] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i === undefined) continue;
        if (mediane !== null) valeurs.niveauvie[i] = mediane;
        if (pauvrete !== null) valeurs.pauvrete[i] = pauvrete;
      }
    } else if (f.endsWith('-ages.json')) {
      const d = lire<{ millesime: number; tranches: number[]; c: Record<string, number[][]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.plus65 = millesimes.moins20 = String(d.millesime);
      for (const [code, [femmes, hommes]] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i === undefined || !femmes || !hommes) continue;
        const total = [...femmes, ...hommes].reduce((a, x) => a + x, 0);
        if (total <= 0) continue;
        const part = (garde: (age: number) => boolean) =>
          arrondi((100 * d.tranches.reduce((a, age, k) => a + (garde(age) ? femmes[k] + hommes[k] : 0), 0)) / total);
        valeurs.plus65[i] = part((age) => age >= 65);
        valeurs.moins20[i] = part((age) => age < 20);
      }
    } else if (f.endsWith('-espaces.json')) {
      // Le fichier couvre toutes les communes du département : une commune absente n'a aucune zone.
      const d = lire<{ maj: string; c: Record<string, [number, string, number][]> }>(join(sortie, 'dep', f));
      if (!d) continue;
      const dep = f.replace(/-espaces\.json$/, '');
      millesimes.pnr = millesimes.parcnational = millesimes.natura2000 = d.maj;
      index.c.forEach(([, , , depCommune], i) => {
        if (depCommune === dep) valeurs.pnr[i] = valeurs.parcnational[i] = valeurs.natura2000[i] = 0;
      });
      for (const [code, zones] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i === undefined) continue;
        const natures = new Set(zones.map(([nature]) => nature));
        valeurs.pnr[i] = natures.has(8) ? 1 : 0;
        valeurs.parcnational[i] = natures.has(0) || natures.has(9) ? 1 : 0;
        valeurs.natura2000[i] = natures.has(4) || natures.has(5) ? 1 : 0;
      }
    } else if (/^[0-9AB]{2,3}\.json$/.test(f)) {
      // Le plan climat de l'intercommunalité à fiscalité propre, quand le registre de l'ADEME en porte un.
      const plans = pcaet?.c;
      const d = plans ? lire<{ g: [string, string, string, unknown][]; c: [string, string, number, number[]][] }>(join(sortie, 'dep', f)) : null;
      if (!plans || !d) continue;
      for (const [code, , , structures] of d.c) {
        const i = rang.get(code);
        if (i === undefined) continue;
        if (structures.some((k) => FISCALITE_PROPRE.has(d.g[k]?.[2]) && plans[d.g[k][0]])) valeurs.pcaet[i] = 1;
      }
    } else if (f.endsWith('-risques.json')) {
      const d = lire<{ maj: string; c: Record<string, { catnat?: [number, number, string][] }> }>(join(sortie, 'dep', f));
      if (!d) continue;
      millesimes.catnat = d.maj;
      for (const [code, v] of Object.entries(d.c)) {
        const i = rang.get(code);
        if (i !== undefined) valeurs.catnat[i] = (v.catnat ?? []).reduce((a, [, nombre]) => a + nombre, 0);
      }
    }
  }
  // Le patrimoine mondial : un fichier national, dont la couverture est partielle — on ne cherche que « oui ».
  const mondial = lire<{ version: string | null; maj: string; c: Record<string, unknown[]> }>(join(sortie, 'patrimoine-mondial.json'));
  if (mondial) {
    millesimes.mondial = mondial.version ?? mondial.maj;
    for (const code of Object.keys(mondial.c)) {
      const i = rang.get(code);
      if (i !== undefined) valeurs.mondial[i] = 1;
    }
  }
  if (pcaet) millesimes.pcaet = pcaet.maj;
  mkdirSync(join(dossier, 'indicateurs'), { recursive: true });
  for (const [cle, v] of Object.entries(valeurs)) writeFileSync(join(dossier, 'indicateurs', `${cle}.json`), JSON.stringify({ v }));
  const compte = (cle: string) => valeurs[cle].filter((x) => x !== null).length;
  return [
    ['fb', 'Taxe foncière sur le bâti, taux cumulé des percepteurs', '%', millesimes.fb ?? '', compte('fb')],
    ['vacants', 'Part des logements vacants', '%', millesimes.vacants ?? '', compte('vacants')],
    ['secondaires', 'Part des résidences secondaires', '%', millesimes.secondaires ?? '', compte('secondaires')],
    ['m2maison', 'Prix médian d’une maison au mètre carré', '€/m²', millesimes.m2maison ?? '', compte('m2maison')],
    ['m2appart', 'Prix médian d’un appartement au mètre carré', '€/m²', millesimes.m2appart ?? '', compte('m2appart')],
    ['niveauvie', 'Niveau de vie médian', '€ par an', millesimes.niveauvie ?? '', compte('niveauvie')],
    ['pauvrete', 'Taux de pauvreté', '%', millesimes.pauvrete ?? '', compte('pauvrete')],
    ['plus65', 'Part des 65 ans et plus', '%', millesimes.plus65 ?? '', compte('plus65')],
    ['moins20', 'Part des moins de 20 ans', '%', millesimes.moins20 ?? '', compte('moins20')],
    ['catnat', 'Reconnaissances de catastrophe naturelle depuis 1982', '', millesimes.catnat ?? '', compte('catnat')],
    ['pnr', 'Dans un parc naturel régional', '', millesimes.pnr ?? '', compte('pnr'), 'oui-non'],
    ['parcnational', 'Dans un parc national, cœur ou aire d’adhésion', '', millesimes.parcnational ?? '', compte('parcnational'), 'oui-non'],
    ['natura2000', 'Touchée par un site Natura 2000', '', millesimes.natura2000 ?? '', compte('natura2000'), 'oui-non'],
    ['mondial', 'Touchée par un bien du patrimoine mondial (bien, zone tampon ou élément)', '', millesimes.mondial ?? '', compte('mondial'), 'oui'],
    ['pcaet', 'Intercommunalité portant un plan climat au registre de l’ADEME', '', millesimes.pcaet ?? '', compte('pcaet'), 'oui'],
  ];
}

export function emettreProximite(sortie: string, dire: (m: string) => void = console.log): void {
  const index = lire<Index>(join(sortie, 'index.json'));
  if (!index) throw new Error('index.json absent');
  const rang = new Map(index.c.map(([code], i) => [code, i]));
  const dep = join(sortie, 'dep');
  const fichiers = readdirSync(dep);
  const dossier = join(sortie, 'proximite');
  rmSync(dossier, { recursive: true, force: true });
  mkdirSync(join(dossier, 'equipements'), { recursive: true });
  mkdirSync(join(dossier, 'associations'), { recursive: true });

  // Les centres.
  const centres: (number | null)[] = new Array(index.c.length * 2).fill(null);
  let millesimeContours = '';
  let places = 0;
  for (const f of fichiers.filter((x) => x.endsWith('-contours.json'))) {
    const d = lire<ContoursDep>(join(dep, f));
    if (!d) continue;
    millesimeContours ||= d.millesime;
    for (const [code, [anneaux]] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      // Le plus grand anneau : le contour principal, pas un trou ni une île.
      const b = anneaux.map(barycentre).filter((x) => x !== null).sort((p, q) => q!.aire - p!.aire)[0];
      if (!b) continue;
      centres[2 * i] = Math.round(b.x / 10);
      centres[2 * i + 1] = Math.round(b.y / 10);
      places++;
    }
  }
  writeFileSync(join(dossier, 'centres.json'), JSON.stringify({ maj: index.maj, millesime: millesimeContours, c: centres }));

  // Les équipements, type par type.
  let types: [string, number, string][] | null = null;
  let groupes: [string, number, number[]][] = [];
  let millesimeEquipements = '';
  let majEquipements = '';
  const parType = new Map<number, [number, number][]>();
  for (const f of fichiers.filter((x) => x.endsWith('-equipements.json'))) {
    const d = lire<EquipementsDep>(join(dep, f));
    if (!d) continue;
    if (!types) {
      types = d.types;
      groupes = d.groupes ?? [];
      millesimeEquipements = d.millesime;
      majEquipements = d.maj;
    } else if (JSON.stringify(types) !== JSON.stringify(d.types)) {
      throw new Error(`${f} : la liste des types d'équipements diffère des autres départements`);
    }
    for (const [code, l] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      for (const [t, n] of l) {
        if (n <= 0) continue;
        if (!parType.has(t)) parType.set(t, []);
        parType.get(t)!.push([i, n]);
      }
    }
  }
  for (const [t, l] of parType) {
    l.sort((a, b) => a[0] - b[0]);
    writeFileSync(join(dossier, 'equipements', `${t}.json`), JSON.stringify({ r: ecarts(l.map(([i]) => i)), n: l.map(([, n]) => n) }));
  }

  // Les indicateurs du requêteur, lus dans les fichiers par département.
  const indicateurs = emettreIndicateurs(sortie, index, fichiers, dossier);

  // Ce qui manque, et où le trouver : la commune la plus proche qui a chaque regroupement absent.
  const manques = emettreManques(sortie, index, centres, groupes, parType);

  // Les associations, domaine par domaine : la liste du département et la suite, s'il y en a une.
  let domaines: string[] = [];
  let majAssociations = '';
  const parDomaine = new Map<number, Map<number, number>>();
  const compter = (i: number, x: Existante[]) => {
    for (const a of x) {
      const dm = a[2];
      if (typeof dm !== 'number' || dm < 0) continue;
      if (!parDomaine.has(dm)) parDomaine.set(dm, new Map());
      const m = parDomaine.get(dm)!;
      m.set(i, (m.get(i) ?? 0) + 1);
    }
  };
  for (const f of fichiers.filter((x) => x.endsWith('-associations.json'))) {
    const d = lire<AssociationsDep>(join(dep, f));
    if (!d) continue;
    if (!domaines.length) {
      domaines = d.domaines;
      majAssociations = d.maj;
    }
    for (const [code, fiche] of Object.entries(d.c)) {
      const i = rang.get(code);
      if (i === undefined) continue;
      compter(i, fiche.x ?? []);
      const suite = lire<{ x: Existante[] }>(join(sortie, 'associations', `${code}.json`));
      if (suite) compter(i, suite.x);
    }
  }
  for (const [dm, m] of parDomaine) {
    const l = [...m].sort((a, b) => a[0] - b[0]);
    writeFileSync(join(dossier, 'associations', `${dm}.json`), JSON.stringify({ r: ecarts(l.map(([i]) => i)), n: l.map(([, n]) => n) }));
  }

  writeFileSync(
    join(dossier, 'index.json'),
    JSON.stringify({
      maj: index.maj,
      contours: millesimeContours,
      equipements: {
        maj: majEquipements,
        millesime: millesimeEquipements,
        // Nom, gamme de proximité (1) ou non, groupe, nombre de communes qui en ont.
        types: (types ?? []).map(([nom, gamme, groupe], t) => [nom, gamme, groupe, parType.get(t)?.length ?? 0]),
      },
      associations: { maj: majAssociations, domaines: domaines.map((nom, dm) => [nom, parDomaine.get(dm)?.size ?? 0]) },
      indicateurs,
    }),
  );
  dire(
    `Proximité : ${places.toLocaleString('fr-FR')} centres de communes, ` +
      `${parType.size} types d'équipements, ${parDomaine.size} domaines d'associations, ` +
      `${manques.toLocaleString('fr-FR')} absences situées par rapport à la commune la plus proche.`,
  );
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  emettreProximite(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'territoires'));
}
