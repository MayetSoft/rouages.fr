/**
 * Les cartes des départements, côté navigateur : une bataille en cinq
 * manches contre l'ordinateur, comme au jeu des sept familles des chiffres.
 *
 * Chaque manche, vous voyez votre carte — sa silhouette, ses huit chiffres —
 * et choisissez le chiffre qui, selon vous, battra la carte cachée d'en face.
 * Elle se retourne : le plus grand gagne. Les cartes vues entrent dans votre
 * collection, gardée dans le navigateur.
 */
import { brancherPartage, EMOJI, feter, hasard, jourDuJeu, melanger, memoire, type Case, type Resultat } from './jeux-commun.ts';

type Fichier = { millesime: string | null; i: [string, string, string, string][]; d: Record<string, [string, string, number[][], (number | null)[]]> };
const MANCHES = 5;
const NS = 'http://www.w3.org/2000/svg';

const decoder = (r: number[]): [number, number][] => {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let k = 0; k + 1 < r.length; k += 2) {
    x += r[k];
    y += r[k + 1];
    out.push([x / 10_000, y / 10_000]);
  }
  return out;
};

/** La silhouette d'un département, seule, à sa taille. */
function silhouette(contour: number[][], classe: string): SVGSVGElement {
  const anneaux = contour.map(decoder);
  const pts = anneaux.flat();
  const lat = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length);
  const k = Math.cos((lat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', anneaux.map((r) => `M${r.map(([x, y]) => `${(x * k).toFixed(4)},${(-y).toFixed(4)}`).join('L')}Z`).join(''));
  p.setAttribute('class', classe);
  p.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(p);
  return svg;
}

const format = (v: number | null, unite: string): string => {
  if (v == null) return '—';
  const n = v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/ /g, ' ');
  return unite ? `${n}\u00a0${unite}` : n;
};
const signe = (k: string, v: number | null, unite: string) => (k === 'evolution' && v != null && v > 0 ? `+${format(v, unite)}` : format(v, unite));

