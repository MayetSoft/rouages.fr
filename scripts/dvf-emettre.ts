/**
 * Le prix des maisons et des appartements, commune par commune, d'après les
 * demandes de valeurs foncières (DVF) de la direction générale des finances
 * publiques, dans la version géolocalisée qu'en publie data.gouv.
 *
 * DVF recense chaque vente passée devant notaire, mais une vente peut porter
 * sur plusieurs biens : une maison et deux garages, trois appartements d'un
 * immeuble, une maison et un champ. Le prix au mètre carré n'a de sens que pour
 * une vente d'un seul logement. D'où la règle, écrite une fois ici :
 * - une vente (nature « Vente », pas un échange ni une adjudication) ;
 * - un seul logement, maison ou appartement, et rien d'autre que des
 *   dépendances — pas de local commercial ;
 * - dans une seule commune ;
 * - une surface bâtie d'au moins 9 m², sous laquelle le prix au mètre carré ne
 *   veut plus rien dire.
 * Le prix rapporté est la médiane, qui ne bouge pas pour une vente
 * extravagante, sur les trois dernières années publiées réunies — un village
 * vend quelques maisons par an. Sous cinq ventes, pas de médiane.
 *
 * DVF ne couvre ni l'Alsace ni la Moselle, où le livre foncier tient ce rôle,
 * ni Mayotte. Paris, Lyon et Marseille y sont par arrondissement : ils sont
 * réunis sous leur commune.
 *
 * Lancé seul — `tsx scripts/dvf-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-dvf.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { communeDe, departementDe, ecrireParDepartement, lignesCsv, mediane, telechargerSiAbsent } from './par-departement.ts';

export const ADRESSE = (annee: number) => `https://files.data.gouv.fr/geo-dvf/latest/csv/${annee}/full.csv.gz`;
/** Sous ce nombre de ventes, la médiane serait celle de trois maisons. */
export const MINIMUM = 5;

/**
 * Par commune : ventes de maisons, prix médian au m² d'une maison, prix médian
 * d'une maison ; ventes d'appartements, prix médian au m² d'un appartement ;
 * puis le nombre de ventes de logements, année par année.
 */
export type Prix = [number, number | null, number | null, number, number | null, ...number[]];

export interface Dvf {
  maj: string;
  annees: number[];
  communes: Map<string, Prix>;
  departements: Map<string, Prix>;
}

type Vente = { commune: string; annee: number; type: 'Maison' | 'Appartement'; prix: number; surface: number };

/** Une mutation, toutes ses lignes réunies : en rend la vente d'un logement, ou rien. */
function venteDe(lignes: string[][], col: Record<string, number>, annee: number): Vente | null {
  if (lignes[0][col.nature_mutation] !== 'Vente') return null;
  const communes = new Set(lignes.map((l) => l[col.code_commune]));
  if (communes.size !== 1) return null;
  const logements = new Map<string, [string, number]>();
  for (const l of lignes) {
    const type = l[col.type_local];
    if (type === 'Maison' || type === 'Appartement') {
      // Un même logement revient sur plusieurs lignes quand la vente porte
      // aussi sur plusieurs parcelles ou lots : on le compte une fois.
      const s = Number(l[col.surface_reelle_bati]);
      logements.set(`${type}|${l[col.id_parcelle]}|${s}|${l[col.nombre_pieces_principales]}|${l[col.lot1_numero]}`, [type, s]);
    } else if (type && type !== 'Dépendance') return null;
  }
  if (logements.size !== 1) return null;
  const [[type, surface]] = logements.values();
  const prix = Number(lignes[0][col.valeur_fonciere]);
  if (!(surface >= 9) || !(prix > 0)) return null;
  return { commune: communeDe([...communes][0]), annee, type: type as Vente['type'], prix, surface };
}

