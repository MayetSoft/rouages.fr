/**
 * Le jeu des prix, côté navigateur : lit les ventes d'un département au clic
 * sur « Commencer », en tire cinq, et compte les points.
 *
 * Le tirage choisit d'abord une commune, puis une vente dans la commune : un
 * tirage parmi toutes les ventes ne montrerait presque que la préfecture.
 */

import { aLieu } from '../modele/signalement.ts';

/** [année, 0 maison ou 1 appartement, prix, surface, pièces, terrain] — voir `ventesDuJeu`. */
type VenteJeu = [number, 0 | 1, number, number, number, number];
/** Par commune : le nom, [prix médian d'une maison, prix médian au m² d'un appartement], les ventes. */
type FichierJeu = {
  maj: string;
  annees: number[];
  c: Record<string, { n: string; m: [number | null, number | null]; v: VenteJeu[] }>;
};

type Manche = { code: string; nom: string; vente: VenteJeu; essai?: number; points?: number };

const MANCHES = 5;
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const m2 = (x: number) => `${x.toLocaleString('fr-FR')} m²`;

/** 100 points pour le prix exact, 2 de moins par point d'écart. */
export function points(essai: number, prix: number): number {
  return Math.max(0, Math.round(100 - 200 * (Math.abs(essai - prix) / prix)));
}

/** Les écritures qu'on tape : « 120 000 », « 120000 € », « 120k », « 1,2 M ». */
export function lireMontant(texte: string): number | null {
  const t = texte.toLowerCase().replace(/\s| | |€/g, '').replace(',', '.');
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t);
  if (!m) return null;
  const x = Number(m[1]) * (m[2] === 'k' ? 1_000 : m[2] === 'm' ? 1_000_000 : 1);
  return x > 0 ? x : null;
}

function decrire(v: VenteJeu): string {
  const [, type, , surface, pieces, terrain] = v;
  const morceaux = [`${m2(surface)} habitables`];
  if (pieces > 0) morceaux.push(`${pieces} pièce${pieces > 1 ? 's' : ''}`);
  if (type === 0) {
    morceaux.push(
      terrain > 0
        ? terrain >= 10_000
          ? `${(terrain / 10_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ha de terrain`
          : `${m2(terrain)} de terrain`
        : 'sans terrain déclaré',
    );
  }
  return morceaux.join(' · ');
}

function tirer(jeu: FichierJeu, commune: string): Manche[] {
  const codes = commune ? [commune] : Object.keys(jeu.c);
  const vues = new Set<string>();
  const manches: Manche[] = [];
  for (let essais = 0; manches.length < MANCHES && essais < 200; essais++) {
    const code = codes[Math.floor(Math.random() * codes.length)];
    const { n, v } = jeu.c[code];
    const i = Math.floor(Math.random() * v.length);
    if (vues.has(`${code}|${i}`)) continue;
    vues.add(`${code}|${i}`);
    manches.push({ code, nom: n, vente: v[i] });
  }
  return manches;
}

