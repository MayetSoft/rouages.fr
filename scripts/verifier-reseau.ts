/**
 * Ce que le réseau vaut comme réseau, et non comme contenu.
 *
 * La feuille de route fixait la fin de la phase 2 en une phrase : « un visiteur
 * peut partir de n'importe quel nœud et atteindre n'importe quel autre en trois
 * clics, sans passer par une impasse ». C'était de la prose — elle ne pouvait
 * ni passer ni échouer, et n'avait jamais été mesurée. Elle l'est ici.
 *
 * Les deux moitiés du critère n'ont pas le même statut, et c'est le principal
 * enseignement de la première mesure :
 *
 *   — **« sans impasse » est un invariant**. Un nœud qu'aucune arête ne touche
 *     est une page morte sur un site qui *est* un réseau, et le graphe doit
 *     rester d'un seul tenant. Toute régression est un échec ;
 *   — **« trois clics » est une mesure, pas une contrainte**. À 196 nœuds,
 *     l'exiger de toutes les paires reviendrait à demander un graphe presque
 *     complet. Elle a d'abord été tenue comme un cliquet — un plancher qu'on
 *     refusait de redescendre —, et le cliquet poussait à relier des nœuds
 *     pour le chiffre. Décision du 13 octobre 2026 : **un lien existe parce
 *     qu'une source le dit, jamais pour une mesure**. Le diamètre et la part
 *     à trois clics sont affichés, et signalés quand ils passent les repères,
 *     sans faire échouer le build ; une baisse dit qu'un ajout est en marge
 *     du réseau, ce qui peut être vrai.
 *
 * Le degré des documents est compté à part, faute de quoi le tableau ne dirait
 * rien : un document n'est relié qu'au processus qui le produit
 * (`src/modele/reseau.ts`), donc il est de degré 1 par construction et non par
 * négligence.
 */
import { DEMARCHES_DES_BLOCS } from '../src/modele/demarches-des-blocs.ts';
import { chargerGraphe } from '../src/modele/graphe.ts';
import { construireReseau, type Reseau } from '../src/modele/reseau.ts';

const ROUGE = '\x1b[31m', VERT = '\x1b[32m', JAUNE = '\x1b[33m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

/**
 * Le repère, deux points sous une mesure passée — plus un plancher (voir en tête).
 *
 * Relevé à 62,0 % à la première mesure, à 64,5 % une fois l'échelon État
 * densifié, à 66,2 % avec les démarches du département et de la région, puis à
 * 67,0 % quand la PMI, le CAUE, le SDIS et l'ARS ont rejoint le réseau.
 * On le garde deux points en dessous : une fiche nouvelle déplace le chiffre de
 * quelques dixièmes sans rien dégrader, et un seuil collé à la valeur ferait
 * échouer le premier ajout venu.
 */
const PLANCHER_TROIS_CLICS = 65;

/**
 * Le diamètre du jour. Il était de 7, et la densification de l'État l'a fait
 * tomber à 6. Il peut baisser encore ; qu'il remonte demande une raison.
 */
const DIAMETRE_MAX = 6;

function attendre(quoi: string, ok: boolean, detail: string) {
  if (!ok) echecs++;
  console.log(`${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}${quoi}\n      ${GRIS}${detail}${RAZ}`);
}

/** Une mesure : affichée, signalée sous son repère, jamais bloquante. */
function mesurer(quoi: string, ok: boolean, detail: string) {
  console.log(`${ok ? VERT + '  ok  ' : JAUNE + 'repère'}${RAZ}${quoi}\n      ${GRIS}${detail}${RAZ}`);
}

/** Les arêtes sont orientées ; un visiteur, lui, clique dans les deux sens. */
function voisinages(r: Reseau): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of r.noeuds) adj.set(n.id, new Set());
  for (const a of r.aretes) {
    adj.get(a.de)?.add(a.vers);
    adj.get(a.vers)?.add(a.de);
  }
  return adj;
}

const reseau = construireReseau();
const adj = voisinages(reseau);
const ids = reseau.noeuds.map((n) => n.id);

