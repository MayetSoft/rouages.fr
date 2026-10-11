/**
 * Le jeu des prix, côté navigateur.
 *
 * **Le défi du jour** (voir `jeux-commun.ts`) : pour un lieu, les cinq mêmes
 * ventes pour tout le monde. Le résultat est gardé dans le navigateur, et
 * seulement là, pour qu'on retrouve son score en revenant — ce qui empêche
 * aussi de rejouer le défi jusqu'au sans-faute. Après, une partie libre tire
 * d'autres ventes, sans score à partager.
 *
 * Le tirage choisit d'abord une commune, puis une vente dans la commune : un
 * tirage parmi toutes les ventes ne montrerait presque que la préfecture.
 *
 * Les ventes ne sont lues qu'au clic sur « Jouer » : c'est la démarche
 * volontaire que demandent les conditions d'utilisation de DVF.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, hasard, jourDeParis, memoire, progression, type Case, type Resultat } from './jeux-commun.ts';

/** [année, 0 maison ou 1 appartement, prix, surface, pièces, terrain] — voir `ventesDuJeu`. */
type VenteJeu = [number, 0 | 1, number, number, number, number];
/** Par commune : le nom, [prix médian d'une maison, prix médian au m² d'un appartement], les ventes. */
type CommuneJeu = { n: string; m: [number | null, number | null]; v: VenteJeu[] };
type FichierJeu = { maj: string; annees: number[]; c: Record<string, CommuneJeu> };

type Manche = { code: string; vente: VenteJeu; essai?: number; points?: number };
/** Ce que le navigateur garde d'un défi joué : les essais, rien d'autre. */
type Garde = { essais: number[] };

