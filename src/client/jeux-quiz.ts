/**
 * Un quiz, côté navigateur : le moteur commun des jeux pour les plus jeunes
 * — « À qui je demande ? », « Vrai ou faux », « Le puzzle de la carte ».
 *
 * Un défi du jour, le même pour tout le monde (pas de lieu à choisir : un
 * enfant joue tout de suite), puis des parties libres. Une case par question,
 * 🟩 juste, 🟥 faux ; à chaque réponse, une phrase qui explique et la fiche
 * d'où elle vient. Le composant `QuizJeu.astro` porte le balisage.
 *
 * Une question peut se répondre par des boutons (le cas ordinaire) ou par un
 * rendu à soi — une carte où l'on clique —, que le jeu fournit.
 */
import {
  brancherPartage,
  EMOJI,
  feter,
  hasard,
  jourDeParis,
  memoire,
  progression,
  reussie,
  type Case,
  type CleJeu,
  type Resultat,
} from './jeux-commun.ts';

export interface OptionQuiz {
  texte: string;
  emoji?: string;
  detail?: string;
  juste: boolean;
}

export interface QuestionQuiz {
  /** Un grand emoji au-dessus de la question. */
  emoji?: string;
  question: string;
  sous?: string;
  options: OptionQuiz[];
  /** Après la réponse : ce qu'il fallait savoir, en une ou deux phrases. */
  explication: string;
  lien?: { href: string; texte: string };
  /** Pour le récapitulatif de fin. */
  recap: string;
  /**
   * Un rendu à soi à la place des boutons : il reçoit la zone où dessiner et
   * la fonction à appeler avec l'indice de l'option choisie. Après la
   * réponse, `montrer` reçoit l'indice choisi pour marquer le juste et le faux.
   */
  rendu?: (zone: HTMLElement, repondre: (i: number) => void) => { montrer: (choix: number) => void };
}

export interface ReglageQuiz {
  prefixe: string;
  cle: CleJeu;
  jeu: string;
  embleme: string;
  /** Les questions d'une partie, tirées avec `alea` : le même tirage pour tout le monde le même jour. */
  tirer: (alea: () => number) => QuestionQuiz[] | Promise<QuestionQuiz[]>;
  /** Le mot de la fin, selon le score. */
  bravo?: (justes: number, total: number) => string;
}