let paires = 0;
let atteignables = 0;
let aTroisClics = 0;
let diametre = 0;
for (const depart of ids) {
  const distance = new Map<string, number>([[depart, 0]]);
  const file = [depart];
  for (let i = 0; i < file.length; i++) {
    const u = file[i]!;
    for (const v of adj.get(u)!) {
      if (distance.has(v)) continue;
      distance.set(v, distance.get(u)! + 1);
      file.push(v);
    }
  }
  for (const arrivee of ids) {
    if (arrivee === depart) continue;
    paires++;
    const d = distance.get(arrivee);
    if (d === undefined) continue;
    atteignables++;
    if (d <= 3) aTroisClics++;
    if (d > diametre) diametre = d;
  }
}

const part = (aTroisClics / paires) * 100;
const isoles = reseau.noeuds.filter((n) => n.degre === 0);

console.log(
  `${GRIS}${reseau.noeuds.length} nœuds, ${reseau.aretes.length} arêtes.${RAZ}\n`,
);

attendre(
  'aucun nœud isolé',
  isoles.length === 0,
  isoles.length === 0
    ? 'un nœud que rien ne relie est invisible depuis tout autre point du réseau'
    : `isolés : ${isoles.map((n) => n.id).join(', ')}`,
);

attendre(
  'le graphe est d’un seul tenant',
  atteignables === paires,
  `${atteignables.toLocaleString('fr-FR')} paires atteignables sur ${paires.toLocaleString('fr-FR')}` +
    ' — un îlot séparé serait un site dans le site',
);

mesurer(
  `diamètre ${diametre}`,
  diametre <= DIAMETRE_MAX,
  `le plus long des plus courts chemins ; au-delà de ${DIAMETRE_MAX}, deux nœuds du réseau` +
    ' n’appartiennent plus vraiment à la même carte',
);

mesurer(
  `${part.toFixed(1).replace('.', ',')} % des paires à trois clics ou moins`,
  part >= PLANCHER_TROIS_CLICS,
  `repère ${PLANCHER_TROIS_CLICS} % — le critère de la phase 2 ; une mesure, jamais une raison d'ajouter un lien`,
);

// Les démarches que la page de commune cite sous ses blocs : toutes doivent
// exister, même celles des blocs qu'un build partiel n'affiche pas.
{
  const processus = chargerGraphe().processus;
  const inconnues = Object.entries(DEMARCHES_DES_BLOCS).flatMap(([bloc, ids]) =>
    ids.filter((id) => !processus.has(id)).map((id) => `${bloc} → ${id}`),
  );
  attendre(
    'démarches citées par la page de commune',
    inconnues.length === 0,
    inconnues.length === 0 ? 'toutes existent dans le graphe' : `inconnues : ${inconnues.join(', ')}`,
  );
}

// Le tableau de ce qui est mince, documents mis à part.
const minces = reseau.noeuds
  .filter((n) => n.degre <= 2 && n.type !== 'document')
  .sort((a, b) => a.degre - b.degre || a.id.localeCompare(b.id, 'fr'));
const docs = reseau.noeuds.filter((n) => n.type === 'document');
const docsLies = docs.filter((n) => n.degre > 1).length;

console.log(
  `\n${GRIS}${minces.length} nœud(s) de degré 1 ou 2, documents exclus :${RAZ}\n` +
    minces.map((n) => `  ${JAUNE}${n.degre}${RAZ} ${n.type.padEnd(11)} ${n.id}`).join('\n') +
    `\n\n${GRIS}${docs.length} documents, dont ${docsLies} reliés à plus d’un nœud : un document` +
    ` n’est relié qu’au processus qui le produit.${RAZ}`,
);

console.log(
  echecs === 0
    ? `\n${VERT}Réseau conforme.${RAZ}`
    : `\n${ROUGE}${echecs} propriété(s) du réseau ne tiennent plus.${RAZ}`,
);
process.exit(echecs === 0 ? 0 : 1);
