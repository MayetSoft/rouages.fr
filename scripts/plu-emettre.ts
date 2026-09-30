/**
 * Ce qui s'applique aujourd'hui, et ce qui va s'appliquer.
 *
 * L'enquête SuDocUH dit quel document d'urbanisme couvre chaque commune, mais
 * elle est annuelle : elle connaît les approbations jusqu'à sa clôture et pas
 * au-delà. Le Géoportail de l'urbanisme, lui, est alimenté au fil de l'eau par
 * les collectivités elles-mêmes. Les deux ne disent pas la même chose, et
 * l'écart est précisément ce qu'un habitant a besoin de savoir.
 *
 * Le Géoportail donne, pour chaque document, un état et une date. **Ni l'un ni
 * l'autre ne dit ce qu'on croirait.**
 *
 *   — L'état 07, « approuvé », ne signifie pas « pas encore opposable » : le
 *     service en porte des centaines datés de 2022, et des dizaines d'avant
 *     2015, jamais repassés à 03. C'est l'état que la collectivité a déclaré en
 *     déposant, rien de plus.
 *   — La date, `datappro`, est celle de la **dernière procédure** déposée, pas
 *     celle de l'approbation. Une modification, une simple mise à jour des
 *     annexes la font avancer.
 *
 * Le Mayet-de-Montagne est le cas d'école. SuDocUH donne le plan
 * intercommunal de la Montagne bourbonnaise, approuvé le 31 mars 2022. Le
 * Géoportail donne un « PLUi » des mêmes quinze communes, à l'état 07, daté du
 * 8 janvier 2026. Ce 8 janvier est l'arrêté 2026-005 du président de Vichy
 * Communauté, qui annexe à tous les documents du territoire le règlement local
 * de publicité modifié : le plan est celui de 2022, modifié en septembre 2022 et
 * en décembre 2025. Le site a d'abord annoncé un plan « approuvé mais pas encore
 * opposable » — c'était faux, et à 4 809 communes à la fois.
 *
 * Ce qu'on en tire est donc plus modeste et exact : **la version la plus
 * récente que la collectivité a déposée**, quel que soit son état, avec sa date
 * et son règlement, quand elle est postérieure à ce que l'enquête a pu voir. Le
 * site ne dit pas ce qu'elle change.
 *
 * **Le périmètre réel d'un plan intercommunal** est l'autre apport. Le plan de
 * Vichy Communauté ne couvre que quinze des trente-neuf communes du
 * groupement : le suffixe du nom de document — `_A` dans
 * `200071363_PLUi_20260108_A` — marque justement les cas où plusieurs plans
 * coexistent dans un même périmètre. Aucune page officielle ne dit à une
 * commune si le plan « de son intercommunalité » la concerne.
 *
 * **Ce que cette collecte ne fait pas, et ce qu'il en coûterait.** La couche
 * `zone_urba` porte, zone par zone, le libellé long et jusqu'à la page du
 * règlement qui la décrit — `200071363_reglement_20260108_A.pdf#page=38`. Elle
 * compte 1 341 261 entités, soit environ 1,1 Mo par page de cinq mille et
 * quelque 290 Mo en tout ; la pagination profonde met une vingtaine de
 * secondes par page. C'est faisable et ce n'est pas gratuit : à faire quand le
 * site saura quoi en montrer, sachant qu'un zonage se rapporte au document et
 * non à la commune — sans géométrie, on ne peut pas dire laquelle de ces zones
 * couvre une adresse, et le prétendre serait pire que se taire.
 */
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCUMENTS } from '../src/modele/urbanisme.ts';

/** Le service de la Géoplateforme qui expose le Géoportail de l'urbanisme. */
const WFS = 'https://data.geopf.fr/wfs/ows';

/** Où le Géoportail sert les pièces écrites, une fois le document connu. */
const ANNEXES = 'https://data.geopf.fr/annexes/gpu/documents';

/** Opposable : approuvé et publié. C'est lui qui fonde un permis aujourd'hui. */
const OPPOSABLE = '03';

/** Approuvé : délibéré, mais les formalités de publicité ne sont pas achevées. */
const APPROUVE = '07';

/** Pagination : au-delà, le service met plusieurs dizaines de secondes. */
const PAGE = 5000;

/**
 * Le Géoportail écrit le même type de deux façons — « PLUI » et « PLUi » — et
 * son vocabulaire n'est pas tout à fait celui du site. On le ramène à celui de
 * `DOCUMENTS`, faute de quoi la page afficherait deux libellés pour une même
 * chose.
 */
function normaliser(brut: string | null): string {
  if (!brut) return '';
  const h = brut.trim().toUpperCase();
  const connu = DOCUMENTS.find((d) => d.toUpperCase() === h);
  return connu ?? '';
}

