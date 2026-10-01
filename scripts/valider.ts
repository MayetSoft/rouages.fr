/**
 * Contrôle qualité du contenu — la ligne éditoriale rendue exécutable.
 *
 *   npm run valider              structure, références, règles éditoriales
 *   npm run valider -- --liens   vérifie en plus que les URL répondent (réseau)
 *   npm run fraicheur            échoue si une fiche a dépassé sa date de péremption
 *
 * Le build appelle `valider` : une fiche sans source, sans levier ou avec une
 * référence cassée ne peut pas être mise en ligne.
 */
import { chargerGraphe, estPerime, formaterDate } from '../src/modele/graphe.ts';
import { construireGlossaire } from '../src/modele/glossaire.ts';
import { construireReseau } from '../src/modele/reseau.ts';
import { ATTENTE_EDITEUR } from '../src/modele/schemas.ts';
import { nommeUnePersonne } from '../src/modele/civilites.ts';
import { existsSync, readFileSync } from 'node:fs';

const args = new Set(process.argv.slice(2));
const verifierLiens = args.has('--liens');
const fraicheurBloquante = args.has('--fraicheur');
/** Le déploiement le passe : c'est la mise à disposition du public qui oblige. */
const publication = args.has('--publication');

const ROUGE = '\x1b[31m';
const JAUNE = '\x1b[33m';
const VERT = '\x1b[32m';
const GRIS = '\x1b[90m';
const RAZ = '\x1b[0m';

const erreurs: string[] = [];
const avertissements: string[] = [];

const g = chargerGraphe();

for (const a of g.anomalies) {
  const ligne = `${a.fichier}${a.chemin ? ` → ${a.chemin}` : ''} : ${a.message}`;
  (a.gravite === 'erreur' ? erreurs : avertissements).push(ligne);
}

/* ------------------------------------------------------------------ *
 * Règles éditoriales
 * ------------------------------------------------------------------ */

// Une source déclarée mais citée par personne est du bruit : on la signale.
const citees = new Set<string>();
const recolter = (s: string[]) => s.forEach((id) => citees.add(id));
for (const a of g.acteurs.values()) recolter(a.liens);
for (const c of g.competences.values()) recolter(c.liens);
for (const d of g.documents.values()) recolter(d.liens);
for (const f of g.flux.values()) recolter(f.liens);
for (const p of g.processus.values()) {
  recolter(p.liens);
  p.etapes.forEach((e) => recolter(e.liens));
  p.leviers.forEach((l) => recolter(l.liens));
}
// Le glossaire affiche ses liens comme n'importe quelle fiche : les oublier
// ici signalait comme orpheline une source pourtant bien citée.
for (const s of g.sigles.values()) recolter(s.liens);
for (const r of g.reperes.values()) recolter(r.sens ? [...r.liens, r.sens.lien] : r.liens);
// Les mentions légales citent chaque jeu surveillé par son lien : une source
// qui n'apparaît que là est publiée, pas orpheline.
for (const s of g.surveillances.values()) if (s.lien) citees.add(s.lien);
// Un jeu sous ODbL impose de republier sous ODbL ce qu'on en dérive : les
// mentions doivent dire quels fichiers, et la liste ne s'écrit pas après coup.
for (const s of g.surveillances.values()) {
  if (s.licence === 'odbl' && !s.fichiers?.length) {
    erreurs.push(`surveillance « ${s.id} » sous ODbL sans la liste des fichiers qui en dérivent (champ fichiers)`);
  }
}
for (const id of g.sources.keys()) {
  if (!citees.has(id)) avertissements.push(`page de référence « ${id} » déclarée mais liée depuis aucun nœud`);
}

