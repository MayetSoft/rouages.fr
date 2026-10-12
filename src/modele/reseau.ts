/**
 * Le graphe, mis en forme pour être affiché.
 *
 * Deux lectures d'un même réseau :
 *
 * — la **carte d'ensemble** ne montre que les acteurs, rangés en colonnes par
 *   échelon, reliés par l'argent et par les compétences qu'ils se partagent.
 *   Les compétences y sont agrégées en une arête par paire d'acteurs : sans
 *   cette agrégation, cinquante nœuds et deux cents arêtes ne montrent rien.
 *
 * — le **focus** ouvre un acteur et déplie ce que la carte avait replié : ses
 *   compétences, ses partenaires, les processus où il intervient.
 *
 * Les positions de la carte sont calculées ici, au build : le même graphe donne
 * toujours la même image, ce qui permet de la citer et de la comparer.
 */
import { LIBELLE_ECHELON, LIBELLE_POUVOIR, ECHELONS, POUVOIRS, type Echelon, type Pouvoir, type Sigle } from './schemas.ts';
import { chargerGraphe, type Graphe } from './graphe.ts';
import { largeurPastille } from '../vues/formes.ts';

export type TypeNoeud = 'acteur' | 'competence' | 'processus' | 'document';

export interface Lien {
  type: string;
  titre: string;
  url: string;
}

export interface Noeud {
  id: string;
  type: TypeNoeud;
  nom: string;
  /** Étiquette portée sur les schémas ; à défaut, le nom complet. */
  court: string;
  resume: string;
  echelon: Echelon;
  confiance: string;
  liens: Lien[];
  /** Nombre de relations : donne sa taille au nœud sur la carte. */
  degre: number;
  /** Codes BANATIC, quand la compétence se résout commune par commune. */
  banatic?: string[];
  /** L'entité dont l'acteur est un organe ou un service (acteurs uniquement). */
  releveDe?: string;
  /** Sa première branche du pouvoir, qui le range dans la boîte de l'État. */
  pouvoir?: Pouvoir;
  /** Position sur la carte d'ensemble (acteurs uniquement). */
  x?: number;
  y?: number;
}

/**
 * Une boîte de la carte d'ensemble. `entite` : une collectivité et ses organes,
 * l'en-tête étant le nœud de l'entité elle-même ; `local` : les organes d'une
 * entité d'une autre colonne qui agissent dans celle-ci (« L'État en région »),
 * en pointillés ; `branche` : une branche du pouvoir, dans la boîte de l'État.
 */
export interface BoiteCarte {
  style: 'entite' | 'local' | 'branche';
  x: number;
  y: number;
  l: number;
  h: number;
  /** L'intitulé écrit dans la boîte, quand l'en-tête n'est pas un nœud. */
  libelle?: string;
  /** Le nœud qui sert d'en-tête, pour une boîte `entite`. */
  entete?: string;
}

export type TypeArete =
  | 'detient'
  | 'partage'
  | 'flux'
  | 'intervient'
  | 'peut-agir'
  | 'produit'
  | 'exerce';

export interface Arete {
  de: string;
  vers: string;
  type: TypeArete;
  label?: string;
  /** Nombre de relations agrégées, pour l'épaisseur du trait. */
  poids: number;
  nature?: string;
}

export interface Reseau {
  noeuds: Noeud[];
  aretes: Arete[];
  /** Le glossaire voyage avec le réseau : le panneau en a besoin côté client. */
  sigles: Sigle[];
  /** Arêtes acteur↔acteur de la carte d'ensemble, déjà agrégées. */
  carte: {
    aretes: Arete[];
    largeur: number;
    hauteur: number;
    /** Étendue verticale réellement occupée par des nœuds. */
    hautNoeuds: number;
    basNoeuds: number;
    colonnes: { echelon: Echelon; libelle: string; x: number; largeur: number; haut: number; bas: number }[];
    /** Les boîtes : chaque entité contient ses organes. */
    boites: BoiteCarte[];
  };
}

