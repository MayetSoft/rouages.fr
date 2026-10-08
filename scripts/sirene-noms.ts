/**
 * Le nom qu'une unité légale porte au répertoire SIRENE, quand il peut être
 * publié.
 *
 * Une société se nomme par sa dénomination. Un entrepreneur individuel se
 * nomme par son prénom et son nom — d'usage s'il en déclare un —, **et
 * seulement s'il est diffusible** : celui qui a exercé son droit d'opposition
 * (article R123-232-1 du code de commerce) est en diffusion partielle, et
 * son nom n'est pas repris (`CLAUDE.md`, « Les noms dans les données »). Un
 * SIREN que la copie du répertoire ne connaît pas n'est pas nommé non plus :
 * c'est le refus qui est le cas par défaut.
 *
 * La copie lue est celle d'Opendatasoft, qui sert le répertoire par
 * établissement ; on y regroupe par SIREN.
 */
const SIRENE = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/csv';

const CHAMPS = [
  'siren',
  'statutdiffusionunitelegale',
  'categoriejuridiqueunitelegale',
  'denominationunitelegale',
  'nomunitelegale',
  'nomusageunitelegale',
  'prenomusuelunitelegale',
  'prenom1unitelegale',
] as const;

/** Un CSV à point-virgule et guillemets, en lignes de champs. */
function lignes(texte: string): string[][] {
  const out: string[][] = [];
  let champ = '';
  let ligne: string[] = [];
  let dans = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (dans) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') dans = false;
      else champ += c;
    } else if (c === '"') dans = true;
    else if (c === ';') {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      out.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ || ligne.length) {
    ligne.push(champ);
    out.push(ligne);
  }
  return out;
}

/** « DUPONT » et « Marie » → « Marie DUPONT » ; le nom d'usage l'emporte quand il est déclaré. */
const nomPersonne = (nom: string, usage: string, prenomUsuel: string, prenom: string) =>
  `${(prenomUsuel || prenom).trim()} ${(usage || nom).trim()}`.trim();

export interface NomSirene {
  nom: string;
  /** Vrai pour un entrepreneur individuel (catégorie juridique 1000). */
  ei: boolean;
}

/**
 * Les noms publiables, par SIREN, pour ceux qu'on soumet. Un SIREN absent du
 * résultat ne doit pas être nommé.
 */
export async function nomsSirene(texte: (url: string) => Promise<string>, sirens: Iterable<string>): Promise<Map<string, NomSirene>> {
  return (await diffusionSirene(texte, sirens)).noms;
}

/**
 * Les noms publiables, et à part les SIREN que le répertoire refuse de
 * diffuser. Un registre qui publie lui-même le nom — une ancienne entreprise
 * à la CASIAS — peut le garder pour un SIREN inconnu, jamais pour un refus.
 */
export async function diffusionSirene(
  texte: (url: string) => Promise<string>,
  sirens: Iterable<string>,
): Promise<{ noms: Map<string, NomSirene>; refuses: Set<string> }> {
  const noms = new Map<string, NomSirene>();
  const tousRefuses = new Set<string>();
  const uniques = [...new Set(sirens)].filter((s) => /^\d{9}$/.test(s));
  for (let i = 0; i < uniques.length; i += 100) {
    const lot = uniques.slice(i, i + 100);
    const t = await texte(
      `${SIRENE}?select=${encodeURIComponent(CHAMPS.join(', '))}` +
        `&where=${encodeURIComponent(`siren in (${lot.map((x) => `"${x}"`).join(',')})`)}` +
        `&group_by=${encodeURIComponent(CHAMPS.join(', '))}&delimiter=%3B`,
    );
    const l = lignes(t);
    const j = CHAMPS.map((c) => l[0]?.indexOf(c) ?? -1);
    if (j.some((x) => x === -1)) throw new Error('SIRENE : l’export des unités légales a changé de forme');
    const refuses = new Set<string>();
    const vus = new Map<string, NomSirene>();
    for (const r of l.slice(1)) {
      const [siren, statut, categorie, denomination, nom, usage, prenomUsuel, prenom] = j.map((k) => (r[k] ?? '').trim());
      if (!siren) continue;
      if (statut !== 'O') {
        refuses.add(siren);
        continue;
      }
      const ei = categorie === '1000';
      const affiche = ei ? nomPersonne(nom, usage, prenomUsuel, prenom) : denomination || nomPersonne(nom, usage, prenomUsuel, prenom);
      if (affiche) vus.set(siren, { nom: affiche, ei });
    }
    for (const [siren, n] of vus) if (!refuses.has(siren)) noms.set(siren, n);
    for (const siren of refuses) tousRefuses.add(siren);
  }
  return { noms, refuses: tousRefuses };
}
