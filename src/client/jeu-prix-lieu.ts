/**
 * Où jouer : une commune, un code postal — qui en réunit souvent plusieurs —,
 * une intercommunalité ou un département, dans un seul champ.
 *
 * Les communes et les codes postaux viennent de l'index national, comme dans
 * la recherche des « Données de chez moi » ; les départements et les
 * intercommunalités jouables de `/jeux/prix-territoires.json`. Chaque
 * proposition est un lien vers `?t=<clé>` : l'adresse d'une partie se partage
 * telle quelle, et celui qui la reçoit joue le même défi du jour.
 *
 * Rien ici ne lit de vente : seulement des noms et des codes.
 */
import { chargerIndex, chercher, normaliser, type CommuneBreve } from './recherche-commune.ts';
import type { TerritoiresJeu } from '../pages/jeux/prix-territoires.json.ts';

export interface Lieu {
  /** « c-03165 », « cp-03250 », « e-200071363 », « d-03 » : ce qui va dans l'adresse. */
  cle: string;
  genre: 'commune' | 'cp' | 'interco' | 'departement';
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
let territoires: Promise<{ d: Map<string, string>; e: Interco[]; jouables: Set<string>; parCommune: Map<string, Interco> }> | null = null;

function chargerTerritoires() {
  territoires ??= fetch('/jeux/prix-territoires.json')
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
  territoires.catch(() => (territoires = null));
  return territoires;
}

const pluriel = (n: number, mot: string) => `${n.toLocaleString('fr-FR')} ${mot}${n > 1 ? 's' : ''}`;

async function proposer(requete: string): Promise<Proposition[]> {
  const q = normaliser(requete);
  if (q.length < 2) return [];
  const [t, communes, index] = await Promise.all([chargerTerritoires(), chercher(requete, 6), chargerIndex()]);
  const exacts: Proposition[] = [];
  const ensuite: Proposition[] = [];

  // Un code postal partagé : le proposer comme un lieu à part entière.
  if (/^\d{2,5}$/.test(q)) {
    const parCp = new Map<string, CommuneBreve[]>();
    for (const c of index) for (const cp of c.cps) if (cp.startsWith(q)) (parCp.get(cp) ?? parCp.set(cp, []).get(cp)!).push(c);
    for (const [cp, liste] of [...parCp].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3)) {
      if (liste.length < 2) continue;
      const n = liste.filter((c) => t.jouables.has(c.code)).length;
      (cp === q ? exacts : ensuite).push({
        cle: `cp-${cp}`,
        genre: 'Code postal',
        nom: cp,
        detail: `${pluriel(liste.length, 'commune')}, dont ${n.toLocaleString('fr-FR')} avec assez de ventes`,
      });
    }
  }
  for (const [code, nom] of t.d) {
    const n = normaliser(nom);
    const p = { cle: `d-${code}`, genre: 'Département', nom, detail: code };
    if (n === q || code.toLowerCase() === q) exacts.push(p);
    else if (n.startsWith(q) || n.includes(` ${q}`)) ensuite.push(p);
  }
  const intercos = t.e
    .map((e) => ({ e, n: normaliser(e.nom) }))
    .filter(({ n }) => n === q || n.startsWith(q) || n.includes(q))
    .sort((a, b) => Number(b.n === q) - Number(a.n === q) || b.e.communes.length - a.e.communes.length)
    .slice(0, 4)
    .map(({ e }) => ({
      cle: `e-${e.siren}`,
      genre: 'Intercommunalité',
      nom: e.nom,
      detail: `${pluriel(e.communes.length, 'commune')}, dont ${e.jouables.size.toLocaleString('fr-FR')} avec assez de ventes`,
    }));
  return [
    ...exacts,
    ...communes.map((c) => ({
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
export async function resoudre(cle: string): Promise<Lieu | null> {
  const [genre, id] = [cle.slice(0, cle.indexOf('-')), cle.slice(cle.indexOf('-') + 1)];
  const t = await chargerTerritoires();
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
export function brancherChampLieu(id: string): void {
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
    proposer(champ.value)
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
