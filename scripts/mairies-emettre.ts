/**
 * Les mairies de chaque commune — la mairie, et les mairies déléguées d'une
 * commune nouvelle —, d'après l'Annuaire de l'administration que la DILA
 * publie sur service-public.fr : adresse et coordonnées, téléphone, courriel,
 * site internet, horaires, et le lien vers la fiche de l'annuaire.
 *
 * Le site de la commune est aussi là où elle publie ce que Rouages ne collecte
 * pas encore partout : la liste des délibérations examinées en séance, mise
 * en ligne dans la semaine quand la commune a un site (article L2121-25 du
 * code général des collectivités territoriales), et ses actes, sauf pour une
 * commune de moins de 3 500 habitants qui a choisi l'affichage ou le papier
 * (article L2131-1).
 *
 * Ce sont des coordonnées de services publics, pas de personnes : le courriel
 * est celui de la mairie, tel que l'annuaire le diffuse. Une fiche que
 * l'annuaire ne diffuse pas (`statut_de_diffusion` faux) n'est pas reprise ;
 * seules les adresses web http et https le sont.
 *
 * Lancé seul — `npx tsx scripts/mairies-emettre.ts` —, il réécrit
 * `public/territoires/dep/XX-mairies.json`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeCommune, ecrireParDepartement, reportsDuDecoupage, telechargerSiAbsent } from './par-departement.ts';

export const ANNUAIRE =
  'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json' +
  '?select=nom,site_internet,telephone,adresse_courriel,adresse,plage_ouverture,commentaire_plage_ouverture,' +
  'url_service_public,code_insee_commune,statut_de_diffusion' +
  `&where=${encodeURIComponent('pivot like "mairie"')}`;

type Fiche = {
  nom: string | null;
  site_internet: string | null;
  telephone: string | null;
  adresse_courriel: string | null;
  adresse: string | null;
  plage_ouverture: string | null;
  commentaire_plage_ouverture: string | null;
  url_service_public: string | null;
  code_insee_commune: string | null;
  statut_de_diffusion: string | boolean | null;
};

/**
 * Une mairie : nom, site, téléphone, courriel, adresse, latitude, longitude,
 * horaires, précision sur les horaires, fiche de l'annuaire. Chaîne vide ou
 * null quand l'annuaire ne dit rien.
 */
export type Mairie = [string, string, string, string, string, number | null, number | null, string, string, string];

