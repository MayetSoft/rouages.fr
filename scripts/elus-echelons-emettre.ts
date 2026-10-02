/**
 * Les élus des départements, des régions et du Parlement, d'après le
 * répertoire national des élus, avec leurs déclarations d'intérêts à la HATVP.
 *
 * Le site nommait le conseil municipal ; il ne disait pas qui siège au
 * conseil départemental, au conseil régional, à l'Assemblée ou au Sénat pour
 * le territoire. Le répertoire les publie tous, pour la même raison
 * (`docs/07-risques.md`) : nom, prénom, fonction, année de naissance — ni le
 * jour, ni le sexe, ni la profession.
 *
 * **Un fichier par département** : ses conseillers départementaux par canton,
 * ses sénateurs, ses députés par circonscription, et les conseillers
 * régionaux élus dans sa section départementale. La page de la région réunit
 * les fichiers de ses départements. Le site ne rattache pas ces élus à une
 * commune : le découpage qu'il lit ne donne ni le canton ni la
 * circonscription, et une correspondance devinée nommerait le mauvais élu.
 *
 * **Les déclarations** suivent la règle des élus municipaux
 * (`declarations-emettre.ts`) : le statut d'après la liste, rapproché sur le
 * nom, le prénom et le département quand un seul élu de l'échelon les porte ;
 * le contenu de la dernière déclaration publiée d'après le fichier XML,
 * rapproché sur le nom, le prénom et la date de naissance complète. Jamais une
 * déclaration de patrimoine.
 *
 * Lancé seul — `npx tsx scripts/elus-echelons-emettre.ts` —, il relit les
 * fichiers de `.cache/` s'ils y sont.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lignesCsvOuvert, ressourcesDuJeu } from './donnees-ouvertes.ts';
import {
  CONTENUS_URL,
  LISTE_URL,
  PAGE,
  TYPES,
  cle,
  contenuDe,
  dernieresDeclarations,
  lireListe,
  type Contenu,
} from './declarations-emettre.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const JEU = 'repertoire-national-des-elus-1';

/** Les fichiers du répertoire, le motif de leur titre, et le type de mandat que la HATVP leur donne. */
const MANDATS = [
  { id: 'cd', motif: 'conseillers-departementaux', fichier: 'rne-conseillers-departementaux.csv', hatvp: 'departement' },
  { id: 'cr', motif: 'conseillers-regionaux', fichier: 'rne-conseillers-regionaux.csv', hatvp: 'region' },
  { id: 'sen', motif: 'senateurs', fichier: 'rne-senateurs.csv', hatvp: 'senateur' },
  { id: 'dep', motif: 'deputes', fichier: 'rne-deputes.csv', hatvp: 'depute' },
] as const;
type Mandat = (typeof MANDATS)[number]['id'];

/** Une déclaration à la HATVP : page nominative, par déclaration (type, qualité, statut, date), et le contenu publié. */
export type Declaration = [string, [string, string, string, string][], Contenu?];

/**
 * Un élu : groupe (code du canton, de la circonscription, de la région ou
 * vide), libellé du groupe, « Prénom NOM », année de naissance, fonction
 * (vide pour un conseiller sans fonction), et ses déclarations.
 */
export type Elu = [string, string, string, string, string, Declaration?];

export interface ElusEchelons {
  maj: string;
  /** Par département : ses élus, mandat par mandat. */
  departements: Map<string, Record<Mandat, Elu[]>>;
}

const vide = (): Record<Mandat, Elu[]> => ({ cd: [], cr: [], sen: [], dep: [] });

/** « 1Ère Circonscription » → « 1re circonscription » ; « Bellerive-Sur-Allier » reste tel quel. */
const libelleCirco = (l: string) => l.replace(/^(\d+)(?:Ère|ère|Er|er)\b/, '$1re').replace(/^(\d+)(?:Ème|ème)\b/, '$1e').replace(/Circonscription/, 'circonscription');

