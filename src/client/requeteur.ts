/**
 * Trouver des communes : des critères qu'on combine — une population, un
 * département, des équipements qu'elles ont ou n'ont pas, des associations —
 * et la liste des communes qui y répondent toutes.
 *
 * Rien n'est calculé qui ne soit déjà publié : la population vient de l'index
 * des communes, les équipements de la base permanente des équipements de
 * l'INSEE, les associations du répertoire national, les indicateurs — taux de
 * foncier bâti, logements vacants, âges, catastrophes reconnues — des fichiers
 * que la page de commune affiche déjà, tels que
 * `scripts/proximite-emettre.ts` les range, un fichier par type ou par
 * domaine, chargé seulement quand le critère est choisi. Tout se passe dans le
 * navigateur ; l'adresse garde la recherche, qui se partage comme un lien.
 */
import { chargerIndex, type CommuneBreve } from './recherche-commune.ts';

type Fichier = { r: number[]; n: number[] };
/** Clé, libellé, unité, millésime, nombre de communes renseignées. */
/** Clé, libellé, unité, millésime, communes renseignées ; pour un oui-non, ce qu'on peut chercher. */
type Indicateur = [string, string, string, string, number, ('oui' | 'oui-non')?];
type IndexProximite = {
  equipements: { millesime: string; types: [string, number, string, number][] };
  associations: { domaines: [string, number][] };
  indicateurs?: Indicateur[];
};
/**
 * `e60` : le type 60 de la base ; `d9` : le domaine 9 du répertoire ;
 * `ifb` : l'indicateur `fb`, comparé à un seuil (« au moins » ou « au plus »).
 */
type Critere = { cle: string; mode: 'au-moins' | 'au-plus' | 'aucun'; n: number };

const PAGE = 100;

/** Les familles mises en avant, dans l'ordre : les groupes de la base de l'INSEE qu'elles réunissent. */
const FAMILLES: [string, (groupe: string) => boolean][] = [
  ['Équipements sportifs', (g) => g === 'Equipements sportifs'],
  ['Écoles', (g) => g.startsWith('Enseignement')],
  ['Santé', (g) => /santé|médicales|sanitaire/i.test(g)],
  ['Autres équipements', () => true],
];

const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
};

/** Le nombre, par rang de commune dans l'index, pour un critère ; pour un indicateur, sa valeur quand elle est publiée. */
const cache = new Map<string, Promise<Map<number, number>>>();
function compte(cle: string): Promise<Map<number, number>> {
  if (!cache.has(cle) && cle.startsWith('i')) {
    cache.set(
      cle,
      json<{ v: (number | null)[] }>(`/territoires/proximite/indicateurs/${cle.slice(1)}.json`).then((f) => {
        const m = new Map<number, number>();
        f.v.forEach((x, rang) => {
          if (x !== null) m.set(rang, x);
        });
        return m;
      }),
    );
  }
  if (!cache.has(cle)) {
    const url = cle.startsWith('e') ? `/territoires/proximite/equipements/${cle.slice(1)}.json` : `/territoires/proximite/associations/${cle.slice(1)}.json`;
    cache.set(
      cle,
      json<Fichier>(url).then((f) => {
        const m = new Map<number, number>();
        let rang = 0;
        f.r.forEach((ecart, k) => {
          rang += ecart;
          m.set(rang, f.n[k]);
        });
        return m;
      }),
    );
  }
  return cache.get(cle)!;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
}

