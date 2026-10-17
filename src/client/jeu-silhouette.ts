/**
 * La silhouette, côté navigateur : une commune du périmètre à reconnaître à
 * sa forme seule, comme dans Worldle. Après chaque essai, la distance, la
 * direction, et la forme de la commune proposée, à la même échelle ; au
 * troisième essai manqué, ses voisines se dessinent autour, au cinquième, la
 * première lettre de son nom.
 */
import { aplatir } from './recherche-commune.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, hasard, jourDuJeu, memoire, progression, type Resultat } from './jeux-commun.ts';
import { carte, direction, distance, nombre, perimetre, type Communes } from './jeux-communes.ts';
import { caseDistance } from './jeu-mystere.ts';

const ESSAIS = 6;
const MINIMUM = 8;
const VOISINES_APRES = 2;
const LETTRE_APRES = 4;
const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['cp', 'interco', 'departement'] };

export function brancherSilhouette(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(`js-${id}`) as T;
  if (!$('forme')) return;
  brancherChampLieu('js-lieu', LIEUX);
  const garde = memoire('rouages-jeu-silhouette');
  const jour = jourDuJeu();
  const saisie = $<HTMLInputElement>('saisie');
  let lieu: Lieu | null = null;
  let codes: string[] = [];
  let data: Communes = { i: [], c: {} };
  let cible = '';
  let essais: string[] = [];
  let duJour = true;
  let parNom = new Map<string, string>();
  const cleDuJour = () => `${jour}:${lieu!.cle}`;
  const trouve = () => essais.includes(cible);
  const fini = () => trouve() || essais.length >= ESSAIS;
  const manques = () => essais.filter((e) => e !== cible).length;

  const message = (t: string) => {
    $('message').textContent = t;
    $('message').hidden = !t;
  };

  const resultat = (): Resultat | null =>
    lieu && essais.length
      ? {
          jeu: 'La silhouette',
          embleme: '🗺️',
          lieu: lieu.nom,
          jour,
          cases: essais.map((e) => caseDistance(distance(data.c[e], data.c[cible]), e === cible)),
          score: trouve() ? `${essais.length}/${ESSAIS}` : `X/${ESSAIS}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('js', resultat, 'silhouette');

  /** La forme de la commune mystère, seule ou avec ses voisines ; à la fin, avec son nom. */
  const dessinerForme = () => {
    const voisines = manques() >= VOISINES_APRES || fini() ? data.c[cible][4].filter((v) => data.c[v]) : [];
    const svg = carte(data, [cible, ...voisines], (c) => (c === cible ? `js-c js-cible${fini() ? ' js-cible--fin' : ''}` : 'js-c js-voisine'), (c) => (c === cible ? (fini() ? data.c[c][0] : 'La commune mystère') : data.c[c][0]));
    svg.setAttribute('aria-label', voisines.length ? `La silhouette de la commune mystère, entourée de ses ${voisines.length} voisines` : 'La silhouette de la commune mystère');
    $('forme').replaceChildren(svg);
    const indice = $('indice');
    const lettres = aplatir(data.c[cible][0]).replace(/ /g, '').length;
    indice.textContent =
      manques() >= LETTRE_APRES && !fini()
        ? `Son nom commence par « ${data.c[cible][0].charAt(0)} » et compte ${lettres} lettres.`
        : manques() >= VOISINES_APRES && !fini()
          ? 'Ses voisines sont maintenant dessinées autour d’elle.'
          : fini()
            ? ''
            : `Au ${VOISINES_APRES + 1}e essai, ses voisines apparaissent ; au ${LETTRE_APRES + 1}e, la première lettre de son nom.`;
  };

  const dessiner = () => {
    dessinerForme();
    const ol = $('essais');
    ol.innerHTML = '';
    for (const e of essais) {
      const li = document.createElement('li');
      const ok = e === cible;
      if (ok) li.className = 'juste';
      const km = distance(data.c[e], data.c[cible]);
      // La forme proposée, petite, pour comparer d'un coup d'œil.
      const mini = carte(data, [e], () => `js-c js-mini ${caseDistance(km, ok)}`, () => data.c[e][0]);
      mini.setAttribute('aria-hidden', 'true');
      li.append(
        Object.assign(document.createElement('span'), { className: 'js-mini-boite' }),
        Object.assign(document.createElement('span'), { textContent: data.c[e][0] }),
        Object.assign(document.createElement('span'), { textContent: ok ? 'trouvée' : `${nombre(Math.round(km * 10) / 10)} km` }),
        Object.assign(document.createElement('span'), { textContent: ok ? '🎉' : direction(data.c[e], data.c[cible]), title: 'La direction de la commune mystère' }),
      );
      li.firstElementChild!.append(mini);
      ol.append(li);
    }
    $('compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · ${fini() ? 'terminé' : `essai ${essais.length + 1} sur ${ESSAIS}`}`;
    progression($('compteur'), essais.map((e) => caseDistance(distance(data.c[e], data.c[cible]), e === cible)), trouve() ? essais.length : ESSAIS);
    $('essai').hidden = fini();
    if (!fini()) return;
    const [nom] = data.c[cible];
    $('verdict').textContent = trouve() ? `Trouvée en ${essais.length} essai${essais.length > 1 ? 's' : ''} : ${nom}.` : `C’était ${nom}.`;
    $('verdict').hidden = false;
    const lien = $<HTMLAnchorElement>('lien');
    lien.href = `/commune/${cible}`;
    lien.textContent = `La page de ${nom}`;
    $('contexte').hidden = false;
    const r = resultat()!;
    $('score').textContent = r.score;
    $('cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    $('partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('fin').hidden = false;
  };

  const lancer = (modeDuJour: boolean) => {
    if (!lieu || codes.length === 0) return;
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${cleDuJour()}:silhouette`) : Math.random;
    cible = codes[Math.floor(alea() * codes.length)];
    essais = duJour ? (garde.lire<string[]>(cleDuJour()) ?? []).filter((e) => data.c[e]) : [];
    $('verdict').hidden = true;
    $('contexte').hidden = true;
    $('fin').hidden = true;
    $('manche').hidden = false;
    saisie.value = '';
    dessiner();
    if (!fini()) saisie.focus();
  };

  $<HTMLFormElement>('essai').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = parNom.get(aplatir(saisie.value));
    if (!code || essais.includes(code)) {
      saisie.setCustomValidity(code ? 'Déjà proposée.' : 'Choisissez une commune du périmètre dans la liste.');
      saisie.reportValidity();
      return;
    }
    essais.push(code);
    if (duJour) garde.ecrire(cleDuJour(), essais);
    saisie.value = '';
    dessiner();
    if (!fini()) saisie.focus();
  });
  saisie.addEventListener('input', () => saisie.setCustomValidity(''));

  quandLieu(LIEUX, garde.lire<string>('lieu'), (demande) => {
    void (async () => {
      lieu = await resoudre(demande, LIEUX).catch(() => null);
      if (!lieu) return message('Cherchez un code postal, une intercommunalité ou un département.');
      try {
        const p = await perimetre(lieu, MINIMUM);
        codes = p.codes;
        data = p.communes;
        if (codes.length < 3) return message('Trop peu de communes ici : essayez l’intercommunalité ou le département.');
        const compte = new Map<string, number>();
        for (const c of codes) compte.set(aplatir(data.c[c][0]), (compte.get(aplatir(data.c[c][0])) ?? 0) + 1);
        parNom = new Map();
        const noms = $('noms');
        noms.innerHTML = '';
        for (const c of [...codes].sort((a, b) => data.c[a][0].localeCompare(data.c[b][0], 'fr'))) {
          const [nom, cp] = data.c[c];
          const affiche = (compte.get(aplatir(nom)) ?? 0) > 1 ? `${nom} (${cp})` : nom;
          parNom.set(aplatir(affiche), c);
          noms.append(Object.assign(document.createElement('option'), { value: affiche }));
        }
        garde.ecrire('lieu', lieu.cle);
        retenirLieu(lieu.cle);
        message('');
        $('lieu-nom').textContent = lieu.nom;
        $('lieu-detail').textContent = `(${codes.length} communes${p.elargi ? ', voisines comprises' : ''})`;
        $<HTMLButtonElement>('jouer').textContent = garde.lire(cleDuJour()) ? 'Reprendre le défi du jour' : 'Jouer le défi du jour';
        $('choix').hidden = false;
      } catch {
        message('Les communes n’ont pas pu être lues. Réessayez dans un instant.');
      }
    })();
  });
  $('jouer').addEventListener('click', () => lancer(true));
  $('libre').addEventListener('click', () => lancer(false));
}
