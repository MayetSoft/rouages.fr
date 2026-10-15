/**
 * Les aides locales à la rénovation du logement : celles des régions, des
 * départements, des intercommunalités et des communes, qui s'ajoutent à
 * MaPrimeRénov'.
 *
 * Le registre est écrit à la main dans `contenu/aides-locales.yaml`, **depuis
 * les textes des collectivités** — délibération, règlement d'aides, convention
 * d'opération, formulaire — et jamais depuis une base tierce : la base « Aides
 * locales aux travaux » de l'ANIL sert à savoir quels textes lire, et chaque
 * aide renvoie à sa fiche, mais rien n'en est repris (ses mentions légales
 * interdisent la reproduction).
 *
 * Deux règles tiennent le registre :
 * - **pas de montant sans le texte qui le fixe** : chaque montant est suivi
 *   d'une citation mot pour mot de sa source ; sans texte trouvé, l'aide est
 *   listée avec son guichet, sans montant ;
 * - **le périmètre en communes** : une aide d'intercommunalité ne vaut souvent
 *   que dans le périmètre d'une opération (OPAH, centre-bourg) ; le registre
 *   le dit commune par commune, et c'est ce qui décide si l'aide s'affiche.
 *
 * Une aide vérifiée il y a plus d'un an s'affiche « à revérifier », jamais
 * comme en vigueur. Une aide fermée reste dans le registre, pour l'historique.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { nommeUnePersonne } from './civilites.ts';
import { communes, intercommunalite, intercommunalites, metaTerritoires } from './territoires.ts';

export const TRAVAUX = {
  energie: 'rénovation énergétique',
  isolation: 'isolation',
  chauffage: 'chauffage',
  adaptation: 'adaptation à l’âge ou au handicap',
  indigne: 'logement indigne ou très dégradé',
  vacance: 'logement vacant',
  facade: 'façades',
  toiture: 'toiture',
  'changement-usage': 'changement d’usage',
  diagnostic: 'diagnostics',
  accession: 'accession à la propriété',
  copropriete: 'copropriétés',
  autre: 'autres travaux',
} as const;

export const BENEFICIAIRES = {
  'proprietaire-occupant': 'propriétaires occupants',
  'proprietaire-bailleur': 'propriétaires bailleurs',
  copropriete: 'copropriétés',
  locataire: 'locataires',
  'primo-accedant': 'primo-accédants',
} as const;

export type Niveau = 'region' | 'departement' | 'epci' | 'commune';
export type Statut = 'ouverte' | 'fermee' | 'a_confirmer';

export interface SourceAide {
  titre: string;
  url: string;
  /** La date du texte (délibération, règlement), si elle est connue. */
  date_texte?: string | null;
  lu_le: string;
}

export interface AideLocale {
  id: string;
  porteur: {
    nom: string;
    siren: string;
    niveau: Niveau;
    /** Le code du territoire : région (INSEE), département, SIREN de l'intercommunalité, ou code INSEE de la commune. */
    code: string;
  };
  intitule: string;
  travaux: (keyof typeof TRAVAUX)[];
  beneficiaires: (keyof typeof BENEFICIAIRES)[];
  ressources: string | null;
  perimetre: {
    /** null : tout le territoire du porteur ; sinon les codes INSEE des communes où l'aide vaut. */
    communes: string[] | null;
    precision: string | null;
  };
  montant: string | null;
  conditions: { texte: string; citation: string; source: number }[];
  cumul: string | null;
  ouverture: string | null;
  fermeture: string | null;
  statut: Statut;
  demarche: { url: string | null; guichet: string | null; avant_travaux: boolean | null };
  sources: SourceAide[];
  /** La fiche de l'ANIL sur le même dispositif : un lien, rien de plus. */
  anil: string | null;
  verifie_le: string;
  /** Ce qui reste à vérifier : pour la relecture, jamais affiché. */
  notes?: string | null;
}

/** L'état affiché, à une date : le statut du registre, corrigé par les dates et l'âge de la vérification. */
export type Etat = 'ouverte' | 'fermee' | 'a_confirmer' | 'a_reverifier';

const JOUR = 86_400_000;
/** Au-delà, une vérification ne vaut plus pour dire qu'une aide est en vigueur. */
export const VERIFICATION_VALABLE_JOURS = 365;

const aujourdhui = () => new Date().toISOString().slice(0, 10);
/** Une date YAML arrive en `Date` ; on la garde en texte AAAA-MM-JJ. */
const enDate = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v : null);

export function etatAide(a: AideLocale, jour = aujourdhui()): Etat {
  if (a.statut === 'fermee' || (a.fermeture && a.fermeture < jour)) return 'fermee';
  if (a.ouverture && a.ouverture > jour) return 'a_confirmer';
  if (a.statut === 'a_confirmer') return 'a_confirmer';
  if ((Date.parse(jour) - Date.parse(a.verifie_le)) / JOUR > VERIFICATION_VALABLE_JOURS) return 'a_reverifier';
  return 'ouverte';
}