export function brancherRequeteur(): void {
  const pmin = document.getElementById('rq-pmin') as HTMLInputElement | null;
  const pmax = document.getElementById('rq-pmax') as HTMLInputElement | null;
  const dep = document.getElementById('rq-dep') as HTMLSelectElement | null;
  const ajout = document.getElementById('rq-ajout') as HTMLSelectElement | null;
  const lignes = document.getElementById('rq-criteres');
  const etat = document.getElementById('rq-etat');
  const zone = document.getElementById('rq-resultats');
  if (!pmin || !pmax || !dep || !ajout || !lignes || !etat || !zone) return;

  let ip: IndexProximite | null = null;
  const criteres: Critere[] = [];
  let tour = 0;
  const indicateur = (cle: string) => (cle.startsWith('i') ? ip?.indicateurs?.find(([k]) => k === cle.slice(1)) : undefined);
  const libelle = (cle: string) => {
    if (!ip) return cle;
    const ind = indicateur(cle);
    if (ind) return `${ind[1]}${ind[2] ? ` (${ind[2]})` : ''}`;
    if (cle.startsWith('e')) {
      const nom = ip.equipements.types[Number(cle.slice(1))]?.[0] ?? cle;
      return nom.charAt(0).toUpperCase() + nom.slice(1);
    }
    return `Associations : ${ip.associations.domaines[Number(cle.slice(1))]?.[0] ?? cle}`;
  };
  const valide = (cle: string) =>
    !!ip &&
    ((cle.startsWith('e') && !!ip.equipements.types[Number(cle.slice(1))]) ||
      (cle.startsWith('d') && !!ip.associations.domaines[Number(cle.slice(1))]) ||
      !!indicateur(cle));
  const decimal = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  /** Ce que la case affiche : un compte vaut 0 quand la commune n'a rien ; un indicateur absent n'est pas un zéro. */
  const valeur = (cle: string, m: Map<number, number>, r: number) => {
    const x = m.get(r);
    if (indicateur(cle)?.[5]) return x === undefined ? '—' : x ? 'oui' : 'non';
    if (cle.startsWith('i')) return x === undefined ? '—' : decimal(x);
    return String(x ?? 0);
  };

  const ecrireAdresse = () => {
    const p = new URLSearchParams();
    if (pmin.value) p.set('pmin', pmin.value);
    if (pmax.value) p.set('pmax', pmax.value);
    if (dep.value) p.set('dep', dep.value);
    // Un indicateur s'écrit `ifb:min40` ou `ifb:max40`, un oui-non `ipnr:oui` ; un compte, `e60:2`, et 0 pour « aucun ».
    const morceau = (c: Critere) =>
      indicateur(c.cle)?.[5]
        ? `${c.cle}:${c.mode === 'au-plus' ? 'non' : 'oui'}`
        : c.cle.startsWith('i')
          ? `${c.cle}:${c.mode === 'au-plus' ? 'max' : 'min'}${c.n}`
          : `${c.cle}:${c.mode === 'aucun' ? 0 : c.n}`;
    if (criteres.length) p.set('c', criteres.map(morceau).join(','));
    history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
  };

  const dessinerCriteres = () => {
    lignes.textContent = '';
    criteres.forEach((c, i) => {
      const li = el('li', 'rq-critere');
      const mode = el('select');
      mode.setAttribute('aria-label', `Condition sur ${libelle(c.cle)}`);
      const ind = indicateur(c.cle);
      const booleen = ind?.[5];
      // Un oui-non : « oui » cherche 1, « non » cherche 0 — proposé seulement quand l'absence est une donnée.
      const modes: readonly (readonly [Critere['mode'], string])[] = booleen
        ? booleen === 'oui-non'
          ? [['au-moins', 'oui'], ['au-plus', 'non']]
          : [['au-moins', 'oui']]
        : ind
          ? [['au-moins', 'au moins'], ['au-plus', 'au plus']]
          : [['au-moins', 'au moins'], ['aucun', 'aucun']];
      for (const [v, t] of modes) {
        const o = el('option', '', t);
        o.value = v;
        o.selected = c.mode === v;
        mode.append(o);
      }
      const n = el('input');
      n.type = 'number';
      n.min = ind ? '0' : '1';
      if (ind) n.step = ind[2] === '%' ? '0.1' : '1';
      n.value = String(c.n);
      n.hidden = c.mode === 'aucun' || !!booleen;
      n.setAttribute('aria-label', ind ? `Seuil pour ${libelle(c.cle)}` : `Nombre minimum de ${libelle(c.cle)}`);
      const nom = el('span', 'rq-critere-nom', libelle(c.cle));
      if (ind)
        nom.title =
          booleen === 'oui'
            ? `${ind[3] ? `Au ${ind[3].split('-').reverse().join('/')} · ` : ''}${ind[4].toLocaleString('fr-FR')} communes connues ; une commune absente n’est pas dite hors du critère, on ne le sait pas.`
            : `${ind[3] ? `Millésime ${ind[3]} · ` : ''}${ind[4].toLocaleString('fr-FR')} communes renseignées ; les autres sont écartées par ce critère.`;
      const retirer = el('button', 'comparer-retirer', '×');
      retirer.type = 'button';
      retirer.setAttribute('aria-label', `Retirer le critère ${libelle(c.cle)}`);
      mode.addEventListener('change', () => {
        c.mode = mode.value as Critere['mode'];
        if (booleen) c.n = c.mode === 'au-plus' ? 0 : 1;
        n.hidden = c.mode === 'aucun' || !!booleen;
        void calculer();
      });
      n.addEventListener('change', () => {
        c.n = ind ? Math.max(0, Math.round((Number(n.value.replace(',', '.')) || 0) * 10) / 10) : Math.max(1, Math.round(Number(n.value) || 1));
        n.value = String(c.n);
        void calculer();
      });
      retirer.addEventListener('click', () => {
        criteres.splice(i, 1);
        dessinerCriteres();
        void calculer();
      });
      li.append(mode, n, nom, retirer);
      lignes.append(li);
    });
  };

  const csv = (communes: CommuneBreve[], comptes: Map<number, number>[], rangs: number[]) => {
    const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const tete = ['code INSEE', 'commune', 'département', 'population', ...criteres.map((c) => libelle(c.cle))];
    const corps = rangs.map((r) => [communes[r].code, communes[r].nom, communes[r].depNom, String(communes[r].population), ...comptes.map((m, k) => valeur(criteres[k].cle, m, r))]);
    const texte = '﻿' + [tete, ...corps].map((l) => l.map(esc).join(';')).join('\n');
    return URL.createObjectURL(new Blob([texte], { type: 'text/csv;charset=utf-8' }));
  };

  let lienCsv: string | null = null;
  const calculer = async () => {
    ecrireAdresse();
    const mien = ++tour;
    etat.textContent = 'Calcul…';
    let communes: CommuneBreve[];
    let comptes: Map<number, number>[];
    try {
      [communes, ...comptes] = (await Promise.all([chargerIndex(), ...criteres.map((c) => compte(c.cle))])) as [
        CommuneBreve[],
        ...Map<number, number>[],
      ];
    } catch {
      if (mien === tour) etat.textContent = 'Les données n’ont pas pu être chargées.';
      return;
    }
    if (mien !== tour) return;
    const min = pmin.value ? Number(pmin.value) : -Infinity;
    const max = pmax.value ? Number(pmax.value) : Infinity;
    const rangs: number[] = [];
    communes.forEach((c, r) => {
      if (c.population < min || c.population > max) return;
      if (dep.value && c.dep !== dep.value) return;
      for (let k = 0; k < criteres.length; k++) {
        const c = criteres[k];
        // Une commune dont l'indicateur n'est pas publié ne répond pas : on ne sait pas.
        if (c.cle.startsWith('i') && !comptes[k].has(r)) return;
        const n = comptes[k].get(r) ?? 0;
        if (c.mode === 'aucun' ? n > 0 : c.mode === 'au-plus' ? n > c.n : n < c.n) return;
      }
      rangs.push(r);
    });
    rangs.sort((a, b) => communes[b].population - communes[a].population);

    zone.textContent = '';
    if (lienCsv) URL.revokeObjectURL(lienCsv);
    lienCsv = null;
    etat.textContent =
      `${rangs.length.toLocaleString('fr-FR')} commune${rangs.length > 1 ? 's répondent' : ' répond'} à ces critères, sur ${communes.length.toLocaleString('fr-FR')} en France` +
      (rangs.length > 1 ? ' — de la plus peuplée à la moins peuplée.' : '.');
    if (!rangs.length) return;
    lienCsv = csv(communes, comptes, rangs);
    const telecharger = el('a', 'rq-csv', 'Télécharger la liste (CSV)');
    telecharger.href = lienCsv;
    telecharger.download = 'communes-rouages.csv';
    const table = el('table', 'rq-table');
    const thead = el('thead');
    const tr = el('tr');
    ['Commune', 'Département', 'Population', ...criteres.map((c) => libelle(c.cle))].forEach((t, k) => {
      const th = el('th', k >= 2 ? 'rq-nombre' : '', t);
      th.scope = 'col';
      tr.append(th);
    });
    thead.append(tr);
    const tbody = el('tbody');
    let montres = 0;
    const plus = el('button', 'p-marche-suite', '');
    plus.type = 'button';
    const montrer = () => {
      for (const r of rangs.slice(montres, montres + PAGE)) {
        const c = communes[r];
        const ligne = el('tr');
        const td = el('td');
        const a = el('a', '', c.nom);
        a.href = `/commune/${c.code}`;
        td.append(a);
        ligne.append(td, el('td', '', c.depNom), el('td', 'rq-nombre', c.population.toLocaleString('fr-FR')));
        comptes.forEach((m, k) => ligne.append(el('td', 'rq-nombre', valeur(criteres[k].cle, m, r))));
        tbody.append(ligne);
      }
      montres = Math.min(rangs.length, montres + PAGE);
      plus.hidden = montres >= rangs.length;
      plus.textContent = `Voir les ${Math.min(PAGE, rangs.length - montres).toLocaleString('fr-FR')} suivantes`;
    };
    plus.addEventListener('click', montrer);
    table.append(thead, tbody);
    const cadre = el('div', 'rq-cadre');
    cadre.append(table);
    zone.append(telecharger, cadre, plus);
    montrer();
  };

  void (async () => {
    ip = await json<IndexProximite>('/territoires/proximite/index.json');
    const index = await json<{ deps: Record<string, string> }>('/territoires/index.json');
    for (const [code, nom] of Object.entries(index.deps).sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))) {
      const o = el('option', '', `${code} · ${nom}`);
      o.value = code;
      dep.append(o);
    }
    // Les options : les familles demandées d'abord, puis le reste de la base, puis les associations.
    const pris = new Set<number>();
    for (const [famille, garde] of FAMILLES) {
      const g = el('optgroup');
      g.label = famille;
      ip.equipements.types.forEach(([nom, , groupe, n], t) => {
        if (!n || pris.has(t) || !garde(groupe)) return;
        pris.add(t);
        const o = el('option', '', nom.charAt(0).toUpperCase() + nom.slice(1));
        o.value = `e${t}`;
        g.append(o);
      });
      if (g.children.length) ajout.append(g);
    }
    const ga = el('optgroup');
    ga.label = 'Associations, par domaine';
    ip.associations.domaines.forEach(([nom, n], d) => {
      if (!n) return;
      const o = el('option', '', nom);
      o.value = `d${d}`;
      ga.append(o);
    });
    ajout.append(ga);
    // Les indicateurs chiffrés, puis ce qui s'applique ou non à la commune : un parc, un site protégé, un plan.
    for (const [titre, garde] of [
      ['Indicateurs', (i: Indicateur) => !i[5]],
      ['Protections et engagements', (i: Indicateur) => !!i[5]],
    ] as const) {
      const gi = el('optgroup');
      gi.label = titre;
      for (const i of ip.indicateurs ?? []) {
        const [cle, nom, unite, millesime, n] = i;
        if (!n || !garde(i)) continue;
        const date = millesime ? ` — ${/^\d{4}-\d{2}-\d{2}$/.test(millesime) ? `au ${millesime.split('-').reverse().join('/')}` : millesime.replace('-', ' à ')}` : '';
        const o = el('option', '', `${nom}${unite ? ` (${unite})` : ''}${date}`);
        o.value = `i${cle}`;
        gi.append(o);
      }
      if (gi.children.length) ajout.append(gi);
    }

    const p = new URLSearchParams(location.search);
    pmin.value = p.get('pmin') ?? '';
    pmax.value = p.get('pmax') ?? '';
    if (p.get('dep') && [...dep.options].some((o) => o.value === p.get('dep'))) dep.value = p.get('dep')!;
    for (const morceau of (p.get('c') ?? '').split(',').filter(Boolean)) {
      const [cle, n = ''] = morceau.split(':');
      if (!valide(cle) || criteres.some((c) => c.cle === cle)) continue;
      if (indicateur(cle)?.[5]) {
        const non = n === 'non' && indicateur(cle)?.[5] === 'oui-non';
        criteres.push({ cle, mode: non ? 'au-plus' : 'au-moins', n: non ? 0 : 1 });
      } else if (cle.startsWith('i')) {
        const seuil = /^(min|max)(\d+(?:\.\d+)?)$/.exec(n);
        criteres.push({ cle, mode: seuil?.[1] === 'max' ? 'au-plus' : 'au-moins', n: seuil ? Number(seuil[2]) : 0 });
      } else criteres.push({ cle, mode: n === '0' ? 'aucun' : 'au-moins', n: Math.max(1, Number(n) || 1) });
    }
    dessinerCriteres();

    ajout.addEventListener('change', () => {
      const cle = ajout.value;
      ajout.value = '';
      if (!cle || criteres.some((c) => c.cle === cle)) return;
      criteres.push({ cle, mode: 'au-moins', n: cle.startsWith('i') && !indicateur(cle)?.[5] ? 0 : 1 });
      dessinerCriteres();
      void calculer();
    });
    for (const champ of [pmin, pmax]) champ.addEventListener('change', () => void calculer());
    dep.addEventListener('change', () => void calculer());
    void calculer();
  })();
}
