/**
 * Le chemin des crédits d'un programme, année par année : du voté à
 * l'exécuté, d'après les annexes des PLRG (`scripts/budget-programmes-emettre.ts`).
 * Le fichier n'est chargé qu'à la première demande ; l'adresse garde le
 * programme choisi, `?programme=152#par-programme`.
 */
type Chemin = [number, number, number, number, number, number, number, number, number, number, number];
type Programme = { numero: number; nom: string; mission: string; categorie: string; annees: Record<string, Chemin> };
type Fichier = { annees: number[]; programmes: Programme[] };

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
  const t = a >= 1e9 ? `${(a / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Md€` : `${(a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: a < 1e7 ? 1 : 0 })} M€`;
  return v < 0 ? `−${t}` : signe ? `+${t}` : t;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
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
    const ecart = c[7] - c[0];
    const phrase = el(
      'p',
      'mesure',
      `En ${derniere}, le programme « ${p.nom} » (${p.numero}, mission ${p.mission}) a dépensé ${md(c[7])}, ` +
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
      const tr = el('tr', e.total ? 'pe-total' : '');
      const th = el('th', '', e.nom);
      th.scope = 'row';
      tr.append(th);
      for (const a of annees) {
        const v = p.annees[a][e.i];
        // Les annulations et les reports sortent du chemin : ils se lisent en moins.
        tr.append(el('td', 'rq-nombre', md(e.i === 9 || e.i === 10 ? -v : v, e.signe)));
      }
      tbody.append(tr);
    }
    const tr = el('tr', 'pe-ecart');
    const th = el('th', '', 'Écart : dépensé moins voté');
    th.scope = 'row';
    tr.append(th);
    for (const a of annees) tr.append(el('td', 'rq-nombre', md(p.annees[a][7] - p.annees[a][0], true)));
    tbody.append(tr);
    table.append(thead, tbody);
    const cadre = el('div', 'rq-cadre');
    cadre.append(table);
    zone.append(phrase, cadre);
    const url = new URL(location.href);
    url.searchParams.set('programme', cle);
    history.replaceState(null, '', url);
  };

  const demande = new URLSearchParams(location.search).get('programme');
  if (demande && [...choix.options].some((o) => o.value === demande)) choix.value = demande;
  choix.addEventListener('change', () => void afficher());
  void afficher();
}
