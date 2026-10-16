/**
 * Repérer qu'un texte nomme une personne physique.
 *
 * La règle du projet tient en une phrase : le graphe décrit des fonctions, et
 * le nom d'un titulaire est une donnée d'annuaire, jamais un nœud
 * (`docs/07-risques.md`). Deux usages en découlent, et c'est pour qu'ils ne
 * divergent pas que le motif vit ici plutôt que dans l'un des deux :
 *
 *   — `scripts/valider.ts` refuse un nom écrit en dur dans `contenu/` ;
 *   — `scripts/deliberations-emettre.ts` écarte les délibérations dont l'objet
 *     nomme quelqu'un, parce que ce sont précisément celles qui statuent sur
 *     le cas d'une personne — une cession de parcelle, une aide sociale, une
 *     préemption.
 *
 * Contrôle grossier — une civilité suivie d'une majuscule — mais il attrape
 * l'écart le plus probable. Il ne prétend pas être complet : « Vente Dupont »
 * y échappe, et aucune expression régulière ne rattrapera cela. Il rend la
 * relecture obligatoire, il ne la remplace pas.
 */
import prenoms from './prenoms.json' with { type: 'json' };
export const CIVILITES =
  /\b(?:M\.|MM\.|Mme|Mmes|Monsieur|Madame|Maître|Mlle|MME|MMES|MLLE|MONSIEUR|MADAME|MAITRE|MAÎTRE)\s+(?!(?:la|le|les|l['’]|LA|LE|LES|L['’])\s|(?:la|le|les|LA|LE|LES)$|D['’ ]|d['’]|D?OEUVRE|D?OUVRAGE)[A-ZÉÈÀÂÎÔÛÇ]/;

export function nommeUnePersonne(texte: string): boolean {
  return CIVILITES.test(texte);
}

/*
 * Un particulier nommé sans civilité : « subvention à Jean Dupont », « cadeau de
 * départ à Marie DURAND ». La règle du projet exclut les particuliers cités dans
 * les délibérations ; le motif des civilités n'en attrapait qu'une partie. Celui-ci
 * cherche un prénom courant — porté par au moins cinq conseillers municipaux au
 * répertoire des élus (`prenoms.json`, `scripts/prenoms-emettre.ts`) — suivi d'un
 * mot à majuscule, sauf quand il nomme un lieu (« rue Jean Moulin », « école
 * publique Henri Matisse ») ou un mot courant (« Agence France Locale »).
 *
 * Il écarte trop plutôt que pas assez : un équipement nommé d'après quelqu'un
 * sans mot de lieu devant (« grille tarifaire Jean Moulin ») part avec. C'est le
 * sens voulu — une délibération de moins sur la page, plutôt qu'un particulier
 * nommé. Mesuré le 16 octobre 2026 sur les 6 931 intitulés publiés : 30 écartés,
 * dont une vingtaine de particuliers que le motif des civilités laissait passer.
 */

const plier = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Des prénoms qui sont aussi des mots, des lieux ou des fonctions : jamais pris pour un prénom. */
const MOTS = new Set(
  (
    'france noel maire aime mercedes marine rose pierre claire ange olive constant grace aurore prudence victoire fleur marin ' +
    'modeste juste fortune prosper franc blanche avril mai juin ville lire loire seine garonne dordogne marne sarthe vienne ' +
    'charente gironde orne jura savoie corse florence valence lorraine champagne bretagne normandie provence sologne berry ' +
    'camargue esperance paris lyon nancy toussaint espace centre gare port mont val bois perle reine prince roi printemps ete ' +
    'automne hiver soleil etoile aube ciel lune vie foi joie paix liberte amour dimanche paques pentecote urbain urbaine ' +
    'cecile mathieu'
  ).split(' '),
);
const PRENOMS = new Set(prenoms.p.map(plier).filter((p) => !MOTS.has(p)));

const LIEUX =
  'rue|rues|avenue|av\\.?|place|pl\\.?|[ée]cole|coll[èe]ge|lyc[ée]e|salle|espace|all[ée]e|boulevard|bd|impasse|chemin|square|stade|gymnase|' +
  'centre|parc|quai|m[ée]diath[èe]que|r[ée]sidence|groupe|maison|foyer|pont|cit[ée]|lotissement|fondation|institut|saint|sainte|st|ste|' +
  'promenade|jardin|halle|piscine|complexe|cours|esplanade|rond-point|giratoire|passage|sentier|hameau|lieu-dit|clos|domaine|mus[ée]e|' +
  'th[ée][âa]tre|cin[ée]ma|biblioth[èe]que|ehpad|cr[èe]che|prix|troph[ée]e|bourse|label|gare|port|carrefour|plateau|zac|za|zone|parking|' +
  'aire|salon|auditorium|amphith[ée][âa]tre|monument|st[èe]le|plaque|statue|buste|association|amicale|club|comit[ée]|fonds|concours|' +
  'festival|exposition|hommage|ape|apel|canot|navire|bateau|vedette|refuge|chapelle|[ée]glise|abbaye|ch[âa]teau|manoir|ferme|moulin|' +
  'lavoir|fontaine|terrain|plaine|pr[ée]|bassin|base|campus|universit[ée]|h[ôo]pital|clinique|p[ôo]le|march[ée]|v[ée]lodrome|' +
  'boulodrome|skatepark|dojo|tennis|golf|camping|lande|landes|lieu|village|quartier|[îi]le|pointe|anse|cap|bourg';
const TITRES =
  "(?:(?:du|de la|des|de|d'|d’|l'|l’|le|la|aux?|g[ée]n[ée]ral|docteur|dr|abb[ée]|pr[ée]sident|mar[ée]chal|colonel|capitaine|commandant|" +
  'lieutenant|professeur|p[èe]re|fr[èe]re|s(?:œ|oe)ur|m[èe]re|saint|sainte|chanoine|amiral|aviateur|po[èe]te|r[ée]sistant|patron)\\s+)*';
/** Juste avant le prénom : un mot de lieu, un adjectif peut-être (« école publique »), des titres (« rue du Général »). */
const AVANT = new RegExp(`(?<![a-zà-ÿ])(?:[ld][_'’]?)?(?:${LIEUX})(?:\\s+[a-zàâçéèêëîïôûùüÿœ'’-]+)?\\s+${TITRES}$`, 'i');
const ARTICLE = /\b(?:du|des)\s+$/i;
const MOTIF =
  /(?<![\p{L}-])(\p{Lu}[\p{L}]+(?:-\p{Lu}[\p{L}]+)?)\s+((?:(?:Le|La|De|Du|Des|Van|Von|Mac|Mc|Di|Da|Dos|D’|D'|LE|LA|DE|DU|DES)\s*)?\p{Lu}[\p{L}'’-]{1,})/gu;

export function nommeUnParticulier(texte: string): boolean {
  if (CIVILITES.test(texte)) return true;
  for (const m of texte.matchAll(MOTIF)) {
    const prenom = plier(m[1]);
    if (!PRENOMS.has(prenom) && !prenom.split('-').every((x) => PRENOMS.has(x))) continue;
    if (MOTS.has(plier(m[2]).split(/\s+/).pop() ?? '')) continue;
    const debut = texte.slice(0, m.index);
    if (AVANT.test(debut) || ARTICLE.test(debut)) continue;
    return true;
  }
  return false;
}