export function brancherCartes(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`jt-${id}`) as T;
  if (!$('table')) return;
  const garde = memoire('rouages-jeu-cartes');
  const jour = jourDuJeu();
  let f: Fichier | null = null;
  let miennes: string[] = [];
  let siennes: string[] = [];
  let manche = 0;
  let cases: Case[] = [];
  let duJour = true;
  let choix: number[] = [];

  const collection = () => new Set(garde.lire<string[]>('collection') ?? []);
  const collectionner = (deps: string[]) => garde.ecrire('collection', [...new Set([...collection(), ...deps])]);
  const resultat = (): Resultat | null =>
    cases.length === MANCHES ? { jeu: 'Les cartes des départements', embleme: '🃏', lieu: null, jour, cases, score: `${cases.filter((c) => c === 'vert').length}/${MANCHES}`, adresse: `${location.origin}${location.pathname}` } : null;
  const remplirPartage = brancherPartage('jt', resultat, 'cartes');

  const carteEl = (dep: string, cachee: boolean, jouable: boolean): HTMLElement => {
    const [nom, , contour, valeurs] = f!.d[dep];
    const c = Object.assign(document.createElement('div'), { className: `jt-carte${cachee ? ' jt-carte--cachee' : ''}` });
    const dos = Object.assign(document.createElement('div'), { className: 'jt-dos', textContent: '🃏' });
    const face = Object.assign(document.createElement('div'), { className: 'jt-face' });
    const tete = Object.assign(document.createElement('div'), { className: 'jt-tete' });
    tete.append(Object.assign(document.createElement('strong'), { textContent: nom }), Object.assign(document.createElement('span'), { textContent: dep }));
    const forme = Object.assign(document.createElement('div'), { className: 'jt-forme' });
    forme.append(silhouette(contour, 'jt-chemin'));
    const ul = Object.assign(document.createElement('ul'), { className: 'jt-chiffres' });
    f!.i.forEach(([k, libelle, unite], n) => {
      const li = document.createElement('li');
      li.dataset.n = String(n);
      const contenu: (string | Node)[] = [Object.assign(document.createElement('span'), { textContent: libelle }), Object.assign(document.createElement('strong'), { textContent: signe(k, valeurs[n], unite) })];
      if (jouable) {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'jt-choix' });
        b.disabled = valeurs[n] == null;
        b.setAttribute('aria-label', `Jouer ${libelle} : ${signe(k, valeurs[n], unite)}`);
        b.append(...contenu);
        b.addEventListener('click', () => jouer(n));
        li.append(b);
      } else li.append(...contenu);
      ul.append(li);
    });
    face.append(tete, forme, ul);
    c.append(face, dos);
    return c;
  };

  const afficherManche = () => {
    $('compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · manche ${manche + 1} sur ${MANCHES}`;
    $('marque').textContent = cases.map((c) => EMOJI[c]).join('') || '·';
    const t = $('table');
    t.innerHTML = '';
    t.append(carteEl(miennes[manche], false, true), carteEl(siennes[manche], true, false));
    $('verdict').textContent = 'Choisissez le chiffre de votre carte qui battra celle d’en face.';
    $('suivante').hidden = true;
    (t.querySelector('.jt-choix:not([disabled])') as HTMLElement | null)?.focus();
  };

  const jouer = (n: number) => {
    if (cases.length > manche) return;
    const [, , , a] = f!.d[miennes[manche]];
    const [, articleB, , b] = f!.d[siennes[manche]];
    const va = a[n] ?? -Infinity;
    const vb = b[n] ?? -Infinity;
    const issue: Case = va > vb ? 'vert' : va < vb ? 'rouge' : 'jaune';
    cases.push(issue);
    choix.push(n);
    const t = $('table');
    t.querySelectorAll('.jt-choix').forEach((x) => ((x as HTMLButtonElement).disabled = true));
    t.querySelectorAll(`li[data-n="${n}"]`).forEach((li) => li.classList.add('jt-joue'));
    const adverse = t.querySelector('.jt-carte--cachee');
    adverse?.classList.remove('jt-carte--cachee');
    adverse?.classList.add('jt-carte--retournee');
    t.firstElementChild?.classList.add(issue === 'vert' ? 'jt-gagne' : issue === 'rouge' ? 'jt-perd' : 'jt-egal');
    adverse?.classList.add(issue === 'rouge' ? 'jt-gagne' : issue === 'vert' ? 'jt-perd' : 'jt-egal');
    const [k, libelle, unite] = f!.i[n];
    $('verdict').textContent =
      issue === 'vert'
        ? `Gagné : ${libelle.toLowerCase()}, ${signe(k, a[n], unite)} contre ${signe(k, b[n], unite)} pour ${articleB}.`
        : issue === 'rouge'
          ? `Perdu : ${articleB.replace(/^./, (x) => x.toUpperCase())} fait mieux, ${signe(k, b[n], unite)} contre ${signe(k, a[n], unite)}.`
          : `Égalité : ${signe(k, a[n], unite)} partout.`;
    $('marque').textContent = cases.map((c) => EMOJI[c]).join('');
    collectionner([miennes[manche], siennes[manche]]);
    afficherCollection();
    if (duJour) garde.ecrire(jour, choix);
    const s = $<HTMLButtonElement>('suivante');
    s.textContent = manche + 1 < MANCHES ? 'Manche suivante' : 'Voir le résultat';
    s.hidden = false;
    s.focus();
  };

  const afficherCollection = () => {
    const vues = collection();
    const deps = Object.keys(f!.d).sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
    $('collection-compte').textContent = `${[...vues].filter((d) => f!.d[d]).length} sur ${deps.length}`;
    const g = $('collection');
    g.innerHTML = '';
    for (const d of deps) {
      const li = document.createElement('li');
      li.className = vues.has(d) ? 'vue' : '';
      li.title = vues.has(d) ? `${f!.d[d][0]} (${d})` : `${d} : pas encore vue`;
      li.append(silhouette(f!.d[d][2], 'jt-mini'), Object.assign(document.createElement('span'), { textContent: d }));
      g.append(li);
    }
  };

  const afficherFin = () => {
    const r = resultat()!;
    $('manche').hidden = true;
    $('fin').hidden = false;
    $('score').textContent = r.score;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    else if (r.cases.filter((c) => c === 'vert').length >= 4) feter();
    afficherCollection();
  };

  const distribuer = (modeDuJour: boolean) => {
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${jour}:cartes`) : Math.random;
    const paquet = melanger(Object.keys(f!.d), alea);
    miennes = paquet.slice(0, MANCHES);
    siennes = paquet.slice(MANCHES, 2 * MANCHES);
    manche = 0;
    cases = [];
    choix = [];
    $('debut').hidden = true;
    $('fin').hidden = true;
    $('manche').hidden = false;
    const deja = duJour ? garde.lire<number[]>(jour) : null;
    if (deja?.length) {
      // Une partie du jour commencée : on la rejoue telle quelle jusqu'où elle était.
      for (const n of deja) {
        afficherManche();
        jouer(n);
        if (manche + 1 >= MANCHES) return afficherFin();
        manche++;
      }
    }
    afficherManche();
  };

  $('suivante').addEventListener('click', () => {
    if (manche + 1 >= MANCHES) return afficherFin();
    manche++;
    afficherManche();
  });
  $('jouer').addEventListener('click', () => distribuer(true));
  $('libre').addEventListener('click', () => distribuer(false));
  void (async () => {
    try {
      const r = await fetch('/jeux/cartes.json');
      f = (await r.json()) as Fichier;
    } catch {
      $('debut').textContent = 'Les cartes n’ont pas pu être lues. Réessayez dans un instant.';
      return;
    }
    $<HTMLButtonElement>('jouer').disabled = false;
    $<HTMLButtonElement>('jouer').textContent = garde.lire(jour) ? 'Reprendre la partie du jour' : 'Distribuer les cartes du jour';
    afficherCollection();
    $('collection-boite').hidden = false;
  })();
}
