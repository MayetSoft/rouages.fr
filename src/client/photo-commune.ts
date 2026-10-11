/**
 * Une photo de la commune, d'après Wikidata (propriété P18, l'image
 * principale) et Wikimedia Commons, avec son auteur et sa licence.
 *
 * Rien ne part vers Wikimedia sans un clic : le bouton le dit, et la page
 * des mentions aussi. On cherche la commune par son code INSEE (P374),
 * par une seule requête SPARQL, puis le crédit sur Commons.
 */
export interface Photo {
  src: string;
  page: string;
  auteur: string;
  licence: string;
}

const SPARQL = 'https://query.wikidata.org/sparql';
const API_COMMONS = 'https://commons.wikimedia.org/w/api.php';

const texte = (html: string) => new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';

export async function photoCommune(code: string): Promise<Photo | null> {
  // Une seule requête à Wikidata : la commune par son code INSEE, et son image principale.
  const requete = `SELECT ?img WHERE { ?c wdt:P374 "${code.replace(/[^0-9AB]/g, '')}"; wdt:P18 ?img } LIMIT 1`;
  const r = await fetch(`${SPARQL}?${new URLSearchParams({ query: requete, format: 'json' })}`, { headers: { Accept: 'application/sparql-results+json' } });
  if (!r.ok) throw new Error(String(r.status));
  const url = (await r.json())?.results?.bindings?.[0]?.img?.value as string | undefined;
  if (!url) return null;
  const fichier = decodeURIComponent(url.split('/Special:FilePath/')[1] ?? '');
  if (!fichier) return null;
  // Puis Commons, pour la vignette, l'auteur et la licence.
  const params = new URLSearchParams({ action: 'query', titles: `File:${fichier}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '800', format: 'json', origin: '*' });
  const c = await fetch(`${API_COMMONS}?${params}`);
  if (!c.ok) throw new Error(String(c.status));
  const info = await c.json();
  const page = Object.values(info?.query?.pages ?? {})[0] as { imageinfo?: { thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] } | undefined;
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  return {
    src: ii.thumburl,
    page: ii.descriptionurl,
    auteur: texte(ii.extmetadata?.Artist?.value ?? '') || 'auteur non indiqué',
    licence: ii.extmetadata?.LicenseShortName?.value ?? 'licence sur la page du fichier',
  };
}

/** Un bouton qui, au clic, remplace son conteneur par la photo et son crédit. */
export function boutonPhoto(conteneur: HTMLElement, code: string, nom: string): void {
  conteneur.innerHTML = '';
  const bouton = Object.assign(document.createElement('button'), { type: 'button', className: 'plat', textContent: `📷 Voir ${nom} en photo` });
  const note = Object.assign(document.createElement('small'), { className: 'photo-note', textContent: ' — chargée depuis Wikimedia Commons, au clic seulement' });
  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    bouton.textContent = 'Chargement…';
    try {
      const p = await photoCommune(code);
      conteneur.innerHTML = '';
      if (!p) {
        conteneur.textContent = `Pas de photo de ${nom} sur Wikidata.`;
        return;
      }
      const figure = document.createElement('figure');
      figure.className = 'photo-commune';
      const img = Object.assign(document.createElement('img'), { src: p.src, alt: `${nom}, photo de Wikimedia Commons`, loading: 'lazy', decoding: 'async' });
      const legende = document.createElement('figcaption');
      legende.append(`${p.auteur} · ${p.licence} · `, Object.assign(document.createElement('a'), { href: p.page, textContent: 'Wikimedia Commons', rel: 'noopener', target: '_blank' }));
      figure.append(img, legende);
      conteneur.append(figure);
    } catch {
      bouton.disabled = false;
      bouton.textContent = `📷 Voir ${nom} en photo`;
      note.textContent = ' — Wikimedia ne répond pas, réessayez plus tard';
    }
  });
  conteneur.append(bouton, note);
}
