/**
 * Le budget de ma commune, côté navigateur : cent jetons à répartir entre six
 * postes, puis la comparaison avec les vrais chiffres de la commune, ramenés à
 * cent euros (`/jeux/budget/XX.json`). Une case par poste selon l'écart ; le
 * score est sur cent : cent moins la moitié des écarts additionnés.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, feter, jourDeParis, memoire, type Case, type Resultat } from './jeux-commun.ts';

const POSTES: [string, string, string][] = [
  ['👷', 'Payer les agents', 'cantine, entretien, secrétariat de mairie…'],
  ['🛒', 'Acheter ce qu’il faut', 'électricité, chauffage, fournitures, repas…'],
  ['🏗️', 'Construire et réparer', 'routes, écoles, salles, terrains…'],
  ['🤝', 'Aider et participer', 'associations, pompiers, communes voisines…'],
  ['🏦', 'Rembourser les emprunts', 'l’argent emprunté pour construire, et ses intérêts'],
  ['📦', 'Le reste', 'tout ce qui ne rentre pas ailleurs'],
];
const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
type Fichier = { annee: number | null; c: Record<string, number[]> };

export function brancherBudget(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`jb-${id}`) as T;
  if (!$('postes')) return;
  brancherChampLieu('jb-lieu', LIEUX);
  const garde = memoire('rouages-jeu-budget');
  const jour = jourDeParis();
  let lieu: Lieu | null = null;
  let vrais: number[] = [];
  let annee: number | null = null;
  let jetons = POSTES.map(() => 0);
  let duJour = true;

  const ecarts = () => jetons.map((j, i) => Math.abs(j - vrais[i]));
  const cases = (): Case[] => ecarts().map((e) => (e <= 5 ? 'vert' : e <= 10 ? 'jaune' : e <= 20 ? 'orange' : 'rouge'));
  const points = () => Math.max(0, 100 - Math.round(ecarts().reduce((s, e) => s + e, 0) / 2));
  const resultat = (): Resultat | null =>
    lieu ? { jeu: 'Le budget de ma commune', embleme: '💶', lieu: lieu.nom, jour, cases: cases(), score: `${points()}/100`, adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}` } : null;
  const remplirPartage = brancherPartage('jb', resultat, 'budget');

  const message = (t: string) => {
    $('message').textContent = t;
    $('message').hidden = !t;
  };

  const dessiner = () => {
    const ul = $('postes');
    ul.innerHTML = '';
    const total = jetons.reduce((s, x) => s + x, 0);
    POSTES.forEach(([emoji, nom, detail], i) => {
      const li = document.createElement('li');
      const tete = Object.assign(document.createElement('span'), { className: 'budget-nom' });
      tete.append(Object.assign(document.createElement('span'), { className: 'budget-emoji', textContent: emoji }), Object.assign(document.createElement('strong'), { textContent: nom }), Object.assign(document.createElement('small'), { textContent: detail }));
      const reglage = Object.assign(document.createElement('span'), { className: 'budget-reglage' });
      const bouton = (signe: string, pas: number, etiquette: string) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'plat budget-pas', textContent: signe });
        b.setAttribute('aria-label', `${etiquette} — ${nom}`);
        b.disabled = pas < 0 ? jetons[i] + pas < 0 : total + pas > 100;
        b.addEventListener('click', () => {
          jetons[i] = Math.max(0, Math.min(100, jetons[i] + pas));
          dessiner();
        });
        return b;
      };
      reglage.append(
        bouton('−5', -5, 'Enlever cinq jetons'),
        bouton('−', -1, 'Enlever un jeton'),
        Object.assign(document.createElement('output'), { className: 'budget-valeur', textContent: String(jetons[i]) }),
        bouton('+', 1, 'Ajouter un jeton'),
        bouton('+5', 5, 'Ajouter cinq jetons'),
      );
      const barre = Object.assign(document.createElement('span'), { className: 'budget-barre' });
      barre.style.setProperty('--part', `${jetons[i]}%`);
      li.append(tete, reglage, barre);
      ul.append(li);
    });
    $('reste').textContent = total === 100 ? 'Les 100 jetons sont placés !' : `Il te reste ${100 - total} jeton${100 - total > 1 ? 's' : ''} à placer.`;
    $<HTMLButtonElement>('valider').disabled = total !== 100;
  };

  const afficherFin = () => {
    const r = resultat()!;
    $('score').textContent = `${points()} points sur 100`;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    $('bravo').textContent = points() >= 85 ? 'Bravo, tu connais bien ta commune !' : points() >= 65 ? 'Pas mal du tout !' : 'Les vrais chiffres surprennent souvent : regarde ci-dessous.';
    const ul = $('compare');
    ul.innerHTML = '';
    POSTES.forEach(([emoji, nom], i) => {
      const li = document.createElement('li');
      li.append(
        Object.assign(document.createElement('span'), { className: 'budget-nom', textContent: `${EMOJI[r.cases[i]]} ${emoji} ${nom}` }),
        Object.assign(document.createElement('span'), { className: 'budget-chiffres', textContent: `toi : ${jetons[i]} € · la commune : ${vrais[i]} €` }),
      );
      const b1 = Object.assign(document.createElement('span'), { className: 'budget-barre budget-barre--toi' });
      b1.style.setProperty('--part', `${jetons[i]}%`);
      const b2 = Object.assign(document.createElement('span'), { className: 'budget-barre budget-barre--vrai' });
      b2.style.setProperty('--part', `${vrais[i]}%`);
      li.append(b1, b2);
      ul.append(li);
    });
    const c = $('contexte');
    c.innerHTML = '';
    c.append(
      `D’après les comptes ${annee ? `de ${annee} ` : ''}publiés par l’OFGL, ramenés à 100 €. `,
      Object.assign(document.createElement('a'), { href: `/commune/${lieu!.cle.slice(2)}#comptes`, textContent: `Les comptes ${aLieu(lieu!.nom).replace(/^à /, 'de ').replace(/^au /, 'du ').replace(/^aux /, 'des ')}` }),
    );
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('manche').hidden = true;
    $('fin').hidden = false;
    if (points() >= 85) feter();
  };

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return message('Cherche ta commune par son nom ou son code postal.');
    garde.ecrire('lieu', lieu.cle);
    retenirLieu(lieu.cle);
    try {
      const r = await fetch(`/jeux/budget/${lieu.deps[0]}.json`);
      if (!r.ok) throw new Error(String(r.status));
      const f = (await r.json()) as Fichier;
      const v = f.c[lieu.cle.slice(4)];
      if (!v) return message(`Les comptes ${aLieu(lieu.nom).replace(/^à /, 'de ')} ne sont pas publiés : essaie une commune voisine.`);
      vrais = v;
      annee = f.annee;
    } catch {
      return message('Les chiffres n’ont pas pu être lus. Réessaie dans un instant.');
    }
    message('');
    $('titre').textContent = `${lieu.nom} : comment dépense-t-elle 100 € ?`;
    $('compteur').textContent = `Défi du jour · ${lieu.nom}`;
    duJour = true;
    const deja = garde.lire<number[]>(`${jour}:${lieu.cle}`);
    if (deja && deja.length === POSTES.length) {
      jetons = deja;
      return afficherFin();
    }
    jetons = POSTES.map(() => 0);
    $('fin').hidden = true;
    $('manche').hidden = false;
    dessiner();
  };

  $('valider').addEventListener('click', () => {
    if (lieu && duJour) garde.ecrire(`${jour}:${lieu.cle}`, jetons);
    afficherFin();
  });
  $('rejouer').addEventListener('click', () => {
    duJour = false;
    jetons = POSTES.map(() => 0);
    $('fin').hidden = true;
    $('manche').hidden = false;
    $('compteur').textContent = `Partie libre · ${lieu?.nom ?? ''}`;
    dessiner();
  });
  quandLieu(LIEUX, garde.lire<string>('lieu'), (cle) => void preparer(cle));
}
