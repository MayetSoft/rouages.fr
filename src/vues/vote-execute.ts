/**
 * Le voté face à l'exécuté, pour une ligne du budget de l'État : un « haltère »
 * par exercice. Le cercle creux est la loi de finances initiale, le point plein
 * l'exécution, le trait l'écart entre les deux ; la petite barre verticale, la
 * dernière loi rectificative quand l'année en a eu une. Une seule échelle, en
 * milliards d'euros, qui ne part pas de zéro : c'est l'écart qu'on lit, et sa
 * valeur est écrite en bout de ligne.
 *
 * Écrit en SVG au build, avec sa table : la page n'a rien à calculer.
 */
import type { LigneExecution } from '../modele/budget-etat.ts';

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (v: number, chiffres = 1) => `${(v / 1e9).toLocaleString('fr-FR', { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres })} Md€`;
const signe = (v: number, txt: string) => (v > 0 ? `+${txt}` : v < 0 ? `−${txt.replace('-', '')}` : txt);

/** Des graduations rondes, en milliards. */
function graduations(min: number, max: number): number[] {
  const etendue = (max - min) / 1e9;
  const pas = [1, 2, 5, 10, 20, 25, 50, 100].find((p) => etendue / p <= 6) ?? 200;
  const out: number[] = [];
  for (let v = Math.ceil(min / 1e9 / pas) * pas; v <= max / 1e9; v += pas) out.push(v * 1e9);
  return out;
}

export function voteExecute(l: LigneExecution, annees: number[]): { svg: string; tableau: string } | null {
  const lignes = annees
    .map((a) => ({ a, lfi: l.lfi[a] ?? null, lfr: l.lfr[a] ?? null, ex: l.execution[a] ?? null }))
    .filter((x) => x.lfi !== null && x.ex !== null);
  if (lignes.length < 2) return null;
  const valeurs = lignes.flatMap((x) => [x.lfi!, x.ex!, ...(x.lfr !== null ? [x.lfr] : [])]);
  let min = Math.min(...valeurs);
  let max = Math.max(...valeurs);
  const marge = (max - min) * 0.06 || Math.abs(max) * 0.1 || 1e9;
  min -= marge;
  max += marge;

  const L = 640;
  const gauche = 44;
  const droite = 470;
  const haut = 28;
  const pas = 26;
  const H = haut + lignes.length * pas + 6;
  const x = (v: number) => gauche + ((v - min) / (max - min)) * (droite - gauche);
  const ticks = graduations(min, max);

  const grille = ticks
    .map(
      (t) =>
        `<line class="ve-grille${t === 0 ? ' ve-zero' : ''}" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${haut - 6}" y2="${H - 4}"/>` +
        `<text class="ve-tick" x="${x(t).toFixed(1)}" y="${haut - 12}" text-anchor="middle">${(t / 1e9).toLocaleString('fr-FR')}</text>`,
    )
    .join('');
  const rangs = lignes
    .map((r, i) => {
      const y = haut + i * pas + pas / 2;
      const ecart = r.ex! - r.lfi!;
      const pct = r.lfi !== 0 ? (ecart / Math.abs(r.lfi!)) * 100 : 0;
      const titre =
        `${r.a} — voté (loi de finances initiale) : ${md(r.lfi!)}` +
        (r.lfr !== null ? ` · dernière loi rectificative : ${md(r.lfr)}` : '') +
        ` · exécuté : ${md(r.ex!)} · écart : ${signe(ecart, md(Math.abs(ecart)))} (${signe(pct, `${Math.abs(pct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`)})`;
      return (
        `<g class="ve-rang"><title>${echapper(titre)}</title>` +
        `<rect class="ve-cible" x="0" y="${y - pas / 2}" width="${L}" height="${pas}"/>` +
        `<text class="ve-annee" x="${gauche - 10}" y="${y + 4}" text-anchor="end">${r.a}</text>` +
        `<line class="ve-ecart" x1="${x(r.lfi!).toFixed(1)}" x2="${x(r.ex!).toFixed(1)}" y1="${y}" y2="${y}"/>` +
        (r.lfr !== null ? `<line class="ve-lfr" x1="${x(r.lfr).toFixed(1)}" x2="${x(r.lfr).toFixed(1)}" y1="${y - 6}" y2="${y + 6}"/>` : '') +
        `<circle class="ve-vote" cx="${x(r.lfi!).toFixed(1)}" cy="${y}" r="5"/>` +
        `<circle class="ve-execute" cx="${x(r.ex!).toFixed(1)}" cy="${y}" r="5"/>` +
        `<text class="ve-valeur" x="${droite + 18}" y="${y + 4}">${signe(ecart, md(Math.abs(ecart)))}<tspan class="ve-pct"> ${signe(pct, `${Math.abs(pct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`)}</tspan></text>` +
        `</g>`
      );
    })
    .join('');
  const svg =
    `<svg class="ve-svg" viewBox="0 0 ${L} ${H}" role="img" aria-label="${echapper(`${l.ligne} : voté et exécuté, de ${lignes[0].a} à ${lignes.at(-1)!.a}, en milliards d’euros`)}">` +
    `<text class="ve-tick" x="${droite + 18}" y="${haut - 12}">écart</text>` +
    grille +
    rangs +
    `</svg>`;

  const tableau =
    `<table class="rq-table"><thead><tr><th scope="col">Année</th><th scope="col" class="rq-nombre">Voté (LFI)</th>` +
    `<th scope="col" class="rq-nombre">Dernière loi rectificative</th><th scope="col" class="rq-nombre">Exécuté</th><th scope="col" class="rq-nombre">Écart</th></tr></thead><tbody>` +
    lignes
      .map((r) => {
        const ecart = r.ex! - r.lfi!;
        return `<tr><th scope="row">${r.a}</th><td class="rq-nombre">${md(r.lfi!, 2)}</td><td class="rq-nombre">${r.lfr !== null ? md(r.lfr, 2) : '—'}</td><td class="rq-nombre">${md(r.ex!, 2)}</td><td class="rq-nombre">${signe(ecart, md(Math.abs(ecart), 2))}</td></tr>`;
      })
      .join('') +
    `</tbody></table>`;
  return { svg, tableau };
}