// Une source qui annonce un article dans son titre doit pointer cet article, et
// non la racine du code. Trois d'entre elles renvoyaient au sommaire : le
// lecteur qui suivait le lien pour vérifier n'avait aucun moyen de retrouver la
// disposition citée, ce qui vide de son sens la règle « on cite l'article qui
// fonde l'affirmation ». Sur Légifrance, un lien vérifiable porte LEGIARTI pour
// un article ou LEGISCTA pour une section.
for (const s of g.sources.values()) {
  if (s.type !== 'droit') continue;
  if (!s.url.includes('legifrance.gouv.fr')) continue;
  if (!/\bart\./.test(s.titre)) continue;
  if (/LEGIARTI|LEGISCTA/.test(s.url)) continue;
  erreurs.push(
    `page de référence « ${s.id} » annonce un article dans son titre mais renvoie à la racine du code — ` +
      `pointez l'article (LEGIARTI) ou la section (LEGISCTA).`,
  );
}

// Tout sigle employé doit avoir son entrée au glossaire. C'est la règle qui
// empêche le site de redevenir illisible pour qui n'est pas du métier — et elle
// se renforce toute seule à mesure que le réseau grossit.
const glossaire = construireGlossaire([...g.sigles.values()]);
const textesVisibles: [string, string][] = [];
const noter = (ou: string, ...textes: (string | undefined)[]) => {
  for (const t of textes) if (t) textesVisibles.push([ou, t]);
};
for (const a of g.acteurs.values()) noter(`acteur ${a.id}`, a.nom, a.nom_court, a.resume);
for (const c of g.competences.values()) noter(`compétence ${c.id}`, c.nom, c.nom_court, c.resume);
for (const d of g.documents.values()) noter(`document ${d.id}`, d.nom, d.resume, d.ou_le_trouver);
for (const f of g.flux.values()) noter(`flux ${f.id}`, f.nom, f.resume, f.ordre_de_grandeur);
for (const s of g.sources.values()) noter(`source ${s.id}`, s.titre);
for (const s of g.sigles.values()) noter(`sigle ${s.sigle}`, s.definition);
for (const r of g.reperes.values()) noter(`repère ${r.id}`, r.nom, r.explication);
for (const p of g.processus.values()) {
  noter(`processus ${p.id}`, p.nom, p.resume, p.declencheur, p.sortie);
  for (const e of p.etapes) noter(`processus ${p.id}, étape ${e.ordre}`, e.action, e.note);
  for (const l of p.leviers) noter(`levier ${l.id}`, l.quoi, l.quand, l.aupres_de, l.piege, l.recours_si_refus);
}

const sigleManquant = new Map<string, string>();
for (const [ou, texte] of textesVisibles) {
  for (const inconnu of glossaire.inconnus(texte)) {
    if (!sigleManquant.has(inconnu)) sigleManquant.set(inconnu, ou);
  }
}
for (const [sigle, ou] of sigleManquant) {
  erreurs.push(
    `sigle « ${sigle} » employé dans ${ou} sans entrée au glossaire — ajoutez-le à contenu/glossaire.yaml`,
  );
}

// « Un nœud isolé n'apporte rien » : le premier critère d'admission de
// docs/02-familles.md, jusqu'ici seulement écrit. Un nœud que rien ne relie est
// invisible depuis tout autre point du réseau — sur un site qui *est* un
// réseau, c'est une page morte.
//
// Un document fait exception, en avertissement seulement : il ne peut être
// relié que par un processus qui le produit, et tous les processus qui
// comptent ne sont pas encore décrits. L'exiger reviendrait à interdire de
// nommer un document avant d'avoir modélisé son processus.
for (const n of construireReseau().noeuds) {
  if (n.degre > 0) continue;
  const ligne =
    `${n.type} « ${n.id} » n'est relié à aucun autre nœud — ` +
    `un nœud isolé n'apporte rien (docs/02-familles.md).`;
  (n.type === 'document' ? avertissements : erreurs).push(ligne);
}