export function brancherJeuPrix(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const depart = $<HTMLFormElement>('jp-depart');
  if (!depart) return;
  const dep = $<HTMLSelectElement>('jp-dep')!;
  const commune = $<HTMLSelectElement>('jp-commune')!;
  const manche = $('jp-manche')!;
  const essai = $<HTMLFormElement>('jp-essai')!;
  const saisie = $<HTMLInputElement>('jp-prix')!;
  const reponse = $('jp-reponse')!;
  const fin = $('jp-fin')!;

  const cache = new Map<string, Promise<FichierJeu>>();
  const charger = (code: string) => {
    if (!cache.has(code)) {
      const lecture = fetch(`/territoires/jeux/dvf/${code}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<FichierJeu>;
      });
      // Un échec ne reste pas en cache : le clic suivant réessaie.
      lecture.catch(() => cache.delete(code));
      cache.set(code, lecture);
    }
    return cache.get(code)!;
  };

  let partie: Manche[] = [];
  let courante = 0;
  let jeu: FichierJeu | null = null;

  // Les communes ne se proposent qu'au premier geste vers la liste : le
  // fichier n'est lu que sur une démarche de la personne.
  let proposees = '';
  const proposerCommunes = async () => {
    if (proposees === dep.value) return;
    proposees = dep.value;
    commune.length = 1;
    commune.options[0].text = 'Chargement…';
    try {
      const lu = await charger(dep.value);
      if (proposees !== dep.value) return;
      const tri = Object.entries(lu.c).sort((a, b) => a[1].n.localeCompare(b[1].n, 'fr'));
      for (const [code, { n }] of tri) commune.add(new Option(n, code));
    } catch {
      proposees = '';
    } finally {
      commune.options[0].text = 'Toutes celles du département';
    }
  };
  dep.addEventListener('change', () => {
    commune.length = 1;
    proposees = '';
  });
  for (const geste of ['focus', 'pointerdown'] as const) commune.addEventListener(geste, () => void proposerCommunes());

  const afficher = () => {
    const m = partie[courante];
    const [annee, type] = m.vente;
    $('jp-compteur')!.textContent = `Vente ${courante + 1} sur ${partie.length}`;
    $('jp-bien')!.textContent = `${type === 0 ? 'Une maison' : 'Un appartement'} ${aLieu(m.nom)}, vendu${type === 0 ? 'e' : ''} en ${annee}`;
    $('jp-details')!.textContent = decrire(m.vente);
    reponse.hidden = true;
    essai.hidden = false;
    saisie.value = '';
    saisie.setCustomValidity('');
    manche.hidden = false;
    fin.hidden = true;
    saisie.focus();
  };

  depart.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = depart.querySelector('button')!;
    bouton.disabled = true;
    try {
      jeu = await charger(dep.value);
      partie = tirer(jeu, commune.value);
      courante = 0;
      if (partie.length > 0) afficher();
    } catch {
      $('jp-compteur')!.textContent = '';
      manche.hidden = false;
      $('jp-bien')!.textContent = 'Les ventes de ce département n’ont pas pu être lues.';
      $('jp-details')!.textContent = 'Réessayez dans un instant.';
      essai.hidden = true;
      reponse.hidden = true;
    } finally {
      bouton.disabled = false;
    }
  });

  essai.addEventListener('submit', (e) => {
    e.preventDefault();
    const x = lireMontant(saisie.value);
    if (x === null) {
      saisie.setCustomValidity('Un montant en euros, par exemple 120 000.');
      saisie.reportValidity();
      return;
    }
    const m = partie[courante];
    const prix = m.vente[2];
    m.essai = x;
    m.points = points(x, prix);
    const ecart = Math.round(((x - prix) / prix) * 100);
    $('jp-verdict')!.innerHTML = '';
    const fort = document.createElement('strong');
    fort.textContent = `Vendu${m.vente[1] === 0 ? 'e' : ''} ${euros(prix)}`;
    $('jp-verdict')!.append(
      fort,
      ` (arrondi au millier). Vous disiez ${euros(x)} : ${
        ecart === 0 ? 'dans le mille' : `${Math.abs(ecart)} % de ${ecart > 0 ? 'trop' : 'moins'}`
      }, ${m.points} point${m.points > 1 ? 's' : ''}.`,
    );
    const contexte = $('jp-contexte')!;
    contexte.innerHTML = '';
    // Les médianes que la page de la commune publie déjà : un repère, sur les trois ans.
    const [mediane, m2Median] = jeu!.c[m.code].m;
    const periode = `de ${jeu!.annees[0]} à ${jeu!.annees[jeu!.annees.length - 1]}`;
    if (m.vente[1] === 0 && mediane) contexte.append(`Prix médian d’une maison ${aLieu(m.nom)} ${periode} : ${euros(mediane)}. `);
    else if (m.vente[1] === 1 && m2Median) contexte.append(`Prix médian d’un appartement ${aLieu(m.nom)} ${periode} : ${euros(m2Median)} le m². `);
    const lien = document.createElement('a');
    lien.href = `/commune/${m.code}`;
    lien.textContent = 'La page de la commune';
    contexte.append(lien, '.');
    essai.hidden = true;
    reponse.hidden = false;
    $('jp-suivante')!.textContent = courante + 1 < partie.length ? 'Vente suivante' : 'Voir le score';
    $<HTMLButtonElement>('jp-suivante')!.focus();
  });

  $('jp-suivante')!.addEventListener('click', () => {
    courante++;
    if (courante < partie.length) return afficher();
    const total = partie.reduce((s, m) => s + (m.points ?? 0), 0);
    $('jp-score')!.textContent = `${total} points sur ${partie.length * 100}`;
    const recap = $('jp-recap')!;
    recap.innerHTML = '';
    for (const m of partie) {
      const li = document.createElement('li');
      li.textContent = `${m.vente[1] === 0 ? 'Maison' : 'Appartement'} ${aLieu(m.nom)} (${m.vente[0]}) : ${euros(m.vente[2])}, vous disiez ${euros(m.essai ?? 0)} — ${m.points} pt${(m.points ?? 0) > 1 ? 's' : ''}`;
      recap.append(li);
    }
    manche.hidden = true;
    fin.hidden = false;
    $<HTMLButtonElement>('jp-rejouer')!.focus();
  });

  $('jp-rejouer')!.addEventListener('click', () => depart.requestSubmit());
}
