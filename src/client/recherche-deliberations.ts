/**
 * Chercher dans les délibérations d'un département, dans le navigateur.
 *
 * L'index (`recherche-deliberations/<dep>/`, voir
 * `scripts/deliberations-emettre.ts`) range les intitulés du plus récent au
 * plus ancien, par morceaux, et, pour chaque mot cherchable, les rangs des
 * intitulés qui l'emploient. Les mots cherchés sont découpés comme à la
 * collecte (`motsDe`) ; leurs rangs se croisent ; seuls les morceaux affichés
 * se chargent. Un mot qui n'est pas dans l'index n'est pas « absent » : il
 * n'est pas cherchable — trop rare (moins de trois collectivités) ou prénom —,
 * et la page le dit. Une compétence choisie ajoute ses rangs au croisement
 * (`t.json`, rangé par les règles de `themes-deliberations.ts`), et chaque
 * résultat dit sous quelles compétences ces mêmes règles le rangent.
 *
 * Rien ne part ailleurs que vers les fichiers du site, et la recherche n'est
 * pas gardée.
 */
import { motsDe, plierMot } from '../modele/mots-deliberations.ts';
import { THEMES, themesDe } from '../modele/themes-deliberations.ts';

type Meta = { maj: string; depuis: string; n: number; morceau: number; familles: string[]; lettres: string[]; themes?: string[]; c: [string, string][] };
type Ligne = [string, number, number, string, string];

const PAGE = 50;
const base = (dep: string) => `/territoires/recherche-deliberations/${dep}`;

const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
}

/** Les rangs d'un mot, écrits en écarts successifs en base 36. */
const decoder = (s: string) => {
  let r = 0;
  return s.split(',').map((x, i) => (r = i ? r + parseInt(x, 36) : parseInt(x, 36)));
};

/** L'intersection de listes triées. */
function croiser(listes: number[][]): number[] {
  if (!listes.length) return [];
  const [premiere, ...autres] = [...listes].sort((a, b) => a.length - b.length);
  const ensembles = autres.map((l) => new Set(l));
  return premiere.filter((x) => ensembles.every((e) => e.has(x)));
}

