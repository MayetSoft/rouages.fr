/**
 * Où jouer : une commune, un code postal — qui en réunit souvent plusieurs —,
 * une intercommunalité ou un département, dans un seul champ. Chaque jeu dit
 * quels genres de lieu il accepte : « Qui décide ? » se joue sur une commune,
 * la commune mystère sur un ensemble de communes.
 *
 * Les communes et les codes postaux viennent de l'index national, comme dans
 * la recherche des « Données de chez moi » ; les départements et les
 * intercommunalités de `/jeux/territoires.json`, ou pour le jeu des prix de
 * `/jeux/prix-territoires.json`, qui marque les communes sans assez de ventes.
 * Chaque proposition est un lien vers `?t=<clé>` : l'adresse d'une partie se
 * partage telle quelle, et celui qui la reçoit joue le même défi du jour.
 *
 * Rien ici ne lit de vente : seulement des noms et des codes.
 */
import { chargerIndex, chercher, normaliser, type CommuneBreve } from './recherche-commune.ts';
import type { TerritoiresJeu } from '../pages/jeux/prix-territoires.json.ts';

export type GenreLieu = 'commune' | 'cp' | 'interco' | 'departement';
export interface OptionsLieu {
  /** `/jeux/territoires.json`, ou `/jeux/prix-territoires.json` pour le jeu des prix. */
  source: string;
  genres: GenreLieu[];
}

export interface Lieu {
  /** « c-03165 », « cp-03250 », « e-200071363 », « d-03 » : ce qui va dans l'adresse. */
  cle: string;
  genre: GenreLieu;
  nom: string;
  /** Les communes du lieu, ou null pour tout le département. */
  communes: string[] | null;
  /** Les départements dont il faut lire les ventes. */
  deps: string[];
  /** Pour une commune sans assez de ventes : où jouer à la place. */
  replis: { cle: string; nom: string }[];
}

interface Proposition {
  cle: string;
  genre: string;
  nom: string;
  detail: string;
}

/** Un département se lit sur deux ou trois caractères : 03, 2A, 974. */
export function departementDe(code: string): string {
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

type Interco = { siren: string; nom: string; nature: string; deps: string[]; communes: string[]; jouables: Set<string> };
type Territoires = { d: Map<string, string>; e: Interco[]; jouables: Set<string>; parCommune: Map<string, Interco> };
const territoires = new Map<string, Promise<Territoires>>();

function chargerTerritoires(source: string): Promise<Territoires> {
  if (!territoires.has(source)) territoires.set(source, lireTerritoires(source));
  return territoires.get(source)!;
}

function lireTerritoires(source: string): Promise<Territoires> {
  const lecture = fetch(source)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<TerritoiresJeu>;
    })
    .then((t) => {
      const jouables = new Set<string>();
      const parCommune = new Map<string, Interco>();
      const e = t.e.map(([siren, nom, nature, deps, liste]): Interco => {
        const communes: string[] = [];
        const j = new Set<string>();
        for (const brut of liste.split(' ')) {
          const code = brut.replace(/^-/, '');
          communes.push(code);
          if (!brut.startsWith('-')) {
            j.add(code);
            jouables.add(code);
          }
        }
        const i = { siren, nom, nature, deps: deps ? deps.split(' ') : [], communes, jouables: j };
        for (const c of communes) parCommune.set(c, i);
        return i;
      });
      return { d: new Map(t.d), e, jouables, parCommune };
    });
  lecture.catch(() => territoires.delete(source));
  return lecture;
}

/** « du Mayet-de-Montagne », « des Ancizes », « de Vichy ». */
const deNom = (nom: string) => (nom.startsWith('Le ') ? `du ${nom.slice(3)}` : nom.startsWith('Les ') ? `des ${nom.slice(4)}` : `de ${nom}`);
const pluriel = (n: number, mot: string) => `${n.toLocaleString('fr-FR')} ${mot}${n > 1 ? 's' : ''}`;

