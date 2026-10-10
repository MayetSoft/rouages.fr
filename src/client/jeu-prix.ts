/**
 * Le jeu des prix, côté navigateur.
 *
 * **Le défi du jour** : pour un lieu donné, les cinq mêmes ventes pour tout le
 * monde, tirées d'une graine faite de la date (à l'heure de Paris) et de la
 * clé du lieu. C'est ce qui rend un score comparable, donc partageable :
 * l'adresse partagée mène au même défi. Le résultat est gardé dans le
 * navigateur, et seulement là, pour qu'on retrouve son score en revenant —
 * ce qui empêche aussi de rejouer le défi jusqu'au sans-faute. Après, une
 * partie libre tire d'autres ventes, sans score à partager.
 *
 * Le tirage choisit d'abord une commune, puis une vente dans la commune : un
 * tirage parmi toutes les ventes ne montrerait presque que la préfecture.
 *
 * Les ventes ne sont lues qu'au clic sur « Jouer » : c'est la démarche
 * volontaire que demandent les conditions d'utilisation de DVF.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, resoudre, type Lieu } from './jeu-prix-lieu.ts';

/** [année, 0 maison ou 1 appartement, prix, surface, pièces, terrain] — voir `ventesDuJeu`. */
type VenteJeu = [number, 0 | 1, number, number, number, number];
/** Par commune : le nom, [prix médian d'une maison, prix médian au m² d'un appartement], les ventes. */
type CommuneJeu = { n: string; m: [number | null, number | null]; v: VenteJeu[] };
type FichierJeu = { maj: string; annees: number[]; c: Record<string, CommuneJeu> };

type Manche = { code: string; vente: VenteJeu; essai?: number; points?: number };
/** Ce que le navigateur garde d'un défi joué : les essais, rien d'autre. */
type Garde = { essais: number[] };

const MANCHES = 5;
const MEMOIRE = 'rouages-jeu-prix';
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const m2 = (x: number) => `${x.toLocaleString('fr-FR')} m²`;

/** 100 points pour le prix exact, 2 de moins par point d'écart. */
export function points(essai: number, prix: number): number {
  return Math.max(0, Math.round(100 - 200 * (Math.abs(essai - prix) / prix)));
}

/** Une case par vente, comme on en partage après un jeu du jour. */
export function carre(p: number): string {
  return p >= 80 ? '🟩' : p >= 50 ? '🟨' : p > 0 ? '🟧' : '🟥';
}

/** Les écritures qu'on tape : « 120 000 », « 120000 € », « 120k », « 1,2 M ». */
export function lireMontant(texte: string): number | null {
  const t = texte.toLowerCase().replace(/\s| | |€/g, '').replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return null;
  const x = Number(m[1]) * (m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1);
  return x > 0 ? x : null;
}

