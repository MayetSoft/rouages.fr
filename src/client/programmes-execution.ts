/**
 * Le chemin des crédits d'un programme, année par année : du voté à
 * l'exécuté, d'après les annexes des PLRG (`scripts/budget-programmes-emettre.ts`).
 * Le fichier n'est chargé qu'à la première demande ; l'adresse garde le
 * programme choisi, `?programme=152#par-programme`.
 */
/** Une étape que la source de l'année ne publie pas vaut null (synthèses des RAP : le voté et le dépensé seulement). */
type Chemin = [number, ...(number | null)[]];
type Programme = { numero: number; nom: string; mission: string; categorie: string; annees: Record<string, Chemin> };
type Fichier = { annees: number[]; sources: { annee: number; nature: 'PLRG' | 'RAP' }[]; programmes: Programme[] };

/** Les étapes du chemin, dans l'ordre où l'argent passe, et ce qu'elles font au total. */
const ETAPES: { i: number; nom: string; signe: boolean; total?: boolean }[] = [
  { i: 0, nom: 'Voté — loi de finances initiale', signe: false, total: true },
  { i: 1, nom: 'Loi rectificative ou de fin de gestion', signe: true },
  { i: 2, nom: 'Reports de l’année précédente', signe: true },
  { i: 3, nom: 'Mouvements en cours d’année (virements, transferts, décrets)', signe: true },
  { i: 4, nom: 'Fonds de concours et attributions de produits', signe: true },
  { i: 5, nom: 'Fongibilité asymétrique', signe: true },
  { i: 6, nom: 'Crédits ouverts', signe: false, total: true },
  { i: 9, nom: 'Annulés', signe: true },
  { i: 10, nom: 'Reportés sur l’année suivante', signe: true },
  { i: 8, nom: 'Modifications d’ouverture', signe: true },
  { i: 7, nom: 'Dépensé', signe: false, total: true },
];

const md = (v: number, signe = false) => {
  if (v === 0) return '—';
  const a = Math.abs(v);
  const t =
    a >= 1e9
      ? `${(a / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md€`
      : a >= 1e6
        ? `${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: a < 1e7 ? 1 : 0 })} M€`
        : a >= 1e3
          ? `${Math.round(a / 1e3).toLocaleString('fr-FR')} k€`
          : `${Math.round(a).toLocaleString('fr-FR')} €`;
  return v < 0 ? `−${t}` : signe ? `+${t}` : t;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
}

type Sous = { libelle: string; unite: string; contexte: boolean; realise: string[]; cible: string; atteinte: string; cibleSuivante: string };
type Performance = { numero: number; nom: string; objectifs: { code: string; libelle: string; indicateurs: { code: string; libelle: string; sous: Sous[] }[] }[] };

/**
 * Les objectifs et indicateurs du programme, au dernier rapport annuel de performances
 * (`scripts/budget-performance-emettre.ts`) : tout tel que publié, la cotation comprise.
 * `encore()` dit si le programme est toujours celui qu'on a choisi quand le fichier arrive.
 */
