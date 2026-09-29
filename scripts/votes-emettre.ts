/**
 * Comment la commune vote aux élections nationales : la participation, les
 * blancs et les nuls, à la présidentielle de 2022, aux européennes et aux
 * législatives de 2024, d'après les résultats définitifs du ministère de
 * l'intérieur.
 *
 * La participation seulement, pas les voix des candidats : le site décrit des
 * mécanismes, et c'est la participation qui dit si les habitants se servent
 * du levier. Les voix sont dans les fichiers du ministère, cités en source.
 *
 * Les fichiers ne se ressemblent pas : la présidentielle de 2022 est en
 * Latin-1, le code de la commune sans son département, l'outre-mer sous des
 * codes « ZA », « ZB »… ; ceux de 2024 portent le code INSEE, parfois sans
 * son zéro de tête. On lit tout par le nom des colonnes.
 *
 * La référence est la somme des communes du même fichier, en métropole et dans
 * les cinq départements d'outre-mer : les Français de l'étranger n'ont pas de
 * commune, et les collectivités du Pacifique ne sont pas dans tous les
 * fichiers. Elle n'est donc pas la participation officielle, qui compte les
 * Français de l'étranger, et la page le dit. Au second tour des législatives,
 * elle n'a pas de sens : une partie des circonscriptions a élu au premier tour.
 *
 * Lancé seul — `tsx scripts/votes-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-votes.json`.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, lignesCsv, telechargerSiAbsent } from './par-departement.ts';

const R = 'https://static.data.gouv.fr/resources';
export const SCRUTINS = [
  {
    id: 'pres2022-t1',
    nom: 'Présidentielle 2022, premier tour',
    date: '2022-04-10',
    url: `${R}/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/20220414-152459/resultats-par-niveau-subcom-t1-france-entiere.txt`,
    encodage: 'latin1',
    national: true,
  },
  {
    id: 'pres2022-t2',
    nom: 'Présidentielle 2022, second tour',
    date: '2022-04-24',
    url: `${R}/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2nd-tour/20220428-142333/resultats-par-niveau-subcom-t2-france-entiere.txt`,
    encodage: 'latin1',
    national: true,
  },
  {
    id: 'euro2024',
    nom: 'Européennes 2024',
    date: '2024-06-09',
    url: `${R}/resultats-des-elections-europeennes-du-9-juin-2024/20240613-154634/resultats-definitifs-par-commune.csv`,
    encodage: 'utf-8',
    national: true,
  },
  {
    id: 'legi2024-t1',
    nom: 'Législatives 2024, premier tour',
    date: '2024-06-30',
    url: `${R}/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour/20240711-075056/resultats-definitifs-par-communes.csv`,
    encodage: 'utf-8',
    national: true,
  },
  {
    id: 'legi2024-t2',
    nom: 'Législatives 2024, second tour',
    date: '2024-07-07',
    url: `${R}/elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour/20240710-170606/resultats-definitifs-par-commune.csv`,
    encodage: 'utf-8',
    national: false,
  },
] as const;

/** Inscrits, votants, blancs, nuls, exprimés. */
export type Participation = [number, number, number, number, number];

export interface Votes {
  maj: string;
  scrutins: { id: string; nom: string; date: string; france: Participation | null }[];
  /** Par commune, un scrutin après l'autre ; null quand la commune n'y a pas voté (second tour sans objet). */
  communes: Map<string, (Participation | null)[]>;
}

/** Les départements d'outre-mer de la présidentielle, codés « Z… » par le ministère. */
const OUTRE_MER: Record<string, string> = { ZA: '97', ZB: '97', ZC: '97', ZD: '97', ZM: '97' };

function codeInsee(dep: string, commune: string): string | null {
  const c = commune.trim();
  if (/^\d[\dAB]\d{3}$/.test(c)) return c;
  if (/^\d{4}$/.test(c)) return `0${c}`;
  if (!/^\d{1,3}$/.test(c)) return null;
  const d = dep.trim();
  if (d in OUTRE_MER) return `${OUTRE_MER[d]}${c.padStart(3, '0')}`;
  if (/^Z/.test(d)) return null; // collectivités du Pacifique, Français de l'étranger
  return `${d.padStart(2, '0')}${c.padStart(3, '0')}`;
}

