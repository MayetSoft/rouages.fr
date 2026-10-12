/**
 * Le rapport d'un simulateur : la page imprimée en PDF par le navigateur,
 * avec une mise en page dédiée (`@media print` dans `global.css`). Le
 * rapport se fabrique sur l'appareil : rien n'est envoyé pour le produire.
 *
 * Il porte la date, une référence courte, ce qui a été saisi, les résultats,
 * la méthode et les sources avec leurs adresses — et un lien qui refait le
 * même calcul : la saisie est mise dans l'adresse de la page.
 *
 * Sur demande, le calcul se fait dater par un tiers : le navigateur écrit un
 * fichier de calcul (saisie, résultats, lien, sel tiré au hasard), que la
 * personne télécharge et garde, et n'envoie que son empreinte SHA-256 à
 * pro.rouages.fr, qui la fait signer par une autorité d'horodatage (RFC 3161).
 * Le rapport imprime ensuite l'empreinte et la date du tiers. Voir
 * `docs/2026-10-12-rapport-horodate.md` dans le dépôt de Rouages Pro.
 */

/** Le service qui fait dater les empreintes. */
const PRO = 'https://pro.rouages.fr';

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

/** Le fichier de calcul en attente de datation, ou déjà daté : null dès que la saisie change. */
interface Fichier {
  empreinte: string;
  nom: string;
  date: string | null;
  autorite: string | null;
  qualifie: boolean;
}

