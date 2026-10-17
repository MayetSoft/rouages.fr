/**
 * Quelle autorisation d'urbanisme demander pour des travaux courants — le
 * cadrage est celui de `docs/07-risques.md`, section 9 : un orienteur, pas un
 * simulateur qui conclut.
 *
 * Les règles sont celles que service-public.fr présente, fiche par fiche :
 * chacune est citée avec sa date de vérification et les articles du code de
 * l'urbanisme qu'elle donne. Rien d'autre n'y est écrit. Quand la personne ne
 * sait pas si son terrain est en zone urbaine d'un PLU, ou dans un secteur
 * protégé, on prend le cas le plus exigeant, et on le dit.
 *
 * Ce module ne fait que calculer ; la page (`/simulateurs/autorisation`) dit
 * ce qui peut changer la réponse et à qui la demander.
 */

/**
 * La page n'entre au menu et dans les moteurs qu'après relecture par un
 * praticien (`docs/07-risques.md`, section 9) : la décision revient au
 * mainteneur, qui passe ce drapeau à `true`.
 */
export const PUBLIE = false;

export type Regime = 'aucune' | 'DP' | 'PC';
export type Reponse3 = 'oui' | 'non' | 'nsp';

export interface Fiche {
  code: string;
  titre: string;
  /** La date de vérification affichée par service-public.fr, AAAA-MM-JJ, lue le 16 octobre 2026. */
  verifie: string;
  /** Les articles que la fiche cite comme textes de référence. */
  articles: string[];
}

export const FICHES: Record<string, Fiche> = {
  abri: {
    code: 'F662',
    titre: 'Quelle autorisation d’urbanisme déposer pour installer un abri de jardin ?',
    verifie: '2025-03-21',
    articles: ['R*421-1', 'R*421-2', 'R421-9', 'R421-11'],
  },
  extension: {
    code: 'F36777',
    titre: 'Quelle autorisation d’urbanisme déposer pour faire un agrandissement extérieur ou une surélévation ?',
    verifie: '2024-12-11',
    articles: ['R421-11', 'R*421-14', 'R*421-17'],
  },
  veranda: {
    code: 'F36768',
    titre: 'Quelle autorisation d’urbanisme déposer pour construire une véranda ?',
    verifie: '2025-04-11',
    articles: ['R111-22', 'R*420-1', 'R*421-1', 'R*421-2', 'R421-11', 'R*421-14', 'R*421-17'],
  },
  piscine: {
    code: 'F31404',
    titre: 'Installation ou construction d’une piscine privative',
    verifie: '2025-01-31',
    articles: ['R*421-1', 'R*421-2 à R*421-8-2', 'R421-9 à R*421-12'],
  },
  cloture: {
    code: 'F3131',
    titre: 'Quelles sont les règles pour construire ou installer une clôture ?',
    verifie: '2025-12-05',
    articles: ['R*421-2', 'R*421-12', 'code civil, articles 653 à 673'],
  },
  destination: {
    code: 'F35336',
    titre: 'Quelle autorisation déposer pour faire un changement de destination ou d’usage d’un bâtiment ?',
    verifie: '2026-04-24',
    articles: ['R151-27 à R151-29', 'R*421-14', 'R*421-17', 'L152-6-5'],
  },
};

export const urlFiche = (code: string) => `https://www.service-public.gouv.fr/particuliers/vosdroits/${code}`;

export type Travaux =
  | { type: 'abri'; surface: number; accole: boolean }
  | { type: 'extension' | 'veranda'; surface: number; totaleApres: number | null }
  | { type: 'piscine'; surface: number; couverture: 'aucune' | 'basse' | 'haute'; horsSolSaisonniere: boolean }
  | { type: 'cloture'; nature: 'mur' | 'autre' | 'vegetale'; hauteurDeuxMetresOuPlus: boolean; communeLesSoumet: Reponse3 }
  | { type: 'destination'; facadeOuStructure: boolean; memeDestination: boolean; surfaceLocal: number | null };

export interface Situation {
  zoneUrbainePlu: Reponse3;
  secteurProtege: Reponse3;
  /** Un particulier qui construit pour lui-même ; sinon (une société, une association), l'architecte est requis pour tout permis. */
  particulier: boolean;
}