async function proposer(requete: string, o: OptionsLieu): Promise<Proposition[]> {
  const q = normaliser(requete);
  if (q.length < 2) return [];
  const [t, communes, index] = await Promise.all([chargerTerritoires(o.source), chercher(requete, 6), chargerIndex()]);
  const exacts: Proposition[] = [];
  const ensuite: Proposition[] = [];

  // Un code postal partagé : le proposer comme un lieu à part entière.
  if (o.genres.includes('cp') && /^\d{2,5}$/.test(q)) {
    const parCp = new Map<string, CommuneBreve[]>();
    for (const c of index) for (const cp of c.cps) if (cp.startsWith(q)) (parCp.get(cp) ?? parCp.set(cp, []).get(cp)!).push(c);
    for (const [cp, liste] of [...parCp].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3)) {
      // Un code postal d'une seule commune n'ajoute rien à la commune, sauf
      // pour un jeu qui ne se joue pas sur une commune seule.
      if (liste.length < 2 && o.genres.includes('commune')) continue;
      const n = liste.filter((c) => t.jouables.has(c.code)).length;
      (cp === q ? exacts : ensuite).push({
        cle: `cp-${cp}`,
        genre: 'Code postal',
        nom: cp,
        detail: n === liste.length ? pluriel(liste.length, 'commune') : `${pluriel(liste.length, 'commune')}, dont ${n.toLocaleString('fr-FR')} avec assez de ventes`,
      });
    }
  }
  if (o.genres.includes('departement')) for (const [code, nom] of t.d) {
    const n = normaliser(nom);
    const p = { cle: `d-${code}`, genre: 'Département', nom, detail: code };
    if (n === q || code.toLowerCase() === q) exacts.push(p);
    else if (n.startsWith(q) || n.includes(` ${q}`)) ensuite.push(p);
  }
  const intercos = (o.genres.includes('interco') ? t.e : [])
    .map((e) => ({ e, n: normaliser(e.nom) }))
    .filter(({ n }) => n === q || n.startsWith(q) || n.includes(q))
    .sort((a, b) => Number(b.n === q) - Number(a.n === q) || b.e.communes.length - a.e.communes.length)
    .slice(0, 4)
    .map(({ e }) => ({
      cle: `e-${e.siren}`,
      genre: 'Intercommunalité',
      nom: e.nom,
      detail:
        e.jouables.size === e.communes.length
          ? pluriel(e.communes.length, 'commune')
          : `${pluriel(e.communes.length, 'commune')}, dont ${e.jouables.size.toLocaleString('fr-FR')} avec assez de ventes`,
    }));
  // Un jeu qui ne se joue pas sur une commune seule : taper son village
  // propose son code postal et son intercommunalité.
  const autour: Proposition[] = [];
  if (!o.genres.includes('commune')) {
    const vus = new Set([...exacts, ...ensuite, ...intercos].map((p) => p.cle));
    for (const c of communes.slice(0, 3)) {
      const e = t.parCommune.get(c.code);
      const props: Proposition[] = [];
      if (o.genres.includes('cp') && c.cp) props.push({ cle: `cp-${c.cp}`, genre: 'Code postal', nom: c.cp, detail: `celui ${deNom(c.nom)}` });
      if (o.genres.includes('interco') && e) props.push({ cle: `e-${e.siren}`, genre: 'Intercommunalité', nom: e.nom, detail: `celle ${deNom(c.nom)}` });
      for (const p of props) if (!vus.has(p.cle)) (vus.add(p.cle), autour.push(p));
    }
  }
  return [
    ...exacts,
    ...autour,
    ...(o.genres.includes('commune') ? communes : []).map((c) => ({
      cle: `c-${c.code}`,
      genre: 'Commune',
      nom: c.nom,
      detail: `${c.depNom} · ${c.cp}${t.jouables.has(c.code) || !t.parCommune.has(c.code) ? '' : ' · trop peu de ventes'}`,
    })),
    ...intercos,
    ...ensuite.slice(0, 4),
  ];
}

/** D'une clé d'adresse au lieu qu'elle désigne, ou null si elle ne désigne rien de jouable. */
export async function resoudre(cle: string, o: OptionsLieu): Promise<Lieu | null> {
  const [genre, id] = [cle.slice(0, cle.indexOf('-')), cle.slice(cle.indexOf('-') + 1)];
  const voulu = ({ d: 'departement', e: 'interco', c: 'commune', cp: 'cp' } as Record<string, GenreLieu>)[genre];
  if (!voulu || !o.genres.includes(voulu)) return null;
  const t = await chargerTerritoires(o.source);
  if (genre === 'd' && t.d.has(id)) {
    return { cle, genre: 'departement', nom: t.d.get(id)!, communes: null, deps: [id], replis: [] };
  }
  if (genre === 'e') {
    const e = t.e.find((x) => x.siren === id);
    if (!e) return null;
    return { cle, genre: 'interco', nom: e.nom, communes: e.communes, deps: e.deps, replis: [] };
  }
  const index = await chargerIndex();
  if (genre === 'c') {
    const c = index.find((x) => x.code === id);
    if (!c) return null;
    const replis: Lieu['replis'] = [];
    const e = t.parCommune.get(c.code);
    if (e && e.jouables.size > 0) replis.push({ cle: `e-${e.siren}`, nom: e.nom });
    const dep = departementDe(c.code);
    if (t.d.has(dep)) replis.push({ cle: `d-${dep}`, nom: t.d.get(dep)! });
    return { cle, genre: 'commune', nom: c.nom, communes: [c.code], deps: [dep], replis };
  }
  if (genre === 'cp' && /^\d{5}$/.test(id)) {
    const liste = index.filter((c) => c.cps.includes(id));
    if (liste.length === 0) return null;
    const deps = [...new Set(liste.map((c) => departementDe(c.code)))].filter((d) => t.d.has(d));
    return { cle, genre: 'cp', nom: `Code postal ${id}`, communes: liste.map((c) => c.code), deps, replis: [] };
  }
  return null;
}

