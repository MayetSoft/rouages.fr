/**
 * Toutes les icônes de thèmes dans un seul fichier (`/icones.svg`), chacune un
 * `<symbol>` : une page les appelle par `<use href="/icones.svg#nom">`. Les
 * dessiner en ligne coûterait quelques kilo-octets à chacune des 34 875 pages
 * de commune ; ici, le navigateur les charge une fois.
 */
import type { APIRoute } from 'astro';
import { ICONES } from '../modele/icones.ts';

export const GET: APIRoute = () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg">${Object.entries(ICONES)
      .map(([nom, contenu]) => `<symbol id="${nom}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${contenu}</symbol>`)
      .join('')}</svg>`,
    { headers: { 'Content-Type': 'image/svg+xml' } },
  );
