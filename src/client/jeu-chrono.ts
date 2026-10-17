/**
 * Le chrono de l'interco, côté navigateur : nommer toutes les communes d'une
 * intercommunalité avant la fin du temps, la carte se remplissant à chaque
 * bonne réponse, comme sur Sporcle.
 *
 * Un nom se reconnaît sans les accents, les traits d'union ni l'article du
 * début : « mayet de montagne » vaut « Le Mayet-de-Montagne ». Le temps est
 * de quatre secondes par commune, une minute et demie au moins.
 */
import { aplatir } from './recherche-commune.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, feter, jourDuJeu, memoire, type Case, type Resultat } from './jeux-commun.ts';
import { carte, perimetre, type Communes } from './jeux-communes.ts';

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['interco'] };
const PAR_COMMUNE = 4;
const MINIMUM_S = 90;

/** Le nom tel qu'on le tape : aplati, sans l'article du début. */
export const cleNom = (nom: string) => aplatir(nom).replace(/^(le|la|les|l) /, '');

/** Cinq cases, chacune un cinquième des communes : 🟩 trouvé, 🟥 non. */
export function casesChrono(trouvees: number, total: number): Case[] {
  return Array.from({ length: 5 }, (_, i) => (trouvees >= ((i + 1) * total) / 5 ? 'vert' : trouvees > (i * total) / 5 ? 'jaune' : 'rouge'));
}

