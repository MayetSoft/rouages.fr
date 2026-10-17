/**
 * L'orienteur des autorisations d'urbanisme, côté navigateur : le formulaire,
 * puis la réponse de `src/modele/autorisations.ts`, ses raisons, ce qu'elle a
 * supposé et la fiche de service-public.fr dont elle vient. Rien n'est
 * envoyé ni gardé ; le choix des travaux seul passe dans l'adresse, pour
 * qu'un lien mène au bon formulaire.
 */
import { orienter, urlFiche, type Reponse3, type Travaux } from '../modele/autorisations.ts';
import { enFrancais } from '../modele/urbanisme.ts';

const REGIMES = { aucune: 'Pas d’autorisation d’urbanisme', DP: 'Déclaration préalable', PC: 'Permis de construire' };

export function brancherAutorisation(): void {
  const form = document.getElementById('au-form') as HTMLFormElement | null;
  const regime = document.getElementById('au-regime');
  const architecte = document.getElementById('au-architecte');
  const raisons = document.getElementById('au-raisons');
  const hypotheses = document.getElementById('au-hypotheses');
  const fiche = document.getElementById('au-fiche');
  if (!form || !regime || !architecte || !raisons || !hypotheses || !fiche) return;

  const valeur = (nom: string) => (form.elements.namedItem(nom) as RadioNodeList | HTMLInputElement | null)?.value ?? '';
  const coche = (nom: string) => !!(form.elements.namedItem(nom) as HTMLInputElement | null)?.checked;
  const nombre = (nom: string) => {
    const v = Number(valeur(nom));
    return valeur(nom).trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
  };

  const afficher = () => {
    const type = valeur('type');
    // Les questions qui ne concernent pas ces travaux se cachent.
    for (const el of form.querySelectorAll<HTMLElement>('[data-pour]')) el.hidden = !el.dataset.pour!.split(' ').includes(type);
    for (const el of form.querySelectorAll<HTMLElement>('[data-pour-nature]')) el.hidden = valeur('nature') !== el.dataset.pourNature;
    const surface = nombre('surface') ?? 0;
    let t: Travaux;
    if (type === 'abri' || type === 'abri-accole') t = { type: 'abri', surface, accole: type === 'abri-accole' };
    else if (type === 'extension' || type === 'veranda') t = { type, surface, totaleApres: nombre('totale') };
    else if (type === 'piscine') t = { type, surface, couverture: valeur('couverture') as 'aucune' | 'basse' | 'haute', horsSolSaisonniere: coche('horsSol') };
    else if (type === 'cloture')
      t = { type, nature: valeur('nature') as 'mur' | 'autre' | 'vegetale', hauteurDeuxMetresOuPlus: coche('deuxMetres'), communeLesSoumet: valeur('commune') as Reponse3 };
    else t = { type: 'destination', facadeOuStructure: coche('facade'), memeDestination: coche('memeDestination'), surfaceLocal: nombre('local') };

    const o = orienter(t, { zoneUrbainePlu: valeur('zone') as Reponse3, secteurProtege: valeur('protege') as Reponse3, particulier: valeur('qui') !== 'morale' });
    regime.textContent = `${REGIMES[o.regime]}, d’après les règles générales`;
    architecte.textContent = o.regime === 'PC' ? (o.architecte ? 'Le recours à un architecte est obligatoire.' : 'Le recours à un architecte n’est pas obligatoire dans ce cas.') : '';
    raisons.textContent = '';
    for (const r of o.raisons) raisons.append(Object.assign(document.createElement('li'), { textContent: r }));
    hypotheses.textContent = '';
    if (o.hypotheses.length) {
      const p = document.createElement('p');
      p.className = 'au-hypothese';
      p.textContent = `Ce que l’orienteur a supposé : ${o.hypotheses.join(' ')} La mairie vous dira le cas exact.`;
      hypotheses.append(p);
    }
    fiche.textContent = 'D’après la fiche de service-public.fr « ';
    const a = Object.assign(document.createElement('a'), { href: urlFiche(o.fiche.code), textContent: o.fiche.titre, target: '_blank', rel: 'noopener' });
    fiche.append(a, ` », vérifiée le ${enFrancais(o.fiche.verifie)}, qui cite le code de l’urbanisme : ${o.fiche.articles.join(', ')}.`);
    history.replaceState(null, '', `?travaux=${type}`);
  };

  const p = new URLSearchParams(location.search).get('travaux');
  const choix = p ? form.querySelector<HTMLInputElement>(`input[name="type"][value="${CSS.escape(p)}"]`) : null;
  if (choix) choix.checked = true;
  form.addEventListener('input', afficher);
  form.addEventListener('change', afficher);
  afficher();
}