const MANCHES = 5;
const LIEUX: OptionsLieu = { source: '/jeux/prix-territoires.json', genres: ['commune', 'cp', 'interco', 'departement'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const m2 = (x: number) => `${x.toLocaleString('fr-FR')} m²`;

/** 100 points pour le prix exact, 2 de moins par point d'écart. */
export function points(essai: number, prix: number): number {
  return Math.max(0, Math.round(100 - 200 * (Math.abs(essai - prix) / prix)));
}

export function caseDe(p: number): Case {
  return p >= 80 ? 'vert' : p >= 50 ? 'jaune' : p > 0 ? 'orange' : 'rouge';
}

/** Les écritures qu'on tape : « 120 000 », « 120000 € », « 120k », « 1,2 M ». */
export function lireMontant(texte: string): number | null {
  const t = texte.toLowerCase().replace(/\s| | |€/g, '').replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return null;
  const x = Number(m[1]) * (m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1);
  return x > 0 ? x : null;
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

export function brancherJeuPrix(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const racine = $('jp');
  if (!racine) return;
  brancherChampLieu('jp-lieu', LIEUX);
  const garde = memoire('rouages-jeu-prix');
  const choix = $('jp-choix')!;
  const manche = $('jp-manche')!;
  const essai = $<HTMLFormElement>('jp-essai')!;
  const saisie = $<HTMLInputElement>('jp-prix')!;
  const reponse = $('jp-reponse')!;
  const fin = $('jp-fin')!;
  const jouer = $<HTMLButtonElement>('jp-jouer')!;
  const curseur = $<HTMLInputElement>('jp-curseur')!;

  // Au téléphone, taper un montant est pénible : un curseur et des pas.
  const montrer = (x: number) => {
    saisie.value = Math.max(0, Math.round(x)).toLocaleString('fr-FR');
    curseur.value = String(x);
    saisie.setCustomValidity('');
  };
  curseur.addEventListener('input', () => montrer(Number(curseur.value)));
  saisie.addEventListener('input', () => {
    const x = lireMontant(saisie.value);
    if (x !== null) curseur.value = String(x);
    saisie.setCustomValidity('');
  });
  for (const b of document.querySelectorAll<HTMLButtonElement>('.jp-pas button')) {
    b.addEventListener('click', () => montrer((lireMontant(saisie.value) ?? Number(curseur.value)) + Number(b.dataset.pas)));
  }

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
  /** Le haut du curseur : la vente la plus chère du périmètre, arrondie, 300 000 € au moins. */
  let plafond = 500_000;
  let partie: Manche[] = [];
  let courante = 0;
  let duJour = true;
  const jour = jourDeParis();
  const cleDuJour = () => `${jour}:${lieu!.cle}`;

  const resultat = (): Resultat | null =>
    lieu && partie.length
      ? {
          jeu: 'À combien s’est-elle vendue ?',
          embleme: '🏠',
          lieu: lieu.nom,
          jour,
          cases: partie.map((m) => caseDe(m.points ?? 0)),
          score: `${partie.reduce((s, m) => s + (m.points ?? 0), 0)}/${partie.length * 100}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('jp', resultat, 'prix');

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
    progression($('jp-compteur')!, partie.slice(0, courante).map((x) => caseDe(x.points ?? 0)), partie.length);
    $('jp-bien')!.textContent = `${type === 0 ? 'Une maison' : 'Un appartement'} ${aLieu(communes[m.code].n)}, vendu${type === 0 ? 'e' : ''} en ${annee}`;
    $('jp-details')!.textContent = decrire(m.vente);
    reponse.hidden = true;
    essai.hidden = false;
    saisie.value = '';
    saisie.setCustomValidity('');
    curseur.max = String(plafond);
    curseur.value = String(Math.round(plafond / 3 / 1000) * 1000);
    manche.hidden = false;
    fin.hidden = true;
    saisie.focus();
  };

  const afficherFin = () => {
    const r = resultat()!;
    $('jp-score')!.textContent = r.score.replace('/', ' points sur ');
    $('jp-cases')!.textContent = r.cases.map((c) => EMOJI[c]).join('');
    const recap = $('jp-recap')!;
    recap.innerHTML = '';
    for (const m of partie) {
      const li = document.createElement('li');
      li.append(
        `${EMOJI[caseDe(m.points ?? 0)]} ${m.vente[1] === 0 ? 'Maison' : 'Appartement'} `,
        Object.assign(document.createElement('a'), { href: `/commune/${m.code}`, textContent: aLieu(communes[m.code].n) }),
        ` (${m.vente[0]}) : ${euros(m.vente[2])}, vous disiez ${euros(m.essai ?? 0)} — ${m.points} pt${(m.points ?? 0) > 1 ? 's' : ''}`,
      );
      recap.append(li);
    }
    $('jp-partage')!.hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('jp-libre')!.textContent = duJour ? 'Une partie libre, avec d’autres ventes' : 'Une autre partie libre';
    manche.hidden = true;
    fin.hidden = false;
  };

  // Le lieu choisi : celui de l'adresse, ou le dernier joué, ici ou dans un autre jeu.
  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) {
      message('Ce lieu n’est pas reconnu. Cherchez une commune, un code postal, une intercommunalité ou un département.');
      return;
    }
    garde.ecrire('lieu', lieu.cle);
    retenirLieu(lieu.cle);
    $('jp-lieu-nom')!.textContent = lieu.nom;
    jouer.textContent = garde.lire<Garde>(cleDuJour()) ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
    choix.hidden = false;
    message('');
  };
  quandLieu(LIEUX, garde.lire<string>('lieu'), (cle) => void preparer(cle));

  const lancer = async (modeDuJour: boolean) => {
    if (!lieu) return;
    jouer.disabled = true;
    try {
      const lus = await Promise.all(lieu.deps.map(chargerDep));
      communes = Object.assign({}, ...lus.map((f) => f.c));
      annees = lus[0]?.annees ?? [];
      const codes = (lieu.communes ?? Object.keys(communes)).filter((c) => communes[c]);
      const cher = Math.max(0, ...codes.flatMap((c) => communes[c].v.map((v) => v[2])));
      plafond = Math.max(300_000, Math.ceil((cher * 1.2) / 50_000) * 50_000);
      if (codes.length === 0) {
        message(`Pas assez de ventes ${lieu.genre === 'commune' ? aLieu(lieu.nom) : 'ici'} pour une partie.`, lieu.replis);
        return;
      }
      message('');
      duJour = modeDuJour;
      partie = tirer(communes, codes, duJour ? hasard(cleDuJour()) : Math.random);
      courante = 0;
      const deja = duJour ? garde.lire<Garde>(cleDuJour()) : null;
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
    progression($('jp-compteur')!, partie.slice(0, courante + 1).map((y) => caseDe(y.points ?? 0)), partie.length);
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
    if (m.vente[1] === 0 && mediane) contexte.append(`Prix médian d’une maison ${aLieu(n)} ${periode} : ${euros(mediane)}, le trait gris. `);
    else if (m.vente[1] === 1 && m2Median) contexte.append(`Prix médian d’un appartement ${aLieu(n)} ${periode} : ${euros(m2Median)} le m². `);
    contexte.append(Object.assign(document.createElement('a'), { href: `/commune/${m.code}`, textContent: 'La page de la commune' }), '.');
    dessinerEchelle(x, prix, m.vente[1] === 0 ? mediane : null);
    essai.hidden = true;
    reponse.hidden = false;
    if (duJour && courante + 1 === partie.length) garde.ecrire(cleDuJour(), { essais: partie.map((p) => p.essai ?? 0) } satisfies Garde);
    $('jp-suivante')!.textContent = courante + 1 < partie.length ? 'Vente suivante' : 'Voir le score';
    $<HTMLButtonElement>('jp-suivante')!.focus();
  });

  /** L'estimation, le prix et la médiane de la commune sur une même règle. */
  function dessinerEchelle(essai: number, prix: number, mediane: number | null) {
    const echelle = $('jp-echelle')!;
    echelle.innerHTML = '<div class="axe"></div>';
    const haut = Math.max(essai, prix, mediane ?? 0) * 1.12;
    const reperes: [string, number, string][] = [
      ['prix', prix, `vendue ${euros(prix)}`],
      ['essai', essai, `vous : ${euros(essai)}`],
    ];
    // La médiane, en simple trait : son montant est écrit dans la phrase qui suit, et deux étiquettes en bas se chevaucheraient.
    if (mediane) reperes.push(['mediane', mediane, '']);
    for (const [classe, v, texte] of reperes) {
      const r = document.createElement('div');
      // Le prix en haut, les autres en bas : les étiquettes ne se chevauchent pas.
      r.className = `repere ${classe}${classe === 'prix' ? '' : ' bas'}`;
      r.style.left = `${Math.min(96, Math.max(4, (v / haut) * 100))}%`;
      if (texte) r.append(Object.assign(document.createElement('span'), { textContent: texte }));
      echelle.append(r);
    }
  }

  $('jp-suivante')!.addEventListener('click', () => {
    courante++;
    if (courante < partie.length) afficherManche();
    else afficherFin();
  });
}
