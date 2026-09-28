/**
 * Chargement du contenu : YAML → validation → graphe indexé.
 *
 * Le contenu vit dans des fichiers versionnés, un par rouage, plus des entités
 * partagées dans `contenu/communs`. On ne passe pas par une base : le contenu
 * est l'actif du projet, il doit rester relisible, diffable et reprenable
 * ailleurs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import {
  FichierContenu,
  type Acteur,
  type Competence,
  type Document,
  type Flux,
  type Processus,
  type Decouverte,
  type Editeur,
  type Repere,
  type Sigle,
  type Surveillance,
  type Source,
} from './schemas.ts';

export const RACINE = new URL('../../', import.meta.url).pathname;
const DOSSIER_CONTENU = 'contenu';

export interface Anomalie {
  fichier: string;
  chemin: string;
  message: string;
  gravite: 'erreur' | 'avertissement';
}

export interface Graphe {
  acteurs: Map<string, Acteur>;
  competences: Map<string, Competence>;
  documents: Map<string, Document>;
  processus: Map<string, Processus>;
  flux: Map<string, Flux>;
  sources: Map<string, Source>;
  sigles: Map<string, Sigle>;
  reperes: Map<string, Repere>;
  surveillances: Map<string, Surveillance>;
  decouverte?: Decouverte;
  /** Les mentions légales, déclarées dans `contenu/editeur.yaml`. */
  editeur?: Editeur;
  anomalies: Anomalie[];
}

/** Tout le YAML de `contenu/`, à n'importe quelle profondeur. */
function fichiersYaml(dossier = join(RACINE, DOSSIER_CONTENU)): string[] {
  if (!existsSync(dossier)) return [];
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersYaml(chemin));
    else if (entree.name.endsWith('.yaml') || entree.name.endsWith('.yml')) trouves.push(chemin);
  }
  return trouves;
}

let cache: Graphe | undefined;

export function chargerGraphe(): Graphe {
  if (cache) return cache;

  const g: Graphe = {
    acteurs: new Map(),
    competences: new Map(),
    documents: new Map(),
    processus: new Map(),
    flux: new Map(),
    sources: new Map(),
    sigles: new Map(),
    reperes: new Map(),
    surveillances: new Map(),
    anomalies: [],
  };

  // Les id des familles qui deviennent des nœuds. Le réseau les range dans une
  // seule table : un document et un processus qui porteraient le même id ne se
  // signaleraient pas — l'un remplacerait l'autre et sa page disparaîtrait sans
  // bruit. Les sources n'en sont pas : elles sont citées, jamais affichées comme
  // nœud, et `cada` désigne légitimement l'autorité et la page qui la décrit.
  const FAMILLES_NOEUD = new Set(['acteurs', 'competences', 'documents', 'processus']);
  const vus = new Map<string, string>();

  for (const fichier of fichiersYaml()) {
    const court = relative(RACINE, fichier);
    let brut: unknown;
    try {
      brut = parse(readFileSync(fichier, 'utf8'));
    } catch (e) {
      g.anomalies.push({
        fichier: court,
        chemin: '',
        message: `YAML illisible : ${(e as Error).message}`,
        gravite: 'erreur',
      });
      continue;
    }

    const resultat = FichierContenu.safeParse(brut ?? {});
    if (!resultat.success) {
      for (const souci of resultat.error.issues) {
        g.anomalies.push({
          fichier: court,
          chemin: souci.path.join('.'),
          message: souci.message,
          gravite: 'erreur',
        });
      }
      continue;
    }

    const contenu = resultat.data;
    const ranger = <T extends { id: string }>(liste: T[], index: Map<string, T>, type: string) => {
      const noeud = FAMILLES_NOEUD.has(type);
      for (const entite of liste) {
        const ailleurs = noeud ? vus.get(entite.id) : index.has(entite.id) ? type : undefined;
        if (ailleurs) {
          g.anomalies.push({
            fichier: court,
            chemin: `${type}.${entite.id}`,
            message:
              ailleurs === type
                ? `id déjà utilisé ailleurs — les id sont uniques et jamais réutilisés`
                : `id déjà porté par un nœud de type « ${ailleurs} » — les id sont uniques d'une famille à l'autre`,
            gravite: 'erreur',
          });
          continue;
        }
        if (noeud) vus.set(entite.id, type);
        index.set(entite.id, entite);
      }
    };

    ranger(contenu.sources, g.sources, 'sources');
    ranger(contenu.acteurs, g.acteurs, 'acteurs');
    ranger(contenu.competences, g.competences, 'competences');
    ranger(contenu.documents, g.documents, 'documents');
    ranger(contenu.processus, g.processus, 'processus');
    ranger(contenu.flux, g.flux, 'flux');
    ranger(contenu.sigles, g.sigles, 'sigles');
    ranger(contenu.reperes, g.reperes, 'reperes');
    ranger(contenu.surveillances, g.surveillances, 'surveillances');
    if (contenu.decouverte) g.decouverte = contenu.decouverte;
    if (contenu.editeur) g.editeur = contenu.editeur;
  }

  verifierReferences(g);
  cache = g;
  return g;
}

/**
 * Intégrité référentielle : un id cité mais inexistant est une erreur bloquante.
 * C'est ce qui garantit qu'un schéma généré ne peut pas mentir sur ses liens.
 */
