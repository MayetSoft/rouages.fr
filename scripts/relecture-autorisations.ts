/**
 * La fiche de relecture de l'orienteur des autorisations d'urbanisme, pour le
 * praticien qui doit la relire avant que la page soit ouverte
 * (`docs/07-risques.md`, section 9) : chaque cas de `autorisations-cas.ts`,
 * la réponse que l'orienteur donne, ses raisons, ce qu'il suppose et la fiche
 * de service-public.fr dont il vient, avec une case à cocher.
 *
 * La fiche est tirée des cas et du modèle, jamais écrite à la main :
 * `npm run relecture-autorisations` la réécrit, et `verifier-autorisations`
 * échoue si celle du dépôt n'est plus à jour — une relecture porte sur ce que
 * le site répond, pas sur ce qu'il répondait.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FICHE_ARCHITECTE, FICHES, orienter, urlFiche, type Fiche, type Situation, type Travaux } from '../src/modele/autorisations.ts';
import { enFrancais } from '../src/modele/urbanisme.ts';
import { CAS } from './autorisations-cas.ts';

export const FICHIER = 'docs/09-relecture-autorisations.md';

const REGIMES = { aucune: 'pas d’autorisation d’urbanisme', DP: 'déclaration préalable', PC: 'permis de construire' };
const m2 = (v: number) => `${v.toLocaleString('fr-FR')} m²`;
const OUI_NON = { oui: 'oui', non: 'non', nsp: 'on ne sait pas' };

/** Les travaux, en clair. */
function travaux(t: Travaux): string {
  switch (t.type) {
    case 'abri':
      return `${t.accole ? 'Abri ou annexe accolé à la maison' : 'Abri de jardin indépendant'}, ${m2(t.surface)}`;
    case 'extension':
    case 'veranda':
      return (
        `${t.type === 'veranda' ? 'Véranda' : 'Agrandissement'} de ${m2(t.surface)}` +
        (t.totaleApres === null ? '' : `, surface de plancher totale après travaux ${m2(t.totaleApres)}`)
      );
    case 'piscine':
      if (t.horsSolSaisonniere) return `Piscine hors sol de ${m2(t.surface)}, installée trois mois par an au plus`;
      return `Piscine, bassin de ${m2(t.surface)}, ${{ aucune: 'sans couverture', basse: 'couverture de 1,80 m au plus', haute: 'couverture de plus de 1,80 m' }[t.couverture]}`;
    case 'cloture': {
      const quoi = t.nature === 'vegetale' ? 'Haie' : t.nature === 'autre' ? 'Grillage ou palissade' : t.hauteurDeuxMetresOuPlus ? 'Mur de 2 m ou plus' : 'Mur de moins de 2 m';
      return `${quoi} ; la commune soumet-elle les clôtures à déclaration : ${OUI_NON[t.communeLesSoumet]}`;
    }
    case 'destination':
      if (t.memeDestination) return 'Changement de sous-destination, à l’intérieur d’une même destination';
      return (
        `Changement de destination, ${t.facadeOuStructure ? 'avec' : 'sans'} modification de la façade ou de la structure porteuse` +
        (t.surfaceLocal === null ? '' : `, local de ${m2(t.surfaceLocal)} de surface de plancher`)
      );
  }
}

/** Le terrain et le demandeur, en clair — la zone seulement là où l'orienteur la demande. */
function situation(t: Travaux, s: Situation): string {
  const morceaux: string[] = [];
  if (t.type === 'extension' || t.type === 'veranda')
    morceaux.push({ oui: 'en zone urbaine d’un PLU', non: 'hors zone urbaine d’un PLU, ou sans PLU', nsp: 'sans savoir si le terrain est en zone urbaine' }[s.zoneUrbainePlu]);
  morceaux.push({ oui: 'en secteur protégé', non: 'hors secteur protégé', nsp: 'sans savoir si le terrain est en secteur protégé' }[s.secteurProtege]);
  morceaux.push(s.particulier ? 'par un particulier pour lui-même' : 'par une société ou une association');
  return morceaux.join(', ');
}

