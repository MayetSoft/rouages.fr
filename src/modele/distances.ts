/**
 * Les phrases des habitants à distance (`fiche-vie.ts`, `Acces`) : du
 * médecin généraliste le plus proche, et des arrêts desservis. Partagées par
 * la page de commune et par le contrôle (`verifier-geo`).
 */
import type { Acces } from './fiche-vie.ts';
import { libelleSemaine } from './desserte.ts';

const nf = (v: number) => v.toLocaleString('fr-FR');

/** « 500 mètres », « 4,1 kilomètres » : au-dessous du kilomètre, à la centaine de mètres. */
export function distance(km: number): string {
  if (km < 0.1) return 'moins de 100 mètres';
  const m = Math.round(km * 10) * 100;
  if (m < 1000) return `${m} mètres`;
  const k = Math.round(km * 10) / 10;
  return `${k.toLocaleString('fr-FR')} kilomètre${k >= 2 ? 's' : ''}`;
}

export function phraseMedecin(a: Acces): string | null {
  const m = a.medecin;
  if (!m) return null;
  const [p1, p5, p10] = m.parts;
  const moitie =
    m.mediane === null
      ? `La moitié des ${nf(a.habitants)} habitants de la commune vivent à plus de soixante kilomètres du cabinet d’un médecin généraliste`
      : `La moitié des ${nf(a.habitants)} habitants de la commune vivent à ${m.mediane < 0.1 ? 'moins de 100 mètres' : `${distance(m.mediane)} ou moins`} du cabinet d’un médecin généraliste`;
  return `${moitie}, à vol d’oiseau ; ${p1} % à un kilomètre ou moins, ${p5} % à cinq kilomètres ou moins${p10 < 100 ? `, et ${100 - p10} % à plus de dix kilomètres` : ''}.`;
}

export function phraseArrets(a: Acces): string | null {
  const x = a.arrets;
  if (!x) return null;
  const semaine = a.semaine ? ` ${libelleSemaine(a.semaine)}` : '';
  return (
    `${x.desservi} % des habitants vivent à 800 mètres ou moins — une dizaine de minutes à pied — d’un arrêt où passe au moins un bus, un car ou un train dans la semaine${semaine}, ` +
    `et ${x.frequent} % d’un arrêt desservi au moins dix fois chaque jour du lundi au vendredi.`
  );
}
