/**
 * « Le plus proche » : depuis une commune, l'équipement, l'entreprise ou
 * l'association la plus proche.
 *
 * Trois sources, trois précisions, que la page dit à chaque fois :
 *
 * - **les équipements** (base permanente des équipements de l'INSEE) et
 *   **les associations** (répertoire national) sont comptés commune par
 *   commune : la distance va du centre de la commune de départ au centre de
 *   celle qui en a, à vol d'oiseau. Les fichiers viennent de
 *   `scripts/proximite-emettre.ts`, un par type ou par domaine, chargé à la
 *   demande ;
 * - **les entreprises** sont cherchées autour du centre de la commune par
 *   l'API Recherche d'entreprises de l'État, qui situe chaque établissement à
 *   son adresse : la distance va du centre de la commune à l'établissement.
 *   Seul ce point part vers l'API — jamais la position de qui consulte. Un
 *   établissement que le répertoire SIRENE ne diffuse pas est compté, pas
 *   nommé (CLAUDE.md, « Les noms dans les données »).
 */
import { chargerIndex, chercher, type CommuneBreve } from './recherche-commune.ts';
import { brancherLaOuJeSuis } from './la-ou-je-suis.ts';
import { ACTIVITES_PROCHES } from '../modele/activites-proches.ts';

type Fichier = { r: number[]; n: number[] };
type IndexProximite = {
  maj: string;
  contours: string;
  equipements: { maj: string; millesime: string; types: [string, number, string, number][] };
  associations: { maj: string; domaines: [string, number][] };
};

const MONTRES = 10;
const API = 'https://recherche-entreprises.api.gouv.fr/near_point';
const FICHE = 'https://annuaire-entreprises.data.gouv.fr/etablissement/';