export function brancherRechercheDeliberations(): void {
  const dep = document.getElementById('rd-dep') as HTMLSelectElement | null;
  const champ = document.getElementById('rd-mots') as HTMLInputElement | null;
  const famille = document.getElementById('rd-famille') as HTMLSelectElement | null;
  const annee = document.getElementById('rd-annee') as HTMLSelectElement | null;
  const theme = document.getElementById('rd-theme') as HTMLSelectElement | null;
  const formulaire = document.getElementById('rd-formulaire') as HTMLFormElement | null;
  const etat = document.getElementById('rd-etat');
  const zone = document.getElementById('rd-resultats');
  if (!dep || !champ || !famille || !annee || !theme || !formulaire || !etat || !zone) return;
  // Le nom de chaque fiche, tel que la page l'a écrit dans la liste des compétences.
  const nomFiche = new Map([...theme.options].filter((o) => o.value).map((o) => [o.value, o.textContent ?? o.value]));

  const metas = new Map<string, Promise<Meta>>();
  const lettres = new Map<string, Promise<Record<string, string>>>();
  const morceaux = new Map<string, Promise<Ligne[]>>();
  const parTheme = new Map<string, Promise<Record<string, string>>>();
  const themes = (d: string) => parTheme.get(d) ?? parTheme.set(d, json<Record<string, string>>(`${base(d)}/t.json`)).get(d)!;
  const meta = (d: string) => metas.get(d) ?? metas.set(d, json<Meta>(`${base(d)}/meta.json`)).get(d)!;
  const lettre = (d: string, l: string) => lettres.get(`${d}${l}`) ?? lettres.set(`${d}${l}`, json<Record<string, string>>(`${base(d)}/i-${l}.json`)).get(`${d}${l}`)!;
  const morceau = (d: string, k: number) => morceaux.get(`${d}|${k}`) ?? morceaux.set(`${d}|${k}`, json<Ligne[]>(`${base(d)}/m${k}.json`)).get(`${d}|${k}`)!;

  // Les familles et les années, d'après le premier département choisi.
  const remplirFiltres = async (m: Meta) => {
    if (famille.options.length <= 1) m.familles.forEach((f, i) => famille.append(Object.assign(el('option', '', f), { value: String(i) })));
    const garde = annee.value;
    annee.length = 1;
    for (let a = new Date().getFullYear(); a >= Number(m.depuis.slice(0, 4)); a--) annee.append(Object.assign(el('option', '', String(a)), { value: String(a) }));
    annee.value = garde;
  };

  const ecrireAdresse = () => {
    const p = new URLSearchParams();
    if (dep.value) p.set('dep', dep.value);
    if (champ.value.trim()) p.set('q', champ.value.trim());
    if (famille.value) p.set('f', famille.value);
    if (annee.value) p.set('a', annee.value);
    if (theme.value) p.set('t', theme.value);
    history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
  };

  let tour = 0;
  const chercher = async () => {
    ecrireAdresse();
    const mien = ++tour;
    zone.textContent = '';
    if (!dep.value) {
      etat.textContent = theme.value ? `Choisissez un département pour voir ses délibérations rangées sous « ${nomFiche.get(theme.value) ?? theme.value} ».` : 'Choisissez un département.';
      return;
    }
    etat.textContent = 'Recherche…';
    let m: Meta;
    try {
      m = await meta(dep.value);
    } catch {
      etat.textContent = 'L’index de ce département n’a pas pu être chargé.';
      return;
    }
    await remplirFiltres(m);
    const mots = motsDe(champ.value);
    // Les rangs candidats : tous, sans mot ; sinon le croisement des rangs de chaque mot.
    let rangs: number[] | null = null;
    if (mots.length) {
      const listes: number[][] = [];
      const introuvables: string[] = [];
      for (const mot of mots) {
        const l = m.lettres.includes(mot[0]) ? (await lettre(dep.value, mot[0]))[mot] : undefined;
        if (!l) introuvables.push(mot);
        else listes.push(decoder(l));
      }
      if (mien !== tour) return;
      if (introuvables.length) {
        // Le mot tel qu'il a été tapé, pas sa forme pliée.
        const tape = new Map((champ.value.match(/[\p{L}]+/gu) ?? []).map((w) => [plierMot(w), w]));
        etat.textContent =
          `${introuvables.map((x) => `« ${tape.get(x) ?? x} »`).join(', ')} ne se cherche${introuvables.length > 1 ? 'nt' : ''} pas ici : un mot n’entre dans l’index que s’il figure ` +
          'dans les intitulés d’au moins trois collectivités, et jamais un prénom — c’est ce qui empêche de chercher une personne.';
        return;
      }
      rangs = croiser(listes);
    }
    if (theme.value) {
      // Un index d'avant les compétences n'a pas de `t.json` : on le dit plutôt que de répondre « aucune ».
      if (!m.themes) {
        etat.textContent = 'L’index de ce département ne range pas encore les délibérations par compétence : il le fera à la prochaine mise à jour des données.';
        return;
      }
      const l = m.themes.includes(theme.value) ? (await themes(dep.value))[theme.value] : undefined;
      if (mien !== tour) return;
      const sous = l ? decoder(l) : [];
      rangs = rangs ? croiser([rangs, sous]) : sous;
    }
    // Les filtres de famille et d'année se lisent dans les morceaux : on les parcourt dans l'ordre, du plus récent.
    const f = famille.value === '' ? null : Number(famille.value);
    const a = annee.value || null;
    const resultats: Ligne[] = [];
    let total = 0;
    let complet = true;
    const candidats = rangs ?? null;
    const parcourir = async (i: number) => {
      const l = (await morceau(dep.value, Math.floor(i / m.morceau)))[i % m.morceau];
      if (!l) return;
      if (f !== null && l[1] !== f) return;
      if (a && !l[0].startsWith(a)) return;
      total++;
      if (resultats.length < PAGE) resultats.push(l);
    };
    if (candidats) {
      // Au-delà de deux mille candidats filtrés, on s'arrête au compte de la première page.
      for (const i of candidats) {
        await parcourir(i);
        if (resultats.length >= PAGE && (f !== null || a) && total >= PAGE) {
          complet = false;
          break;
        }
      }
      if (f === null && !a) total = candidats.length;
    } else {
      for (let i = 0; i < m.n; i++) {
        await parcourir(i);
        if (resultats.length >= PAGE) {
          complet = false;
          break;
        }
      }
    }
    if (mien !== tour) return;
    const debut = m.depuis.split('-').reverse().join('/');
    etat.textContent = !resultats.length
      ? 'Aucune délibération ne répond à cette recherche.'
      : `${complet ? `${total.toLocaleString('fr-FR')} délibération${total > 1 ? 's' : ''}` : 'Plus de cinquante délibérations'} depuis le ${debut}` +
        (resultats.length < total || !complet ? `, les ${resultats.length} plus récentes ci-dessous.` : ', de la plus récente à la plus ancienne.');
    if (!resultats.length) return;
    const ul = el('ul', 'rd-liste');
    for (const [date, fam, c, objet, url] of resultats) {
      const li = el('li');
      const tete = el('p', 'rd-tete', `${date.split('-').reverse().join('/')} · ${m.c[c]?.[1] ?? ''}${fam >= 0 && m.familles[fam] ? ` · ${m.familles[fam]}` : ''}`);
      const corps = el('p', 'rd-objet');
      if (url) {
        const lien = el('a', '', objet);
        lien.href = url;
        lien.target = '_blank';
        lien.rel = 'noopener';
        corps.append(lien);
      } else corps.textContent = objet;
      li.append(tete, corps);
      // Les compétences où les règles rangent cet intitulé, chacune vers sa fiche.
      const fiches = themesDe(objet).map((i) => THEMES[i].fiche);
      if (fiches.length) {
        const p = el('p', 'rd-themes');
        fiches.forEach((f, i) => {
          if (i) p.append(' · ');
          const a = el('a', '', nomFiche.get(f) ?? f);
          a.href = `/n/${f}`;
          p.append(a);
        });
        li.append(p);
      }
      ul.append(li);
    }
    zone.append(ul);
  };

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    void chercher();
  });
  for (const x of [dep, famille, annee, theme]) x.addEventListener('change', () => void chercher());

  const p = new URLSearchParams(location.search);
  if (p.get('dep') && [...dep.options].some((o) => o.value === p.get('dep'))) dep.value = p.get('dep')!;
  champ.value = p.get('q') ?? '';
  if (p.get('t') && nomFiche.has(p.get('t')!)) theme.value = p.get('t')!;
  void (async () => {
    if (dep.value) {
      try {
        await remplirFiltres(await meta(dep.value));
      } catch {
        /* la recherche dira l'erreur */
      }
      famille.value = p.get('f') ?? '';
      annee.value = p.get('a') ?? '';
      void chercher();
    }
  })();
}
