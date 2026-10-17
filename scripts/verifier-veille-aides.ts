/**
 * Vérifie comment la veille des aides locales retrouve une citation dans un
 * texte relu (`scripts/veille-aides.ts`).
 *
 * L'erreur coûte dans les deux sens : une fausse alerte chaque lundi finit par
 * ne plus être lue, et un montant changé qui passerait inaperçu laisserait le
 * site afficher un chiffre faux. Les cas viennent des textes réels du registre
 * de l'Allier : des glyphes de ligature perdus par `pdftotext`, un tableau lu
 * colonne par colonne, une citation qui porte sa page après le guillemet.
 */
import { constatsDeDates, indexer, passages, retrouve, texteHtml } from './veille-aides.ts';
import type { AideLocale } from '../src/modele/aides-locales.ts';

const ROUGE = '\x1b[31m', VERT = '\x1b[32m', GRIS = '\x1b[90m', RAZ = '\x1b[0m';
let echecs = 0;

function attendre(quoi: string, obtenu: unknown, attendu: unknown, pourquoi: string) {
  const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
  if (!ok) echecs++;
  console.log(
    `${ok ? VERT + '  ok  ' : ROUGE + 'ÉCHEC '}${RAZ}${quoi} → ${JSON.stringify(obtenu)}` +
      (ok ? '' : ` (attendu ${JSON.stringify(attendu)})`) +
      `\n      ${GRIS}${pourquoi}${RAZ}`,
  );
}

const dans = (citation: string, texte: string) => passages(citation).every((p) => retrouve(p, indexer(texte)));

// --- les passages d'une citation ---
attendre(
  'passages',
  passages('Prime forfaitaire de 5000 € par logement loué. » (p. 3) ; « La prime est versée après visite. » (p. 4)').length,
  2,
  'la page après le guillemet ne fait pas partie du texte cité',
);

// --- ce qui doit se retrouver ---
attendre(
  'ligatures perdues',
  dans("En cas de non-respect de cette clause, l'aide sera à rembourser.", 'En cas de non-respect de ce e clause, l’aide sera à rembourser.'),
  true,
  '« cette » lu « ce e » par pdftotext, et l’apostrophe typographique',
);
attendre(
  'tableau lu en colonnes',
  dans('Aide au ravalement de façades  25%  3 500 €', 'Nature de l’aide Aide au ravalement de façades Taux 25% Plafond 3 500 €'),
  true,
  'les mots et les nombres sont là, dans un autre ordre',
);
attendre(
  'espace insécable dans un montant',
  dans('plafonné à 50 000 € HT par logement vacant', 'plafonné à 50 000 € HT par logement vacant'),
  true,
  'une espace insécable n’est pas un changement',
);

attendre(
  'entités HTML',
  dans('les demandes devront être déposées avant le 18 septembre 2026', texteHtml('<p>les demandes devront &ecirc;tre d&eacute;pos&eacute;es avant le 18&nbsp;septembre 2026</p>')),
  true,
  '« &ecirc; » est un « ê » : la page dit bien la phrase citée',
);

// --- ce qui ne doit pas se retrouver ---
attendre(
  'montant changé',
  dans('Prime forfaitaire de 5000 € par logement loué.', 'Prime forfaitaire de 4000 € par logement loué.'),
  false,
  'le signal que la veille existe pour donner',
);
attendre(
  'taux changé dans un tableau',
  dans('Aide au ravalement de façades  25%  3 500 €', 'Nature de l’aide Aide au ravalement de façades Taux 20% Plafond 3 500 €'),
  false,
  'la tolérance sur l’ordre des mots ne s’étend pas aux nombres',
);
attendre(
  'condition retirée',
  dans('Les bailleurs publics ne sont pas éligibles à cette aide.', 'Les projets touristiques ne sont pas éligibles.'),
  false,
  'une phrase disparue',
);

// --- les dates ---
const aide = (fermeture: string | null, verifie_le: string) =>
  ({ id: 'essai', intitule: 'Essai', statut: 'ouverte', fermeture, verifie_le }) as unknown as AideLocale;
const gravites = (a: AideLocale) => constatsDeDates([a], '2026-10-15').map((c) => c.gravite);
attendre('fin passée', gravites(aide('2026-09-30', '2026-10-12')), ['alerte'], 'dite ouverte après sa date de fin');
attendre('fin dans 45 jours', gravites(aide('2026-11-29', '2026-10-12')), ['a-regarder'], 'le temps de chercher une reconduction');
attendre('fin lointaine', gravites(aide('2029-12-31', '2026-10-12')), [], 'rien à dire');
attendre('vérifiée il y a 340 jours', gravites(aide(null, '2025-11-09')), ['a-regarder'], 'affichée « à revérifier » dans moins d’un mois');

console.log(
  echecs === 0
    ? `\n${VERT}Veille des aides conforme.${RAZ}`
    : `\n${ROUGE}${echecs} règle(s) de la veille des aides ne tiennent plus.${RAZ}`,
);
process.exit(echecs === 0 ? 0 : 1);
