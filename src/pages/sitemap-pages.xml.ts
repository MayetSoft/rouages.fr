/**
 * Les pages du réseau : les fiches de nœuds et les quelques pages fixes.
 *
 * Elles sont séparées des communes parce qu'elles ne changent pas au même
 * rythme : une fiche bouge quand le contenu bouge, une page de commune quand la
 * donnée est réingérée.
 */
import type { APIRoute } from 'astro';
import { construireReseau } from '../modele/reseau.ts';
import { plan } from '../modele/sitemap.ts';
import { communes, intercommunalites, lienIntercommunalite } from '../modele/territoires.ts';
import { collectivites, lienCollectivite } from '../modele/fiche-commune.ts';

export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, '') ?? 'https://rouages.fr';
  const fixes = ['/', '/etat', '/glossaire', '/methode', '/signaler', '/communes'];
  // Une liste par département : c'est par elles qu'un moteur suit le chemin
  // jusqu'aux communes, en plus de leurs propres plans.
  const departements = [...new Set(communes().map((c) => c.dep))].map((d) => `/communes/${d}`);
  const noeuds = construireReseau().noeuds.map((n) => `/n/${n.id}`);
  // Les intercommunalités, les départements et les régions, une page chacun.
  const echelons = collectivites().map(lienCollectivite);
  const intercos = intercommunalites().map((e) => lienIntercommunalite(e.siren));
  return plan(base, [...fixes, ...departements, ...echelons, ...intercos, ...noeuds]);
};
