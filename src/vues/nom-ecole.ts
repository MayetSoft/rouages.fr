/**
 * Le nom d'une école tel que l'annuaire du ministère l'écrit, rendu lisible.
 *
 * L'annuaire écrit en capitales sans accents, abrège à Paris (« E E PU » pour
 * une école élémentaire publique, « E P A PU » pour une école primaire
 * d'application), répète parfois le nom (« JEAN JAURES JEAN JAURES ») et colle
 * l'adresse au bout quand deux écoles portent le même nom. On ne réécrit rien
 * d'autre : l'adresse est gardée, séparée par un tiret, parce que c'est elle
 * qui distingue deux homonymes.
 */

const TYPES: Record<string, string> = { E: 'ELEMENTAIRE', P: 'PRIMAIRE', M: 'MATERNELLE' };

/** Les mots que l'annuaire écrit sans leurs accents. */
const ACCENTS: Record<string, string> = {
  ECOLE: 'école',
  ELEMENTAIRE: 'élémentaire',
  COLLEGE: 'collège',
  PRIVEE: 'privée',
  PRIVE: 'privé',
  PUBLIQUE: 'publique',
  PUBLIC: 'public',
  PRIMAIRE: 'primaire',
  MATERNELLE: 'maternelle',
  APPLICATION: 'application',
  GROUPE: 'groupe',
  SCOLAIRE: 'scolaire',
};
const PETITS = new Set(['de', 'du', 'des', 'et', 'en', 'sur', 'sous', 'aux', 'au']);
/** « la », « le », « les » ne s'écrivent en minuscule qu'après « de », « sur »… : « rue de la Gare », mais « Jean de La Fontaine » reste douteux, et « La Fontaine » seul garde sa capitale. */
const ARTICLES = new Set(['la', 'le', 'les']);

const VOIES = 'RUE|AV|AVENUE|BD|BOULEVARD|PL|PLACE|ALL|ALLEE|IMP|IMPASSE|CHEMIN|CHE|QUAI|SQ|SQUARE|VILLA|CITE|PASSAGE|COURS|ROUTE|RTE';

export function nomEcole(brut: string): string {
  let s = brut.trim().replace(/\s+/g, ' ');
  // Les abréviations parisiennes : « E E A PU » → école élémentaire d'application publique.
  s = s.replace(/^E ([EPM]) (A )?(PU|PR)\b/, (_, t: string, a: string | undefined, sec: string) =>
    `ECOLE ${TYPES[t]}${a ? ' D APPLICATION' : ''} ${sec === 'PU' ? 'PUBLIQUE' : 'PRIVEE'}`,
  );
  // L'adresse collée au bout.
  let adresse = '';
  const m = new RegExp(`\\s(\\d+\\s*(?:BIS|TER)?\\s+(?:${VOIES})\\b.*)$`).exec(s);
  if (m) {
    adresse = m[1];
    s = s.slice(0, m.index);
  }
  // Un nom répété tel quel : « JEAN JAURES JEAN JAURES ».
  s = s.replace(/\b((?:\S+ ){1,5}\S+) \1\b/, '$1');
  const casse = (t: string, debut: boolean) =>
    t
      .toLowerCase()
      .split(' ')
      .map((mot, i, mots) => {
        const haut = mot.toUpperCase();
        if (ACCENTS[haut]) return i === 0 && debut ? ACCENTS[haut].charAt(0).toUpperCase() + ACCENTS[haut].slice(1) : ACCENTS[haut];
        if (i > 0 && PETITS.has(mot)) return mot;
        if (i > 0 && ARTICLES.has(mot) && ['de', 'sur', 'sous', 'à'].includes(mots[i - 1])) return mot;
        return mot.replace(/(^|[-'’])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
      })
      .join(' ')
      // « D APPLICATION », « L ECOLE » : l'apostrophe que l'annuaire a perdue.
      .replace(/\b([DL]) (?=[aeiouyhéèAEIOUYHÉÈ])/g, (_, l: string) => `${l.toLowerCase()}’`)
      .replace(/\b([dl])'/g, '$1’');
  return casse(s, true) + (adresse ? ` — ${casse(adresse, false)}` : '');
}
