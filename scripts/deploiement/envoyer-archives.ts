/**
 * Envoyer les fichiers modifiés par archives, et les déballer sur le serveur.
 *
 * Le miroir FTP envoie un fichier par connexion de données. Trente-cinq mille
 * pages modifiées — il suffit d'un bloc de plus sur la page de commune —
 * prenaient trois heures et demie, et deux déploiements ont échoué sur un
 * seul fichier coupé en route. Ici, les fichiers partent par paquets de deux
 * mille dans des archives zip, et un script PHP les ouvre là-bas.
 *
 * Déroulé :
 *   1. les archives sont faites depuis le dossier d'envoi (les seuls fichiers
 *      modifiés, que le manifeste a désignés) ;
 *   2. elles partent en FTP avec `deballer.php`, sous des noms tirés au
 *      hasard — les archives commencent par un point, que le `.htaccess`
 *      refuse de servir ;
 *   3. le script est appelé en HTTPS, jeton à l'appui, par tranches ;
 *   4. tout est effacé, que cela ait réussi ou non.
 *
 * **Un échec n'est jamais grave** : le code de sortie non nul fait retomber le
 * déploiement sur le miroir fichier par fichier, qui renvoie ce qui manque.
 * Déballer deux fois le même fichier ne fait rien de mal.
 *
 * Codes de sortie : 0 fait ; 2 pas la peine (peu de fichiers, ou pas de
 * jeton) ; 1 échec.
 *
 * Variables : DEPLOI_JETON, SITE_URL, HOTE, UTILISATEUR, MOTDEPASSE, RACINE,
 * REGLAGES (les `set` de lftp). Argument : le dossier d'envoi.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Fichiers par archive : une vingtaine de mégaoctets compressés. */
const PAR_ARCHIVE = 2000;
/** En dessous, le miroir fait aussi bien, et sans script sur le serveur. */
const SEUIL = 300;

const env = (n: string, defaut?: string): string => {
  const v = process.env[n] ?? defaut;
  if (v === undefined || v === '') throw new Error(`variable ${n} manquante`);
  return v;
};

/** Une chaîne entre guillemets pour lftp. */
const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;

function lister(dossier: string): string[] {
  const out: string[] = [];
  const parcourir = (d: string) => {
    for (const nom of readdirSync(d)) {
      const p = join(d, nom);
      if (statSync(p).isDirectory()) parcourir(p);
      else out.push(relative(dossier, p).split(sep).join('/'));
    }
  };
  parcourir(dossier);
  return out.sort();
}

function executer(commande: string, args: string[], options: { cwd?: string; entree?: string } = {}): Promise<void> {
  return new Promise((ok, ko) => {
    const p = spawn(commande, args, { cwd: options.cwd, stdio: ['pipe', 'inherit', 'inherit'] });
    p.on('error', ko);
    p.on('close', (code) => (code === 0 ? ok() : ko(new Error(`${commande} a rendu ${code}`))));
    p.stdin.end(options.entree ?? '');
  });
}

/**
 * Une session lftp. Le script passe par un fichier lisible du seul
 * utilisateur, effacé aussitôt : il porte le mot de passe, qui ne doit
 * apparaître ni dans la liste des processus ni dans le journal.
 */
