/**
 * Les avis de marché du BOAMP : ce qui est ouvert à candidature en ce moment.
 *
 * Les données essentielles disent ce qui a été attribué, l'échéancier ce qui
 * va se rejouer ; le Bulletin officiel des annonces des marchés publics dit ce
 * qu'un acheteur demande aujourd'hui, et jusqu'à quand on peut répondre. La
 * DILA en publie chaque avis sur Opendatasoft, sous Licence Ouverte (fiche
 * « BOAMP » de data.gouv.fr, publiée par le Premier ministre ; la fiche
 * Opendatasoft, elle, n'en précise aucune).
 *
 * **Seulement les avis de marché.** Le jeu mêle toutes les natures : au 8
 * octobre 2026, sur soixante jours, 12 221 avis de marché, 4 666 résultats,
 * 794 rectificatifs, 23 annulations, et quelques avis d'information, de
 * modification ou de transparence. Sont retenus les avis de marché
 * (`nature = APPEL_OFFRE`) dans leur version initiale. Les versions suivantes
 * ne font pas un avis de plus, elles corrigent le premier :
 *
 * - un avis européen rectifié (eForms) est republié en entier, sous la même
 *   nature et l'état `RECTIFICATIF` : c'est sa date limite qui vaut ;
 * - un avis national est rectifié par un avis à part, de nature
 *   `RECTIFICATIF`, qui dit en toutes lettres ce qui change. Sur les 794 du
 *   8 octobre 2026, la nouvelle date limite se lit dans 474 — la forme
 *   régulière « Au lieu de 06/11/2026 à 12h00, lire 13/11/2026 à 12h00 », et
 *   les phrases qui la disent sans détour (`limiteRectifiee`) ; 149 ne la
 *   touchent pas ; 171 en parlent sans qu'on sache la lire, et la date de
 *   l'avis devient alors inconnue (`null`) : mieux vaut ne pas la donner que
 *   donner l'ancienne ;
 * - une annulation retire l'avis.
 *
 * Les versions d'un même avis se retrouvent par `annonce_lie`, et à défaut
 * par l'identifiant de procédure eForms (`contractfolderid`).
 *
 * **Le rattachement à l'acheteur, prudent.** Le champ `donnees` porte souvent
 * le SIRET de l'acheteur : `codeIdentificationNational` dans les avis
 * nationaux, l'identifiant légal de l'organisation acheteuse dans les avis
 * eForms. C'est le premier critère. À défaut, le nom : plié, avec ses formes
 * courantes réduites (« commune de », « communauté de communes »…), et comparé
 * aux acheteurs suivis du même département — retenu seulement s'il désigne un
 * seul acheteur, exactement. Pas de ressemblance approchée : un avis manqué
 * vaut mieux qu'un avis prêté à la mauvaise commune.
 *
 * **Ce que la collecte télécharge.** La liste légère de soixante jours —
 * toutes natures utiles, sans `donnees` : 13 000 lignes, 7 Mo — chaque fois,
 * pour recalculer les dates limites et les annulations ; les rectificatifs
 * nationaux avec leur texte (1 Mo) ; et `donnees` seulement pour les avis
 * ouverts parus depuis la collecte précédente, moins deux jours. Le premier
 * passage lit les soixante jours.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BOAMP = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp';

/** La fenêtre d'`avis.json`, en jours de parution. */
export const AVIS_JOURS = 60;

/** Les jours relus en plus, d'une collecte à la suivante : une parution du soir arrive le lendemain. */
const RECOUVREMENT_JOURS = 2;

/** Combien d'avis par demande de `donnees` : la liste des identifiants tient dans l'URL. */
const PAR_LOT = 100;

/** Une version d'avis, telle que la liste légère la donne. */
interface LigneBoamp {
  idweb: string;
  nature: string | null;
  etat: string | null;
  famille: string | null;
  dateparution: string | null;
  datelimitereponse: string | null;
  nomacheteur: string | null;
  code_departement: string[] | string | null;
  objet: string | null;
  type_marche: string[] | string | null;
  url_avis: string | null;
  annonce_lie: string[] | string | null;
  contractfolderid: string | null;
}

