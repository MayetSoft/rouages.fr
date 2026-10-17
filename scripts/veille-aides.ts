/**
 * La veille des aides locales (`contenu/aides-locales.yaml`) : les textes
 * relus chaque semaine, et les dates qui approchent.
 *
 * Une aide locale se périme sans bruit : une délibération modifie un barème,
 * un règlement est remplacé, une page disparaît quand le dispositif ferme.
 * Le registre n'en sait rien. Ce contrôle relit donc chaque texte source et
 * donne trois signaux, du plus sûr au plus vague :
 *
 * - **une citation introuvable** : le texte d'où vient un montant ou une
 *   condition ne contient plus les mots cités. C'est le signal fort — le
 *   registre affiche peut-être un montant qui n'est plus le bon ;
 * - **un texte qui n'est plus en ligne** (404, 410) : le dispositif a peut-être
 *   fermé, ou la collectivité a refait son site ;
 * - **un texte qui a changé** depuis le dernier contrôle, sans que les
 *   citations en souffrent : à relire, sans urgence. Une page web change pour
 *   un menu ou une actualité ; le constat le dit sans crier.
 *
 * Et, sans rien télécharger : une aide dite ouverte dont la date de fin est
 * passée ou approche, une vérification qui aura bientôt un an.
 *
 * Les PDF se lisent avec `pdftotext` (poppler) quand il est installé — il
 * l'est dans le workflow de la veille ; sans lui, seule l'empreinte du
 * fichier est suivie.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { aidesLocales, VERIFICATION_VALABLE_JOURS, type AideLocale } from '../src/modele/aides-locales.ts';

export type Gravite = 'ok' | 'a-regarder' | 'alerte';

export interface ConstatAide {
  /** L'adresse du texte, ou l'identifiant de l'aide pour un constat de date. */
  cle: string;
  nom: string;
  aides: string[];
  gravite: Gravite;
  message: string;
  empreinte?: string;
}

const JOUR = 86_400_000;
/** Une fin d'aide se signale deux mois avant : le temps de vérifier une reconduction. */
const PREAVIS_FERMETURE_JOURS = 60;
/** Une vérification se signale un mois avant d'atteindre un an. */
const PREAVIS_VERIFICATION_JOURS = 30;

const empreinteDe = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * Pour comparer une citation au texte : lettres et chiffres seulement, sans
 * accents, en minuscules. Les ligatures (ﬁ, ﬀ…) se décomposent ; et comme
 * `pdftotext` en perd parfois le glyphe (« cette » lu « ce e », « subvention »
 * lu « subven on »), les lettres f, i, l et t, qui les composent, sont
 * retirées des deux côtés. Sur un passage d'une ligne, il reste bien assez de
 * lettres pour ne pas confondre.
 */
export function aplatir(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/[filt]/g, '');
}

/** Les mots d'un texte, aplatis de même, et ses nombres. */
const mots = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).map((m) => m.replace(/[filt]/g, '')).filter((m) => m.length >= 3);
const nombres = (s: string) => s.replace(/(\d)[\s\u00a0\u202f.](?=\d{3}\b)/g, '$1').match(/\d+(?:[,.]\d+)?/g) ?? [];

/**
 * Un passage est-il dans le texte ? Mot pour mot, d'abord. Sinon, un tableau
 * a pu être lu colonne par colonne : le passage passe encore si tous ses
 * nombres sont dans le texte et presque tous ses mots. C'est le nombre qui
 * compte — un montant changé, lui, ne se retrouve pas.
 */
export function retrouve(passage: string, texte: { plat: string; mots: Set<string>; nombres: Set<string> }): boolean {
  if (texte.plat.includes(aplatir(passage))) return true;
  const n = nombres(passage);
  if (n.some((x) => !texte.nombres.has(x))) return false;
  const m = mots(passage);
  // Un mot coupé en deux par l'extraction (« énergé que ») se retrouve dans le texte aplati.
  return m.length > 0 && m.filter((x) => texte.mots.has(x) || texte.plat.includes(x)).length / m.length >= 0.85;
}

export const indexer = (t: string) => ({ plat: aplatir(t), mots: new Set(mots(t)), nombres: new Set(nombres(t)) });

/** Une citation réunit parfois plusieurs passages — « … » ; « … » —, des coupes […], ou porte sa page après le guillemet. */
export function passages(citation: string): string[] {
  return citation
    // Un guillemet fermant clôt un passage, suivi parfois de sa page : « … » (p. 3) ; « … ».
    .split(/»\s*(?:\([^)]{0,60}\))?\s*[;,.]?\s*«?|…|\[\s*\.\.\.\s*\]|\(\s*\.\.\.\s*\)|\.\.\./)
    .map((p) => p.replace(/[«»]/g, '').trim())
    .filter((p) => aplatir(p).length >= 12);
}