async function lftp(commandes: string[]): Promise<void> {
  const dossier = mkdtempSync(join(tmpdir(), 'rouages-lftp-'));
  const fichier = join(dossier, 'script.lftp');
  writeFileSync(
    fichier,
    `${env('REGLAGES', '')}\nopen -u ${q(env('UTILISATEUR'))},${q(env('MOTDEPASSE'))} ${q(env('HOTE'))}\n` +
      `cd ${q(env('RACINE', 'public_html'))}\n${commandes.join('\n')}\n`,
    { mode: 0o600 },
  );
  try {
    await executer('lftp', ['-f', fichier]);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/**
 * Ce qu'une réponse qui n'est pas du JSON dit d'elle-même. Les pages d'erreur
 * de Cloudflare commencent toutes par le même gabarit : les premiers octets
 * n'apprennent rien, le titre et l'identifiant de requête (`cf-ray`) disent
 * qui a répondu et quoi.
 */
export function resumer(r: { status: number; headers: Headers }, texte: string): string {
  const titre = /<title>([\s\S]*?)<\/title>/i.exec(texte)?.[1]?.replace(/\s+/g, ' ').trim();
  const morceaux = [
    String(r.status),
    `serveur ${r.headers.get('server') ?? '?'}`,
    r.headers.get('cf-ray') ? `cf-ray ${r.headers.get('cf-ray')}` : null,
    titre ? `« ${titre} »` : JSON.stringify(texte.slice(0, 200)),
  ];
  return morceaux.filter(Boolean).join(', ');
}

async function appeler(url: string, jeton: string, corps: Record<string, string>): Promise<Record<string, unknown>> {
  let derniere: unknown;
  for (let essai = 0; essai < 4; essai++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'X-Deploiement': jeton, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(corps),
        signal: AbortSignal.timeout(90_000),
      });
      const texte = await r.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(texte) as Record<string, unknown>;
      } catch {
        // Du PHP qui ne s'exécute pas se renvoie tel quel, avec un 200 :
        // inutile d'insister. Une page d'erreur de Cloudflare (52x) peut
        // tenir à un instant — le fichier tout juste déposé et encore
        // examiné par l'hébergeur : elle a droit aux essais suivants.
        throw Object.assign(new Error(`réponse non JSON (${resumer(r, texte)})`), { definitif: r.status < 500 });
      }
      if (!r.ok) throw Object.assign(new Error(`${r.status} : ${JSON.stringify(json)}`), { definitif: r.status < 500 });
      return json;
    } catch (e) {
      derniere = e;
      if ((e as { definitif?: boolean }).definitif || essai === 3) break;
      console.log(`Essai ${essai + 1} sur ${corps.action} : ${(e as Error).message}`);
      await new Promise((ok) => setTimeout(ok, 5000 * (essai + 1)));
    }
  }
  throw derniere;
}

/**
 * `sonde` : le script seul, appelé puis effacé, sans archive ni fichier du
 * site. C'est ce que lance le workflow « Sonder le déballage » : une minute
 * pour savoir si le serveur répond, au lieu d'un déploiement entier.
 */
