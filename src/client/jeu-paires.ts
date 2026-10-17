/**
 * Qui s'en occupe ?, côté navigateur : un jeu de paires. Dix cartes
 * retournées — cinq objets, cinq responsables, un objet par responsable —, on
 * en retourne deux ; une paire juste reste visible. Le score est le nombre de
 * coups ; chaque paire a sa case, selon les erreurs commises sur ses cartes.
 */
import { brancherPartage, EMOJI, feter, hasard, jourDuJeu, melanger, memoire, type Case, type Resultat } from './jeux-commun.ts';

type Paire = [string, string, string, string, string, string];
type Carte = { paire: number; cote: 'objet' | 'porte'; emoji: string; texte: string };

export function brancherPaires(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`jp-${id}`) as T;
  if (!$('cartes')) return;
  const { paires, portes } = JSON.parse(document.getElementById('jp-donnees')?.textContent ?? '{}') as {
    paires: Paire[];
    portes: Record<string, [string, string]>;
  };
  const garde = memoire('rouages-jeu-paires');
  const jour = jourDuJeu();
  let tirees: Paire[] = [];
  let cartes: Carte[] = [];
  let trouvees = new Set<number>();
  let erreurs: number[] = [];
  let ouvertes: number[] = [];
  let coups = 0;
  let duJour = true;
  let bloque = false;

  const cases = (): Case[] => erreurs.map((e) => (e === 0 ? 'vert' : e <= 2 ? 'jaune' : e <= 4 ? 'orange' : 'rouge'));
  const resultat = (): Resultat | null =>
    tirees.length
      ? { jeu: 'Qui s’en occupe ?', embleme: '🃏', lieu: null, jour, cases: cases(), score: `en ${coups} coups`, adresse: `${location.origin}${location.pathname}` }
      : null;
  const remplirPartage = brancherPartage('jp', resultat, 'paires');

  /** Une paire par responsable : cinq objets, jamais deux pour la même porte. */
  const tirer = (alea: () => number): Paire[] => {
    const parPorte = new Map<string, Paire[]>();
    for (const p of paires) parPorte.set(p[3], [...(parPorte.get(p[3]) ?? []), p]);
    return [...parPorte.values()].map((l) => melanger(l, alea)[0]);
  };

  const dessiner = () => {
    const ul = $('cartes');
    ul.innerHTML = '';
    cartes.forEach((c, i) => {
      const visible = trouvees.has(c.paire) || ouvertes.includes(i);
      const b = Object.assign(document.createElement('button'), { type: 'button', className: `paire-carte paire-${c.cote}` });
      b.classList.toggle('visible', visible);
      b.classList.toggle('trouvee', trouvees.has(c.paire));
      b.disabled = trouvees.has(c.paire) || bloque;
      b.setAttribute('aria-label', visible ? c.texte : 'Carte retournée');
      if (visible) {
        b.append(Object.assign(document.createElement('span'), { className: 'paire-emoji', textContent: c.emoji }), Object.assign(document.createElement('span'), { className: 'paire-texte', textContent: c.texte }));
      } else b.append(Object.assign(document.createElement('span'), { className: 'paire-dos', textContent: '?' }));
      b.addEventListener('click', () => retourner(i));
      const li = document.createElement('li');
      li.append(b);
      ul.append(li);
    });
    $('compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · ${trouvees.size} paire${trouvees.size > 1 ? 's' : ''} sur ${tirees.length} · ${coups} coup${coups > 1 ? 's' : ''}`;
  };

  const retourner = (i: number) => {
    if (bloque || ouvertes.includes(i) || trouvees.has(cartes[i].paire)) return;
    ouvertes.push(i);
    if (ouvertes.length < 2) return dessiner();
    coups++;
    const [a, b] = ouvertes.map((k) => cartes[k]);
    if (a.paire === b.paire) {
      trouvees.add(a.paire);
      const p = tirees[a.paire];
      $('dernier').textContent = `${p[1]} ${p[2]} : ${portes[p[3]][0].toLowerCase()}.`;
      ouvertes = [];
      dessiner();
      if (trouvees.size === tirees.length) finir();
      return;
    }
    erreurs[a.paire]++;
    erreurs[b.paire]++;
    bloque = true;
    dessiner();
    setTimeout(() => {
      ouvertes = [];
      bloque = false;
      dessiner();
    }, 1100);
  };

  const finir = () => {
    const r = resultat()!;
    if (duJour) garde.ecrire(jour, { coups, erreurs });
    afficherFin(r);
  };

  const afficherFin = (r: Resultat) => {
    $('score').textContent = `Bravo ! ${r.score}`;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    const recap = $('recap');
    recap.innerHTML = '';
    tirees.forEach(([, emoji, objet, porte, competence, nom], k) => {
      const li = document.createElement('li');
      li.append(`${EMOJI[r.cases[k]]} ${emoji} ${objet} → ${portes[porte][1]} ${portes[porte][0]} — `, Object.assign(document.createElement('a'), { href: `/n/${competence}`, textContent: `la fiche « ${nom} »` }));
      recap.append(li);
    });
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('manche').hidden = true;
    $('fin').hidden = false;
    if (r.cases.filter((c) => c === 'vert').length >= 3) feter();
  };

  const lancer = (modeDuJour: boolean) => {
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${jour}:paires`) : Math.random;
    tirees = tirer(alea);
    cartes = melanger(
      tirees.flatMap((p, k): Carte[] => [
        { paire: k, cote: 'objet', emoji: p[1], texte: p[2] },
        { paire: k, cote: 'porte', emoji: portes[p[3]][1], texte: portes[p[3]][0] },
      ]),
      alea,
    );
    trouvees = new Set();
    erreurs = tirees.map(() => 0);
    ouvertes = [];
    coups = 0;
    $('debut').hidden = true;
    $('dernier').textContent = '';
    const deja = duJour ? garde.lire<{ coups: number; erreurs: number[] }>(jour) : null;
    if (deja && deja.erreurs.length === tirees.length) {
      coups = deja.coups;
      erreurs = deja.erreurs;
      tirees.forEach((_, k) => trouvees.add(k));
      afficherFin(resultat()!);
      return;
    }
    $('manche').hidden = false;
    $('fin').hidden = true;
    dessiner();
  };

  $<HTMLButtonElement>('jouer').textContent = garde.lire(jour) ? 'Revoir mon résultat du jour' : 'Jouer le défi du jour';
  $('jouer').addEventListener('click', () => lancer(true));
  $('libre').addEventListener('click', () => lancer(false));
}
