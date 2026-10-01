/**
 * Les représentants d'intérêts installés dans la commune, d'après le
 * répertoire de la Haute Autorité pour la transparence de la vie publique.
 *
 * Le répertoire est tenu pour que le public sache qui cherche à influencer la
 * décision publique (loi du 9 décembre 2016, dite « Sapin II ») : chaque
 * organisation y déclare elle-même son adresse, ses dirigeants et les
 * secteurs où elle agit. C'est le seul registre public qui nomme des
 * dirigeants d'associations, et seulement pour celles qui font de la
 * représentation d'intérêts — les autres restent anonymes, faute de source
 * (`CLAUDE.md`, « Les noms dans les données »).
 *
 * **Ce qui est repris** : l'organisation, sa catégorie, ses secteurs, ses
 * dirigeants avec leur fonction, et le lien vers sa fiche à la HATVP. **Ce
 * qui ne l'est pas** : les collaborateurs chargés des actions, l'adresse, le
 * téléphone, les clients. Une organisation dont le SIREN figure dans
 * `retraits.yaml` reste citée, sans ses dirigeants.
 *
 * Le rattachement suit l'adresse déclarée au répertoire — son code postal et
 * sa ville —, avec la table qui sert au BODACC : une organisation sans code
 * postal reconnu n'est rattachée à aucune commune plutôt qu'à une devinée.
 *
 * Lancé seul — `npx tsx scripts/hatvp-emettre.ts` —, il réécrit
 * `dep/XX-hatvp.json` depuis `.cache/hatvp-agora.json` s'il y est.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexDuDecoupage, rattacheur } from './entreprises-emettre.ts';
import { telechargerSiAbsent } from './par-departement.ts';
import { retraits } from './retraits.ts';

const AGORA = 'https://www.hatvp.fr/agora/opendata/agora_repertoire_opendata.json';

interface Publication {
  denomination?: string;
  identifiantNational?: string;
  typeIdentifiantNational?: string;
  categorieOrganisation?: { label?: string };
  codePostal?: string;
  ville?: string;
  pays?: string;
  dirigeants?: { nom?: string; prenom?: string; fonction?: string }[];
  activites?: { listSecteursActivites?: { label?: string }[] };
  datePremierePublication?: string;
}

/** Nom, identifiant, catégorie, secteurs, dirigeants (« Prénom NOM », fonction), première publication (AAAA-MM-JJ). */
export type Representant = [string, string, string, string[], [string, string][], string];

export interface Hatvp {
  maj: string;
  communes: Map<string, Representant[]>;
}

const jour = (fr: string | undefined) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(fr ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

export function lireHatvp(publications: Publication[], index: [string, string, string, string, number][], dire: (m: string) => void): Hatvp {
  const rattacher = rattacheur(index);
  const communes = new Map<string, Representant[]>();
  const retires = retraits().entreprises;
  let rattachees = 0;
  let dirigeants = 0;
  for (const p of publications) {
    const nom = (p.denomination ?? '').trim();
    const id = (p.identifiantNational ?? '').trim();
    if (!nom || !id) continue;
    if ((p.pays ?? 'FRANCE').toUpperCase() !== 'FRANCE') continue;
    const code = rattacher(p.ville ?? '', p.codePostal ?? '');
    if (!code) continue;
    const sansNoms = p.typeIdentifiantNational === 'SIREN' && retires.has(id);
    const dir: [string, string][] = sansNoms
      ? []
      : (p.dirigeants ?? [])
          .map((d): [string, string] => [`${(d.prenom ?? '').trim()} ${(d.nom ?? '').trim()}`.trim(), (d.fonction ?? '').trim()])
          .filter(([n]) => n);
    const secteurs = (p.activites?.listSecteursActivites ?? []).map((s) => (s.label ?? '').trim()).filter(Boolean).slice(0, 4);
    const r: Representant = [nom, id, (p.categorieOrganisation?.label ?? '').trim(), secteurs, dir, jour(p.datePremierePublication)];
    communes.set(code, [...(communes.get(code) ?? []), r]);
    rattachees++;
    dirigeants += dir.length;
  }
  for (const l of communes.values()) l.sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  dire(
    `HATVP : ${publications.length.toLocaleString('fr-FR')} représentants d'intérêts au répertoire, ` +
      `${rattachees.toLocaleString('fr-FR')} rattachés à ${communes.size.toLocaleString('fr-FR')} communes, ` +
      `${dirigeants.toLocaleString('fr-FR')} dirigeants nommés.`,
  );
  return { maj: new Date().toISOString().slice(0, 10), communes };
}

export async function collecterHatvp(
  telecharger: (url: string, vers: string) => Promise<void>,
  cache: string,
  index: [string, string, string, string, number][],
  dire: (m: string) => void,
): Promise<Hatvp | null> {
  const fichier = join(cache, 'hatvp-agora.json');
  await telecharger(AGORA, fichier);
  const brut = JSON.parse(readFileSync(fichier, 'utf8')) as { publications?: Publication[] };
  if (!brut.publications?.length) {
    dire('HATVP : le répertoire est vide, il a changé de forme.');
    return null;
  }
  return lireHatvp(brut.publications, index, dire);
}

const departementDe = (code: string) => (code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2));

export function ecrireHatvp(sortie: string, h: Hatvp): number {
  const parDep = new Map<string, Record<string, Representant[]>>();
  for (const [code, l] of [...h.communes].sort((a, b) => a[0].localeCompare(b[0]))) {
    const dep = departementDe(code);
    if (!parDep.has(dep)) parDep.set(dep, {});
    parDep.get(dep)![code] = l;
  }
  let n = 0;
  for (const [dep, c] of parDep) {
    if (!existsSync(join(sortie, 'dep', `${dep}.json`))) continue;
    writeFileSync(join(sortie, 'dep', `${dep}-hatvp.json`), JSON.stringify({ maj: h.maj, c }));
    n++;
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cache, telecharger, sortie } = telechargerSiAbsent(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  const h = await collecterHatvp(telecharger, cache, indexDuDecoupage(), console.log);
  if (h) console.log(`${ecrireHatvp(sortie, h)} départements écrits.`);
}
