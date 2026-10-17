/**
 * Ce que les jeux partagent : le jour à Paris, le hasard à graine du défi du
 * jour, la mémoire du navigateur et le partage du résultat.
 *
 * **Le défi du jour** : pour un jeu, un lieu et un jour, la même partie pour
 * tout le monde, tirée d'une graine faite de la date et de la clé du lieu.
 * C'est ce qui rend un score comparable, donc partageable.
 *
 * **Le partage** ne transporte qu'un résultat : le lieu, la date, une case par
 * manche, le score et l'adresse du défi. Un texte pour la plupart des réseaux,
 * une image pour Instagram, qui n'a pas d'adresse de partage. Le balisage va
 * avec `src/composants/PartageJeu.astro`.
 */

/** Le jour à Paris, AAAA-MM-JJ : le défi change à minuit pour tout le monde. */
export function jourDeParis(d = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * Un duel : le lien qu'un joueur envoie après sa partie. Il porte le jeu, le
 * jour et le lieu de la partie — de quoi la rejouer à l'identique, puisque
 * le tirage du défi du jour ne dépend que d'eux —, le score et les cases à
 * battre, et un pseudo s'il en a donné un. Rien d'autre, et rien ne part
 * vers un serveur : tout est dans l'adresse.
 */
export interface Duel {
  /** Le jeu. */
  g: string;
  /** Le jour de la partie, AAAA-MM-JJ. */
  j: string;
  /** Le lieu, tel que le partage l'affiche. */
  l: string | null;
  /** Le score à battre, et ses cases. */
  s: string;
  c: Case[];
  /** Le pseudo, facultatif. */
  n?: string;
}

const versBase64 = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deBase64 = (t: string) => new TextDecoder().decode(Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export function lienDuel(adresse: string, d: Duel): string {
  const u = new URL(adresse);
  u.searchParams.set('duel', versBase64(JSON.stringify(d)));
  return u.toString();
}

/** Le duel de l'adresse de la page, s'il y en a un et qu'il se lit. */
export function duelDeLAdresse(): Duel | null {
  try {
    const brut = new URLSearchParams(location.search).get('duel');
    if (!brut) return null;
    const d = JSON.parse(deBase64(brut)) as Duel;
    if (typeof d.g !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.j) || typeof d.s !== 'string' || !Array.isArray(d.c)) return null;
    d.n = typeof d.n === 'string' ? d.n.slice(0, 24) : undefined;
    d.c = d.c.filter((c) => c in EMOJI).slice(0, 40);
    return d;
  } catch {
    return null;
  }
}

/**
 * Le jour de la partie : celui du duel reçu, pour rejouer exactement la même,
 * sinon aujourd'hui. Un duel ne fait pas jouer l'avenir.
 */
export function jourDuJeu(): string {
  const d = duelDeLAdresse();
  const aujourdhui = jourDeParis();
  return d && d.j <= aujourdhui ? d.j : aujourdhui;
}

/** Les jeux qui comptent des essais : moins, c'est mieux, et « X » veut dire perdu. */
const EN_ESSAIS = new Set(['La commune mystère', 'La silhouette']);

/** Un score en nombre, plus grand c'est mieux : de quoi désigner le gagnant d'un duel. */
export function valeurScore(jeu: string, score: string): number {
  const m = /^(X|\d+(?:[.,]\d+)?)(?:\/(\d+))?/.exec(score.trim());
  if (!m) return 0;
  if (EN_ESSAIS.has(jeu)) return m[1] === 'X' ? 0 : Number(m[2] ?? 6) + 1 - Number(m[1]);
  return m[1] === 'X' ? 0 : Number(m[1].replace(',', '.'));
}

/** « 10 octobre 2026 ». */
export function dateLongue(jour: string): string {
  return new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Un générateur pseudo-aléatoire à graine (mulberry32), le même dans tous les navigateurs. */
export function hasard(graine: string): () => number {
  let h = 2166136261;
  for (const c of graine) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un mélange de Fisher-Yates, reproductible avec un générateur à graine. */
export function melanger<T>(liste: T[], alea: () => number = Math.random): T[] {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/** Ce que le navigateur garde, sous un préfixe par jeu. Rien ne part ailleurs. */
export function memoire(prefixe: string) {
  return {
    lire<T>(cle: string): T | null {
      try {
        const brut = localStorage.getItem(`${prefixe}:${cle}`);
        return brut ? (JSON.parse(brut) as T) : null;
      } catch {
        return null;
      }
    },
    ecrire(cle: string, valeur: unknown): void {
      try {
        localStorage.setItem(`${prefixe}:${cle}`, JSON.stringify(valeur));
      } catch {
        /* navigation privée : le défi se rejouera, voilà tout */
      }
    },
  };
}

/** Le pseudo des duels, retenu dans le navigateur d'une partie à l'autre. */
function pseudoRetenu(): string {
  try {
    return JSON.parse(localStorage.getItem('rouages-jeux:pseudo') ?? '""') as string;
  } catch {
    return '';
  }
}

/** Les jeux, par la clé de leur historique : leur nom et leur adresse. */
export const JEUX = {
  qui: { nom: 'Qui décide ?', adresse: '/jeux/qui-decide' },
  mystere: { nom: 'La commune mystère', adresse: '/jeux/commune-mystere' },
  plus: { nom: 'Plus ou moins', adresse: '/jeux/plus-ou-moins' },
  prix: { nom: 'À combien s’est-elle vendue ?', adresse: '/jeux/prix' },
  ordre: { nom: 'Le bon ordre', adresse: '/jeux/ordre' },
  argent: { nom: 'Où va l’argent ?', adresse: '/jeux/argent' },
  demande: { nom: 'À qui je demande ?', adresse: '/jeux/a-qui-je-demande' },
  paires: { nom: 'Qui s’en occupe ?', adresse: '/jeux/qui-s-en-occupe' },
  vraifaux: { nom: 'Vrai ou faux : le maire peut-il… ?', adresse: '/jeux/vrai-ou-faux' },
  carte: { nom: 'Le puzzle de la carte', adresse: '/jeux/puzzle-carte' },
  budget: { nom: 'Le budget de ma commune', adresse: '/jeux/budget' },
  courbe: { nom: 'Devine la courbe', adresse: '/jeux/devine-la-courbe' },
  silhouette: { nom: 'La silhouette', adresse: '/jeux/silhouette' },
  chrono: { nom: 'Le chrono de l’interco', adresse: '/jeux/chrono' },
  trente: { nom: 'Ta commune en 30 secondes', adresse: '/jeux/en-30-secondes' },
  cartes: { nom: 'Les cartes des départements', adresse: '/jeux/cartes-departements' },
} as const;
export type CleJeu = keyof typeof JEUX;

/**
 * L'historique des défis du jour, par jeu et par jour : le lieu, les cases,
 * le score. Dans le navigateur seulement, comme le reste ; soixante jours au
 * plus, assez pour une série et un petit relevé.
 */
export type Trace = { lieu: string | null; cases: Case[]; score: string };
const HISTORIQUE = memoire('rouages-jeux');
const GARDER = 60;

export function historique(jeu: CleJeu): Record<string, Trace> {
  return HISTORIQUE.lire<Record<string, Record<string, Trace>>>('historique')?.[jeu] ?? {};
}

export function noterResultat(jeu: CleJeu, r: Resultat): void {
  // Une partie rejouée pour un duel, d'un autre jour, ne compte pas dans la série.
  if (r.jour !== jourDeParis()) return;
  const tout = HISTORIQUE.lire<Record<string, Record<string, Trace>>>('historique') ?? {};
  const h = { ...(tout[jeu] ?? {}), [r.jour]: { lieu: r.lieu, cases: r.cases, score: r.score } };
  tout[jeu] = Object.fromEntries(Object.entries(h).sort((a, b) => b[0].localeCompare(a[0])).slice(0, GARDER));
  HISTORIQUE.ecrire('historique', tout);
}

/** Le jour d'avant, AAAA-MM-JJ, en restant sur le calendrier (midi évite les changements d'heure). */
function veille(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Les jours de suite où le défi a été joué, en finissant aujourd'hui — ou hier, s'il reste à jouer. */
export function serie(jeu: CleJeu, aujourdhui = jourDeParis()): number {
  const h = historique(jeu);
  let jour = h[aujourdhui] ? aujourdhui : veille(aujourdhui);
  let n = 0;
  while (h[jour]) {
    n++;
    jour = veille(jour);
  }
  return n;
}

/** Le temps jusqu'au prochain défi, à minuit à Paris : « 6 h 12 », « 4 min ». */
export function avantMinuit(d = new Date()): string {
  const [h, m, s] = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .format(d)
    .split(':')
    .map(Number);
  const reste = Math.max(60, 86_400 - (h * 3600 + m * 60 + s));
  const heures = Math.floor(reste / 3600);
  const minutes = Math.floor((reste % 3600) / 60);
  return heures > 0 ? `${heures} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

/** Une manche réussie, à moitié, ratée : les couleurs des cases, en emoji et en image. */
export type Case = 'vert' | 'jaune' | 'orange' | 'rouge';
export const EMOJI: Record<Case, string> = { vert: '🟩', jaune: '🟨', orange: '🟧', rouge: '🟥' };
const COULEUR: Record<Case, string> = { vert: '#2e9e5b', jaune: '#e6b422', orange: '#e8762c', rouge: '#cf3b2f' };

export interface Resultat {
  /** Le nom du jeu : « Qui décide ? ». */
  jeu: string;
  /** Un emoji pour la première ligne. */
  embleme: string;
  /** Le lieu du défi, ou null pour un défi national. */
  lieu: string | null;
  jour: string;
  cases: Case[];
  /** « 4/5 », « 312/500 », « en 3 essais ». */
  score: string;
  adresse: string;
}

export function texteDuResultat(r: Resultat): string {
  return [
    `${r.jeu} ${r.embleme}`,
    `${r.lieu ? `${r.lieu} · ` : ''}défi du ${dateLongue(r.jour)}`,
    `${r.cases.map((c) => EMOJI[c]).join('')} ${r.score}`,
  ].join('\n');
}

/**
 * L'image du résultat, pour Instagram : le même contenu que le texte, au
 * format portrait 4:5 du fil.
 */
export async function imageDuResultat(r: Resultat): Promise<Blob> {
  const L = 1080;
  const H = 1350;
  const toile = document.createElement('canvas');
  toile.width = L;
  toile.height = H;
  const g = toile.getContext('2d')!;
  await document.fonts?.load('700 64px Fraunces').catch(() => []);
  await document.fonts?.ready;
  const police = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const titre = `Fraunces, Georgia, serif`;
  g.fillStyle = '#fbfaf8';
  g.fillRect(0, 0, L, H);
  g.fillStyle = '#1e5f74';
  g.fillRect(0, 0, L, 18);
  const ligne = (texte: string, y: number, taille: number, couleur: string, graisse = 400, famille = police) => {
    g.font = `${graisse} ${taille}px ${famille}`;
    g.fillStyle = couleur;
    // Un nom long se réduit plutôt que de sortir du cadre.
    let t = taille;
    while (g.measureText(texte).width > L - 160 && t > 24) g.font = `${graisse} ${(t -= 2)}px ${famille}`;
    g.fillText(texte, 80, y);
  };
  ligne('Rouages · Jeux', 130, 36, '#5f5c55', 500);
  ligne(r.jeu, 240, 76, '#17171a', 700, titre);
  if (r.lieu) ligne(r.lieu, 420, 56, '#17171a', 600, titre);
  ligne(`Défi du ${dateLongue(r.jour)}`, r.lieu ? 490 : 420, 40, '#5f5c55');
  const n = Math.max(1, r.cases.length);
  const cote = Math.min(150, (L - 160 - (n - 1) * 24) / n);
  const ecart = n > 1 ? (L - 160 - cote * n) / (n - 1) : 0;
  for (const [i, c] of r.cases.entries()) {
    g.fillStyle = COULEUR[c];
    g.beginPath();
    g.roundRect(80 + i * (cote + ecart), 600, cote, cote, Math.round(cote / 7));
    g.fill();
  }
  ligne(r.score, 960, 130, '#17171a', 700, titre);
  ligne('Saurez-vous faire mieux ?', 1170, 44, '#1e5f74', 600);
  ligne(r.adresse.replace(/^https?:\/\//, ''), 1240, 34, '#5f5c55');
  return new Promise((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png'));
}

/**
 * Remplit le bloc de partage de `PartageJeu.astro` (identifiants préfixés) et
 * branche ses boutons. `resultat` est relu à chaque clic : le bloc sert pour
 * toutes les parties de la page.
 */
export function brancherPartage(prefixe: string, resultat: () => Resultat | null, jeu: CleJeu): (r: Resultat) => void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`${prefixe}-${id}`) as T;
  const note = $('note-image');
  const duel = duelDeLAdresse();
  const nomDuJeu = JEUX[jeu].nom;
  // Un duel reçu : un bandeau en haut du jeu, pour savoir ce qu'il y a à battre.
  if (duel && duel.g === jeu) {
    const jeuEl = document.getElementById(prefixe);
    const bandeau = Object.assign(document.createElement('p'), { className: 'pj-defi' });
    bandeau.append(
      Object.assign(document.createElement('strong'), { textContent: `⚔️ ${duel.n ? `${duel.n} vous défie` : 'Vous êtes défié'}` }),
      ` : ${duel.c.map((c) => EMOJI[c]).join('')} ${duel.s}${duel.l ? `, ${duel.l}` : ''}, défi du ${dateLongue(duel.j)}. La même partie vous attend — à vous de jouer.`,
    );
    jeuEl?.prepend(bandeau);
  }
  const defier = document.getElementById(`${prefixe}-defier`);
  const noteDuel = document.getElementById(`${prefixe}-note-duel`);
  defier?.addEventListener('click', async () => {
    const r = resultat();
    if (!r) return;
    const pseudo = (document.getElementById(`${prefixe}-pseudo`) as HTMLInputElement | null)?.value.trim().slice(0, 24) || undefined;
    try {
      localStorage.setItem('rouages-jeux:pseudo', JSON.stringify(pseudo ?? ''));
    } catch {
      /* rien */
    }
    const url = lienDuel(r.adresse, { g: jeu, j: r.jour, l: r.lieu, s: r.score, c: r.cases, n: pseudo });
    const texte = `${r.cases.map((c) => EMOJI[c]).join('')} ${r.score} au défi « ${nomDuJeu} »${r.lieu ? `, ${r.lieu}` : ''}. Tu fais mieux ? La même partie t’attend :`;
    try {
      if (typeof navigator.share === 'function') await navigator.share({ text: texte, url });
      else {
        await navigator.clipboard.writeText(`${texte}\n${url}`);
        if (noteDuel) (noteDuel.textContent = 'Lien du duel copié : envoyez-le à qui vous voulez.'), (noteDuel.hidden = false);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && noteDuel) (noteDuel.textContent = url), (noteDuel.hidden = false);
    }
  });
  const pseudoEl = document.getElementById(`${prefixe}-pseudo`) as HTMLInputElement | null;
  if (pseudoEl) pseudoEl.value = pseudoRetenu();
  $('natif').hidden = typeof navigator.share !== 'function';
  $('natif').addEventListener('click', () => {
    const r = resultat();
    if (r) navigator.share({ text: texteDuResultat(r), url: r.adresse }).catch(() => {});
  });
  $('copier').addEventListener('click', async () => {
    const bouton = $('copier');
    try {
      await navigator.clipboard.writeText($('apercu').textContent ?? '');
      bouton.textContent = 'Copié';
    } catch {
      bouton.textContent = 'Copie impossible : sélectionnez le texte';
    }
    setTimeout(() => (bouton.textContent = 'Copier'), 2500);
  });
  // Instagram n'a pas d'adresse de partage : une image, par le partage du
  // téléphone quand il accepte les fichiers, sinon enregistrée pour être
  // publiée depuis l'application.
  $('instagram').addEventListener('click', async () => {
    const r = resultat();
    if (!r) return;
    try {
      const blob = await imageDuResultat(r);
      const fichier = new File([blob], `rouages-defi-${r.jour}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], text: texteDuResultat(r) });
        note.hidden = true;
        return;
      }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fichier.name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      note.textContent = 'Image enregistrée : publiez-la depuis l’application Instagram, en story ou dans le fil.';
      note.hidden = false;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      note.textContent = 'L’image n’a pas pu être préparée sur cet appareil.';
      note.hidden = false;
    }
  });
  // Le suivi : la série, les sept derniers jours, le compte à rebours.
  let minuterie = 0;
  const suivre = (r: Resultat) => {
    noterResultat(jeu, r);
    const n = serie(jeu, r.jour);
    const palier = n >= 30 ? ' — un mois entier !' : n >= 7 ? ' — une semaine complète !' : n >= 3 ? ' — ça devient une habitude' : '';
    $('serie').textContent = n > 1 ? `🔥 ${n} jours de suite${palier}` : 'Premier jour de la série';
    $('serie').classList.toggle('jeu-serie-palier', n >= 3);
    const h = historique(jeu);
    const semaine = $('semaine');
    semaine.innerHTML = '';
    let jour = r.jour;
    const jours: string[] = [];
    for (let i = 0; i < 7; i++, jour = veille(jour)) jours.unshift(jour);
    for (const j of jours) {
      const li = document.createElement('li');
      const t = h[j];
      const nom = new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      li.className = t ? 'joue' : '';
      li.title = t ? `${dateLongue(j)} : ${t.score}${t.lieu ? `, ${t.lieu}` : ''}` : `${dateLongue(j)} : pas joué`;
      li.append(Object.assign(document.createElement('span'), { textContent: nom }), Object.assign(document.createElement('strong'), { textContent: t ? t.score.split(' ')[0] : '·' }));
      semaine.append(li);
    }
    const rebours = () => ($('rebours').textContent = `Prochain défi dans ${avantMinuit()}`);
    rebours();
    clearInterval(minuterie);
    minuterie = window.setInterval(rebours, 30_000);
  };

  /** La comparaison d'un duel reçu : deux barres qui avancent, et le verdict. */
  const comparer = (r: Resultat) => {
    const boite = document.getElementById(`${prefixe}-duel`);
    if (!boite) return;
    boite.hidden = true;
    if (!duel || duel.g !== jeu || duel.j !== r.jour || (duel.l ?? null) !== (r.lieu ?? null)) return;
    const moi = valeurScore(r.jeu, r.score);
    const lui = valeurScore(r.jeu, duel.s);
    const max = Math.max(moi, lui, 1);
    const qui = duel.n || 'Votre adversaire';
    boite.innerHTML = '';
    const couloir = (nom: string, score: string, cases: Case[], v: number, gagnant: boolean) => {
      const l = Object.assign(document.createElement('div'), { className: `pj-couloir${gagnant ? ' pj-couloir--gagnant' : ''}` });
      const barre = Object.assign(document.createElement('span'), { className: 'pj-couloir-barre' });
      barre.style.setProperty('--part', `${(v / max) * 100}%`);
      l.append(Object.assign(document.createElement('span'), { className: 'pj-couloir-nom', textContent: `${gagnant ? '🏆 ' : ''}${nom}` }), barre, Object.assign(document.createElement('span'), { className: 'pj-couloir-score', textContent: `${cases.map((c) => EMOJI[c]).join('')} ${score}` }));
      return l;
    };
    boite.append(
      Object.assign(document.createElement('p'), { className: 'pj-titre', textContent: '⚔️ Le duel' }),
      couloir('Vous', r.score, r.cases, moi, moi > lui),
      couloir(qui, duel.s, duel.c, lui, lui > moi),
      Object.assign(document.createElement('p'), { className: 'pj-verdict', textContent: moi > lui ? `Vous gagnez le duel contre ${duel.n || 'votre adversaire'} !` : moi < lui ? `${qui} gagne ce duel. Revanche demain ?` : 'Égalité parfaite.' }),
    );
    boite.hidden = false;
  };

  return (r: Resultat) => {
    comparer(r);
    suivre(r);
    if (reussie(r.cases)) feter();
    const texte = texteDuResultat(r);
    $('apercu').textContent = `${texte}\n${r.adresse}`;
    const complet = encodeURIComponent(`${texte}\n${r.adresse}`);
    $<HTMLAnchorElement>('x').href = `https://twitter.com/intent/tweet?text=${complet}`;
    $<HTMLAnchorElement>('bluesky').href = `https://bsky.app/intent/compose?text=${complet}`;
    $<HTMLAnchorElement>('facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(r.adresse)}`;
    $<HTMLAnchorElement>('whatsapp').href = `https://wa.me/?text=${complet}`;
    // LinkedIn ne reprend plus de texte : l'adresse seule, l'aperçu vient de la page.
    $<HTMLAnchorElement>('linkedin').href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(r.adresse)}`;
    note.hidden = true;
  };
}

/**
 * La progression d'une partie, sous le compteur : une pastille par manche,
 * de la couleur de son résultat une fois jouée, la manche en cours marquée.
 * L'élément se crée à la première fois, juste après `compteur`.
 */
export function progression(compteur: HTMLElement, faites: Case[], total: number): void {
  let barre = compteur.nextElementSibling as HTMLElement | null;
  if (!barre?.classList.contains('jeu-progres')) {
    barre = Object.assign(document.createElement('ol'), { className: 'jeu-progres' });
    barre.setAttribute('aria-hidden', 'true');
    compteur.after(barre);
  }
  barre.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const li = document.createElement('li');
    li.className = i < faites.length ? `fait ${faites[i]}` : i === faites.length ? 'encours' : '';
    barre.append(li);
  }
}

/**
 * Une pluie de confettis, une fois, pour une partie réussie : quelques
 * dizaines de rectangles aux couleurs des cases, dessinés sur une toile posée
 * au-dessus de la page, puis retirée. Rien pour qui a demandé à son système
 * de réduire les animations.
 */
export function feter(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const toile = Object.assign(document.createElement('canvas'), { className: 'jeu-confettis' });
  toile.setAttribute('aria-hidden', 'true');
  document.body.append(toile);
  const L = (toile.width = innerWidth);
  const H = (toile.height = innerHeight);
  const g = toile.getContext('2d')!;
  const couleurs = Object.values(COULEUR).concat('#1e5f74');
  const morceaux = Array.from({ length: 90 }, () => ({
    x: L / 2 + (Math.random() - 0.5) * L * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: couleurs[Math.floor(Math.random() * couleurs.length)],
  }));
  const debut = performance.now();
  const image = (t: number) => {
    g.clearRect(0, 0, L, H);
    for (const m of morceaux) {
      m.vy += 0.32;
      m.x += m.vx;
      m.y += m.vy;
      m.r += m.vr;
      g.save();
      g.translate(m.x, m.y);
      g.rotate(m.r);
      g.fillStyle = m.c;
      g.fillRect(-5, -3, 10, 6);
      g.restore();
    }
    if (t - debut < 2600) requestAnimationFrame(image);
    else toile.remove();
  };
  requestAnimationFrame(image);
}

/** Une partie réussie, assez pour qu'on la fête : quatre manches sur cinq au moins. */
export const reussie = (cases: Case[]) => cases.length > 0 && cases.filter((c) => c === 'vert').length / cases.length >= 0.8;
