/**
 * Sonder, depuis le réseau de GitHub, des sources que l'environnement de
 * développement ne joint pas — ccomptes.fr, par exemple, y coupe la connexion.
 * Rien n'est écrit : le journal du job dit ce que chaque adresse rend, pour
 * décider d'une collecte avant de l'écrire.
 *
 *   tsx scripts/sonder-sources.ts
 *
 * Le workflow « Sonder des sources » le lance à la main, et sur toute PR qui
 * modifie ce fichier : ajouter une adresse ici suffit à la faire essayer.
 */

interface Sonde {
  url: string;
  /** Ce qu'on cherche dans la réponse : les correspondances sont listées. */
  motifs?: RegExp[];
}

const SONDES: Sonde[] = [
  // Les sites et sols pollués de Géorisques (ex-BASIAS, ex-BASOL, SIS) :
  // quelle forme ont les réponses, par commune, et existe-t-il un fichier
  // national ? Le Mayet-de-Montagne, puis Vichy, qui doit en avoir.
  { url: 'https://georisques.gouv.fr/api/v1/ssp/casias?code_insee=03165&page=1&page_size=3' },
  { url: 'https://georisques.gouv.fr/api/v1/ssp/casias?code_insee=03310&page=1&page_size=3' },
  { url: 'https://georisques.gouv.fr/api/v1/ssp/instructions?code_insee=03310&page=1&page_size=3' },
  { url: 'https://georisques.gouv.fr/api/v1/ssp/conclusions_sis?code_insee=03310&page=1&page_size=3' },
  { url: 'https://georisques.gouv.fr/api/v1/ssp?code_insee=03310&page=1&page_size=3' },
  { url: 'https://georisques.gouv.fr/api/v1/installations_classees?code_insee=03310&page=1&page_size=3' },
  {
    url: 'https://www.georisques.gouv.fr/donnees/bases-de-donnees',
    motifs: [/href="[^"]*(?:\.csv|\.zip|telechargement|download)[^"]*"/gi, /href="[^"]*(?:casias|basias|basol|sis|ssp|instruction)[^"]*"/gi],
  },
  {
    url: 'https://www.georisques.gouv.fr/donnees/bases-de-donnees/secteurs-dinformations-sur-les-sols-sis',
    motifs: [/href="[^"]*(?:\.csv|\.zip|telechargement|download)[^"]*"/gi],
  },
  { url: 'https://files.georisques.fr/', motifs: [/href="[^"]+"/g] },
  // La Cour des comptes et les chambres régionales : leurs publications sont-
  // elles listées quelque part de lisible par un programme ?
  { url: 'https://www.ccomptes.fr/robots.txt', motifs: [/^Sitemap:.*$/gim] },
  { url: 'https://www.ccomptes.fr/sitemap.xml', motifs: [/<loc>[^<]*publications[^<]*<\/loc>/g, /<loc>[^<]*sitemap[^<]*<\/loc>/g] },
  {
    url: 'https://www.ccomptes.fr/fr/publications',
    motifs: [/<form[^>]*>/g, /<input[^>]*name="[^"]+"[^>]*>/g, /<select[^>]*name="[^"]+"/g, /href="[^"]*\?[^"]*at\d=[^"]*"/g, /application\/(rss|atom)\+xml[^>]*/g],
  },
  {
    url: 'https://www.ccomptes.fr/fr/publications/communaute-dagglomeration-vichy-communaute-allier',
    motifs: [/<script type="application\/ld\+json">[\s\S]{0,600}/g, /<meta property="[^"]+" content="[^"]*"/g, /<time[^>]*>[^<]*<\/time>/g, /href="[^"]+\.pdf"/g, /class="[^"]*(date|type|juridiction|organisme)[^"]*"[^>]*>[^<]{0,120}/g],
  },
  { url: 'https://www.ccomptes.fr/fr/publications?search_api_fulltext=Vichy', motifs: [/href="\/fr\/publications\/[^"]+"/g] },
  { url: 'https://www.ccomptes.fr/fr/recherche?keys=Vichy', motifs: [/href="\/fr\/publications\/[^"]+"/g] },
  { url: 'https://www.ccomptes.fr/jsonapi', motifs: [/"[a-z_]+--[a-z_]+"/g] },
  { url: 'https://www.ccomptes.fr/fr/rss.xml', motifs: [/<item>[\s\S]{0,300}/g] },
  { url: 'https://www.ccomptes.fr/fr/publications/rss', motifs: [/<item>[\s\S]{0,300}/g] },
];

export {};

const court = (s: string, n = 220) => s.replace(/\s+/g, ' ').slice(0, n);

for (const s of SONDES) {
  const debut = Date.now();
  try {
    const r = await fetch(s.url, {
      signal: AbortSignal.timeout(60_000),
      headers: { 'User-Agent': 'Rouages.fr (sonde de sources ; https://rouages.fr)' },
      redirect: 'follow',
    });
    const corps = await r.text();
    console.log(`\n## ${s.url}`);
    console.log(`${r.status} · ${r.headers.get('content-type')} · ${corps.length} caractères · ${Date.now() - debut} ms · ${r.url}`);
    for (const m of s.motifs ?? []) {
      const trouves = [...new Set(corps.match(m) ?? [])];
      console.log(`  ${m} : ${trouves.length}`);
      for (const t of trouves.slice(0, 15)) console.log(`    ${court(t)}`);
    }
    if (!s.motifs?.length || r.status >= 400) console.log(`  début : ${court(corps, 400)}`);
  } catch (e) {
    // « fetch failed » ne dit rien : la cause — délai, refus, nom inconnu — est dessous.
    const cause = (e as Error & { cause?: { code?: string; message?: string } }).cause;
    console.log(
      `\n## ${s.url}\n  échec après ${Date.now() - debut} ms : ${(e as Error).message}` +
        (cause ? ` — ${cause.code ?? ''} ${cause.message ?? ''}` : ''),
    );
  }
}