/** Un avis de marché encore ouvert, avant son rattachement. */
export interface AvisOuvert {
  id: string;
  date: string;
  /** AAAA-MM-JJTHH:MM, heure de Paris ; `null` quand on ne la connaît pas ou plus. */
  limite: string | null;
  nom: string;
  deps: string[];
  objet: string;
  type?: string;
  url: string;
  /** Ce que `donnees` a donné, pour les avis lus cette fois-ci. */
  sirets?: string[];
  cpv?: string;
}

export interface AvisCollectes {
  maj: string;
  /** Premier jour de parution couvert. */
  depuis: string;
  /** Premier jour dont `donnees` a été lu cette fois-ci ; avant, on s'en remet au fichier précédent. */
  relu: string;
  ouverts: AvisOuvert[];
}

/** Ce qu'`avis.json` porte pour chaque avis. */
export interface Avis {
  id: string;
  a: string;
  date: string;
  limite: string | null;
  objet: string;
  cpv?: string;
  type?: string;
  url: string;
  par: 'siret' | 'nom';
}

const PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Un instant, en heure de Paris : « 2026-11-09T11:00:00+00:00 » donne « 2026-11-09T12:00 ». */
export function heureDeParis(iso: string | number | Date | null): string | null {
  if (iso === null) return null;
  const t = iso instanceof Date ? iso.getTime() : typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const p = Object.fromEntries(PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function liste<T>(v: T | T[] | null | undefined): T[] {
  return v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** Le texte d'un nœud XML converti : une chaîne, ou `{ "#text": … }`. */
function texte(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && '#text' in v) return String((v as { '#text': unknown })['#text']);
  return '';
}

/** Les entités HTML que le BOAMP laisse dans ses noms : « l&#039;achat ». */
function desHtml(s: string): string {
  return s
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const MOIS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

/** Ce qui annonce la date limite dans un rectificatif. */
const SUJET = /limites?|remise des (?:offres|plis|candidatures)|r[ée]ception des (?:offres|plis|candidatures)|d[ée]p[ôo]t des (?:offres|plis)/gi;

/**
 * Ce qui annonce la nouvelle date, puis la date et l'heure : « lire le
 * 13/11/2026 à 12h00 », « reportée au jeudi 15 octobre 2026 à 14 heures »,
 * « Nouvelle date : 6/10/26 à 12h00 ». Sans année ou sans heure, rien.
 */
const NOUVELLE = new RegExp(
  String.raw`(\blire|report[ée]e?s?|repouss[ée]e?s?|prolong[ée]e?s?|d[ée]cal[ée]e?s?|port[ée]e?s?|modifi[ée]e?s?|nouvelle date[^:\n]{0,40}:|d[ée]sormais)` +
    String.raw`(?:\s|:|"|\\"|au\b|le\b|jusqu'au\b)*` +
    String.raw`(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?` +
    String.raw`(\d{1,2})(?:er)?\s*[/.\-\s]\s*(\d{1,2}|janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s*[/.\-\s]\s*(\d{4}|\d{2})\b` +
    String.raw`[\s,]*(?:à|a|-|jusqu'à|avant)?\s*(\d{1,2})\s*(?:h|:|heures?)\s*(\d{2})?`,
  'gi',
);

/**
 * La nouvelle date limite d'un rectificatif national. Une chaîne : la date
 * lue. `null` : il parle de la date limite sans qu'on sache la lire. Rien : il
 * ne la change pas.
 *
 * Le texte est libre — 794 rectificatifs en soixante jours, une forme
 * régulière pour un tiers d'entre eux, des phrases pour le reste. On lit la
 * forme régulière (« Au lieu de 06/11/2026 à 12h00, lire 13/11/2026 à
 * 12h00 ») et les phrases qui annoncent la nouvelle date par un verbe
 * (« reportée au », « repoussée au », « lire ») à moins de 250 caractères de
 * ce qui nomme la date limite ; jamais celle de « au lieu de lire », ni
 * « initialement fixée au », qui sont l'ancienne. Une date sans année ni
 * heure n'est pas devinée, une heure « locale » d'outre-mer non plus.
 */
export function limiteRectifiee(donnees: string): string | null | undefined {
  const i = donnees.indexOf('"infosRectif"');
  if (i === -1) return undefined;
  const r = donnees.slice(i);
  // La forme structurée : l'heure de Paris, ou UTC quand elle finit par « Z ».
  const iso = /"rubDelais"\s*:\s*"ReceptionOffres"\s*,\s*(?:"auLieuDeDate"\s*:\s*"[^"]*"\s*,\s*)?"lireDate"\s*:\s*"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})[^"]*?(Z?)"/.exec(r);
  if (iso) return iso[3] ? heureDeParis(`${iso[1]}T${iso[2]}:00Z`) : `${iso[1]}T${iso[2]}`;
  const sujets = [...r.matchAll(SUJET)].map((m) => m.index!);
  if (sujets.length === 0) return undefined;
  for (const m of r.matchAll(NOUVELLE)) {
    // « Au lieu de lire : 30/09/2026 » donne l'ancienne date, « Il faut lire : » la nouvelle.
    if (/au lieu de\s*$/i.test(r.slice(Math.max(0, m.index! - 15), m.index!))) continue;
    const sujet = sujets.filter((s) => s <= m.index!).pop();
    if (sujet === undefined || m.index! - sujet > 250) continue;
    if (/visite|compl[ée]mentaires|questions/i.test(r.slice(sujet, m.index!))) continue;
    // « 12 heures locales (10h00 France continentale) » : l'heure de Paris n'est pas celle qu'on a lue.
    if (/^\s*(?:heures?\s*)?locales?/i.test(r.slice(m.index! + m[0].length, m.index! + m[0].length + 20))) continue;
    const jour = Number(m[2]);
    const mot = m[3].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const mois = /^\d+$/.test(mot) ? Number(mot) : MOIS[mot];
    const an = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    const heure = Number(m[5]);
    const minute = Number(m[6] ?? '0');
    if (!mois || mois > 12 || jour < 1 || jour > 31 || heure > 23 || minute > 59 || an < 2000) continue;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${an}-${p(mois)}-${p(jour)}T${p(heure)}:${p(minute)}`;
  }
  return null;
}

/**
 * Le SIRET de l'acheteur et le CPV principal, lus dans `donnees`.
 *
 * eForms : les organisations sont décrites une fois, et l'acheteur désigné par
 * son identifiant (`ORG-0002`) dans `ContractingParty` — l'éditeur de la
 * plateforme et le tribunal administratif y figurent aussi, et ne sont pas
 * l'acheteur. Avis national : `organisme.codeIdentificationNational`. Autre
 * forme : tout nombre de quatorze chiffres.
 */
export function lireDonnees(brut: string): { sirets: string[]; cpv?: string } {
  const sirets: string[] = [];
  const garder = (v: unknown) => {
    const s = texte(v).replace(/\s/g, '');
    if (/^\d{14}$/.test(s) && !sirets.includes(s)) sirets.push(s);
  };
  let doc: Record<string, unknown> | null = null;
  try {
    doc = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    doc = null;
  }
  type Noeud = Record<string, unknown> | undefined;
  const eforms = doc?.EFORMS as Record<string, Noeud> | undefined;
  const fns = doc?.FNSimple as { organisme?: { codeIdentificationNational?: unknown } } | undefined;
  if (eforms) {
    const racine = Object.values(eforms)[0] as Noeud;
    const acheteurs = new Set(
      liste(racine?.['cac:ContractingParty'] as Noeud[]).flatMap((cp) =>
        liste(cp?.['cac:Party'] as Noeud[]).map((p) => texte((p?.['cac:PartyIdentification'] as Noeud)?.['cbc:ID'])),
      ),
    );
    const ext = liste(
      (racine?.['ext:UBLExtensions'] as Noeud)?.['ext:UBLExtension'] as Noeud[],
    ).map((e) => ((e?.['ext:ExtensionContent'] as Noeud)?.['efext:EformsExtension'] as Noeud)?.['efac:Organizations'] as Noeud);
    for (const orgs of ext) {
      for (const o of liste(orgs?.['efac:Organization'] as Noeud[])) {
        const c = o?.['efac:Company'] as Noeud;
        if (!acheteurs.has(texte((c?.['cac:PartyIdentification'] as Noeud)?.['cbc:ID']))) continue;
        for (const le of liste(c?.['cac:PartyLegalEntity'] as Noeud[])) garder(le?.['cbc:CompanyID']);
      }
    }
  } else if (fns) {
    garder(fns.organisme?.codeIdentificationNational);
  } else {
    for (const m of brut.matchAll(/(?<!\d)\d{14}(?!\d)/g)) garder(m[0]);
  }
  const cpv =
    /"cac:MainCommodityClassification"\s*:\s*\{\s*"cbc:ItemClassificationCode"\s*:\s*\{[^}]*?"#text"\s*:\s*"(\d{8})/.exec(brut)?.[1] ??
    /"classPrincipale"\s*:\s*"(\d{8})/.exec(brut)?.[1];
  return { sirets, ...(cpv ? { cpv } : {}) };
}

const TYPES = new Set(['SERVICES', 'TRAVAUX', 'FOURNITURES']);

/** Le BOAMP écrit « 6 » pour les Alpes-Maritimes et « 20A » pour la Corse-du-Sud ; le site, « 06 » et « 2A ». */
function departement(code: string): string {
  const c = code.trim().toUpperCase();
  if (/^\d$/.test(c)) return `0${c}`;
  if (/^20[AB]$/.test(c)) return `2${c[2]}`;
  return c;
}

function jours(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

/** La date de la collecte précédente, lue dans `avis.json` ; rien au premier passage. */
export function lireAvisPrecedents(sortie: string): { maj: string; avis: Avis[] } | null {
  const chemin = join(sortie, 'avis.json');
  if (!existsSync(chemin)) return null;
  try {
    const d = JSON.parse(readFileSync(chemin, 'utf8')) as { maj?: string; avis?: Avis[] };
    if (!d.maj || !Array.isArray(d.avis)) return null;
    return { maj: d.maj, avis: d.avis };
  } catch {
    return null;
  }
}

/**
 * Les avis de marché ouverts parus depuis soixante jours, avec le SIRET et le
 * CPV de ceux qu'on n'a pas encore lus.
 */
export async function collecterAvis(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
  sortie?: string,
): Promise<AvisCollectes> {
  const maj = new Date().toISOString().slice(0, 10);
  const depuis = jours(maj, -AVIS_JOURS);
  const precedent = sortie ? lireAvisPrecedents(sortie) : null;
  const relu = precedent && jours(precedent.maj, -RECOUVREMENT_JOURS) > depuis ? jours(precedent.maj, -RECOUVREMENT_JOURS) : depuis;

  // 1. Toutes les versions de la fenêtre, sans `donnees`.
  const lignes = await json<LigneBoamp[]>(
    `${BOAMP}/exports/json?select=idweb,nature,etat,famille,dateparution,datelimitereponse,nomacheteur,code_departement,objet,type_marche,url_avis,annonce_lie,contractfolderid` +
      `&where=${encodeURIComponent(`nature in ("APPEL_OFFRE","RECTIFICATIF","ANNULATION") and dateparution>=date'${depuis}'`)}`,
  );
  if (lignes.length === 0) throw new Error('BOAMP : aucune ligne, le jeu a changé de forme');

  // 2. Le texte des rectificatifs nationaux : c'est là qu'est la nouvelle date limite.
  const rectifs = await json<{ idweb: string; donnees: string | null }[]>(
    `${BOAMP}/exports/json?select=idweb,donnees` +
      `&where=${encodeURIComponent(`nature="RECTIFICATIF" and dateparution>=date'${depuis}'`)}`,
  );
  const limitesRectifiees = new Map<string, string | null>();
  let octetsRectifs = 0;
  for (const r of rectifs) {
    octetsRectifs += (r.donnees ?? '').length;
    const l = limiteRectifiee(r.donnees ?? '');
    if (l !== undefined) limitesRectifiees.set(r.idweb, l);
  }

  // 3. Les versions d'un même avis, réunies.
  const parId = new Map(lignes.map((l) => [l.idweb, l]));
  const parent = new Map<string, string>();
  const racine = (id: string): string => {
    let r = id;
    while (parent.has(r)) r = parent.get(r)!;
    return r;
  };
  const unir = (a: string, b: string) => {
    const [x, y] = [racine(a), racine(b)];
    if (x !== y) parent.set(x, y);
  };
  const parProcedure = new Map<string, string[]>();
  for (const l of lignes) {
    if (l.nature !== 'APPEL_OFFRE' || !l.contractfolderid) continue;
    parProcedure.set(l.contractfolderid, [...(parProcedure.get(l.contractfolderid) ?? []), l.idweb]);
  }
  const initial = (l: LigneBoamp) => l.nature === 'APPEL_OFFRE' && l.etat === 'INITIAL';
  for (const l of lignes) {
    if (initial(l)) continue;
    const lies = liste(l.annonce_lie).filter((id) => parId.has(id));
    for (const id of lies) unir(l.idweb, id);
    if (lies.length === 0 && l.contractfolderid) for (const id of parProcedure.get(l.contractfolderid) ?? []) unir(l.idweb, id);
  }
  const groupes = new Map<string, LigneBoamp[]>();
  for (const l of lignes) {
    const g = racine(l.idweb);
    groupes.set(g, [...(groupes.get(g) ?? []), l]);
  }

  // 4. Pour chaque avis initial : sa date limite, rectifications comprises.
  const maintenant = heureDeParis(Date.now())!;
  const ouverts: AvisOuvert[] = [];
  let annules = 0;
  let passes = 0;
  let rectifies = 0;
  for (const versions of groupes.values()) {
    if (versions.some((v) => v.nature === 'ANNULATION' || v.etat === 'ANNULATION')) {
      annules += versions.filter(initial).length;
      continue;
    }
    const ordre = [...versions].sort(
      (a, b) => (a.dateparution ?? '').localeCompare(b.dateparution ?? '') || a.idweb.localeCompare(b.idweb),
    );
    for (const l of ordre) {
      if (!initial(l) || !l.dateparution) continue;
      let limite = heureDeParis(l.datelimitereponse);
      for (const v of ordre) {
        if (v === l || (v.dateparution ?? '') < l.dateparution) continue;
        if (v.nature === 'APPEL_OFFRE' && v.etat === 'RECTIFICATIF' && v.datelimitereponse) {
          limite = heureDeParis(v.datelimitereponse);
          rectifies++;
        } else if (v.nature === 'RECTIFICATIF' && limitesRectifiees.has(v.idweb)) {
          limite = limitesRectifiees.get(v.idweb)!;
          rectifies++;
        }
      }
      if (limite !== null && limite <= maintenant) {
        passes++;
        continue;
      }
      const objet = desHtml(l.objet ?? '').replace(/\s+/g, ' ').trim();
      const type = liste(l.type_marche).find((t) => TYPES.has(t));
      ouverts.push({
        id: l.idweb,
        date: l.dateparution.slice(0, 10),
        limite,
        nom: desHtml(l.nomacheteur ?? '').trim(),
        deps: liste(l.code_departement).map(departement),
        objet,
        ...(type ? { type } : {}),
        url: l.url_avis ?? `https://www.boamp.fr/pages/avis/?q=idweb:${l.idweb}`,
      });
    }
  }

  // 5. `donnees` pour les avis ouverts parus depuis la collecte précédente.
  const aLire = ouverts.filter((a) => a.date >= relu);
  const parIdOuvert = new Map(aLire.map((a) => [a.id, a]));
  let octets = 0;
  for (let i = 0; i < aLire.length; i += PAR_LOT) {
    const ids = aLire.slice(i, i + PAR_LOT).map((a) => `"${a.id}"`);
    const lus = await json<{ idweb: string; donnees: string | null }[]>(
      `${BOAMP}/exports/json?select=idweb,donnees&where=${encodeURIComponent(`idweb in (${ids.join(',')})`)}`,
    );
    for (const r of lus) {
      const a = parIdOuvert.get(r.idweb);
      if (!a || !r.donnees) continue;
      octets += r.donnees.length;
      const { sirets, cpv } = lireDonnees(r.donnees);
      a.sirets = sirets;
      if (cpv) a.cpv = cpv;
    }
  }
  const mo = (n: number) => (n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  dire(
    `  BOAMP : ${lignes.length.toLocaleString('fr-FR')} versions d'avis parues depuis le ${depuis} ; ` +
      `${ouverts.length.toLocaleString('fr-FR')} avis de marché ouverts (${passes.toLocaleString('fr-FR')} clos, ` +
      `${annules.toLocaleString('fr-FR')} annulés, ${rectifies.toLocaleString('fr-FR')} dates limites rectifiées) ; ` +
      `donnees relues pour ${aLire.length.toLocaleString('fr-FR')} parus depuis le ${relu} (${mo(octets)} Mo, ` +
      `plus ${mo(octetsRectifs)} Mo de rectificatifs).`,
  );
  return { maj, depuis, relu, ouverts };
}