export async function envoyerArchives(
  dossier: string | null,
  dire: (m: string) => void = console.log,
  { sonde = false }: { sonde?: boolean } = {},
): Promise<0 | 1 | 2> {
  const jeton = process.env.DEPLOI_JETON ?? '';
  const fichiers = dossier === null ? [] : lister(dossier);
  if (!jeton) {
    dire('Pas de jeton de déploiement : envoi fichier par fichier.');
    return 2;
  }
  if (!sonde && fichiers.length < SEUIL) {
    dire(`${fichiers.length} fichiers à envoyer : le miroir fait aussi bien.`);
    return 2;
  }

  const hasard = randomBytes(12).toString('hex');
  const prefixe = `.deploiement-${hasard}-`;
  const script = `deballer-${hasard}.php`;
  // Un témoin : le PHP le plus simple qui soit, déposé à côté. Le #101 a reçu
  // un 520 jusque sur la requête sans jeton — ce n'est donc pas le POST qu'on
  // arrête. Si le témoin répond et pas le script, c'est le script que
  // l'hébergeur bloque ; si aucun ne répond, c'est PHP.
  const temoin = `temoin-${hasard}.php`;
  const travail = mkdtempSync(join(tmpdir(), 'rouages-archives-'));
  const archives: string[] = [];
  const distants = [script, temoin];
  try {
    const modele = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'deballer.php'), 'utf8');
    writeFileSync(
      join(travail, script),
      modele
        .replace('__EMPREINTE__', createHash('sha256').update(jeton).digest('hex'))
        .replace('__PREFIXE__', prefixe),
    );
    writeFileSync(
      join(travail, temoin),
      "<?php\nheader('Content-Type: application/json');\necho json_encode(['temoin' => true, 'php' => PHP_VERSION]);\n",
    );
    for (let i = 0; !sonde && i * PAR_ARCHIVE < fichiers.length; i++) {
      const nom = `${i}.zip`;
      // -X sans attributs étendus, -D sans entrées de dossier : des chemins, rien d'autre.
      await executer('zip', ['-q', '-X', '-D', join(travail, prefixe + nom), '-@'], {
        cwd: dossier!,
        entree: fichiers.slice(i * PAR_ARCHIVE, (i + 1) * PAR_ARCHIVE).join('\n') + '\n',
      });
      archives.push(nom);
      distants.push(prefixe + nom);
    }
    if (!sonde) {
      const poids = archives.reduce((s, a) => s + statSync(join(travail, prefixe + a)).size, 0);
      dire(`${fichiers.length} fichiers en ${archives.length} archives, ${(poids / 1e6).toFixed(0)} Mo.`);
    }

    // Les archives d'abord, le script en dernier : il n'est appelable qu'une
    // fois tout arrivé.
    // Le 30 septembre, un test.php déposé à la main par le gestionnaire de
    // fichiers répondait, et le témoin déposé ici non (520), depuis la même
    // machine : ce qui les distingue, c'est le dépôt en FTP et l'appel aussitôt
    // après. La sonde relève donc les droits tels que déposés, réessaie après
    // une attente, puis après un chmod 644 ; le déploiement fait le chmod
    // d'emblée.
    const chmod = [`chmod 644 ${q(temoin)}`, `chmod 644 ${q(script)}`];
    await lftp([
      ...archives.map((a) => `put ${q(join(travail, prefixe + a))} -o ${q(prefixe + a)}`),
      `put ${q(join(travail, temoin))} -o ${q(temoin)}`,
      `put ${q(join(travail, script))} -o ${q(script)}`,
      ...(sonde ? [`cls -l ${q(temoin)} ${q(script)}`] : chmod),
    ]);

    const site = env('SITE_URL').replace(/\/$/, '');
    const voirTemoin = async (quand: string): Promise<boolean> => {
      try {
        const r = await fetch(`${site}/${temoin}`, { signal: AbortSignal.timeout(30_000) });
        dire(`Témoin PHP ${quand} : ${resumer(r, await r.text())}.`);
        return r.ok;
      } catch (e) {
        dire(`Témoin PHP ${quand} : ${(e as Error).message}.`);
        return false;
      }
    };
    if (!(await voirTemoin('aussitôt déposé')) && sonde) {
      await new Promise((ok) => setTimeout(ok, 30_000));
      if (!(await voirTemoin('trente secondes après'))) {
        await lftp([...chmod, `cls -l ${q(temoin)} ${q(script)}`]);
        await voirTemoin('après chmod 644');
      }
    }
    const url = `${site}/${script}`;
    // Une requête GET sans jeton d'abord, qui doit rendre le 403 du script :
    // si elle passe et que le POST échoue, c'est le POST qu'on arrête en
    // route (pare-feu de l'hébergeur ou de Cloudflare), pas PHP.
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      dire(`Sonde sans jeton : ${resumer(r, await r.text())}.`);
    } catch (e) {
      dire(`Sonde sans jeton : ${(e as Error).message}.`);
    }
    const ping = await appeler(url, jeton, { action: 'ping' });
    if (ping.ok !== true || ping.zip !== true) throw new Error(`le serveur ne sait pas déballer : ${JSON.stringify(ping)}`);
    dire(`Serveur prêt (PHP ${String(ping.php)}).`);
    if (sonde) return 0;

    for (const a of archives) {
      let debut = 0;
      for (;;) {
        const r = await appeler(url, jeton, { action: 'deballer', archive: a, debut: String(debut) });
        const fait = Number(r.fait);
        const total = Number(r.total);
        if (!Number.isFinite(fait) || fait <= debut) throw new Error(`déballage bloqué sur ${a} : ${JSON.stringify(r)}`);
        debut = fait;
        if (fait >= total) break;
      }
    }
    dire(`${archives.length} archives déballées.`);
    return 0;
  } catch (e) {
    dire(`Envoi par archives abandonné : ${(e as Error).message}`);
    return 1;
  } finally {
    // Le script et les archives ne restent jamais sur le serveur.
    try {
      await lftp(distants.map((d) => `rm -f ${q(d)}`));
    } catch (e) {
      dire(`::warning::nettoyage incomplet sur le serveur : ${(e as Error).message}`);
    }
    rmSync(travail, { recursive: true, force: true });
  }
}

// Le chemin réel des deux côtés : lancé par un lien symbolique, le script ne
// se reconnaîtrait pas, sortirait sans rien faire avec le code 0, et le
// déploiement croirait les archives déballées.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error('usage : envoyer-archives.ts <dossier d’envoi> | --sonde');
    process.exit(1);
  }
  process.exit(dossier === '--sonde' ? await envoyerArchives(null, console.log, { sonde: true }) : await envoyerArchives(dossier));
}
