/**
 * Les comptes seuls : ceux des communes, du département et de la région, sans
 * les trente minutes de l'ingestion complète.
 *
 *   tsx scripts/comptes-emettre.ts
 *
 * Réécrit `dep/XX-finances.json`, `echelons.json` et la partie « finances » de
 * `meta.json`, en reprenant la liste des communes de `index.json`. Utile quand
 * seul l'arbre des postes de `contenu/reperes.yaml` a changé.
 *
 * Un fichier à part, et non un bloc « lancé seul » dans `finances-emettre.ts` :
 * les comptes des échelons importent ce module, et l'importer en retour depuis
 * son propre code de premier niveau ne se résoudrait jamais.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerGraphe } from '../src/modele/graphe.ts';
import { collecterEchelons, ecrireEchelons } from './echelons-emettre.ts';
import { collecterFinances, ecrireFinances, metaFinances } from './finances-emettre.ts';

const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const sortie = join(racine, 'public', 'territoires');
const obstine = async (url: string): Promise<Response> => {
  for (let essai = 0; ; essai++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (r.ok) return r;
      throw new Error(`${url} : ${r.status}`);
    } catch (e) {
      if (essai >= 5) throw e;
      await new Promise((ok) => setTimeout(ok, 3000 * (essai + 1)));
    }
  }
};

const tous = [...chargerGraphe().reperes.values()];
const c = await collecterFinances(tous, obstine, console.log);
if (!c) process.exit(1);
const index = JSON.parse(readFileSync(join(sortie, 'index.json'), 'utf8')) as {
  c: [string, string, string, string, number][];
};
const parDep = new Map<string, string[]>();
for (const [code, , , dep] of index.c) {
  if (!parDep.has(dep)) parDep.set(dep, []);
  parDep.get(dep)!.push(code);
}
let n = 0;
for (const [dep, codes] of parDep) {
  if (existsSync(join(sortie, 'dep', `${dep}.json`))) n += ecrireFinances(sortie, dep, c, codes);
}
console.log(`${n} communes écrites dans ${parDep.size} départements.`);
const chemin = join(sortie, 'meta.json');
const meta = JSON.parse(readFileSync(chemin, 'utf8')) as Record<string, unknown>;
meta.finances = metaFinances(c, new Map(index.c.map((x) => [x[0], x[4]])));
writeFileSync(chemin, JSON.stringify(meta));
const e = await collecterEchelons(tous, c.annee, async (url) => (await obstine(url)).json(), console.log);
if (e) console.log(`${ecrireEchelons(sortie, e)} départements et régions écrits.`);
