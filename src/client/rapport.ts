/**
 * Le rapport d'un simulateur : la page imprimée en PDF par le navigateur,
 * avec une mise en page dédiée (`@media print` dans `global.css`). Rien
 * n'est envoyé nulle part : le rapport se fabrique sur l'appareil.
 *
 * Il porte la date, une référence courte, ce qui a été saisi, les résultats,
 * la méthode et les sources avec leurs adresses — et un lien qui refait le
 * même calcul : la saisie est mise dans l'adresse de la page.
 */

type Champ = HTMLInputElement | HTMLSelectElement;

const champs = (form: HTMLFormElement) =>
  [...form.elements].filter((e): e is Champ => (e instanceof HTMLInputElement || e instanceof HTMLSelectElement) && !!e.name);

/** La saisie, en paramètres d'adresse : seulement ce qui diffère des valeurs par défaut de la page. */
function enAdresse(form: HTMLFormElement): URLSearchParams {
  const p = new URLSearchParams(location.search);
  for (const c of champs(form)) {
    if (c instanceof HTMLInputElement && c.type === 'checkbox') {
      if (c.checked !== c.defaultChecked) p.set(c.name, c.checked ? '1' : '0');
      else p.delete(c.name);
    } else if (c.value !== '' && (c instanceof HTMLSelectElement || c.value !== c.defaultValue)) p.set(c.name, c.value);
    else p.delete(c.name);
  }
  return p;
}

/**
 * Remet dans le formulaire la saisie portée par l'adresse, à appeler une fois
 * le lieu chargé, avant le calcul. Un champ prérempli par le simulateur
 * (le prix, le loyer) est marqué saisi : on ne le recalcule plus.
 */
export function restaurerSaisie(form: HTMLFormElement): void {
  const p = new URLSearchParams(location.search);
  for (const c of champs(form)) {
    const v = p.get(c.name);
    if (v === null) continue;
    if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = v === '1';
    else c.value = v;
    c.dataset.saisi = '1';
  }
}

/** Une référence de huit caractères, la même pour la même saisie le même jour. */
function reference(texte: string): string {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) h = Math.imul(h ^ texte.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(0, 8);
}

/** Le libellé d'un champ, sans ses unités ni ses aides. */
function libelle(c: Champ): string {
  const label = c.closest('label');
  if (!label) return c.name;
  const copie = label.cloneNode(true) as HTMLElement;
  copie.querySelectorAll('input, select, small, span').forEach((x) => x.remove());
  return copie.textContent?.replace(/\s+/g, ' ').trim() || c.name;
}

function valeur(c: Champ): string {
  if (c instanceof HTMLSelectElement) return c.selectedOptions[0]?.textContent?.trim() ?? c.value;
  if (c.type === 'checkbox') return c.checked ? 'oui' : 'non';
  const unite = c.closest('span')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const n = Number(c.value);
  const v = c.value === '' ? '—' : Number.isFinite(n) && c.type === 'number' ? n.toLocaleString('fr-FR') : c.value;
  return unite && v !== '—' ? `${v} ${unite}` : v;
}

/**
 * Ajoute le bouton « Télécharger le rapport » sous les résultats. `lieu`
 * rend le nom du lieu calculé, ou null tant qu'il n'y en a pas.
 */
export function brancherRapport(form: HTMLFormElement, resultats: HTMLElement, lieu: () => string | null): void {
  const bloc = document.createElement('div');
  bloc.className = 'rapport-actions';
  const bouton = Object.assign(document.createElement('button'), { type: 'button', className: 'bouton jeu-bouton', textContent: 'Télécharger le rapport (PDF)' });
  const lien = Object.assign(document.createElement('button'), { type: 'button', className: 'plat', textContent: 'Copier le lien de ce calcul' });
  const note = Object.assign(document.createElement('small'), { className: 'rapport-note', textContent: 'Le rapport se fabrique sur votre appareil : choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.' });
  bloc.append(bouton, lien, note);
  resultats.after(bloc);

  // L'en-tête et la saisie, visibles à l'impression seulement.
  const entete = document.createElement('section');
  entete.className = 'rapport-entete';
  entete.setAttribute('aria-hidden', 'true');
  form.before(entete);

  const adresse = () => {
    const url = new URL(location.href);
    url.search = enAdresse(form).toString();
    history.replaceState(null, '', url);
    return url.toString();
  };

  lien.addEventListener('click', async () => {
    const url = adresse();
    try {
      await navigator.clipboard.writeText(url);
      lien.textContent = 'Lien copié';
    } catch {
      lien.textContent = 'Copie impossible : le lien est dans la barre d’adresse';
    }
    setTimeout(() => (lien.textContent = 'Copier le lien de ce calcul'), 2500);
  });

  bouton.addEventListener('click', () => {
    const url = adresse();
    const maintenant = new Date();
    const quand = maintenant.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const ref = reference(`${url}|${maintenant.toISOString().slice(0, 10)}`);
    entete.innerHTML = '';
    const titre = document.querySelector('h1')?.textContent ?? 'Simulateur';
    entete.append(
      Object.assign(document.createElement('p'), { className: 'rapport-marque', textContent: 'Rouages · rapport de simulation' }),
      Object.assign(document.createElement('h2'), { className: 'rapport-titre', textContent: `${titre}${lieu() ? ` — ${lieu()}` : ''}` }),
      Object.assign(document.createElement('p'), { className: 'rapport-meta', textContent: `Établi le ${quand} · référence ${ref}` }),
    );
    const table = document.createElement('table');
    table.className = 'rapport-saisie';
    const corps = document.createElement('tbody');
    for (const c of champs(form)) {
      if (c.closest('[hidden]')) continue;
      const tr = document.createElement('tr');
      tr.append(Object.assign(document.createElement('th'), { textContent: libelle(c) }), Object.assign(document.createElement('td'), { textContent: valeur(c) }));
      corps.append(tr);
    }
    table.append(Object.assign(document.createElement('caption'), { textContent: 'Ce qui a été saisi' }), corps);
    entete.append(
      table,
      Object.assign(document.createElement('p'), { className: 'rapport-meta rapport-lien', textContent: `Refaire ce calcul : ${url}` }),
      Object.assign(document.createElement('p'), {
        className: 'rapport-meta',
        textContent:
          'Ce rapport décrit un calcul sur des données publiques à partir de ce qui a été saisi ; il ne vaut ni expertise, ni avis, ni engagement. Les sources et la méthode suivent les résultats.',
      }),
    );
    window.print();
  });
}