async function afficherPerformance(zone: HTMLElement, numero: number, encore: () => boolean): Promise<void> {
  const rap = Number(zone.dataset.rap);
  const annees = (zone.dataset.annees ?? '').split(',').filter(Boolean);
  if (!rap) return;
  let perf: Performance;
  try {
    const r = await fetch(`/territoires/performance/${numero}.json`);
    if (!r.ok) return;
    perf = (await r.json()) as Performance;
  } catch {
    return;
  }
  if (!encore()) return;
  const toutes = perf.objectifs.flatMap((o) => o.indicateurs.flatMap((i) => i.sous));
  const compte = (c: string) => toutes.filter((x) => x.atteinte === c).length;
  const bloc = el('div', 'pe-perf');
  bloc.append(el('h4', 'pe-perf-titre', `Ses objectifs et ses résultats, au rapport annuel de performances ${rap}`));
  const parts = [
    [compte('cible atteinte'), 'cible atteinte', 'cibles atteintes'],
    [compte('amélioration'), 'en amélioration sans atteindre la cible', 'en amélioration sans atteindre la cible'],
    [compte('absence amélioration'), 'sans amélioration', 'sans amélioration'],
    [compte('donnée non renseignée') + compte('donnée non retenue'), 'non renseigné ou non retenu', 'non renseignés ou non retenus'],
  ].filter(([n]) => (n as number) > 0).map(([n, un, plusieurs]) => `${n} ${(n as number) > 1 ? plusieurs : un}`);
  bloc.append(
    el(
      'p',
      'v-nature',
      `${perf.objectifs.length} objectif${perf.objectifs.length > 1 ? 's' : ''}, ${toutes.length} sous-indicateur${toutes.length > 1 ? 's' : ''}` +
        (parts.length ? ` ; d’après la cotation du ministère : ${parts.join(', ')}.` : '.'),
    ),
  );
  for (const o of perf.objectifs) {
    const details = el('details', 'pe-objectif');
    details.append(el('summary', '', o.libelle));
    const table = el('table', 'rq-table pe-perf-table');
    const tete = el('tr');
    for (const [t, nombre] of [['Indicateur', false], ['Unité', false], ...annees.map((a) => [`Réalisé ${a}`, true] as const), [`Cible ${rap}`, true], ['Cotation', false]] as const) {
      const th = el('th', nombre ? 'rq-nombre' : '', t);
      th.scope = 'col';
      tete.append(th);
    }
    const thead = el('thead');
    thead.append(tete);
    const tbody = el('tbody');
    const colonnes = 4 + annees.length;
    for (const i of o.indicateurs) {
      // Un indicateur à plusieurs sous-indicateurs prend une ligne d'en-tête : son libellé n'est pas répété.
      const groupe = i.sous.length > 1 || i.sous[0]?.libelle !== i.libelle;
      if (groupe) {
        const tr = el('tr', 'pe-ind');
        const th = el('th', '', i.libelle);
        th.colSpan = colonnes;
        th.scope = 'rowgroup';
        tr.append(th);
        tbody.append(tr);
      }
      for (const x of i.sous) {
        const tr = el('tr', groupe ? 'pe-sous' : '');
        const th = el('th', '', x.libelle);
        th.scope = 'row';
        tr.append(th, el('td', '', x.unite));
        for (const v of x.realise) tr.append(el('td', 'rq-nombre', v || '—'));
        tr.append(el('td', 'rq-nombre', x.cible || '—'));
        tr.append(el('td', 'pe-cotation', [x.atteinte, x.contexte ? 'indicateur de contexte' : ''].filter(Boolean).join(' · ') || '—'));
        tbody.append(tr);
      }
    }
    table.append(thead, tbody);
    const cadre = el('div', 'rq-cadre');
    cadre.append(table);
    details.append(cadre);
    bloc.append(details);
  }
  zone.append(bloc);
}

