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
export function brancherPartage(prefixe: string, resultat: () => Resultat | null): (r: Resultat) => void {
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
  return (r: Resultat) => {
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
