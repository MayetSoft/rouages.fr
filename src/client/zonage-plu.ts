/**
 * Le zonage du document d'urbanisme, chargé à la demande depuis le service
 * WFS de la Géoplateforme de l'IGN, qui sert les couches du Géoportail de
 * l'urbanisme : les zones d'un PLU ou d'un PLUi (`wfs_du:zone_urba`), à
 * défaut les secteurs d'une carte communale (`wfs_du:secteur_cc`).
 *
 * Rien ne part sans un clic : le service voit alors l'adresse IP du
 * visiteur, comme pour toute carte qu'il sert, et Rouages n'en garde rien.
 * Le zonage n'est pas stocké par le site — il pèserait des dizaines de
 * gigaoctets pour la France — et il est donc toujours celui que le
 * Géoportail publie au moment où on le demande.
 *
 * La carte reprend le cadrage de la page (`projectionSurCommune`) : les zones
 * sont découpées au contour de la commune, colorées par type, et la liste
 * dessous dit chaque zone, son libellé et la page du règlement qui la décrit.
 */

const WFS = 'https://data.geopf.fr/wfs/ows';
const ANNEXES = 'https://data.geopf.fr/annexes/gpu/documents';
const PAGE = 1000;
const NS = 'http://www.w3.org/2000/svg';

type Proprietes = Record<string, string | null | undefined>;
type Entite = { properties: Proprietes; geometry: { type: string; coordinates: number[][][] | number[][][][] } | null };

/** La classe de dessin et le libellé de la légende, par type de zone (PLU) ou de secteur (carte communale). */
const PLU: Record<string, [string, string]> = {
  U: ['u', 'Zone urbaine (U)'],
  AU: ['au', 'Zone à urbaniser (AU)'],
  A: ['a', 'Zone agricole (A)'],
  N: ['n', 'Zone naturelle et forestière (N)'],
};
const CC: Record<string, [string, string]> = {
  '01': ['u', 'Secteur ouvert à la construction'],
  '02': ['au', 'Secteur réservé aux activités'],
  '03': ['n', 'Secteur où la construction n’est pas autorisée, sauf exceptions prévues par la loi'],
};
const ORDRE = ['u', 'au', 'a', 'n', 'autre'];

async function toutLire(couche: string, cadre: string): Promise<Entite[]> {
  const sortie: Entite[] = [];
  for (let debut = 0; debut < 20 * PAGE; debut += PAGE) {
    const p = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: couche,
      OUTPUTFORMAT: 'application/json',
      SRSNAME: 'EPSG:4326',
      COUNT: String(PAGE),
      STARTINDEX: String(debut),
      BBOX: `${cadre},urn:ogc:def:crs:EPSG::4326`,
    });
    const r = await fetch(`${WFS}?${p}`);
    if (!r.ok) throw new Error(`${couche} : ${r.status}`);
    const d = (await r.json()) as { features?: Entite[] };
    const f = d.features ?? [];
    sortie.push(...f);
    if (f.length < PAGE) break;
  }
  return sortie;
}

/** Les anneaux d'une géométrie, en dix-millièmes de degré. */
function anneaux(g: Entite['geometry']): number[][][] {
  if (!g) return [];
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
  return polys.flatMap((p) => p.map((r) => r.map(([x, y]) => [x * 1e4, y * 1e4])));
}

function dedans(x: number, y: number, rs: number[][][]): boolean {
  let c = false;
  for (const r of rs)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  return c;
}

/** La distance d'un point au bord le plus proche, dans l'unité des anneaux. */
function auBord(x: number, y: number, rs: number[][][]): number {
  let d = Infinity;
  for (const r of rs)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j];
      const [bx, by] = r[i];
      const l = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = l ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l)) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
    }
  return d;
}

/** Cinq dix-millièmes de degré, une cinquantaine de mètres : la précision du contour simplifié de la commune. */
const MARGE = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe = '', texte = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte) e.textContent = texte;
  return e;
}

