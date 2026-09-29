/**
 * L'électricité et le gaz consommés dans chaque commune, et qui les
 * distribue, d'après l'Agence ORE, qui réunit les données des gestionnaires de
 * réseau de distribution.
 *
 * Deux choses en sortent pour la page :
 * - la consommation des logements, rapportée au nombre de points de livraison
 *   résidentiels — c'est ce qui se compare d'une commune à l'autre —, et celle
 *   de toute la commune, entreprises et services compris ;
 * - le distributeur : Enedis et GRDF presque partout, une entreprise locale de
 *   distribution — régie, société d'économie mixte — ailleurs. Le fichier le
 *   dit ligne par ligne ; le décompte est dans le journal de l'ingestion.
 *
 * Les données sont publiées sous le secret des informations commercialement
 * sensibles : les mailles trop petites — une entreprise seule dans son secteur
 * — sont retirées. Le fichier dit combien ; quand il y en a, le total de la
 * commune est un minimum, et la page le dit.
 *
 * Lancé seul — `tsx scripts/energie-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-energie.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

export const API =
  'https://opendata.agenceore.fr/data-fair/api/v1/datasets/consommation-annuelle-d-electricite-et-gaz-par-commune';

/** Par filière : [MWh résidentiels, points résidentiels, MWh tous secteurs, mailles retirées, distributeurs]. */
type Filiere = [number, number, number, number, string[]];
/** Électricité puis gaz ; null quand la commune n'a pas de réseau de gaz. */
export type Energie = [Filiere | null, Filiere | null];

export interface Energies {
  maj: string;
  annee: number;
  communes: Map<string, Energie>;
}

export async function derniereAnnee(lireJson: (url: string) => Promise<unknown>): Promise<number> {
  const r = (await lireJson(`${API}/values_agg?field=annee&size=1&sort=-annee`)) as { aggs?: { value?: string }[] };
  const a = Number(r.aggs?.[0]?.value);
  if (!a) throw new Error('Agence ORE : aucune année publiée');
  return a;
}

export async function collecterEnergie(
  lireJson: (url: string) => Promise<unknown>,
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<Energies | null> {
  let annee: number;
  const communes = new Map<string, Energie>();
  let lignes = 0;
  try {
    annee = await derniereAnnee(lireJson);
    const champs = 'code_commune,filiere,code_categorie_consommation,conso_totale_mwh,nb_sites,nombre_de_mailles_secretisees,operateur';
    // Quarante pages de dix mille lignes, chaînées par l'en-tête « Link ».
    let url: string | null = `${API}/lines?qs=${encodeURIComponent(`annee:${annee}`)}&size=10000&format=csv&select=${champs}`;
    while (url) {
      const r = await obstine(url);
      const suivante = /<([^>]+)>;\s*rel=next/.exec(r.headers.get('link') ?? '')?.[1] ?? null;
      const texte = await r.text();
      let col: Record<string, number> | null = null;
      for await (const v of lignesCsv([texte])) {
        if (!col) {
          // Les en-têtes sont les libellés du jeu, pas ses noms de champ.
          const noms = v.map((n) => n.trim().toLowerCase());
          const trouve = (motif: RegExp) => {
            const k = noms.findIndex((n) => motif.test(n));
            if (k === -1) throw new Error(`Agence ORE : colonne ${motif} absente`);
            return k;
          };
          col = {
            code: trouve(/^code commune$/),
            filiere: trouve(/^filiere$/),
            categorie: trouve(/cat[ée]gorie/),
            mwh: trouve(/^conso totale/),
            sites: trouve(/^nb sites$/),
            secret: trouve(/secr[ée]tis/),
            operateur: trouve(/^operateur$/),
          };
          continue;
        }
        if (v.length < 7) continue;
        const code = v[col.code];
        if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
        const k = /^gaz/i.test(v[col.filiere]) ? 1 : /^[ée]lectricit/i.test(v[col.filiere]) ? 0 : -1;
        if (k === -1) continue;
        let e = communes.get(code);
        if (!e) communes.set(code, (e = [null, null]));
        const f = (e[k] ??= [0, 0, 0, 0, []]);
        const mwh = Number(v[col.mwh]) || 0;
        if (v[col.categorie] === 'RES') {
          f[0] += mwh;
          f[1] += Number(v[col.sites]) || 0;
        }
        f[2] += mwh;
        f[3] += Number(v[col.secret]) || 0;
        const op = v[col.operateur].trim();
        if (op && !f[4].includes(op)) f[4].push(op);
        lignes++;
      }
      url = suivante;
    }
  } catch (e) {
    dire(`Électricité et gaz indisponibles (${(e as Error).message}) : ceux de l’ingestion précédente restent en place.`);
    return null;
  }
  if (communes.size < 30000) {
    dire(`Électricité et gaz : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  for (const e of communes.values()) {
    for (const f of e) {
      if (!f) continue;
      f[0] = Math.round(f[0]);
      f[2] = Math.round(f[2]);
      f[4].sort();
    }
  }
  const locales = [...communes.values()].filter((e) => e[0] && e[0][4].some((o) => o !== 'Enedis')).length;
  dire(
    `Électricité et gaz ${annee} : ${lignes.toLocaleString('fr-FR')} lignes, ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `dont ${locales.toLocaleString('fr-FR')} desservies en électricité par un autre distributeur qu’Enedis.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annee, communes };
}

export function ecrireEnergie(sortie: string, e: Energies): number {
  return ecrireParDepartement(sortie, 'energie', e.communes, () => ({ maj: e.maj, annee: e.annee }));
}

// Lancé seul : interroge l'Agence ORE et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lireJson, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const e = await collecterEnergie(lireJson, obstine, console.log);
  if (e) console.log(`${ecrireEnergie(sortie, e)} départements écrits.`);
}
