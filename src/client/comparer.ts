/**
 * Jusqu'à cinq communes côte à côte, bloc par bloc.
 *
 * La page ne calcule rien : elle charge les deux pages de commune déjà
 * publiées et en rapproche les sections de même identifiant. Tout ce qu'elle
 * montre a donc été écrit, vérifié et sourcé une fois, sur la page de chaque
 * commune — il n'y a pas de seconde version des chiffres qui pourrait dériver
 * de la première.
 *
 * Les communes sont dans l'adresse, `?c=03165,03310,03185` : une comparaison
 * se partage comme un lien. L'ancienne forme, `?a=03165&b=03310`, est
 * toujours lue. Cinq tiennent sur un grand écran ; au-delà, les colonnes
 * deviendraient illisibles, et un téléphone les fait défiler de côté.
 */
import { chargerIndex, chercher, type CommuneBreve } from './recherche-commune.ts';

/** Au-delà, une colonne ne laisse plus lire un tableau. */
export const MAX_COMMUNES = 5;

async function sections(code: string): Promise<Map<string, HTMLElement>> {
  const r = await fetch(`/commune/${code}`);
  if (!r.ok) throw new Error(`${code} : ${r.status}`);
  const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
  const m = new Map<string, HTMLElement>();
  for (const s of doc.querySelectorAll<HTMLElement>('.page > section[id]')) m.set(s.id, s);
  return m;
}

/** Le contenu d'une section sans son titre, prêt à être inséré : identifiants et scripts retirés. */
function corps(s: HTMLElement, nom: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const n of [...s.childNodes]) {
    if (n instanceof HTMLElement && n.tagName === 'H2') continue;
    const copie = document.importNode(n, true);
    if (copie instanceof HTMLElement) {
      copie.querySelectorAll('script').forEach((x) => x.remove());
      // Deux fois le même identifiant dans une page casse les ancres et les étiquettes.
      copie.removeAttribute('id');
      copie.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      // Un tableau défilant est une région nommée : le même nom dans chaque colonne ne dirait pas laquelle.
      for (const r of [copie, ...copie.querySelectorAll<HTMLElement>('[role="region"][aria-label]')])
        if (r.getAttribute('role') === 'region' && r.hasAttribute('aria-label')) r.setAttribute('aria-label', `${r.getAttribute('aria-label')} — ${nom}`);
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
  const champ = document.getElementById('comparer-ajout') as HTMLInputElement | null;
  const liste = document.getElementById('comparer-ajout-liste');
  const choisies = document.getElementById('comparer-choisies');
  if (!zone || !etat || !champ || !liste || !choisies) return;
  const params = new URLSearchParams(location.search);
  const codes: string[] = [
    ...new Set(
      (params.get('c') ?? [params.get('a'), params.get('b')].filter(Boolean).join(','))
        .split(',')
        .map((x) => x.trim())
        .filter((x) => /^[0-9AB]{5}$/.test(x)),
    ),
  ].slice(0, MAX_COMMUNES);
  // Les pages déjà chargées ne le sont pas une seconde fois quand on ajoute une commune.
  const chargees = new Map<string, Promise<Map<string, HTMLElement>>>();
  const pageDe = (code: string) => {
    if (!chargees.has(code)) chargees.set(code, sections(code));
    return chargees.get(code)!;
  };

  const ecrireAdresse = () => history.replaceState(null, '', codes.length ? `?c=${codes.join(',')}` : location.pathname);

  const dessinerChoix = (communes: CommuneBreve[]) => {
    choisies.textContent = '';
    for (const c of communes) {
      const li = document.createElement('li');
      const nom = document.createElement('span');
      nom.textContent = `${c.nom} (${c.depNom})`;
      const retirer = document.createElement('button');
      retirer.type = 'button';
      retirer.className = 'comparer-retirer';
      retirer.setAttribute('aria-label', `Retirer ${c.nom} de la comparaison`);
      retirer.textContent = '×';
      retirer.addEventListener('click', () => {
        codes.splice(codes.indexOf(c.code), 1);
        ecrireAdresse();
        void afficher();
      });
      li.append(nom, retirer);
      choisies.append(li);
    }
    const plein = codes.length >= MAX_COMMUNES;
    champ.disabled = plein;
    champ.placeholder = plein ? `${MAX_COMMUNES} communes au plus` : 'Une commune, un code postal…';
  };

  const afficher = async () => {
    zone.textContent = '';
    const index = await chargerIndex();
    const communes = codes.map((code) => index.find((c) => c.code === code)).filter((c): c is CommuneBreve => !!c);
    dessinerChoix(communes);
    zone.style.setProperty('--n', String(Math.max(communes.length, 1)));
    document.querySelector('.page--comparer')?.classList.toggle('page--comparer-large', communes.length > 2);
    if (communes.length < 2) {
      etat.textContent = communes.length ? 'Ajoutez au moins une autre commune.' : `Choisissez de deux à ${MAX_COMMUNES} communes.`;
      return;
    }
    etat.textContent = `Chargement des ${communes.length} pages…`;
    let pages: Map<string, HTMLElement>[];
    try {
      pages = await Promise.all(communes.map((c) => pageDe(c.code)));
    } catch {
      etat.textContent = 'Une des pages n’a pas pu être chargée.';
      return;
    }
    etat.textContent = '';
    // L'ordre de la première page, puis ce que seules les suivantes ont.
    const ids: string[] = [];
    for (const p of pages) for (const id of p.keys()) if (!ids.includes(id)) ids.push(id);
    for (const id of ids) {
      const bloc = document.createElement('section');
      bloc.className = 'comparer-bloc';
      const h2 = document.createElement('h2');
      h2.className = 'badge';
      h2.textContent = titre(pages.find((p) => p.has(id))!.get(id)!);
      const grille = document.createElement('div');
      grille.className = 'comparer-grille';
      communes.forEach((c, i) => {
        const s = pages[i].get(id);
        const col = document.createElement('div');
        col.className = 'comparer-colonne';
        const h3 = document.createElement('h3');
        const lien = document.createElement('a');
        lien.href = `/commune/${c.code}#${id}`;
        lien.textContent = c.nom;
        h3.append(lien);
        col.append(h3);
        if (s) col.append(corps(s, c.nom));
        else {
          const p = document.createElement('p');
          p.className = 'c-vide';
          p.textContent = 'Ce bloc n’existe pas pour cette commune : la donnée manque, ou elle ne la concerne pas.';
          col.append(p);
        }
        grille.append(col);
      });
      bloc.append(h2, grille);
      zone.append(bloc);
    }
  };

  // Ajouter une commune : une petite liste sous le champ.
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
        for (const c of trouvees.filter((x) => !codes.includes(x.code))) {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = `${c.nom} — ${c.depNom}, ${c.population.toLocaleString('fr-FR')} hab.`;
          b.addEventListener('click', () => {
            liste.textContent = '';
            champ.value = '';
            if (codes.length >= MAX_COMMUNES) return;
            codes.push(c.code);
            ecrireAdresse();
            void afficher();
            champ.focus();
          });
          li.append(b);
          liste.append(li);
        }
      })
      .catch(() => {
        liste.textContent = '';
      });
  });

  ecrireAdresse();
  void afficher();
}
