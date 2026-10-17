/**
 * La commune d'un point, d'après les contours des communes
 * (`dep/XX-contours.json`, Admin Express) : une grille d'un dixième de degré
 * dit quelles communes regarder, le cadre de chacune écarte vite les autres,
 * et le contour tranche. Partagé par les arrêts de transport
 * (`transports-emettre.ts`) et les carreaux de l'INSEE (`acces-emettre.ts`).
 */
import { dedans, ECHELLE, type Anneau } from './espaces-emettre.ts';

/** Les coordonnées sont en degrés multipliés par `ECHELLE`, comme celles des contours. */
export function localisateur(contours: Map<string, Anneau[]>): (x: number, y: number) => string | null {
  const CASE = 0.1 * ECHELLE;
  const cadres = new Map<string, [number, number, number, number]>();
  const grille = new Map<string, string[]>();
  for (const [code, anneaux] of contours) {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of anneaux)
      for (let i = 0; i < r.length; i += 2) {
        x0 = Math.min(x0, r[i]);
        x1 = Math.max(x1, r[i]);
        y0 = Math.min(y0, r[i + 1]);
        y1 = Math.max(y1, r[i + 1]);
      }
    cadres.set(code, [x0, y0, x1, y1]);
    for (let cx = Math.floor(x0 / CASE); cx <= Math.floor(x1 / CASE); cx++)
      for (let cy = Math.floor(y0 / CASE); cy <= Math.floor(y1 / CASE); cy++) (grille.get(`${cx},${cy}`) ?? grille.set(`${cx},${cy}`, []).get(`${cx},${cy}`)!).push(code);
  }
  return (x, y) => {
    for (const code of grille.get(`${Math.floor(x / CASE)},${Math.floor(y / CASE)}`) ?? []) {
      const k = cadres.get(code)!;
      if (x < k[0] || x > k[2] || y < k[1] || y > k[3]) continue;
      if (dedans(x, y, contours.get(code)! as Anneau[])) return code;
    }
    return null;
  };
}
