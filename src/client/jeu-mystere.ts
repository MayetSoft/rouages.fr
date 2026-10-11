/**
 * La commune mystère, côté navigateur : une commune du périmètre à
 * retrouver, des indices tirés de sa page, la distance et la direction après
 * chaque essai.
 */
import { aplatir } from './recherche-commune.ts';
import { boutonPhoto } from './photo-commune.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';
import { brancherPartage, EMOJI, hasard, jourDeParis, memoire, progression, type Case, type Resultat } from './jeux-commun.ts';
import { carte, direction, distance, nombre, perimetre, type Communes, type CommuneJeu } from './jeux-communes.ts';

const ESSAIS = 6;
const MINIMUM = 8;
const AU_DEPART = 2;
const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['cp', 'interco', 'departement'] };

/** Deux chiffres significatifs : « environ 1 400 habitants », pas 1 383. */
const environ = (x: number) => {
  if (x < 100) return x;
  const p = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
};
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;

/** Les indices, du plus vague au plus parlant ; ceux que la page ne renseigne pas sont sautés. */
export function indices(c: CommuneJeu, d: Communes, lieu: Lieu): string[] {
  const [nom, , , , voisines, epci, v] = c;
  const cle = (k: string) => v[d.i.findIndex((x) => x[0] === k)] ?? null;
  const l: (string | null)[] = [];
  const hab = cle('habitants');
  l.push(hab !== null ? `Environ ${nombre(environ(hab))} habitants.` : null);
  const gare = cle('gare');
  l.push(gare === null ? null : gare === 0 ? 'Elle a sa gare SNCF.' : `La gare SNCF la plus proche est à ${nombre(gare)} km.`);
  const ecoles = cle('ecoles');
  l.push(ecoles === null ? null : ecoles === 0 ? 'Elle n’a pas d’école.' : `Elle a ${ecoles === 1 ? 'une école' : `${ecoles} écoles`}.`);
  const maison = cle('prixMaison');
  l.push(maison !== null ? `Une maison s’y vend ${euros(maison)} en médiane.` : null);
  const vie = cle('niveauDeVie');
  l.push(vie !== null ? `Le niveau de vie médian y est de ${euros(vie)} par an.` : null);
  const h1901 = cle('habitants1901');
  l.push(h1901 !== null ? `En 1901, elle comptait ${nombre(h1901)} habitants.` : null);
  l.push(voisines.length ? `Elle a ${voisines.length} communes voisines.` : null);
  l.push(epci && lieu.genre !== 'interco' ? `Elle fait partie de ${epci}.` : null);
  const lettres = aplatir(nom).replace(/ /g, '').length;
  l.push(`Son nom commence par « ${nom.charAt(0)} » et compte ${lettres} lettres.`);
  return l.filter((x): x is string => x !== null);
}

export function caseDistance(km: number, trouve: boolean): Case {
  return trouve ? 'vert' : km < 5 ? 'jaune' : km < 15 ? 'orange' : 'rouge';
}

