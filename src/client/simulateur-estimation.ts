/**
 * Le simulateur d'estimation, côté navigateur : les prix unitaires de la
 * commune (`/territoires/simulateurs/estimation/XX.json`), les surfaces
 * saisies, et le calcul poste par poste à chaque frappe.
 */
import { aLieu } from '../modele/signalement.ts';
import { brancherChampLieu, quandLieu, resoudre, retenirLieu, type Lieu, type OptionsLieu } from './jeux-lieu.ts';

/** Voir `Estimation` dans `scripts/estimation-emettre.ts`. */
type Estimation = [
  number | null,
  number | null,
  number | null,
  [number, number, number] | null,
  number | null,
  [number, number],
  [number, number, number] | null,
  number,
  number,
  number,
];
type Fichier = { maj: string; annees: number[]; tailles: [number, number]; partActivite: number; c: Record<string, Estimation> };

const LIEUX: OptionsLieu = { source: '/jeux/territoires.json', genres: ['commune'] };
const euros = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;
const arrondi = (x: number) => Math.round(x / 1000) * 1000;
const m2 = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} m²`;
const ha = (x: number) => `${(x / 10_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ha`;

export function brancherEstimation(): void {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  if (!$('se')) return;
  brancherChampLieu('se-lieu', LIEUX);
  const form = $<HTMLFormElement>('se-form');
  let lieu: Lieu | null = null;
  let f: Fichier;
  let e: Estimation;

  const message = (t: string) => {
    $('se-message').textContent = t;
    $('se-message').hidden = !t;
  };
  const champ = (n: string) => Math.max(0, Number((form.elements.namedItem(n) as HTMLInputElement).value) || 0);

  const calculer = () => {
    const [h, c, cSeul, terres, bois, [nMaisons, anneaux], precision] = e;
    const H = champ('habitable');
    const A = champ('activite');
    const part = champ('part') / 100;
    const C = champ('constructible');
    const Na = champ('agricole');
    const Nb = champ('bois');
    const etat = Number((form.elements.namedItem('etat') as HTMLInputElement).value) / 100;
    $('se-etat-valeur').textContent = etat === 0 ? 'tel quel' : `${etat > 0 ? '+' : '−'}${Math.abs(Math.round(etat * 100))} % sur le bâti`;

    const lignes: { part: string; surface: string; prix: string; valeur: number | null; note?: string }[] = [];
    const bati = H > 0 || A > 0;
    if (H > 0) lignes.push({ part: 'Habitable', surface: m2(H), prix: h ? `${euros(h)}/m²` : '—', valeur: h ? h * H * (1 + etat) : null });
    if (A > 0) lignes.push({ part: 'Local d’activité', surface: m2(A), prix: h ? `${Math.round(part * 100)} % de ${euros(h)}/m²` : '—', valeur: h ? h * part * A * (1 + etat) : null });
    if (C > 0) {
      // Le terrain d'une maison se mesure dans les ventes de maisons ; un terrain seul, dans les ventes de terrain seul.
      const unitaire = bati ? (c ?? cSeul) : (cSeul ?? c);
      lignes.push({ part: bati ? 'Terrain de la maison' : 'Terrain constructible', surface: m2(C), prix: unitaire !== null ? `${unitaire.toLocaleString('fr-FR')} €/m²` : '—', valeur: unitaire !== null ? unitaire * C : null });
    }
    if (Na > 0) {
      const t = Na < f.tailles[0] ? 0 : Na < f.tailles[1] ? 1 : 2;
      lignes.push({ part: 'Terres et prés', surface: ha(Na), prix: terres ? `${euros(terres[t])}/ha` : '—', valeur: terres ? (Na / 10_000) * terres[t] : null, note: ['moins d’un demi-hectare', 'd’un demi à deux hectares', 'plus de deux hectares'][t] });
    }
    if (Nb > 0) lignes.push({ part: 'Bois', surface: ha(Nb), prix: bois ? `${euros(bois)}/ha` : '—', valeur: bois ? (Nb / 10_000) * bois : null });

    const tbody = $('se-lignes');
    tbody.innerHTML = '';
    for (const l of lignes) {
      const tr = document.createElement('tr');
      const td = (t: string, note?: string, classe?: string) => {
        const x = document.createElement('td');
        x.textContent = t;
        if (classe) x.className = classe;
        if (note) x.append(Object.assign(document.createElement('small'), { textContent: note }));
        return x;
      };
      const part = td(l.part, l.note);
      // Le prix relevé, répété sous la part pour les petits écrans, où sa colonne disparaît.
      part.append(Object.assign(document.createElement('small'), { className: 'se-prix-court', textContent: l.prix }));
      tr.append(part, td(l.surface), td(l.prix, undefined, 'se-col-prix'), td(l.valeur === null ? 'pas assez de ventes' : euros(l.valeur)));
      tbody.append(tr);
    }
    const manque = lignes.some((l) => l.valeur === null);
    const total = lignes.reduce((s, l) => s + (l.valeur ?? 0), 0);
    $('se-total').textContent = lignes.length === 0 ? '—' : `${manque ? 'au moins ' : ''}${euros(arrondi(total))}`;
    $('se-resultat').hidden = lignes.length === 0;

    const fourchette = $('se-fourchette');
    const precisionTexte = $('se-precision');
    fourchette.textContent = '';
    precisionTexte.textContent = '';
    if (bati && precision && !manque && total > 0) {
      const [ecart, bas, haut] = precision;
      fourchette.textContent = `Entre ${euros(arrondi(total * bas))} et ${euros(arrondi(total * haut))}`;
      precisionTexte.textContent =
        `La moitié des ${nMaisons} ventes de maisons ${anneaux === 0 ? 'de la commune' : `de la commune et de ses voisines (${anneaux} anneau${anneaux > 1 ? 'x' : ''})`} ` +
        `se sont vendues dans cette fourchette autour de leur estimation ; l’écart médian est de ${Math.round(ecart * 100)} %. ` +
        'Le curseur d’état sert à le réduire : les ventes ne disent rien de l’état d’une maison.';
    } else if (!bati && lignes.length) {
      precisionTexte.textContent = `Terrains : les prix sont les médianes de ${e[7]} ventes de terres, ${e[8]} de bois et ${e[9]} de terrain constructible seul, dans la commune et autour. Leur précision n’est pas mesurée, comme celle des maisons : une médiane dit le prix du milieu, pas l’écart autour.`;
    }
  };

  form.addEventListener('input', calculer);

  const preparer = async (cle: string) => {
    lieu = await resoudre(cle, LIEUX).catch(() => null);
    if (!lieu) return message('Cherchez la commune du bien par son nom ou son code postal.');
    retenirLieu(lieu.cle);
    try {
      const r = await fetch(`/territoires/simulateurs/estimation/${lieu.deps[0]}.json`);
      if (!r.ok) throw new Error(String(r.status));
      f = (await r.json()) as Fichier;
    } catch {
      return message('Les prix n’ont pas pu être lus. Réessayez dans un instant.');
    }
    const code = lieu.cle.slice(2);
    if (!f.c[code]) return message(`Trop peu de ventes ${aLieu(lieu.nom)} et autour pour une estimation.`);
    e = f.c[code];
    message('');
    $('se-titre').textContent = `${aLieu(lieu.nom).replace(/^./, (x) => x.toUpperCase())}, ventes de ${f.annees[0]} à ${f.annees[f.annees.length - 1]}`;
    (form.elements.namedItem('part') as HTMLInputElement).value = String(Math.round(f.partActivite * 100));
    form.hidden = false;
    calculer();
    (form.elements.namedItem('habitable') as HTMLInputElement).focus();
  };
  quandLieu(LIEUX, null, (cle) => void preparer(cle));
}
