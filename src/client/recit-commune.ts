/**
 * « Ta commune en 30 secondes » : une suite de cartes animées, une par
 * chiffre de la page de la commune, comme les récits des réseaux sociaux.
 *
 * Deux façons de la lire :
 * - **le récit**, sur la page de la commune : les cartes défilent seules,
 *   environ trente secondes, et la dernière se partage en image ;
 * - **le jeu** (`/jeux/en-30-secondes`) : chaque carte pose d'abord une
 *   question, puis montre la réponse ; une case par question.
 *
 * Tous les chiffres viennent des fichiers des jeux, qui reprennent ceux de la
 * page : `/jeux/communes`, `/jeux/courbes`, `/jeux/budget`, `/jeux/recit`.
 * Une carte dont la commune n'a pas le chiffre est sautée.
 */
import { aLieu } from '../modele/signalement.ts';
import { hasard, melanger, type Case } from './jeux-commun.ts';
import { anneaux, carte, type Communes, type CommuneJeu } from './jeux-communes.ts';

type Courbes = { annees: number[]; c: Record<string, [(number | null)[], number, number]> };
type Budget = { annee: number | null; c: Record<string, number[]> };
type Recit = { etatCivil: number | null; scrutin: string | null; eau: { annee: number; mediane: number | null } | null; c: Record<string, (number | null)[]> };

export interface Question {
  texte: string;
  options: { texte: string; juste: boolean }[];
}

export interface Carte {
  id: string;
  /** La petite ligne au-dessus : « Habitants », « Le budget »… */
  etiquette: string;
  rendre: (scene: HTMLElement, anime: boolean) => void;
  /** La source, en bas de la carte. */
  source: string;
  question?: Question;
  /** Pour l'image de la fin : un chiffre et sa légende. */
  resume?: [string, string];
}

export interface DonneesRecit {
  code: string;
  nom: string;
  cartes: Carte[];
  commune: CommuneJeu;
  communes: Communes;
}

