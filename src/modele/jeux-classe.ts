/**
 * Le contenu des jeux pour les plus jeunes (`contenu/jeux-classe.yaml`) :
 * les scènes d'« À qui je demande ? », les paires de « Qui s'en occupe ? »,
 * les affirmations de « Vrai ou faux ».
 *
 * Rien n'y est affirmé sans fiche : chaque entrée nomme une compétence du
 * réseau, et le contrôle vérifie que la bonne réponse est bien celle que dit
 * la fiche — l'échelon de l'acteur qui détient la compétence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { nommeUnePersonne } from './civilites.ts';
import { chargerGraphe } from './graphe.ts';

/** Les cinq portes d'« À qui je demande ? ». */
export const PORTES = {
  commune: { nom: 'La mairie', detail: 'la commune', emoji: '🏛️' },
  interco: { nom: 'L’intercommunalité', detail: 'les communes voisines ensemble', emoji: '🤝' },
  departement: { nom: 'Le département', detail: 'le conseil départemental', emoji: '🗺️' },
  region: { nom: 'La région', detail: 'le conseil régional', emoji: '🧭' },
  etat: { nom: 'L’État', detail: 'les ministères, la préfecture, la gendarmerie', emoji: '🇫🇷' },
} as const;
export type Porte = keyof typeof PORTES;

/** L'échelon d'un acteur du réseau, ramené à une porte. */
const PORTE_DE_L_ECHELON: Record<string, Porte> = { commune: 'commune', epci: 'interco', departement: 'departement', region: 'region', etat: 'etat' };

export interface Scene { id: string; emoji: string; texte: string; porte: Porte; competence: string; explication: string }
export interface Paire { id: string; emoji: string; objet: string; porte: Porte; competence: string }
export interface VraiFaux { id: string; affirmation: string; reponse: boolean; competence: string; explication: string }
export interface JeuxClasse { scenes: Scene[]; paires: Paire[]; vrai_faux: VraiFaux[] }

let cache: JeuxClasse | undefined;
export function jeuxClasse(racine = process.cwd()): JeuxClasse {
  if (cache) return cache;
  const brut = parse(readFileSync(join(racine, 'contenu', 'jeux-classe.yaml'), 'utf8')) as Partial<JeuxClasse> | null;
  cache = { scenes: brut?.scenes ?? [], paires: brut?.paires ?? [], vrai_faux: brut?.vrai_faux ?? [] };
  return cache;
}

/** La porte que la fiche donne à une compétence : celle de l'échelon de son acteur. */
export function porteDeLaCompetence(id: string): Porte | null {
  const g = chargerGraphe();
  const c = g.competences.get(id);
  const a = c ? g.acteurs.get(c.acteur) : undefined;
  return a ? (PORTE_DE_L_ECHELON[a.echelon] ?? null) : null;
}

/** Le contrôle, appelé par `npm run valider`. */
export function controlerJeuxClasse(j = jeuxClasse()): string[] {
  const g = chargerGraphe();
  const erreurs: string[] = [];
  const ou = (famille: string, id: string) => `contenu/jeux-classe.yaml → ${famille} ${id}`;
  const vus = new Set<string>();
  const competence = (famille: string, id: string, c: string) => {
    const fiche = g.competences.get(c);
    if (!fiche) erreurs.push(`${ou(famille, id)} : compétence « ${c} » inconnue`);
    else if (fiche.confiance !== 'etabli') erreurs.push(`${ou(famille, id)} : la compétence « ${c} » n'est pas établie (${fiche.confiance})`);
    return fiche;
  };
  const texte = (famille: string, id: string, ...t: string[]) => {
    for (const x of t) if (nommeUnePersonne(x)) erreurs.push(`${ou(famille, id)} : semble nommer une personne`);
  };
  const unique = (famille: string, id: string) => {
    if (vus.has(`${famille}:${id}`)) erreurs.push(`${ou(famille, id)} : identifiant en double`);
    vus.add(`${famille}:${id}`);
  };

  for (const s of j.scenes) {
    unique('scène', s.id);
    if (!(s.porte in PORTES)) erreurs.push(`${ou('scène', s.id)} : porte « ${s.porte} » inconnue`);
    if (competence('scène', s.id, s.competence)) {
      const attendue = porteDeLaCompetence(s.competence);
      if (attendue !== s.porte) erreurs.push(`${ou('scène', s.id)} : la fiche « ${s.competence} » donne « ${attendue} », pas « ${s.porte} »`);
    }
    texte('scène', s.id, s.texte, s.explication);
  }
  for (const p of j.paires) {
    unique('paire', p.id);
    if (competence('paire', p.id, p.competence)) {
      const attendue = porteDeLaCompetence(p.competence);
      if (attendue !== p.porte) erreurs.push(`${ou('paire', p.id)} : la fiche « ${p.competence} » donne « ${attendue} », pas « ${p.porte} »`);
    }
    texte('paire', p.id, p.objet);
  }
  // Une partie de « Qui s'en occupe ? » tire un objet par porte : il en faut pour chacune.
  for (const porte of Object.keys(PORTES)) {
    if (!j.paires.some((p) => p.porte === porte)) erreurs.push(`contenu/jeux-classe.yaml → paires : aucune pour « ${porte} »`);
  }
  for (const v of j.vrai_faux) {
    unique('vrai-faux', v.id);
    competence('vrai-faux', v.id, v.competence);
    if (typeof v.reponse !== 'boolean') erreurs.push(`${ou('vrai-faux', v.id)} : réponse vrai ou faux attendue`);
    if (!v.explication.startsWith(v.reponse ? 'Vrai' : 'Faux')) erreurs.push(`${ou('vrai-faux', v.id)} : l’explication doit commencer par « ${v.reponse ? 'Vrai' : 'Faux'} »`);
    texte('vrai-faux', v.id, v.affirmation, v.explication);
  }
  return erreurs;
}
