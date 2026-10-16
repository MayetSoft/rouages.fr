/**
 * Plus ou moins, côté navigateur : huit duels entre deux communes du
 * périmètre, chacun sur un indicateur que leurs deux pages renseignent.
 */
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, hasard, jourDuJeu, memoire, progression, type Resultat } from './jeux-commun.ts';
import { carte, nombre, perimetre, type Communes } from './jeux-communes.ts';

type Duel = { a: string; b: string; i: number; choix?: 1 | -1 };

const DUELS = 8;
const MINIMUM = 6;
/** Moins de 5 % d'écart, et le duel serait une loterie. */
const ECART = 0.05;
const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['cp', 'interco', 'departement'] };

export function brancherJeuPlus(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('jm')) return;
  brancherChampLieu('jm-lieu', LIEUX);
  const garde = memoire('rouages-jeu-plus');
  const jour = jourDuJeu();
  const jouer = $<HTMLButtonElement>('jm-jouer');

  let lieu: Lieu | null = null;
  let codes: string[] = [];
  let data: Communes;
  let partie: Duel[] = [];
  let courante = 0;
  let duJour = true;
  const cleDuJour = () => `${jour}:${lieu!.cle}`;
  const valeur = (code: string, i: number) => data.c[code][6][i];
  const juste = (d: Duel) => d.choix !== undefined && Math.sign(valeur(d.b, d.i)! - valeur(d.a, d.i)!) === d.choix;
  const ecrit = (code: string, i: number) => {
    const v = valeur(code, i)!;
    const unite = data.i[i][2];
    if (data.i[i][0] === 'ecoles') return `${v} école${v > 1 ? 's' : ''}`;
    if (data.i[i][0] === 'gare' && v === 0) return 'sa propre gare';
    return `${nombre(v)}${unite ? ` ${unite}` : ''}`;
  };

  const message = (texte: string) => {
    $('jm-message').textContent = texte;
    $('jm-message').hidden = !texte;
  };

  const resultat = (): Resultat | null =>
    lieu && partie.length
      ? {
          jeu: 'Plus ou moins',
          embleme: '⚖️',
          lieu: lieu.nom,
          jour,
          cases: partie.map((d) => (juste(d) ? 'vert' : 'rouge')),
          score: `${partie.filter(juste).length}/${partie.length}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('jm', resultat, 'plus');

  /** Huit duels : deux communes, un indicateur que les deux renseignent, et assez d'écart. */
  const tirer = (alea: () => number): Duel[] => {
    const duels: Duel[] = [];
    const vus = new Set<string>();
    for (let essais = 0; duels.length < DUELS && essais < 2000; essais++) {
      const a = codes[Math.floor(alea() * codes.length)];
      const b = codes[Math.floor(alea() * codes.length)];
      const i = Math.floor(alea() * data.i.length);
      const [va, vb] = [valeur(a, i), valeur(b, i)];
      if (a === b || va === null || vb === null || vus.has([a, b].sort().join(i + ''))) continue;
      // Pas la même commune deux duels de suite.
      const avant = duels.at(-1);
      if (avant && [avant.a, avant.b].some((x) => x === a || x === b)) continue;
      if (Math.abs(va - vb) <= ECART * Math.max(Math.abs(va), Math.abs(vb), 1)) continue;
      vus.add([a, b].sort().join(i + ''));
      duels.push({ a, b, i });
    }
    return duels;
  };

  const afficherDuel = () => {
    const d = partie[courante];
    const [, libelle, , source] = data.i[d.i];
    $('jm-compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · duel ${courante + 1} sur ${partie.length}`;
    progression($('jm-compteur'), partie.slice(0, courante).map((x) => (juste(x) ? 'vert' : 'rouge')), partie.length);
    $('jm-indicateur').textContent = libelle;
    $('jm-source').textContent = source;
    $('jm-a-nom').textContent = data.c[d.a][0];
    $('jm-a-valeur').textContent = ecrit(d.a, d.i);
    $('jm-b-nom').textContent = data.c[d.b][0];
    $('jm-b-valeur').textContent = '?';
    for (const b of $('jm-boutons').querySelectorAll('button')) {
      b.disabled = false;
      b.classList.remove('juste', 'faux');
    }
    $('jm-boutons').hidden = false;
    $('jm-reponse').hidden = true;
    $('jm-manche').hidden = false;
    $('jm-fin').hidden = true;
    ($('jm-boutons').querySelector('button') as HTMLButtonElement).focus();
  };

  const repondre = (sens: 1 | -1) => {
    const d = partie[courante];
    d.choix = sens;
    progression($('jm-compteur'), partie.slice(0, courante + 1).map((x) => (juste(x) ? 'vert' : 'rouge')), partie.length);
    $('jm-b-valeur').textContent = ecrit(d.b, d.i);
    for (const b of $('jm-boutons').querySelectorAll<HTMLButtonElement>('button')) {
      b.disabled = true;
      if (Number(b.dataset.sens) === sens) b.classList.add(juste(d) ? 'juste' : 'faux');
    }
    const plus = valeur(d.b, d.i)! > valeur(d.a, d.i)!;
    $('jm-verdict').innerHTML = '';
    $('jm-verdict').append(
      Object.assign(document.createElement('strong'), { textContent: juste(d) ? 'Juste. ' : 'Non. ' }),
      `${data.c[d.b][0]} : ${plus ? 'plus' : 'moins'}. `,
      Object.assign(document.createElement('a'), { href: `/commune/${d.b}`, textContent: 'Sa page' }),
      '.',
    );
    // Où sont les deux communes, dans le périmètre de la partie.
    const lieuCarte = $('jm-carte');
    lieuCarte.innerHTML = '';
    const svg = carte(data, codes, (c) => `jm-c${c === d.a ? ' jm-a' : c === d.b ? ' jm-b' : ''}`, (c) => data.c[c][0]);
    svg.setAttribute('aria-label', `${data.c[d.a][0]} et ${data.c[d.b][0]} sur la carte des communes de la partie`);
    lieuCarte.append(svg, Object.assign(document.createElement('p'), { className: 'jeu-contexte', textContent: `En gris foncé, ${data.c[d.a][0]} ; en couleur, ${data.c[d.b][0]}.` }));
    $('jm-reponse').hidden = false;
    if (duJour && courante + 1 === partie.length) garde.ecrire(cleDuJour(), { choix: partie.map((x) => x.choix ?? 0) });
    $('jm-suivante').textContent = courante + 1 < partie.length ? 'Duel suivant' : 'Voir le score';
    $<HTMLButtonElement>('jm-suivante').focus();
  };
  for (const b of $('jm-boutons').querySelectorAll<HTMLButtonElement>('button')) {
    b.addEventListener('click', () => repondre(Number(b.dataset.sens) as 1 | -1));
  }

  const afficherFin = () => {
    const r = resultat()!;
    $('jm-score').textContent = r.score.replace('/', ' sur ');
    $('jm-cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    const recap = $('jm-recap');
    recap.innerHTML = '';
    for (const d of partie) {
      const li = document.createElement('li');
      const lien = (code: string) => Object.assign(document.createElement('a'), { href: `/commune/${code}`, textContent: data.c[code][0] });
      li.append(`${juste(d) ? EMOJI.vert : EMOJI.rouge} ${data.i[d.i][1]} : `, lien(d.a), `, ${ecrit(d.a, d.i)} ; `, lien(d.b), `, ${ecrit(d.b, d.i)}`);
      recap.append(li);
    }
    $('jm-partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('jm-manche').hidden = true;
    $('jm-fin').hidden = false;
  };

  const lancer = async (modeDuJour: boolean) => {
    if (!lieu) return;
    jouer.disabled = true;
    try {
      duJour = modeDuJour;
      partie = tirer(duJour ? hasard(`${cleDuJour()}:plus`) : Math.random);
      if (partie.length < DUELS) {
        message('Pas assez de communes ici pour huit duels : essayez l’intercommunalité ou le département.');
        return;
      }
      courante = 0;
      const deja = duJour ? garde.lire<{ choix: (1 | -1 | 0)[] }>(cleDuJour()) : null;
      if (deja && deja.choix.length === partie.length) {
        for (const [i, d] of partie.entries()) d.choix = deja.choix[i] || undefined;
        afficherFin();
      } else afficherDuel();
    } finally {
      jouer.disabled = false;
    }
  };

  quandLieu(LIEUX, garde.lire<string>('lieu'), (demande) => {
    void (async () => {
      lieu = await resoudre(demande, LIEUX).catch(() => null);
      if (!lieu) return message('Cherchez un code postal, une intercommunalité, un département, ou votre commune.');
      try {
        const p = await perimetre(lieu, MINIMUM);
        codes = p.codes;
        data = p.communes;
        garde.ecrire('lieu', lieu.cle);
        retenirLieu(lieu.cle);
        $('jm-lieu-nom').textContent = lieu.nom;
        $('jm-lieu-detail').textContent = `(${codes.length} communes${p.elargi ? ', voisines comprises' : ''})`;
        jouer.textContent = garde.lire(cleDuJour()) ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
        $('jm-choix').hidden = false;
      } catch {
        message('Les communes n’ont pas pu être lues. Réessayez dans un instant.');
      }
    })();
  });
  jouer.addEventListener('click', () => void lancer(true));
  $('jm-libre').addEventListener('click', () => void lancer(false));
  $('jm-suivante').addEventListener('click', () => {
    courante++;
    if (courante < partie.length) afficherDuel();
    else afficherFin();
  });
}
