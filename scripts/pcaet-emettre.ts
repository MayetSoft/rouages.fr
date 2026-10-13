/**
 * Le plan climat-air-énergie territorial (PCAET) de chaque intercommunalité,
 * d'après la plateforme Territoires & Climat de l'ADEME, où les collectivités
 * déposent leur projet pour avis et doivent déposer leur plan adopté
 * (article L229-26 du code de l'environnement). Deux jeux, publiés sous
 * Licence Ouverte sur data.ademe.fr : les démarches des deux versions de la
 * plateforme.
 *
 * C'est le bout local d'une chaîne qui part de l'accord de Paris : la
 * stratégie nationale bas-carbone le décline, et une intercommunalité de plus
 * de 20 000 habitants doit la prendre en compte dans son plan.
 *
 * **Ce qui n'est pas repris** : le chef de projet, les contacts, l'élu
 * référent — des noms de personnes que la règle du site écarte —, ni les
 * commentaires libres. On garde la collectivité porteuse (SIREN), le nom du
 * plan, l'état de la démarche, la mention « obligé » ou « volontaire » telle
 * que le registre la porte, et les dates.
 *
 * **Ce que l'absence ne dit pas** : une intercommunalité absente du registre
 * n'a pas forcément manqué à son obligation ; la page dit seulement que le
 * registre ne porte pas de démarche.
 *
 * Lancé seul — `npx tsx scripts/pcaet-emettre.ts` —, il réécrit
 * `public/territoires/pcaet.json`.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pcaet } from '../src/modele/pcaet.ts';
import { telechargerSiAbsent } from './par-departement.ts';

const API = 'https://data.ademe.fr/data-fair/api/v1/datasets';
export const JEUX_PCAET = ['pcaet-(v2)-demarches-partie-1-entete', 'pcaet-demarches-partie-1-entete'];
const CHAMPS = ['Id', 'SIREN_collectivites_coporteuses', 'Collectivités_porteuses', 'Nom', 'Demarche_etat', 'Oblige', 'Date_lancement', 'Date_modification'];

type Ligne = Record<string, string | number | null | undefined>;
type LireJson = (url: string) => Promise<unknown>;

const texte = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
/** Une date du registre, ou rien : il en porte d'aberrantes (« 0021-06-05 »). */
const date = (v: unknown) => {
  const t = texte(v).slice(0, 10);
  return /^(19[9]\d|20\d\d)-\d\d-\d\d$/.test(t) ? t : null;
};

export async function collecterPcaet(lireJson: LireJson, dire: (m: string) => void): Promise<Pcaet> {
  const parSiren: Pcaet['c'] = {};
  const versions: Pcaet['jeux'] = [];
  for (const jeu of JEUX_PCAET) {
    const meta = (await lireJson(`${API}/${encodeURIComponent(jeu)}`)) as { updatedAt?: string; count?: number };
    const q = new URLSearchParams({ size: '10000', select: CHAMPS.join(',') });
    const { results = [] } = (await lireJson(`${API}/${encodeURIComponent(jeu)}/lines?${q}`)) as { results?: Ligne[] };
    if (meta.count && results.length < meta.count) throw new Error(`${jeu} : ${results.length} lignes lues sur ${meta.count}`);
    let gardees = 0;
    for (const l of results) {
      const siren = texte(l.SIREN_collectivites_coporteuses);
      if (!/^\d{9}$/.test(siren)) continue;
      const fiche = {
        nom: texte(l.Nom),
        porteur: texte(l['Collectivités_porteuses']),
        etat: texte(l.Demarche_etat),
        oblige: texte(l.Oblige) === 'O' ? true : texte(l.Oblige) === 'V' ? false : null,
        lancement: date(l.Date_lancement),
        modification: date(l.Date_modification),
        jeu,
      };
      // Une intercommunalité peut avoir plusieurs démarches : la plus récemment modifiée.
      const avant = parSiren[siren];
      if (!avant || (fiche.modification ?? '') > (avant.modification ?? '')) parSiren[siren] = fiche;
      gardees++;
    }
    versions.push({ jeu, maj: meta.updatedAt?.slice(0, 10) ?? null, lignes: gardees });
  }
  const n = Object.keys(parSiren).length;
  if (n < 100) throw new Error(`Plans climat : ${n} collectivités seulement — le registre a changé de forme`);
  dire(`Plans climat : ${n} collectivités porteuses, d'après ${versions.map((v) => `${v.lignes} démarches (${v.jeu})`).join(' et ')}.`);
  return { maj: new Date().toISOString().slice(0, 10), jeux: versions, c: parSiren };
}

export function ecrirePcaet(sortie: string, p: Pcaet): void {
  writeFileSync(join(sortie, 'pcaet.json'), JSON.stringify(p));
}

// Lancé seul.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const racine = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const { lireJson, sortie } = telechargerSiAbsent(racine);
  if (!existsSync(sortie)) throw new Error('public/territoires absent');
  ecrirePcaet(sortie, await collecterPcaet(lireJson, console.log));
}