function verifierReferences(g: Graphe): void {
  const exige = (
    id: string,
    index: Map<string, unknown>,
    type: string,
    chemin: string,
  ): void => {
    if (!index.has(id)) {
      g.anomalies.push({
        fichier: 'contenu',
        chemin,
        message: `référence inconnue vers ${type} « ${id} »`,
        gravite: 'erreur',
      });
    }
  };

  const exigeLiens = (liens: string[], chemin: string) => {
    for (const s of liens) exige(s, g.sources, 'page de référence', `${chemin}.liens`);
  };

  for (const a of g.acteurs.values()) exigeLiens(a.liens, `acteur ${a.id}`);

  for (const c of g.competences.values()) {
    exigeLiens(c.liens, `competence ${c.id}`);
    exige(c.acteur, g.acteurs, 'acteur', `competence ${c.id}.acteur`);
    for (const p of c.partagee_avec) exige(p, g.acteurs, 'acteur', `competence ${c.id}.partagee_avec`);
  }

  for (const d of g.documents.values()) exigeLiens(d.liens, `document ${d.id}`);

  for (const f of g.flux.values()) {
    exigeLiens(f.liens, `flux ${f.id}`);
    exige(f.de, g.acteurs, 'acteur', `flux ${f.id}.de`);
    for (const v of f.vers) exige(v, g.acteurs, 'acteur', `flux ${f.id}.vers`);
  }

  for (const s of g.surveillances.values()) {
    if (s.lien) exige(s.lien, g.sources, 'page de référence', `surveillance ${s.id}.lien`);
  }

  // L'ordre des repères est celui du tableau poste par poste : un parent vient
  // avant ses parts, et un repère calculé après ceux dont il se déduit.
  const vus = new Set<string>();
  for (const r of g.reperes.values()) {
    exigeLiens(r.liens, `repère ${r.id}`);
    if (r.flux) exige(r.flux, g.flux, 'flux', `repère ${r.id}.flux`);
    const erreur = (chemin: string, message: string) =>
      g.anomalies.push({ fichier: 'contenu', chemin: `repère ${r.id}${chemin}`, message, gravite: 'erreur' });
    if (!!r.agregat === !!r.difference) erreur('', 'porte un agrégat de l’OFGL ou une différence, et un seul des deux');
    if (r.parent && !vus.has(r.parent)) erreur('.parent', `renvoie vers « ${r.parent} », absent ou placé après lui`);
    for (const d of r.difference ?? []) {
      if (!vus.has(d)) erreur('.difference', `renvoie vers « ${d} », absent ou placé après lui`);
    }
    vus.add(r.id);
  }

  for (const s of g.sigles.values()) {
    exigeLiens(s.liens, `sigle ${s.sigle}`);
    if (s.noeud) {
      const existe =
        g.acteurs.has(s.noeud) || g.competences.has(s.noeud) || g.processus.has(s.noeud) || g.documents.has(s.noeud);
      if (!existe) {
        g.anomalies.push({
          fichier: 'contenu',
          chemin: `sigle ${s.sigle}.noeud`,
          message: `renvoie vers un nœud inconnu « ${s.noeud} »`,
          gravite: 'erreur',
        });
      }
    }
  }

  for (const p of g.processus.values()) {
    exigeLiens(p.liens, `processus ${p.id}`);
    exige(p.decideur, g.acteurs, 'acteur', `processus ${p.id}.decideur`);
    for (const c of p.competences) exige(c, g.competences, 'compétence', `processus ${p.id}.competences`);
    const ordres = new Set<number>();
    for (const e of p.etapes) {
      if (ordres.has(e.ordre)) {
        g.anomalies.push({
          fichier: 'contenu',
          chemin: `processus ${p.id}.etapes`,
          message: `deux étapes portent l'ordre ${e.ordre}`,
          gravite: 'erreur',
        });
      }
      ordres.add(e.ordre);
      exige(e.acteur, g.acteurs, 'acteur', `processus ${p.id}.etape ${e.ordre}.acteur`);
      exigeLiens(e.liens, `processus ${p.id}.etape ${e.ordre}`);
      for (const d of e.produit) exige(d, g.documents, 'document', `processus ${p.id}.etape ${e.ordre}.produit`);
    }
    for (const l of p.leviers) {
      exigeLiens(l.liens, `levier ${l.id}`);
      exige(l.acteur, g.acteurs, 'acteur', `levier ${l.id}.acteur`);
      if (l.ancre_etape !== undefined && !ordres.has(l.ancre_etape)) {
        g.anomalies.push({
          fichier: 'contenu',
          chemin: `levier ${l.id}.ancre_etape`,
          message: `ancré sur l'étape ${l.ancre_etape}, qui n'existe pas dans « ${p.id} »`,
          gravite: 'erreur',
        });
      }
    }
  }
}

/** Une entité est périmée quand personne ne l'a revérifiée depuis trop longtemps. */
export function estPerime(entite: { verifie_le: Date; perime_apres_mois: number }, maintenant = new Date()): boolean {
  const limite = new Date(entite.verifie_le);
  limite.setMonth(limite.getMonth() + entite.perime_apres_mois);
  return maintenant > limite;
}

export function formaterDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formaterDelai(delai: { valeur: number; unite: string }): string {
  const pluriel = delai.valeur > 1;
  const unites: Record<string, [string, string]> = {
    jours: ['jour', 'jours'],
    semaines: ['semaine', 'semaines'],
    mois: ['mois', 'mois'],
    annees: ['an', 'ans'],
  };
  const [s, p] = unites[delai.unite] ?? [delai.unite, delai.unite];
  return `${delai.valeur} ${pluriel ? p : s}`;
}

/** Durée en jours, pour mettre les étapes à l'échelle sur la chronologie. */
export function enJours(delai: { valeur: number; unite: string }): number {
  const facteurs: Record<string, number> = { jours: 1, semaines: 7, mois: 30.44, annees: 365.25 };
  return delai.valeur * (facteurs[delai.unite] ?? 1);
}
