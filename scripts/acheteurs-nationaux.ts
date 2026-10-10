/**
 * Les acheteurs publics qui ne sont pas des collectivités : où ils sont, et
 * comment ils s'appellent.
 *
 * Les fichiers nationaux des marchés (`echeances.json`, `attributions.json`,
 * `avis.json`) portent, depuis le 10 octobre 2026, tous les acheteurs des
 * données essentielles — hôpitaux, lycées et collèges, offices HLM, sociétés
 * d'économie mixte, services de l'État, universités. Le site ne leur fait pas
 * de page : ils ne relèvent pas de ce qu'il décrit. Mais ce qu'ils renouvellent
 * est un fait public, et qui répond aux marchés publics les a pour clients.
 *
 * **Le département d'un acheteur est celui des établissements qui passent
 * ses marchés.** Le jeu donne le SIRET de l'acheteur, pas seulement son
 * SIREN : un centre hospitalier achète depuis son siège, un ministère depuis
 * chacune de ses directions. Le répertoire SIRENE (copie d'Opendatasoft)
 * donne la commune de chaque établissement, donc son département. Un acheteur
 * qui n'a publié que son SIREN est placé à son siège. Une administration
 * centrale achète depuis Paris : elle est rangée à Paris, ce qui est exact
 * sans dire où le marché s'exécute.
 *
 * **Son nom est sa dénomination au répertoire**, telle que publiée, en
 * capitales. Une unité légale que le répertoire ne diffuse pas, ou une
 * personne physique (catégorie juridique 1000), n'est pas retenue : le site ne
 * nomme pas d'acheteur qu'il ne peut pas nommer.
 */

const SIRENE = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/json';

const CHAMPS = 'siret,siren,codecommuneetablissement,denominationunitelegale,categoriejuridiqueunitelegale,statutdiffusionunitelegale';

interface Ligne {
  siret: string;
  siren: string;
  codecommuneetablissement: string | null;
  denominationunitelegale: string | null;
  categoriejuridiqueunitelegale: string | null;
  statutdiffusionunitelegale: string | null;
}

export interface AcheteurNational {
  nom: string;
  deps: string[];
}

/** Le département d'une commune : trois chiffres outre-mer, deux ailleurs, 2A et 2B en Corse. */
export function departementDeCommune(code: string): string | null {
  if (!/^(\d{5}|2[AB]\d{3})$/.test(code)) return null;
  return /^9[78]/.test(code) ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Le nom et les départements de chaque acheteur, d'après les SIRET sous
 * lesquels il a publié ses marchés ; à défaut de SIRET, d'après son siège.
 * Un acheteur absent du résultat n'est pas publié.
 */
export async function situerAcheteurs(
  json: <T>(url: string) => Promise<T>,
  /** SIREN -> les SIRET de ses marchés (vide s'il n'a publié que son SIREN). */
  acheteurs: Map<string, string[]>,
  dire: (m: string) => void,
): Promise<Map<string, AcheteurNational>> {
  const lire = async (where: string) =>
    json<Ligne[]>(`${SIRENE}?select=${encodeURIComponent(CHAMPS)}&where=${encodeURIComponent(where)}`);
  const lignes: Ligne[] = [];
  const sirets = [...new Set([...acheteurs.values()].flat())].sort();
  for (let i = 0; i < sirets.length; i += 100) {
    const lot = sirets.slice(i, i + 100);
    lignes.push(...(await lire(`siret in (${lot.map((s) => `"${s}"`).join(',')})`)));
  }
  const sansSiret = [...acheteurs].filter(([, l]) => l.length === 0).map(([s]) => s).sort();
  for (let i = 0; i < sansSiret.length; i += 100) {
    const lot = sansSiret.slice(i, i + 100);
    lignes.push(...(await lire(`etablissementsiege="oui" and siren in (${lot.map((s) => `"${s}"`).join(',')})`)));
  }

  const out = new Map<string, AcheteurNational>();
  let refuses = 0;
  for (const l of lignes) {
    if (!acheteurs.has(l.siren)) continue;
    const nom = (l.denominationunitelegale ?? '').trim();
    if (l.statutdiffusionunitelegale !== 'O' || (l.categoriejuridiqueunitelegale ?? '').startsWith('1') || !nom) {
      refuses++;
      continue;
    }
    const dep = departementDeCommune(l.codecommuneetablissement ?? '');
    if (!dep) continue;
    const a = out.get(l.siren) ?? { nom, deps: [] };
    if (!a.deps.includes(dep)) a.deps.push(dep);
    out.set(l.siren, a);
  }
  for (const a of out.values()) a.deps.sort();
  dire(
    `  acheteurs hors collectivités : ${acheteurs.size.toLocaleString('fr-FR')} avec une échéance ou un marché récent, ` +
      `${out.size.toLocaleString('fr-FR')} situés au répertoire (${sirets.length.toLocaleString('fr-FR')} SIRET, ` +
      `${sansSiret.length.toLocaleString('fr-FR')} par leur siège) ; ${refuses.toLocaleString('fr-FR')} établissements non nommables écartés.`,
  );
  return out;
}