export async function lireVentes(chemin: string, annee: number, ajouter: (v: Vente) => void): Promise<void> {
  let col: Record<string, number> | null = null;
  let id = '';
  let lignes: string[][] = [];
  const flux = createReadStream(chemin).pipe(createGunzip()) as unknown as AsyncIterable<Uint8Array>;
  const clore = () => {
    if (lignes.length > 0) {
      const v = venteDe(lignes, col!, annee);
      if (v) ajouter(v);
    }
  };
  for await (const v of lignesCsv(flux)) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      for (const n of ['id_mutation', 'nature_mutation', 'valeur_fonciere', 'code_commune', 'type_local', 'surface_reelle_bati', 'id_parcelle', 'nombre_pieces_principales', 'lot1_numero']) {
        if (col[n] === undefined) throw new Error(`DVF ${annee} : colonne « ${n} » absente`);
      }
      continue;
    }
    if (v.length < 10) continue;
    // Les lignes d'une mutation se suivent dans le fichier.
    if (v[col.id_mutation] !== id) {
      clore();
      id = v[col.id_mutation];
      lignes = [];
    }
    lignes.push(v);
  }
  clore();
}

function resumer(ventes: Vente[], annees: number[]): Prix {
  const maisons = ventes.filter((v) => v.type === 'Maison');
  const apparts = ventes.filter((v) => v.type === 'Appartement');
  const med = (v: number[]) => (v.length >= MINIMUM ? Math.round(mediane(v)!) : null);
  return [
    maisons.length,
    med(maisons.map((v) => v.prix / v.surface)),
    med(maisons.map((v) => v.prix)),
    apparts.length,
    med(apparts.map((v) => v.prix / v.surface)),
    ...annees.map((a) => ventes.filter((v) => v.annee === a).length),
  ];
}

export async function collecterDvf(
  annees: number[],
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Dvf | null> {
  const parCommune = new Map<string, Vente[]>();
  const lues: number[] = [];
  for (const annee of annees) {
    const vers = join(cache, `dvf-${annee}.csv.gz`);
    try {
      await telecharger(ADRESSE(annee), vers);
    } catch {
      dire(`Ventes immobilières ${annee} indisponibles.`);
      continue;
    }
    let n = 0;
    await lireVentes(vers, annee, (v) => {
      if (!parCommune.has(v.commune)) parCommune.set(v.commune, []);
      parCommune.get(v.commune)!.push(v);
      n++;
    });
    dire(`Ventes immobilières ${annee} : ${n.toLocaleString('fr-FR')} ventes d’un seul logement.`);
    lues.push(annee);
  }
  // Trois années ou rien : une médiane sur deux ans ne se comparerait pas à
  // celle de l'ingestion précédente.
  if (lues.length !== annees.length) {
    dire('Ventes immobilières : une année manque, l’ingestion précédente reste en place.');
    return null;
  }
  const communes = new Map<string, Prix>();
  const parDep = new Map<string, Vente[]>();
  for (const [code, ventes] of parCommune) {
    communes.set(code, resumer(ventes, annees));
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, []);
    parDep.get(dep)!.push(...ventes);
  }
  const departements = new Map([...parDep].map(([dep, v]) => [dep, resumer(v, annees)]));
  return { maj: new Date().toISOString().slice(0, 10), annees, communes, departements };
}

/** Les trois dernières années complètes : la base est publiée au printemps et en automne. */
export function anneesDvf(aujourdhui = new Date()): number[] {
  const derniere = aujourdhui.getUTCFullYear() - (aujourdhui.getUTCMonth() >= 5 ? 1 : 2);
  return [derniere - 2, derniere - 1, derniere];
}

export function ecrireDvf(sortie: string, d: Dvf): number {
  return ecrireParDepartement(sortie, 'dvf', d.communes, (dep) => ({
    maj: d.maj,
    annees: d.annees,
    minimum: MINIMUM,
    dep: d.departements.get(dep) ?? null,
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const d = await collecterDvf(anneesDvf(), telecharger, cache, console.log);
  if (d) console.log(`${ecrireDvf(sortie, d)} départements écrits.`);
}