const duree = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function brancherChrono(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`jh-${id}`) as T;
  if (!$('carte')) return;
  brancherChampLieu('jh-lieu', LIEUX);
  const garde = memoire('rouages-jeu-chrono');
  const jour = jourDuJeu();
  const saisie = $<HTMLInputElement>('saisie');
  let lieu: Lieu | null = null;
  let codes: string[] = [];
  let data: Communes = { i: [], c: {} };
  let trouvees = new Set<string>();
  let parCle = new Map<string, string[]>();
  let total = 0;
  let reste = 0;
  let minuterie = 0;
  let enCours = false;
  let duJour = true;
  let utilise = 0;

  const message = (t: string) => {
    $('message').textContent = t;
    $('message').hidden = !t;
  };
  const resultat = (): Resultat | null =>
    lieu
      ? {
          jeu: 'Le chrono de l’interco',
          embleme: '⏱️',
          lieu: lieu.nom,
          jour,
          cases: casesChrono(trouvees.size, codes.length),
          score: `${trouvees.size}/${codes.length}${trouvees.size === codes.length ? ` en ${duree(utilise)}` : ''}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('jh', resultat, 'chrono');

  const dessinerCarte = (fin: boolean) => {
    const svg = carte(
      data,
      codes,
      (c) => `jh-c${trouvees.has(c) ? ' jh-c--trouvee' : fin ? ' jh-c--manquee' : ''}`,
      (c) => (trouvees.has(c) || fin ? data.c[c][0] : 'À trouver'),
    );
    svg.setAttribute('aria-label', `Carte des ${codes.length} communes : ${trouvees.size} trouvées`);
    svg.querySelectorAll('path').forEach((p, i) => p.setAttribute('data-code', codes[i]));
    $('carte').replaceChildren(svg);
  };
  const compter = () => {
    $('compte').textContent = `${trouvees.size} sur ${codes.length}`;
    $('temps').textContent = duree(reste);
    $('temps').classList.toggle('jh-temps--fin', reste <= 15 && enCours);
  };

  const terminer = () => {
    enCours = false;
    clearInterval(minuterie);
    saisie.disabled = true;
    utilise = total - reste;
    dessinerCarte(true);
    compter();
    const manquees = codes.filter((c) => !trouvees.has(c)).sort((a, b) => data.c[a][0].localeCompare(data.c[b][0], 'fr'));
    const r = resultat()!;
    $('score').textContent = r.score;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    $('verdict').textContent =
      manquees.length === 0
        ? `Toutes trouvées, en ${duree(utilise)}. Bravo !`
        : `Il manquait ${manquees.length === 1 ? 'une commune' : `${manquees.length} communes`} : ${manquees.map((c) => data.c[c][0]).join(', ')}.`;
    $('abandon').hidden = true;
    $('fin').hidden = false;
    $('partage').hidden = !duJour;
    if (duJour) {
      garde.ecrire(`${jour}:${lieu!.cle}`, { trouvees: [...trouvees], utilise });
      remplirPartage(r);
    } else if (manquees.length === 0) feter();
  };

  const lancer = (modeDuJour: boolean) => {
    duJour = modeDuJour;
    trouvees = new Set();
    total = Math.max(MINIMUM_S, codes.length * PAR_COMMUNE);
    reste = total;
    const deja = duJour ? garde.lire<{ trouvees: string[]; utilise: number }>(`${jour}:${lieu!.cle}`) : null;
    $('choix').hidden = true;
    $('fin').hidden = true;
    $('manche').hidden = false;
    $('abandon').hidden = false;
    // La carte reste à l'écran en fin de partie, les communes manquées en rouge.
    if (deja) {
      trouvees = new Set(deja.trouvees.filter((c) => data.c[c]));
      reste = total - deja.utilise;
      terminer();
      return;
    }
    enCours = true;
    saisie.disabled = false;
    saisie.value = '';
    dessinerCarte(false);
    compter();
    saisie.focus();
    const debut = Date.now();
    clearInterval(minuterie);
    minuterie = window.setInterval(() => {
      reste = Math.max(0, total - (Date.now() - debut) / 1000);
      compter();
      if (reste <= 0) terminer();
    }, 250);
  };

  saisie.addEventListener('input', () => {
    if (!enCours) return;
    const k = cleNom(saisie.value);
    const c = parCle.get(k)?.find((x) => !trouvees.has(x));
    if (!c) return;
    trouvees.add(c);
    saisie.value = '';
    dessinerCarte(false);
    const p = $('carte').querySelector(`path[data-code="${c}"]`);
    p?.classList.add('jh-c--nouvelle');
    const li = Object.assign(document.createElement('li'), { textContent: data.c[c][0] });
    $('liste').prepend(li);
    compter();
    if (trouvees.size === codes.length) terminer();
  });
  $('abandon').addEventListener('click', () => enCours && terminer());

  quandLieu(LIEUX, garde.lire<string>('lieu'), (demande) => {
    void (async () => {
      lieu = await resoudre(demande, LIEUX).catch(() => null);
      if (!lieu) return message('Cherchez une intercommunalité : communauté de communes, d’agglomération, métropole.');
      try {
        const p = await perimetre(lieu, 0);
        codes = p.codes;
        data = p.communes;
        if (codes.length < 2) return message('Cette intercommunalité compte trop peu de communes pour jouer.');
        parCle = new Map();
        for (const c of codes) {
          const k = cleNom(data.c[c][0]);
          parCle.set(k, [...(parCle.get(k) ?? []), c]);
        }
        garde.ecrire('lieu', lieu.cle);
        retenirLieu(lieu.cle);
        message('');
        $('liste').innerHTML = '';
        $('lieu-nom').textContent = lieu.nom;
        $('lieu-detail').textContent = ` : ${codes.length} communes, ${duree(Math.max(MINIMUM_S, codes.length * PAR_COMMUNE))} pour les nommer.`;
        $<HTMLButtonElement>('jouer').textContent = garde.lire(`${jour}:${lieu.cle}`) ? 'Revoir mon résultat du jour' : 'Lancer le chrono';
        $('choix').hidden = false;
        $('manche').hidden = true;
        $('fin').hidden = true;
      } catch {
        message('Les communes n’ont pas pu être lues. Réessayez dans un instant.');
      }
    })();
  });
  $('jouer').addEventListener('click', () => lancer(true));
  $('libre').addEventListener('click', () => {
    $('liste').innerHTML = '';
    lancer(false);
  });
}
