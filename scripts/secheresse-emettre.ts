/**
 * Les restrictions d'eau pour sécheresse dans chaque commune, jour par jour
 * depuis le 1er janvier, d'après VigiEau, le service du ministère de la
 * Transition écologique qui réunit les arrêtés des préfets ; et, pour chaque
 * année depuis 2012, les jours sous restriction à date égale — du 1er
 * janvier au même jour que la dernière date publiée —, pour dire si l'année
 * en cours sort de l'ordinaire.
 *
 * Trois ressources sont suivies séparément : l'eau potable du réseau (AEP),
 * les eaux souterraines (SOU) et les eaux superficielles (SUP), chacune à
 * l'un des quatre niveaux de gravité — vigilance, alerte, alerte renforcée,
 * crise. La page compte, pour chaque niveau, les jours où au moins une des
 * trois ressources l'atteignait — le niveau le plus grave du jour —, et dit
 * le niveau du dernier jour publié. La vigilance n'impose rien : un jour
 * « sous restriction » est un jour en alerte ou plus.
 *
 * L'historique fait près de 12 Go de JSON, une liste par commune, chaque jour
 * depuis mai 2010 : il est lu en flux, commune par commune, à la sortie de
 * `unzip`. La série commence en 2012 : le fichier remonte à mai 2010, mais ne
 * compte aucun jour en alerte dans aucune commune avant 2012, l'année où
 * commencent les arrêtés publiés par VigiEau. Une absence de données, pas de
 * restrictions.
 *
 * Lancé seul — `tsx scripts/secheresse-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-secheresse.json`.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { communeDe, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const JEU = '662a5e2cd71b24df5e9a0827';
export const DEBUT = 2012;
export const NIVEAUX = ['vigilance', 'alerte', 'alerte_renforcee', 'crise'] as const;

/**
 * Jours à chaque niveau cette année (vigilance, alerte, alerte renforcée,
 * crise), le niveau du dernier jour (0 aucun, 1 à 4), puis les jours en
 * alerte ou plus de chaque année depuis `DEBUT`, à date égale.
 */
export type SecheresseCommune = [number, number, number, number, number, number[]];

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
  const res = (r.data ?? []).find((x) => x.url && /^historique communes$/i.test((x.title ?? '').trim()));
  if (!res) throw new Error('VigiEau : aucun fichier « Historique Communes »');
  const archive = join(cache, `vigieau-historique-communes-${(res.last_modified ?? '').slice(0, 10)}.zip`);
  await telecharger(res.url!, archive);

  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, SecheresseCommune>();
  // Toutes les communes ont les mêmes jours : la dernière date de la première fixe l'année et le jour de coupe.
  let au = '';
  let annee = 0;
  let coupe = '';
  const traiter = (segment: string) => {
    const brut = /"commune":\{"code":"([0-9AB]{5})"/.exec(segment)?.[1];
    if (!brut) return;
    const c = communeDe(brut);
    const code = actuelles.has(c) ? c : reports.get(c);
    if (!code) return;
    if (!au) {
      const dates = [...segment.matchAll(/"date":"(\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]);
      au = dates.reduce((a, b) => (b > a ? b : a), '');
      annee = Number(au.slice(0, 4));
      coupe = au.slice(5);
    }
    const serie = Array.from({ length: annee - DEBUT + 1 }, () => 0);
    const x: SecheresseCommune = [0, 0, 0, 0, 0, serie];
    let dernier = '';
    for (const m of segment.matchAll(JOUR)) {
      const a = Number(m[4].slice(0, 4));
      if (a < DEBUT || m[4].slice(5) > coupe) continue;
      const rang = Math.max(rangDe(m[1]), rangDe(m[2]), rangDe(m[3]));
      if (rang >= 2) serie[a - DEBUT]++;
      if (a !== annee) continue;
      if (rang > 0) x[rang - 1] = (x[rang - 1] as number) + 1;
      if (m[4] >= dernier) {
        dernier = m[4];
        x[4] = rang;
      }
    }
    // Une commune nouvelle réunit plusieurs anciennes : on garde, niveau par niveau et année par année, la plus touchée.
    const avant = communes.get(code);
    if (!avant) communes.set(code, x);
    else {
      for (let i = 0; i < 5; i++) avant[i] = Math.max(avant[i] as number, x[i] as number);
      avant[5] = avant[5].map((v, i) => Math.max(v, serie[i]));
    }
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
  const du = `${annee}-01-01`;
  const parAnnee = Array.from({ length: annee - DEBUT + 1 }, (_, i) =>
    [...communes.values()].filter((x) => x[5][i] > 0).length,
  );
  dire(
    `Restrictions d’eau du ${du} au ${au} : ${communes.size.toLocaleString('fr-FR')} communes. ` +
      `Communes au moins un jour en alerte ou plus, à date égale : ` +
      parAnnee.map((n, i) => `${DEBUT + i} ${n}`).join(', ') + '.',
  );
  return { maj: new Date().toISOString().slice(0, 10), annee, du, au, communes };
}

export function ecrireSecheresse(sortie: string, s: Secheresse): number {
  return ecrireParDepartement(sortie, 'secheresse', s.communes, () => ({ maj: s.maj, annee: s.annee, du: s.du, au: s.au, debut: DEBUT }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, obstine, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const s = await collecterSecheresse(async (url) => (await obstine(url)).json(), telecharger, cache, console.log);
  if (s) console.log(`${ecrireSecheresse(sortie, s)} départements écrits.`);
}
