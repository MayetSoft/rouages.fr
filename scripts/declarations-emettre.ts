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
 * nomme une commune, elle doit être la sienne.
 *
 * **Le contenu de la dernière déclaration d'intérêts publiée**, depuis le
 * 2 octobre 2026, vient du fichier XML que la HATVP publie à côté. Il porte
 * la date de naissance du déclarant : le rapprochement s'y fait sur le nom,
 * le prénom et la date de naissance complète, comme pour les sièges
 * communautaires. Sont repris tels quels les rubriques qui concernent l'élu
 * lui-même — activités, mandats, organes dirigeants, participations
 * financières, fonctions bénévoles — et les montants publiés ; jamais
 * l'activité du conjoint, les collaborateurs ni les commentaires libres. Les
 * déclarations publiées sont librement réutilisables (délibération HATVP
 * n° 2017-111, article 7), sans altération et avec leur source et leur date.
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
const CONTENUS = 'https://www.hatvp.fr/livraison/merge/declarations.xml';
const PAGE = 'https://www.hatvp.fr';

/** Les types de document que le site reprend : les déclarations d'intérêts, et leurs modifications. */
const TYPES: Record<string, string> = {
  di: 'déclaration d’intérêts',
  dim: 'modification de la déclaration d’intérêts',
};

/**
 * Une ligne de déclaration : rubrique, intitulé, précision (employeur,
 * structure, part du capital…), période, dernier montant publié.
 */
export type Ligne = [string, string, string, string, string];

/** La dernière déclaration d'intérêts publiée : date de dépôt (AAAA-MM-JJ), qualité, lignes. */
export type Contenu = [string, string, Ligne[]];

/** « Prénom NOM », page nominative, par déclaration (type, qualité, statut, date), et le contenu publié. */
export type Declarant = [string, string, [string, string, string, string][], Contenu?];

/** Les rubriques reprises, dans l'ordre où la page les montre. Ni le conjoint, ni les collaborateurs. */
const RUBRIQUES: [string, string, string, string][] = [
  // section, rubrique, champ de l'intitulé, champ de la précision
  ['activProfCinqDerniereDto', 'activité professionnelle', 'description', 'employeur'],
  ['activConsultantDto', 'activité de conseil', 'description', 'nomEmployeur'],
  ['mandatElectifDto', 'mandat électif', 'descriptionMandat', ''],
  ['participationDirigeantDto', 'organe dirigeant', 'activite', 'nomSociete'],
  ['participationFinanciereDto', 'participation financière', 'nomSociete', 'capitalDetenu'],
  ['fonctionBenevoleDto', 'fonction bénévole', 'descriptionActivite', 'nomStructure'],
];

const MASQUE = /\[\s*Donn[ée]es? non publi[ée]es?\s*\]/gi;
const entites = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const champ = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? entites(m[1]).replace(MASQUE, '').replace(/\s+/g, ' ').trim() : '';
};
const VIDE = /^(n[ée]ant|aucune?s?|sans objet|non|-|\.)?$/i;

/** « 03/2020 » et « » → « depuis 03/2020 » ; avec une fin, « 03/2020 – 07/2021 ». */
const periode = (debut: string, fin: string) => (debut && fin ? `${debut} – ${fin}` : debut ? `depuis ${debut}` : fin ? `jusqu’en ${fin}` : '');

/** Le montant de la dernière année publiée : « 8 457 € net en 2021 ». */
function montant(item: string): string {
  const r = /<remuneration>([\s\S]*?)<\/remuneration>/.exec(item)?.[1] ?? '';
  const annees = [...r.matchAll(/<annee>(\d{4})<\/annee>\s*<montant>([^<]*)<\/montant>/g)];
  const dernier = annees.sort((a, b) => Number(a[1]) - Number(b[1])).at(-1);
  if (!dernier) return '';
  const v = dernier[2].replace(MASQUE, '').trim();
  if (!v || /^0+$/.test(v.replace(/\s/g, ''))) return '';
  const brutNet = champ(r, 'brutNet').toLowerCase();
  return `${v} €${brutNet ? ` ${brutNet}` : ''} en ${dernier[1]}`;
}

