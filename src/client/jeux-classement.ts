/**
 * Les jeux de classement : remettre une liste dans l'ordre juste, en trois
 * essais. « Le bon ordre » (les étapes d'une démarche) et « Où va l'argent »
 * (les missions du budget de l'État) en sont deux réglages.
 *
 * Les éléments se glissent-déposent, à la souris n'importe où sur la ligne,
 * au doigt par la poignée — la ligne entière bloquerait le défilement de la
 * page. Les flèches restent pour le clavier et les lecteurs d'écran. Un
 * élément bien placé se fige ; les autres passent par-dessus.
 *
 * Le balisage attendu, préfixé : `-compteur`, `-nom`, `-liste`, `-valider`,
 * `-verdict`, `-contexte`, `-fin`, `-score`, `-cases`, `-libre`, et le bloc
 * de `PartageJeu.astro`.
 */
import { brancherPartage, type CleJeu, EMOJI, hasard, jourDeParis, melanger, memoire, type Case, type Resultat } from './jeux-commun.ts';

export interface Element {
  texte: string;
  /** Une ligne sous le texte : qui agit, « si besoin »… */
  precision?: string;
  /** Ce qu'on découvre à la fin : le montant d'une mission. */
  reponse?: string;
}

export interface Partie {
  titre: string;
  /** Les éléments dans l'ordre juste. */
  elements: Element[];
  /** La phrase et le lien qui suivent la réponse. */
  apres: (contexte: HTMLElement) => void;
}

export interface Reglage {
  prefixe: string;
  /** La clé de l'historique : `ordre`, `argent`. */
  cle: CleJeu;
  jeu: string;
  embleme: string;
  /** Le préfixe de la mémoire du navigateur. */
  memoire: string;
  tirer: (alea: () => number) => Partie;
  /** « étape », « mission » : pour le verdict. */
  mot: string;
}

const ESSAIS = 3;
const CASES: Case[] = ['vert', 'jaune', 'orange'];