export const LIBELLE_ETAT: Record<Etat, string> = {
  ouverte: 'en vigueur',
  fermee: 'fermée',
  a_confirmer: 'à confirmer auprès du guichet',
  a_reverifier: 'à revérifier',
};

let cache: AideLocale[] | undefined;

/** Le registre, lu une fois ; les dates normalisées en texte. */
export function aidesLocales(racine = process.cwd()): AideLocale[] {
  if (cache) return cache;
  const brut = parse(readFileSync(join(racine, 'contenu', 'aides-locales.yaml'), 'utf8')) as { aides_locales?: AideLocale[] } | null;
  cache = (brut?.aides_locales ?? []).map((a) => ({
    ...a,
    ouverture: enDate(a.ouverture),
    fermeture: enDate(a.fermeture),
    verifie_le: enDate(a.verifie_le) ?? '',
    sources: (a.sources ?? []).map((s) => ({ ...s, date_texte: enDate(s.date_texte), lu_le: enDate(s.lu_le) ?? '' })),
    conditions: a.conditions ?? [],
    perimetre: { communes: a.perimetre?.communes ?? null, precision: a.perimetre?.precision ?? null },
  }));
  return cache;
}

let epciDeCommune: Map<string, Set<string>> | undefined;
/** Les intercommunalités à fiscalité propre de chaque commune. */
export function intercosDe(code: string): Set<string> {
  if (!epciDeCommune) {
    epciDeCommune = new Map();
    for (const e of intercommunalites()) {
      for (const c of e.communes) {
        if (!epciDeCommune.has(c.code)) epciDeCommune.set(c.code, new Set());
        epciDeCommune.get(c.code)!.add(e.siren);
      }
    }
  }
  return epciDeCommune.get(code) ?? new Set();
}

/** Vrai si la commune est sur le territoire du porteur. */
function surLeTerritoire(a: AideLocale, code: string, dep: string): boolean {
  switch (a.porteur.niveau) {
    case 'region':
      return metaTerritoires()?.codesRegion?.[dep] === a.porteur.code;
    case 'departement':
      return dep === a.porteur.code;
    case 'epci':
      return intercosDe(code).has(a.porteur.code);
    case 'commune':
      return code === a.porteur.code;
  }
}

/** Les aides qui valent dans cette commune, de l'échelon le plus proche au plus large. */
export function aidesDeCommune(code: string, dep: string, registre = aidesLocales()): AideLocale[] {
  const ordre: Record<Niveau, number> = { commune: 0, epci: 1, departement: 2, region: 3 };
  return registre
    .filter((a) => surLeTerritoire(a, code, dep) && (a.perimetre.communes === null || a.perimetre.communes.includes(code)))
    .sort((x, y) => ordre[x.porteur.niveau] - ordre[y.porteur.niveau] || x.intitule.localeCompare(y.intitule, 'fr'));
}

/** Les aides d'un porteur qui ne valent pas ici, faute d'être dans leur périmètre : à dire, pour qu'on ne les cherche pas. */
export function aidesHorsPerimetre(code: string, dep: string, registre = aidesLocales()): AideLocale[] {
  return registre.filter((a) => surLeTerritoire(a, code, dep) && a.perimetre.communes !== null && !a.perimetre.communes.includes(code));
}

/**
 * Le contrôle du registre, appelé par `npm run valider` : la forme, les
 * références, et les deux règles qui ne se négocient pas — pas de montant sans
 * citation, aucune personne nommée.
 */
