/**
 * Vérifie la lecture des fichiers d'horaires (`scripts/horaires-gtfs.ts`) sur
 * un GTFS fabriqué : services du calendrier et leurs exceptions, courses à
 * fréquence, arrêt où l'on ne peut pas monter, fichier qui ne couvre pas la
 * semaine ; la fusion des fichiers d'un même jeu (le plus grand), de jeux
 * différents (la somme) et d'un agrégat (le plus grand des deux) ; le choix
 * de la semaine de classe ; la phrase de la page.
 *
 * Les comptes sur de vrais fichiers ont été recoupés, le 16 octobre 2026, par
 * un second compteur écrit à part : voir `docs/05-roadmap.md`.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libelleSemaine, phraseDesserte } from '../src/modele/desserte.ts';
import { collecterHoraires, lireHoraires, semaineDeClasse } from './horaires-gtfs.ts';
import { zip } from './zip-essai.ts';

let erreurs = 0;
const egal = (quoi: string, obtenu: unknown, attendu: unknown) => {
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu)) {
    console.error(`${quoi} : attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
    erreurs++;
  }
};

const SEMAINE = ['20261102', '20261103', '20261104', '20261105', '20261106', '20261107', '20261108'];
const f = (t: string) => Buffer.from(t.trim() + '\n');

/** Un réseau : X en desserte quotidienne, Y seulement le samedi, Z sans passage, P une gare (non comptée). */
function reseau(debut = '20260101', fin = '20271231', exceptions = true): Buffer {
  return zip([
    ['agency.txt', f('agency_id,agency_name,agency_url,agency_timezone\nA,Essai,https://exemple.fr,Europe/Paris')],
    [
      'calendar.txt',
      f(`﻿service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
S1,1,1,1,1,1,0,0,${debut},${fin}
S2,1,0,0,0,0,0,0,${debut},${fin}
S3,1,1,1,1,1,1,1,${debut},${fin}`),
    ],
    ['calendar_dates.txt', f(`service_id,date,exception_type${exceptions ? '\nS3,20261103,2\nS4,20261107,1' : ''}`)],
    ['routes.txt', f('route_id,route_short_name,route_long_name,route_type\nR1,A,,3\nR2,,Ligne B,3')],
    ['trips.txt', f('route_id,service_id,trip_id\nR1,S1,T1\nR1,S2,T2\nR2,S3,T3\nR2,S4,T4\nR1,S1,T5')],
    ['frequencies.txt', f('trip_id,start_time,end_time,headway_secs\nT5,07:00:00,09:00:00,1800')],
    [
      'stop_times.txt',
      f(`trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type
T1,08:00:00,08:00:00,X,1,0
T1,08:10:00,08:10:00,Y,2,1
T2,07:00:00,07:00:00,X,1,
T3,25:10:00,25:10:00,X,1,0
T4,10:00:00,10:00:00,Y,1,0
T5,07:00:00,07:00:00,X,1,0`),
    ],
    [
      'stops.txt',
      f(`stop_id,stop_name,stop_lat,stop_lon,location_type
X,"Place, centre",46.07,3.66,0
Y,Mairie,46.08,3.67,
Z,Calvaire,46.09,3.68,0
P,Gare,46.07,3.66,1`),
    ],
  ]);
}