const hexa = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** La datation d'une empreinte, lue sur pro.rouages.fr ; null si elle n'est pas encore datée ou ne répond pas. */
async function lireDatation(empreinte: string): Promise<{ date: string; autorite: string; qualifie: boolean } | null> {
  try {
    const r = await fetch(`${PRO}/preuve/${empreinte}.json`, { signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { date: string | null; autorite?: string; qualifie?: boolean };
    return j.date ? { date: j.date, autorite: j.autorite ?? '', qualifie: !!j.qualifie } : null;
  } catch {
    return null;
  }
}

const aParis = (iso: string) =>
  `${new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Europe/Paris' }).replace(/^1 /, '1er ')} (heure de Paris)`;

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
  const dater = Object.assign(document.createElement('button'), { type: 'button', className: 'plat', textContent: 'Faire dater par un tiers' });
  const note = Object.assign(document.createElement('small'), { className: 'rapport-note', textContent: 'Le rapport se fabrique sur votre appareil : choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.' });
  const etat = Object.assign(document.createElement('p'), { className: 'rapport-datation', hidden: true });
  etat.setAttribute('aria-live', 'polite');
  bloc.append(bouton, lien, dater, note, etat);
  resultats.after(bloc);

  let fichier: Fichier | null = null;
  // Une saisie qui change n'est plus celle qui a été datée.
  form.addEventListener('input', () => {
    if (!fichier) return;
    fichier = null;
    etat.textContent = 'La saisie a changé : le fichier daté ne correspond plus à ce calcul. Faites dater le nouveau calcul si besoin.';
  });
  const montrerEtat = () => {
    if (!fichier) return;
    etat.hidden = false;
    etat.replaceChildren(
      fichier.date
        ? `Daté le ${aParis(fichier.date)} par ${fichier.autorite}${fichier.qualifie ? '' : ' (horodatage non qualifié)'}. `
        : `Fichier de calcul « ${fichier.nom} » téléchargé : gardez-le, c’est lui qui se vérifie. Confirmez la datation dans l’onglet qui s’est ouvert. `,
      Object.assign(document.createElement('a'), { href: `${PRO}/preuve/${fichier.empreinte}`, textContent: fichier.date ? 'Voir la preuve' : 'Voir où en est la datation', target: '_blank', rel: 'noopener' }),
    );
  };
  /** Relit la datation, sans attendre plus de quatre secondes. */
  const actualiser = async () => {
    if (!fichier || fichier.date) return;
    const cible = fichier;
    const d = await lireDatation(cible.empreinte);
    if (d && fichier === cible) {
      Object.assign(cible, d);
      montrerEtat();
    }
  };
  // De retour sur l'onglet après avoir confirmé : la date s'affiche.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void actualiser();
  });

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

  /** Ce qui a été saisi, champ par champ, tel que le rapport l'imprime. */
  const saisie = () => champs(form).filter((c) => !c.closest('[hidden]')).map((c) => [libelle(c), valeur(c)] as const);
  const titre = () => {
    const t = document.querySelector('h1')?.textContent ?? 'Simulateur';
    return `${t}${lieu() ? ` — ${lieu()}` : ''}`;
  };

  dater.addEventListener('click', async () => {
    const url = adresse();
    const maintenant = new Date();
    const ref = reference(`${url}|${maintenant.toISOString()}`);
    const sel = new Uint8Array(16);
    crypto.getRandomValues(sel);
    const contenu = {
      fichier: 'Rouages — fichier de calcul',
      version: 1,
      simulateur: location.pathname.split('/').pop() ?? '',
      titre: titre(),
      etabli_le: maintenant.toISOString(),
      reference: ref,
      refaire: url,
      saisie: Object.fromEntries(saisie()),
      resultats: resultats.innerText.split('\n').map((l) => l.trim()).filter(Boolean),
      avertissement:
        'Calcul sur des données publiques à partir de ce qui a été saisi ; il ne vaut ni expertise, ni avis, ni engagement. ' +
        'La datation prouve que ce fichier existait tel quel à la date du jeton ; elle ne dit pas que le calcul est juste.',
      sel: hexa(sel.buffer),
    };
    const octets = new TextEncoder().encode(`${JSON.stringify(contenu, null, 2)}\n`);
    const empreinte = hexa(await crypto.subtle.digest('SHA-256', octets));
    const nom = `rouages-${ref}.json`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([octets], { type: 'application/json' })), download: nom });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    fichier = { empreinte, nom, date: null, autorite: null, qualifie: false };
    montrerEtat();
    window.open(`${PRO}/horodater?e=${empreinte}&s=${encodeURIComponent(contenu.simulateur)}`, '_blank', 'noopener');
  });

  bouton.addEventListener('click', async () => {
    await actualiser();
    const url = adresse();
    const maintenant = new Date();
    const quand = maintenant.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    const ref = reference(`${url}|${maintenant.toISOString().slice(0, 10)}`);
    entete.innerHTML = '';
    entete.append(
      Object.assign(document.createElement('p'), { className: 'rapport-marque', textContent: 'Rouages · rapport de simulation' }),
      Object.assign(document.createElement('h2'), { className: 'rapport-titre', textContent: titre() }),
      Object.assign(document.createElement('p'), { className: 'rapport-meta', textContent: `Établi le ${quand} · référence ${ref}` }),
    );
    if (fichier) {
      entete.append(
        Object.assign(document.createElement('p'), {
          className: 'rapport-meta rapport-lien',
          textContent: fichier.date
            ? `Daté par un tiers le ${aParis(fichier.date)} — ${fichier.autorite}${fichier.qualifie ? ', prestataire qualifié eIDAS' : ', horodatage non qualifié'}. ` +
              `Empreinte SHA-256 du fichier de calcul ${fichier.nom} : ${fichier.empreinte}. Preuve : ${PRO}/preuve/${fichier.empreinte}`
            : `Fichier de calcul ${fichier.nom}, empreinte SHA-256 ${fichier.empreinte} — datation par un tiers non confirmée à l’impression : ${PRO}/preuve/${fichier.empreinte}`,
        }),
      );
    }
    const table = document.createElement('table');
    table.className = 'rapport-saisie';
    const corps = document.createElement('tbody');
    for (const [l, v] of saisie()) {
      const tr = document.createElement('tr');
      tr.append(Object.assign(document.createElement('th'), { textContent: l }), Object.assign(document.createElement('td'), { textContent: v }));
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