/** La fiche de service-public.fr sur le recours à l'architecte (F20568), vérifiée le 7 septembre 2026. */
export const FICHE_ARCHITECTE: Fiche = {
  code: 'F20568',
  titre: 'Dans quel cas doit-on faire appel à un architecte ?',
  verifie: '2026-09-07',
  articles: ['R431-2'],
};

export interface Orientation {
  regime: Regime;
  architecte: boolean;
  /** Pourquoi, en une ou deux phrases, d'après la fiche. */
  raisons: string[];
  /** Ce qu'on a supposé faute de réponse. */
  hypotheses: string[];
  fiche: Fiche;
}

const m2 = (v: number) => `${v.toLocaleString('fr-FR')} m²`;

export function orienter(t: Travaux, s: Situation): Orientation {
  const hypotheses: string[] = [];
  // Sans réponse, le cas le plus exigeant : hors zone urbaine, en secteur protégé.
  const zoneU = s.zoneUrbainePlu === 'oui';
  const protege = s.secteurProtege !== 'non';
  if (s.zoneUrbainePlu === 'nsp' && (t.type === 'extension' || t.type === 'veranda'))
    hypotheses.push('Faute de savoir si le terrain est en zone urbaine d’un PLU, on a pris le seuil hors zone urbaine (20 m² au lieu de 40 m²).');
  if (s.secteurProtege === 'nsp') hypotheses.push('Faute de savoir si le terrain est dans un secteur protégé, on l’a supposé : c’est le cas le plus exigeant.');
  const fini = (regime: Regime, raisons: string[], architecte = false): Orientation => {
    // Une personne morale recourt à l'architecte pour tout permis de construire.
    if (regime === 'PC' && !s.particulier && !architecte) {
      raisons.push('Pour un permis demandé par une personne morale — une société, une association —, le recours à un architecte est obligatoire.');
      architecte = true;
    }
    return { regime, architecte, raisons, hypotheses, fiche: FICHES[t.type] };
  };

  switch (t.type) {
    case 'abri': {
      if (t.accole) {
        // Accolé, le PLU peut le traiter en construction nouvelle (20 m²) ou en extension (40 m² en zone urbaine) : on prend la première, plus exigeante.
        hypotheses.push('Un abri accolé au bâtiment peut être traité par le PLU comme une extension — jusqu’à 40 m² en déclaration préalable en zone urbaine — ou comme une construction nouvelle ; on a pris la règle de la construction nouvelle, plus exigeante.');
        return t.surface <= 20
          ? fini('DP', ['Un abri accolé modifie l’aspect extérieur du bâtiment : jusqu’à 20 m², il est soumis à déclaration préalable.'])
          : fini('PC', ['Au-delà de 20 m², un abri accolé est soumis à permis de construire.']);
      }
      if (protege)
        return t.surface <= 20
          ? fini('DP', [`En secteur protégé, un abri de jardin jusqu’à 20 m² est soumis à déclaration préalable.`])
          : fini('PC', [`Au-delà de 20 m², un abri de jardin est soumis à permis de construire.`]);
      if (t.surface <= 5) return fini('aucune', [`Un abri de jardin indépendant de 5 m² ou moins est dispensé de formalité.`]);
      if (t.surface <= 20) return fini('DP', [`Un abri de jardin de plus de 5 m² et jusqu’à 20 m² est soumis à déclaration préalable.`]);
      return fini('PC', [`Au-delà de 20 m², un abri de jardin est soumis à permis de construire.`]);
    }
    case 'extension':
    case 'veranda':
      return orienterExtension(t, zoneU, protege, fini);
    case 'piscine': {
      if (t.horsSolSaisonniere) return fini('aucune', ['Une piscine hors sol installée trois mois par an au plus (quinze jours en secteur protégé) ne demande pas d’autorisation.']);
      if (t.surface <= 10)
        return protege
          ? fini('DP', ['En secteur protégé, une piscine de 10 m² ou moins est soumise à déclaration préalable.'])
          : fini('aucune', ['Une piscine dont le bassin fait 10 m² ou moins ne demande pas d’autorisation.']);
      if (t.surface <= 100)
        return t.couverture === 'haute'
          ? fini('PC', ['Un bassin de plus de 10 m² avec une couverture de plus de 1,80 m de haut est soumis à permis de construire.'])
          : fini('DP', ['Un bassin de plus de 10 m² et jusqu’à 100 m², sans couverture ou avec une couverture de 1,80 m au plus, est soumis à déclaration préalable.']);
      return fini('PC', ['Un bassin de plus de 100 m² est soumis à permis de construire.']);
    }
    case 'cloture': {
      if (t.nature === 'vegetale')
        return fini('aucune', ['Une haie ne relève pas d’une autorisation d’urbanisme ; elle obéit aux règles de distance et de hauteur du code civil.']);
      const raisons: string[] = [];
      if (protege) raisons.push('En secteur protégé, une clôture ou un mur de clôture est soumis à déclaration préalable.');
      if (t.communeLesSoumet === 'oui') raisons.push('La commune soumet les clôtures à déclaration : une déclaration préalable est nécessaire.');
      if (t.communeLesSoumet === 'nsp') {
        hypotheses.push('Faute de savoir si la commune soumet les clôtures à déclaration, on l’a supposé.');
        raisons.push('Si la commune soumet les clôtures à déclaration — beaucoup le font —, une déclaration préalable est nécessaire.');
      }
      if (t.nature === 'mur' && t.hauteurDeuxMetresOuPlus) raisons.push('Un mur de 2 mètres ou plus est soumis à déclaration préalable.');
      return raisons.length ? fini('DP', raisons) : fini('aucune', ['En principe, une clôture est dispensée de formalité d’urbanisme hors secteur protégé, hors secteur délimité par le PLU et hors commune qui les soumet à déclaration.']);
    }
    case 'destination': {
      if (t.memeDestination) return fini('aucune', ['Un changement de sous-destination à l’intérieur d’une même destination est dispensé de formalité d’urbanisme.']);
      if (!t.facadeOuStructure) return fini('DP', ['Un changement de destination sans modification de la façade ni de la structure porteuse est soumis à déclaration préalable.']);
      const grand = t.surfaceLocal !== null && t.surfaceLocal > 150;
      return fini(
        'PC',
        [
          'Un changement de destination qui modifie la façade ou la structure porteuse est soumis à permis de construire.',
          ...(grand ? ['Le bâtiment ou le local fait plus de 150 m² de surface de plancher : le recours à un architecte est obligatoire.'] : []),
        ],
        grand,
      );
    }
  }
}

