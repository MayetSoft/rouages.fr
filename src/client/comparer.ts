/**
 * Deux communes côte à côte, bloc par bloc.
 *
 * La page ne calcule rien : elle charge les deux pages de commune déjà
 * publiées et en rapproche les sections de même identifiant. Tout ce qu'elle
 * montre a donc été écrit, vérifié et sourcé une fois, sur la page de chaque
 * commune — il n'y a pas de seconde version des chiffres qui pourrait dériver
 * de la première.
 *
 * Les deux communes sont dans l'adresse, `?a=03165&b=03310` : une comparaison
 * se partage comme un lien.
 */
import { chargerIndex, chercher, type CommuneBreve } from './recherche-commune.ts';

type Cote = 'a' | 'b';

async function sections(code: string): Promise<Map<string, HTMLElement>> {
  const r = await fetch(`/commune/${code}`);
  if (!r.ok) throw new Error(`${code} : ${r.status}`);
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const m = new Map<string, HTMLElement>();
  for (const s of doc.querySelectorAll<HTMLElement>('.page > section[id]')) m.set(s.id, s);
  return m;
}

/** Le contenu d'une section sans son titre, prêt à être inséré : identifiants et scripts retirés. */
function corps(s: HTMLElement): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const n of [...s.childNodes]) {
    if (n instanceof HTMLElement && n.tagName === 'H2') continue;
    const copie = document.importNode(n, true);
    if (copie instanceof HTMLElement) {
      copie.querySelectorAll('script').forEach((x) => x.remove());
      // Deux fois le même identifiant dans une page casse les ancres et les étiquettes.
      copie.removeAttribute('id');
      copie.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    }
    f.append(copie);
  }
  return f;
}

function titre(s: HTMLElement): string {
  return s.querySelector('h2')?.textContent?.trim() ?? s.id;
}

export function brancherComparaison(): void {
  const zone = document.getElementById('comparaison');
  const etat = document.getElementById('comparaison-etat');
  if (!zone || !etat) return;
  const params = new URLSearchParams(location.search);
  const choix: Record<Cote, string | null> = { a: params.get('a'), b: params.get('b') };

  const nomDe = async (code: string | null): Promise<CommuneBreve | null> => {
    if (!code) return null;
    return (await chargerIndex()).find((c) => c.code === code) ?? null;
  };

  const afficher = async () => {
    zone.textContent = '';
    const [ca, cb] = await Promise.all([nomDe(choix.a), nomDe(choix.b)]);
    for (const [cote, c] of [['a', ca], ['b', cb]] as const) {
      const champ = document.getElementById(`comparer-${cote}`) as HTMLInputElement | null;
      if (champ && c) champ.value = `${c.nom} (${c.depNom})`;
    }
    if (!ca || !cb) {
      etat.textContent = 'Choisissez deux communes.';
      return;
    }
    etat.textContent = 'Chargement des deux pages…';
    let sa: Map<string, HTMLElement>;
    let sb: Map<string, HTMLElement>;
    try {
      [sa, sb] = await Promise.all([sections(ca.code), sections(cb.code)]);
    } catch {
      etat.textContent = 'Une des deux pages n’a pas pu être chargée.';
      return;
    }
    etat.textContent = '';
    // L'ordre de la première page, puis ce que seule la seconde a.
    const ids = [...sa.keys(), ...[...sb.keys()].filter((id) => !sa.has(id))];
    for (const id of ids) {
      const bloc = document.createElement('section');
      bloc.className = 'comparer-bloc';
      const h2 = document.createElement('h2');
      h2.className = 'badge';
      h2.textContent = titre((sa.get(id) ?? sb.get(id))!);
      const grille = document.createElement('div');
      grille.className = 'comparer-grille';
      for (const [c, s] of [[ca, sa.get(id)], [cb, sb.get(id)]] as const) {
        const col = document.createElement('div');
        col.className = 'comparer-colonne';
        const h3 = document.createElement('h3');
        const lien = document.createElement('a');
        lien.href = `/commune/${c.code}#${id}`;
        lien.textContent = c.nom;
        h3.append(lien);
        col.append(h3);
        if (s) col.append(corps(s));
        else {
          const p = document.createElement('p');
          p.className = 'c-vide';
          p.textContent = 'Ce bloc n’existe pas pour cette commune : la donnée manque, ou elle ne la concerne pas.';
          col.append(p);
        }
        grille.append(col);
      }
      bloc.append(h2, grille);
      zone.append(bloc);
    }
  };

  // Le choix d'une commune : une petite liste sous chaque champ.
  for (const cote of ['a', 'b'] as const) {
    const champ = document.getElementById(`comparer-${cote}`) as HTMLInputElement | null;
    const liste = document.getElementById(`comparer-${cote}-liste`);
    if (!champ || !liste) continue;
    let enCours = 0;
    champ.addEventListener('input', () => {
      const mien = ++enCours;
      if (champ.value.trim().length < 2) {
        liste.textContent = '';
        return;
      }
      chercher(champ.value, 6)
        .then((trouvees) => {
          if (mien !== enCours) return;
          liste.textContent = '';
          for (const c of trouvees) {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = `${c.nom} — ${c.depNom}, ${c.population.toLocaleString('fr-FR')} hab.`;
            b.addEventListener('click', () => {
              liste.textContent = '';
              choix[cote] = c.code;
              const p = new URLSearchParams();
              if (choix.a) p.set('a', choix.a);
              if (choix.b) p.set('b', choix.b);
              history.replaceState(null, '', `?${p}`);
              void afficher();
            });
            li.append(b);
            liste.append(li);
          }
        })
        .catch(() => {
          liste.textContent = '';
        });
    });
  }

  void afficher();
}
