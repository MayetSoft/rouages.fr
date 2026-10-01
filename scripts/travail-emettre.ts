/**
 * Le travail sur place, en deux séries : les salariés du secteur privé que
 * les établissements de la commune emploient, et les habitants inscrits à
 * France Travail.
 *
 * **Les salariés**, d'après l'URSSAF : les effectifs salariés au 31 décembre
 * des établissements employeurs du secteur privé (régime général), commune par
 * commune, depuis 2015, et par grand secteur la dernière année. Ce sont les
 * emplois situés dans la commune, quel que soit le domicile des salariés ;
 * l'agriculture (régime agricole), la fonction publique et les indépendants
 * n'y sont pas. Depuis juin 2023, les apprentis sont comptés.
 *
 * **Les inscrits**, d'après la DARES : les demandeurs d'emploi inscrits à
 * France Travail en catégories A, B et C, en moyenne sur le quatrième
 * trimestre, sur dix ans. La DARES arrondit chaque nombre au multiple de 5 :
 * sur une petite commune, une évolution d'une année sur l'autre peut tenir à
 * l'arrondi, et la page le dit. Ce sont les habitants de la commune.
 *
 * Les deux portails sont des Opendatasoft : l'URSSAF agrège côté serveur, la
 * DARES rend la seule ligne « total » de chaque commune.
 *
 * Lancé seul — `tsx scripts/travail-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-travail.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

const URSSAF =
  'https://open.urssaf.fr/api/explore/v2.1/catalog/datasets/etablissements-et-effectifs-salaries-au-niveau-commune-x-ape-last';
const DARES = 'https://data.dares.travail-emploi.gouv.fr/api/explore/v2.1/catalog/datasets/dares_defm_communales-brutes';
const DEPUIS = 2015;

/**
 * Salariés au 31 décembre depuis `debut` (null quand la commune n'en a aucun
 * déclaré cette année-là) ; par grand secteur la dernière année : rang du
 * secteur, salariés, établissements ; inscrits au 4e trimestre depuis
 * `debutInscrits`.
 */
export type TravailCommune = [(number | null)[], [number, number, number][], (number | null)[]];

export interface Travail {
  maj: string;
  debut: number;
  fin: number;
  secteurs: string[];
  debutInscrits: number;
  finInscrits: number;
  communes: Map<string, TravailCommune>;
}