/** Les entités nommées qu'on croise dans les pages des collectivités ; les lettres accentuées se composent à part. */
const ENTITES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: '’', lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—', deg: '°', euro: '€', oelig: 'œ', OElig: 'Œ', aelig: 'æ', sup2: '²', sup3: '³',
};
const DIACRITIQUE: Record<string, string> = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', cedil: '\u0327' };
/** « ecirc » → « ê », « Eacute » → « É ». */
const ACCENTS = (nom: string) => {
  const m = /^([a-z])(acute|grave|circ|uml|cedil)$/i.exec(nom)!;
  return (m[1] + DIACRITIQUE[m[2].toLowerCase()]).normalize('NFC');
};

/** Le texte lisible d'une page : sans scripts, styles, ni balises. */
export function texteHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+\d?);/gi, (tout, nom: string) => ENTITES[nom] ?? (/^[a-z](acute|grave|circ|uml|cedil)$/i.test(nom) ? ACCENTS(nom) : tout))
    .replace(/\s+/g, ' ')
    .trim();
}

const pdftotextPresent = spawnSync('pdftotext', ['-v']).error === undefined;

function textePdf(octets: Uint8Array): string | null {
  if (!pdftotextPresent) return null;
  const r = spawnSync('pdftotext', ['-q', '-', '-'], { input: octets, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const t = r.stdout.toString('utf8').replace(/\s+/g, ' ').trim();
  // Un PDF scanné n'a pas de texte : on ne peut rien y chercher.
  return t.length > 50 ? t : null;
}

type Lecture = { ok: true; texte: string | null; empreinte: string; pdf: boolean } | { ok: false; statut: number | null; motif: string };

async function lire(url: string): Promise<Lecture> {
  let derniere: Lecture = { ok: false, statut: null, motif: 'injoignable' };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'accept-language': 'fr', 'user-agent': 'Mozilla/5.0 (compatible; veille rouages.fr; +https://rouages.fr/mentions)' },
        signal: AbortSignal.timeout(45_000),
        redirect: 'follow',
      });
      if (r.status === 404 || r.status === 410) return { ok: false, statut: r.status, motif: `HTTP ${r.status}` };
      if (!r.ok) {
        derniere = { ok: false, statut: r.status, motif: `HTTP ${r.status}` };
      } else {
        const octets = new Uint8Array(await r.arrayBuffer());
        const pdf = (r.headers.get('content-type') ?? '').includes('pdf') || (octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46);
        if (pdf) {
          const texte = textePdf(octets);
          return { ok: true, pdf, texte, empreinte: empreinteDe(texte ?? octets) };
        }
        const texte = texteHtml(new TextDecoder('utf-8').decode(octets));
        return { ok: true, pdf, texte, empreinte: empreinteDe(texte) };
      }
    } catch (e) {
      const cause = (e as { cause?: { message?: string } }).cause?.message;
      derniere = { ok: false, statut: null, motif: cause ?? (e as Error).message };
    }
    await new Promise((r) => setTimeout(r, (i + 1) * 2000));
  }
  return derniere;
}

/** Les textes à relire : une entrée par adresse, avec les citations qui s'y rapportent. */
function textes(registre: AideLocale[]) {
  const parUrl = new Map<string, { titre: string; aides: Set<string>; citations: { aide: string; citation: string }[] }>();
  for (const a of registre) {
    a.sources.forEach((s, i) => {
      const t = parUrl.get(s.url) ?? { titre: s.titre, aides: new Set(), citations: [] };
      t.aides.add(a.id);
      for (const c of a.conditions) if (c.source === i + 1 && c.citation) t.citations.push({ aide: a.id, citation: c.citation });
      parUrl.set(s.url, t);
    });
  }
  return parUrl;
}

/** Les constats de date : rien à télécharger. */
export function constatsDeDates(registre: AideLocale[], jour = new Date().toISOString().slice(0, 10)): ConstatAide[] {
  const out: ConstatAide[] = [];
  const dans = (d: string) => Math.round((Date.parse(d) - Date.parse(jour)) / JOUR);
  for (const a of registre) {
    const base = { cle: `aide:${a.id}`, nom: a.intitule, aides: [a.id] };
    if (a.statut === 'ouverte' && a.fermeture) {
      const j = dans(a.fermeture);
      if (j < 0) out.push({ ...base, gravite: 'alerte', message: `dite ouverte, mais sa date de fin (${a.fermeture}) est passée : reconduite, ou à passer en « fermee » ?` });
      else if (j <= PREAVIS_FERMETURE_JOURS) out.push({ ...base, gravite: 'a-regarder', message: `prend fin le ${a.fermeture}, dans ${j} jour${j > 1 ? 's' : ''} : chercher une reconduction` });
    }
    if (a.statut !== 'fermee' && a.verifie_le) {
      const age = -dans(a.verifie_le);
      const reste = VERIFICATION_VALABLE_JOURS - age;
      if (reste <= PREAVIS_VERIFICATION_JOURS) {
        out.push({ ...base, gravite: 'a-regarder', message: reste < 0 ? `vérifiée le ${a.verifie_le}, il y a plus d'un an : affichée « à revérifier »` : `vérifiée le ${a.verifie_le} : affichée « à revérifier » dans ${reste} jours` });
      }
    }
  }
  return out;
}

