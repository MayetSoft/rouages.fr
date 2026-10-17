/**
 * Vérifie l'orienteur des autorisations d'urbanisme (`src/modele/autorisations.ts`)
 * contre les fiches de service-public.fr qu'il cite, cas par cas — chaque
 * cas reprend une phrase de la fiche, lue le 16 octobre 2026.
 *
 * L'erreur qui compte est la réponse trop légère : « aucune formalité » là où
 * la fiche demande une déclaration. Les cas « je ne sais pas » vérifient que
 * le doute penche vers la formalité.
 */
import { orienter } from '../src/modele/autorisations.ts';
import { CAS, DOUTE } from './autorisations-cas.ts';
import { FICHIER, ficheAJour } from './relecture-autorisations.ts';

let erreurs = 0;
for (const [quoi, t, s, regime, architecte] of CAS) {
  const o = orienter(t, s);
  if (o.regime !== regime || o.architecte !== architecte) {
    console.error(`« ${quoi} » : attendu ${regime}${architecte ? ' + architecte' : ''}, obtenu ${o.regime}${o.architecte ? ' + architecte' : ''}`);
    erreurs++;
  }
  if (!o.raisons.length) {
    console.error(`« ${quoi} » : aucune raison donnée`);
    erreurs++;
  }
}
// Le doute se dit.
const doute = orienter({ type: 'extension', surface: 25, totaleApres: 120 }, DOUTE);
if (doute.hypotheses.length !== 2) {
  console.error(`le doute sur la zone et le secteur devrait donner deux hypothèses, il en donne ${doute.hypotheses.length}`);
  erreurs++;
}
// La fiche de relecture du praticien suit les cas et le modèle.
if (!ficheAJour()) {
  console.error(`${FICHIER} n’est plus à jour : lancer npm run relecture-autorisations, puis la committer.`);
  erreurs++;
}
if (erreurs) {
  console.error(`${erreurs} erreur(s) dans l’orienteur des autorisations.`);
  process.exit(1);
}
console.log(`Autorisations d’urbanisme : ${CAS.length} cas conformes aux fiches de service-public.fr, le doute dit, et la fiche de relecture à jour.`);
