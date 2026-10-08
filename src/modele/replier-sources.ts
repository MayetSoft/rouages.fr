/**
 * Replier les sources et les réserves de chaque bloc dans un encadré
 * « Sources » — d'abord appelé « Sources et méthode » : le titre revenait
 * soixante-dix fois sur la page d'une commune, l'icône dit le reste.
 *
 * Les blocs disent d'où vient chaque chiffre et ce qu'il ne dit pas — c'est
 * ce qui les rend fiables, et c'est aussi ce qui faisait de la page de commune
 * un mur de texte. Ces paragraphes portent tous l'une des deux classes
 * `p-strate` (la lecture, les réserves) ou `p-source-territoire` (la source).
 * Une suite de tels paragraphes, où qu'elle soit, devient un `<details>`
 * replié, fermé par défaut, qui ajoute les liens vers les fichiers — et,
 * quand l'ingestion les a notées, la date où chacun a été récupéré et celle
 * de la version lue.
 *
 * Fait sur le HTML produit plutôt que dans chacun des cinquante composants :
 * ces paragraphes y sont le plus souvent conditionnels, et un oubli laisserait
 * un bloc déplié parmi des blocs repliés. Un composant qui en ajoute un
 * nouveau est replié sans rien faire.
 */
import { national } from './fiche-commune.ts';
import { liensDesSources } from './sources-donnees.ts';

/** Écrit par l'ingestion (`scripts/provenance.ts`) : récupéré le, version du. */
const provenance = national<Record<string, { r: string; v?: string }>>('provenance.json');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const jour = (iso: string) => {
  const [a, m, j] = iso.split('-').map(Number);
  return `${j === 1 ? '1er' : j}\u00a0${MOIS[m - 1]}\u00a0${a}`;
};
/** « récupéré le 7 octobre 2026, version du 12 septembre 2026 », ou rien quand on ne sait pas. */
function dates(url: string): string {
  const p = provenance()?.[url];
  if (!p) return '';
  return `<span class="sm-dates">récupéré le ${jour(p.r)}${p.v ? `, version du ${jour(p.v)}` : ''}</span>`;
}

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
          .map((l) => `<li><a href="${echapper(l.url)}" rel="noopener" target="_blank">${echapper(l.titre)}</a>${dates(l.url)}</li>`)
          .join('') +
        '</ul>'
      : '';
    return (
      `<details class="sm"><summary>${ICONE}<span>Sources</span></summary>` +
      `<div class="sm-corps">${suite.trim()}${liste}</div></details>`
    );
  });
}