/** Le champ, au clavier comme à la souris : un combobox dont chaque proposition est un lien. */
export function brancherChampLieu(id: string, o: OptionsLieu): void {
  const champ = document.getElementById(id) as HTMLInputElement | null;
  const liste = document.getElementById(`${id}-liste`);
  if (!champ || !liste) return;
  let trouvees: Proposition[] = [];
  let active = -1;
  let enCours = 0;
  const lien = (cle: string) => `${location.pathname}?t=${encodeURIComponent(cle)}`;

  const fermer = () => {
    liste.textContent = '';
    trouvees = [];
    active = -1;
    champ.setAttribute('aria-expanded', 'false');
    champ.removeAttribute('aria-activedescendant');
  };
  const marquer = (i: number) => {
    active = i;
    for (const [k, li] of [...liste.children].entries()) li.setAttribute('aria-selected', String(k === i));
    if (i >= 0) champ.setAttribute('aria-activedescendant', `${id}-${i}`);
    else champ.removeAttribute('aria-activedescendant');
  };
  const afficher = (props: Proposition[]) => {
    liste.textContent = '';
    trouvees = props;
    active = -1;
    for (const [i, p] of props.entries()) {
      const li = document.createElement('li');
      li.id = `${id}-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const a = document.createElement('a');
      a.href = lien(p.cle);
      a.tabIndex = -1;
      for (const [classe, texte] of [['cm-genre', p.genre], ['cm-nom', p.nom], ['cm-detail', p.detail]]) {
        const s = document.createElement('span');
        s.className = classe;
        s.textContent = texte;
        a.append(s);
      }
      li.append(a);
      liste.append(li);
    }
    champ.setAttribute('aria-expanded', String(props.length > 0));
  };

  champ.addEventListener('input', () => {
    const mien = ++enCours;
    if (champ.value.trim().length < 2) return fermer();
    proposer(champ.value, o)
      .then((p) => mien === enCours && afficher(p))
      .catch(() => mien === enCours && fermer());
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && trouvees.length > 0) {
      e.preventDefault();
      marquer((active + 1) % trouvees.length);
    } else if (e.key === 'ArrowUp' && trouvees.length > 0) {
      e.preventDefault();
      marquer(active <= 0 ? trouvees.length - 1 : active - 1);
    } else if (e.key === 'Enter') {
      const p = trouvees[active >= 0 ? active : 0];
      if (p) {
        e.preventDefault();
        location.href = lien(p.cle);
      }
    } else if (e.key === 'Escape') fermer();
  });
  document.addEventListener('click', (e) => {
    if (!champ.parentElement?.contains(e.target as Node)) fermer();
  });
}

/**
 * Le lieu commun à tous les jeux : le dernier choisi, dans n'importe lequel.
 * Un jeu qui ne se joue pas sur une commune seule en prend le code postal,
 * à défaut l'intercommunalité, à défaut le département ; un jeu qui se joue
 * sur une commune ne peut rien tirer d'un code postal, et garde le sien.
 */
const COMMUN = 'rouages-jeux:lieu';

export function retenirLieu(cle: string): void {
  try {
    localStorage.setItem(COMMUN, JSON.stringify(cle));
  } catch {
    /* navigation privée */
  }
}

function lieuCommun(): string | null {
  try {
    const brut = localStorage.getItem(COMMUN);
    return brut ? (JSON.parse(brut) as string) : null;
  } catch {
    return null;
  }
}

async function adapter(cle: string, o: OptionsLieu): Promise<string | null> {
  const genre = ({ d: 'departement', e: 'interco', c: 'commune', cp: 'cp' } as Record<string, GenreLieu>)[cle.slice(0, cle.indexOf('-'))];
  if (!genre) return null;
  if (o.genres.includes(genre)) return cle;
  if (genre !== 'commune') return null;
  const code = cle.slice(2);
  const c = (await chargerIndex()).find((x) => x.code === code);
  if (o.genres.includes('cp') && c?.cp) return `cp-${c.cp}`;
  const e = (await chargerTerritoires(o.source)).parCommune.get(code);
  if (o.genres.includes('interco') && e) return `e-${e.siren}`;
  if (o.genres.includes('departement')) return `d-${departementDe(code)}`;
  return null;
}

/**
 * Le lieu de départ d'un jeu : celui de l'adresse, sinon le lieu commun
 * adapté au jeu, sinon le dernier lieu de ce jeu. `faire` reçoit la clé.
 */
export function quandLieu(o: OptionsLieu, propre: string | null, faire: (cle: string) => void): void {
  const t = new URLSearchParams(location.search).get('t');
  if (t) return faire(t);
  const commun = lieuCommun();
  void (commun ? adapter(commun, o).catch(() => null) : Promise.resolve(null)).then((cle) => {
    const choisi = cle ?? propre;
    if (choisi) faire(choisi);
  });
}