const dossier = mkdtempSync(join(tmpdir(), 'verifier-horaires-'));
try {
  writeFileSync(join(dossier, 'reseau.zip'), reseau());
  const h = await lireHoraires(join(dossier, 'reseau.zip'), SEMAINE);
  egal('couvre', h.couvre, true);
  const par = new Map(h.arrets.map((a) => [a.id, a]));
  // X : T1 en semaine, T2 le lundi, T3 tous les jours sauf le mardi 3, T5 quatre départs en semaine.
  egal('X, passages', par.get('X')?.n, [7, 5, 6, 6, 6, 1, 1]);
  egal('X, nom entre guillemets', par.get('X')?.nom, 'Place, centre');
  egal('X, lignes', [...(par.get('X')?.lignes ?? [])].sort(), ['A', 'Ligne B']);
  // Y : on n'y monte pas dans T1 ; T4 ajouté le samedi par exception.
  egal('Y, passages', par.get('Y')?.n, [0, 0, 0, 0, 0, 1, 0]);
  egal('Z, sans passage mais présent', par.get('Z')?.n, [0, 0, 0, 0, 0, 0, 0]);
  egal('P, une gare, absente', par.has('P'), false);

  writeFileSync(join(dossier, 'perime.zip'), reseau('20250101', '20250630', false));
  const perime = await lireHoraires(join(dossier, 'perime.zip'), SEMAINE);
  egal('fichier périmé : ne couvre pas', [perime.couvre, perime.arrets.length], [false, 0]);

  // La fusion : le jeu J1 a deux copies du même fichier, J2 est un autre réseau aux mêmes arrêts, AG un agrégat.
  const cache = join(dossier, 'cache');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(cache);
  for (const id of ['f1', 'f2', 'f3']) writeFileSync(join(cache, `${id}.zip`), reseau());
  writeFileSync(join(cache, 'f4.zip'), reseau());
  const muet = () => {};
  const c = await collecterHoraires(
    [
      { id: 'J1', agregat: false, fichiers: [{ id: 'f1', urls: [] }, { id: 'f2', urls: [] }] },
      { id: 'J2', agregat: false, fichiers: [{ id: 'f3', urls: [] }] },
      { id: 'AG', agregat: true, fichiers: [{ id: 'f4', urls: [] }] },
    ],
    SEMAINE,
    () => '03165',
    cache,
    muet,
  );
  const x = c.desserte.get('03165')?.get('place centre');
  // Deux copies dans J1 : une fois ; J2 en plus : deux fois ; l'agrégat (une fois) ne l'emporte pas.
  egal('fusion : copies, réseaux, agrégat', x?.n, [14, 10, 12, 12, 12, 2, 2]);
  egal('fusion : lignes par jeu', x?.lignes.size, 4);
  egal('commune couverte', c.couvertes.has('03165'), true);

  // La semaine : après la Toussaint 2026 ; puis en sautant celle du 11 novembre.
  const VACANCES = { results: [{ start_date: '2026-10-16T22:00:00+00:00', end_date: '2026-11-01T23:00:00+00:00' }] };
  const FERIES = { '2026-11-01': 'Toussaint', '2026-11-11': '11 novembre', '2026-12-25': 'Noël' };
  const lire = async (url: string) => (url.includes('calendrier-scolaire') ? VACANCES : FERIES);
  egal('semaine après les vacances', await semaineDeClasse(lire, '2026-10-16'), SEMAINE);
  egal('semaine sans jour férié', (await semaineDeClasse(lire, '2026-11-03'))[0], '20261116');

  egal('phrase, internat', phraseDesserte([1, 0, 0, 0, 1, 0, 0]), '2 passages dans la semaine, 1 le lundi et 1 le vendredi');
  egal('phrase, gare', phraseDesserte([322, 322, 322, 322, 322, 289, 38]), '322 passages par jour du lundi au vendredi, 289 le samedi et 38 le dimanche');
  egal('phrase, sans week-end', phraseDesserte([3, 3, 3, 3, 3, 0, 0]), '3 passages par jour du lundi au vendredi et aucun le week-end');
  egal('semaine sur deux mois', libelleSemaine('2026-11-30'), 'du 30 novembre au 6 décembre 2026');
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

if (erreurs) {
  console.error(`${erreurs} erreur(s) dans la lecture des horaires.`);
  process.exit(1);
}
console.log('Horaires : calendrier, exceptions, fréquences, montée interdite, couverture, fusion, semaine de classe et phrase conformes.');