// Une compétence déclarée obligatoire par la loi doit citer le texte qui le
// dit. Sans cette règle, le site pourrait affirmer « l'intercommunalité, la loi
// l'y oblige » sans que rien ne permette de le vérifier — et se tromper avec
// l'autorité de la loi est pire que se tromper tout court.
for (const c of g.competences.values()) {
  if (c.obligatoire_pour.length === 0) continue;
  const cite = c.liens.some((l) => g.sources.get(l)?.type === 'droit');
  if (!cite) {
    erreurs.push(
      `compétence « ${c.id} » est déclarée obligatoire pour ${c.obligatoire_pour.join(', ')} ` +
        `sans citer de texte de droit — ajoutez l'article aux liens.`,
    );
  }
}

// La branche du pouvoir est exigée là où elle a un sens, et refusée ailleurs.
// Sans cette règle, `pouvoirs` serait un champ facultatif que personne ne
// remplirait : la classification par branche resterait à moitié faite, et une
// vue « par branche » à moitié faite est pire que pas de vue du tout.
//
// Le critère n'est pas seulement l'échelon. Une chambre régionale des comptes
// siège en région tout en étant une juridiction de l'État : c'est le fait
// d'être une juridiction ou une autorité indépendante qui appelle la réponse,
// autant que d'être une entité nationale.
for (const a of g.acteurs.values()) {
  // Les personnes physiques sont exclues : un commissaire enquêteur est
  // désigné pour une mission, il n'incarne pas une branche. Un mandat électif,
  // lui, en est bien un organe — d'où la distinction entre les deux types.
  //
  // Un service déconcentré est un organe de l'État par définition, où qu'il
  // siège : une DREAL est régionale, une chambre régionale des comptes aussi,
  // et toutes deux relèvent de l'État. C'est la nature qui tranche, pas
  // l'adresse — la première version de cette règle ne regardait que l'échelon
  // et refusait la DREAL.
  const concerne =
    (a.echelon === 'etat' && a.type !== 'personne') ||
    a.type === 'service_deconcentre' ||
    a.type === 'juridiction' ||
    a.type === 'autorite_independante';
  if (concerne && !a.pouvoirs) {
    erreurs.push(
      `acteur « ${a.id} » relève de l'État ou d'une juridiction sans déclarer sa branche — ` +
        `ajoutez « pouvoirs: [...] » (docs/02-familles.md).`,
    );
  }
  if (!concerne && a.pouvoirs) {
    erreurs.push(
      `acteur « ${a.id} » déclare une branche du pouvoir alors qu'il n'est ni national, ` +
        `ni juridiction, ni autorité indépendante — la séparation des pouvoirs ne s'y joue pas.`,
    );
  }
}

// Mécanismes, jamais de personnes — dans tout le contenu, plus seulement dans
// la famille « influence ».
//
// Depuis que le site nomme le maire de chaque commune, la frontière compte
// davantage, et elle est nette : le **graphe** décrit des fonctions — « le
// maire », « le préfet » — et le nom de leur titulaire est une **donnée**,
// produite depuis le répertoire national des élus et affichée dans la
// résolution territoriale. Un nom qui entrerait dans `contenu/` brouillerait
// exactement cette distinction, en plus de se périmer sans que rien ne le
// signale : le contenu n'a pas de date de rafraîchissement, les fichiers de
// données en ont une.
//
// Le motif vit dans `src/modele/civilites.ts` : l'ingestion des délibérations
// s'en sert aussi, pour écarter celles qui statuent sur le cas d'une personne.
// Deux copies auraient fini par diverger.
for (const [ou, t] of textesVisibles) {
  if (!nommeUnePersonne(t)) continue;
  erreurs.push(
    `${ou} semble nommer une personne physique : « ${t.slice(0, 80)}… ». Le contenu décrit ` +
      `des fonctions ; le nom de leur titulaire est une donnée, pas un nœud (docs/07-risques.md).`,
  );
}