function dateDe(idurba: string | null | undefined): string | null {
  const m = /_(\d{4})(\d{2})(\d{2})(?:_|$)/.exec(idurba ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export function brancherZonagePlu(): void {
  for (const bloc of document.querySelectorAll<HTMLElement>('.zp')) {
    const bouton = bloc.querySelector<HTMLButtonElement>('.zp-charger');
    const etat = bloc.querySelector<HTMLElement>('.zp-etat');
    const svg = bloc.querySelector<SVGSVGElement>('.zp-carte svg');
    const groupe = bloc.querySelector<SVGGElement>('.zp-zones');
    const liste = bloc.querySelector<HTMLElement>('.zp-liste');
    if (!bouton || !etat || !svg || !groupe || !liste) continue;
    const commune = JSON.parse(bloc.dataset.contour ?? '[]') as number[][][];
    const [k, x0, y0, s] = (bloc.dataset.projection ?? '').split(',').map(Number);
    const cadre = bloc.dataset.cadre ?? '';
    const ecran = (r: number[][]) => 'M' + r.map(([x, y]) => `${((x * k - x0) * s).toFixed(1)} ${((-y - y0) * s).toFixed(1)}`).join('L') + 'Z';

    bouton.addEventListener('click', async () => {
      bouton.disabled = true;
      etat.textContent = 'Chargement depuis la Géoplateforme de l’IGN…';
      let entites: Entite[];
      let table = PLU;
      let champ = 'typezone';
      try {
        entites = await toutLire('wfs_du:zone_urba', cadre);
        if (!entites.length) {
          entites = await toutLire('wfs_du:secteur_cc', cadre);
          table = CC;
          champ = 'typesect';
        }
      } catch {
        etat.textContent = 'La Géoplateforme n’a pas répondu. Réessayez plus tard, ou consultez le Géoportail de l’urbanisme.';
        bouton.disabled = false;
        return;
      }
      // Le cadre déborde sur les voisines, et une zone d'un document intercommunal aussi. On garde une zone
      // dont un sommet est dans la commune à plus de 50 m de sa limite — le contour de la page est simplifié,
      // et une zone voisine qui la longe a ses sommets sur la limite même —, ou qui contient la commune.
      const premier = commune[0] ?? [];
      const cx = premier.reduce((t, [x]) => t + x, 0) / (premier.length || 1);
      const cy = premier.reduce((t, [, y]) => t + y, 0) / (premier.length || 1);
      const ici = entites
        .map((e) => ({ e, rs: anneaux(e.geometry) }))
        .filter(({ rs }) => rs.some((r) => r.some(([x, y]) => dedans(x, y, commune) && auBord(x, y, commune) > MARGE)) || (dedans(cx, cy, rs) && auBord(cx, cy, rs) > MARGE));
      if (!ici.length) {
        etat.textContent =
          'Aucun zonage publié au Géoportail de l’urbanisme pour cette commune : soit elle relève du règlement national d’urbanisme, soit son document n’y a pas été versé.';
        return;
      }
      bouton.hidden = true;
      const classe = (p: Proprietes) => {
        const t = (p[champ] ?? '').toUpperCase();
        return (table[t] ?? (t.startsWith('AU') ? PLU.AU : null))?.[0] ?? 'autre';
      };
      const presentes = new Set<string>();
      for (const { e, rs } of ici) {
        const c = classe(e.properties);
        presentes.add(c);
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', rs.map(ecran).join(''));
        p.setAttribute('class', `zp-${c}`);
        p.setAttribute('fill-rule', 'evenodd');
        const t = document.createElementNS(NS, 'title');
        t.textContent = [e.properties.libelle, e.properties.libelong].filter(Boolean).join(' — ');
        p.append(t);
        groupe.append(p);
      }
      svg.classList.add('zp-chargee');

      // La légende : les types présents, dans l'ordre U, AU, A, N.
      const legende = el('ul', 'zp-legende');
      for (const c of ORDRE.filter((x) => presentes.has(x))) {
        const li = el('li');
        const cle = el('i', `zp-cle zp-cle-${c}`);
        cle.setAttribute('aria-hidden', 'true');
        li.append(cle, Object.values(table).find(([x]) => x === c)?.[1] ?? 'Autre zone');
        legende.append(li);
      }

      // La liste : une ligne par libellé, avec la page du règlement quand le document la donne.
      const parLibelle = new Map<string, { p: Proprietes; c: string; n: number }>();
      for (const { e } of ici) {
        const cle = `${e.properties.partition}|${e.properties.libelle}`;
        const x = parLibelle.get(cle) ?? parLibelle.set(cle, { p: e.properties, c: classe(e.properties), n: 0 }).get(cle)!;
        x.n++;
      }
      const lignes = [...parLibelle.values()].sort((a, b) => ORDRE.indexOf(a.c) - ORDRE.indexOf(b.c) || (a.p.libelle ?? '').localeCompare(b.p.libelle ?? '', 'fr', { numeric: true }));
      const ul = el('ul', 'zp-zones-liste');
      for (const { p, c } of lignes) {
        const li = el('li');
        const cle = el('i', `zp-cle zp-cle-${c}`);
        cle.setAttribute('aria-hidden', 'true');
        li.append(cle, el('strong', '', p.libelle ?? '?'));
        // Le libellé long, sans le libellé court qu'il répète souvent (« 1AU : Zone… ») ; à défaut, le type.
        const long = (p.libelong ?? '').replace(/\s+/g, ' ').trim().replace(new RegExp(`^${(p.libelle ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i'), '');
        const type = Object.values(table).find(([x]) => x === c)?.[1];
        if (long && long !== p.libelle) li.append(` — ${long}`);
        else if (type) li.append(` — ${type.charAt(0).toLowerCase()}${type.slice(1)}`);
        const fichier = p.nomfic ? `${ANNEXES}/${p.partition}/${p.gpu_doc_id}/${p.nomfic}` : /^https?:\/\//.test(p.urlfic ?? '') ? p.urlfic! : null;
        if (fichier) {
          const a = el('a', '', /#page=(\d+)/.test(fichier) ? `règlement, p. ${/#page=(\d+)/.exec(fichier)![1]}` : 'règlement');
          a.href = fichier;
          a.target = '_blank';
          a.rel = 'noopener';
          li.append(' (', a, ')');
        }
        ul.append(li);
      }
      const docs = [...new Set(ici.map(({ e }) => e.properties.idurba).filter(Boolean))];
      const date = docs.length === 1 ? dateDe(docs[0]) : null;
      etat.textContent =
        `${lignes.length} zone${lignes.length > 1 ? 's' : ''} du document publié au Géoportail de l’urbanisme${date ? `, version du ${date}` : ''}, lu${lignes.length > 1 ? 'es' : 'e'} à l’instant sur la Géoplateforme de l’IGN. ` +
        'Une zone se lit avec son règlement : la carte ne dit pas ce qu’on peut construire sur une parcelle.';
      liste.append(legende, ul);
    });
  }
}