/**
 * Relit tous les textes. `avant` : les empreintes du dernier contrôle, par
 * adresse. Rend les constats (un par texte, plus ceux de date) et les
 * empreintes à retenir.
 */
export async function veillerAides(avant: Record<string, string>): Promise<{ constats: ConstatAide[]; empreintes: Record<string, string>; relus: number }> {
  const registre = aidesLocales();
  const aLire = [...textes(registre)];
  const constats: ConstatAide[] = [];
  const empreintes: Record<string, string> = {};
  let suivant = 0;
  // Quelques lectures à la fois : les sites des collectivités sont modestes.
  const ouvrier = async () => {
    while (suivant < aLire.length) {
      const [url, t] = aLire[suivant++];
      const base = { cle: url, nom: t.titre, aides: [...t.aides] };
      const l = await lire(url);
      if (!l.ok) {
        // L'empreinte précédente est gardée : une coupure ne doit pas faire croire, la fois suivante, à un texte changé.
        if (avant[url]) empreintes[url] = avant[url];
        constats.push({
          ...base,
          gravite: l.statut === 404 || l.statut === 410 ? 'alerte' : 'a-regarder',
          message: l.statut === 404 || l.statut === 410 ? `le texte n'est plus en ligne (${l.motif}) : dispositif fermé, ou site refait ?` : `injoignable (${l.motif})`,
        });
        continue;
      }
      empreintes[url] = l.empreinte;
      // Un PDF scanné, ou un barème en image, recopié à la main dans le registre : rien à y chercher.
      const index = l.texte && !/scann[ée]|en image/i.test(t.titre) ? indexer(l.texte) : null;
      const perdues = index ? t.citations.filter((c) => passages(c.citation).some((p) => !retrouve(p, index))) : [];
      const change = avant[url] !== undefined && avant[url] !== l.empreinte;
      if (perdues.length > 0) {
        const ex = perdues[0].citation.slice(0, 90);
        constats.push({
          ...base,
          gravite: 'alerte',
          empreinte: l.empreinte,
          message: `${perdues.length} citation${perdues.length > 1 ? 's' : ''} sur ${t.citations.length} introuvable${perdues.length > 1 ? 's' : ''} dans le texte en ligne (${[...new Set(perdues.map((p) => p.aide))].join(', ')}) — par exemple « ${ex}${perdues[0].citation.length > 90 ? '…' : ''} »`,
        });
      } else if (change) {
        constats.push({ ...base, gravite: 'a-regarder', empreinte: l.empreinte, message: `le texte a changé depuis le dernier contrôle${t.citations.length ? `, mais ses ${t.citations.length} citation${t.citations.length > 1 ? 's' : ''} y sont toujours` : ''}` });
      } else {
        const lu = index === null ? (l.pdf ? 'PDF sans texte fiable : empreinte du fichier seule' : 'empreinte seule') : t.citations.length ? `${t.citations.length} citation${t.citations.length > 1 ? 's' : ''} retrouvée${t.citations.length > 1 ? 's' : ''}` : 'inchangé';
        constats.push({ ...base, gravite: 'ok', empreinte: l.empreinte, message: lu });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, ouvrier));
  constats.sort((a, b) => a.cle.localeCompare(b.cle));
  return { constats: [...constatsDeDates(registre), ...constats], empreintes, relus: aLire.length };
}

// Lancé seul : `npx tsx scripts/veille-aides.ts`, pour voir sans rien écrire.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { constats, relus } = await veillerAides({});
  for (const c of constats.filter((k) => k.gravite !== 'ok')) console.log(`${c.gravite === 'alerte' ? 'ALERTE' : 'à voir'}  ${c.nom}\n        ${c.message}\n        ${c.cle}`);
  console.log(`\n${relus} textes relus ; ${constats.filter((c) => c.gravite === 'alerte').length} alerte(s), ${constats.filter((c) => c.gravite === 'a-regarder').length} point(s) à voir.`);
}