export const LIBELLE_ARETE: Record<TypeArete, string> = {
  detient: 'détient',
  partage: 'partage avec',
  flux: 'verse à',
  intervient: 'intervient dans',
  'peut-agir': 'peut agir sur',
  produit: 'produit',
  exerce: 'met en œuvre',
};

const HAUTEUR_LIGNE = 92;
const MARGE_HAUT = 54;
/** Vide entre deux colonnes, une fois les pastilles dimensionnées. */
const ECART_COLONNES = 44;
/** Écart entre deux sous-piles d'un même échelon : plus serré qu'entre échelons. */
const ECART_PILES = 18;
/**
 * Au-delà, une colonne devient une bande verticale interminable : l'échelon
 * « État » compte à lui seul plus d'entités que tous les échelons locaux
 * réunis, et une pile de vingt-quatre pastilles face à des piles de huit rend
 * la carte entière illisible. L'échelon se replie alors sur plusieurs piles.
 */
const PILE_MAX = 12;
/** Dans une boîte, une pile plus courte : une branche de l'État se plie en deux plutôt que de descendre. */
const PILE_BOITE = 8;
/** Au-delà, les piles d'une boîte passent à la ligne. */
const PILES_PAR_LIGNE = 5;
/** Marge intérieure d'une boîte, et place de son intitulé. */
const MARGE_BOITE = 14;
const HAUTEUR_INTITULE = 34;
/** Vide entre deux boîtes d'une même colonne. */
const ECART_BOITES = 30;

/** « L'État en région », « L'État dans le département » : l'intitulé d'une boîte `local`. */
const ARTICLE_ENTITE: Record<string, string> = { etat: 'L’État', 'union-europeenne': 'L’Union européenne' };
const DANS_ECHELON: Record<Echelon, string> = {
  union_europeenne: 'dans l’Union',
  etat: 'au niveau national',
  region: 'en région',
  departement: 'dans le département',
  epci: 'dans l’intercommunalité',
  commune: 'dans la commune',
  prive: 'chez les acteurs privés',
  citoyen: 'auprès de vous',
};

let cache: Reseau | undefined;

export function construireReseau(g: Graphe = chargerGraphe()): Reseau {
  if (cache) return cache;

  const liensDe = (ids: string[]): Lien[] =>
    ids
      .map((id) => g.sources.get(id))
      .filter(Boolean)
      .map((s) => ({ type: s!.type, titre: s!.titre, url: s!.url }));

  const noeuds = new Map<string, Noeud>();
  const ajouter = (n: Omit<Noeud, 'degre'>) => noeuds.set(n.id, { ...n, degre: 0 });

  for (const a of g.acteurs.values()) {
    ajouter({
      id: a.id,
      type: 'acteur',
      nom: a.nom,
      court: a.nom_court ?? a.nom,
      resume: a.resume,
      echelon: a.echelon,
      confiance: a.confiance,
      liens: liensDe(a.liens),
      ...(a.releve_de ? { releveDe: a.releve_de } : {}),
      ...(a.pouvoirs ? { pouvoir: a.pouvoirs[0] } : {}),
    });
  }
  for (const c of g.competences.values()) {
    ajouter({
      id: c.id,
      type: 'competence',
      nom: c.nom,
      court: c.nom_court ?? c.nom,
      resume: c.resume,
      echelon: g.acteurs.get(c.acteur)?.echelon ?? 'etat',
      confiance: c.confiance,
      liens: liensDe(c.liens),
      ...(c.banatic.length > 0 ? { banatic: c.banatic } : {}),
    });
  }
  for (const p of g.processus.values()) {
    ajouter({
      id: p.id,
      type: 'processus',
      nom: p.nom,
      court: p.nom,
      resume: p.resume,
      echelon: g.acteurs.get(p.decideur)?.echelon ?? 'commune',
      confiance: p.confiance,
      liens: liensDe(p.liens),
    });
  }
  for (const d of g.documents.values()) {
    ajouter({
      id: d.id,
      type: 'document',
      nom: d.nom,
      court: d.nom,
      resume: d.resume ?? '',
      echelon: 'commune',
      confiance: 'etabli',
      liens: liensDe(d.liens),
    });
  }

  const aretes: Arete[] = [];
  const relier = (de: string, vers: string, type: TypeArete, label?: string, nature?: string) => {
    if (!noeuds.has(de) || !noeuds.has(vers) || de === vers) return;
    aretes.push({ de, vers, type, label, poids: 1, nature });
  };

  for (const c of g.competences.values()) {
    relier(c.acteur, c.id, 'detient');
    for (const a of c.partagee_avec) relier(a, c.id, 'partage');
  }
  for (const f of g.flux.values()) {
    for (const v of f.vers) relier(f.de, v, 'flux', f.nom ?? f.resume, f.nature);
  }
  for (const p of g.processus.values()) {
    for (const c of p.competences) relier(p.id, c, 'exerce');
    for (const a of new Set(p.etapes.map((e) => e.acteur))) relier(a, p.id, 'intervient');
    for (const d of new Set(p.etapes.flatMap((e) => e.produit))) relier(p.id, d, 'produit');
    for (const l of p.leviers) relier(l.acteur, p.id, 'peut-agir', l.quand);
  }

  for (const a of aretes) {
    noeuds.get(a.de)!.degre++;
    noeuds.get(a.vers)!.degre++;
  }

  const carte = disposerCarte(noeuds, aretes);
  cache = { noeuds: [...noeuds.values()], aretes, sigles: [...g.sigles.values()], carte };
  return cache;
}