function orienterExtension(
  t: { type: 'extension' | 'veranda'; surface: number; totaleApres: number | null },
  zoneU: boolean,
  protege: boolean,
  fini: (regime: Regime, raisons: string[], architecte?: boolean) => Orientation,
): Orientation {
  const quoi = t.type === 'veranda' ? 'Une véranda' : 'Un agrandissement ou une surélévation';
  const r = (x: string) => [x];
  const plus150 = t.totaleApres !== null && t.totaleApres > 150;
  const archi = (regime: Regime) => regime === 'PC' && plus150;
  const noteArchi = (regime: Regime) =>
    archi(regime) ? [`La surface de plancher totale dépasse 150 m² après travaux : le recours à un architecte est obligatoire.`] : [];
  if (t.surface <= 5) return fini('DP', r(`${quoi} qui crée 5 m² ou moins modifie l’aspect extérieur : déclaration préalable.`));
  if (zoneU && !protege) {
    if (t.surface <= 40) {
      if (t.surface > 20 && plus150)
        return fini('PC', [...r(`En zone urbaine d’un PLU, ${quoi.toLowerCase()} jusqu’à 40 m² relève de la déclaration préalable, sauf au-delà de 20 m² quand la surface totale dépasse alors 150 m² : permis de construire.`), ...noteArchi('PC')], true);
      return fini('DP', r(`En zone urbaine d’un PLU, ${quoi.toLowerCase()} de ${m2(t.surface)} (40 m² au plus) est soumis à déclaration préalable.`));
    }
    return fini('PC', [...r(`En zone urbaine d’un PLU, au-delà de 40 m², ${quoi.toLowerCase()} est soumis à permis de construire.`), ...noteArchi('PC')], archi('PC'));
  }
  const ou = protege ? 'En secteur protégé' : 'Hors zone urbaine d’un PLU';
  if (t.surface <= 20) return fini('DP', r(`${ou}, ${quoi.toLowerCase()} jusqu’à 20 m² est soumis à déclaration préalable.`));
  return fini('PC', [...r(`${ou}, au-delà de 20 m², ${quoi.toLowerCase()} est soumis à permis de construire.`), ...noteArchi('PC')], archi('PC'));
}