export async function lireScrutin(chemin: string, encodage: 'latin1' | 'utf-8'): Promise<Map<string, Participation>> {
  const communes = new Map<string, Participation>();
  const decodeur = new TextDecoder(encodage === 'latin1' ? 'latin1' : 'utf-8');
  async function* texte() {
    for await (const m of createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>) yield decodeur.decode(m, { stream: true });
  }
  let col: Record<string, number> | null = null;
  for await (const v of lignesCsv(texte(), ';')) {
    if (!col) {
      const noms = v.map((n) => n.trim().toLowerCase());
      const trouve = (motif: RegExp) => {
        const k = noms.findIndex((n) => motif.test(n));
        if (k === -1) throw new Error(`${chemin} : colonne ${motif} absente`);
        return k;
      };
      col = {
        dep: trouve(/^code (du )?d[ée]partement$/),
        commune: trouve(/^code (de la )?commune$/),
        inscrits: trouve(/^inscrits$/),
        votants: trouve(/^votants$/),
        blancs: trouve(/^blancs$/),
        nuls: trouve(/^nuls$/),
        exprimes: trouve(/^exprim[ée]s$/),
      };
      continue;
    }
    if (v.length < 8) continue;
    const brut = codeInsee(v[col.dep], v[col.commune]);
    if (!brut) continue;
    const code = communeDe(brut);
    const n = (k: number) => Number(v[k].replace(/\s/g, '')) || 0;
    const x: Participation = [n(col.inscrits), n(col.votants), n(col.blancs), n(col.nuls), n(col.exprimes)];
    if (x[0] <= 0) continue;
    // Une commune partagée entre plusieurs circonscriptions a plusieurs lignes.
    const deja = communes.get(code);
    communes.set(code, deja ? (deja.map((y, i) => y + x[i]) as Participation) : x);
  }
  return communes;
}

export async function collecterVotes(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Votes | null> {
  const lus: Map<string, Participation>[] = [];
  for (const s of SCRUTINS) {
    const vers = join(cache, `elections-${s.id}.${s.url.endsWith('.txt') ? 'txt' : 'csv'}`);
    try {
      await telecharger(s.url, vers);
      lus.push(await lireScrutin(vers, s.encodage));
    } catch (e) {
      dire(`Élections nationales, ${s.nom} : ${(e as Error).message} — l’ingestion précédente reste en place.`);
      return null;
    }
  }
  const codes = new Set(lus.flatMap((m) => [...m.keys()]));
  const communes = new Map([...codes].map((c) => [c, lus.map((m) => m.get(c) ?? null)] as const));
  const scrutins = SCRUTINS.map((s, i) => ({
    id: s.id,
    nom: s.nom,
    date: s.date,
    france: s.national
      ? [...lus[i]]
          .filter(([code]) => !/^(97[578]|98)/.test(code))
          .reduce((a, [, x]) => a.map((y, k) => y + x[k]) as Participation, [0, 0, 0, 0, 0] as Participation)
      : null,
  }));
  if (lus.some((m) => m.size < 25000 && m !== lus[4])) {
    dire('Élections nationales : un fichier compte trop peu de communes, l’ingestion précédente reste en place.');
    return null;
  }
  dire(
    'Élections nationales : ' +
      scrutins
        .map((s, i) => `${s.nom} ${lus[i].size.toLocaleString('fr-FR')} communes` +
          (s.france ? `, participation ${((100 * s.france[1]) / s.france[0]).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : ''))
        .join(' ; ') + '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), scrutins, communes };
}

export function ecrireVotes(sortie: string, v: Votes): number {
  return ecrireParDepartement(sortie, 'votes', v.communes, () => ({ maj: v.maj, scrutins: v.scrutins }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const v = await collecterVotes(telecharger, cache, console.log);
  if (v) console.log(`${ecrireVotes(sortie, v)} départements écrits.`);
}
