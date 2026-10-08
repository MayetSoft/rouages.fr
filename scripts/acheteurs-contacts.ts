/**
 * Les coordonnées de chaque acheteur, d'après l'annuaire de l'administration.
 *
 * Qui lit une échéance ou un avis de marché veut savoir à qui écrire : le
 * standard de la mairie, l'accueil de la communauté de communes. L'annuaire
 * de service-public.fr les publie, fiche par fiche, avec le SIRET de chaque
 * service — et le SIREN, ses neuf premiers chiffres, est la clé de tous les
 * fichiers de marchés.
 *
 * **Quelle fiche, quand un SIREN en a plusieurs.** Une commune en a souvent
 * plusieurs : la mairie et ses mairies déléguées, les mairies d'arrondissement
 * de Paris, Lyon et Marseille, parfois le CCAS ou les archives sous le même
 * SIREN. Le relevé du 8 octobre 2026 : 11 550 des 12 862 acheteurs suivis ont
 * au moins une fiche « mairie » ou « epci » ; 392 SIREN portent plusieurs
 * mairies. On retient la fiche de la mairie principale — nom en « Mairie - »,
 * pas une mairie déléguée ni annexe — ou celle de l'intercommunalité, et à
 * égalité le plus petit SIRET : c'est le siège (« Mairie - Lyon - Mairie
 * centrale », 00011, avant les neuf arrondissements). Une fiche d'un autre
 * type n'est pas reprise : le téléphone des archives n'est pas celui de
 * l'acheteur.
 *
 * **Ce qui n'est pas repris : une adresse qui nomme une personne.** Ce sont
 * des coordonnées d'institutions, mais une petite mairie publie parfois
 * l'adresse de sa secrétaire — « prenom.nom@orange.fr ». La règle des noms
 * (`CLAUDE.md`) ne l'autorise pas. Le filtre lit les prénoms des conseillers
 * municipaux de tout le pays, déjà dans `dep/XX-conseils.json` — près de dix
 * mille prénoms distincts — et écarte une adresse dont un morceau est un
 * prénom, sauf s'il appartient au nom de la collectivité ou à son domaine
 * (« Saint-Christophe ») ou en est le sigle. Sans ces fichiers, il ne garde
 * qu'une adresse faite de mots institutionnels et du nom de la collectivité.
 * Au relevé du 8 octobre 2026 : 10 adresses écartées sur les 11 489 des
 * fiches retenues, toutes faites d'un prénom ; « bienvenue@… », qui est aussi
 * le nom d'un conseiller, est dans la liste des mots d'institution.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ANNUAIRE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration';

/** Les coordonnées publiées d'un acheteur, telles que les fichiers nationaux les portent. */
export interface Contact {
  /** Le premier numéro de la fiche, tel qu'écrit : « 04 70 59 70 52 ». */
  tel?: string;
  courriel?: string;
  /** Le premier site de la fiche. */
  site?: string;
  /** La fiche sur l'annuaire de service-public.fr. */
  fiche?: string;
}

/** La fiche retenue pour un SIREN, avant le filtre des adresses nominatives. */
export interface FicheAnnuaire {
  nom: string;
  tel?: string;
  /** Toutes les adresses de la fiche, dans l'ordre : certaines en portent deux, séparées d'un point-virgule. */
  courriels: string[];
  site?: string;
  fiche?: string;
}

interface LigneAnnuaire {
  nom: string | null;
  siret: string | null;
  pivot: string | null;
  telephone: string | null;
  adresse_courriel: string | null;
  site_internet: string | null;
  url_service_public: string | null;
}

