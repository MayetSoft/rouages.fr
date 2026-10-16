/**
 * Vérifie les règles qui rangent les intitulés de délibération par compétence
 * (`src/modele/themes-deliberations.ts`) : chaque règle mène à une fiche qui
 * existe, et des intitulés réels — relevés dans les données de Mégalis
 * Bretagne pour 2025 — se rangent où il faut, ou nulle part.
 *
 * Les cas « nulle part » sont les faux positifs trouvés à la relecture : une
 * règle élargie sans y penser les ferait revenir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { THEMES, themesDe } from '../src/modele/themes-deliberations.ts';

const racine = join(import.meta.dirname, '..');
const competences = new Set(
  (parse(readFileSync(join(racine, 'contenu', 'competences.yaml'), 'utf8')) as { competences: { id: string }[] }).competences.map((c) => c.id),
);

let erreurs = 0;
const vues = new Set<string>();
for (const t of THEMES) {
  if (!competences.has(t.fiche)) {
    console.error(`règle sans fiche : ${t.fiche} n'est pas dans contenu/competences.yaml`);
    erreurs++;
  }
  if (vues.has(t.fiche)) {
    console.error(`deux règles pour ${t.fiche}`);
    erreurs++;
  }
  vues.add(t.fiche);
}

/** [intitulé, compétences attendues — toutes, et rien d'autre]. */
const CAS: [string, string[]][] = [
  ['TARIFS RESTAURATION SCOLAIRE - CONVIVIO', ['ecoles-primaires']],
  ['Finances - Débat dorientations budgétaires 2025.', ['vote-du-budget']],
  ['342025 Plan de financement extension de la station épuration', ['assainissement']],
  ['TRAVAUX - Travaux déclairage public  Programme 2025', ['voirie-communale']],
  ['Budget eau 2025 - Décision modificative n°1', ['eau-potable', 'vote-du-budget']],
  ['Contribution SDIS', ['secours-incendie']],
  ['Mise à disposition point d’eau incendie privé pour la DECI publique', ['defense-incendie']],
  ['Avis sur le projet de révision du SCOT du Pays de Pontivy', ['planification-scot']],
  ['Garantie d emprunt - Office Public de l Habitat du Morbihan', ['logement-social']],
  ['Cimetière : reprise de concession en état d’abandon', ['cimetiere']],
  ['Commission de contrôle des listes électorales', ['listes-electorales']],
  ['DEMANDE DE SUBVENTION DETR - PISCINE - PHASE 2', ['subventions-investissement', 'equipements-culturels-sportifs']],
  ['Approbation de la modification des statuts du Syndicat Département d’Énergies du Morbihan', ['distribution-electricite']],
  ['Transports scolaires : convention de délégation de compétence avec la Région', ['transport-scolaire']],
  // Les faux positifs de la relecture.
  ['Bilan de la concertation et arrêt du PLU', ['redaction-plu']],
  ['DELIBERATION PORTANT CREATION D UN EMPLOI PERMANENT SUITE PLACEMENT EN PPR', []],
  ['DEMANDE D’AIDE FINANCIERE PONCTUELLE POUR CERTAINES PERSONNES HEBERGEES AU CADA', []],
  ['AS CONVENTION APA SPORT', ['activites-sportives']],
  ['CM du 16 décembre 2025 - D10 - Indemnité de Chaussures et Petits Equipements (ICPE)', []],
  ['Motion classement sauvetage en mer patrimoine immatériel UNESCO', []],
  ['REDEVANCE D OCCUPATION DU DOMAINE PUBLIC GRDF', []],
  ['ouverture d’une ligne de trésorerie', []],
  ['Adhésion au CNAS - action sociale du personnel', []],
  ['Médecine préventive : convention avec le centre de gestion', []],
  ['Forfait mobilités durables pour les agents', []],
  ['D_PART_FRAIS_SCOLARITE_ECOLE_PUBLIQUE_LA_CHAPELLE_CHAUSSEE', ['ecoles-primaires']],
  ['Subventions aux manifestations d’intérêt communautaire 2025', []],
];

for (const [objet, attendu] of CAS) {
  const obtenu = themesDe(objet).map((i) => THEMES[i].fiche).sort();
  const voulu = [...attendu].sort();
  if (obtenu.join() !== voulu.join()) {
    console.error(`« ${objet} » : attendu [${voulu.join(', ')}], obtenu [${obtenu.join(', ')}]`);
    erreurs++;
  }
}

if (erreurs) {
  console.error(`${erreurs} erreur(s) dans les règles par compétence.`);
  process.exit(1);
}
console.log(`Règles par compétence : ${THEMES.length} règles, toutes vers une fiche ; ${CAS.length} intitulés rangés comme attendu.`);
