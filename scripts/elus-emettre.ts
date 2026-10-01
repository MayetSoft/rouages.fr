/**
 * Le maire, et comment joindre la mairie.
 *
 * Le site nomme des structures ; il ne nommait personne. « La commune décide »
 * ne dit pas à qui écrire, et c'est pourtant la question qui amène la plupart
 * des visiteurs.
 *
 * **La règle éditoriale n'est pas levée, elle est précisée.** Le graphe reste
 * des mécanismes : le nœud est « le maire », la fonction, jamais son titulaire.
 * Le nom est une précision de donnée attachée à la résolution territoriale, au
 * même titre que le nom de la communauté de communes. Aucun nom de personne
 * n'entre dans `contenu/` — la règle de validation y veille — ils ne vivent que
 * dans les fichiers produits ici, depuis le Répertoire national des élus.
 *
 * **Minimisation.** Le répertoire publie aussi la date de naissance, le sexe et
 * la catégorie socio-professionnelle de chaque élu. Rien de tout cela ne sert à
 * savoir qui décide : on ne garde que le nom, le prénom et la date de prise de
 * fonction. Ce qui n'est pas collecté n'a pas à être protégé.
 *
 * **La péremption est le vrai risque.** Un nom périmé est pire qu'un nom
 * absent : il envoie écrire à quelqu'un qui n'est plus en fonction. D'où la
 * date affichée avec le nom, et la surveillance du répertoire dans la veille.
 *
 * **Cette date est celle du mandat en cours, pas l'ancienneté.** Le répertoire
 * la remet à zéro à chaque scrutin : les 34 743 maires qu'il nomme portent tous
 * une date de 2026, sans une exception. Un maire reconduit depuis vingt ans y
 * figure à la date du dernier scrutin, et le site écrit donc « mandat en cours
 * depuis » plutôt qu'« en fonction depuis », qui serait faux pour lui.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eluRetire } from './retraits.ts';

/**
 * Le répertoire n'est pas téléchargeable en un fichier depuis tous les
 * réseaux : l'API tabulaire de data.gouv le sert par pages de cent, ce qui
 * marche partout. 349 pages, environ 90 secondes.
 */
const RESSOURCE = '2876a346-d50c-4911-934e-19ee07b0e503';
const BASE = `https://tabular-api.data.gouv.fr/api/resources/${RESSOURCE}/data/`;
const PAGE = 100;

interface Maire {
  /** Nom de famille, tel que publié : le répertoire l'écrit en capitales. */
  nom: string;
  prenom: string;
  /** Début du mandat en cours : c'est elle qui date la réponse, pas l'ancienneté. */
  depuis: string;
}

export interface Elus {
  /** Code INSEE -> le maire en fonction. */
  parCommune: Map<string, Maire>;
  /** La date à laquelle le répertoire a été lu. */
  maj: string;
}

export async function collecterMaires(
  json: <T>(url: string) => Promise<T>,
  dire: (m: string) => void,
): Promise<Elus | null> {
  type Ligne = Record<string, string | number | null>;
  type Reponse = { data: Ligne[]; meta: { total: number } };

  const premier = await json<Reponse>(`${BASE}?page_size=${PAGE}&page=1`);
  const total = premier.meta?.total ?? 0;
  if (total === 0) {
    dire('Répertoire des élus : aucune ligne, la ressource a changé de forme.');
    return null;
  }
  const pages = Math.ceil(total / PAGE);

  const parCommune = new Map<string, Maire>();
  const retenir = (lignes: Ligne[]) => {
    for (const l of lignes) {
      const code = String(l['Code de la commune'] ?? '');
      const nom = String(l["Nom de l'élu"] ?? '').trim();
      const prenom = String(l["Prénom de l'élu"] ?? '').trim();
      if (!code || !nom) continue;
      // Une opposition reçue : la commune garde son maire, sans nom.
      if (eluRetire(code, 'Maire')) continue;
      // Ni date de naissance, ni sexe, ni catégorie socio-professionnelle :
      // le répertoire les publie, ils ne servent pas ici.
      parCommune.set(code, {
        nom,
        prenom,
        depuis: String(l['Date de début de la fonction'] ?? l['Date de début du mandat'] ?? ''),
      });
    }
  };

  retenir(premier.data);
  for (let p = 2; p <= pages; p++) {
    const d = await json<Reponse>(`${BASE}?page_size=${PAGE}&page=${p}`);
    retenir(d.data);
  }

  if (parCommune.size < total * 0.9) {
    throw new Error(
      `Répertoire des élus : ${parCommune.size} communes lues pour ${total} lignes annoncées — ` +
        `des pages ont été perdues, mieux vaut échouer que publier un annuaire troué.`,
    );
  }
  dire(`Répertoire des élus : ${parCommune.size.toLocaleString('fr-FR')} maires en fonction.`);
  return { parCommune, maj: new Date().toISOString().slice(0, 10) };
}

/** Un fichier par département, comme le reste. */
export function ecrireElus(sortie: string, dep: string, codes: string[], elus: Elus): number {
  const c: Record<string, [string, string, string]> = {};
  let n = 0;
  for (const code of [...codes].sort()) {
    const m = elus.parCommune.get(code);
    if (!m) continue;
    c[code] = [m.prenom, m.nom, m.depuis];
    n++;
  }
  if (n === 0) return 0;
  writeFileSync(join(sortie, 'dep', `${dep}-elus.json`), JSON.stringify({ dep, maj: elus.maj, c }));
  return n;
}
