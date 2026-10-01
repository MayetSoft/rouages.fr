/**
 * Les restrictions d'eau pour sécheresse dans chaque commune, jour par jour
 * depuis le 1er janvier, d'après VigiEau, le service du ministère de la
 * Transition écologique qui réunit les arrêtés des préfets.
 *
 * Trois ressources sont suivies séparément : l'eau potable du réseau (AEP),
 * les eaux souterraines (SOU) et les eaux superficielles (SUP), chacune à
 * l'un des quatre niveaux de gravité — vigilance, alerte, alerte renforcée,
 * crise. La page compte, pour chaque niveau, les jours où au moins une des
 * trois ressources l'atteignait — le niveau le plus grave du jour —, et dit
 * le niveau du dernier jour publié.
 *
 * Le fichier de l'année fait plus de 500 Mo de JSON, une liste par commune :
 * plus qu'une chaîne JavaScript n'en contient. Il est donc lu en flux, commune
 * par commune, à la sortie de `unzip`.
 *
 * Lancé seul — `tsx scripts/secheresse-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-secheresse.json`.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '662a5e2cd71b24df5e9a0827';
export const NIVEAUX = ['vigilance', 'alerte', 'alerte_renforcee', 'crise'] as const;

/** Jours à chaque niveau (vigilance, alerte, alerte renforcée, crise), puis le niveau du dernier jour (0 aucun, 1 à 4). */
export type SecheresseCommune = [number, number, number, number, number];

export interface Secheresse {
  maj: string;
  annee: number;
  du: string;
  au: string;
  communes: Map<string, SecheresseCommune>;
}

type Ressource = { title?: string; url?: string; last_modified?: string };

const JOUR = /\{"AEP":(null|"[a-z_]+"),"SOU":(null|"[a-z_]+"),"SUP":(null|"[a-z_]+"),"date":"(\d{4}-\d{2}-\d{2})"\}/g;
const rangDe = (v: string) => (v === 'null' ? 0 : NIVEAUX.indexOf(v.slice(1, -1) as (typeof NIVEAUX)[number]) + 1);

export async function collecterSecheresse(
  lireJson: (url: string) => Promise<unknown>,
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Secheresse | null> {
  const r = (await lireJson(`https://www.data.gouv.fr/api/2/datasets/${JEU}/resources/?page_size=50`)) as { data?: Ressource[] };
  const res = (r.data ?? [])
    .map((x) => ({ ...x, annee: Number(/^Communes en restrictions - (\d{4})$/i.exec((x.title ?? '').trim())?.[1] ?? 0) }))
    .filter((x) => x.url && x.annee > 2000)
    .sort((a, b) => b.annee - a.annee)[0];
  if (!res) throw new Error('VigiEau : aucun fichier « Communes en restrictions »');
  const archive = join(cache, `vigieau-communes-${res.annee}-${(res.last_modified ?? '').slice(0, 10)}.zip`);
  await telecharger(res.url!, archive);

  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, SecheresseCommune>();
  let du = '';
  let au = '';
  const traiter = (segment: string) => {
    const brut = /"commune":\{"code":"([0-9AB]{5})"/.exec(segment)?.[1];
    if (!brut) return;
    const c = communeDe(brut);
    const code = actuelles.has(c) ? c : reports.get(c);
    if (!code) return;
    const x: SecheresseCommune = [0, 0, 0, 0, 0];
    let dernier = '';
    for (const m of segment.matchAll(JOUR)) {
      const rang = Math.max(rangDe(m[1]), rangDe(m[2]), rangDe(m[3]));
      if (rang > 0) x[rang - 1]++;
      if (m[4] >= dernier) {
        dernier = m[4];
        x[4] = rang;
      }
      if (!du || m[4] < du) du = m[4];
      if (m[4] > au) au = m[4];
    }
    // Une commune nouvelle réunit plusieurs anciennes : on garde, jour par jour, la plus touchée.
    const avant = communes.get(code);
    communes.set(code, avant ? (x.map((v, i) => Math.max(v, avant[i])) as SecheresseCommune) : x);
  };

  await new Promise<void>((ok, ko) => {
    const p = spawn('unzip', ['-p', archive]);
    let tampon = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (morceau: string) => {
      tampon += morceau;
      let i = tampon.indexOf('{"commune":', 1);
      while (i > 0) {
        traiter(tampon.slice(0, i));
        tampon = tampon.slice(i);
        i = tampon.indexOf('{"commune":', 1);
      }
    });
    p.on('error', ko);
    p.on('close', (code) => {
      traiter(tampon);
      code === 0 ? ok() : ko(new Error(`unzip a rendu ${code}`));
    });
  });
  if (communes.size < 30000) {
    dire(`Sécheresse : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const touchees = [...communes.values()].filter((x) => x.slice(0, 4).some((v) => v > 0)).length;
  dire(
    `Restrictions d’eau ${res.annee}, du ${du} au ${au} : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${touchees.toLocaleString('fr-FR')} au moins un jour sous restriction.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), annee: res.annee, du, au, communes };
}

export function ecrireSecheresse(sortie: string, s: Secheresse): number {
  return ecrireParDepartement(sortie, 'secheresse', s.communes, () => ({ maj: s.maj, annee: s.annee, du: s.du, au: s.au }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const s = await collecterSecheresse(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (s) console.log(`${ecrireSecheresse(sortie, s)} départements écrits.`);
}
