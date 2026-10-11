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

/** Les jeux, par la clé de leur historique : leur nom et leur adresse. */
export const JEUX = {
  qui: { nom: 'Qui décide ?', adresse: '/jeux/qui-decide' },
  mystere: { nom: 'La commune mystère', adresse: '/jeux/commune-mystere' },
  plus: { nom: 'Plus ou moins', adresse: '/jeux/plus-ou-moins' },
  prix: { nom: 'À combien s’est-elle vendue ?', adresse: '/jeux/prix' },
  ordre: { nom: 'Le bon ordre', adresse: '/jeux/ordre' },
  argent: { nom: 'Où va l’argent ?', adresse: '/jeux/argent' },
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
  await document.fonts?.ready;
  const police = getComputedStyle(document.body).fontFamily || 'sans-serif';
  g.fillStyle = '#fbfaf8';
  g.fillRect(0, 0, L, H);
  g.fillStyle = '#1e5f74';
  g.fillRect(0, 0, L, 18);
  const ligne = (texte: string, y: number, taille: number, couleur: string, graisse = 400) => {
    g.font = `${graisse} ${taille}px ${police}`;
    g.fillStyle = couleur;
    // Un nom long se réduit plutôt que de sortir du cadre.
    let t = taille;
    while (g.measureText(texte).width > L - 160 && t > 24) g.font = `${graisse} ${(t -= 2)}px ${police}`;
    g.fillText(texte, 80, y);
  };
  ligne('Rouages · Jeux', 130, 36, '#5f5c55', 500);
  ligne(r.jeu, 230, 64, '#17171a', 700);
  if (r.lieu) ligne(r.lieu, 420, 56, '#17171a', 600);
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
  ligne(r.score, 960, 120, '#17171a', 700);
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
    $('serie').textContent = n > 1 ? `${n} jours de suite` : 'Premier jour de la série';
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

  return (r: Resultat) => {
    suivre(r);
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
