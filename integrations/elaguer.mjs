/**
 * Retire de `dist/` les données que seul le build lit.
 *
 * Les fichiers de `public/territoires/` sont copiés tels quels dans `dist/`.
 * Tant que le panneau de la carte dressait sa propre fiche de commune, le
 * navigateur en lisait dix-neuf par département ; il n'en lit plus que deux —
 * les groupements et le prix de l'eau —, le reste étant écrit dans la page de
 * chaque commune au build. Les laisser dans `dist/` envoyait à chaque
 * déploiement quelque deux mille fichiers que personne ne demande.
 *
 * La liste est celle de ce qu'on garde, pas de ce qu'on retire : un jeu ajouté
 * demain reste hors du site tant qu'un script du navigateur n'en a pas besoin.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ce que le navigateur lit à la racine de `/territoires` — dont les listes
 * complètes des marchés et des associations, chargées à la demande —, et
 * `echeances.json`, `attributions.json` et `avis.json`, que personne ne lit
 * sur le site : ils sont publiés pour être téléchargés.
 */
const RACINE_GARDEE = new Set([
  'index.json',
  'deps.json',
  'meta.json',
  'dep',
  'marches',
  'associations',
  'echeances.json',
  'attributions.json',
  'avis.json',
]);

/** Par département : les groupements (`03.json`) et le prix de l'eau (`03-eau.json`). */
const DEP_GARDE = /^[0-9AB]{2,3}(-eau)?\.json$/;

export function elaguer() {
  return {
    name: 'rouages-elaguer',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const territoires = join(fileURLToPath(dir), 'territoires');
        let retires = 0;
        let entrees;
        try {
          entrees = readdirSync(territoires);
        } catch {
          return;
        }
        for (const nom of entrees) {
          if (RACINE_GARDEE.has(nom)) continue;
          rmSync(join(territoires, nom), { recursive: true, force: true });
          retires++;
        }
        const dep = join(territoires, 'dep');
        for (const nom of readdirSync(dep)) {
          if (DEP_GARDE.test(nom)) continue;
          rmSync(join(dep, nom), { force: true });
          retires++;
        }
        logger.info(`${retires} fichiers de données retirés de dist/ : seul le build les lit.`);
      },
    },
  };
}