export function brancherJeuMystere(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('jx')) return;
  brancherChampLieu('jx-lieu', LIEUX);
  const garde = memoire('rouages-jeu-mystere');
  const jour = jourDeParis();
  const jouer = $<HTMLButtonElement>('jx-jouer');
  const saisie = $<HTMLInputElement>('jx-saisie');

  let lieu: Lieu | null = null;
  let codes: string[] = [];
  let data: Communes;
  let cible = '';
  let essais: string[] = [];
  let liste: string[] = [];
  let duJour = true;
  /** Le nom tel qu'on le tape, vers le code ; un homonyme du périmètre prend son code postal. */
  let parNom = new Map<string, string>();
  const cleDuJour = () => `${jour}:${lieu!.cle}`;
  const trouve = () => essais.includes(cible);
  const fini = () => trouve() || essais.length >= ESSAIS;

  const message = (texte: string) => {
    $('jx-message').textContent = texte;
    $('jx-message').hidden = !texte;
  };

  const resultat = (): Resultat | null =>
    lieu && essais.length
      ? {
          jeu: 'La commune mystère',
          embleme: '🔎',
          lieu: lieu.nom,
          jour,
          cases: essais.map((e) => caseDistance(distance(data.c[e], data.c[cible]), e === cible)),
          score: trouve() ? `${essais.length}/${ESSAIS}` : `X/${ESSAIS}`,
          adresse: `${location.origin}${location.pathname}?t=${encodeURIComponent(lieu.cle)}`,
        }
      : null;
  const remplirPartage = brancherPartage('jx', resultat, 'mystere');

  const dessinerCarte = () => {
    const boite = $('jx-carte');
    const svg = carte(
      data,
      codes,
      (code) => {
        if (fini() && code === cible) return 'jx-c cible';
        if (essais.includes(code)) return `jx-c ${caseDistance(distance(data.c[code], data.c[cible]), code === cible)}`;
        return 'jx-c';
      },
      (code) => {
        const [nom] = data.c[code];
        if (!essais.includes(code) || code === cible) return nom;
        return `${nom} : ${nombre(Math.round(distance(data.c[code], data.c[cible]) * 10) / 10)} km`;
      },
    );
    svg.setAttribute('aria-label', `Carte des ${codes.length} communes du périmètre`);
    svg.querySelectorAll('path').forEach((p, i) => p.setAttribute('data-code', codes[i]));
    boite.replaceChildren(svg);
  };

  const dessiner = () => {
    dessinerCarte();
    const ul = $('jx-indices');
    ul.innerHTML = '';
    const montres = fini() ? liste.length : Math.min(liste.length, AU_DEPART + essais.length);
    for (const t of liste.slice(0, montres)) ul.append(Object.assign(document.createElement('li'), { textContent: t }));
    const ol = $('jx-essais');
    ol.innerHTML = '';
    for (const e of essais) {
      const li = document.createElement('li');
      const ok = e === cible;
      if (ok) li.className = 'juste';
      const km = distance(data.c[e], data.c[cible]);
      li.append(
        Object.assign(document.createElement('span'), { textContent: data.c[e][0] }),
        Object.assign(document.createElement('span'), { textContent: ok ? 'trouvée' : `${nombre(Math.round(km * 10) / 10)} km` }),
        Object.assign(document.createElement('span'), { textContent: ok ? '🎉' : direction(data.c[e], data.c[cible]), title: 'La direction de la commune mystère' }),
      );
      ol.append(li);
    }
    $('jx-compteur').textContent = `${duJour ? 'Défi du jour' : 'Partie libre'} · ${fini() ? 'terminé' : `essai ${essais.length + 1} sur ${ESSAIS}`}`;
    progression($('jx-compteur'), essais.map((e) => caseDistance(distance(data.c[e], data.c[cible]), e === cible)), trouve() ? essais.length : ESSAIS);
    $('jx-essai').hidden = fini();
    if (!fini()) return;
    const [nom] = data.c[cible];
    $('jx-verdict').textContent = trouve() ? `Trouvée en ${essais.length} essai${essais.length > 1 ? 's' : ''} : ${nom}.` : `C’était ${nom}.`;
    $('jx-verdict').hidden = false;
    const contexte = $('jx-contexte');
    contexte.textContent = '';
    contexte.append(Object.assign(document.createElement('a'), { href: `/commune/${cible}`, textContent: `La page de ${nom}` }), ' : d’où viennent les indices.');
    contexte.hidden = false;
    boutonPhoto($('jx-photo'), cible, nom);
    $('jx-photo').hidden = false;
    const r = resultat()!;
    $('jx-score').textContent = r.score;
    $('jx-cases').textContent = r.cases.map((c) => EMOJI[c]).join('');
    $('jx-partage').hidden = !duJour;
    if (duJour) remplirPartage(r);
    $('jx-fin').hidden = false;
  };

  const lancer = (modeDuJour: boolean) => {
    if (!lieu || codes.length === 0) return;
    duJour = modeDuJour;
    const alea = duJour ? hasard(`${cleDuJour()}:mystere`) : Math.random;
    cible = codes[Math.floor(alea() * codes.length)];
    liste = indices(data.c[cible], data, lieu);
    essais = duJour ? (garde.lire<{ essais: string[] }>(cleDuJour())?.essais ?? []).filter((e) => data.c[e]) : [];
    $('jx-verdict').hidden = true;
    $('jx-photo').hidden = true;
    $('jx-contexte').hidden = true;
    $('jx-fin').hidden = true;
    $('jx-manche').hidden = false;
    saisie.value = '';
    dessiner();
    if (!fini()) saisie.focus();
  };

  const proposer = (code: string) => {
    if (fini() || essais.includes(code)) return;
    essais.push(code);
    if (duJour) garde.ecrire(cleDuJour(), { essais });
    saisie.value = '';
    dessiner();
  };
  $<HTMLFormElement>('jx-essai').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = parNom.get(aplatir(saisie.value));
    if (!code) {
      saisie.setCustomValidity('Choisissez une commune du périmètre dans la liste, ou sur la carte.');
      saisie.reportValidity();
      return;
    }
    if (essais.includes(code)) {
      saisie.setCustomValidity('Déjà proposée.');
      saisie.reportValidity();
      return;
    }
    proposer(code);
    if (!fini()) saisie.focus();
  });
  // Sur la carte, une commune se propose d'un clic.
  $('jx-carte').addEventListener('click', (e) => {
    const code = (e.target as Element).closest('path')?.getAttribute('data-code');
    if (code) proposer(code);
  });
  saisie.addEventListener('input', () => saisie.setCustomValidity(''));

  quandLieu(LIEUX, garde.lire<string>('lieu'), (demande) => {
    void (async () => {
      lieu = await resoudre(demande, LIEUX).catch(() => null);
      if (!lieu) return message('Cherchez un code postal, une intercommunalité, un département, ou votre commune.');
      try {
        const p = await perimetre(lieu, MINIMUM);
        codes = p.codes;
        data = p.communes;
        if (codes.length < 3) return message('Trop peu de communes ici : essayez l’intercommunalité ou le département.');
        const compte = new Map<string, number>();
        for (const c of codes) compte.set(aplatir(data.c[c][0]), (compte.get(aplatir(data.c[c][0])) ?? 0) + 1);
        parNom = new Map();
        const noms = $('jx-noms');
        noms.innerHTML = '';
        for (const c of [...codes].sort((a, b) => data.c[a][0].localeCompare(data.c[b][0], 'fr'))) {
          const [nom, cp] = data.c[c];
          const affiche = (compte.get(aplatir(nom)) ?? 0) > 1 ? `${nom} (${cp})` : nom;
          parNom.set(aplatir(affiche), c);
          noms.append(Object.assign(document.createElement('option'), { value: affiche }));
        }
        garde.ecrire('lieu', lieu.cle);
        retenirLieu(lieu.cle);
        $('jx-lieu-nom').textContent = lieu.nom;
        $('jx-lieu-detail').textContent = `(${codes.length} communes${p.elargi ? ', voisines comprises' : ''})`;
        jouer.textContent = garde.lire(cleDuJour()) ? 'Reprendre le défi du jour' : 'Jouer le défi du jour';
        $('jx-choix').hidden = false;
      } catch {
        message('Les communes n’ont pas pu être lues. Réessayez dans un instant.');
      }
    })();
  });
  jouer.addEventListener('click', () => lancer(true));
  $('jx-libre').addEventListener('click', () => lancer(false));
}
