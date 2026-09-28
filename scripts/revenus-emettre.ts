/**
 * Le niveau de vie des habitants de chaque commune, d'après Filosofi.
 *
 * Deux chiffres, et pas davantage : l'INSEE ne publie sous le département que
 * la médiane du niveau de vie et le taux de pauvreté. Les déciles, la part des
 * retraites ou des prestations sociales ne descendent pas jusqu'à la commune.
 *
 * Le niveau de vie est le revenu disponible du ménage — revenus d'activité,
 * pensions, prestations, moins les impôts directs — divisé par le nombre
 * d'unités de consommation : 1 pour le premier adulte, 0,5 pour chaque autre
 * personne de 14 ans ou plus, 0,3 pour chaque enfant plus jeune. La médiane
 * partage les habitants en deux moitiés.
 *
 * Le millésime 2023 est le premier de « Filosofi 2 », refondu après la
 * suppression de la taxe d'habitation : l'INSEE proscrit toute comparaison
 * avec les millésimes précédents. Rien n'est publié pour la Guadeloupe, la
 * Guyane, la Martinique et Mayotte. Une commune dont le chiffre est couvert
 * par le secret statistique est gardée avec un chiffre nul, pour que la page
 * puisse le dire au lieu de se taire.
 *
 * Lancé seul — `tsx scripts/revenus-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-revenus.json`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lignesArchive } from './ages-emettre.ts';

export const MILLESIME = 2023;
export const FICHIER = `https://api.insee.fr/melodi/file/DS_FILOSOFI_CC/DS_FILOSOFI_CC_${MILLESIME}_CSV_FR`;

/** La médiane du niveau de vie, en euros par an, et le taux de pauvreté, en % ; null quand le secret statistique les couvre. */
type Niveau = [number | null, number | null];

export interface Revenus {
  maj: string;
  millesime: number;
  communes: Map<string, Niveau>;
  departements: Map<string, Niveau>;
  /** La France métropolitaine, que l'INSEE donne pour référence — le seuil de pauvreté en dépend. */
  metropole: Niveau | null;
}

export async function lireRevenus(chemin: string): Promise<Omit<Revenus, 'maj'>> {
  const communes = new Map<string, Niveau>();
  const departements = new Map<string, Niveau>();
  let metropole: Niveau | null = null;
  let col: Record<string, number> | null = null;
  for await (const l of lignesArchive(chemin)) {
    const v = l.replace(/"/g, '').split(';');
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['GEO', 'GEO_OBJECT', 'FILOSOFI_MEASURE', 'CONF_STATUS', 'OBS_STATUS', 'TIME_PERIOD', 'OBS_VALUE']) {
        if (col[n] === undefined) throw new Error(`colonne « ${n} » absente — le fichier a changé de forme`);
      }
      continue;
    }
    if (Number(v[col.TIME_PERIOD]) !== MILLESIME) continue;
    const mesure = v[col.FILOSOFI_MEASURE];
    const k = mesure === 'MED_SL' ? 0 : mesure === 'PR_MD60' ? 1 : -1;
    if (k === -1) continue;
    const objet = v[col.GEO_OBJECT];
    const estMetropole = objet === 'FRANCE' && v[col.GEO] === 'FM';
    if (objet !== 'COM' && objet !== 'DEP' && !estMetropole) continue;
    const brut = v[col.OBS_VALUE];
    const n = Number(brut);
    const secret = v[col.CONF_STATUS] === 'C';
    // « O », valeur manquante : des communes sans habitants, comme les villages
    // détruits de la Meuse. Ni chiffre ni secret à dire, elles sont laissées.
    if (!secret && (v[col.OBS_STATUS] !== 'A' || brut === '' || !Number.isFinite(n))) continue;
    let x: Niveau;
    if (estMetropole) x = metropole ??= [null, null];
    else {
      const cible = objet === 'COM' ? communes : departements;
      let y = cible.get(v[col.GEO]);
      if (!y) cible.set(v[col.GEO], (y = [null, null]));
      x = y;
    }
    x[k] = secret ? null : n;
  }
  return { millesime: MILLESIME, communes, departements, metropole };
}

export async function collecterRevenus(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Revenus | null> {
  const vers = join(cache, 'insee-filosofi.zip');
  try {
    await telecharger(FICHIER, vers);
  } catch {
    dire('Niveau de vie indisponible : celui de l’ingestion précédente reste en place.');
    return null;
  }
  const r = await lireRevenus(vers);
  if (r.communes.size === 0 || r.metropole?.[0] == null) {
    dire('Niveau de vie : aucune commune lue, ou pas de médiane métropolitaine.');
    return null;
  }
  const medianes = [...r.communes.values()].filter((x) => x[0] !== null).length;
  const pauvrete = [...r.communes.values()].filter((x) => x[1] !== null).length;
  dire(
    `Niveau de vie ${r.millesime} : médiane publiée pour ${medianes.toLocaleString('fr-FR')} communes sur ` +
      `${r.communes.size.toLocaleString('fr-FR')}, taux de pauvreté pour ${pauvrete.toLocaleString('fr-FR')}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...r };
}

function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

/** Un fichier par département, avec les chiffres du département et de la métropole. */
export function ecrireRevenus(sortie: string, r: Revenus): number {
  const parDep = new Map<string, Record<string, Niveau>>();
  for (const code of [...r.communes.keys()].sort()) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = r.communes.get(code)!;
  }
  let ecrits = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(
      join(sortie, 'dep', `${dep}-revenus.json`),
      JSON.stringify({ maj: r.maj, millesime: r.millesime, metropole: r.metropole, dep: r.departements.get(dep) ?? null, c }),
    );
    ecrits++;
  }
  return ecrits;
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const cache = join(racine, '.cache');
  if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
  const telecharger = async (url: string, vers: string) => {
    if (existsSync(vers)) return;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} : ${r.status}`);
    writeFileSync(vers, Buffer.from(await r.arrayBuffer()));
  };
  const r = await collecterRevenus(telecharger, cache, console.log);
  if (r) console.log(`${ecrireRevenus(join(racine, 'public', 'territoires'), r)} départements écrits.`);
}