// Un levier sans « quand » exploitable ne sert à rien : c'est la question 5.
for (const p of g.processus.values()) {
  for (const l of p.leviers) {
    if (l.quand.trim().length < 8) {
      erreurs.push(`levier « ${l.id} » : le champ « quand » doit dire jusqu'à quand on peut agir`);
    }
  }
}

// Un processus ne peut pas être plus sûr que ses étapes.
//
// La règle est venue de la relecture : les onze processus portaient
// `confiance: etabli` ou `a_confirmer` indépendamment de leurs étapes, si bien
// qu'un processus pouvait se déclarer établi pendant que cinq de ses six étapes
// restaient à vérifier. Or c'est l'étape qui porte le délai, et le délai est ce
// qu'un lecteur vient chercher : un processus « établi » dont les délais ne le
// sont pas afficherait une assurance qu'il n'a pas.
//
// La réciproque n'est pas vraie : un processus dont toutes les étapes sont
// vérifiées peut rester `a_confirmer` si son ordonnancement, lui, ne l'est pas.
// On ne contraint donc que dans un sens.
for (const p of g.processus.values()) {
  if (p.confiance !== 'etabli') continue;
  const restent = [
    ...p.etapes.filter((e) => e.confiance === 'a_confirmer').map((e) => `étape ${e.ordre}`),
    ...p.leviers.filter((l) => l.confiance === 'a_confirmer').map((l) => `levier ${l.id}`),
  ];
  if (restent.length > 0) {
    erreurs.push(
      `processus « ${p.id} » se déclare établi alors que ${restent.length} de ses ` +
        `éléments restent à confirmer (${restent.slice(0, 3).join(', ')}` +
        `${restent.length > 3 ? '…' : ''}) — un processus n'est pas plus sûr que ses étapes.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Fraîcheur
 * ------------------------------------------------------------------ */

const perimees: string[] = [];
const controlerFraicheur = (type: string, id: string, e: { verifie_le: Date; perime_apres_mois: number }) => {
  if (estPerime(e)) perimees.push(`${type} « ${id} » — dernière vérification le ${formaterDate(e.verifie_le)}`);
};
for (const [id, a] of g.acteurs) controlerFraicheur('acteur', id, a);
for (const [id, c] of g.competences) controlerFraicheur('compétence', id, c);
for (const [id, f] of g.flux) controlerFraicheur('flux', id, f);
for (const [id, p] of g.processus) controlerFraicheur('processus', id, p);

/**
 * Les fichiers territoriaux disent-ils encore ce que dit le contenu ?
 *
 * `public/territoires/meta.json` est écrit par `npm run territoires`, pas par
 * le build : corriger une réserve dans les compétences ne suffit donc pas à la
 * corriger sur le site. C'est la panne la plus silencieuse possible — le
 * contenu est juste, la validation passe, et le panneau affiche l'ancien
 * texte. On l'a vécu en écrivant la réserve du cimetière.
 *
 * Trois champs seulement sont recopiés dans meta.json, et ce sont eux qu'on
 * compare. Les autres — couverture, natures, découpage — sont des mesures
 * faites sur la donnée, pas du contenu : elles ne peuvent pas diverger d'une
 * source qu'on tiendrait à jour ici.
 */
const META = 'public/territoires/meta.json';
if (existsSync(META)) {
  const meta = JSON.parse(readFileSync(META, 'utf8')) as {
    obligatoires?: Record<string, string[]>;
    reserves?: Record<string, string>;
    aDefaut?: Record<string, string>;
  };
  const comp = [...g.competences.values()];
  const attendu = {
    obligatoires: Object.fromEntries(
      comp.filter((c) => c.obligatoire_pour.length > 0).map((c) => [c.id, c.obligatoire_pour]),
    ),
    reserves: Object.fromEntries(comp.filter((c) => c.reserve).map((c) => [c.id, c.reserve])),
    aDefaut: Object.fromEntries(comp.filter((c) => c.a_defaut).map((c) => [c.id, c.a_defaut])),
  };
  for (const champ of ['obligatoires', 'reserves', 'aDefaut'] as const) {
    const ici = JSON.stringify(attendu[champ]);
    const la = JSON.stringify(meta[champ] ?? {});
    if (ici !== la) {
      erreurs.push(
        `${META} → ${champ} ne reflète plus contenu/competences.yaml — ` +
          `relancez « npm run territoires -- --cache » pour le régénérer.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * Liens (réseau, sur demande)
 * ------------------------------------------------------------------ */

if (verifierLiens) {
  const urls = [...g.sources.values()];
  console.log(`${GRIS}Vérification de ${urls.length} liens…${RAZ}`);
  const lots = 5;
  for (let i = 0; i < urls.length; i += lots) {
    await Promise.all(
      urls.slice(i, i + lots).map(async (s) => {
        try {
          const r = await fetch(s.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
          if (!r.ok && r.status !== 405) avertissements.push(`source « ${s.id} » : ${r.status} sur ${s.url}`);
        } catch (e) {
          avertissements.push(`source « ${s.id} » : injoignable (${(e as Error).message})`);
        }
      }),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Les mentions légales
 *
 * L'article 6 de la loi pour la confiance dans l'économie numérique impose à
 * tout site accessible au public de dire qui l'édite et qui l'héberge. Ces
 * informations ne se déduisent d'aucune donnée : elles sont déclarées dans
 * `contenu/editeur.yaml`.
 *
 * L'obligation naît de la mise à disposition du public, pas de l'écriture du
 * contenu : le manque est donc un avertissement ici, et une erreur avec
 * `--publication`, que le déploiement passe. Travailler sur le site reste
 * possible ; le publier avec des mentions vides ne l'est pas.
 * ------------------------------------------------------------------ */

const signaler = (m: string) => (publication ? erreurs : avertissements).push(m);
if (!g.editeur) {
  signaler('contenu/editeur.yaml est absent — un site public doit nommer son éditeur et son hébergeur');
} else {
  for (const [champ, valeur] of Object.entries(g.editeur)) {
    if (valeur.trim() === ATTENTE_EDITEUR) {
      signaler(`mentions légales : « ${champ} » est encore à compléter dans contenu/editeur.yaml`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Rapport
 * ------------------------------------------------------------------ */

const total =
  g.acteurs.size +
  g.competences.size +
  g.documents.size +
  g.processus.size +
  g.flux.size +
  g.sources.size +
  g.sigles.size +
  g.reperes.size +
  g.surveillances.size;
console.log(
  `${GRIS}${total} entités : ${g.acteurs.size} acteurs, ${g.competences.size} compétences, ` +
    `${g.processus.size} processus, ${g.documents.size} documents, ${g.flux.size} flux, ` +
    `${g.sources.size} sources, ${g.sigles.size} sigles, ${g.reperes.size} repères, ` +
    `${g.surveillances.size} surveillances.${RAZ}`,
);

for (const a of avertissements) console.log(`${JAUNE}avertissement${RAZ} ${a}`);
for (const p of perimees) console.log(`${JAUNE}périmé${RAZ}       ${p}`);
for (const e of erreurs) console.log(`${ROUGE}erreur${RAZ}        ${e}`);

if (erreurs.length > 0) {
  console.log(`\n${ROUGE}${erreurs.length} erreur(s) — contenu non publiable.${RAZ}`);
  process.exit(1);
}
if (fraicheurBloquante && perimees.length > 0) {
  console.log(`\n${ROUGE}${perimees.length} fiche(s) à revérifier.${RAZ}`);
  process.exit(1);
}
console.log(`\n${VERT}Contenu valide.${RAZ}${perimees.length ? ` ${perimees.length} fiche(s) à revérifier bientôt.` : ''}`);