export interface PluDocument {
  /** Le type, ramené au vocabulaire de `DOCUMENTS`. */
  t: string;
  /** Date de la dernière procédure déposée — pas forcément une approbation —, AAAA-MM-JJ. */
  d: string;
  /** Combien de communes ce document couvre — un plan intercommunal en couvre plusieurs. */
  n: number;
  /** Adresse du règlement, vide quand le Géoportail n'en publie pas. */
  r: string;
}

export interface PluCommune {
  /** Le dernier document déposé à l'état « opposable » (03). */
  o?: PluDocument;
  /** Le dernier document déposé à l'état « approuvé » (07) — voir l'en-tête : ce n'est pas « pas encore opposable ». */
  a?: PluDocument;
}

export interface Plu {
  maj: string;
  communes: Map<string, PluCommune>;
  /** Combien de communes ont un document déposé à l'état « approuvé » plus récent que tout document « opposable ». */
  enAttente: number;
}

interface Entite {
  properties: Record<string, string | null>;
}

/**
 * Lit une couche entière, page par page.
 *
 * `PROPERTYNAME` écarte la géométrie : sans lui, la même requête rapatrie des
 * polygones dont on n'a que faire, et le volume est sans commune mesure.
 */
async function couche(
  nom: string,
  champs: string[],
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Entite[]> {
  const tout: Entite[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const url =
      `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
      `&TYPENAMES=wfs_du:${nom}&OUTPUTFORMAT=application/json` +
      `&PROPERTYNAME=${champs.join(',')}&COUNT=${PAGE}&STARTINDEX=${debut}`;
    const page = await json<{ features?: Entite[] }>(url);
    const lues = page.features ?? [];
    tout.push(...lues);
    if (lues.length < PAGE) break;
  }
  dire(`Géoportail de l’urbanisme : ${tout.length.toLocaleString('fr-FR')} lignes dans « ${nom} ».`);
  return tout;
}

/**
 * AAAAMMJJ du Géoportail en date civile.
 *
 * Le champ n'est pas contrôlé à la saisie : le fichier porte des `00000000`,
 * un `08040101` et une approbation datée de 2035. Une date hors de portée est
 * traitée comme absente plutôt que recopiée.
 */
function enIso(brut: string | null): string {
  if (!brut || !/^\d{8}$/.test(brut)) return '';
  const an = Number(brut.slice(0, 4));
  if (an < 1960 || an > new Date().getUTCFullYear() + 1) return '';
  const mois = Number(brut.slice(4, 6));
  const jour = Number(brut.slice(6));
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return '';
  return `${brut.slice(0, 4)}-${brut.slice(4, 6)}-${brut.slice(6)}`;
}

export async function collecterPlu(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Plu | null> {
  const documents = await couche(
    'doc_urba',
    ['partition', 'idurba', 'typedoc', 'datappro', 'etat', 'nomreg'],
    json,
    dire,
  );
  const couvertures = await couche('doc_urba_com', ['partition', 'idurba', 'insee'], json, dire);
  // La table « document » porte l'identifiant interne sans lequel les pièces
  // écrites ne sont pas adressables : l'adresse du règlement s'écrit
  // <annexes>/<partition>/<identifiant>/<nom du fichier>.
  const dossiers = await couche('document', ['partition', 'id'], json, dire);

  if (documents.length === 0 || couvertures.length === 0) {
    dire('Géoportail de l’urbanisme : aucune donnée exploitable.');
    return null;
  }

  const identifiant = new Map<string, string>();
  for (const d of dossiers) {
    const p = d.properties.partition;
    if (p && d.properties.id) identifiant.set(p, d.properties.id);
  }

  // Combien de communes chaque document couvre, et lesquelles.
  //
  // La clé est `idurba`, jamais `partition`. Une partition est un **lot de
  // dépôt**, pas un document : la direction départementale des territoires de
  // l'Allier a versé cent trente-neuf documents sous la seule `DU_03053`.
  // Joindre là-dessus faisait d'une carte communale de 2016 un document
  // couvrant cent vingt-neuf communes — et l'attribuait au Mayet-de-Montagne,
  // qui relève d'un plan intercommunal.
  const couvertes = new Map<string, Set<string>>();
  for (const c of couvertures) {
    const id = c.properties.idurba;
    const insee = c.properties.insee;
    if (!id || !insee) continue;
    const l = couvertes.get(id);
    if (l) l.add(insee);
    else couvertes.set(id, new Set([insee]));
  }

  const communes = new Map<string, PluCommune>();
  let enAttente = 0;

  for (const etat of [OPPOSABLE, APPROUVE]) {
    for (const d of documents) {
      if (d.properties.etat !== etat) continue;
      const id = d.properties.idurba;
      const p = d.properties.partition;
      if (!id || !p) continue;
      const liste = couvertes.get(id);
      if (!liste) continue;

      const nomreg = d.properties.nomreg ?? '';
      const dossier = identifiant.get(p);
      const type = normaliser(d.properties.typedoc);
      if (!type) continue;
      const doc: PluDocument = {
        t: type,
        d: enIso(d.properties.datappro),
        n: liste.size,
        r: nomreg && dossier ? `${ANNEXES}/${p}/${dossier}/${nomreg}` : '',
      };

      for (const insee of liste) {
        const f = communes.get(insee) ?? {};
        // Une commune peut relever de plusieurs documents du même état — un
        // plan communal et un plan intercommunal déposés à des dates
        // différentes. À état égal, le plus récemment approuvé l'emporte.
        const place = etat === OPPOSABLE ? 'o' : 'a';
        const dejaLa = f[place];
        if (dejaLa && dejaLa.d >= doc.d) continue;
        f[place] = doc;
        communes.set(insee, f);
      }
    }
  }

  // Un document déposé « approuvé » ne compte que s'il est postérieur à
  // l'opposable : sinon c'est une trace ancienne. Et une date illisible ne
  // permet rien d'en dire.
  for (const [insee, f] of communes) {
    if (f.a && !f.a.d) delete f.a;
    if (f.a && f.o && f.a.d <= f.o.d) delete f.a;
    if (f.a) enAttente++;
    if (!f.o && !f.a) communes.delete(insee);
  }

  dire(
    `Géoportail de l’urbanisme : ${communes.size.toLocaleString('fr-FR')} communes situées, ` +
      `${enAttente.toLocaleString('fr-FR')} avec une dernière version déposée à l’état « approuvé ».`,
  );

  return { maj: new Date().toISOString().slice(0, 10), communes, enAttente };
}

/**
 * N'écrit que ce dont on peut répondre.
 *
 * Le Géoportail sert ici une seule chose : **une version que SuDocUH ne
 * pouvait pas connaître**. L'enquête dit elle-même jusqu'à quelle date elle a
 * vu les approbations ; au-delà, elle est muette par construction. En deçà, les
 * deux sources ont eu la même occasion de voir le document et n'en disent pas
 * toujours la même chose — sans moyen de trancher, le site se tait plutôt que de
 * choisir.
 *
 * On retient la plus récente des deux, opposable ou approuvée : l'état déclaré
 * ne dit pas si le document s'applique (voir l'en-tête).
 */
export function ecrirePlu(
  sortie: string,
  dep: string,
  codes: string[],
  p: Plu,
  horizonSudocuh: string,
): number {
  const c: Record<string, { a: PluDocument }> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const f = p.communes.get(code);
    // Une date à venir est une erreur de saisie : le service en porte.
    const recent = [f?.o, f?.a]
      .filter((x): x is PluDocument => !!x?.d && x.d <= p.maj)
      .sort((x, y) => y.d.localeCompare(x.d))[0];
    if (!recent) continue;
    if (horizonSudocuh && recent.d <= horizonSudocuh) continue;
    c[code] = { a: recent };
    n++;
  }
  const fichier = join(sortie, 'dep', `${dep}-plu.json`);
  if (n === 0) {
    // Un fichier d'une ingestion précédente dirait encore ce qui n'est plus.
    if (existsSync(fichier)) rmSync(fichier);
    return 0;
  }
  writeFileSync(fichier, JSON.stringify({ maj: p.maj, c }));
  return n;
}

// Lancé seul — `tsx scripts/plu-emettre.ts` — : relit le Géoportail et
// réécrit les fichiers `dep/XX-plu.json`, avec l'horizon et les communes de
// chaque `dep/XX-urbanisme.json` déjà en place.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sortie = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public', 'territoires');
  const json = async <T,>(url: string): Promise<T> => {
    for (let essai = 1; ; essai++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as T;
      } catch (e) {
        if (essai >= 4) throw e;
        await new Promise((ok) => setTimeout(ok, 2000 * essai));
      }
    }
  };
  const p = await collecterPlu(json, console.log);
  if (p) {
    let n = 0;
    for (const f of readdirSync(join(sortie, 'dep')).filter((x) => x.endsWith('-urbanisme.json')).sort()) {
      const dep = f.slice(0, -'-urbanisme.json'.length);
      const u = JSON.parse(readFileSync(join(sortie, 'dep', f), 'utf8')) as { jusquau: string; c: Record<string, unknown> };
      n += ecrirePlu(sortie, dep, Object.keys(u.c), p, u.jusquau);
    }
    console.log(`${n.toLocaleString('fr-FR')} communes avec une version plus récente que l’enquête.`);
  }
}
