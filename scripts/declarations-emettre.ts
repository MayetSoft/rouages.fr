/**
 * Les déclarations que les élus de la commune ont déposées à la Haute
 * Autorité pour la transparence de la vie publique.
 *
 * **Les déclarations d'intérêts seulement.** Celle de patrimoine d'un élu
 * local n'est jamais publiée, et la divulguer est un délit (article 26 de la
 * loi n° 2013-907) : le site n'en reprend rien, pas même l'existence. Les
 * déclarations d'intérêts sont rendues publiques (article 12), et la HATVP en
 * publie la liste en données ouvertes, avec leur statut et la page nominative
 * de chaque déclarant. Voir `docs/07-risques.md`.
 *
 * **Le rapprochement est prudent.** La liste donne le nom, le prénom, le
 * département et une qualité — « Maire de Vichy », « Président de Vichy
 * Communauté », ou « Adjoint au maire » sans commune. On cherche, parmi les
 * conseillers municipaux du département au répertoire national des élus,
 * celui qui porte ce nom et ce prénom : **un seul**, ou rien. Quand la qualité
 * nomme une commune, elle doit être la sienne. Le contenu des déclarations
 * n'est pas repris ; la page de la HATVP le donne.
 *
 * Lancé seul — `npx tsx scripts/declarations-emettre.ts` —, il relit
 * `.cache/hatvp-liste.csv` et `.cache/rne-conseillers-municipaux.csv`.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliser } from '../src/client/recherche-commune.ts';
import { lignesCsvOuvert } from './donnees-ouvertes.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const LISTE = 'https://www.hatvp.fr/livraison/opendata/liste.csv';
const PAGE = 'https://www.hatvp.fr';

/** Les types de document que le site reprend : les déclarations d'intérêts, et leurs modifications. */
const TYPES: Record<string, string> = {
  di: 'déclaration d’intérêts',
  dim: 'modification de la déclaration d’intérêts',
};

/** « Prénom NOM », page nominative, puis par déclaration : type, qualité, statut, date (AAAA-MM-JJ). */
export type Declarant = [string, string, [string, string, string, string][]];

export interface Declarations {
  maj: string;
  communes: Map<string, Declarant[]>;
}

const cle = (nom: string, prenom: string) => `${normaliser(nom)}|${normaliser(prenom)}`;

function decouper(ligne: string): string[] {
  const champs: string[] = [];
  let courant = '';
  let dans = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (dans && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else dans = !dans;
    } else if (c === ';' && !dans) {
      champs.push(courant);
      courant = '';
    } else courant += c;
  }
  champs.push(courant);
  return champs;
}