/** Les champs imbriqués de l'annuaire arrivent en JSON encodé dans une chaîne. */
function imbrique<T>(brut: unknown): T[] {
  if (typeof brut !== 'string' || brut === '') return [];
  try {
    const v: unknown = JSON.parse(brut);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** 0 : la mairie principale ou l'intercommunalité ; 1 : une autre mairie ; rien : une autre fiche. */
function rang(l: LigneAnnuaire): number | null {
  const types = imbrique<{ type_service_local?: string }>(l.pivot).map((p) => p.type_service_local);
  const nom = (l.nom ?? '').trim();
  if (types.includes('epci')) return 0;
  if (types.includes('mairie')) {
    return /^Mairie - /.test(nom) && !/arrondissement/i.test(nom) ? 0 : 1;
  }
  return null;
}

/**
 * Une fiche par acheteur suivi, lue une fois dans l'annuaire entier : 55 000
 * fiches portent un SIRET, 28 Mo, huit secondes. Seules les mairies et les
 * intercommunalités sont demandées.
 */
export async function collecterContacts(
  json: <T>(url: string) => Promise<T>,
  sirens: Set<string>,
  dire: (m: string) => void,
): Promise<Map<string, FicheAnnuaire>> {
  const lignes = await json<LigneAnnuaire[]>(
    `${ANNUAIRE}/exports/json?select=nom,siret,pivot,telephone,adresse_courriel,site_internet,url_service_public` +
      `&where=${encodeURIComponent('siret is not null and (pivot like "mairie" or pivot like "epci")')}`,
  );
  const meilleures = new Map<string, { rang: number; siret: string; l: LigneAnnuaire }>();
  for (const l of lignes) {
    const siret = String(l.siret ?? '').replace(/\s/g, '');
    if (!/^\d{14}$/.test(siret)) continue;
    const siren = siret.slice(0, 9);
    if (!sirens.has(siren)) continue;
    const r = rang(l);
    if (r === null) continue;
    const deja = meilleures.get(siren);
    if (!deja || r < deja.rang || (r === deja.rang && siret < deja.siret)) meilleures.set(siren, { rang: r, siret, l });
  }
  const fiches = new Map<string, FicheAnnuaire>();
  for (const [siren, { l }] of meilleures) {
    const tel = imbrique<{ valeur?: string }>(l.telephone)
      .map((t) => (t.valeur ?? '').trim())
      .find((t) => t !== '');
    const site = imbrique<{ valeur?: string }>(l.site_internet)
      .map((t) => (t.valeur ?? '').trim())
      .find((t) => /^https?:\/\//i.test(t));
    const courriels = (l.adresse_courriel ?? '')
      .split(/[;,\s]+/)
      .map((c) => c.trim().replace(/\.+$/, ''))
      .filter((c) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c));
    const fiche = /^https:\/\//.test(l.url_service_public ?? '') ? l.url_service_public! : undefined;
    fiches.set(siren, {
      nom: (l.nom ?? '').trim(),
      ...(tel ? { tel } : {}),
      courriels,
      ...(site ? { site } : {}),
      ...(fiche ? { fiche } : {}),
    });
  }
  dire(
    `  annuaire de l'administration : ${lignes.length.toLocaleString('fr-FR')} fiches de mairie ou d'intercommunalité lues, ` +
      `${fiches.size.toLocaleString('fr-FR')} acheteurs sur ${sirens.size.toLocaleString('fr-FR')} en ont une.`,
  );
  return fiches;
}

/** Minuscules, sans accents, sans rien d'autre que des lettres et des chiffres. */
function plier(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Les mots d'une adresse d'institution. Certains sont aussi des prénoms ou
 * des noms de conseillers — « Bienvenue » en est un — et ne disent pourtant
 * personne.
 */
const INSTITUTIONNELS = new Set(
  (
    'mairie maire accueil secretariat secretaire secr sec commune communes communaute contact contacts general generale ' +
    'generales gen ville courrier service services direction cabinet guichet dgs dga dgst administration administratif ' +
    'agglo unique affaires etat civil etatcivil site public cdc info infos population hdv cne bienvenue mail email ' +
    'webmaster standard reception communication urbanisme technique techniques social scolaire finances comptabilite ' +
    'rh nous contacter direct courriers secretariatmairie hotel ville territoire'
  ).split(' '),
);

const ARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'sur', 'sous', 'a', 'aux']);

/** Le sigle d'un nom : « Communauté d'Agglomération - La Riviéra du Levant » donne « carl ». */
function sigle(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 0 && !ARTICLES.has(m) && m !== 'mairie')
    .map((m) => m[0])
    .join('');
}

const prenomsLus = new Map<string, Set<string>>();

/** Les prénoms des conseillers municipaux de tout le pays, pliés, de trois lettres au moins. */
export function prenomsConnus(sortie: string): Set<string> {
  const deja = prenomsLus.get(sortie);
  if (deja) return deja;
  const prenoms = new Set<string>();
  const dossier = join(sortie, 'dep');
  if (existsSync(dossier)) {
    for (const f of readdirSync(dossier)) {
      if (!/-conseils\.json$/.test(f)) continue;
      try {
        const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as {
          c?: Record<string, { m?: unknown[][] }>;
        };
        for (const c of Object.values(d.c ?? {})) {
          for (const m of c.m ?? []) {
            for (const p of String(m[0] ?? '').split(/[-\s]+/)) {
              const x = plier(p);
              if (x.length >= 3) prenoms.add(x);
            }
          }
        }
      } catch {
        // Un fichier illisible retire ses prénoms de la liste, rien de plus.
      }
    }
  }
  prenomsLus.set(sortie, prenoms);
  return prenoms;
}

/**
 * Une adresse qui pourrait nommer quelqu'un. Avec la liste des prénoms : un
 * morceau de l'adresse est un prénom qui n'appartient ni au nom de la
 * collectivité, ni à son domaine, ni à son sigle. Sans elle : un morceau qui
 * n'est ni un mot d'institution, ni dans le nom, ni le sigle.
 */
export function nominative(courriel: string, nomFiche: string, prenoms: Set<string>): boolean {
  const [local, domaine = ''] = courriel.toLowerCase().split('@');
  const contexte = plier(`${nomFiche} ${domaine}`);
  const s = sigle(nomFiche);
  const morceaux = local
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^a-z]+/)
    .filter((m) => m.length >= 3);
  return morceaux.some((m) => {
    if (INSTITUTIONNELS.has(m) || contexte.includes(m) || m === s) return false;
    return prenoms.size > 0 ? prenoms.has(m) : true;
  });
}

/** Les coordonnées publiables d'une fiche : la première adresse qui ne nomme personne. */
export function contactDe(f: FicheAnnuaire, prenoms: Set<string>): Contact | undefined {
  const courriel = f.courriels.find((c) => !nominative(c, f.nom, prenoms));
  const c: Contact = {
    ...(f.tel ? { tel: f.tel } : {}),
    ...(courriel ? { courriel } : {}),
    ...(f.site ? { site: f.site } : {}),
    ...(f.fiche ? { fiche: f.fiche } : {}),
  };
  return Object.keys(c).length > 0 ? c : undefined;
}