export async function collecterElusEchelons(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lire: (chemin: string) => AsyncIterable<Uint8Array>,
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<ElusEchelons | null> {
  const departements = new Map<string, Record<Mandat, Elu[]>>();
  // Pour rapprocher les déclarations : par mandat HATVP, département et nom ;
  // et par nom et date de naissance pour le contenu.
  const parNom = new Map<string, Elu | '?'>();
  const parNaissance = new Map<string, Elu[]>();
  let lus = 0;
  for (const m of MANDATS) {
    const fichier = join(cache, m.fichier);
    if (!existsSync(fichier)) {
      const [url] = await ressourcesDuJeu(JEU, m.motif, json, dire);
      if (!url) continue;
      try {
        await telecharger(url, fichier);
      } catch {
        dire(`  ${m.motif} n’a pas répondu.`);
        continue;
      }
    }
    for await (const l of lignesCsvOuvert(fichier, lire)) {
      const nom = (l["Nom de l'élu"] ?? '').trim();
      const prenom = (l["Prénom de l'élu"] ?? '').trim();
      if (!nom) continue;
      // Le département du fichier ; pour un conseiller régional, celui de sa section.
      const dep =
        m.id === 'cr'
          ? // Le fichier écrit « 3 » pour l'Allier.
            // et « 69M » pour la Métropole de Lyon, dont les communes sont au fichier du Rhône.
            // « 6AE » pour l'Alsace, rangée sous le Bas-Rhin : la page de la Collectivité européenne d'Alsace lit les deux.
            (l['Code de la section départementale'] ?? '').trim().replace(/^(\d)$/, '0$1').replace(/^69M$/, '69').replace(/^6AE$/, '67')
          : m.id === 'cd' && (l['Code du département'] ?? '').trim() === '6AE'
            ? // Les conseillers d'Alsace : leur canton dit le département, « 6701 » ou « 6801 ».
              (l['Code du canton'] ?? '').trim().slice(0, 2)
            : (l['Code du département'] ?? '').trim() || (l['Code de la collectivité à statut particulier'] ?? '').trim();
      if (!dep) continue;
      const [groupe, libelle] =
        m.id === 'cd'
          ? [(l['Code du canton'] ?? '').trim(), (l['Libellé du canton'] ?? '').trim()]
          : m.id === 'dep'
            ? [(l['Code de la circonscription législative'] ?? '').trim(), libelleCirco((l['Libellé de la circonscription législative'] ?? '').trim())]
            : m.id === 'cr'
              ? [(l['Code de la région'] ?? '').trim(), (l['Libellé de la région'] ?? '').trim()]
              : ['', ''];
      const naissance = (l['Date de naissance'] ?? '').trim();
      const elu: Elu = [groupe, libelle, `${prenom} ${nom}`, naissance.slice(0, 4), (l['Libellé de la fonction'] ?? '').trim()];
      const d = departements.get(dep) ?? vide();
      d[m.id].push(elu);
      departements.set(dep, d);
      // La HATVP range un conseiller régional sous le département de sa section.
      const k = `${m.hatvp}|${dep.padStart(2, '0')}|${cle(nom, prenom)}`;
      parNom.set(k, parNom.has(k) ? '?' : elu);
      const kn = `${cle(nom, prenom)}|${naissance}`;
      parNaissance.set(kn, [...(parNaissance.get(kn) ?? []), elu]);
      lus++;
    }
  }
  if (lus === 0) {
    dire('Élus des autres échelons : aucun fichier lu.');
    return null;
  }

  // Les déclarations : le statut d'après la liste.
  let statuts = 0;
  let contenus = 0;
  try {
    const fichierListe = join(cache, 'hatvp-liste.csv');
    await telecharger(LISTE_URL, fichierListe);
    const liste = lireListe(readFileSync(fichierListe, 'utf8')) ?? [];
    for (const v of liste) {
      const elu = parNom.get(`${v.mandat}|${v.dep}|${cle(v.nom, v.prenom)}`);
      if (!elu || elu === '?') continue;
      const decl: Declaration = elu[5] ?? [v.url ? PAGE + v.url : '', []];
      const t: [string, string, string, string] = [TYPES[v.type], v.qualite, v.statut, v.date];
      if (!decl[1].some((x) => x.join('|') === t.join('|'))) decl[1].push(t);
      decl[1].sort((a, b) => b[3].localeCompare(a[3]));
      elu[5] = decl;
      statuts++;
    }
    // Le contenu, sur le nom, le prénom et la date de naissance.
    const fichierXml = join(cache, 'hatvp-declarations.xml');
    await telecharger(CONTENUS_URL, fichierXml);
    for (const [k, d] of dernieresDeclarations(readFileSync(fichierXml, 'utf8'))) {
      for (const elu of parNaissance.get(k) ?? []) {
        if (!elu[5]?.[0]) continue;
        elu[5][2] = contenuDe(elu[5][0], d);
        contenus++;
      }
    }
  } catch (e) {
    dire(`Élus des autres échelons : les déclarations n’ont pas pu être lues (${String(e)}).`);
  }

  for (const d of departements.values()) {
    for (const l of Object.values(d)) {
      l.sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }) || a[2].localeCompare(b[2], 'fr'));
    }
  }
  const total = (id: Mandat) => [...departements.values()].reduce((n, d) => n + d[id].length, 0);
  dire(
    `Élus des autres échelons : ${total('cd').toLocaleString('fr-FR')} conseillers départementaux, ` +
      `${total('cr').toLocaleString('fr-FR')} conseillers régionaux, ${total('dep')} députés, ${total('sen')} sénateurs ; ` +
      `${statuts.toLocaleString('fr-FR')} déclarations rapprochées, ${contenus.toLocaleString('fr-FR')} contenus repris.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), departements };
}

export function ecrireElusEchelons(sortie: string, e: ElusEchelons): number {
  let n = 0;
  for (const [dep, d] of [...e.departements].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(join(sortie, 'dep', `${dep}-elus-echelons.json`), JSON.stringify({ maj: e.maj, ...d }));
    n++;
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, lireJson, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const e = await collecterElusEchelons(
    telecharger,
    cache,
    (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
    lireJson as <T>(url: string) => Promise<T>,
    console.log,
  );
  if (e) console.log(`${ecrireElusEchelons(sortie, e)} départements écrits.`);
}