/**
 * Un nom d'acheteur réduit à ce qui le distingue : minuscules, sans accents ni
 * ponctuation, « saint » écrit en entier, et les formes courantes ramenées à
 * une seule — « Commune du Mayet-de-Montagne » et « Le Mayet-de-Montagne »
 * donnent toutes deux « le mayet de montagne » ; « Communauté de communes du
 * Pays de Fayence » et « CC du Pays de Fayence », « cc pays de fayence ».
 */
export function plierNom(nom: string): string {
  let s = desHtml(nom)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  s = ` ${s} `.replace(/ st (?=\S)/g, ' saint ').replace(/ ste (?=\S)/g, ' sainte ').trim();
  s = s
    .replace(/^(?:commune nouvelle|commune|ville|mairie) du /, 'le ')
    .replace(/^(?:commune nouvelle|commune|ville|mairie) des /, 'les ')
    .replace(/^(?:commune nouvelle|commune|ville|mairie) (?:de |d )/, '')
    .replace(/^communaute de communes /, 'cc ')
    .replace(/^communaute d agglomeration /, 'ca ')
    .replace(/^communaute urbaine /, 'cu ')
    .replace(/^syndicat mixte /, 'sm ')
    .replace(/^syndicat intercommunal a vocation multiple /, 'sivom ')
    .replace(/^syndicat intercommunal a vocation unique /, 'sivu ')
    .replace(/^syndicat intercommunal /, 'si ')
    .replace(/^(cc|ca|cu|sm|si|sivom|sivu) (?:de la |de l |du |des |de |d )/, '$1 ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Les clés sous lesquelles un acheteur suivi se reconnaît : son nom plié, et
 * le sigle qu'il porte entre parenthèses quand il en a un d'au moins quatre
 * lettres (« SYMEVAD »). Une intercommunalité se reconnaît aussi sans « CA » ni
 * « CC » quand son nom dit encore ce qu'elle est — « Vichy Communauté »,
 * « Rodez Agglomération » — mais pas « Pays de Fayence », qui est aussi le nom
 * d'un pays, autre structure.
 */
export function clesAcheteur(nom: string): string[] {
  const cles = new Set<string>();
  const plie = plierNom(nom);
  if (plie) cles.add(plie);
  const nu = /^(?:cc|ca|cu) (.+)$/.exec(plie)?.[1];
  if (nu && /\b(?:communaute|agglomeration|agglo|metropole)\b/.test(nu)) cles.add(nu);
  for (const m of desHtml(nom).matchAll(/\(([^)]*)\)/g)) {
    const s = plierNom(m[1]);
    if (/^[a-z0-9]{4,}$/.test(s) && /[a-z]/.test(s)) cles.add(s);
  }
  return [...cles];
}

/**
 * Le rattachement de chaque avis ouvert à un acheteur suivi, et la fusion avec
 * les avis déjà lus : un avis dont `donnees` n'a pas été relu garde le
 * rattachement et le CPV du fichier précédent. Un avis paru avant `relu` et
 * absent de ce fichier y était déjà absent : il n'avait pas d'acheteur suivi.
 */
export function rattacherAvis(
  collectes: AvisCollectes,
  acheteurs: Map<string, { nom: string | null; deps: string[] }>,
  precedents: Avis[],
  /** Les noms des départements pliés : « Mayenne » est aussi une commune de la Mayenne. */
  departements: Set<string>,
  /** Les acheteurs qui ne se rattachent que par leur SIRET : leur nom n'est pas celui d'une collectivité. */
  parSiretSeulement: Set<string> = new Set(),
): { avis: Avis[]; parSiret: number; parNom: number; ambigus: number } {
  const index = new Map<string, Map<string, Set<string>>>();
  for (const [siren, a] of acheteurs) {
    if (!a.nom || parSiretSeulement.has(siren)) continue;
    for (const dep of a.deps) {
      const d = index.get(dep) ?? new Map<string, Set<string>>();
      for (const cle of clesAcheteur(a.nom)) d.set(cle, (d.get(cle) ?? new Set()).add(siren));
      index.set(dep, d);
    }
  }
  const deja = new Map(precedents.map((a) => [a.id, a]));
  const avis: Avis[] = [];
  let parSiret = 0;
  let parNom = 0;
  let ambigus = 0;
  for (const o of collectes.ouverts) {
    let a: string | undefined;
    let par: Avis['par'] | undefined;
    let cpv = o.cpv;
    const p = deja.get(o.id);
    if (!o.sirets && p && acheteurs.has(p.a)) {
      a = p.a;
      par = p.par;
      cpv ??= p.cpv;
    } else if (o.sirets || o.date >= collectes.relu) {
      a = (o.sirets ?? []).map((s) => s.slice(0, 9)).find((s) => acheteurs.has(s));
      if (a) par = 'siret';
      else {
        const cle = plierNom(o.nom);
        const commune = /^(?:commune|ville|mairie)\b/i.test(o.nom.trim());
        if (cle && (commune || !departements.has(cle))) {
          const trouves = new Set<string>();
          for (const dep of o.deps) for (const s of index.get(dep)?.get(cle) ?? []) trouves.add(s);
          if (trouves.size === 1) {
            a = [...trouves][0];
            par = 'nom';
          } else if (trouves.size > 1) ambigus++;
        }
      }
    }
    if (!a || !par) continue;
    if (par === 'siret') parSiret++;
    else parNom++;
    avis.push({
      id: o.id,
      a,
      date: o.date,
      limite: o.limite,
      objet: o.objet,
      ...(cpv ? { cpv } : {}),
      ...(o.type ? { type: o.type } : {}),
      url: o.url,
      par,
    });
  }
  avis.sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id));
  return { avis, parSiret, parNom, ambigus };
}