/**
 * Carte d'ensemble : une colonne par échelon, et dans chaque colonne des
 * boîtes. Une entité — la commune, la région, l'État, l'Union — est la boîte
 * qui contient ses organes, et son nœud en est l'en-tête : elle n'est plus
 * dessinée à côté de ses propres parties. L'État se subdivise par branche du
 * pouvoir ; ses services qui agissent dans une autre colonne y forment une
 * boîte en pointillés (« L'État en région »). Les acteurs qui ne relèvent de
 * personne viennent en dessous, sans boîte. Les compétences sont repliées en
 * une seule arête par paire d'acteurs.
 */
function disposerCarte(noeuds: Map<string, Noeud>, aretes: Arete[]): Reseau['carte'] {
  const acteurs = [...noeuds.values()].filter((n) => n.type === 'acteur');
  const presents = ECHELONS.filter((e) => acteurs.some((a) => a.echelon === e));
  const parents = new Set(acteurs.map((a) => a.releveDe).filter((p): p is string => !!p));
  const trier = (l: Noeud[]) => l.sort((a, b) => b.degre - a.degre || a.nom.localeCompare(b.nom, 'fr'));

  type Sous = { libelle?: string; membres: Noeud[] };
  type Bloc = { style: 'entite' | 'local' | 'libre'; entete?: Noeud; libelle?: string; sous: Sous[] };

  const contenus = presents.map((echelon) => {
    const dans = acteurs.filter((a) => a.echelon === echelon);
    const blocs: Bloc[] = [];
    for (const e of trier(dans.filter((a) => parents.has(a.id)))) {
      const membres = trier(dans.filter((a) => a.releveDe === e.id));
      const sous: Sous[] =
        e.id === 'etat'
          ? POUVOIRS.map((p) => ({ libelle: LIBELLE_POUVOIR[p], membres: membres.filter((m) => (m.pouvoir ?? 'executif') === p) })).filter((x) => x.membres.length)
          : [{ membres }];
      blocs.push({ style: 'entite', entete: e, sous });
    }
    const ailleurs = [...new Set(dans.map((a) => a.releveDe).filter((p): p is string => !!p && noeuds.get(p)?.echelon !== echelon))];
    for (const p of ailleurs) {
      blocs.push({
        style: 'local',
        libelle: `${ARTICLE_ENTITE[p] ?? noeuds.get(p)!.court} ${DANS_ECHELON[echelon]}`,
        sous: [{ membres: trier(dans.filter((a) => a.releveDe === p)) }],
      });
    }
    const libres = trier(dans.filter((a) => !a.releveDe && !parents.has(a.id)));
    if (libres.length) blocs.push({ style: 'libre', sous: [{ membres: libres }] });
    // Chaque colonne prend la largeur de son plus long libellé : sinon les
    // pastilles se chevauchent dès qu'un acteur porte un nom un peu long.
    const largeurPile = Math.max(104, ...dans.map((a) => largeurPastille(a.court)));
    return { echelon, blocs, largeurPile };
  });

  // Première passe : la géométrie de chaque bloc, relative à son coin haut gauche.
  type Place = { noeud: Noeud; x: number; y: number; bloc: number };
  type Cadre = { style: BoiteCarte['style']; x: number; y: number; l: number; h: number; libelle?: string; entete?: string; bloc: number };
  const colonnesCalc = contenus.map((c) => {
    const pile = c.largeurPile;
    // Une colonne sans boîte garde l'ancienne règle : une pile tant qu'elle tient.
    const maxPile = c.blocs.every((b) => b.style === 'libre') ? PILE_MAX : PILE_BOITE;
    const places: Place[] = [];
    const cadres: Cadre[] = [];
    let y = 0;
    let largeur = 0;
    const largeursBlocs: number[] = [];
    c.blocs.forEach((b, nb) => {
      const encadre = b.style !== 'libre';
      const marge = encadre ? MARGE_BOITE : 0;
      const yBloc = y;
      y += marge;
      if (b.entete) {
        places.push({ noeud: b.entete, x: 0, y: y + 17, bloc: nb });
        y += HAUTEUR_LIGNE * 0.62;
      } else if (b.libelle) {
        y += HAUTEUR_INTITULE;
      }
      // Les piles de chaque sous-groupe, puis les piles rangées en lignes.
      const piles: { sous: number; membres: Noeud[] }[] = [];
      b.sous.forEach((s, k) => {
        const n = Math.max(1, Math.ceil(s.membres.length / maxPile));
        const par = Math.ceil(s.membres.length / n);
        for (let p = 0; p < n; p++) piles.push({ sous: k, membres: s.membres.slice(p * par, (p + 1) * par) });
      });
      const avecBranches = b.sous.some((s) => s.libelle);
      let largeurBloc = 0;
      for (let debut = 0; debut < piles.length; debut += PILES_PAR_LIGNE) {
        const ligne = piles.slice(debut, debut + PILES_PAR_LIGNE);
        const haut = y + (avecBranches ? HAUTEUR_INTITULE : 0);
        const rangs = Math.max(...ligne.map((p) => p.membres.length));
        ligne.forEach((p, k) => {
          const x = marge + k * (pile + ECART_PILES) + pile / 2;
          p.membres.forEach((m, r) => places.push({ noeud: m, x, y: haut + 17 + r * HAUTEUR_LIGNE * 0.78, bloc: nb }));
        });
        // Le cadre de chaque branche : ses piles contiguës de la ligne.
        if (avecBranches) {
          for (const k of new Set(ligne.map((p) => p.sous))) {
            const idx = ligne.map((p, n) => (p.sous === k ? n : -1)).filter((n) => n >= 0);
            const n0 = idx[0];
            const n1 = idx[idx.length - 1];
            const lignes = Math.max(...idx.map((n) => ligne[n].membres.length));
            cadres.push({
              style: 'branche',
              x: marge + n0 * (pile + ECART_PILES) - 6,
              y: y,
              l: (n1 - n0 + 1) * pile + (n1 - n0) * ECART_PILES + 12,
              h: HAUTEUR_INTITULE + (lignes - 1) * HAUTEUR_LIGNE * 0.78 + 40,
              libelle: b.sous[k].libelle,
              bloc: nb,
            });
          }
        }
        largeurBloc = Math.max(largeurBloc, ligne.length * pile + (ligne.length - 1) * ECART_PILES);
        y = haut + (rangs - 1) * HAUTEUR_LIGNE * 0.78 + 34 + (avecBranches ? 18 : 6);
      }
      largeurBloc += 2 * marge;
      if (b.entete) places.find((p) => p.noeud === b.entete)!.x = largeurBloc / 2;
      y += marge;
      if (encadre) cadres.push({ style: b.style as 'entite' | 'local', x: 0, y: yBloc, l: largeurBloc, h: y - yBloc, libelle: b.libelle, entete: b.entete?.id, bloc: nb });
      largeursBlocs.push(largeurBloc);
      largeur = Math.max(largeur, largeurBloc);
      y += ECART_BOITES;
    });
    // Les blocs plus étroits que la colonne sont centrés dedans.
    return { echelon: c.echelon, places, cadres, largeur, largeursBlocs, hauteur: y - ECART_BOITES };
  });

  // Seconde passe : les colonnes côte à côte, centrées verticalement.
  const hauteurMax = Math.max(...colonnesCalc.map((c) => c.hauteur));
  let curseur = ECART_COLONNES;
  let hautNoeuds = Infinity;
  let basNoeuds = 0;
  const boites: BoiteCarte[] = [];
  const colonnes = colonnesCalc.map((c) => {
    const gauche = curseur;
    const x = Math.round(gauche + c.largeur / 2);
    curseur += c.largeur + ECART_COLONNES;
    const dy = MARGE_HAUT + (hauteurMax - c.hauteur) / 2;
    // Chaque bloc est centré dans la colonne.
    const decalage = (bloc: number) => (c.largeur - c.largeursBlocs[bloc]) / 2;
    for (const p of c.places) {
      p.noeud.x = Math.round(gauche + decalage(p.bloc) + p.x);
      p.noeud.y = Math.round(dy + p.y);
      hautNoeuds = Math.min(hautNoeuds, p.noeud.y);
      basNoeuds = Math.max(basNoeuds, p.noeud.y);
    }
    for (const k of c.cadres) {
      const { bloc, ...cadre } = k;
      const d = decalage(bloc);
      boites.push({ ...cadre, x: Math.round(gauche + d + k.x), y: Math.round(dy + k.y), l: Math.round(k.l), h: Math.round(k.h) });
      hautNoeuds = Math.min(hautNoeuds, dy + k.y + 17);
      basNoeuds = Math.max(basNoeuds, dy + k.y + k.h - 17);
    }
    return {
      echelon: c.echelon,
      libelle: LIBELLE_ECHELON[c.echelon],
      x,
      largeur: Math.round(c.largeur),
      haut: Math.round(dy),
      bas: Math.round(dy + c.hauteur),
    };
  });
  // Les boîtes d'entité d'abord, les branches par-dessus.
  boites.sort((a, b) => (a.style === 'branche' ? 1 : 0) - (b.style === 'branche' ? 1 : 0));

  const LARGEUR_CARTE = Math.round(curseur);
  const hauteur = MARGE_HAUT + hauteurMax;

  // Deux acteurs sont reliés sur la carte s'ils partagent une compétence, ou si
  // l'un verse quelque chose à l'autre. Le poids est le nombre de raisons.
  const paires = new Map<string, Arete>();
  const cumuler = (de: string, vers: string, type: TypeArete, nature?: string) => {
    const cle = `${type}:${[de, vers].sort().join('|')}`;
    const existante = paires.get(cle);
    if (existante) existante.poids++;
    else paires.set(cle, { de, vers, type, poids: 1, nature });
  };

  const detenteur = new Map<string, string>();
  for (const a of aretes) if (a.type === 'detient') detenteur.set(a.vers, a.de);
  for (const a of aretes) {
    if (a.type === 'partage') {
      const proprietaire = detenteur.get(a.vers);
      if (proprietaire) cumuler(proprietaire, a.de, 'partage');
    } else if (a.type === 'flux') {
      cumuler(a.de, a.vers, 'flux', a.nature);
    }
  }

  return {
    aretes: [...paires.values()],
    largeur: LARGEUR_CARTE,
    hauteur: hauteur + 34,
    hautNoeuds: hautNoeuds - 30,
    basNoeuds: basNoeuds + 30,
    colonnes,
    boites,
  };
}

/** Les relations d'un nœud, groupées par type — sert au focus et aux pages. */
export function voisinage(reseau: Reseau, id: string) {
  const sortantes = reseau.aretes.filter((a) => a.de === id);
  const entrantes = reseau.aretes.filter((a) => a.vers === id);
  return { sortantes, entrantes };
}
