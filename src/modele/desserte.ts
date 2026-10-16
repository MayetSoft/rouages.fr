/**
 * La desserte d'un arrêt dite en une phrase : les passages du lundi au
 * dimanche (`scripts/horaires-gtfs.ts`), en clair. Quand les cars sont rares
 * ou qu'un jour de semaine n'en voit aucun, chaque jour est nommé ; sinon, la
 * semaine se résume par jour ouvré, puis le samedi et le dimanche.
 */
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const nf = (v: number) => v.toLocaleString('fr-FR');

const enumerer = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : (l[0] ?? ''));

export function phraseDesserte(jours: number[]): string {
  const total = jours.reduce((a, b) => a + b, 0);
  if (!total) return 'aucun passage';
  const ouvres = jours.slice(0, 5);
  if (total <= 12 || ouvres.some((v) => v === 0)) {
    const parJour = jours.map((v, i) => (v ? `${nf(v)} le ${JOURS[i]}` : '')).filter(Boolean);
    const seul = jours.findIndex(Boolean);
    const detail = parJour.length === 1 ? `le ${JOURS[seul]} seulement` : enumerer(parJour);
    return `${nf(total)} passage${total > 1 ? 's' : ''} dans la semaine, ${detail}`;
  }
  const min = Math.min(...ouvres);
  const max = Math.max(...ouvres);
  const semaine = min === max ? `${nf(max)} passages par jour du lundi au vendredi` : `de ${nf(min)} à ${nf(max)} passages par jour du lundi au vendredi`;
  const fin = !jours[5] && !jours[6] ? ['aucun le week-end'] : [5, 6].map((i) => (jours[i] ? `${nf(jours[i])} le ${JOURS[i]}` : `aucun le ${JOURS[i]}`));
  return enumerer([semaine, ...fin]);
}

/** « du 2 au 8 novembre 2026 », d'après le lundi. */
export function libelleSemaine(lundi: string): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  const f = new Date(d.getTime() + 6 * 86_400_000);
  const jour = (x: Date) => (x.getUTCDate() === 1 ? '1er' : String(x.getUTCDate()));
  const debut =
    d.getUTCMonth() === f.getUTCMonth()
      ? jour(d)
      : `${jour(d)} ${MOIS[d.getUTCMonth()]}${d.getUTCFullYear() === f.getUTCFullYear() ? '' : ` ${d.getUTCFullYear()}`}`;
  return `du ${debut} au ${jour(f)} ${MOIS[f.getUTCMonth()]} ${f.getUTCFullYear()}`;
}
