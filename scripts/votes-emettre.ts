/**
 * Comment la commune vote aux élections nationales : la participation, les
 * blancs et les nuls, à la présidentielle de 2022, aux européennes et aux
 * législatives de 2024, d'après les résultats définitifs du ministère de
 * l'intérieur.
 *
 * La participation d'abord, puis les voix : les six premiers candidats ou
 * listes de la commune, et le reste réuni. Les noms sont ceux du fichier du
 * ministère — des données, pas des nœuds du graphe. Aux législatives, la
 * nuance est l'abréviation que le ministère attribue à chaque candidat, telle
 * qu'il la publie : sa grille de 2024 (UG, UXD, HOR…) n'est pas publiée en
 * données ouvertes avec ses libellés, et le site ne les développe pas de
 * mémoire.
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

/** Les premiers candidats ou listes, [libellé, voix], les voix des autres, et au moins combien de circonscriptions couvre la commune (1 hors législatives). */
export type Voix = [[string, number][], number, number];
/** Combien de candidats ou de listes on nomme ; les autres sont réunis. */
export const PREMIERS = 6;

export interface Votes {
  maj: string;
  scrutins: { id: string; nom: string; date: string; france: Participation | null }[];
  /** Par commune, un scrutin après l'autre : la participation, puis les voix ; null quand la commune n'y a pas voté. */
  communes: Map<string, [Participation | null, Voix | null][]>;
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

export interface Scrutin {
  participation: Map<string, Participation>;
  voix: Map<string, Voix>;
}

export async function lireScrutin(chemin: string, encodage: 'latin1' | 'utf-8'): Promise<Scrutin> {
  const communes = new Map<string, Participation>();
  const candidats = new Map<string, Map<string, number>>();
  const lignes = new Map<string, number>();
  // Les colonnes d'un candidat ou d'une liste se répètent : on repère le premier
  // groupe par ses en-têtes, puis on avance d'un groupe à l'autre.
  let groupe: { debut: number; pas: number; nom: number; prenom: number; nuance: number; liste: number; voix: number } | null = null;
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
      const debut = noms.findIndex((n) => /^(n°panneau|num[ée]ro de panneau 1)$/.test(n));
      if (debut !== -1) {
        const second = noms.findIndex((n) => /^num[ée]ro de panneau 2$/.test(n));
        const dans = (motif: RegExp) => {
          const k = noms.slice(debut).findIndex((n) => motif.test(n));
          return k === -1 ? -1 : k;
        };
        groupe = {
          debut,
          // La présidentielle n'a qu'un groupe d'en-têtes : sept colonnes par candidat.
          pas: second !== -1 ? second - debut : 7,
          nom: dans(/^nom( candidat 1)?$/),
          prenom: dans(/^pr[ée]nom( candidat 1)?$/),
          nuance: dans(/^nuance candidat 1$/),
          liste: dans(/^libell[ée] de liste 1$/),
          voix: dans(/^voix( 1)?$/),
        };
        if (groupe.voix === -1 || (groupe.nom === -1 && groupe.liste === -1)) groupe = null;
      }
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
    lignes.set(code, (lignes.get(code) ?? 0) + 1);
    if (!groupe) continue;
    let c = candidats.get(code);
    if (!c) candidats.set(code, (c = new Map()));
    for (let g = groupe.debut; g + groupe.voix < v.length; g += groupe.pas) {
      const voix = n(g + groupe.voix);
      const libelle =
        groupe.liste !== -1
          ? v[g + groupe.liste].trim()
          : `${v[g + groupe.prenom]?.trim() ?? ''} ${v[g + groupe.nom].trim()}`.trim() +
            (groupe.nuance !== -1 && v[g + groupe.nuance]?.trim() ? ` (${v[g + groupe.nuance].trim()})` : '');
      if (!libelle) continue;
      c.set(libelle, (c.get(libelle) ?? 0) + voix);
    }
  }
  const voix = new Map<string, Voix>();
  for (const [code, c] of candidats) {
    const tries = [...c].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const autres = tries.slice(PREMIERS).reduce((s2, [, v]) => s2 + v, 0);
    // Une grande ville couvre plusieurs circonscriptions, mais le fichier par
    // commune la réunit en une ligne : ses « premiers » mélangeraient des
    // candidats qui ne s'affrontaient pas. Les grandes coalitions n'avaient
    // qu'un candidat par circonscription ; en trouver deux d'une même nuance,
    // c'est que la commune en couvre plusieurs.
    const parNuance = new Map<string, number>();
    for (const [nom] of tries) {
      const nuance = /\(([A-Z]+)\)$/.exec(nom)?.[1];
      if (nuance && ['UG', 'RN', 'UXD', 'ENS'].includes(nuance)) parNuance.set(nuance, (parNuance.get(nuance) ?? 0) + 1);
    }
    const plusieurs = Math.max(lignes.get(code) ?? 1, ...parNuance.values(), 1);
    voix.set(code, [tries.slice(0, PREMIERS), autres, plusieurs]);
  }
  return { participation: communes, voix };
}

export async function collecterVotes(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Votes | null> {
  const lus: Map<string, Participation>[] = [];
  const voix: Map<string, Voix>[] = [];
  for (const s of SCRUTINS) {
    const vers = join(cache, `elections-${s.id}.${s.url.endsWith('.txt') ? 'txt' : 'csv'}`);
    try {
      await telecharger(s.url, vers);
      const l = await lireScrutin(vers, s.encodage);
      lus.push(l.participation);
      voix.push(l.voix);
    } catch (e) {
      dire(`Élections nationales, ${s.nom} : ${(e as Error).message} — l’ingestion précédente reste en place.`);
      return null;
    }
  }
  const codes = new Set(lus.flatMap((m) => [...m.keys()]));
  const communes = new Map(
    [...codes].map((c) => [c, lus.map((m, i) => [m.get(c) ?? null, voix[i].get(c) ?? null] as [Participation | null, Voix | null])] as const),
  );
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