const json = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} : ${r.status}`);
  return (await r.json()) as T;
};

let centres: (number | null)[] | null = null;
const chargerCentres = async () => (centres ??= (await json<{ c: (number | null)[] }>('/territoires/proximite/centres.json')).c);

/** Distance à vol d'oiseau, en kilomètres. */
function distance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dlat = (lat2 - lat1) * rad;
  const dlon = (lon2 - lon1) * rad;
  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
const km = (d: number) => (d < 1 ? 'moins d’un kilomètre' : `${d.toLocaleString('fr-FR', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
}

export function brancherPlusProche(): void {
  const champ = document.getElementById('pp-commune') as HTMLInputElement | null;
  const liste = document.getElementById('pp-commune-liste');
  const quoi = document.getElementById('pp-quoi') as HTMLSelectElement | null;
  const etat = document.getElementById('pp-etat');
  const resultats = document.getElementById('pp-resultats');
  const ici = document.querySelector<HTMLElement>('.pp-ici');
  if (!champ || !liste || !quoi || !etat || !resultats) return;

  let depart: CommuneBreve | null = null;
  let indexProximite: IndexProximite | null = null;
  let tour = 0;

  const ecrireAdresse = () => {
    const p = new URLSearchParams();
    if (depart) p.set('c', depart.code);
    if (quoi.value) p.set('q', quoi.value);
    history.replaceState(null, '', p.size ? `?${p}` : location.pathname);
  };

  // Les options : les équipements et les domaines viennent de l'index de proximité.
  const remplirOptions = async () => {
    indexProximite = await json<IndexProximite>('/territoires/proximite/index.json');
    const groupes = new Map<string, HTMLOptGroupElement>();
    const groupe = (nom: string) => {
      if (!groupes.has(nom)) {
        const g = el('optgroup');
        g.label = nom;
        groupes.set(nom, g);
      }
      return groupes.get(nom)!;
    };
    indexProximite.equipements.types.forEach(([nom, , famille, n], t) => {
      if (!n) return;
      const o = el('option', '', nom.charAt(0).toUpperCase() + nom.slice(1));
      o.value = `e${t}`;
      groupe(`Un équipement — ${famille}`).append(o);
    });
    for (const a of ACTIVITES_PROCHES) {
      const o = el('option', '', a.nom);
      o.value = `a-${a.id}`;
      groupe(`Une entreprise — ${a.groupe}`).append(o);
    }
    indexProximite.associations.domaines.forEach(([nom, n], d) => {
      if (!n) return;
      const o = el('option', '', nom);
      o.value = `d${d}`;
      groupe('Une association, par domaine').append(o);
    });
    // Les entreprises d'abord : c'est ce qu'on cherche le plus souvent quand il manque quelque chose.
    const ordre = [...groupes.entries()].sort(([a], [b]) => Number(!a.startsWith('Une entreprise')) - Number(!b.startsWith('Une entreprise')));
    for (const [, g] of ordre) quoi.append(g);
  };

  const dire = (t: string) => {
    etat.textContent = t;
  };

  /** Équipements et associations : les communes qui en ont, des plus proches aux plus lointaines. */
  const parCommune = async (fichier: string, libelle: (n: number) => string, ancre: string, source: string) => {
    const [index, c, f] = await Promise.all([chargerIndex(), chargerCentres(), json<Fichier>(fichier)]);
    const i0 = index.findIndex((x) => x.code === depart!.code);
    const lon0 = (c[2 * i0] ?? 0) / 1000;
    const lat0 = (c[2 * i0 + 1] ?? 0) / 1000;
    const trouves: { i: number; n: number; d: number }[] = [];
    let rangCourant = 0;
    f.r.forEach((ecart, k) => {
      rangCourant += ecart;
      const lon = c[2 * rangCourant];
      const lat = c[2 * rangCourant + 1];
      if (lon === null || lat === null) return;
      trouves.push({ i: rangCourant, n: f.n[k], d: distance(lat0, lon0, lat / 1000, lon / 1000) });
    });
    trouves.sort((a, b) => a.d - b.d);
    const ul = el('ul', 'pp-liste');
    for (const t of trouves.slice(0, MONTRES)) {
      const x = index[t.i];
      const li = el('li');
      const a = el('a', '', x.nom);
      a.href = `/commune/${x.code}#${ancre}`;
      const ou = el('span', 'pp-distance', t.i === i0 ? 'sur place' : km(t.d));
      li.append(ou, a, el('span', 'v-nature', ` ${x.depNom} · ${libelle(t.n)}`));
      ul.append(li);
    }
    resultats.append(ul);
    resultats.append(
      el(
        'p',
        'p-strate',
        `Distance à vol d’oiseau entre le centre de ${depart!.nom} et celui de chaque commune, d’après ses contours — pas la route, et pas l’adresse de l’équipement. ${source}`,
      ),
    );
    return trouves.length;
  };

  type Etab = { siret: string; nom: string; adresse: string; d: number; naf: string };
  /** Entreprises : l'API, de proche en proche, jusqu'à en avoir assez. */
  const entreprises = async (id: string) => {
    const act = ACTIVITES_PROCHES.find((a) => a.id === id)!;
    const codes = new Set(act.naf.map(([c]) => c));
    const [index, c] = await Promise.all([chargerIndex(), chargerCentres()]);
    const i0 = index.findIndex((x) => x.code === depart!.code);
    const lon0 = (c[2 * i0] ?? 0) / 1000;
    const lat0 = (c[2 * i0 + 1] ?? 0) / 1000;
    const vus = new Map<string, Etab>();
    let caches = 0;
    let rayon = 0;
    for (const r of [5, 15, 50]) {
      rayon = r;
      for (let page = 1; page <= 4; page++) {
        const q = new URLSearchParams({
          lat: lat0.toFixed(3),
          long: lon0.toFixed(3),
          radius: String(r),
          activite_principale: [...codes].join(','),
          per_page: '25',
          page: String(page),
        });
        const rep = await json<{
          total_pages: number;
          results: {
            nom_complet: string;
            statut_diffusion: string;
            matching_etablissements: {
              siret: string;
              activite_principale: string;
              etat_administratif: string;
              statut_diffusion_etablissement: string;
              adresse: string;
              commune: string;
              latitude: string;
              longitude: string;
              liste_enseignes: string[] | null;
              nom_commercial: string | null;
            }[];
          }[];
        }>(`${API}?${q}`);
        for (const u of rep.results) {
          for (const e of u.matching_etablissements ?? []) {
            // L'API filtre l'entreprise, pas l'établissement : on garde ceux qui exercent cette activité, ouverts.
            if (!codes.has(e.activite_principale) || e.etat_administratif !== 'A' || vus.has(e.siret)) continue;
            if (u.statut_diffusion !== 'O' || e.statut_diffusion_etablissement !== 'O') {
              caches++;
              vus.set(e.siret, { siret: e.siret, nom: '', adresse: '', d: Infinity, naf: '' });
              continue;
            }
            const lat = Number(e.latitude);
            const lon = Number(e.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            const enseigne = e.liste_enseignes?.[0] ?? e.nom_commercial ?? '';
            vus.set(e.siret, {
              siret: e.siret,
              nom: enseigne && enseigne.toUpperCase() !== u.nom_complet.toUpperCase() ? `${u.nom_complet} (${enseigne})` : u.nom_complet,
              adresse: e.adresse,
              d: distance(lat0, lon0, lat, lon),
              naf: e.activite_principale,
            });
          }
        }
        if (page >= rep.total_pages) break;
      }
      if ([...vus.values()].filter((x) => x.nom).length >= 5) break;
    }
    const nommes = [...vus.values()].filter((x) => x.nom).sort((a, b) => a.d - b.d);
    const libelleNaf = new Map(act.naf);
    const ul = el('ul', 'pp-liste');
    for (const x of nommes.slice(0, MONTRES)) {
      const li = el('li');
      const a = el('a', '', x.nom);
      a.href = FICHE + x.siret;
      a.target = '_blank';
      a.rel = 'noopener';
      li.append(el('span', 'pp-distance', km(x.d)), a, el('span', 'v-nature', ` ${x.adresse} · ${libelleNaf.get(x.naf) ?? x.naf}`));
      ul.append(li);
    }
    if (nommes.length) resultats.append(ul);
    resultats.append(
      el(
        'p',
        'p-strate',
        `Établissements ouverts dont l’activité principale déclarée au répertoire SIRENE est ${act.naf.map(([code, nom]) => `« ${nom} » (${code})`).join(', ')}, cherchés dans un rayon de ${rayon} km autour du centre de ${depart!.nom}. ` +
          'Distance à vol d’oiseau jusqu’à l’adresse de l’établissement. L’activité déclarée ne dit pas tout : un commerce peut en exercer une autre que celle de son code. ' +
          (caches ? `${caches} établissement${caches > 1 ? 's' : ''} que le répertoire ne diffuse pas ${caches > 1 ? 'sont comptés' : 'est compté'}, pas ${caches > 1 ? 'nommés' : 'nommé'}. ` : '') +
          'D’après l’API Recherche d’entreprises de l’État, sur les données SIRENE de l’INSEE (Licence Ouverte) ; chaque nom mène à sa fiche sur l’Annuaire des entreprises.',
      ),
    );
    return nommes.length;
  };

  const chercherProche = async () => {
    ecrireAdresse();
    resultats.textContent = '';
    if (!depart || !quoi.value || !indexProximite) {
      dire(depart ? 'Choisissez ce que vous cherchez.' : 'Choisissez une commune de départ.');
      return;
    }
    const mien = ++tour;
    dire('Recherche…');
    const v = quoi.value;
    try {
      let n = 0;
      if (v.startsWith('e')) {
        const t = Number(v.slice(1));
        const [nom] = indexProximite.equipements.types[t];
        n = await parCommune(
          `/territoires/proximite/equipements/${t}.json`,
          (k) => `${k} ${nom}`,
          'equipements',
          `D’après la base permanente des équipements de l’INSEE, millésime ${indexProximite.equipements.millesime}.`,
        );
      } else if (v.startsWith('d')) {
        const d = Number(v.slice(1));
        n = await parCommune(
          `/territoires/proximite/associations/${d}.json`,
          (k) => `${k} association${k > 1 ? 's' : ''} de ce domaine`,
          'associations',
          'D’après le répertoire national des associations (RNA) : les associations existantes, rangées par le premier domaine de leur objet social. La liste de chaque commune est sur sa page.',
        );
      } else if (v.startsWith('a-')) {
        n = await entreprises(v.slice(2));
      }
      if (mien !== tour) return;
      dire(n ? '' : 'Rien trouvé à moins de 50 km.');
    } catch {
      if (mien !== tour) return;
      resultats.textContent = '';
      dire(v.startsWith('a-') ? 'L’API Recherche d’entreprises ne répond pas. À réessayer dans un instant.' : 'Les données n’ont pas pu être chargées.');
    }
  };

  const choisirDepart = (c: CommuneBreve) => {
    depart = c;
    champ.value = `${c.nom} (${c.depNom})`;
    liste.textContent = '';
    void chercherProche();
  };

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
          const li = el('li');
          const b = el('button', '', `${c.nom} — ${c.depNom}, ${c.population.toLocaleString('fr-FR')} hab.`);
          b.type = 'button';
          b.addEventListener('click', () => choisirDepart(c));
          li.append(b);
          liste.append(li);
        }
      })
      .catch(() => {
        liste.textContent = '';
      });
  });
  quoi.addEventListener('change', () => void chercherProche());
  if (ici) {
    brancherLaOuJeSuis(ici.querySelector('button')!, ici.querySelector<HTMLElement>('.cm-ici-message')!, async ({ code }) => {
      const c = (await chargerIndex()).find((x) => x.code === code);
      if (c) choisirDepart(c);
    });
  }

  void (async () => {
    await remplirOptions();
    const p = new URLSearchParams(location.search);
    const q = p.get('q');
    if (q && [...quoi.options].some((o) => o.value === q)) quoi.value = q;
    const code = p.get('c');
    const c = code ? (await chargerIndex()).find((x) => x.code === code) : undefined;
    if (c) choisirDepart(c);
    else dire('Choisissez une commune de départ.');
  })();
}
