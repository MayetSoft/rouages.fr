/**
 * `aides-locales.json` : le registre des aides locales à la rénovation, pour
 * qu'un autre service le suive — l'alerte de pro.rouages.fr dit à ses abonnés
 * quand une aide de leur territoire s'ouvre, change ou ferme.
 *
 * Publié à côté d'`echeances.json`. Pour chaque aide : ce que le site affiche,
 * les départements et les intercommunalités des communes où elle vaut, et une
 * empreinte de ce qui compte pour un demandeur — montant, conditions, dates,
 * périmètre, démarche. Une relecture qui ne change rien (`verifie_le`) ne
 * change pas l'empreinte.
 */
import { createHash } from 'node:crypto';
import type { APIRoute } from 'astro';
import { aidesDeCommune, aidesLocales, BENEFICIAIRES, etatAide, intercosDe, TRAVAUX, type AideLocale } from '../../modele/aides-locales.ts';
import { communes } from '../../modele/territoires.ts';

const empreinte = (a: AideLocale) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        a.intitule, a.montant, a.ressources, a.travaux, a.beneficiaires, a.perimetre.communes,
        a.conditions.map((c) => c.texte), a.cumul, a.ouverture, a.fermeture, a.statut, a.demarche,
      ]),
    )
    .digest('hex')
    .slice(0, 16);

export const GET: APIRoute = () => {
  const registre = aidesLocales();
  const ou = new Map(registre.map((a) => [a.id, { deps: new Set<string>(), epci: new Set<string>(), communes: 0 }]));
  for (const c of communes()) {
    for (const a of aidesDeCommune(c.code, c.dep, registre)) {
      const o = ou.get(a.id)!;
      o.deps.add(c.dep);
      for (const e of intercosDe(c.code)) o.epci.add(e);
      o.communes++;
    }
  }
  const aides = registre.map((a) => {
    const o = ou.get(a.id)!;
    return {
      id: a.id,
      intitule: a.intitule,
      porteur: a.porteur.nom,
      montant: a.montant,
      travaux: a.travaux.map((t) => TRAVAUX[t]),
      beneficiaires: a.beneficiaires.map((b) => BENEFICIAIRES[b]),
      etat: etatAide(a),
      ouverture: a.ouverture,
      fermeture: a.fermeture,
      demarche: a.demarche.url,
      avant_travaux: a.demarche.avant_travaux,
      deps: [...o.deps].sort(),
      epci: [...o.epci].sort(),
      communes: o.communes,
      verifie_le: a.verifie_le,
      empreinte: empreinte(a),
    };
  });
  const maj = registre.map((a) => a.verifie_le).sort().at(-1) ?? null;
  return new Response(JSON.stringify({ maj, aides }), { headers: { 'Content-Type': 'application/json' } });
};
