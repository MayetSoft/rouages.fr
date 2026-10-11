/**
 * Qui décide ?, côté navigateur : cinq compétences d'une commune, et pour
 * chacune le choix entre la commune, son intercommunalité, un syndicat, le
 * département et la région.
 *
 * Un syndicat figure toujours parmi les choix, qu'il soit la réponse ou non :
 * sans quoi sa seule présence la trahirait.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, hasard, jourDeParis, melanger, memoire, type Resultat } from './jeux-commun.ts';

type Genre = 'T' | 'L' | 'C' | 'R' | 'D' | 'E';
type Reponse = [number, Genre, ...number[]];
type Fichier = {
  maj: string | null;
  departement: string;
  region: string | null;
  k: [string, string, string][];
  s: [string, string, string, number][];
  c: Record<string, [string, number, number[], Reponse[]]>;
};
/** Une option : `C`, `D`, `R`, `E`, ou l'indice d'un groupement. */
type Option = Genre | number;
type Question = { reponse: Reponse; options: Option[]; choix?: Option };

const QUESTIONS = 5;
const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };

export function brancherJeuQui(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('jq')) return;
  brancherChampLieu('jq-lieu', LIEUX);
  const garde = memoire('rouages-jeu-qui');
  const jour = jourDeParis();
  const jouer = $<HTMLButtonElement>('jq-jouer');
  const fichiers = new Map<string, Promise<Fichier>>();
  const charger = (dep: string) => {
    if (!fichiers.has(dep)) {
      const l = fetch(`/jeux/qui-decide/${dep}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<Fichier>;
      });
      l.catch(() => fichiers.delete(dep));
      fichiers.set(dep, l);
    }
    return fichiers.get(dep)!;
  };

  let lieu: Lieu | null = null;
  let f: Fichier;
  let commune: Fichier['c'][string];
  let partie: Question[] = [];
  let courante = 0;
  let duJour = true;
  const cleDuJour = () => `${jour}:${lieu!.cle}`;

  const libelle = (o: Option): string => {
    if (typeof o === 'number') return `${f.s[o][1]} (${f.s[o][2].toLowerCase()})`;
    return {
      C: `La commune — ${commune[0]}`,
      D: `Le département — ${f.departement}`,
      R: `La région${f.region ? ` — ${f.region}` : ''}`,
      E: 'L’État',
      T: '',
      L: '',
    }[o];
  };
  const justes = (r: Reponse): Option[] => (r[1] === 'T' || r[1] === 'L' ? (r.slice(2) as number[]) : [r[1]]);
  const estJuste = (q: Question) => q.choix !== undefined && justes(q.reponse).includes(q.choix);

  const message = (texte: string) => {
    $('jq-message').textContent = texte;
    $('jq-message').hidden = !texte;
  };

  const resultat = (): Resultat | null =>
    lieu && partie.length
      ? {
          jeu: 'Qui décide ?',
          embleme: '🏛️',
          lieu: lieu.nom,
          jour,
          cases: partie.map((q) => (estJuste(q) ? 'vert' : 'rouge')),
          score: `${partie.filter(estJuste).length}/${partie.length}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('jq', resultat, 'qui');

  /** Les choix d'une question : la commune, son intercommunalité, un syndicat, le département, la région. */
  const options = (r: Reponse, alea: () => number): Option[] => {
    const [, fp, autres] = commune;
    const o: Option[] = ['C'];
    if (fp >= 0) o.push(fp);
    const syndicats = justes(r).filter((x): x is number => typeof x === 'number' && x !== fp);
    const leurre = melanger(autres.filter((x) => x !== fp), alea)[0];
    if (syndicats.length) o.push(syndicats[0]);
    else if (leurre !== undefined) o.push(leurre);
    o.push('D', 'R');
    if (r[1] === 'E') o.push('E');
    return o;
  };

  const afficherQuestion = () => {
    const q = partie[courante];
    const [k] = q.reponse;
    $('jq-compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · question ${courante + 1} sur ${partie.length}`;
    $('jq-question').textContent = f.k[k][1];
    $('jq-sous').textContent = `${aLieu(commune[0]).replace(/^./, (c) => c.toUpperCase())}, qui s’en occupe ?`;
    const ul = $('jq-options');
    ul.innerHTML = '';
    for (const o of q.options) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jeu-option';
      b.textContent = libelle(o);
      b.addEventListener('click', () => repondre(o));
      li.append(b);
      ul.append(li);
    }
    $('jq-reponse').hidden = true;
    $('jq-manche').hidden = false;
    $('jq-fin').hidden = true;
    (ul.querySelector('button') as HTMLButtonElement | null)?.focus();
  };

  const explication = (r: Reponse): string => {
    const liste = justes(r);
    const qui = liste.map(libelle).join(', ');
    const lui = liste.length > 1 ? 'leur' : 'lui';
    switch (r[1]) {
      case 'T':
        return `${qui} : la commune le ${lui} a transféré, d’après le registre national BANATIC.`;
      case 'L':
        return `${qui} : la loi le ${lui} transfère de plein droit, que le registre l’enregistre ou non.`;
      case 'C':
        return `${qui} : aucun transfert n’est déclaré au registre, la commune le garde.`;
      default:
        return `${qui} : personne ne l’exerce sur place, et la loi le confie à cet échelon à défaut.`;
    }
  };

  const repondre = (o: Option) => {
    const q = partie[courante];
    q.choix = o;
    const bons = justes(q.reponse);
    for (const [i, b] of [...$('jq-options').querySelectorAll('button')].entries()) {
      b.disabled = true;
      if (bons.includes(q.options[i])) b.classList.add('juste');
      else if (q.options[i] === o) b.classList.add('faux');
    }
    $('jq-verdict').innerHTML = '';
    $('jq-verdict').append(Object.assign(document.createElement('strong'), { textContent: estJuste(q) ? 'Juste. ' : 'Non. ' }), explication(q.reponse));
    const contexte = $('jq-contexte');
    contexte.textContent = '';
    const [id, nom, resume] = f.k[q.reponse[0]];
    // Ce que recouvre la compétence, d'après sa fiche : la réponse apprend quelque chose.
    if (resume) contexte.append(Object.assign(document.createElement('span'), { className: 'jeu-resume', textContent: resume }), ' ');
    contexte.append(
      Object.assign(document.createElement('a'), { href: `/n/${id}`, textContent: `La fiche « ${nom} »` }),
      ' · ',
      Object.assign(document.createElement('a'), { href: `/commune/${lieu!.cle.slice(2)}`, textContent: 'la page de la commune' }),
    );
    $('jq-reponse').hidden = false;
    if (duJour && courante + 1 === partie.length) garde.ecrire(cleDuJour(), { choix: partie.map((x) => x.choix ?? null) });
    $('jq-suivante').textContent = courante + 1 < partie.length ? 'Question suivante' : 'Voir le score';
    $<HTMLButtonElement>('jq-suivante').focus();
  };

  const afficherFin = () => {
    const r = resultat()!;
    $('jq-score').textContent = `${r.score.replace('/', ' sur ')}`;
    $('jq-cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    const recap = $('jq-recap');
    recap.innerHTML = '';
    for (const q of partie) {
      const li = document.createElement('li');
      const [id, nom] = f.k[q.reponse[0]];
      li.append(
        `${estJuste(q) ? EMOJI.vert : EMOJI.rouge} `,
        Object.assign(document.createElement('a'), { href: `/n/${id}`, textContent: nom }),
        ` : ${justes(q.reponse).map(libelle).join(', ')}`,
      );
      recap.append(li);
    }
    $('jq-partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('jq-manche').hidden = true;
    $('jq-fin').hidden = false;
  };

  const lancer = async (modeDuJour: boolean) => {
    if (!lieu) return;
    jouer.disabled = true;
    try {
      f = await charger(lieu.deps[0]);
      const code = lieu.cle.slice(2);
      if (!f.c[code]) {
        message(`Trop peu de compétences tranchées ${aLieu(lieu.nom)} pour une partie.`);
        return;
      }
      commune = f.c[code];
      message('');
      duJour = modeDuJour;
      const alea = duJour ? hasard(`${cleDuJour()}:qui`) : Math.random;
      partie = melanger(commune[3], alea)
        .slice(0, QUESTIONS)
        .map((reponse) => ({ reponse, options: options(reponse, alea) }));
      courante = 0;
      const deja = duJour ? garde.lire<{ choix: (Option | null)[] }>(cleDuJour()) : null;
      if (deja && deja.choix.length === partie.length) {
        for (const [i, q] of partie.entries()) q.choix = deja.choix[i] ?? undefined;
        afficherFin();
      } else afficherQuestion();
    } catch {
      message('Les réponses n’ont pas pu être lues. Réessayez dans un instant.');
    } finally {
      jouer.disabled = false;
    }
  };

  quandLieu(LIEUX, garde.lire<string>('lieu'), (demande) => {
    void resoudre(demande, LIEUX)
      .catch(() => null)
      .then((l) => {
        lieu = l;
        if (!l) return message('Cherchez votre commune par son nom ou son code postal.');
        garde.ecrire('lieu', l.cle);
        retenirLieu(l.cle);
        $('jq-lieu-nom').textContent = l.nom;
        jouer.textContent = garde.lire(`${jour}:${l.cle}`) ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
        $('jq-choix').hidden = false;
      });
  });
  jouer.addEventListener('click', () => void lancer(true));
  $('jq-libre').addEventListener('click', () => void lancer(false));
  $('jq-suivante').addEventListener('click', () => {
    courante++;
    if (courante < partie.length) afficherQuestion();
    else afficherFin();
  });
}
