/**
 * L'électricité produite dans chaque commune, par filière : combien
 * d'installations, quelle puissance, et ce qu'elles ont injecté sur le réseau
 * en un an. D'après le registre national des installations de production et
 * de stockage que tient RTE, à partir de ce que lui transmettent Enedis, EDF
 * dans les zones non interconnectées et les entreprises locales de
 * distribution.
 *
 * Trois choses que le registre ne dit pas, et que la page ne prétend pas :
 *
 *   — **ce qui est consommé sur place.** L'énergie est celle injectée sur le
 *     réseau ; la part qu'une installation consomme elle-même, en
 *     autoconsommation, n'y est pas ;
 *   — **où tourne l'installation.** La commune est celle de son point de
 *     livraison, là où elle est raccordée ;
 *   — **le détail des petites installations.** Celles de moins de 36 kW sont
 *     regroupées commune par commune.
 *
 * Aucun nom d'installation n'est repris : le registre en porte, et certains
 * sont ceux de personnes. Le stockage n'est pas une production : il est
 * écarté. Un peu plus d'un pour cent de la puissance solaire, et deux pour
 * cent de la filière « autre », n'ont pas de commune dans le registre.
 *
 * Lancé seul — `tsx scripts/production-emettre.ts` —, il réécrit les
 * fichiers `public/territoires/dep/XX-production.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const JEU =
  'https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/registre-national-installation-production-stockage-electricite-agrege';

/** Les filières dans l'ordre d'affichage, sous leur libellé du site. */
export const FILIERES: [string, string][] = [
  ['Solaire', 'Solaire photovoltaïque'],
  ['Eolien', 'Éolien'],
  ['Hydraulique', 'Hydraulique'],
  ['Bioénergies', 'Bioénergies'],
  ['Géothermie', 'Géothermie'],
  ['Energies Marines', 'Énergies marines'],
  ['Nucléaire', 'Nucléaire'],
  ['Thermique non renouvelable', 'Thermique non renouvelable'],
  ['Autre', 'Autre'],
];

/**
 * Par filière présente : son rang dans `FILIERES`, installations, kW
 * installés, MWh injectés sur un an, et l'état de cette énergie — 0 connue,
 * 1 partielle (des lignes du registre ne la portent pas : c'est un minimum),
 * 2 inconnue.
 */
export type ProductionCommune = [number, number, number, number, 0 | 1 | 2][];

export interface Production {
  maj: string;
  /** La date du registre, AAAA-MM-JJ. */
  au: string;
  communes: Map<string, ProductionCommune>;
}

export async function collecterProduction(
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void,
): Promise<Production | null> {
  const meta = (await lireJson(JEU)) as { metas?: { default?: { title?: string } } };
  const titre = meta.metas?.default?.title ?? '';
  const m = /au (\d{2})\/(\d{2})\/(\d{4})/.exec(titre);
  if (!m) throw new Error(`registre de production : date introuvable dans le titre « ${titre} »`);
  const au = `${m[3]}-${m[2]}-${m[1]}`;

  type Ligne = {
    codeinseecommune: string | null;
    filiere: string | null;
    inst: number | null;
    kw: number | null;
    kwh: number | null;
    /** Lignes du registre, et lignes qui portent une énergie. */
    lignes: number;
    connues: number;
  };
  const lignes = (await lireJson(
    `${JEU}/exports/json?select=codeinseecommune,filiere,sum(nbinstallations)%20as%20inst,` +
      'sum(puismaxinstallee)%20as%20kw,sum(energieannuelleglissanteinjectee)%20as%20kwh,' +
      'count(*)%20as%20lignes,count(energieannuelleglissanteinjectee)%20as%20connues' +
      '&group_by=codeinseecommune,filiere',
  )) as Ligne[];

  const { actuelles, reports } = reportsDuDecoupage();
  const rang = new Map(FILIERES.map(([cle], i) => [cle, i]));
  const parCommune = new Map<string, Map<number, [number, number, number, number, number]>>();
  let solaire = 0;
  let inconnues = 0;
  for (const l of lignes) {
    const f = rang.get(l.filiere ?? '');
    if (f === undefined) {
      if (l.filiere && l.filiere !== 'Stockage non hydraulique') inconnues++;
      continue;
    }
    const brut = communeDe((l.codeinseecommune ?? '').trim());
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    if (!code) continue;
    const parF = parCommune.get(code) ?? new Map<number, [number, number, number, number, number]>();
    const x = parF.get(f) ?? [0, 0, 0, 0, 0];
    x[0] += l.inst ?? 0;
    x[1] += l.kw ?? 0;
    x[2] += l.kwh ?? 0;
    x[3] += l.lignes ?? 0;
    x[4] += l.connues ?? 0;
    parF.set(f, x);
    parCommune.set(code, parF);
    if (f === 0) solaire += l.inst ?? 0;
  }
  if (inconnues > 0) dire(`Production : ${inconnues} lignes d’une filière inconnue, écartées — le registre a changé ?`);
  if (solaire < 500000) {
    dire(`Production : ${solaire} installations solaires seulement, on garde l’ingestion précédente.`);
    return null;
  }

  const communes = new Map<string, ProductionCommune>();
  for (const [code, parF] of parCommune) {
    communes.set(
      code,
      [...parF]
        .sort((a, b) => a[0] - b[0])
        .map(([f, [n, kw, kwh, total, connues]]) => [
          f,
          n,
          Math.round(kw * 10) / 10,
          Math.round(kwh / 1000),
          connues === 0 ? 2 : connues < total ? 1 : 0,
        ]),
    );
  }
  dire(
    `Production au ${au} : ${communes.size.toLocaleString('fr-FR')} communes avec au moins une installation, ` +
      `${solaire.toLocaleString('fr-FR')} installations solaires.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), au, communes };
}

export function ecrireProduction(sortie: string, p: Production): number {
  return ecrireParDepartement(sortie, 'production', p.communes, () => ({
    maj: p.maj,
    au: p.au,
    filieres: FILIERES.map(([, libelle]) => libelle),
  }));
}

// Lancé seul : réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const p = await collecterProduction(lireJson, console.log);
  if (p) console.log(`${ecrireProduction(sortie, p)} départements écrits.`);
}
