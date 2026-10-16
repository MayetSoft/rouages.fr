/**
 * Devine la courbe, côté navigateur : la population d'une commune depuis
 * 1876, à tracer au doigt ou à la souris avant de voir la vraie.
 *
 * Le premier recensement est donné ; on trace la suite, de gauche à droite.
 * Puis la vraie courbe se dessine par-dessus, l'écart se colore, et le score
 * dit de combien on s'est trompé en moyenne. Une case par époque : 🟩 à 10 %
 * près, 🟨 à 20 %, 🟧 à 35 %, 🟥 au-delà.
 *
 * Au clavier : les flèches gauche et droite choisissent l'année, haut et bas
 * règlent la population — de 2 % de l'échelle, de 10 % avec Maj.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, feter, jourDeParis, memoire, type Case, type Resultat } from './jeux-commun.ts';

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
type Fichier = { annees: number[]; c: Record<string, [(number | null)[], number, number]> };

const L = 600;
const H = 340;
const M = { g: 52, d: 14, h: 14, b: 30 };
const NS = 'http://www.w3.org/2000/svg';
/** Les époques d'une case, par leurs années : chacune regroupe les recensements qu'elle contient. */
const EPOQUES: [string, number, number][] = [
  ['avant-guerre', 1877, 1945],
  ['l’après-guerre', 1946, 1979],
  ['les années 1980 et 1990', 1980, 1999],
  ['les années 2000 et 2010', 2000, 2017],
  ['aujourd’hui', 2018, 2100],
];

const nombre = (x: number) => Math.round(x).toLocaleString('fr-FR');
/** Une graduation lisible au-dessus de x : 1, 2 ou 5 fois une puissance de dix. */
function arrondiHaut(x: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, x)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

/** L'écart relatif moyen, de 0 (parfait) à 1 (plafonné), sur les années tracées. */
export function ecart(devine: number[], vrai: number[], indices: number[]): number {
  if (indices.length === 0) return 1;
  return indices.reduce((s, i) => s + Math.min(1, Math.abs(devine[i] - vrai[i]) / Math.max(1, vrai[i])), 0) / indices.length;
}

export const caseEcart = (e: number): Case => (e <= 0.1 ? 'vert' : e <= 0.2 ? 'jaune' : e <= 0.35 ? 'orange' : 'rouge');

