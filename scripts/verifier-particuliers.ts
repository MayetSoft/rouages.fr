/**
 * Vérifie le repérage d'un particulier nommé dans l'objet d'une délibération
 * (`src/modele/civilites.ts`). Les noms ci-dessous sont inventés.
 *
 * L'erreur coûte dans les deux sens : un particulier qui passe est publié
 * contre la règle du projet ; un faux positif retire une délibération de la
 * page sans raison. Les cas viennent de motifs réels relevés dans les
 * intitulés publiés le 16 octobre 2026.
 */
import { nommeUnParticulier, nommeUnePersonne } from '../src/modele/civilites.ts';

const NOMME: string[] = [
  'Subvention à Jacques Fictivel pour travaux d’enrobé',
  'SUBV A DOMINIQUE IMAGINOT TRVX ENROBES ABORDS HABITATION',
  'Cadeau de départ à Jean-François LE INVENTIF',
  'Remboursement assurance Joël Le Supposé',
  'CESSION D’UNE EMPRISE FONCIÈRE A MONSIEUR SAMUEL EXEMPLAIRE',
  'Vente d’une parcelle au profit de Mme Odile Hypothèse',
  'AU PROFIT DE MADAME TIPHAINE FICTIVE POUR LE COMPTE DE LA SOCIÉTÉ',
  'Vente d’un terrain via l’agent immobilier Sébastien INVENTÉ',
];
const PAS_NOMME: string[] = [
  'Participation aux dépenses de fonctionnement de lécole publique Henri Matisse',
  'Dénomination de la rue Jean Moulin',
  'Subvention pour la cour d_école Simone Veil',
  'DE9826 _Lotissement Nelson MANDELA convention de transfert',
  'Emprunt auprès de lAgence France Locale',
  'Convention de partenariat France Services',
  'CHOIX MAITRE D OEUVRE',
  'HONORAIRES DU MAITRE D’OEUVRE',
  'Décisions de Madame la Maire',
  'ILLUMINATION DE NOEL CHOIX PRESTATAIRE',
  'DROIT DE PREEMPTION URBAIN RENFORCE',
  'CONVENTION D’OCCUPATION A LA LANDE MARTIN AVEC ATC FRANCE',
  'Complexe sportif Jean Coulon : remplacement de la main courante',
  'Vote du compte financier unique 2025',
];

let erreurs = 0;
for (const t of NOMME)
  if (!nommeUnParticulier(t)) {
    console.log(`manqué : « ${t} »`);
    erreurs++;
  }
for (const t of PAS_NOMME)
  if (nommeUnParticulier(t)) {
    console.log(`faux positif : « ${t} »`);
    erreurs++;
  }
// Le motif des civilités, seul, sert aussi la validation de `contenu/` : « maître d'œuvre » n'y est pas un nom.
for (const t of ['CHOIX MAITRE D OEUVRE', 'Décisions de Madame la Maire'])
  if (nommeUnePersonne(t)) {
    console.log(`civilité, faux positif : « ${t} »`);
    erreurs++;
  }
if (erreurs) {
  console.log(`${erreurs} erreur(s).`);
  process.exit(1);
}
console.log(`Repérage des particuliers : ${NOMME.length + PAS_NOMME.length} cas vérifiés.`);