const lienFiche = (f: Fiche) => `[${f.code} — ${f.titre}](${urlFiche(f.code)})`;

/** Les questions que la relecture doit trancher, au-delà des cas : là où l'orienteur a choisi. */
const QUESTIONS = [
  '**Le décret n° 2026-117 du 20 février 2026.** Il est postérieur aux fiches de l’abri de jardin, de l’agrandissement, de la véranda, de la piscine et de la clôture. D’après les synthèses lues — pas le texte, Légifrance refusant cet environnement —, il dispense certaines pompes à chaleur et relève des seuils pour le solaire en toiture, sans toucher les seuils retenus ici. Est-ce exact ?',
  '**L’abri accolé.** Le PLU peut le traiter en construction nouvelle ou en extension (jusqu’à 40 m² en déclaration préalable en zone urbaine). L’orienteur retient la construction nouvelle, plus exigeante, et le dit. Ce choix est-il le bon par défaut ?',
  '**L’agrandissement de 5 m² ou moins.** L’orienteur répond « déclaration préalable » en supposant que tout agrandissement modifie l’aspect extérieur. Un agrandissement qui ne le modifie pas existe-t-il en pratique, et faut-il le demander ?',
  '**Le secteur protégé en zone urbaine.** L’orienteur applique en secteur protégé le seuil de 20 m², même en zone urbaine d’un PLU, comme s’il était hors zone urbaine. Le seuil de 40 m² vaut-il dans certains secteurs protégés ?',
  '**La clôture sans réponse sur la commune.** Faute de savoir si la commune soumet les clôtures à déclaration, l’orienteur répond « déclaration préalable ». Le doute penche-t-il dans le bon sens, ou la réponse est-elle trop lourde pour être utile ?',
  '**La piscine hors sol en secteur protégé.** Le formulaire pose une seule question — « installée trois mois par an au plus (quinze jours en secteur protégé) » — et laisse la personne appliquer la bonne durée. Faut-il la séparer ?',
  '**L’architecte du changement de destination.** L’orienteur l’exige au-delà de 150 m² de surface de plancher du bâtiment ou du local, d’après la fiche F20568. La surface à prendre est-elle bien celle-là ?',
];

