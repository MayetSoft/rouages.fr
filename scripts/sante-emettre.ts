/**
 * L'accès aux médecins généralistes, commune par commune : l'indicateur
 * d'accessibilité potentielle localisée (APL) de la DREES.
 *
 * Ce n'est pas une densité. L'APL compte les consultations et visites qu'un
 * habitant peut obtenir par an, compte tenu des médecins de sa commune *et* de
 * ceux des communes voisines — plus ils sont loin, moins ils comptent —, de
 * leur activité réelle et de l'âge des habitants, qui fait les besoins. Une
 * commune sans cabinet peut donc être bien servie, et une commune qui en a un
 * mal servie si ce médecin soigne tout un canton.
 *
 * Le seuil est repris tel que l'INSEE le pose, pas choisi ici : « une commune
 * est sous-dotée en médecins généralistes si son APL est inférieure ou égale à
 * 2,5 consultations par habitant et par an ».
 *
 * **Pas de moyenne nationale ni départementale.** La note du fichier dit
 * comment la calculer — pondérer par la population standardisée —, et le
 * calcul a été fait : 3,74 pour 2023, quand l'INSEE publie 3,8 pour la même
 * année. L'écart tient sans doute à une révision du fichier ; tant qu'il n'est
 * pas expliqué, la page compare au seuil, qui ne dépend d'aucun calcul d'ici.
 *
 * Une deuxième colonne restreint l'offre aux médecins de 65 ans ou moins :
 * l'écart dit ce qui dépend de médecins proches de la retraite.
 *
 * Lancé seul — `tsx scripts/sante-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-sante.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

export const FICHIER =
  'https://data.drees.solidarites-sante.gouv.fr/api/explore/v2.1/catalog/datasets/530_l-accessibilite-potentielle-localisee-apl/attachments/indicateur_d_apl_aux_medecins_generalistes_xlsx';

export interface Sante {
  maj: string;
  annees: number[];
  /** Code commune → pour chaque année, [APL, APL 65 ans ou moins]. */
  communes: Map<string, [number | null, number | null][]>;
}

export async function lireSante(chemin: string): Promise<Omit<Sante, 'maj'>> {
  const XLSX = await import('xlsx');
  XLSX.set_fs(await import('node:fs'));
  const classeur = XLSX.readFile(chemin);
  // Une feuille par millésime : « APL 2022 », « APL 2023 »…
  const feuilles = classeur.SheetNames.map((n) => ({ n, annee: Number(/APL (\d{4})/.exec(n)?.[1]) }))
    .filter((f) => f.annee > 0)
    .sort((a, b) => a.annee - b.annee)
    .slice(-3);
  if (feuilles.length === 0) throw new Error('aucune feuille « APL AAAA » — le classeur a changé de forme');
  const annees = feuilles.map((f) => f.annee);
  const communes = new Map<string, [number | null, number | null][]>();
  feuilles.forEach(({ n }, i) => {
    const lignes = XLSX.utils.sheet_to_json<unknown[]>(classeur.Sheets[n], { header: 1, raw: true });
    const t = lignes.findIndex((l) => String(l[0] ?? '').startsWith('Code commune'));
    if (t === -1) throw new Error(`feuille « ${n} » sans ligne d'en-tête`);
    const entetes = (lignes[t] as unknown[]).map((h) => String(h ?? '').trim());
    const col = (debut: string) => {
      const k = entetes.findIndex((h) => h.startsWith(debut));
      if (k === -1) throw new Error(`colonne « ${debut} » absente de « ${n} »`);
      return k;
    };
    const cApl = col('APL aux médecins généralistes');
    const c65 = col('APL aux médecins généralistes de 65 ans');
    for (const l of lignes.slice(t + 1)) {
      const code = codeCommune(String(l[0] ?? ''));
      if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
      const apl = Number(l[cApl]);
      const a65 = Number(l[c65]);
      if (!Number.isFinite(apl)) continue;
      if (!communes.has(code)) communes.set(code, annees.map(() => [null, null]));
      communes.get(code)![i] = [Math.round(apl * 100) / 100, Number.isFinite(a65) ? Math.round(a65 * 100) / 100 : null];
    }
  });
  return { annees, communes };
}

export async function collecterSante(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Sante | null> {
  const vers = join(cache, 'drees-apl-generalistes.xlsx');
  try {
    await telecharger(FICHIER, vers);
  } catch {
    dire('Accès aux généralistes indisponible : celui de l’ingestion précédente reste en place.');
    return null;
  }
  const s = await lireSante(vers);
  if (s.communes.size < 30000) {
    dire(`Accès aux généralistes : ${s.communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const dernier = s.annees.length - 1;
  const sousDotees = [...s.communes.values()].filter((v) => v[dernier][0] !== null && v[dernier][0]! <= 2.5).length;
  dire(
    `Accès aux généralistes ${s.annees.join(', ')} : ${s.communes.size.toLocaleString('fr-FR')} communes, ` +
      `dont ${sousDotees.toLocaleString('fr-FR')} à 2,5 consultations ou moins en ${s.annees[dernier]}.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), ...s };
}

export function ecrireSante(sortie: string, s: Sante): number {
  return ecrireParDepartement(sortie, 'sante', s.communes, () => ({
    maj: s.maj,
    annees: s.annees,
  }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const s = await collecterSante(telecharger, cache, console.log);
  if (s) console.log(`${ecrireSante(sortie, s)} départements écrits.`);
}
