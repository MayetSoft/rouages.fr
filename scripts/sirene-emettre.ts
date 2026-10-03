/**
 * Les établissements actifs de chaque commune, par secteur, d'après SIRENE.
 *
 * Le BODACC dit ce qui s'ouvre, change de mains et ferme ; ce module dit ce
 * qui est là. Deux nombres par secteur : les établissements actifs au
 * répertoire, et parmi eux les employeurs.
 *
 * **Le second compte autant que le premier.** Un établissement actif au
 * répertoire n'est pas forcément ouvert : une SCI qui détient une maison, un
 * toit équipé de panneaux solaires, un auto-entrepreneur qui ne facture plus y
 * restent tant que personne ne les radie. Au Mayet-de-Montagne, 51 des 52
 * établissements de l'immobilier n'emploient personne. Le caractère employeur,
 * lui, suit les déclarations faites à l'URSSAF : une embauche le fait passer à
 * « employeur », le départ du dernier salarié l'en fait sortir.
 *
 * Rien n'est nommé : ce sont des décomptes. Les entreprises nommées ailleurs
 * sur le site — titulaires de marchés, annonces du BODACC — le sont sous les
 * conditions de `CLAUDE.md` (« Les noms dans les données ») ; un entrepreneur
 * individuel en diffusion partielle ne l'est jamais.
 *
 * La source est la copie de la base SIRENE qu'Opendatasoft tient à jour, qui
 * permet d'agréger côté serveur : un département répond en deux secondes, là
 * où le fichier de l'INSEE pèse plusieurs gigaoctets.
 *
 * Lancé seul — `tsx scripts/sirene-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-sirene.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIRENE =
  'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/csv';

/**
 * Les sections de la nomenclature d'activités, telles que la source les
 * libelle, et le nom court que la page affiche. L'ordre est celui de la NAF.
 */
export const SECTIONS: [string, string][] = [
  ['Agriculture, sylviculture et pêche', 'Agriculture, forêt et pêche'],
  ['Industries extractives', 'Industries extractives'],
  ['Industrie manufacturière', 'Industrie'],
  ["Production et distribution d'électricité, de gaz, de vapeur et d'air conditionné", 'Énergie'],
  ["Production et distribution d'eau ; assainissement, gestion des déchets et dépollution", 'Eau et déchets'],
  ['Construction', 'Construction'],
  ["Commerce ; réparation d'automobiles et de motocycles", 'Commerce et réparation automobile'],
  ['Transports et entreposage', 'Transports et entreposage'],
  ['Hébergement et restauration', 'Hébergement et restauration'],
  ['Information et communication', 'Information et communication'],
  ["Activités financières et d'assurance", 'Finance et assurance'],
  ['Activités immobilières', 'Immobilier'],
  ['Activités spécialisées, scientifiques et techniques', 'Services spécialisés et techniques'],
  ['Activités de services administratifs et de soutien', 'Services administratifs et de soutien'],
  ['Administration publique', 'Administration publique'],
  ['Enseignement', 'Enseignement'],
  ['Santé humaine et action sociale', 'Santé et action sociale'],
  ['Arts, spectacles et activités récréatives', 'Arts, spectacles et loisirs'],
  ['Autres activités de services', 'Autres services'],
  ['Activités des ménages en tant qu\'employeurs ; activités indifférenciées des ménages en tant que producteurs de biens et services pour usage propre', 'Ménages employeurs'],
  ['Activités extra-territoriales', 'Activités extra-territoriales'],
];
/** Le rang d'une section inconnue ou non renseignée : comptée dans le total, pas dans le détail. */
const AUTRE = SECTIONS.length;

/** Par commune : pour chaque section, [actifs, employeurs] ; le dernier rang pour ce qui n'est pas classé. */
type Comptes = [number, number][];

export interface Sirene {
  maj: string;
  /** La date de la copie, d'après son catalogue. */
  source: string | null;
  communes: Map<string, Comptes>;
  /** La médiane nationale des établissements employeurs pour 1 000 habitants. */
  medianeEmployeurs: number;
}

/** Une ligne CSV à point-virgule, guillemets doublés compris. */
function champs(ligne: string): string[] {
  const out: string[] = [];
  let courant = '';
  let entre = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (entre && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else entre = !entre;
    } else if (c === ';' && !entre) {
      out.push(courant);
      courant = '';
    } else courant += c;
  }
  out.push(courant);
  return out;
}

/**
 * Le code de la commune actuelle, depuis celui que porte l'établissement :
 * SIRENE range Paris, Lyon et Marseille par arrondissement, et garde parfois
 * le code d'une commune déléguée.
 */
export function reports(): Map<string, string> {
  const chemin = createRequire(import.meta.url).resolve('@etalab/decoupage-administratif/data/communes.json');
  const toutes = JSON.parse(readFileSync(chemin, 'utf8')) as {
    code: string;
    type: string;
    chefLieu?: string;
    commune?: string;
  }[];
  const actuelles = new Set(toutes.filter((c) => c.type === 'commune-actuelle').map((c) => c.code));
  const r = new Map<string, string>();
  for (const c of toutes) {
    if (actuelles.has(c.code)) continue;
    const cible = c.type === 'arrondissement-municipal' ? c.commune : c.chefLieu;
    if (cible && actuelles.has(cible)) r.set(c.code, cible);
  }
  return r;
}

