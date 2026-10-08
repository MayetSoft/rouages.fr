/**
 * Le volet « Détail » d'un marché : ce que les données essentielles déclarent
 * au-delà de l'objet et du montant, l'acheteur nommé, et les autres lots de la
 * même consultation. Partagé par la page et par le script qui charge la suite
 * des marchés : les deux doivent dire la même chose.
 *
 * Les autres lots sont un rapprochement — même acheteur, même jour,
 * identifiant au numéro de lot près — et le volet le dit.
 */
export interface DetailAffiche {
  id: string | null;
  duree: number | null;
  lieu: string | null;
  formePrix: string | null;
  modalites: string | null;
  sousTraitance: boolean | null;
  social: string | null;
  environnement: string | null;
  innovant: boolean | null;
  autresLots: { objet: string; montant: number | null }[];
}

/** Le détail tel que la collecte l'écrit (`DetailMarche` dans `scripts/marches-emettre.ts`). */
export type DetailBrut = [string, number, string, string, string, number, string, string, number, [string, number | null][]];

export function detailDepuisBrut(x: DetailBrut | undefined): DetailAffiche | null {
  if (!x) return null;
  return {
    id: x[0] || null,
    duree: x[1] || null,
    lieu: x[2] || null,
    formePrix: x[3] || null,
    modalites: x[4] || null,
    sousTraitance: x[5] === -1 ? null : x[5] === 1,
    social: x[6] || null,
    environnement: x[7] || null,
    innovant: x[8] === -1 ? null : x[8] === 1,
    autresLots: (x[9] ?? []).map(([objet, montant]) => ({ objet, montant })),
  };
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const montant = (v: number | null) => {
  if (v === null) return 'montant non déclaré';
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M€`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000).toLocaleString('fr-FR')} k€`;
  return `${Math.round(v).toLocaleString('fr-FR')} €`;
};
const DECP = 'https://data.economie.gouv.fr/explore/dataset/decp-2022-marches-valides/table/';

/** Le volet, en HTML dont chaque valeur est échappée. */
export function detailMarcheHtml(d: DetailAffiche, acheteur: { nom: string; siren: string }): string {
  const lignes: string[] = [];
  lignes.push(
    `<li><strong>Acheteur</strong> : <a href="https://annuaire-entreprises.data.gouv.fr/entreprise/${echapper(acheteur.siren)}" target="_blank" rel="noopener">${echapper(acheteur.nom)}</a>` +
      ' — c’est lui qui passe la commande et la paie, sauf dans un groupement de commandes, où il agit pour le compte de plusieurs membres.</li>',
  );
  const execution = [
    d.duree ? `durée initiale ${d.duree} mois` : '',
    d.lieu ? `exécution : ${d.lieu}` : '',
    d.formePrix ? `prix ${d.formePrix.toLowerCase()}` : '',
    d.modalites ? d.modalites.toLowerCase() : '',
  ].filter(Boolean);
  if (execution.length) lignes.push(`<li>${echapper(execution.join(' · '))}</li>`);
  const clauses = [
    d.sousTraitance === null ? '' : d.sousTraitance ? 'sous-traitance déclarée' : 'sans sous-traitance déclarée',
    d.social ? `considération sociale : ${d.social.toLowerCase()}` : '',
    d.environnement ? `considération environnementale : ${d.environnement.toLowerCase()}` : '',
    d.innovant ? 'déclaré innovant' : '',
  ].filter(Boolean);
  if (clauses.length) lignes.push(`<li>${echapper(clauses.join(' · '))}</li>`);
  if (d.autresLots.length) {
    lignes.push(
      `<li><strong>Les autres lots de la même consultation</strong>, rapprochés par l’identifiant et la date de notification :<ul>` +
        d.autresLots.map((l) => `<li>${echapper(l.objet)} — ${echapper(montant(l.montant))}</li>`).join('') +
        '</ul></li>',
    );
  }
  if (d.id) {
    lignes.push(
      `<li>Identifiant déclaré : <code>${echapper(d.id)}</code> — <a href="${DECP}?q=${encodeURIComponent(`"${d.id}"`)}" target="_blank" rel="noopener">la ligne d’origine dans les données essentielles</a></li>`,
    );
  }
  return `<details class="p-marche-plus"><summary>Détail</summary><ul>${lignes.join('')}</ul></details>`;
}
