/**
 * Chercher un territoire, de la commune à la région, dans un seul champ.
 *
 * Les communes viennent de l'index national, classé par `classer` — et donc
 * par les règles que `scripts/verifier-recherche.ts` garde. Les régions, les
 * départements et les intercommunalités viennent de `/territoires-autres.json`.
 * Un nom exact passe devant tout : taper « Allier » doit donner le département
 * avant Allier, la commune des Hautes-Pyrénées.
 *
 * Même comportement au clavier que le champ de l'en-tête : un combobox au sens
 * de l'ARIA, dont chaque proposition est un vrai lien.
 */
import { chercher, normaliser } from './recherche-commune.ts';
import type { TerritoireAutre } from '../pages/territoires-autres.json.ts';

interface Proposition {
  lien: string;
  nom: string;
  detail: string;
  genre: string;
}

let autres: Promise<TerritoireAutre[]> | null = null;
function chargerAutres(): Promise<TerritoireAutre[]> {
  autres ??= fetch('/territoires-autres.json').then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<TerritoireAutre[]>;
  });
  return autres;
}

const GENRE = { region: 'Région', departement: 'Département', interco: 'Intercommunalité' } as const;

async function proposer(requete: string): Promise<Proposition[]> {
  const q = normaliser(requete);
  if (q.length < 2) return [];
  const [communes, liste] = await Promise.all([
    chercher(requete, 6),
    chargerAutres().catch(() => [] as TerritoireAutre[]),
  ]);
  const exacts: Proposition[] = [];
  const partiels: { p: Proposition; rang: number; pop: number }[] = [];
  for (const [echelon, nom, lien, detail, pop] of liste) {
    const n = normaliser(nom);
    // « 03 » désigne l'Allier : un code de département se tape aussi.
    const code = echelon === 'departement' && detail.endsWith(` · ${requete.trim().toUpperCase()}`);
    const p = { lien, nom, detail: echelon === 'interco' && pop ? `${detail} · ${pop.toLocaleString('fr-FR')} hab.` : detail, genre: GENRE[echelon] };
    if (n === q || code) exacts.push(p);
    else if (n.startsWith(q)) partiels.push({ p, rang: 0, pop });
    else if (n.split(' ').some((mot) => mot.startsWith(q)) || n.includes(q)) partiels.push({ p, rang: 1, pop });
  }
  partiels.sort((a, b) => a.rang - b.rang || b.pop - a.pop || a.p.nom.localeCompare(b.p.nom, 'fr'));
  return [
    ...exacts,
    ...communes.map((c) => ({
      lien: `/commune/${c.code}`,
      nom: c.nom,
      detail: `${c.depNom} · ${c.cp} · ${c.population.toLocaleString('fr-FR')} hab.`,
      genre: 'Commune',
    })),
    ...partiels.slice(0, 5).map((x) => x.p),
  ];
}

export function brancherChezMoi(id: string): void {
  const champ = document.getElementById(id) as HTMLInputElement | null;
  const liste = document.getElementById(`${id}-liste`);
  if (!champ || !liste) return;
  let trouvees: Proposition[] = [];
  let active = -1;
  let enCours = 0;

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
      a.href = p.lien;
      a.tabIndex = -1;
      const genre = document.createElement('span');
      genre.className = 'cm-genre';
      genre.textContent = p.genre;
      const nom = document.createElement('span');
      nom.className = 'cm-nom';
      nom.textContent = p.nom;
      const detail = document.createElement('span');
      detail.className = 'cm-detail';
      detail.textContent = p.detail;
      a.append(genre, nom, detail);
      li.append(a);
      liste.append(li);
    }
    champ.setAttribute('aria-expanded', String(props.length > 0));
  };

  champ.addEventListener('input', () => {
    const mien = ++enCours;
    if (champ.value.trim().length < 2) {
      fermer();
      return;
    }
    proposer(champ.value)
      .then((p) => {
        if (mien === enCours) afficher(p);
      })
      .catch(() => {
        if (mien === enCours) fermer();
      });
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
        location.href = p.lien;
      }
    } else if (e.key === 'Escape') {
      fermer();
    }
  });
  document.addEventListener('click', (e) => {
    if (!champ.parentElement?.contains(e.target as Node)) fermer();
  });
}