/** Les lignes d'une déclaration, rubrique par rubrique. */
export function lignesDe(declaration: string): Ligne[] {
  const out: Ligne[] = [];
  for (const [section, rubrique, intitule, precision] of RUBRIQUES) {
    const bloc = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(declaration)?.[1];
    if (!bloc || champ(bloc, 'neant') === 'true') continue;
    for (const item of bloc.split(/<items>\s*(?=<motif>)/).slice(1)) {
      const titre = champ(item, intitule);
      if (VIDE.test(titre)) continue;
      let detail = precision ? champ(item, precision) : '';
      if (section === 'participationFinanciereDto') {
        const parts = champ(item, 'nombreParts');
        detail = [detail && `${detail.replace(/\s*%$/, '')} % du capital`, parts && `${parts} parts`].filter(Boolean).join(', ');
      }
      out.push([rubrique, titre, VIDE.test(detail) ? '' : detail, periode(champ(item, 'dateDebut'), champ(item, 'dateFin')), montant(item)]);
    }
  }
  return out;
}

const isoDe = (jjmmaaaa: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(jjmmaaaa);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

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
  // Et, pour le contenu, par nom, prénom et date de naissance complète.
  const parNaissance = new Map<string, string>();
  for await (const l of lignesCsvOuvert(fichierRne, lire)) {
    const dep = (l['Code du département'] ?? '').trim();
    const code = (l['Code de la commune'] ?? '').trim();
    const nom = cle(l["Nom de l'élu"] ?? '', l["Prénom de l'élu"] ?? '');
    const k = `${dep}|${nom}`;
    const deja = conseillers.get(k);
    conseillers.set(k, deja && deja !== code ? '?' : code);
    const kn = `${nom}|${(l['Date de naissance'] ?? '').trim()}`;
    const dejaN = parNaissance.get(kn);
    parNaissance.set(kn, dejaN && dejaN !== code ? '?' : code);
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
  // Le contenu : la dernière déclaration d'intérêts complète de chaque élu,
  // rattachée au déclarant de la liste qui porte le même nom dans la commune.
  let contenus = 0;
  try {
    const fichierXml = join(cache, 'hatvp-declarations.xml');
    await telecharger(CONTENUS, fichierXml);
    const xml = readFileSync(fichierXml, 'utf8');
    const derniere = new Map<string, { depot: string; qualite: string; decl: string }>();
    for (const m of xml.matchAll(/<declaration>([\s\S]*?)<\/declaration>/g)) {
      const d = m[1];
      const general = /<general>([\s\S]*?)<\/general>/.exec(d)?.[1] ?? '';
      if (champ(/<typeDeclaration>([\s\S]*?)<\/typeDeclaration>/.exec(general)?.[1] ?? '', 'id') !== 'DI') continue;
      if (champ(general, 'declarationModificative') === 'true') continue;
      const declarant = /<declarant>([\s\S]*?)<\/declarant>/.exec(general)?.[1] ?? '';
      const nom = cle(champ(declarant, 'nom'), champ(declarant, 'prenom'));
      const code = parNaissance.get(`${nom}|${isoDe(champ(declarant, 'dateNaissance'))}`);
      if (!code || code === '?') continue;
      const depot = isoDe(champ(d, 'dateDepot'));
      const k = `${code}|${nom}`;
      const deja = derniere.get(k);
      if (deja && deja.depot >= depot) continue;
      const organe = champ(/<organe>([\s\S]*?)<\/organe>/.exec(general)?.[1] ?? '', 'labelOrgane');
      const qualite = [champ(general, 'qualiteDeclarant'), organe].filter(Boolean).join(', ');
      derniere.set(k, { depot, qualite, decl: d });
    }
    for (const [k, { depot, qualite, decl }] of derniere) {
      const [code, nom] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
      const declarant = [...(parCommune.get(code)?.values() ?? [])].find((x) => {
        const [prenom, ...reste] = x[0].split(' ');
        return cle(reste.join(' '), prenom) === nom;
      });
      if (!declarant) continue;
      declarant[3] = [depot, qualite, lignesDe(decl)];
      contenus++;
    }
  } catch (e) {
    dire(`Déclarations HATVP : le fichier des contenus n’a pas pu être lu (${String(e)}) ; les statuts restent.`);
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
      `${absentes} déclarants absents du répertoire des élus, ${discordantes} dont la commune ne concorde pas ; ` +
      `${contenus} déclarations d'intérêts publiées reprises.`,
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