export function ficheDeRelecture(): string {
  const l: string[] = [];
  l.push(
    '# Relecture de l’orienteur des autorisations d’urbanisme',
    '',
    '<!-- Fichier produit par `npm run relecture-autorisations` depuis `scripts/autorisations-cas.ts` et `src/modele/autorisations.ts` : ne pas le modifier à la main, sauf pour cocher et annoter. -->',
    '',
    'La page `/simulateurs/autorisation` répond, pour les travaux les plus courants, s’il faut une déclaration préalable, un permis de construire ou rien, et si l’architecte est obligatoire. Elle reste **hors du menu et des moteurs de recherche** tant qu’un praticien de l’urbanisme — instructeur, juriste, architecte — n’a pas relu ses réponses (`docs/07-risques.md`, section 9).',
    '',
    `Cette feuille donne ses ${CAS.length} cas de contrôle, chacun tiré d’une phrase d’une fiche de service-public.fr : les travaux, le terrain, la réponse de l’orienteur mot pour mot, ses raisons, ce qu’il a supposé et la fiche dont il vient. Compter une heure. Les règles viennent des fiches, lues le 16 octobre 2026, et non du code de l’urbanisme lui-même : Légifrance refuse les requêtes de l’environnement de développement.`,
    '',
    '**L’erreur qui compte est la réponse trop légère** — « pas d’autorisation » là où il faut une déclaration —, qui expose à un délit (article L480-4 du code de l’urbanisme). Une réponse trop lourde coûte un dossier de trop. Quand l’orienteur ne sait pas, il prend le cas le plus exigeant et le dit.',
    '',
    '**Comment rendre la relecture.** Cocher une case par cas dans ce fichier et annoter ce qui est faux, ou répondre par les numéros. Puis trancher les questions de la fin. Une correction change le modèle et ses cas ; cette feuille se régénère, et la relecture repart des cas touchés.',
    '',
    '---',
    '',
  );

  // Un cas par fiche, dans l'ordre des fiches : ceux de la personne morale rejoignent l'agrandissement.
  const ordre = Object.keys(FICHES);
  const cas = CAS.map(([quoi, t, s]) => ({ quoi, t, s, o: orienter(t, s) })).sort((a, b) => ordre.indexOf(a.t.type) - ordre.indexOf(b.t.type));
  let n = 0;
  let ficheCourante = '';
  for (const { quoi, t, s, o } of cas) {
    const fiche = o.fiche.code;
    if (fiche !== ficheCourante) {
      ficheCourante = fiche;
      l.push(`## ${o.fiche.titre}`, '', `D’après ${lienFiche(o.fiche)}, vérifiée le ${enFrancais(o.fiche.verifie)}, qui cite : ${o.fiche.articles.join(', ')}.`, '');
    }
    n++;
    l.push(
      `### ${n}. ${quoi.split(' : ')[0].replace(/^./, (c) => c.toUpperCase())}`,
      '',
      `- **Travaux** : ${travaux(t)}.`,
      `- **Terrain et demandeur** : ${situation(t, s)}.`,
      `- **Réponse** : ${REGIMES[o.regime]}` + (o.regime === 'PC' ? (o.architecte ? ', architecte obligatoire' : ', architecte non obligatoire') : '') + '.',
      ...o.raisons.map((r) => `- **Raison** : ${r}`),
      ...o.hypotheses.map((h) => `- **Supposé** : ${h}`),
      '',
      '- [ ] d’accord',
      '- [ ] à corriger — remarque :',
      '',
    );
  }

  l.push(
    '---',
    '',
    '## L’architecte',
    '',
    `Le recours à l’architecte vient de ${lienFiche(FICHE_ARCHITECTE)}, vérifiée le ${enFrancais(FICHE_ARCHITECTE.verifie)}, qui cite : ${FICHE_ARCHITECTE.articles.join(', ')}. L’orienteur l’exige pour un permis de construire quand la surface de plancher totale dépasse 150 m² après travaux, et pour tout permis demandé par une personne morale.`,
    '',
    '## Les questions à trancher',
    '',
    ...QUESTIONS.flatMap((q, i) => [`${i + 1}. ${q}`, '', '   - [ ] la réponse de l’orienteur convient', '   - [ ] à changer — comment :', '']),
    '## Ce que l’orienteur ne couvre pas',
    '',
    'Les pompes à chaleur, les panneaux solaires, les démolitions, le ravalement, les lotissements, les constructions agricoles, les installations techniques, la constructibilité d’un terrain et l’interprétation d’un règlement de PLU. La page le dit, et renvoie à la mairie, à l’assistance de l’État pour les demandes d’autorisation et au certificat d’urbanisme.',
    '',
    'Les fiches citées :',
    '',
    ...[...Object.values(FICHES), FICHE_ARCHITECTE].map((f) => `- ${lienFiche(f)}, vérifiée le ${enFrancais(f.verifie)}`),
    '',
  );
  return l.join('\n');
}

/** La fiche du dépôt est-elle celle que donneraient les cas d'aujourd'hui ? Les cases cochées et les remarques ne comptent pas. */
export function ficheAJour(): boolean {
  let actuelle: string;
  try {
    actuelle = readFileSync(FICHIER, 'utf8');
  } catch {
    return false;
  }
  const neutre = (x: string) =>
    x
      .replace(/^(\s*- )\[[xX]\]/gm, '$1[ ]')
      .replace(/^(\s*- \[ \] (?:à corriger — remarque|à changer — comment) :).*$/gm, '$1');
  return neutre(actuelle) === neutre(ficheDeRelecture());
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(FICHIER, ficheDeRelecture());
  console.log(`${FICHIER} : ${CAS.length} cas et ${QUESTIONS.length} questions.`);
}