export function brancherClassement(r: Reglage): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`${r.prefixe}-${id}`) as T;
  const liste = $<HTMLOListElement>('liste');
  if (!liste) return;
  const garde = memoire(r.memoire);
  const jour = jourDeParis();
  const valider = $<HTMLButtonElement>('valider');
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  let partie: Partie;
  /** ordre[k] : l'indice (dans l'ordre juste) de l'élément affiché en position k. */
  let ordre: number[] = [];
  /** trouve[i] : l'essai où l'élément i a été placé, 0 si jamais. */
  let trouve: number[] = [];
  let essai = 0;
  let duJour = true;

  const resultat = (): Resultat => {
    const n = trouve.filter((t) => t > 0).length;
    return {
      jeu: r.jeu,
      embleme: r.embleme,
      lieu: null,
      jour,
      cases: trouve.map((t) => (t > 0 ? CASES[t - 1] : 'rouge')),
      score: n === trouve.length ? `${n}/${n} en ${pluriel(essai, 'essai')}` : `${n}/${trouve.length}`,
      adresse: `${location.origin}${location.pathname}`,
    };
  };
  const remplirPartage = brancherPartage(r.prefixe, resultat, r.cle);

  const fige = (k: number) => trouve[ordre[k]] > 0;
  const peutAller = (k: number, sens: -1 | 1) => {
    for (let j = k + sens; j >= 0 && j < ordre.length; j += sens) if (!fige(j)) return true;
    return false;
  };
  const deplacer = (k: number, sens: -1 | 1) => {
    let j = k + sens;
    while (j >= 0 && j < ordre.length && fige(j)) j += sens;
    if (j < 0 || j >= ordre.length) return;
    [ordre[k], ordre[j]] = [ordre[j], ordre[k]];
    dessiner();
    (liste.children[j]?.querySelector(`button[data-sens="${sens}"]`) as HTMLButtonElement | null)?.focus();
  };

  /**
   * Déplace l'élément de la position `de` à la position `vers`, en ne
   * faisant glisser que les positions libres : les éléments figés restent où
   * ils sont.
   */
  const inserer = (de: number, vers: number) => {
    const libres = ordre.map((_, k) => k).filter((k) => !fige(k));
    const a = libres.indexOf(de);
    const b = libres.indexOf(vers);
    if (a < 0 || b < 0 || a === b) return false;
    const suite = libres.map((k) => ordre[k]);
    const [x] = suite.splice(a, 1);
    suite.splice(b, 0, x);
    libres.forEach((k, n) => (ordre[k] = suite[n]));
    return true;
  };

  let termine = false;
  const dessiner = (fini = false) => {
    termine = fini;
    liste.innerHTML = '';
    for (const [k, i] of ordre.entries()) {
      const e = partie.elements[i];
      const li = document.createElement('li');
      li.dataset.k = String(k);
      if (!fini && !fige(k)) {
        li.classList.add('mobile');
        li.append(Object.assign(document.createElement('span'), { className: 'cl-poignee', textContent: '⠿', title: 'Glisser pour déplacer' }));
      } else li.append(Object.assign(document.createElement('span'), { className: 'cl-poignee vide' }));
      // `nouveau` : trouvé à cet essai — seul celui-là s'anime.
      if (fige(k)) li.classList.add('juste', ...(trouve[i] === essai ? ['nouveau'] : []));
      else if (fini) li.classList.add('faux');
      const texte = document.createElement('span');
      texte.className = 'cl-texte';
      texte.textContent = e.texte;
      const precision = [e.precision, fini ? e.reponse : ''].filter(Boolean).join(' · ');
      if (precision) texte.append(Object.assign(document.createElement('small'), { textContent: precision }));
      const fleches = document.createElement('span');
      fleches.className = 'cl-fleches';
      for (const [sens, signe, nom] of [[-1, '↑', 'Monter'], [1, '↓', 'Descendre']] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = signe;
        b.dataset.sens = String(sens);
        b.setAttribute('aria-label', `${nom} : ${e.texte}`);
        b.disabled = fini || fige(k) || !peutAller(k, sens);
        b.addEventListener('click', () => deplacer(k, sens));
        fleches.append(b);
      }
      li.append(texte, fleches);
      liste.append(li);
    }
  };

  // Le glisser-déposer, aux événements de pointeur : souris, doigt et stylet
  // par le même chemin. La ligne suit le pointeur ; un trait marque où elle
  // tombera ; au lâcher, l'ordre change et la liste se redessine.
  let glisse: { li: HTMLLIElement; k: number; y0: number; pointeur: number } | null = null;
  let cible: number | null = null;
  const marquerCible = (k: number | null, avant = true) => {
    for (const li of liste.querySelectorAll('li')) li.classList.remove('cible-avant', 'cible-apres');
    cible = k;
    if (k !== null) liste.querySelector(`li[data-k="${k}"]`)?.classList.add(avant ? 'cible-avant' : 'cible-apres');
  };
  liste.addEventListener('pointerdown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li.mobile');
    if (!li || termine || (e.target as HTMLElement).closest('button')) return;
    // Au doigt, seule la poignée prend la ligne : ailleurs, on fait défiler la page.
    if (e.pointerType !== 'mouse' && !(e.target as HTMLElement).closest('.cl-poignee')) return;
    e.preventDefault();
    glisse = { li, k: Number(li.dataset.k), y0: e.clientY, pointeur: e.pointerId };
    try {
      li.setPointerCapture(e.pointerId);
    } catch {
      /* sans capture, le glissé marche tant que le pointeur reste sur la liste */
    }
    li.classList.add('glisse');
  });
  liste.addEventListener('pointermove', (e) => {
    if (!glisse || e.pointerId !== glisse.pointeur) return;
    glisse.li.style.transform = `translateY(${e.clientY - glisse.y0}px)`;
    // La position libre la plus proche du pointeur.
    let mieux: { k: number; avant: boolean; d: number } | null = null;
    for (const autre of liste.querySelectorAll<HTMLLIElement>('li.mobile')) {
      const k = Number(autre.dataset.k);
      if (autre === glisse.li) continue;
      const r = autre.getBoundingClientRect();
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      if (!mieux || d < mieux.d) mieux = { k, avant: k < glisse.k, d };
    }
    const r = glisse.li.getBoundingClientRect();
    // Tant que la ligne n'a pas quitté sa place, elle ne vise rien.
    if (mieux && Math.abs(e.clientY - glisse.y0) > r.height / 2) marquerCible(mieux.k, mieux.avant);
    else marquerCible(null);
  });
  const lacher = (e: PointerEvent) => {
    if (!glisse || e.pointerId !== glisse.pointeur) return;
    const { k } = glisse;
    glisse.li.classList.remove('glisse');
    glisse.li.style.transform = '';
    glisse = null;
    const vers = cible;
    marquerCible(null);
    if (vers !== null && inserer(k, vers)) {
      dessiner();
      liste.querySelector<HTMLLIElement>(`li[data-k="${vers}"]`)?.classList.add('pose');
    }
  };
  liste.addEventListener('pointerup', lacher);
  liste.addEventListener('pointercancel', lacher);

  const terminer = () => {
    // La réponse : l'ordre juste, ce qu'on avait trouvé en vert.
    ordre = partie.elements.map((_, i) => i);
    dessiner(true);
    const res = resultat();
    const n = trouve.filter((t) => t > 0).length;
    $('verdict').textContent =
      n === trouve.length
        ? `Dans l’ordre, en ${pluriel(essai, 'essai')}.`
        : `${pluriel(n, r.mot)} sur ${trouve.length} à leur place. Voici l’ordre juste.`;
    $('verdict').hidden = false;
    const contexte = $('contexte');
    contexte.textContent = '';
    partie.apres(contexte);
    contexte.hidden = false;
    valider.hidden = true;
    $('score').textContent = res.score;
    $('cases').textContent = res.cases.map((c) => EMOJI[c]).join('');
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(res);
    $('fin').hidden = false;
  };

  const commencer = (modeDuJour: boolean) => {
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${jour}:${r.memoire}`) : Math.random;
    partie = r.tirer(alea);
    const n = partie.elements.length;
    ordre = melanger(partie.elements.map((_, i) => i), alea);
    // Un mélange qui tomberait juste ne serait pas un jeu.
    if (ordre.every((i, k) => i === k)) ordre.push(ordre.shift()!);
    trouve = new Array(n).fill(0);
    essai = 0;
    $('compteur').textContent = duJour ? 'Défi du jour' : 'Partie libre';
    $('nom').textContent = partie.titre;
    $('verdict').hidden = true;
    $('contexte').hidden = true;
    $('fin').hidden = true;
    valider.hidden = false;
    valider.textContent = 'Valider cet ordre';
    const deja = duJour ? garde.lire<{ trouve: number[]; essai: number }>(jour) : null;
    if (deja && deja.trouve.length === n) {
      trouve = deja.trouve;
      essai = deja.essai;
      terminer();
      return;
    }
    dessiner();
  };

  valider.addEventListener('click', () => {
    essai++;
    for (const [k, i] of ordre.entries()) if (i === k && trouve[i] === 0) trouve[i] = essai;
    if (trouve.every((t) => t > 0) || essai >= ESSAIS) {
      if (duJour) garde.ecrire(jour, { trouve, essai });
      terminer();
      return;
    }
    dessiner();
    const reste = ESSAIS - essai;
    valider.textContent = `Valider cet ordre (encore ${pluriel(reste, 'essai')})`;
  });
  $('libre').addEventListener('click', () => commencer(false));
  commencer(true);
}