export function controlerAidesLocales(registre = aidesLocales(), jour = aujourdhui()): { erreurs: string[]; avertissements: string[] } {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const codes = new Map(communes().map((c) => [c.code, c]));
  const vus = new Set<string>();
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const https = (u: unknown) => typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u);

  for (const a of registre) {
    const ou = `contenu/aides-locales.yaml → ${a.id ?? '(sans id)'}`;
    const err = (m: string) => erreurs.push(`${ou} : ${m}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.id ?? '')) err('identifiant en minuscules et tirets attendu');
    if (vus.has(a.id)) err('identifiant en double');
    vus.add(a.id);

    const p = a.porteur;
    if (!p?.nom || !/^\d{9}$/.test(p?.siren ?? '')) err('porteur : nom et SIREN à neuf chiffres attendus');
    if (p?.niveau === 'epci' && !intercommunalite(p.code)) err(`porteur : ${p.code} n'est pas une intercommunalité connue`);
    if (p?.niveau === 'epci' && p.code !== p.siren) err('porteur : le code d’une intercommunalité est son SIREN');
    if (p?.niveau === 'commune' && !codes.has(p.code)) err(`porteur : commune ${p.code} inconnue`);
    if (p?.niveau === 'departement' && !communes().some((c) => c.dep === p.code)) err(`porteur : département ${p.code} inconnu`);
    if (p?.niveau === 'region' && !Object.values(metaTerritoires()?.codesRegion ?? {}).includes(p.code)) err(`porteur : région ${p.code} inconnue`);
    if (!['region', 'departement', 'epci', 'commune'].includes(p?.niveau)) err('porteur : niveau inconnu');

    if (!a.intitule) err('intitulé manquant');
    if (!a.travaux?.length || a.travaux.some((t) => !(t in TRAVAUX))) err('travaux : liste vide ou valeur inconnue');
    if (!a.beneficiaires?.length || a.beneficiaires.some((b) => !(b in BENEFICIAIRES))) err('bénéficiaires : liste vide ou valeur inconnue');
    if (!['ouverte', 'fermee', 'a_confirmer'].includes(a.statut)) err('statut inconnu');

    for (const c of a.perimetre.communes ?? []) {
      const commune = codes.get(c);
      if (!commune) err(`périmètre : commune ${c} inconnue`);
      else if (p && !surLeTerritoire(a, c, commune.dep)) err(`périmètre : ${commune.nom} (${c}) n'est pas sur le territoire du porteur`);
    }
    if (a.perimetre.communes !== null && !a.perimetre.precision) err('périmètre restreint sans précision : dire ce qui le fixe');

    if (!a.sources?.length) err('aucune source');
    a.sources?.forEach((s, i) => {
      if (!s.titre || !https(s.url)) err(`source ${i + 1} : titre et adresse https attendus`);
      if (!date.test(s.lu_le ?? '')) err(`source ${i + 1} : date de lecture attendue`);
    });
    a.conditions.forEach((c, i) => {
      if (!c.texte || !c.citation) err(`condition ${i + 1} : texte et citation attendus`);
      if (!Number.isInteger(c.source) || c.source < 1 || c.source > (a.sources?.length ?? 0)) err(`condition ${i + 1} : source ${c.source} absente`);
    });
    // Pas de chiffre sans le texte qui le fixe.
    if (a.montant && !a.conditions.some((c) => c.citation)) err('un montant sans citation de sa source');
    // Chaque nombre du montant figure dans une citation : un maximum calculé n'est pas un chiffre du texte.
    if (a.montant) {
      const cite = a.conditions.map((c) => c.citation.replace(/[\s\u00a0\u202f]/g, '')).join(' ');
      for (const n of a.montant.match(/\d+(?:[\s\u00a0\u202f.]\d{3})*(?:,\d+)?/g) ?? []) {
        // Une année est une date, pas un montant.
        if (/^(19|20)\d\d$/.test(n)) continue;
        if (!cite.includes(n.replace(/[\s\u00a0\u202f]/g, ''))) err(`le montant porte « ${n} », qu’aucune citation ne porte`);
      }
    }

    if (a.demarche?.url && !https(a.demarche.url)) err('démarche : adresse https attendue');
    if (a.anil && !/^https:\/\/www\.anil\.org\//.test(a.anil)) err('anil : une adresse de www.anil.org attendue');
    for (const [nom, v] of [['ouverture', a.ouverture], ['fermeture', a.fermeture], ['verifie_le', a.verifie_le]] as const) {
      if (v !== null && !date.test(v)) err(`${nom} : date AAAA-MM-JJ attendue`);
    }
    if (!a.verifie_le) err('verifie_le manquant');
    // Un avertissement, pas une erreur : le site l'affiche déjà fermée, et une date qui passe ne doit pas casser le build.
    // La veille du lundi la signale deux mois avant.
    if (a.statut === 'ouverte' && a.fermeture && a.fermeture < jour) {
      avertissements.push(`${ou} : dite ouverte, mais fermée depuis le ${a.fermeture} — affichée fermée ; reconduite, ou à passer en « fermee » ?`);
    }
    if (a.verifie_le && (Date.parse(jour) - Date.parse(a.verifie_le)) / JOUR > VERIFICATION_VALABLE_JOURS) {
      avertissements.push(`${ou} : vérifiée le ${a.verifie_le}, il y a plus d'un an — affichée « à revérifier »`);
    }

    // Le contenu ne nomme aucune personne physique.
    const textes = [a.intitule, a.montant, a.ressources, a.cumul, a.perimetre.precision, a.demarche?.guichet, ...a.conditions.flatMap((c) => [c.texte, c.citation])];
    for (const t of textes) if (t && nommeUnePersonne(t)) err(`semble nommer une personne : « ${t.slice(0, 80)} »`);
  }
  return { erreurs, avertissements };
}