export function brancherProgrammesExecution(): void {
  const choix = document.getElementById('pe-programme') as HTMLSelectElement | null;
  const zone = document.getElementById('pe-detail');
  if (!choix || !zone) return;
  let fichier: Promise<Fichier> | null = null;
  const charger = () => (fichier ??= fetch('/territoires/budget-etat-programmes.json').then((r) => r.json() as Promise<Fichier>));

  const afficher = async () => {
    const cle = choix.value;
    const [categorie, numero] = cle.split('|');
    zone.textContent = 'Chargement…';
    let f: Fichier;
    try {
      f = await charger();
    } catch {
      zone.textContent = 'Les données n’ont pas pu être chargées.';
      return;
    }
    const p = f.programmes.find((x) => x.categorie === categorie && String(x.numero) === numero);
    zone.textContent = '';
    if (!p) return;
    const annees = f.annees.filter((a) => p.annees[a]);
    const derniere = annees.at(-1)!;
    const c = p.annees[derniere];
    const depense = c[7] ?? 0;
    const ecart = depense - c[0];
    const phrase = el(
      'p',
      'mesure',
      `En ${derniere}, le programme « ${p.nom} » (${p.numero}, mission ${p.mission}) a dépensé ${md(depense)}, ` +
        (ecart === 0
          ? 'exactement ce qui était voté.'
          : c[0] === 0
            ? 'sans crédits votés en loi de finances initiale : tout est venu en cours d’année ou de l’année précédente.'
            : `soit ${md(Math.abs(ecart))} ${ecart > 0 ? 'de plus' : 'de moins'} que les ${md(c[0])} votés en loi de finances initiale (${ecart > 0 ? '+' : '−'}${Math.abs((ecart / c[0]) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %).`),
    );
    const table = el('table', 'rq-table pe-table');
    const tete = el('tr');
    tete.append(el('th', '', 'Étape'));
    for (const a of annees) {
      const th = el('th', 'rq-nombre', String(a));
      th.scope = 'col';
      tete.append(th);
    }
    const thead = el('thead');
    thead.append(tete);
    const tbody = el('tbody');
    for (const e of ETAPES) {
      // Une étape vide toutes les années n'apporte rien : on la tait.
      if (!e.total && annees.every((a) => !p.annees[a][e.i])) continue;
      if (e.i === 6 && annees.every((a) => p.annees[a][6] === null)) continue;
      const tr = el('tr', e.total ? 'pe-total' : '');
      const th = el('th', '', e.nom);
      th.scope = 'row';
      tr.append(th);
      for (const a of annees) {
        const v = p.annees[a][e.i];
        if (v === null || v === undefined) {
          const td = el('td', 'rq-nombre pe-np', 'n. p.');
          td.title = 'Étape non publiée pour cette année';
          tr.append(td);
          continue;
        }
        // Les annulations et les reports sortent du chemin : ils se lisent en moins.
        tr.append(el('td', 'rq-nombre', md(e.i === 9 || e.i === 10 ? -v : v, e.signe)));
      }
      tbody.append(tr);
    }
    const tr = el('tr', 'pe-ecart');
    const th = el('th', '', 'Écart : dépensé moins voté');
    th.scope = 'row';
    tr.append(th);
    for (const a of annees) tr.append(el('td', 'rq-nombre', md((p.annees[a][7] ?? 0) - p.annees[a][0], true)));
    tbody.append(tr);
    table.append(thead, tbody);
    const cadre = el('div', 'rq-cadre');
    cadre.append(table);
    zone.append(phrase, cadre);
    // Ce que la table ne montre pas : les années sans source, et celles qui n'ont que deux étapes.
    const absentes = annees.slice(0, -1).flatMap((a, i) => Array.from({ length: annees[i + 1] - a - 1 }, (_, k) => a + k + 1));
    const partielles = annees.filter((a) => f.sources.find((x) => x.annee === a)?.nature === 'RAP');
    const notes = [
      partielles.length ? `${partielles.join(' et ')} : le voté et le dépensé seulement, d’après la synthèse des rapports annuels de performances ; « n. p. », étape non publiée.` : '',
      absentes.length ? `${absentes.join(' et ')} : pas publiés par programme en données ouvertes.` : '',
      annees.length < f.annees.length ? `Le programme n’apparaît pas dans toutes les années collectées (création, fusion ou changement de numéro).` : '',
    ].filter(Boolean);
    if (notes.length) zone.append(el('p', 'v-nature', notes.join(' ')));
    await afficherPerformance(zone, p.numero, () => choix.value === cle);
    const url = new URL(location.href);
    url.searchParams.set('programme', cle);
    history.replaceState(null, '', url);
  };

  const demande = new URLSearchParams(location.search).get('programme');
  if (demande && [...choix.options].some((o) => o.value === demande)) choix.value = demande;
  choix.addEventListener('change', () => void afficher());
  void afficher();
}