export async function collecterTravail(
  obstine: (url: string) => Promise<Response>,
  dire: (m: string) => void,
): Promise<Travail | null> {
  const { actuelles, reports } = reportsDuDecoupage();
  const actuelle = (brut: string) => {
    const c = communeDe(brut.trim().padStart(5, '0'));
    return actuelles.has(c) ? c : (reports.get(c) ?? null);
  };

  // La dernière année publiée : la plus récente dont le champ existe.
  const meta = (await (await obstine(URSSAF)).json()) as { fields: { name: string }[] };
  const annees = meta.fields
    .map((f) => Number(/^effectifs_salaries_(\d{4})$/.exec(f.name)?.[1] ?? 0))
    .filter((a) => a >= DEPUIS)
    .sort((a, b) => a - b);
  const fin = annees.at(-1);
  if (!fin) throw new Error('URSSAF : aucune année d’effectifs');
  const select = [
    'code_commune',
    'grand_secteur_d_activite',
    ...annees.map((a) => `sum(effectifs_salaries_${a}) as e${a}`),
    `sum(nombre_d_etablissements_${fin}) as n`,
  ].join(',');
  const urlU = `${URSSAF}/exports/csv?select=${encodeURIComponent(select)}&group_by=code_commune,grand_secteur_d_activite&delimiter=%3B`;
  const texteU = (await (await obstine(urlU)).text()).replace(/^﻿/, '');

  const secteurs: string[] = [];
  const rang = (s: string) => {
    const i = secteurs.indexOf(s);
    if (i >= 0) return i;
    secteurs.push(s);
    return secteurs.length - 1;
  };
  const salaries = new Map<string, { serie: (number | null)[]; secteurs: Map<number, [number, number]> }>();
  let col: Record<string, number> | null = null;
  let lignes = 0;
  for await (const v of lignesCsv([texteU], ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      continue;
    }
    const code = actuelle(v[col.code_commune] ?? '');
    if (!code) continue;
    lignes++;
    // « GS3 Commerce » : le libellé sans son code.
    const secteur = (v[col.grand_secteur_d_activite] ?? '').replace(/^GS\d+\s+/, '').trim();
    const x = salaries.get(code) ?? { serie: annees.map(() => null), secteurs: new Map() };
    annees.forEach((a, i) => {
      const e = Number(v[col![`e${a}`]]);
      if (Number.isFinite(e) && v[col![`e${a}`]] !== '') x.serie[i] = (x.serie[i] ?? 0) + e;
    });
    const eFin = Number(v[col[`e${fin}`]]) || 0;
    const nFin = Number(v[col.n]) || 0;
    if (secteur && (eFin > 0 || nFin > 0)) {
      const k = rang(secteur);
      const s = x.secteurs.get(k) ?? [0, 0];
      s[0] += eFin;
      s[1] += nFin;
      x.secteurs.set(k, s);
    }
    salaries.set(code, x);
  }
  if (lignes < 50000) {
    dire(`Salariés : ${lignes} lignes seulement, on garde l’ingestion précédente.`);
    return null;
  }

  // Les inscrits : la seule ligne « total, tous âges » de chaque commune.
  const where = encodeURIComponent('sexe="Total" and tranche_d_age="Total" and categorie="ABC"');
  const urlD = `${DARES}/exports/csv?select=date,code_commune,nombre_de_demandeurs_d_emploi&where=${where}&delimiter=%3B`;
  const texteD = (await (await obstine(urlD)).text()).replace(/^﻿/, '');
  const inscrits = new Map<string, Map<number, number>>();
  col = null;
  let lus = 0;
  for await (const v of lignesCsv([texteD], ';')) {
    if (!col) {
      col = Object.fromEntries(v.map((n, i) => [n.trim(), i]));
      continue;
    }
    const annee = Number(/^(\d{4})-T4$/.exec((v[col.date] ?? '').trim())?.[1] ?? 0);
    const code = actuelle(v[col.code_commune] ?? '');
    const n = Number(v[col.nombre_de_demandeurs_d_emploi]);
    if (!annee || !code || !Number.isFinite(n)) continue;
    const m = inscrits.get(code) ?? new Map<number, number>();
    m.set(annee, (m.get(annee) ?? 0) + n);
    inscrits.set(code, m);
    lus++;
  }
  if (lus < 100000) {
    dire(`Inscrits à France Travail : ${lus} lignes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const anneesI = [...new Set([...inscrits.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const debutI = anneesI[0];
  const finI = anneesI.at(-1)!;

  const communes = new Map<string, TravailCommune>();
  for (const code of new Set([...salaries.keys(), ...inscrits.keys()])) {
    const s = salaries.get(code);
    const m = inscrits.get(code);
    communes.set(code, [
      s?.serie ?? annees.map(() => null),
      [...(s?.secteurs ?? new Map<number, [number, number]>())]
        .sort((a, b) => b[1][0] - a[1][0])
        .map(([k, [e, n]]) => [k, e, n]),
      Array.from({ length: finI - debutI + 1 }, (_, i) => m?.get(debutI + i) ?? null),
    ]);
  }
  dire(
    `Salariés ${annees[0]}-${fin} et inscrits à France Travail ${debutI}-${finI} : ` +
      `${communes.size.toLocaleString('fr-FR')} communes, ${secteurs.length} grands secteurs.`,
  );
  return {
    maj: new Date().toISOString().slice(0, 10),
    debut: annees[0],
    fin,
    secteurs,
    debutInscrits: debutI,
    finInscrits: finI,
    communes,
  };
}

export function ecrireTravail(sortie: string, t: Travail): number {
  return ecrireParDepartement(sortie, 'travail', t.communes, () => ({
    maj: t.maj,
    debut: t.debut,
    fin: t.fin,
    secteurs: t.secteurs,
    debutInscrits: t.debutInscrits,
    finInscrits: t.finInscrits,
  }));
}

// Lancé seul : réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const t = await collecterTravail(obstine, console.log);
  if (t) console.log(`${ecrireTravail(sortie, t)} départements écrits.`);
}