/** Le jour à Paris, AAAA-MM-JJ : le défi change à minuit pour tout le monde. */
export function jourDeParis(d = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Un générateur pseudo-aléatoire à graine (mulberry32), le même dans tous les navigateurs. */
function hasard(graine: string): () => number {
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

export function tirer(communes: Record<string, CommuneJeu>, codes: string[], alea: () => number): Manche[] {
  const tries = [...codes].sort();
  const vues = new Set<string>();
  const manches: Manche[] = [];
  const total = tries.reduce((s, c) => s + communes[c].v.length, 0);
  for (let essais = 0; manches.length < Math.min(MANCHES, total) && essais < 500; essais++) {
    const code = tries[Math.floor(alea() * tries.length)];
    const v = communes[code].v;
    const i = Math.floor(alea() * v.length);
    if (vues.has(`${code}|${i}`)) continue;
    vues.add(`${code}|${i}`);
    manches.push({ code, vente: v[i] });
  }
  return manches;
}

/** Les couleurs des cases, celles des carrés emoji qu'on partage en texte. */
const COULEUR_CASE = (p: number) => (p >= 80 ? '#2e9e5b' : p >= 50 ? '#e6b422' : p > 0 ? '#e8762c' : '#cf3b2f');

/**
 * L'image du résultat, pour Instagram qui ne prend pas de lien à partager :
 * le même contenu que le texte — lieu, date, cases, score, adresse —, sans
 * aucune vente. Au format portrait 4:5, celui du fil.
 */
async function imageDuResultat(lieu: string, date: string, pts: number[], adresse: string): Promise<Blob> {
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
  ligne('À combien s’est-elle vendue ?', 230, 64, '#17171a', 700);
  ligne(lieu, 420, 56, '#17171a', 600);
  ligne(`Défi du ${date}`, 490, 40, '#5f5c55');
  const cote = 150;
  const ecart = (L - 160 - cote * pts.length) / Math.max(1, pts.length - 1);
  for (const [i, p] of pts.entries()) {
    g.fillStyle = COULEUR_CASE(p);
    g.beginPath();
    g.roundRect(80 + i * (cote + ecart), 600, cote, cote, 22);
    g.fill();
  }
  const total = pts.reduce((a, b) => a + b, 0);
  ligne(`${total} / ${pts.length * 100}`, 960, 120, '#17171a', 700);
  ligne('points', 1030, 40, '#5f5c55');
  ligne('Saurez-vous faire mieux ?', 1170, 44, '#1e5f74', 600);
  ligne(adresse.replace(/^https?:\/\//, ''), 1240, 34, '#5f5c55');
  return new Promise((ok, ko) => toile.toBlob((b) => (b ? ok(b) : ko(new Error('image'))), 'image/png'));
}

function decrire(v: VenteJeu): string {
  const [, type, , surface, pieces, terrain] = v;
  const morceaux = [`${m2(surface)} habitables`];
  if (pieces > 0) morceaux.push(`${pieces} pièce${pieces > 1 ? 's' : ''}`);
  if (type === 0) {
    morceaux.push(
      terrain > 0
        ? terrain >= 10_000
          ? `${(terrain / 10_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ha de terrain`
          : `${m2(terrain)} de terrain`
        : 'sans terrain déclaré',
    );
  }
  return morceaux.join(' · ');
}

const lire = <T,>(cle: string): T | null => {
  try {
    const brut = localStorage.getItem(`${MEMOIRE}:${cle}`);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
};
const ecrire = (cle: string, valeur: unknown) => {
  try {
    localStorage.setItem(`${MEMOIRE}:${cle}`, JSON.stringify(valeur));
  } catch {
    /* navigation privée : le défi se rejouera, voilà tout */
  }
};

export function brancherJeuPrix(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const racine = $('jp');
  if (!racine) return;
  brancherChampLieu('jp-lieu');
  const choix = $('jp-choix')!;
  const manche = $('jp-manche')!;
  const essai = $<HTMLFormElement>('jp-essai')!;
  const saisie = $<HTMLInputElement>('jp-prix')!;
  const reponse = $('jp-reponse')!;
  const fin = $('jp-fin')!;
  const jouer = $<HTMLButtonElement>('jp-jouer')!;

  const fichiers = new Map<string, Promise<FichierJeu>>();
  const chargerDep = (dep: string) => {
    if (!fichiers.has(dep)) {
      const lecture = fetch(`/territoires/jeux/dvf/${dep}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<FichierJeu>;
      });
      // Un échec ne reste pas en mémoire : le clic suivant réessaie.
      lecture.catch(() => fichiers.delete(dep));
      fichiers.set(dep, lecture);
    }
    return fichiers.get(dep)!;
  };

  let lieu: Lieu | null = null;
  let communes: Record<string, CommuneJeu> = {};
  let annees: number[] = [];
  let partie: Manche[] = [];
  let courante = 0;
  let duJour = true;
  const jour = jourDeParis();
  const cleDuJour = () => `${jour}:${lieu!.cle}`;

  const message = (texte: string, liens: { cle: string; nom: string }[] = []) => {
    const p = $('jp-message')!;
    p.textContent = texte;
    for (const [i, l] of liens.entries()) {
      p.append(i === 0 ? ' Essayez ' : ' ou ', Object.assign(document.createElement('a'), { href: `?t=${l.cle}`, textContent: l.nom }));
    }
    if (liens.length) p.append('.');
    p.hidden = !texte;
  };

  const afficherManche = () => {
    const m = partie[courante];
    const [annee, type] = m.vente;
    $('jp-compteur')!.textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · vente ${courante + 1} sur ${partie.length}`;
    $('jp-bien')!.textContent = `${type === 0 ? 'Une maison' : 'Un appartement'} ${aLieu(communes[m.code].n)}, vendu${type === 0 ? 'e' : ''} en ${annee}`;
    $('jp-details')!.textContent = decrire(m.vente);
    reponse.hidden = true;
    essai.hidden = false;
    saisie.value = '';
    saisie.setCustomValidity('');
    manche.hidden = false;
    fin.hidden = true;
    saisie.focus();
  };

  const texteAPartager = (total: number) =>
    [
      'À combien s’est-elle vendue ? 🏠',
      `${lieu!.nom} · défi du ${new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `${partie.map((m) => carre(m.points ?? 0)).join('')} ${total}/${partie.length * 100}`,
    ].join('\n');
  const adresseAPartager = () => `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu!.cle)}`;

  const afficherFin = () => {
    const total = partie.reduce((s, m) => s + (m.points ?? 0), 0);
    $('jp-score')!.textContent = `${total} points sur ${partie.length * 100}`;
    $('jp-cases')!.textContent = partie.map((m) => carre(m.points ?? 0)).join('');
    const recap = $('jp-recap')!;
    recap.innerHTML = '';
    for (const m of partie) {
      const li = document.createElement('li');
      li.textContent = `${carre(m.points ?? 0)} ${m.vente[1] === 0 ? 'Maison' : 'Appartement'} ${aLieu(communes[m.code].n)} (${m.vente[0]}) : ${euros(m.vente[2])}, vous disiez ${euros(m.essai ?? 0)} — ${m.points} pt${(m.points ?? 0) > 1 ? 's' : ''}`;
      recap.append(li);
    }
    const partage = $('jp-partage')!;
    partage.hidden = !duJour;
    if (duJour) {
      const texte = texteAPartager(total);
      const adresse = adresseAPartager();
      $('jp-apercu')!.textContent = `${texte}\n${adresse}`;
      const complet = encodeURIComponent(`${texte}\n${adresse}`);
      $<HTMLAnchorElement>('jp-x')!.href = `https://twitter.com/intent/tweet?text=${complet}`;
      $<HTMLAnchorElement>('jp-bluesky')!.href = `https://bsky.app/intent/compose?text=${complet}`;
      $<HTMLAnchorElement>('jp-facebook')!.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(adresse)}`;
      $<HTMLAnchorElement>('jp-whatsapp')!.href = `https://wa.me/?text=${complet}`;
      // LinkedIn ne reprend plus de texte : l'adresse seule, l'aperçu vient de la page.
      $<HTMLAnchorElement>('jp-linkedin')!.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(adresse)}`;
      $('jp-natif')!.hidden = typeof navigator.share !== 'function';
    }
    $('jp-libre')!.textContent = duJour ? 'Une partie libre, avec d’autres ventes' : 'Une autre partie libre';
    manche.hidden = true;
    fin.hidden = false;
  };

  // Le lieu choisi : celui de l'adresse, ou le dernier joué.
  const demande = new URLSearchParams(location.search).get('t') ?? lire<string>('lieu');
  const preparer = async (cle: string) => {
    lieu = await resoudre(cle).catch(() => null);
    if (!lieu) {
      message('Ce lieu n’est pas reconnu. Cherchez une commune, un code postal, une intercommunalité ou un département.');
      return;
    }
    ecrire('lieu', lieu.cle);
    $('jp-lieu-nom')!.textContent = lieu.nom;
    const deja = lire<Garde>(cleDuJour());
    jouer.textContent = deja ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
    choix.hidden = false;
    message('');
  };
  if (demande) void preparer(demande);

  const lancer = async (modeDuJour: boolean) => {
    if (!lieu) return;
    jouer.disabled = true;
    try {
      const lus = await Promise.all(lieu.deps.map(chargerDep));
      communes = Object.assign({}, ...lus.map((f) => f.c));
      annees = lus[0]?.annees ?? [];
      const codes = (lieu.communes ?? Object.keys(communes)).filter((c) => communes[c]);
      if (codes.length === 0) {
        message(`Pas assez de ventes ${lieu.genre === 'commune' ? aLieu(lieu.nom) : 'ici'} pour une partie.`, lieu.replis);
        return;
      }
      message('');
      duJour = modeDuJour;
      partie = tirer(communes, codes, duJour ? hasard(cleDuJour()) : Math.random);
      courante = 0;
      const deja = duJour ? lire<Garde>(cleDuJour()) : null;
      if (deja && deja.essais.length === partie.length) {
        // Déjà joué aujourd'hui : on rend le résultat, on ne rejoue pas.
        for (const [i, m] of partie.entries()) {
          m.essai = deja.essais[i];
          m.points = points(m.essai, m.vente[2]);
        }
        afficherFin();
      } else afficherManche();
    } catch {
      message('Les ventes n’ont pas pu être lues. Réessayez dans un instant.');
    } finally {
      jouer.disabled = false;
    }
  };
  jouer.addEventListener('click', () => void lancer(true));
  $('jp-libre')!.addEventListener('click', () => void lancer(false));

  essai.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = lireMontant(saisie.value);
    if (x === null) {
      saisie.setCustomValidity('Un montant en euros, par exemple 120 000.');
      saisie.reportValidity();
      return;
    }
    const m = partie[courante];
    const prix = m.vente[2];
    m.essai = x;
    m.points = points(x, prix);
    const ecart = Math.round(((x - prix) / prix) * 100);
    const verdict = $('jp-verdict')!;
    verdict.innerHTML = '';
    const fort = document.createElement('strong');
    fort.textContent = `Vendu${m.vente[1] === 0 ? 'e' : ''} ${euros(prix)}`;
    verdict.append(
      fort,
      ` (arrondi au millier). Vous disiez ${euros(x)} : ${
        ecart === 0 ? 'dans le mille' : `${Math.abs(ecart)} % de ${ecart > 0 ? 'trop' : 'moins'}`
      }, ${m.points} point${m.points > 1 ? 's' : ''}.`,
    );
    const contexte = $('jp-contexte')!;
    contexte.innerHTML = '';
    // Les médianes que la page de la commune publie déjà : un repère, sur les trois ans.
    const { n, m: [mediane, m2Median] } = communes[m.code];
    const periode = annees.length ? `de ${annees[0]} à ${annees[annees.length - 1]}` : '';
    if (m.vente[1] === 0 && mediane) contexte.append(`Prix médian d’une maison ${aLieu(n)} ${periode} : ${euros(mediane)}. `);
    else if (m.vente[1] === 1 && m2Median) contexte.append(`Prix médian d’un appartement ${aLieu(n)} ${periode} : ${euros(m2Median)} le m². `);
    contexte.append(Object.assign(document.createElement('a'), { href: `/commune/${m.code}`, textContent: 'La page de la commune' }), '.');
    essai.hidden = true;
    reponse.hidden = false;
    if (duJour && courante + 1 === partie.length) ecrire(cleDuJour(), { essais: partie.map((p) => p.essai ?? 0) } satisfies Garde);
    $('jp-suivante')!.textContent = courante + 1 < partie.length ? 'Vente suivante' : 'Voir le score';
    $<HTMLButtonElement>('jp-suivante')!.focus();
  });

  $('jp-suivante')!.addEventListener('click', () => {
    courante++;
    if (courante < partie.length) afficherManche();
    else afficherFin();
  });

  $('jp-natif')!.addEventListener('click', () => {
    const total = partie.reduce((s, m) => s + (m.points ?? 0), 0);
    navigator.share({ text: texteAPartager(total), url: adresseAPartager() }).catch(() => {});
  });
  // Instagram n'a pas d'adresse de partage : une image, par le partage du
  // téléphone quand il accepte les fichiers, sinon enregistrée pour être
  // publiée depuis l'application.
  $('jp-instagram')!.addEventListener('click', async () => {
    const note = $('jp-note-image')!;
    const total = partie.reduce((s, m) => s + (m.points ?? 0), 0);
    const date = new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    try {
      const blob = await imageDuResultat(lieu!.nom, date, partie.map((m) => m.points ?? 0), adresseAPartager());
      const fichier = new File([blob], `rouages-defi-${jour}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [fichier] })) {
        await navigator.share({ files: [fichier], text: texteAPartager(total) });
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

  $('jp-copier')!.addEventListener('click', async () => {
    const bouton = $('jp-copier')!;
    try {
      await navigator.clipboard.writeText($('jp-apercu')!.textContent ?? '');
      bouton.textContent = 'Copié';
    } catch {
      bouton.textContent = 'Copie impossible : sélectionnez le texte';
    }
    setTimeout(() => (bouton.textContent = 'Copier'), 2500);
  });
}