const liste = <T,>(champ: string | null): T[] => {
  if (!champ) return [];
  try {
    const v = JSON.parse(champ) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
};

/** La première adresse http(s) d'un champ `site_internet` (une liste JSON de { libelle, valeur }). */
export function adresseWeb(champ: string | null): string {
  for (const { valeur } of liste<{ valeur?: string }>(champ)) {
    try {
      const u = new URL((valeur ?? '').trim());
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {
      // Une adresse mal formée n'est pas reprise.
    }
  }
  return '';
}

const JOURS: Record<string, string> = {
  Lundi: 'lun.',
  Mardi: 'mar.',
  Mercredi: 'mer.',
  Jeudi: 'jeu.',
  Vendredi: 'ven.',
  Samedi: 'sam.',
  Dimanche: 'dim.',
};
const heure = (h: string | undefined) => {
  const m = /^(\d{2}):(\d{2})/.exec(h ?? '');
  if (!m) return '';
  return `${Number(m[1])} h${m[2] === '00' ? '' : ` ${m[2]}`}`;
};

/** « lun.–ven. 9 h–12 h, 14 h–17 h ; sam. 9 h–12 h ». */
export function horaires(champ: string | null): string {
  type Plage = {
    nom_jour_debut?: string;
    nom_jour_fin?: string;
    valeur_heure_debut_1?: string;
    valeur_heure_fin_1?: string;
    valeur_heure_debut_2?: string;
    valeur_heure_fin_2?: string;
    commentaire?: string;
  };
  return liste<Plage>(champ)
    .map((p) => {
      const debut = JOURS[p.nom_jour_debut ?? ''] ?? p.nom_jour_debut ?? '';
      const fin = JOURS[p.nom_jour_fin ?? ''] ?? p.nom_jour_fin ?? '';
      const jours = debut === fin || !fin ? debut : `${debut}–${fin}`;
      const tranches = [
        [p.valeur_heure_debut_1, p.valeur_heure_fin_1],
        [p.valeur_heure_debut_2, p.valeur_heure_fin_2],
      ]
        .map(([a, b]) => (heure(a) && heure(b) ? `${heure(a)}–${heure(b)}` : ''))
        .filter(Boolean)
        .join(', ');
      const note = (p.commentaire ?? '').trim().replace(/\.+$/, '');
      return [jours, tranches, note ? `(${note})` : ''].filter(Boolean).join(' ');
    })
    .filter(Boolean)
    .join(' ; ');
}

function mairieDe(f: Fiche): Mairie {
  type Adresse = { type_adresse?: string; complement1?: string; complement2?: string; numero_voie?: string; code_postal?: string; nom_commune?: string; latitude?: string; longitude?: string };
  const adresses = liste<Adresse>(f.adresse);
  const a = adresses.find((x) => x.type_adresse === 'Adresse') ?? adresses[0];
  const ligne = a
    ? [a.complement1, a.complement2, a.numero_voie, [a.code_postal, a.nom_commune].filter(Boolean).join(' ')]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)
        .join(', ')
    : '';
  const lat = Number(a?.latitude);
  const lon = Number(a?.longitude);
  const tel = liste<{ valeur?: string }>(f.telephone)[0]?.valeur?.trim() ?? '';
  const fiche = (f.url_service_public ?? '').startsWith('https://') ? (f.url_service_public ?? '') : '';
  return [
    (f.nom ?? '').trim(),
    adresseWeb(f.site_internet),
    tel,
    (f.adresse_courriel ?? '').trim(),
    ligne,
    Number.isFinite(lat) && lat !== 0 ? lat : null,
    Number.isFinite(lon) && lon !== 0 ? lon : null,
    horaires(f.plage_ouverture),
    (f.commentaire_plage_ouverture ?? '').trim().slice(0, 400),
    fiche,
  ];
}

export async function collecterMairies(
  lireJson: (url: string) => Promise<unknown>,
  dire: (m: string) => void,
): Promise<{ maj: string; communes: Map<string, Mairie[]> } | null> {
  const fiches = (await lireJson(ANNUAIRE)) as Fiche[];
  const { actuelles, reports } = reportsDuDecoupage();
  const communes = new Map<string, Mairie[]>();
  let nonDiffusees = 0;
  for (const f of fiches) {
    if (f.statut_de_diffusion === false || f.statut_de_diffusion === 'false') {
      nonDiffusees++;
      continue;
    }
    const brut = codeCommune(f.code_insee_commune ?? '');
    const code = actuelles.has(brut) ? brut : reports.get(brut);
    if (!code || !f.nom) continue;
    if (!communes.has(code)) communes.set(code, []);
    communes.get(code)!.push(mairieDe(f));
  }
  // La mairie d'abord, puis les mairies déléguées et les annexes, par nom.
  const rang = (nom: string) => (/^Mairie\s*-/.test(nom) ? 0 : 1);
  for (const l of communes.values()) l.sort((a, b) => rang(a[0]) - rang(b[0]) || a[0].localeCompare(b[0], 'fr'));
  if (communes.size < 30_000) {
    dire(`Mairies : ${communes.size} communes seulement, on garde l’ingestion précédente.`);
    return null;
  }
  const avecSite = [...communes.values()].filter((l) => l.some((m) => m[1])).length;
  dire(
    `Mairies : ${fiches.length.toLocaleString('fr-FR')} fiches, ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${avecSite.toLocaleString('fr-FR')} avec un site` +
      (nonDiffusees ? `, ${nonDiffusees} fiches non diffusées écartées.` : '.'),
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export function ecrireMairies(sortie: string, m: { maj: string; communes: Map<string, Mairie[]> }): number {
  return ecrireParDepartement(sortie, 'mairies', m.communes, () => ({ maj: m.maj }));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const m = await collecterMairies(lireJson, console.log);
  if (m) console.log(`${ecrireMairies(sortie, m)} départements écrits.`);
}