export function brancherCourbe(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`jc-${id}`) as T;
  if (!$('zone')) return;
  brancherChampLieu('jc-lieu', LIEUX);
  const garde = memoire('rouages-jeu-courbe');
  const jour = jourDeParis();
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lieu: Lieu | null = null;
  let f: Fichier | null = null;
  let code = '';
  let nom = '';
  let vrai: number[] = [];
  let devine: (number | null)[] = [];
  let ymax = 1;
  let curseur = 1;
  let revele = false;
  let duJour = true;
  let anneeMax = 0;
  let max = 0;

  const indices = () => vrai.map((_, i) => i).filter((i) => i > 0 && vrai[i] != null);
  const x = (a: number) => M.g + ((a - f!.annees[0]) / (f!.annees.at(-1)! - f!.annees[0])) * (L - M.g - M.d);
  const y = (v: number) => H - M.b - (v / ymax) * (H - M.h - M.b);
  const valeurDe = (py: number) => Math.max(0, Math.min(ymax, ((H - M.b - py) / (H - M.h - M.b)) * ymax));

  const casesPar = (): Case[] =>
    EPOQUES.map(([, de, a]) => indices().filter((i) => f!.annees[i] >= de && f!.annees[i] <= a))
      .filter((l) => l.length > 0)
      .map((l) => caseEcart(ecart(devine as number[], vrai, l)));
  const points = () => Math.round(100 * (1 - ecart(devine as number[], vrai, indices())));
  const resultat = (): Resultat | null =>
    revele && lieu
      ? { jeu: 'Devine la courbe', embleme: '📈', lieu: nom, jour, cases: casesPar(), score: `${points()}/100`, adresse: `${location.origin}${location.pathname}?t=c-${code}` }
      : null;
  const remplirPartage = brancherPartage('jc', resultat, 'courbe');

  const message = (t: string) => {
    $('message').textContent = t;
    $('message').hidden = !t;
  };

  const el = (nomBalise: string, attributs: Record<string, string | number>, parent?: Element) => {
    const e = document.createElementNS(NS, nomBalise);
    for (const [k, v] of Object.entries(attributs)) e.setAttribute(k, String(v));
    parent?.append(e);
    return e;
  };
  const chemin = (valeurs: (number | null)[]) =>
    valeurs
      .map((v, i) => (v == null ? null : `${x(f!.annees[i]).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${p}`)
      .join('');

  const svg = el('svg', { viewBox: `0 0 ${L} ${H}`, class: 'jc-graphe', tabindex: 0, role: 'application' }) as SVGSVGElement;
  $('zone').append(svg);

  const dessiner = () => {
    svg.innerHTML = '';
    svg.setAttribute('aria-label', `Population ${aLieu(nom)} de ${f!.annees[0]} à ${f!.annees.at(-1)}. ${revele ? '' : `Année choisie : ${f!.annees[curseur]}, ${devine[curseur] != null ? `${nombre(devine[curseur]!)} habitants` : 'pas encore tracée'}.`}`);
    // La grille et les axes.
    const g = el('g', { class: 'jc-axes' }, svg);
    for (let k = 0; k <= 4; k++) {
      const v = (ymax * k) / 4;
      el('line', { x1: M.g, x2: L - M.d, y1: y(v), y2: y(v) }, g);
      el('text', { x: M.g - 6, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = nombre(v);
    }
    for (const a of [1876, 1900, 1925, 1950, 1975, 2000, 2023].filter((a) => a >= f!.annees[0] && a <= f!.annees.at(-1)!)) {
      el('text', { x: x(a), y: H - 10, 'text-anchor': 'middle' }, g).textContent = String(a);
    }
    // Les guerres, en bandes claires : elles expliquent souvent la pente.
    for (const [de, a] of [[1914, 1918], [1939, 1945]]) el('rect', { x: x(de), y: M.h, width: x(a) - x(de), height: H - M.h - M.b, class: 'jc-guerre' }, svg);
    // Les années à tracer, en pointillé.
    for (const i of indices()) el('line', { x1: x(f!.annees[i]), x2: x(f!.annees[i]), y1: M.h, y2: H - M.b, class: `jc-annee${i === curseur && !revele ? ' jc-annee--curseur' : ''}` }, svg);

    if (revele) {
      // L'écart, entre les deux courbes.
      const aller = vrai.map((v, i) => `${x(f!.annees[i])},${y(v)}`);
      const retour = (devine as number[]).map((v, i) => `${x(f!.annees[i])},${y(v)}`).reverse();
      el('polygon', { points: [...aller, ...retour].join(' '), class: 'jc-ecart' }, svg);
    }
    el('path', { d: chemin(devine), class: 'jc-devine' }, svg);
    for (const [i, v] of devine.entries()) if (v != null) el('circle', { cx: x(f!.annees[i]), cy: y(v), r: i === 0 ? 5 : 3.5, class: i === 0 ? 'jc-depart' : 'jc-point' }, svg);
    el('text', { x: x(f!.annees[0]) + 8, y: y(vrai[0]) - 8, class: 'jc-etiquette' }, svg).textContent = `${nombre(vrai[0])} en ${f!.annees[0]}`;

    if (revele) {
      const p = el('path', { d: chemin(vrai), class: 'jc-vrai' }, svg) as SVGPathElement;
      if (!calme) {
        const long = p.getTotalLength();
        p.style.strokeDasharray = `${long}`;
        p.style.strokeDashoffset = `${long}`;
        p.getBoundingClientRect();
        p.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.3,0,.2,1)';
        p.style.strokeDashoffset = '0';
      }
      const fin = vrai.length - 1;
      el('text', { x: x(f!.annees[fin]) - 4, y: y(vrai[fin]) - 10, class: 'jc-etiquette jc-etiquette--vrai', 'text-anchor': 'end' }, svg).textContent = `${nombre(vrai[fin])} en ${f!.annees[fin]}`;
    }
  };

  const complet = () => indices().every((i) => devine[i] != null);
  const majBouton = () => {
    $<HTMLButtonElement>('voir').disabled = !complet();
    const reste = indices().filter((i) => devine[i] == null).length;
    $('aide').textContent = reste ? `Encore ${reste} recensement${reste > 1 ? 's' : ''} à tracer, jusqu’en ${f!.annees.at(-1)}.` : 'La courbe est complète : vous pouvez encore la retoucher.';
  };

  // Le tracé : chaque année entre le dernier point touché et le doigt prend la hauteur du doigt, en ligne droite.
  let dernier: { i: number; v: number } | null = null;
  const versSvg = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * L, py: ((e.clientY - r.top) / r.height) * H };
  };
  const toucher = (e: PointerEvent) => {
    if (revele || !f) return;
    const { px, py } = versSvg(e);
    const v = valeurDe(py);
    const proche = indices().reduce((a, b) => (Math.abs(x(f!.annees[b]) - px) < Math.abs(x(f!.annees[a]) - px) ? b : a));
    if (dernier && dernier.i !== proche) {
      const [de, a] = dernier.i < proche ? [dernier.i, proche] : [proche, dernier.i];
      for (let k = de + 1; k < a; k++) if (k > 0) devine[k] = dernier.v + ((v - dernier.v) * (k - dernier.i)) / (proche - dernier.i);
    }
    devine[proche] = v;
    dernier = { i: proche, v };
    curseur = proche;
    dessiner();
    majBouton();
  };
  svg.addEventListener('pointerdown', (e) => {
    if (revele) return;
    svg.setPointerCapture(e.pointerId);
    dernier = null;
    toucher(e);
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.buttons & 1 || e.pointerType === 'touch') {
      if (svg.hasPointerCapture(e.pointerId)) toucher(e);
    }
  });
  svg.addEventListener('pointerup', () => (dernier = null));
  svg.addEventListener('keydown', (e) => {
    if (revele || !f) return;
    const pas = (e.shiftKey ? 0.1 : 0.02) * ymax;
    const ids = indices();
    const k = ids.indexOf(curseur);
    if (e.key === 'ArrowRight') curseur = ids[Math.min(ids.length - 1, k + 1)];
    else if (e.key === 'ArrowLeft') curseur = ids[Math.max(0, k - 1)];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const avant = devine[curseur] ?? devine[ids[k - 1] ?? 0] ?? vrai[0];
      devine[curseur] = Math.max(0, Math.min(ymax, avant + (e.key === 'ArrowUp' ? pas : -pas)));
    } else return;
    e.preventDefault();
    dessiner();
    majBouton();
  });

  const afficherFin = () => {
    revele = true;
    dessiner();
    const r = resultat()!;
    $('score').textContent = `${points()} points sur 100`;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    const fin = vrai.length - 1;
    const tendance = vrai[fin] < vrai[0] * 0.9 ? 'moins d’habitants qu’en' : vrai[fin] > vrai[0] * 1.1 ? 'plus d’habitants qu’en' : 'à peu près autant d’habitants qu’en';
    $('verdict').textContent =
      `${nom} compte aujourd’hui ${tendance} ${f!.annees[0]} : ${nombre(vrai[0])} habitants en ${f!.annees[0]}, ${nombre(vrai[fin])} en ${f!.annees[fin]}. ` +
      `Au plus haut, ${nombre(max)} en ${anneeMax}.`;
    const lien = $<HTMLAnchorElement>('lien');
    lien.href = `/commune/${code}`;
    lien.textContent = `La page ${aLieu(nom).replace(/^à /, 'de ').replace(/^au /, 'du ').replace(/^aux /, 'des ')}`;
    $('voir').hidden = true;
    $('effacer').hidden = true;
    $('aide').hidden = true;
    $('fin').hidden = false;
    $('partage').hidden = !duJour;
    if (duJour) {
      garde.ecrire(`${jour}:${code}`, devine);
      remplirPartage(r);
    } else if (points() >= 85) feter();
  };

  const commencer = (c: string, n: string, deja: (number | null)[] | null) => {
    code = c;
    nom = n;
    const [serie, aMax, vMax] = f!.c[c];
    vrai = serie.map((v, i) => v ?? serie[i - 1] ?? 0);
    anneeMax = aMax;
    max = vMax;
    // L'échelle laisse de la marge sans trahir la réponse : trois fois le départ, ou un peu plus que le maximum.
    ymax = arrondiHaut(Math.max(vrai[0] * 3, Math.max(...vrai) * 1.25));
    devine = vrai.map((v, i) => (i === 0 ? v : null));
    curseur = indices()[0];
    revele = false;
    $('titre').textContent = `${aLieu(nom).replace(/^./, (x) => x.toUpperCase())}, ${nombre(vrai[0])} habitants en ${f!.annees[0]}. Et ensuite ?`;
    $('compteur').textContent = duJour ? `Défi du jour · ${nom}` : `Partie libre · ${nom}`;
    $('voir').hidden = false;
    $('effacer').hidden = false;
    $('aide').hidden = false;
    $('fin').hidden = true;
    $('manche').hidden = false;
    if (deja && deja.length === vrai.length && deja.every((v) => v != null)) {
      devine = deja;
      afficherFin();
      return;
    }
    dessiner();
    majBouton();
  };

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return message('Cherchez votre commune par son nom ou son code postal.');
    garde.ecrire('lieu', lieu.cle);
    retenirLieu(lieu.cle);
    try {
      const r = await fetch(`/jeux/courbes/${lieu.deps[0]}.json`);
      if (!r.ok) throw new Error(String(r.status));
      f = (await r.json()) as Fichier;
    } catch {
      return message('Les recensements n’ont pas pu être lus. Réessayez dans un instant.');
    }
    const c = lieu.cle.slice(2);
    if (!f.c[c]) return message(`L’INSEE ne publie pas de série complète pour ${lieu.nom} : essayez une commune voisine.`);
    message('');
    duJour = true;
    commencer(c, lieu.nom, garde.lire<(number | null)[]>(`${jour}:${c}`));
  };

  $('voir').addEventListener('click', () => complet() && afficherFin());
  $('effacer').addEventListener('click', () => {
    if (revele) return;
    devine = vrai.map((v, i) => (i === 0 ? v : null));
    dessiner();
    majBouton();
  });
  $('hasard').addEventListener('click', async () => {
    if (!f) return;
    // Une autre commune du département, au hasard, en partie libre : de quoi comparer.
    const codes = Object.keys(f.c).filter((c) => c !== code);
    const c = codes[Math.floor(Math.random() * codes.length)];
    const n = (await resoudre(`c-${c}`, LIEUX).catch(() => null))?.nom ?? c;
    duJour = false;
    commencer(c, n, null);
  });
  quandLieu(LIEUX, garde.lire<string>('lieu'), (cle) => void preparer(cle));
}
