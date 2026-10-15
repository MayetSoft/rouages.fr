/**
 * La carte des résultats du requêteur : chaque commune est un point, posé à
 * son centre (`proximite/centres.json`, en millièmes de degré, dans l'ordre de
 * l'index), et celles qui répondent aux critères sont en couleur. Sans
 * département choisi, la carte montre la France métropolitaine ; l'outre-mer
 * se voit en choisissant son département. Le tableau en dessous reste la vue
 * complète et accessible : la carte n'en est que la forme.
 */
import type { CommuneBreve } from './recherche-commune.ts';

type Centres = { c: (number | null)[] };
let centres: Promise<Centres> | null = null;
const chargerCentres = () =>
  (centres ??= fetch('/territoires/proximite/centres.json').then((r) => {
    if (!r.ok) throw new Error(`centres.json : ${r.status}`);
    return r.json() as Promise<Centres>;
  }));

const LARGEUR = 640;

/** La figure : un canevas, une bulle au survol, une légende d'une ligne. */
export async function carteDesResultats(communes: CommuneBreve[], rangs: number[], dep: string): Promise<HTMLElement | null> {
  let c: (number | null)[];
  try {
    c = (await chargerCentres()).c;
  } catch {
    return null;
  }
  // Les communes à montrer : le département choisi, ou la métropole.
  const montrees: number[] = [];
  communes.forEach((x, r) => {
    if (c[2 * r] === null || c[2 * r] === undefined) return;
    if (dep ? x.dep === dep : !x.dep.startsWith('97')) montrees.push(r);
  });
  if (!montrees.length) return null;
  const ys = montrees.map((r) => c[2 * r + 1]!);
  const xs = montrees.map((r) => c[2 * r]!);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.cos((((y0 + y1) / 2 / 1000) * Math.PI) / 180);
  const marge = 8;
  const echelle = (LARGEUR - 2 * marge) / Math.max(1, (x1 - x0) * k);
  const hauteur = Math.min(LARGEUR, Math.round((y1 - y0) * echelle + 2 * marge));
  const s = Math.min(echelle, (hauteur - 2 * marge) / Math.max(1, y1 - y0));
  const largeur = Math.round((x1 - x0) * k * s + 2 * marge);
  const pos = (r: number): [number, number] => [marge + (c[2 * r]! - x0) * k * s, marge + (y1 - c[2 * r + 1]!) * s];

  const figure = document.createElement('figure');
  figure.className = 'rq-carte';
  const toile = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  toile.width = largeur * dpr;
  toile.height = hauteur * dpr;
  toile.style.aspectRatio = `${largeur} / ${hauteur}`;
  const resultats = new Set(rangs);
  toile.setAttribute('role', 'img');
  toile.setAttribute(
    'aria-label',
    `Carte ${dep ? 'du département' : 'de la France métropolitaine'} : ${rangs.filter((r) => montrees.includes(r)).length.toLocaleString('fr-FR')} communes en couleur sur ${montrees.length.toLocaleString('fr-FR')}. La liste complète suit, sous forme de tableau.`,
  );
  const ctx = toile.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  const style = getComputedStyle(document.documentElement);
  const couleur = (nom: string, defaut: string) => style.getPropertyValue(nom).trim() || defaut;
  const fond = couleur('--fond', '#fbfaf8');
  const repere = couleur('--carte-resultat', '#0a8aa3');
  // Le contexte en encre douce, très transparente : visible, mais en retrait derrière les résultats.
  const contexte = couleur('--encre-douce', '#5f5c55');
  // Plus le cadre est petit, plus les points sont gros : un département a quelques centaines de communes.
  const petit = montrees.length < 2000;
  const rContexte = petit ? 2 : 0.9;
  const rResultat = petit ? 4.5 : 2.2;
  ctx.fillStyle = contexte;
  ctx.globalAlpha = 0.35;
  for (const r of montrees) {
    if (resultats.has(r)) continue;
    const [x, y] = pos(r);
    ctx.beginPath();
    ctx.arc(x, y, rContexte, 0, 2 * Math.PI);
    ctx.fill();
  }
  // Les résultats par-dessus, cerclés de la couleur du fond pour rester distincts quand ils se touchent.
  const dessines = montrees.filter((r) => resultats.has(r));
  ctx.globalAlpha = 1;
  ctx.fillStyle = repere;
  ctx.strokeStyle = fond;
  ctx.lineWidth = petit ? 1.5 : 0.8;
  for (const r of dessines) {
    const [x, y] = pos(r);
    ctx.beginPath();
    ctx.arc(x, y, rResultat, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // Au survol, la commune en couleur la plus proche ; un clic ouvre sa page.
  const bulle = document.createElement('div');
  bulle.className = 'rq-bulle';
  bulle.hidden = true;
  const proche = (ev: MouseEvent) => {
    const b = toile.getBoundingClientRect();
    const mx = ((ev.clientX - b.left) / b.width) * largeur;
    const my = ((ev.clientY - b.top) / b.height) * hauteur;
    let meilleur = -1;
    let d2 = (petit ? 14 : 9) ** 2;
    for (const r of dessines) {
      const [x, y] = pos(r);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < d2) {
        d2 = d;
        meilleur = r;
      }
    }
    return { r: meilleur, b };
  };
  toile.addEventListener('mousemove', (ev) => {
    const { r, b } = proche(ev);
    toile.style.cursor = r >= 0 ? 'pointer' : 'default';
    if (r < 0) {
      bulle.hidden = true;
      return;
    }
    const x = communes[r];
    bulle.textContent = `${x.nom} (${x.depNom}) · ${x.population.toLocaleString('fr-FR')} hab.`;
    const [px, py] = pos(r);
    bulle.style.left = `${(px / largeur) * b.width}px`;
    bulle.style.top = `${(py / hauteur) * b.height}px`;
    bulle.hidden = false;
  });
  toile.addEventListener('mouseleave', () => (bulle.hidden = true));
  toile.addEventListener('click', (ev) => {
    const { r } = proche(ev);
    if (r >= 0) location.href = `/commune/${communes[r].code}`;
  });

  const cadre = document.createElement('div');
  cadre.className = 'rq-carte-cadre';
  cadre.append(toile, bulle);
  const legende = document.createElement('figcaption');
  legende.className = 'rq-carte-legende';
  const cle = document.createElement('i');
  cle.className = 'rq-carte-cle';
  cle.setAttribute('aria-hidden', 'true');
  const horsCadre = rangs.length - dessines.length;
  legende.append(
    cle,
    `${dessines.length.toLocaleString('fr-FR')} commune${dessines.length > 1 ? 's' : ''} en couleur, chacune au centre de son territoire` +
      (horsCadre > 0 ? ` ; ${horsCadre.toLocaleString('fr-FR')} en outre-mer, à voir en choisissant leur département` : '') +
      '. Survolez un point pour son nom, cliquez pour sa page.',
  );
  figure.append(cadre, legende);
  return figure;
}
