/**
 * Les images d'aperçu des liens (`og:image`) : 1 200 × 630, une pour le site,
 * une pour la page des jeux, une par jeu. Elles vont dans `public/apercus/`
 * et sont versionnées : elles ne changent qu'avec le nom d'un jeu.
 *
 * Playwright n'est pas une dépendance du site ; pour les refaire :
 *   npm i --no-save playwright && node scripts/apercus.mjs
 * (dans l'environnement de développement, Chromium est déjà là :
 *  PLAYWRIGHT_BROWSERS_PATH le trouve.)
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SORTIE = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'apercus');

/** [fichier, surtitre, titre, phrase, cases] — les cases, comme celles qu'on partage. */
const IMAGES = [
  ['rouages', 'Rouages', 'Qui décide quoi, près de chez vous ?', 'L’école, l’eau, les routes, le permis de construire : quelle collectivité décide et paie, commune par commune.', []],
  ['jeux', 'Rouages · Jeux', 'Jouer avec les données publiques', 'Un défi par jour, le même pour tout le monde, sur les données de votre territoire.', ['vert', 'jaune', 'vert', 'orange', 'vert']],
  ['qui-decide', 'Rouages · Jeux', 'Qui décide ?', 'L’eau, les déchets, la mobilité : dans votre commune, qui s’en occupe ?', ['vert', 'vert', 'rouge', 'vert', 'vert']],
  ['commune-mystere', 'Rouages · Jeux', 'La commune mystère', 'Une commune se cache près de chez vous : six essais, la distance et la direction.', ['rouge', 'orange', 'jaune', 'vert']],
  ['plus-ou-moins', 'Rouages · Jeux', 'Plus ou moins', 'Deux communes face à face : laquelle a le plus d’habitants, la maison la plus chère ?', ['vert', 'rouge', 'vert', 'vert', 'vert', 'rouge', 'vert', 'vert']],
  ['prix', 'Rouages · Jeux', 'À combien s’est-elle vendue ?', 'Cinq vraies ventes de maisons et d’appartements : devinez le prix.', ['jaune', 'vert', 'orange', 'vert', 'rouge']],
  ['ordre', 'Rouages · Jeux', 'Le bon ordre', 'Les étapes d’une démarche publique, mélangées : remettez-les dans l’ordre.', ['vert', 'vert', 'jaune', 'jaune', 'orange']],
  ['argent', 'Rouages · Jeux', 'Où va l’argent ?', 'Cinq missions du budget de l’État, de la plus grosse à la plus petite.', ['vert', 'jaune', 'vert', 'rouge', 'vert']],
];
const COULEUR = { vert: '#2e9e5b', jaune: '#e6b422', orange: '#e8762c', rouge: '#cf3b2f' };

const page = (surtitre, titre, phrase, cases) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fbfaf8; color: #17171a; font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
         display: flex; flex-direction: column; justify-content: center; padding: 0 90px; border-top: 20px solid #1e5f74; }
  .sur { font-size: 34px; font-weight: 500; color: #5f5c55; margin-bottom: 26px; }
  h1 { font-size: 78px; line-height: 1.08; font-weight: 750; letter-spacing: -.01em; max-width: 1000px; }
  p { font-size: 34px; line-height: 1.35; color: #3f3d39; margin-top: 26px; max-width: 980px; }
  .cases { display: flex; gap: 16px; margin-top: 40px; }
  .cases span { width: 64px; height: 64px; border-radius: 12px; }
  .pied { position: absolute; right: 90px; bottom: 44px; font-size: 30px; font-weight: 600; color: #1e5f74; }
</style></head><body>
  <div class="sur">${surtitre}</div><h1>${titre}</h1><p>${phrase}</p>
  ${cases.length ? `<div class="cases">${cases.map((c) => `<span style="background:${COULEUR[c]}"></span>`).join('')}</div>` : ''}
  <div class="pied">rouages.fr</div>
</body></html>`;

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright est introuvable : npm i --no-save playwright');
  process.exit(1);
}
mkdirSync(SORTIE, { recursive: true });
const navigateur = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') } : {}).catch(() => chromium.launch());
const onglet = await navigateur.newPage({ viewport: { width: 1200, height: 630 } });
for (const [fichier, ...reste] of IMAGES) {
  await onglet.setContent(page(...reste));
  await onglet.screenshot({ path: join(SORTIE, `${fichier}.png`) });
  console.log(`apercus/${fichier}.png`);
}
await navigateur.close();
