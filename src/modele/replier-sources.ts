/**
 * Replier les sources et les réserves de chaque bloc dans un encadré
 * « Sources et méthode ».
 *
 * Les blocs disent d'où vient chaque chiffre et ce qu'il ne dit pas — c'est
 * ce qui les rend fiables, et c'est aussi ce qui faisait de la page de commune
 * un mur de texte. Ces paragraphes portent tous l'une des deux classes
 * `p-strate` (la lecture, les réserves) ou `p-source-territoire` (la source).
 * Une suite de tels paragraphes, où qu'elle soit, devient un `<details>`
 * replié, fermé par défaut, qui ajoute les liens vers les fichiers.
 *
 * Fait sur le HTML produit plutôt que dans chacun des cinquante composants :
 * ces paragraphes y sont le plus souvent conditionnels, et un oubli laisserait
 * un bloc déplié parmi des blocs repliés. Un composant qui en ajoute un
 * nouveau est replié sans rien faire.
 */
import { liensDesSources } from './sources-donnees.ts';

const SUITE = /(?:<p class="p-(?:strate|source-territoire)"[^>]*>[\s\S]*?<\/p>\s*)+/g;
const SOURCE = /<p class="p-source-territoire"[^>]*>([\s\S]*?)<\/p>/g;

const ICONE =
  '<svg class="sm-icone" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
  '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
  '<path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ');

export function replierSources(html: string): string {
  if (!html.includes('p-strate') && !html.includes('p-source-territoire')) return html;
  return html.replace(SUITE, (suite) => {
    // Les sources se reconnaissent dans les paragraphes qui les citent : une
    // réserve qui parle de décès ou de dotations ne doit pas appeler un lien.
    const sources = [...suite.matchAll(SOURCE)].map((m) => texte(m[1])).join(' ');
    const liens = sources ? liensDesSources(sources) : [];
    const liste = liens.length
      ? '<ul class="sm-liens">' +
        liens
          .map((l) => `<li><a href="${echapper(l.url)}" rel="noopener" target="_blank">${echapper(l.titre)}</a></li>`)
          .join('') +
        '</ul>'
      : '';
    return (
      `<details class="sm"><summary>${ICONE}<span>Sources et méthode</span></summary>` +
      `<div class="sm-corps">${suite.trim()}${liste}</div></details>`
    );
  });
}