function mediane(v: number[]): number {
  if (v.length === 0) return 0;
  const t = [...v].sort((a, b) => a - b);
  return Math.round(t[Math.floor(t.length / 2)] * 10) / 10;
}

export async function collecterSirene(
  texte: (url: string) => Promise<string>,
  deps: string[],
  populations: Map<string, number>,
  dire: (m: string) => void,
): Promise<Sirene | null> {
  const rang = new Map(SECTIONS.map(([source], i) => [source, i]));
  const report = reports();
  const communes = new Map<string, Comptes>();
  let lignes = 0;
  let inconnues = 0;
  for (const dep of deps) {
    const csv = await texte(
      `${SIRENE}?select=${encodeURIComponent('count(*) as n')}` +
        `&where=${encodeURIComponent(`etatadministratifetablissement='Actif' and codedepartementetablissement='${dep}'`)}` +
        `&group_by=${encodeURIComponent('codecommuneetablissement, sectionetablissement, caractereemployeuretablissement')}` +
        '&delimiter=%3B',
    );
    const [entete, ...corps] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(champs);
    const [iCode, iSection, iEmployeur, iN] = ['codecommuneetablissement', 'sectionetablissement', 'caractereemployeuretablissement', 'n'].map(
      (c) => entete?.indexOf(c) ?? -1,
    );
    if ([iCode, iSection, iEmployeur, iN].some((i) => i === -1)) {
      dire(`SIRENE : l’export du département ${dep} a changé de forme.`);
      return null;
    }
    for (const l of corps) {
      const brut = l[iCode];
      if (!/^[0-9AB]{5}$/.test(brut)) continue;
      const code = report.get(brut) ?? brut;
      const n = Number(l[iN]);
      if (!Number.isFinite(n)) continue;
      let s = rang.get(l[iSection]);
      if (s === undefined) {
        s = AUTRE;
        if (l[iSection]) inconnues++;
      }
      let c = communes.get(code);
      if (!c) communes.set(code, (c = Array.from({ length: SECTIONS.length + 1 }, () => [0, 0] as [number, number])));
      c[s][0] += n;
      if (l[iEmployeur] === 'Oui') c[s][1] += n;
      lignes++;
    }
  }
  if (communes.size === 0) {
    dire('SIRENE : aucune commune lue.');
    return null;
  }
  // Une poignée d'établissements garde un libellé des nomenclatures d'avant
  // 2008 — « Hôtels et restaurants » : comptés au total, sans détail. Au-delà,
  // c'est que la source a changé ses libellés.
  if (inconnues > 100) dire(`SIRENE : ${inconnues} lignes d’une section que le site ne connaît pas — à ajouter à SECTIONS.`);

  const parMille: number[] = [];
  for (const [code, c] of communes) {
    const p = populations.get(code) ?? 0;
    if (p > 0) parMille.push((c.reduce((s, x) => s + x[1], 0) / p) * 1000);
  }
  let source: string | null = null;
  try {
    const cat = JSON.parse(await texte(SIRENE.replace('/exports/csv', ''))) as { metas?: { default?: { data_processed?: string } } };
    source = cat.metas?.default?.data_processed?.slice(0, 10) ?? null;
  } catch {
    source = null;
  }
  const medianeEmployeurs = mediane(parMille);
  dire(
    `SIRENE : ${communes.size.toLocaleString('fr-FR')} communes, ${lignes.toLocaleString('fr-FR')} lignes ; ` +
      `médiane ${medianeEmployeurs} établissements employeurs pour 1 000 habitants ; copie du ${source ?? '?'}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), source, communes, medianeEmployeurs };
}

function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Un fichier par département que le site décrit. Une section vide n'est pas
 * écrite : la plupart des communes n'en ont que quelques-unes.
 */
export function ecrireSirene(sortie: string, s: Sirene): number {
  const parDep = new Map<string, Record<string, [number, number, number][]>>();
  for (const code of [...s.communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = s.communes
      .get(code)!
      .map(([n, e], i) => [i, n, e] as [number, number, number])
      .filter(([, n]) => n > 0);
  }
  let ecrits = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(
      join(sortie, 'dep', `${dep}-sirene.json`),
      JSON.stringify({
        maj: s.maj,
        source: s.source,
        sections: [...SECTIONS.map(([, court]) => court), 'Non classé'],
        mediane: s.medianeEmployeurs,
        c,
      }),
    );
    ecrits++;
  }
  return ecrits;
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const sortie = join(racine, 'public', 'territoires');
  mkdirSync(join(sortie, 'dep'), { recursive: true });
  const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { c: [string, string, string, string, number][] };
  const deps = [...new Set(index.c.map((c) => c[3]))].sort();
  const populations = new Map(index.c.map((c) => [c[0], c[4]] as const));
  const texte = async (url: string) => {
    for (let essai = 0; ; essai++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!r.ok) throw new Error(`${url} : ${r.status}`);
        return await r.text();
      } catch (e) {
        if (essai >= 3) throw e;
        await new Promise((ok) => setTimeout(ok, 3000 * (essai + 1)));
      }
    }
  };
  const s = await collecterSirene(texte, deps, populations, console.log);
  if (s) console.log(`${ecrireSirene(sortie, s)} départements écrits.`);
}
