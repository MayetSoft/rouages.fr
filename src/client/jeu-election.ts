/**
 * L'élection de la classe, côté navigateur : les voix de vingt-cinq élèves
 * entre trois listes, et sept sièges répartis de trois façons.
 *
 * - La liste en tête prend tout.
 * - La proportionnelle à la plus forte moyenne : chaque siège, l'un après
 *   l'autre, va à la liste dont les voix divisées par (ses sièges + 1) sont les
 *   plus fortes ; à égalité, à celle qui a le plus de voix.
 * - Le conseil municipal (code électoral, art. L262) : la moitié des sièges à
 *   la liste en tête — arrondie à l'entier supérieur au-delà de quatre sièges,
 *   inférieur en deçà —, puis les autres à la plus forte moyenne entre les
 *   listes qui ont au moins 5 % des voix, la liste en tête comprise.
 */
const ELEVES = 25;
const SIEGES = 7;
const LISTES: [string, string, string][] = [
  ['🌳', 'Liste des Arbres', 'un potager dans la cour'],
  ['⚽', 'Liste du Ballon', 'un nouveau terrain de jeux'],
  ['📚', 'Liste des Livres', 'une bibliothèque de classe'],
];

/** La plus forte moyenne : `n` sièges entre ces listes, à partir de sièges déjà attribués. */
export function plusForteMoyenne(voix: number[], n: number, admises: boolean[], depart: number[]): number[] {
  const sieges = [...depart];
  for (let k = 0; k < n; k++) {
    let meilleure = -1;
    for (let i = 0; i < voix.length; i++) {
      if (!admises[i] || voix[i] <= 0) continue;
      const m = voix[i] / (sieges[i] + 1);
      const mb = meilleure >= 0 ? voix[meilleure] / (sieges[meilleure] + 1) : -1;
      if (m > mb || (m === mb && voix[i] > voix[meilleure])) meilleure = i;
    }
    if (meilleure < 0) break;
    sieges[meilleure]++;
  }
  return sieges;
}

/** La liste en tête ; à égalité de voix, aucune (il faudrait départager). */
function enTete(voix: number[]): number {
  const max = Math.max(...voix);
  const premiers = voix.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  return premiers.length === 1 && max > 0 ? premiers[0] : -1;
}

/** La règle du conseil municipal (art. L262). */
export function conseilMunicipal(voix: number[], sieges: number): number[] | null {
  const t = enTete(voix);
  if (t < 0) return null;
  const prime = sieges > 4 ? Math.ceil(sieges / 2) : sieges < 4 ? Math.floor(sieges / 2) : sieges / 2;
  const total = voix.reduce((s, v) => s + v, 0);
  const admises = voix.map((v) => v / total >= 0.05);
  const depart = voix.map((_, i) => (i === t ? prime : 0));
  // Le reste à la plus forte moyenne, la prime mise à part : les moyennes se calculent sur les sièges du reste.
  const reste = plusForteMoyenne(voix, sieges - prime, admises, voix.map(() => 0));
  return depart.map((d, i) => d + reste[i]);
}

export function brancherElection(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`je-${id}`) as T;
  if (!$('listes')) return;
  let voix = [13, 8, 4];

  const sieges = (rep: number[]) => {
    const ol = Object.assign(document.createElement('ol'), { className: 'election-sieges' });
    rep.forEach((n, i) => {
      for (let k = 0; k < n; k++) ol.append(Object.assign(document.createElement('li'), { className: `election-siege election-siege--${i}`, textContent: LISTES[i][0], title: LISTES[i][1] }));
    });
    return ol;
  };

  const dessiner = () => {
    const total = voix.reduce((s, v) => s + v, 0);
    const ul = $('listes');
    ul.innerHTML = '';
    LISTES.forEach(([emoji, nom, projet], i) => {
      const li = Object.assign(document.createElement('li'), { className: `election-liste election-liste--${i}` });
      const tete = Object.assign(document.createElement('span'), { className: 'budget-nom' });
      tete.append(Object.assign(document.createElement('span'), { className: 'budget-emoji', textContent: emoji }), Object.assign(document.createElement('strong'), { textContent: nom }), Object.assign(document.createElement('small'), { textContent: projet }));
      const r = Object.assign(document.createElement('span'), { className: 'budget-reglage' });
      const bouton = (signe: string, pas: number) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'plat budget-pas', textContent: signe });
        b.setAttribute('aria-label', `${pas > 0 ? 'Une voix de plus' : 'Une voix de moins'} — ${nom}`);
        b.disabled = pas < 0 ? voix[i] === 0 : total >= ELEVES;
        b.addEventListener('click', () => {
          voix[i] += pas;
          dessiner();
        });
        return b;
      };
      r.append(bouton('−', -1), Object.assign(document.createElement('output'), { className: 'budget-valeur', textContent: String(voix[i]) }), bouton('+', 1));
      li.append(tete, r);
      ul.append(li);
    });
    $('reste').textContent = total === ELEVES ? `Les ${ELEVES} élèves ont voté.` : `Encore ${ELEVES - total} élève${ELEVES - total > 1 ? 's' : ''} à faire voter.`;

    const regles = $('regles');
    regles.innerHTML = '';
    const note = $('note');
    note.textContent = '';
    if (total === 0) return;
    const t = enTete(voix);
    const majorite = Math.floor(SIEGES / 2) + 1;
    const ajouter = (titre: string, rep: number[] | null, explication: string) => {
      const li = document.createElement('li');
      li.append(Object.assign(document.createElement('strong'), { textContent: titre }));
      if (rep) {
        li.append(sieges(rep));
        const qui = rep.findIndex((n) => n >= majorite);
        li.append(Object.assign(document.createElement('p'), { className: 'jeu-details', textContent: `${explication} ${qui >= 0 ? `${LISTES[qui][1]} a la majorité (${majorite} sièges sur ${SIEGES}).` : `Aucune liste n’a la majorité de ${majorite} sièges : il faudra s’entendre.`}` }));
      } else li.append(Object.assign(document.createElement('p'), { className: 'jeu-details', textContent: 'Égalité en tête : il faudrait départager les listes avant de compter.' }));
      regles.append(li);
    };
    ajouter('1. La liste en tête prend tout', t >= 0 ? voix.map((_, i) => (i === t ? SIEGES : 0)) : null, 'Les autres listes n’ont aucun siège.');
    ajouter('2. À la proportionnelle', plusForteMoyenne(voix, SIEGES, voix.map(() => true), voix.map(() => 0)), 'Chaque liste a des sièges selon ses voix.');
    ajouter('3. Comme au conseil municipal', conseilMunicipal(voix, SIEGES), `La liste en tête reçoit d’office ${Math.ceil(SIEGES / 2)} sièges, puis les ${SIEGES - Math.ceil(SIEGES / 2)} autres se partagent à la proportionnelle.`);
    if (t >= 0 && voix[t] * 2 <= total) {
      note.textContent = `${LISTES[t][1]} est en tête sans avoir plus de la moitié des voix : pour un vrai conseil municipal, il y aurait un second tour, et la prime irait à la liste arrivée en tête de ce second tour.`;
    }
    const petite = voix.findIndex((v) => v > 0 && v / total < 0.05);
    if (petite >= 0) note.textContent += `${note.textContent ? ' ' : ''}${LISTES[petite][1]} a moins de 5 % des voix : au conseil municipal, elle n’aurait aucun siège.`;
  };

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-exemple]')) {
    b.addEventListener('click', () => {
      voix = b.dataset.exemple!.split(',').map(Number);
      dessiner();
    });
  }
  dessiner();
}
