/**
 * La surface agricole, commune par commune, d'après le recensement agricole
 * 2020 du service statistique du ministère de l'agriculture (Agreste).
 *
 * Une précaution, que la page reprend : toute la surface d'une exploitation est
 * rattachée à la commune de son **siège**. Un éleveur installé au bourg qui
 * fauche des prés dans les trois communes voisines compte ses 150 hectares
 * chez lui. La surface d'une commune peut ainsi dépasser son territoire, ou
 * être nulle au milieu des champs.
 *
 * Le recensement n'est pas annuel : ce chiffre reste celui de 2020 jusqu'au suivant.
 *
 * Le site d'Agreste ne présente pas toute sa chaîne de certificats : il manque
 * l'intermédiaire, qu'un navigateur va chercher tout seul à l'adresse que le
 * certificat indique. Node ne le fait pas. On fait comme le navigateur — on
 * télécharge cet intermédiaire, publié par l'autorité de certification, et on
 * l'ajoute aux autorités connues pour la durée du téléchargement. La
 * vérification n'est jamais désactivée : l'intermédiaire doit lui-même être
 * signé par une racine de confiance.
 *
 * Lancé seul — `tsx scripts/agriculture-emettre.ts` —, il réécrit les fichiers
 * `public/territoires/dep/XX-agriculture.json`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, ecrireParDepartement, telechargerSiAbsent } from './par-departement.ts';

export const FICHIER =
  'https://agreste.agriculture.gouv.fr/agreste-web/download/publication/publie/RA2020_1013/RA2020_1013_SAU_Communes.zip';
/** L'intermédiaire manquant, à l'adresse que donne le certificat d'Agreste (« CA Issuers »). */
export const INTERMEDIAIRE = 'http://crt.harica.gr/HARICA-GEANT-TLS-R1.cer';

/** SAU, céréales et oléoprotéagineux, prairies, cultures permanentes — en hectares. */
export type Surfaces = [number, number, number, number];

export interface Agriculture {
  maj: string;
  communes: Map<string, Surfaces>;
}

function pem(der: Buffer): string {
  const b64 = der.toString('base64').match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
}

/**
 * Télécharge `url` dans un processus à part, auquel on ajoute l'intermédiaire.
 * `NODE_EXTRA_CA_CERTS` n'est lu qu'au démarrage : d'où le processus.
 */
export async function telechargerAvecIntermediaire(url: string, vers: string): Promise<void> {
  const r = await fetch(INTERMEDIAIRE);
  if (!r.ok) throw new Error(`intermédiaire introuvable : ${r.status}`);
  const brut = Buffer.from(await r.arrayBuffer());
  const certificat = brut.toString('latin1').includes('BEGIN CERTIFICATE') ? brut.toString('latin1') : pem(brut);
  const dossier = mkdtempSync(join(tmpdir(), 'agreste-'));
  try {
    const deja = process.env.NODE_EXTRA_CA_CERTS && existsSync(process.env.NODE_EXTRA_CA_CERTS)
      ? readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')
      : '';
    const paquet = join(dossier, 'autorites.pem');
    writeFileSync(paquet, `${deja}\n${certificat}`);
    const script =
      'const [u, v] = process.argv.slice(1);' +
      'fetch(u).then(async (r) => { if (!r.ok) throw new Error(String(r.status));' +
      'require("node:fs").writeFileSync(v, Buffer.from(await r.arrayBuffer())); })' +
      '.catch((e) => { console.error(e.cause?.code ?? e.message); process.exit(1); });';
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_EXTRA_CA_CERTS: paquet };
    // Derrière un mandataire, Node ne le suit que si on le lui demande.
    if (process.env.HTTPS_PROXY || process.env.https_proxy) env.NODE_USE_ENV_PROXY = '1';
    const p = spawnSync(process.execPath, ['-e', script, url, vers], { env, encoding: 'utf8', timeout: 600_000 });
    if (p.status !== 0) throw new Error(`Agreste : ${(p.stderr ?? '').trim().split('\n').at(-1)}`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

export async function lireAgriculture(archive: string): Promise<Map<string, Surfaces>> {
  // Une archive qui contient un classeur OpenDocument.
  const ods = await new Promise<Buffer>((ok, ko) => {
    const p = spawn('unzip', ['-p', archive, '*.ods']);
    const morceaux: Buffer[] = [];
    p.stdout.on('data', (b: Buffer) => morceaux.push(b));
    p.on('error', () => ko(new Error('« unzip » est requis pour lire l’archive d’Agreste')));
    p.on('close', (c) => (c === 0 ? ok(Buffer.concat(morceaux)) : ko(new Error(`unzip a rendu ${c}`))));
  });
  const XLSX = await import('xlsx');
  const classeur = XLSX.read(ods);
  const feuille = classeur.SheetNames.find((n) => /Communes/i.test(n));
  if (!feuille) throw new Error('aucune feuille « …Communes » dans le classeur d’Agreste');
  const lignes = XLSX.utils.sheet_to_json<unknown[]>(classeur.Sheets[feuille], { header: 1, raw: true });
  const entetes = (lignes[0] as unknown[]).map((h) => String(h ?? '').trim());
  const col = (debut: string) => {
    const k = entetes.findIndex((h) => h.toLowerCase().startsWith(debut.toLowerCase()));
    if (k === -1) throw new Error(`colonne « ${debut} » absente du classeur d’Agreste`);
    return k;
  };
  const [cCode, cSau, cCer, cPra, cPerm] = [col('CODE_COM'), col('SAU'), col('Surfaces céréales'), col('Surfaces prairies'), col('Surfaces cultures')];
  const communes = new Map<string, Surfaces>();
  const ha = (x: unknown) => Math.round(Number(String(x ?? '').replace(',', '.')) || 0);
  for (const l of lignes.slice(1)) {
    const code = codeCommune(String(l[cCode] ?? ''));
    if (!/^\d[\dAB]\d{3}$/.test(code)) continue;
    // Une case vide est un secret statistique, pas un zéro.
    if (l[cSau] === undefined || l[cSau] === null || l[cSau] === '') continue;
    communes.set(code, [ha(l[cSau]), ha(l[cCer]), ha(l[cPra]), ha(l[cPerm])]);
  }
  return communes;
}

export async function collecterAgriculture(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  dire: (m: string) => void,
): Promise<Agriculture | null> {
  const vers = join(cache, 'agreste-ra2020-sau-communes.zip');
  try {
    await telecharger(FICHIER, vers);
  } catch (e) {
    dire(`Recensement agricole indisponible (${(e as Error).message}) : celui de l’ingestion précédente reste en place.`);
    return null;
  }
  const communes = await lireAgriculture(vers);
  if (communes.size < 25000) {
    dire(`Recensement agricole : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const sau = [...communes.values()].reduce((s, x) => s + x[0], 0);
  dire(
    `Recensement agricole 2020 : ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${(sau / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} millions d’hectares de SAU.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireAgriculture(sortie: string, a: Agriculture): number {
  return ecrireParDepartement(sortie, 'agriculture', a.communes, () => ({ maj: a.maj, recensement: 2020 }));
}

// Lancé seul : télécharge dans `.cache/` s'il n'y est pas, et réécrit les fichiers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const telecharger = async (url: string, vers: string) => {
    if (!existsSync(vers)) await telechargerAvecIntermediaire(url, vers);
  };
  const a = await collecterAgriculture(telecharger, cache, console.log);
  if (a) console.log(`${ecrireAgriculture(sortie, a)} départements écrits.`);
}
