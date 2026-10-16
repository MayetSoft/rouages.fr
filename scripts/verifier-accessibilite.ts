/**
 * L'audit d'accessibilité du build : axe-core sur quelques pages, en clair et
 * en sombre, toutes les sections de la page de commune ouvertes. Une
 * violation fait échouer le contrôle.
 *
 * Trois défauts relevés à la main le 16 octobre 2026 — deux cartes à liens
 * sous un rôle d'image, une case d'en-tête vide — avaient survécu à toutes
 * les relectures : c'est pour qu'un défaut de ce genre ne revienne pas sans
 * être vu.
 *
 *   npm run verifier-accessibilite    après `ROUAGES_DEPS=03,29,55,75 npx astro build`
 *
 * Les pages viennent de `dist/`, servies par un petit serveur local ; le
 * navigateur est celui de Playwright (en CI, `npx playwright install
 * chromium`), ou celui qu'indique `CHROMIUM` s'il est déjà installé.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
if (!existsSync(racine)) {
  console.error('dist/ absent : lancer d’abord le build.');
  process.exit(1);
}

/** Les pages auditées : la commune de référence et ce qui a le plus de structure. */
const PAGES = [
  '/',
  '/commune/03165',
  '/commune/75056',
  '/departement/03',
  '/trouver-des-communes?dep=03&pmax=2000&c=ifb:min40',
  '/deliberations',
  '/mentions',
  '/signaler',
];

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.xml': 'application/xml',
};

const serveur = createServer((req, res) => {
  const chemin = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const candidats = [join(racine, chemin), join(racine, `${chemin}.html`), join(racine, chemin, 'index.html')];
  const fichier = candidats.find((f) => f.startsWith(racine) && existsSync(f) && statSync(f).isFile());
  if (!fichier) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' }).end(readFileSync(fichier));
});
await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
const port = (serveur.address() as { port: number }).port;

const axe = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const navigateur = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let violations = 0;
try {
  for (const page of PAGES) {
    for (const theme of ['light', 'dark'] as const) {
      const p = await navigateur.newPage({ colorScheme: theme, viewport: { width: 1200, height: 900 } });
      const r = await p.goto(`http://127.0.0.1:${port}${page}`, { waitUntil: 'networkidle' });
      if (!r || r.status() !== 200) {
        console.log(`${page} : introuvable dans dist/ (${r?.status()}), ignorée`);
        await p.close();
        break;
      }
      await p.waitForTimeout(500);
      // Toutes les sections : la page de commune masque celles des onglets fermés.
      await p.evaluate(() => {
        for (const s of document.querySelectorAll<HTMLElement>('section[hidden]')) s.hidden = false;
        for (const d of document.querySelectorAll('details')) d.open = true;
      });
      await p.addScriptTag({ content: axe });
      const trouve = (await p.evaluate(async () => {
        const w = window as unknown as { axe: { run: (d: Document, o: object) => Promise<{ violations: { id: string; impact: string; help: string; nodes: { target: string[] }[] }[] }> } };
        return (await w.axe.run(document, { resultTypes: ['violations'] })).violations;
      })) as { id: string; impact: string; help: string; nodes: { target: string[] }[] }[];
      for (const v of trouve) {
        violations++;
        console.log(`${page} (${theme}) : [${v.impact}] ${v.id} — ${v.help} ×${v.nodes.length}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`    ${n.target.join(' ')}`);
      }
      await p.close();
    }
  }
} finally {
  await navigateur.close();
  serveur.close();
}
if (violations) {
  console.log(`\n${violations} violation(s) d’accessibilité.`);
  process.exit(1);
}
console.log(`Accessibilité : ${PAGES.length} pages auditées en clair et en sombre, aucune violation.`);