export async function collecterDeclarations(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  lire: (chemin: string) => AsyncIterable<Uint8Array>,
  nomsCommunes: Map<string, string>,
  dire: (m: string) => void,
): Promise<Declarations | null> {
  const fichierListe = join(cache, 'hatvp-liste.csv');
  await telecharger(LISTE, fichierListe);
  const fichierRne = join(cache, 'rne-conseillers-municipaux.csv');
  if (!existsSync(fichierRne)) {
    dire('Déclarations HATVP : le fichier des conseillers municipaux manque, rien n’est rapproché.');
    return null;
  }

  // Les conseillers municipaux, par département et par nom : la commune, ou
  // « ? » dès qu'un second porte le même nom et le même prénom.
  const conseillers = new Map<string, string>();
  for await (const l of lignesCsvOuvert(fichierRne, lire)) {
    const dep = (l['Code du département'] ?? '').trim();
    const code = (l['Code de la commune'] ?? '').trim();
    const k = `${dep}|${cle(l["Nom de l'élu"] ?? '', l["Prénom de l'élu"] ?? '')}`;
    const deja = conseillers.get(k);
    conseillers.set(k, deja && deja !== code ? '?' : code);
  }

  const lignes = readFileSync(fichierListe, 'utf8').split(/\r?\n/).filter(Boolean);
  const entetes = decouper(lignes.shift() ?? '');
  const j = (n: string) => entetes.indexOf(n);
  const [jPrenom, jNom, jMandat, jQualite, jType, jDep, jPub, jDepot, jUrl, jStatut] = [
    'prenom', 'nom', 'type_mandat', 'qualite', 'type_document', 'departement', 'date_publication', 'date_depot', 'url_dossier', 'statut_publication',
  ].map(j);
  if ([jPrenom, jNom, jMandat, jQualite, jType, jDep, jUrl, jStatut].some((x) => x === -1)) {
    dire('Déclarations HATVP : la liste a changé de forme.');
    return null;
  }

  const parCommune = new Map<string, Map<string, Declarant>>();
  let retenues = 0;
  let ambigues = 0;
  let absentes = 0;
  let discordantes = 0;
  for (const ligne of lignes) {
    const v = decouper(ligne);
    const type = (v[jType] ?? '').trim();
    const mandat = (v[jMandat] ?? '').trim();
    if (!TYPES[type] || (mandat !== 'commune' && mandat !== 'epci')) continue;
    const dep = (v[jDep] ?? '').trim().padStart(2, '0');
    const code = conseillers.get(`${dep}|${cle(v[jNom] ?? '', v[jPrenom] ?? '')}`);
    if (!code) {
      absentes++;
      continue;
    }
    if (code === '?') {
      ambigues++;
      continue;
    }
    const qualite = (v[jQualite] ?? '').trim();
    // « Maire de Vichy », « Adjointe au maire d'Angers » : la commune nommée doit être la sienne.
    const nommee = mandat === 'commune' ? /\bmaire (?:de |d'|d’|du |des )(.+)$/i.exec(qualite)?.[1] : undefined;
    if (nommee && normaliser(nommee) !== normaliser(nomsCommunes.get(code) ?? '')) {
      discordantes++;
      continue;
    }
    const url = (v[jUrl] ?? '').trim();
    const date = ((v[jPub] ?? '').trim() || (v[jDepot] ?? '').trim()).slice(0, 10);
    const m = parCommune.get(code) ?? new Map<string, Declarant>();
    const d = m.get(url) ?? [`${(v[jPrenom] ?? '').trim()} ${(v[jNom] ?? '').trim()}`, url ? PAGE + url : '', []];
    const t: [string, string, string, string] = [TYPES[type], qualite, (v[jStatut] ?? '').trim(), date];
    // La liste répète parfois une déclaration à l'identique.
    if (!d[2].some((x) => x.join('|') === t.join('|'))) d[2].push(t);
    m.set(url, d);
    parCommune.set(code, m);
    retenues++;
  }
  const communes = new Map<string, Declarant[]>();
  for (const [code, m] of parCommune) {
    const l = [...m.values()];
    for (const d of l) d[2].sort((a, b) => b[3].localeCompare(a[3]));
    communes.set(code, l.sort((a, b) => a[0].localeCompare(b[0], 'fr')));
  }
  dire(
    `Déclarations HATVP : ${retenues.toLocaleString('fr-FR')} déclarations d'intérêts rapprochées dans ` +
      `${communes.size.toLocaleString('fr-FR')} communes ; écartées : ${ambigues} homonymes dans le département, ` +
      `${absentes} déclarants absents du répertoire des élus, ${discordantes} dont la commune ne concorde pas.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

const departementDe = (code: string) => (code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2));

export function ecrireDeclarations(sortie: string, d: Declarations): number {
  const parDep = new Map<string, Record<string, Declarant[]>>();
  for (const [code, l] of [...d.communes].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = l;
  }
  let n = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(join(sortie, 'dep', `${dep}-declarations.json`), JSON.stringify({ maj: d.maj, c }));
    n++;
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as { c: [string, string][] };
  const d = await collecterDeclarations(
    telecharger,
    cache,
    (chemin) => createReadStream(chemin) as unknown as AsyncIterable<Uint8Array>,
    new Map(index.c.map(([code, nom]) => [code, nom])),
    console.log,
  );
  if (d) console.log(`${ecrireDeclarations(sortie, d)} départements écrits.`);
}