export function brancherQuiz(r: ReglageQuiz): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`${r.prefixe}-${id}`) as T;
  if (!$('manche')) return;
  const garde = memoire(`rouages-jeu-${r.cle}`);
  const jour = jourDeParis();
  let partie: (QuestionQuiz & { choix?: number })[] = [];
  let courante = 0;
  let duJour = true;
  let rendu: { montrer: (choix: number) => void } | null = null;

  const juste = (q: QuestionQuiz & { choix?: number }) => q.choix !== undefined && q.options[q.choix]?.juste === true;
  const cases = (): Case[] => partie.filter((q) => q.choix !== undefined).map((q) => (juste(q) ? 'vert' : 'rouge'));

  const resultat = (): Resultat | null =>
    partie.length
      ? {
          jeu: r.jeu,
          embleme: r.embleme,
          lieu: null,
          jour,
          cases: cases(),
          score: `${partie.filter(juste).length}/${partie.length}`,
          adresse: `${location.origin}${location.pathname}`,
        }
      : null;
  const remplirPartage = brancherPartage(r.prefixe, resultat, r.cle);

  const afficherQuestion = () => {
    const q = partie[courante];
    $('compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · ${courante + 1} sur ${partie.length}`;
    progression($('compteur'), cases(), partie.length);
    $('emoji').textContent = q.emoji ?? '';
    $('emoji').hidden = !q.emoji;
    $('question').textContent = q.question;
    $('sous').textContent = q.sous ?? '';
    $('sous').hidden = !q.sous;
    const ul = $('options');
    const zone = $('zone');
    ul.innerHTML = '';
    zone.innerHTML = '';
    rendu = null;
    if (q.rendu) {
      ul.hidden = true;
      zone.hidden = false;
      rendu = q.rendu(zone, repondre);
    } else {
      ul.hidden = false;
      zone.hidden = true;
      q.options.forEach((o, i) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'jeu-option quiz-option' });
        if (o.emoji) b.append(Object.assign(document.createElement('span'), { className: 'quiz-option-emoji', textContent: o.emoji }));
        const t = document.createElement('span');
        t.append(Object.assign(document.createElement('strong'), { textContent: o.texte }));
        if (o.detail) t.append(Object.assign(document.createElement('small'), { textContent: o.detail }));
        b.append(t);
        b.addEventListener('click', () => repondre(i));
        const li = document.createElement('li');
        li.append(b);
        ul.append(li);
      });
      (ul.querySelector('button') as HTMLButtonElement | null)?.focus();
    }
    $('reponse').hidden = true;
    $('manche').hidden = false;
    $('fin').hidden = true;
  };

  const repondre = (i: number) => {
    const q = partie[courante];
    if (q.choix !== undefined) return;
    q.choix = i;
    progression($('compteur'), cases(), partie.length);
    if (rendu) rendu.montrer(i);
    else {
      for (const [k, b] of [...$('options').querySelectorAll('button')].entries()) {
        b.disabled = true;
        if (q.options[k].juste) b.classList.add('juste');
        else if (k === i) b.classList.add('faux');
      }
    }
    const v = $('verdict');
    v.innerHTML = '';
    v.append(Object.assign(document.createElement('strong'), { textContent: juste(q) ? 'Bravo ! ' : 'Pas tout à fait. ' }), q.explication);
    const c = $('contexte');
    c.innerHTML = '';
    if (q.lien) c.append(Object.assign(document.createElement('a'), { href: q.lien.href, textContent: q.lien.texte }));
    $('reponse').hidden = false;
    if (duJour && courante + 1 === partie.length) garde.ecrire(jour, partie.map((x) => x.choix ?? null));
    $('suivante').textContent = courante + 1 < partie.length ? 'Question suivante' : 'Voir mon score';
    $<HTMLButtonElement>('suivante').focus();
  };

  const afficherFin = () => {
    const res = resultat()!;
    const n = partie.filter(juste).length;
    $('score').textContent = `${n} sur ${partie.length}`;
    $('cases').textContent = res.cases.map((c) => EMOJI[c]).join('');
    $('bravo').textContent = r.bravo?.(n, partie.length) ?? '';
    const recap = $('recap');
    recap.innerHTML = '';
    for (const q of partie) {
      const li = document.createElement('li');
      li.append(`${juste(q) ? EMOJI.vert : EMOJI.rouge} ${q.recap}`);
      if (q.lien) li.append(' — ', Object.assign(document.createElement('a'), { href: q.lien.href, textContent: 'la fiche' }));
      recap.append(li);
    }
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(res);
    $('manche').hidden = true;
    $('fin').hidden = false;
    if (reussie(res.cases)) feter();
  };

  const lancer = async (modeDuJour: boolean) => {
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${jour}:${r.cle}`) : Math.random;
    partie = (await r.tirer(alea)).map((q) => ({ ...q }));
    courante = 0;
    $('debut').hidden = true;
    const deja = duJour ? garde.lire<(number | null)[]>(jour) : null;
    if (deja && deja.length === partie.length) {
      partie.forEach((q, i) => (q.choix = deja[i] ?? undefined));
      afficherFin();
    } else afficherQuestion();
  };

  $<HTMLButtonElement>('jouer').textContent = garde.lire(jour) ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
  $('jouer').addEventListener('click', () => void lancer(true));
  $('libre').addEventListener('click', () => void lancer(false));
  $('suivante').addEventListener('click', () => {
    courante++;
    if (courante < partie.length) afficherQuestion();
    else afficherFin();
  });
}
