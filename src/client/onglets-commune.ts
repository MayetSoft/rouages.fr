/**
 * Les onglets de la page d'une commune, et la recherche dans la page.
 *
 * Le HTML porte tous les blocs, dans l'ordre : sans JavaScript, la page reste
 * entière et le sommaire y conduit. Ici, les blocs sont rangés par grande
 * famille — `familles-commune` dit laquelle, et un bloc qui n'y figure pas
 * suit celle du bloc qui le précède — et un seul onglet est montré à la fois.
 *
 * Un lien vers un bloc (`#risques`), depuis le sommaire, « L'essentiel » ou
 * une adresse partagée, ouvre l'onglet qui le contient avant d'y descendre.
 *
 * La recherche parcourt le texte de tous les onglets, encadrés « Sources et
 * méthode » et listes repliées compris, sans tenir compte des accents ni des
 * majuscules : les visiteurs connaissent rarement Ctrl+F, et Ctrl+F ne voit
 * pas ce qu'un onglet cache.
 */
const conteneur = document.querySelector<HTMLElement>('[data-onglets]');
const carte = document.getElementById('familles-commune');
if (conteneur && carte) {
  const familleDe = JSON.parse(carte.textContent ?? '{}') as Record<string, string>;
  const boutons = [...conteneur.querySelectorAll<HTMLButtonElement>('button[data-famille]')];
  const liens = [...document.querySelectorAll<HTMLAnchorElement>('.c-sommaire a[data-famille]')];
  const sommaire = document.querySelector<HTMLElement>('.c-sommaire');
  const champ = conteneur.querySelector<HTMLInputElement>('.c-chercher-champ')!;
  const resultats = conteneur.querySelector<HTMLElement>('.c-chercher-resultats')!;
  const nomDe = new Map(boutons.map((b) => [b.dataset.famille!, b.firstChild?.textContent?.trim() ?? '']));

  // Les blocs : les sections qui suivent la barre d'onglets, chacune avec sa famille.
  const blocs: { section: HTMLElement; famille: string }[] = [];
  let courante = boutons[0]?.dataset.famille ?? '';
  for (const section of document.querySelectorAll<HTMLElement>('main section')) {
    if (!(conteneur.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (section.parentElement?.closest('section')) continue;
    courante = (section.id && familleDe[section.id]) || courante;
    blocs.push({ section, famille: courante });
  }
  const familleDuBloc = (el: Element) => blocs.find((b) => b.section.contains(el))?.famille;

  function activer(famille: string, focaliser = false) {
    for (const b of boutons) {
      const actif = b.dataset.famille === famille;
      b.setAttribute('aria-selected', String(actif));
      b.tabIndex = actif ? 0 : -1;
      if (actif && focaliser) b.focus();
      // Sur un téléphone, la barre défile : l'onglet ouvert y reste visible.
      if (actif) {
        const barre = b.parentElement!;
        if (barre.scrollWidth > barre.clientWidth) barre.scrollTo({ left: b.offsetLeft - (barre.clientWidth - b.clientWidth) / 2 });
      }
    }
    for (const b of blocs) b.section.hidden = b.famille !== famille;
    for (const l of liens) l.hidden = l.dataset.famille !== famille;
    // « En bref » n'a pas de sommaire : on ne laisse pas un cadre vide.
    if (sommaire) sommaire.hidden = !liens.some((l) => !l.hidden);
  }

  /** Ouvre l'onglet d'un élément, déplie ce qui le cache, et y descend. */
  function montrer(el: HTMLElement, centrer = false) {
    const famille = familleDuBloc(el);
    if (famille) activer(famille);
    for (let p: HTMLElement | null = el.parentElement; p; p = p.parentElement) {
      if (p instanceof HTMLDetailsElement) p.open = true;
    }
    el.scrollIntoView({ block: centrer ? 'center' : 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function depuisAdresse() {
    const id = decodeURIComponent(location.hash.slice(1));
    const cible = id ? document.getElementById(id) : null;
    if (cible && familleDuBloc(cible)) {
      montrer(cible);
      return true;
    }
    return false;
  }

  conteneur.hidden = false;
  if (!depuisAdresse()) activer(boutons[0]?.dataset.famille ?? '');

  for (const b of boutons) {
    b.addEventListener('click', () => {
      activer(b.dataset.famille!);
      history.replaceState(null, '', location.pathname + location.search);
    });
    // Les flèches passent d'un onglet à l'autre, comme le veut le motif ARIA.
    b.addEventListener('keydown', (e) => {
      const i = boutons.indexOf(b);
      const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? boutons.length - 1 : -2;
      if (j === -2) return;
      e.preventDefault();
      const suivant = boutons[(j + boutons.length) % boutons.length];
      activer(suivant.dataset.famille!, true);
    });
  }

  // Tout lien interne vers un bloc : sommaire, « L'essentiel », liens dans le texte.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (!a) return;
    const id = decodeURIComponent((a.getAttribute('href') ?? '').slice(1));
    const cible = id ? document.getElementById(id) : null;
    if (!cible || !familleDuBloc(cible)) return;
    e.preventDefault();
    history.pushState(null, '', `#${id}`);
    montrer(cible);
  });
  addEventListener('hashchange', depuisAdresse);
  addEventListener('popstate', depuisAdresse);

  // --- la recherche ---------------------------------------------------------

  /** Le texte sans accents ni majuscules, et pour chaque caractère sa position d'origine. */
  function plier(t: string): { plie: string; origine: number[] } {
    let plie = '';
    const origine: number[] = [];
    for (let i = 0; i < t.length; i++) {
      const c = t[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      for (let k = 0; k < c.length; k++) origine.push(i);
      plie += c;
    }
    return { plie, origine };
  }

  const MAX = 40;
  // Le surlignage ne touche pas au texte de la page : l'API des surlignages
  // CSS quand le navigateur l'a, la sélection sinon.
  type Surlignages = { set(nom: string, h: unknown): void; delete(nom: string): void };
  const surlignages = (globalThis.CSS as unknown as { highlights?: Surlignages } | undefined)?.highlights;
  const Surlignage = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  function effacerMarques() {
    surlignages?.delete('rouages-recherche');
  }

  function titreDe(el: Element): string {
    const section = blocs.find((b) => b.section.contains(el))?.section;
    return section?.querySelector('h2')?.textContent?.trim() ?? '';
  }

  function chercher(q: string) {
    effacerMarques();
    resultats.textContent = '';
    for (const b of boutons) b.querySelector('[data-trouves]')!.textContent = '';
    const { plie: aiguille } = plier(q.trim());
    if (aiguille.length < 2) {
      for (const b of boutons) {
        const n = liens.filter((l) => l.dataset.famille === b.dataset.famille).length;
        b.querySelector('[data-trouves]')!.textContent = n ? String(n) : '';
      }
      return;
    }
    const trouves: { noeud: Text; debut: number; fin: number; famille: string }[] = [];
    const parFamille = new Map<string, number>();
    for (const { section, famille } of blocs) {
      const marche = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.parentElement?.closest('script, style, svg, .c-chercher') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      for (let n = marche.nextNode() as Text | null; n; n = marche.nextNode() as Text | null) {
        const { plie, origine } = plier(n.data);
        for (let i = plie.indexOf(aiguille); i !== -1; i = plie.indexOf(aiguille, i + aiguille.length)) {
          parFamille.set(famille, (parFamille.get(famille) ?? 0) + 1);
          if (trouves.length < MAX) {
            trouves.push({ noeud: n, debut: origine[i], fin: origine[i + aiguille.length - 1] + 1, famille });
          }
        }
      }
    }
    for (const b of boutons) {
      const n = parFamille.get(b.dataset.famille!) ?? 0;
      b.querySelector('[data-trouves]')!.textContent = n ? String(n) : '0';
    }
    const total = [...parFamille.values()].reduce((a, b) => a + b, 0);
    const resume = document.createElement('p');
    resume.className = 'c-chercher-resume';
    resume.textContent =
      total === 0
        ? 'Rien trouvé dans la page.'
        : `${total} occurrence${total > 1 ? 's' : ''}` + (total > MAX ? `, les ${MAX} premières :` : ' :');
    resultats.append(resume);
    if (total === 0) return;
    const ul = document.createElement('ul');
    for (const t of trouves) {
      const li = document.createElement('li');
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'c-chercher-resultat';
      const ou = document.createElement('span');
      ou.className = 'c-chercher-ou';
      ou.textContent = `${nomDe.get(t.famille) ?? ''} · ${titreDe(t.noeud.parentElement!)}`;
      const extrait = document.createElement('span');
      const avant = t.noeud.data.slice(Math.max(0, t.debut - 50), t.debut);
      const apres = t.noeud.data.slice(t.fin, t.fin + 70);
      const mot = document.createElement('mark');
      mot.textContent = t.noeud.data.slice(t.debut, t.fin);
      extrait.append(`${t.debut > 50 ? '…' : ''}${avant}`, mot, `${apres}${t.fin + 70 < t.noeud.data.length ? '…' : ''}`);
      bouton.append(ou, extrait);
      bouton.addEventListener('click', () => aller(t));
      li.append(bouton);
      ul.append(li);
    }
    resultats.append(ul);
  }

  /** Surligne l'occurrence, ouvre son onglet et y descend. */
  function aller(t: { noeud: Text; debut: number; fin: number }) {
    effacerMarques();
    if (!t.noeud.isConnected || t.fin > t.noeud.length) {
      chercher(champ.value);
      return;
    }
    const plage = document.createRange();
    plage.setStart(t.noeud, t.debut);
    plage.setEnd(t.noeud, t.fin);
    // La liste se replie pour laisser voir la page ; elle revient quand on retourne au champ.
    resultats.hidden = true;
    montrer(t.noeud.parentElement!, true);
    if (surlignages && Surlignage) surlignages.set('rouages-recherche', new Surlignage(plage));
    else {
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(plage);
    }
  }

  let delai = 0;
  champ.addEventListener('focus', () => {
    resultats.hidden = false;
  });
  champ.addEventListener('input', () => {
    resultats.hidden = false;
    clearTimeout(delai);
    delai = window.setTimeout(() => chercher(champ.value), 200);
  });
  champ.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      champ.value = '';
      chercher('');
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      resultats.querySelector<HTMLButtonElement>('.c-chercher-resultat')?.click();
    }
  });
  conteneur.querySelector('form')?.addEventListener('submit', (e) => e.preventDefault());
}