const nombre = (x: number) => Math.round(x).toLocaleString('fr-FR');
const euros = (x: number) => `${nombre(x)} €`;
const pc = (x: number) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
const NS = 'http://www.w3.org/2000/svg';
const POSTES: [string, string, string][] = [
  ['👷', 'payer les agents', '#1e5f74'],
  ['🛒', 'acheter ce qu’il faut', '#3a8fa8'],
  ['🏗️', 'construire et réparer', '#e8762c'],
  ['🤝', 'aider et participer', '#2e9e5b'],
  ['🏦', 'rembourser les emprunts', '#8a4b12'],
  ['📦', 'le reste', '#9a968d'],
];

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Un chiffre qui défile jusqu'à sa valeur, en une seconde ; tout de suite sans animation. */
function defiler(el: HTMLElement, cible: number, format: (x: number) => string, anime: boolean): void {
  if (!anime) {
    el.textContent = format(cible);
    return;
  }
  const debut = performance.now();
  const pas = (t: number) => {
    const k = Math.min(1, (t - debut) / 1000);
    el.textContent = format(cible * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

const bloc = (classe: string, texte = '') => Object.assign(document.createElement('div'), { className: classe, textContent: texte });

/** Le grand chiffre et sa phrase, la base de chaque carte. */
function chiffre(scene: HTMLElement, valeur: number, format: (x: number) => string, phrase: string, anime: boolean): HTMLElement {
  const g = bloc('rc-chiffre');
  scene.append(g, bloc('rc-phrase', phrase));
  defiler(g, valeur, format, anime);
  return g;
}

/** Trois réponses autour de la vraie, mélangées avec la graine de la commune. */
function autour(vrai: number, format: (x: number) => string, alea: () => number, arrondi: number): Question['options'] {
  // La vraie valeur telle quelle : c'est elle que la carte montre ensuite.
  const r = (x: number) => Math.max(arrondi, Math.round(x / arrondi) * arrondi);
  const v = vrai;
  const bas = r(vrai * 0.55);
  const haut = r(vrai * 1.7);
  const options = [...new Set([v, bas === v ? v - arrondi : bas, haut === v ? v + arrondi : haut])].map((x) => ({ texte: format(x), juste: x === v }));
  return melanger(options, alea);
}

export async function chargerRecit(code: string): Promise<DonneesRecit | null> {
  const dep = code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
  const [communes, courbes, budget, recit] = await Promise.all([
    json<Communes>(`/jeux/communes/${dep}.json`),
    json<Courbes>(`/jeux/courbes/${dep}.json`),
    json<Budget>(`/jeux/budget/${dep}.json`),
    json<Recit>(`/jeux/recit/${dep}.json`),
  ]);
  const c = communes?.c[code];
  if (!communes || !c) return null;
  const [nom, , , , , epci, valeurs] = c;
  const val = (k: string) => valeurs[communes.i.findIndex((x) => x[0] === k)] ?? null;
  const source = (k: string) => communes.i.find((x) => x[0] === k)?.[3] ?? '';
  const alea = hasard(`recit:${code}`);
  const cartes: Carte[] = [];
  const a = aLieu(nom);

  // 1. La couverture : le nom et la silhouette.
  cartes.push({
    id: 'nom',
    etiquette: 'En 30 secondes',
    source: 'Contours : Admin Express (IGN)',
    rendre: (scene, anime) => {
      const svg = carte(communes, [code], () => 'rc-forme', () => nom);
      svg.setAttribute('aria-hidden', 'true');
      const f = bloc(`rc-silhouette${anime ? ' rc-entre' : ''}`);
      f.append(svg);
      scene.append(f, bloc('rc-titre', nom), bloc('rc-phrase', epci ? `Une commune de ${epci}` : ''));
    },
  });

  // 2. Les habitants, et la courbe depuis 1876.
  const serie = courbes?.c[code];
  if (serie && courbes) {
    const vals = serie[0].map((v, i) => v ?? serie[0][i - 1] ?? 0) as number[];
    const actuelle = vals.at(-1)!;
    const depart = vals[0];
    const tendance = actuelle < depart * 0.9 ? 'moins' : actuelle > depart * 1.1 ? 'plus' : 'autant';
    cartes.push({
      id: 'habitants',
      etiquette: 'Habitants',
      source: `INSEE, recensements de ${courbes.annees[0]} à ${courbes.annees.at(-1)}`,
      resume: [nombre(actuelle), 'habitants'],
      question: {
        texte: `Depuis ${courbes.annees[0]}, la commune a-t-elle gagné ou perdu des habitants ?`,
        options: [
          { texte: 'Gagné', juste: tendance === 'plus' },
          { texte: 'Perdu', juste: tendance === 'moins' },
          { texte: 'À peu près autant (à 10 % près)', juste: tendance === 'autant' },
        ],
      },
      rendre: (scene, anime) => {
        chiffre(scene, actuelle, nombre, `habitants en ${courbes.annees.at(-1)}`, anime);
        const L = 300;
        const H = 110;
        const max = Math.max(...vals) * 1.1;
        const x = (i: number) => ((courbes.annees[i] - courbes.annees[0]) / (courbes.annees.at(-1)! - courbes.annees[0])) * L;
        const y = (v: number) => H - (v / max) * H;
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `-6 -6 ${L + 12} ${H + 24}`);
        svg.setAttribute('class', 'rc-courbe');
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''));
        svg.append(p);
        for (const [i, t] of [[0, String(courbes.annees[0])], [vals.length - 1, String(courbes.annees.at(-1))]] as [number, string][]) {
          const tx = document.createElementNS(NS, 'text');
          tx.setAttribute('x', String(x(i)));
          tx.setAttribute('y', String(H + 16));
          tx.setAttribute('text-anchor', i ? 'end' : 'start');
          tx.textContent = t;
          svg.append(tx);
        }
        scene.append(svg);
        if (anime) {
          const long = p.getTotalLength();
          p.style.strokeDasharray = `${long}`;
          p.style.strokeDashoffset = `${long}`;
          requestAnimationFrame(() => {
            p.style.transition = 'stroke-dashoffset 1.6s ease-out';
            p.style.strokeDashoffset = '0';
          });
        }
        scene.append(bloc('rc-detail', `${nombre(depart)} en ${courbes.annees[0]}, ${nombre(serie[2])} au plus haut, en ${serie[1]}.`));
      },
    });
  }

  // 3. Les naissances et les décès de la dernière année.
  const r = recit?.c[code];
  if (r && recit?.etatCivil && r[0] != null && r[1] != null) {
    const [n, d] = r as number[];
    cartes.push({
      id: 'naissances',
      etiquette: `En ${recit.etatCivil}`,
      source: `INSEE, état civil ${recit.etatCivil} : au domicile de la mère pour les naissances, du défunt pour les décès`,
      resume: [`${nombre(n)} · ${nombre(d)}`, 'naissances · décès'],
      question: {
        texte: `En ${recit.etatCivil}, plus de naissances ou plus de décès ${a} ?`,
        options: [
          { texte: 'Plus de naissances', juste: n > d },
          { texte: 'Plus de décès', juste: d > n },
          { texte: 'Autant', juste: n === d },
        ],
      },
      rendre: (scene, anime) => {
        const ligne = (k: number, classe: string, legende: string) => {
          const l = bloc('rc-points');
          const cap = Math.min(k, 120);
          for (let i = 0; i < cap; i++) {
            const s = Object.assign(document.createElement('span'), { className: classe });
            if (anime) s.style.animationDelay = `${(i / Math.max(cap, 1)) * 0.9}s`;
            l.append(s);
          }
          const t = bloc('rc-legende-points');
          t.append(Object.assign(document.createElement('strong'), { textContent: nombre(k) }), ` ${legende}${k > cap ? ' (un point pour chacune des 120 premières)' : ''}`);
          scene.append(t, l);
        };
        ligne(n, `rc-point rc-point--naissance${anime ? ' rc-pop' : ''}`, n > 1 ? 'naissances' : 'naissance');
        ligne(d, `rc-point rc-point--deces${anime ? ' rc-pop' : ''}`, d > 1 ? 'décès' : 'décès');
        scene.append(bloc('rc-detail', n < d ? 'Plus de décès que de naissances : sans arrivées, la commune perd des habitants.' : n > d ? 'Plus de naissances que de décès : la commune gagne des habitants par elle-même.' : 'Autant de naissances que de décès.'));
      },
    });
  }

  // 4. Le budget, sur 100 €.
  const b = budget?.c[code.slice(dep.length)];
  if (b && budget) {
    const ordre = b.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
    const premier = ordre[0][1];
    const autres = melanger(ordre.slice(1, 5).map(([, i]) => i), alea).slice(0, 2);
    cartes.push({
      id: 'budget',
      etiquette: 'Le budget',
      source: `OFGL, comptes ${budget.annee ?? ''}, ramenés à 100 €`,
      resume: [`${b[premier]} €`, `sur 100 € pour ${POSTES[premier][1]}`],
      question: {
        texte: 'Sur 100 € dépensés par la commune, quel est le plus gros poste ?',
        // À égalité, chaque poste en tête est une bonne réponse.
        options: melanger([premier, ...autres], alea).map((i) => ({ texte: `${POSTES[i][0]} ${POSTES[i][1].replace(/^./, (x) => x.toUpperCase())}`, juste: b[i] === b[premier] })),
      },
      rendre: (scene, anime) => {
        scene.append(bloc('rc-titre-petit', 'Sur 100 € dépensés par la commune'));
        const grille = bloc('rc-grille');
        let k = 0;
        for (const [i, v] of b.entries()) {
          for (let j = 0; j < v; j++, k++) {
            const s = Object.assign(document.createElement('span'), { className: anime ? 'rc-pop' : '' });
            s.style.background = POSTES[i][2];
            if (anime) s.style.animationDelay = `${k * 0.012}s`;
            grille.append(s);
          }
        }
        scene.append(grille);
        const l = Object.assign(document.createElement('ul'), { className: 'rc-legende' });
        for (const [v, i] of ordre.slice(0, 3)) {
          const li = document.createElement('li');
          li.style.setProperty('--c', POSTES[i][2]);
          li.append(Object.assign(document.createElement('strong'), { textContent: `${v} €` }), ` ${POSTES[i][0]} ${POSTES[i][1]}`);
          l.append(li);
        }
        scene.append(l);
      },
    });
  }

  // 5. Le prix d'une maison.
  const maison = val('prixMaison');
  if (maison) {
    cartes.push({
      id: 'maison',
      etiquette: 'Se loger',
      source: source('prixMaison'),
      resume: [euros(maison), 'une maison, en médiane'],
      question: { texte: `Une maison se vend ${a}, en médiane…`, options: autour(maison, euros, alea, 5000) },
      rendre: (scene, anime) => {
        scene.append(bloc(`rc-emoji${anime ? ' rc-entre' : ''}`, '🏡'));
        chiffre(scene, maison, euros, 'le prix médian d’une maison vendue', anime);
      },
    });
  }

  // 6. Les associations.
  if (r && r[2] != null && r[2] > 0) {
    const n = r[2];
    cartes.push({
      id: 'associations',
      etiquette: 'Vie associative',
      source: 'Répertoire national des associations (ministère de l’Intérieur)',
      resume: [nombre(n), 'associations'],
      question: { texte: `Combien d’associations ${a} ?`, options: autour(n, nombre, alea, n < 30 ? 2 : 5) },
      rendre: (scene, anime) => {
        chiffre(scene, n, nombre, 'associations inscrites au répertoire, non dissoutes', anime);
        const l = bloc('rc-points rc-points--serre');
        for (let i = 0; i < Math.min(n, 200); i++) {
          const s = Object.assign(document.createElement('span'), { className: `rc-point rc-point--asso${anime ? ' rc-pop' : ''}` });
          if (anime) s.style.animationDelay = `${(i / Math.min(n, 200)) * 0.8}s`;
          l.append(s);
        }
        scene.append(l);
      },
    });
  }

  // 7. La participation aux municipales.
  if (r && r[3] != null && recit?.scrutin) {
    const p = r[3];
    const tranche = p < 50 ? 0 : p <= 70 ? 1 : 2;
    cartes.push({
      id: 'vote',
      etiquette: 'Voter',
      source: `Ministère de l’Intérieur, ${recit.scrutin}, premier tour`,
      resume: [pc(p), 'des inscrits ont voté'],
      question: {
        texte: `Au premier tour des ${recit.scrutin}, combien d’inscrits ont voté ${a} ?`,
        options: ['Moins de 50 %', 'De 50 à 70 %', 'Plus de 70 %'].map((t, i) => ({ texte: t, juste: i === tranche })),
      },
      rendre: (scene, anime) => {
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 200 112');
        svg.setAttribute('class', 'rc-jauge');
        svg.setAttribute('aria-hidden', 'true');
        const arc = (classe: string) => {
          const e = document.createElementNS(NS, 'path');
          e.setAttribute('d', 'M20,100 A80,80 0 0 1 180,100');
          e.setAttribute('class', classe);
          e.setAttribute('pathLength', '100');
          svg.append(e);
          return e;
        };
        arc('rc-jauge-fond');
        const v = arc('rc-jauge-valeur');
        v.style.strokeDasharray = '100';
        v.style.strokeDashoffset = anime ? '100' : String(100 - p);
        if (anime) requestAnimationFrame(() => requestAnimationFrame(() => ((v.style.transition = 'stroke-dashoffset 1.2s ease-out'), (v.style.strokeDashoffset = String(100 - p)))));
        scene.append(svg);
        chiffre(scene, p, pc, `des inscrits ont voté au premier tour des ${recit.scrutin}`, anime);
      },
    });
  }

  // 8. L'eau.
  if (r && r[4] != null && recit?.eau) {
    const e = r[4];
    const med = recit.eau.mediane;
    cartes.push({
      id: 'eau',
      etiquette: 'L’eau',
      source: `SISPEA, prix ${recit.eau.annee} TTC pour 120 m³${med ? ` ; médiane nationale ${med.toLocaleString('fr-FR')} €` : ''}`,
      resume: [`${e.toLocaleString('fr-FR')} €`, 'le m³ d’eau'],
      question: med ? { texte: `Le m³ d’eau ${a} coûte-t-il plus ou moins que la médiane nationale, ${med.toLocaleString('fr-FR')} € ?`, options: [{ texte: 'Plus', juste: e > med }, { texte: 'Moins', juste: e < med }, { texte: 'Pile pareil', juste: e === med }] } : undefined,
      rendre: (scene, anime) => {
        scene.append(bloc(`rc-emoji${anime ? ' rc-entre' : ''}`, '💧'));
        chiffre(scene, e, (x) => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`, `le m³ d’eau, TTC pour 120 m³ par an${med ? ` — ${e > med ? 'plus' : e < med ? 'moins' : 'autant'} que la médiane nationale, ${med.toLocaleString('fr-FR')} €` : ''}`, anime);
      },
    });
  }

  return { code, nom, cartes, commune: c, communes };
}

/** L'image de la fin, au format des stories (9:16) : le nom, la silhouette, quatre chiffres. */
export async function imageRecit(d: DonneesRecit, resultat?: { cases: Case[]; score: string }): Promise<Blob> {
  const L = 1080;
  const H = 1920;
  const t = document.createElement('canvas');
  t.width = L;
  t.height = H;
  const g = t.getContext('2d')!;
  await document.fonts?.ready;
  const police = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const titre = 'Fraunces, Georgia, serif';
  g.fillStyle = '#1e5f74';
  g.fillRect(0, 0, L, H);
  const texte = (s: string, y: number, taille: number, couleur: string, graisse = 400, famille = police) => {
    let k = taille;
    g.font = `${graisse} ${k}px ${famille}`;
    while (g.measureText(s).width > L - 160 && k > 24) g.font = `${graisse} ${(k -= 2)}px ${famille}`;
    g.fillStyle = couleur;
    g.fillText(s, 80, y);
  };
  texte('Rouages', 130, 40, '#cfe3ea', 600);
  texte(resultat ? 'En 30 secondes · le jeu' : 'En 30 secondes', 190, 40, '#cfe3ea');
  texte(d.nom, 320, 92, '#ffffff', 700, titre);
  // La silhouette, en blanc.
  const formes = anneaux(d.commune);
  const pts = formes.flat();
  const lat = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length);
  const k = Math.cos((lat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * k);
  const ys = pts.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cote = 520;
  const e = cote / Math.max(x1 - x0, y1 - y0);
  const ox = (L - (x1 - x0) * e) / 2;
  const oy = 400 + (cote - (y1 - y0) * e) / 2;
  g.fillStyle = 'rgba(255,255,255,.92)';
  g.beginPath();
  for (const r of formes) r.forEach(([x, y], i) => (i ? g.lineTo : g.moveTo).call(g, ox + (x * k - x0) * e, oy + (-y - y0) * e));
  g.fill('evenodd');
  const resumes = d.cartes.filter((c) => c.resume).slice(0, 4);
  resumes.forEach((c, i) => {
    const y = 1060 + i * 170;
    texte(c.resume![0], y, 84, '#ffffff', 700, titre);
    texte(c.resume![1], y + 52, 38, '#cfe3ea');
  });
  if (resultat) {
    const couleurs: Record<Case, string> = { vert: '#2e9e5b', jaune: '#e6b422', orange: '#e8762c', rouge: '#cf3b2f' };
    resultat.cases.forEach((c, i) => {
      g.fillStyle = couleurs[c];
      g.beginPath();
      g.roundRect(80 + i * 100, 1730 - 140, 80, 80, 12);
      g.fill();
    });
    texte(resultat.score, 1730 - 160, 60, '#ffffff', 700, titre);
  }
  texte(`rouages.fr/commune/${d.code}`, 1820, 38, '#ffffff', 600);
  return new Promise((ok, ko) => t.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png'));
}

/** Partager l'image : par le téléphone s'il prend les fichiers, sinon enregistrée. */
export async function partagerImage(blob: Blob, nomFichier: string, texte: string, url: string): Promise<'partage' | 'enregistre'> {
  const f = new File([blob], nomFichier, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) {
    await navigator.share({ files: [f], text: `${texte}\n${url}` });
    return 'partage';
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: nomFichier });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'enregistre';
}

export interface Lecture {
  /** Le jeu : une question avant chaque carte qui en a une. */
  jeu: boolean;
  /** À la fin : les cases des réponses, en jeu. */
  fin: (cases: Case[]) => void;
  /** Fermer, sur la page de la commune. */
  fermer?: () => void;
}

/**
 * Le lecteur : la barre de progression, la carte, les zones pour avancer et
 * reculer, et, en jeu, la question et ses réponses. Au clavier : les flèches,
 * Échap pour fermer, Espace pour la pause.
 */
export function lire(racine: HTMLElement, d: DonneesRecit, o: Lecture): void {
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUREE = 3600;
  racine.innerHTML = '';
  racine.classList.add('rc');
  racine.setAttribute('role', 'region');
  racine.setAttribute('aria-roledescription', 'récit');
  racine.setAttribute('aria-label', `${d.nom} en 30 secondes`);
  const barre = bloc('rc-barre');
  const segments = d.cartes.map(() => {
    const s = bloc('rc-segment');
    s.append(bloc('rc-segment-plein'));
    barre.append(s);
    return s;
  });
  const haut = bloc('rc-haut');
  const etiquette = bloc('rc-etiquette');
  const pause = Object.assign(document.createElement('button'), { type: 'button', className: 'rc-bouton', textContent: '⏸' });
  pause.setAttribute('aria-label', 'Pause');
  haut.append(etiquette, pause);
  if (o.fermer) {
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 'rc-bouton', textContent: '✕' });
    x.setAttribute('aria-label', 'Fermer');
    x.addEventListener('click', () => o.fermer!());
    haut.append(x);
  }
  const scene = bloc('rc-scene');
  scene.setAttribute('aria-live', 'polite');
  const pied = bloc('rc-pied');
  const precedent = Object.assign(document.createElement('button'), { type: 'button', className: 'rc-zone rc-zone--avant' });
  precedent.setAttribute('aria-label', 'Carte précédente');
  const suivant = Object.assign(document.createElement('button'), { type: 'button', className: 'rc-zone rc-zone--apres' });
  suivant.setAttribute('aria-label', 'Carte suivante');
  racine.append(barre, haut, scene, pied, precedent, suivant);

  let i = 0;
  let enPause = calme || o.jeu;
  let minuterie = 0;
  let debut = 0;
  let ecoule = 0;
  const reponses: (boolean | null)[] = d.cartes.map(() => null);

  const majBarre = (k: number) => segments.forEach((s, j) => ((s.firstElementChild as HTMLElement).style.width = j < i ? '100%' : j > i ? '0%' : `${k * 100}%`));
  const programmer = () => {
    cancelAnimationFrame(minuterie);
    if (enPause) return;
    debut = performance.now() - ecoule;
    const pas = (t: number) => {
      ecoule = t - debut;
      majBarre(Math.min(1, ecoule / DUREE));
      if (ecoule >= DUREE) aller(i + 1);
      else minuterie = requestAnimationFrame(pas);
    };
    minuterie = requestAnimationFrame(pas);
  };
  pause.hidden = o.jeu;
  pause.addEventListener('click', () => {
    enPause = !enPause;
    pause.textContent = enPause ? '▶' : '⏸';
    pause.setAttribute('aria-label', enPause ? 'Lecture' : 'Pause');
    programmer();
  });

  const montrer = (c: Carte) => {
    scene.innerHTML = '';
    c.rendre(scene, !calme);
    pied.textContent = c.source;
  };

  const terminer = () => {
    cancelAnimationFrame(minuterie);
    majBarre(1);
    const cases = reponses.filter((r) => r !== null).map((r): Case => (r ? 'vert' : 'rouge'));
    o.fin(cases);
  };

  const aller = (k: number) => {
    if (k < 0) k = 0;
    if (k >= d.cartes.length) return terminer();
    i = k;
    ecoule = 0;
    const c = d.cartes[i];
    etiquette.textContent = `${c.etiquette} · ${i + 1}/${d.cartes.length}`;
    majBarre(0);
    if (o.jeu && c.question && reponses[i] === null) {
      // La question d'abord ; la carte vient avec la réponse.
      scene.innerHTML = '';
      pied.textContent = '';
      scene.append(bloc('rc-question', c.question.texte));
      const ul = Object.assign(document.createElement('div'), { className: 'rc-options' });
      for (const opt of c.question.options) {
        const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'rc-option', textContent: opt.texte });
        btn.addEventListener('click', () => {
          reponses[i] = opt.juste;
          montrer(c);
          const v = bloc(`rc-verdict ${opt.juste ? 'rc-verdict--juste' : 'rc-verdict--faux'}`, opt.juste ? '✓ Bien vu !' : `✗ C’était : ${c.question!.options.find((x) => x.juste)?.texte}`);
          scene.prepend(v);
          const ensuite = Object.assign(document.createElement('button'), { type: 'button', className: 'bouton rc-ensuite', textContent: i + 1 < d.cartes.length ? 'Suivant' : 'Voir mon score' });
          ensuite.addEventListener('click', () => aller(i + 1));
          scene.append(ensuite);
          ensuite.focus();
        });
        ul.append(btn);
      }
      scene.append(ul);
      (ul.firstElementChild as HTMLElement | null)?.focus();
      return;
    }
    montrer(c);
    if (o.jeu) {
      const ensuite = Object.assign(document.createElement('button'), { type: 'button', className: 'bouton rc-ensuite', textContent: i + 1 < d.cartes.length ? 'Suivant' : 'Voir mon score' });
      ensuite.addEventListener('click', () => aller(i + 1));
      scene.append(ensuite);
    }
    programmer();
  };

  precedent.addEventListener('click', () => !o.jeu && aller(i - 1));
  suivant.addEventListener('click', () => !o.jeu && aller(i + 1));
  precedent.hidden = o.jeu;
  suivant.hidden = o.jeu;
  // Tenir le doigt appuyé met en pause, comme sur les réseaux.
  scene.addEventListener('pointerdown', () => {
    if (o.jeu || enPause) return;
    cancelAnimationFrame(minuterie);
    const reprendre = () => {
      programmer();
      removeEventListener('pointerup', reprendre);
    };
    addEventListener('pointerup', reprendre);
  });
  racine.tabIndex = -1;
  racine.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && o.fermer) o.fermer();
    else if (o.jeu) return;
    else if (e.key === 'ArrowRight') aller(i + 1);
    else if (e.key === 'ArrowLeft') aller(i - 1);
    else if (e.key === ' ') pause.click();
    else return;
    e.preventDefault();
  });
  aller(0);
  racine.focus();
}

/**
 * La dernière carte : les chiffres à retenir, l'image à partager, et le
 * chemin vers l'autre version — le jeu depuis le récit, le récit depuis le
 * jeu.
 */
export function ecranFin(racine: HTMLElement, d: DonneesRecit, o: { jeu?: { cases: Case[]; score: string }; rejouer: () => void; fermer?: () => void }): void {
  const scene = racine.querySelector('.rc-scene') as HTMLElement;
  const pied = racine.querySelector('.rc-pied') as HTMLElement;
  racine.querySelectorAll('.rc-zone').forEach((z) => ((z as HTMLElement).hidden = true));
  const etiquette = racine.querySelector('.rc-etiquette');
  if (etiquette) etiquette.textContent = o.jeu ? 'Votre score' : 'À retenir';
  const pause = racine.querySelector<HTMLElement>('.rc-haut .rc-bouton');
  if (pause && pause.textContent !== '✕') pause.hidden = true;
  scene.innerHTML = '';
  pied.textContent = 'Les chiffres de la page de la commune, avec leurs sources.';
  const fin = bloc('rc-fin');
  fin.append(bloc('rc-titre', d.nom));
  if (o.jeu) fin.append(bloc('rc-chiffre', o.jeu.score), bloc('rc-phrase', o.jeu.cases.map((c) => ({ vert: '🟩', jaune: '🟨', orange: '🟧', rouge: '🟥' })[c]).join('')));
  const ul = Object.assign(document.createElement('ul'), { className: 'rc-resumes' });
  for (const c of d.cartes.filter((x) => x.resume).slice(0, 4)) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('strong'), { textContent: c.resume![0] }), Object.assign(document.createElement('span'), { textContent: c.resume![1] }));
    ul.append(li);
  }
  fin.append(ul);
  const actions = bloc('rc-actions');
  const note = bloc('rc-note');
  note.hidden = true;
  const adresse = `${location.origin}/commune/${d.code}#en-30-secondes`;
  const image = Object.assign(document.createElement('button'), { type: 'button', className: 'bouton', textContent: 'Partager l’image' });
  image.addEventListener('click', async () => {
    try {
      const blob = await imageRecit(d, o.jeu);
      const texte = o.jeu ? `${d.nom} en 30 secondes : ${o.jeu.score} ${o.jeu.cases.map((c) => ({ vert: '🟩', jaune: '🟨', orange: '🟧', rouge: '🟥' })[c]).join('')}` : `${d.nom} en 30 secondes`;
      const r = await partagerImage(blob, `rouages-${d.code}-30-secondes.png`, texte, o.jeu ? `${location.origin}/jeux/en-30-secondes?t=c-${d.code}` : adresse);
      note.textContent = r === 'enregistre' ? 'Image enregistrée : publiez-la en story ou dans le fil depuis votre application.' : '';
      note.hidden = r !== 'enregistre';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      note.textContent = 'L’image n’a pas pu être préparée sur cet appareil.';
      note.hidden = false;
    }
  });
  const lien = Object.assign(document.createElement('button'), { type: 'button', className: 'plat', textContent: 'Copier le lien' });
  lien.addEventListener('click', async () => {
    const url = o.jeu ? `${location.origin}/jeux/en-30-secondes?t=c-${d.code}` : adresse;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ title: `${d.nom} en 30 secondes`, url });
      else {
        await navigator.clipboard.writeText(url);
        lien.textContent = 'Lien copié';
      }
    } catch {
      /* partage annulé */
    }
  });
  const encore = Object.assign(document.createElement('button'), { type: 'button', className: 'plat', textContent: o.jeu ? 'Rejouer' : 'Revoir' });
  encore.addEventListener('click', o.rejouer);
  actions.append(image, lien, encore);
  fin.append(actions, note);
  const autre = document.createElement('p');
  autre.className = 'rc-detail';
  autre.append(
    o.jeu
      ? Object.assign(document.createElement('a'), { href: `/commune/${d.code}`, textContent: `Toute la page ${aLieu(d.nom).replace(/^à /, 'de ').replace(/^au /, 'du ').replace(/^aux /, 'des ')}` })
      : Object.assign(document.createElement('a'), { href: `/jeux/en-30-secondes?t=c-${d.code}`, textContent: 'La version jeu : devinez avant de voir →' }),
  );
  fin.append(autre);
  scene.append(fin);
  image.focus();
}
