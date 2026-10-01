/**
 * Où se situe un montant par habitant par rapport à sa médiane, et s'il faut
 * le dire en couleur.
 *
 * La couleur ne vaut que pour les postes dont `contenu/reperes.yaml` donne le
 * sens de lecture — l'épargne brute, la dette et ce qu'elle coûte —, avec la
 * source de la convention. Partout ailleurs, l'écart est dit sans jugement :
 * au-dessus, au-dessous, ou proche, à 5 % près.
 */
import { chargerGraphe } from './graphe.ts';
import type { Repere } from './schemas.ts';

export interface Ecart {
  /** `ec-favorable`, `ec-defavorable`, ou `ec-neutre`. */
  classe: string;
  symbole: string;
  /** Ce que dit l'écart, en mots : lu à voix haute, et visible à côté de la couleur. */
  texte: string;
  /** Les mots s'affichent pour les postes colorés, qui ne doivent pas reposer sur la couleur seule. */
  colore: boolean;
}

let sens: Map<string, Repere['sens']> | null = null;

export function ecartMediane(id: string, valeur: number | null, mediane: number | null): Ecart | null {
  if (valeur === null || mediane === null || mediane === 0) return null;
  sens ??= new Map([...chargerGraphe().reperes.values()].map((r) => [r.id, r.sens]));
  const relatif = (valeur - mediane) / Math.abs(mediane);
  if (Math.abs(relatif) < 0.05) return { classe: 'ec-neutre', symbole: '≈', texte: 'proche de la médiane', colore: false };
  const dessus = valeur > mediane;
  const s = sens.get(id);
  if (!s) {
    return { classe: 'ec-neutre', symbole: dessus ? '▲' : '▼', texte: dessus ? 'au-dessus de la médiane' : 'au-dessous de la médiane', colore: false };
  }
  const favorable = s.vers === 'haut' ? dessus : !dessus;
  return {
    classe: favorable ? 'ec-favorable' : 'ec-defavorable',
    symbole: dessus ? '▲' : '▼',
    texte: favorable ? s.lecture[0] : s.lecture[1],
    colore: true,
  };
}
