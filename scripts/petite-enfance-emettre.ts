/**
 * L'accueil des enfants de moins de trois ans : le taux de couverture de la
 * CNAF, places d'accueil formel pour cent enfants — crèches et autres
 * établissements d'accueil du jeune enfant, assistantes maternelles, gardes à
 * domicile, école dès deux ans.
 *
 * Ce que la CAF en dit : une offre **théorique** au mois de décembre, qui ne
 * tient pas compte d'une place vacante ni d'une place partagée par plusieurs
 * enfants. Elle publie le taux par intercommunalité pour toutes, mais par
 * commune pour celles de plus de 10 000 habitants seulement : la page d'une
 * petite commune montre donc celui de son intercommunalité, et le dit.
 *
 * Un seul fichier national, `public/territoires/petite-enfance.json` : la
 * dernière année publiée, la France, les intercommunalités par SIREN et les
 * communes par code.
 *
 * Lancé seul — `tsx scripts/petite-enfance-emettre.ts`.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const API = 'https://data.caf.fr/api/explore/v2.1/catalog/datasets';
/** Global, établissements d'accueil (EAJE), assistantes maternelles, école dès deux ans, salariée à domicile. */
const PARTS = ['', '_eaje', '_am_ind', '_prescol', '_gad_ind'] as const;

export type Couverture = [number, number, number, number, number];

export interface PetiteEnfance {
  maj: string;
  annee: number;
  france: Couverture;
  epci: Record<string, Couverture>;
  communes: Record<string, Couverture>;
}

type Ligne = Record<string, string | number | null>;

export async function collecterPetiteEnfance(
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void,
): Promise<PetiteEnfance | null> {
  const toutes = async (jeu: string) => (await lireJson(`${API}/${jeu}/exports/json`)) as Ligne[];
  const [nat, epci, com] = await Promise.all([toutes('txcouv_pe_nat'), toutes('txcouv_pe_epci'), toutes('txcouv_pe_com')]);
  const annee = Math.max(...epci.map((l) => Number(l.annee) || 0));
  if (!annee) throw new Error('taux de couverture : aucune année');
  const valeurs = (l: Ligne, suffixe: string): Couverture | null => {
    const v = PARTS.map((p) => Number(l[`txcouv${p}_${suffixe}`]));
    return Number.isFinite(v[0]) && l[`txcouv_${suffixe}`] !== null ? (v.map((x) => (Number.isFinite(x) ? x : 0)) as Couverture) : null;
  };
  const france = nat.filter((l) => Number(l.annee) === annee).map((l) => valeurs(l, 'nat')).find(Boolean);
  if (!france) throw new Error(`taux de couverture : pas de chiffre national pour ${annee}`);

  const parEpci: Record<string, Couverture> = {};
  for (const l of epci) {
    if (Number(l.annee) !== annee) continue;
    const v = valeurs(l, 'epci');
    if (v && l.numepci) parEpci[String(l.numepci)] = v;
  }
  const { actuelles, reports } = reportsDuDecoupage();
  const parCommune: Record<string, Couverture> = {};
  for (const l of com) {
    if (Number(l.annee) !== annee) continue;
    const brut = communeDe(String(l.numcom ?? ''));
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    const v = valeurs(l, 'com');
    if (code && v) parCommune[code] = v;
  }
  if (Object.keys(parEpci).length < 1000) {
    dire(`Accueil du jeune enfant : ${Object.keys(parEpci).length} intercommunalités seulement, on garde l’ingestion précédente.`);
    return null;
  }
  dire(
    `Accueil du jeune enfant ${annee} : ${Object.keys(parEpci).length} intercommunalités, ` +
      `${Object.keys(parCommune).length} communes, France ${france[0]} places pour 100 enfants.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annee, france, epci: parEpci, communes: parCommune };
}

export function ecrirePetiteEnfance(sortie: string, p: PetiteEnfance): void {
  writeFileSync(join(sortie, 'petite-enfance.json'), JSON.stringify({ maj: p.maj, annee: p.annee, france: p.france, e: p.epci, c: p.communes }));
}

// Lancé seul : réécrit le fichier national.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const p = await collecterPetiteEnfance(async (url) => (await obstine(url)).json(), console.log);
  if (p) ecrirePetiteEnfance(sortie, p);
}
