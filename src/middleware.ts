/**
 * Chaque page générée passe ici une fois, au build. Seul traitement : replier
 * les sources et les réserves des blocs (voir `modele/replier-sources.ts`).
 */
import { defineMiddleware } from 'astro:middleware';
import { replierSources } from './modele/replier-sources.ts';

export const onRequest = defineMiddleware(async (_contexte, suivant) => {
  const reponse = await suivant();
  if (!reponse.headers.get('content-type')?.includes('text/html')) return reponse;
  const html = await reponse.text();
  return new Response(replierSources(html), { status: reponse.status, headers: reponse.headers });
});
