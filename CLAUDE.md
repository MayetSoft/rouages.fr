# Conventions de travail sur Rouages

## La commune de référence : Le Mayet-de-Montagne

Code INSEE **03165**, code postal **03250**, Allier.

C'est elle qu'il faut prendre pour tous les exemples, captures et tests
manuels. La raison n'est pas esthétique : le mainteneur connaît cette commune,
donc il y repère une erreur d'un coup d'œil, ce qu'aucune vérification
automatique ne remplace.

Attention à l'homonyme : **Mayet** (Sarthe, 72191) est une autre commune. Les
deux figurent volontairement dans `scripts/verifier-recherche.ts`, qui fixe le
fait que la correspondance exacte doit passer avant le nom le plus long — c'est
un test de tri, pas un exemple.

Quelques repères utiles au Mayet-de-Montagne : CA Vichy Communauté pour la
mobilité et le développement économique, école primaire Yves Duteil (une classe
de moins à la rentrée 2021), commune non soumise à l'article 55 de la loi SRU.

## Commandes

```
npm run valider              structure, références, règles éditoriales
npm run verifier-recherche   le classement des communes homonymes
npm run verifier-journal     la fenêtre et les plafonds du journal
npm run verifier-rattachement  les annonces du BODACC rattachées à la bonne commune
npm run verifier-types       les types, fichiers .astro compris — `tsc` seul ne les voit pas
npm run build                valide puis génère (le build refuse un contenu invalide)
npm run relire               les fiches encore à vérifier contre leur source
npm run veille               l'état des sources surveillées
npm run territoires -- --cache   réingère tout en réutilisant les gros fichiers
npx tsx scripts/comptes-emettre.ts  les comptes seuls (communes, départements, régions)
```

`npm run territoires` dure une quarantaine de minutes et touche plus de trente
sources — dont cinquante-sept collectes facultatives, isolées : celle qui échoue laisse en
place les fichiers de l'ingestion précédente plutôt que de tout emporter. Ce qui
reste fatal, ce sont les référentiels dont dépend la structure du réseau,
BANATIC et le découpage.

Les sources lourdes : le répertoire national des associations (1,2 Go), les
séries communales Sitadel (500 Mo), trois années de ventes immobilières DVF
(300 Mo), les résultats des élections nationales (240 Mo), trois tables du
recensement (230 Mo), le référentiel FINESS (244 Mo), les objets protégés de la base
Palissy (365 Mo), les bornes de recharge électrique (160 Mo) et l'historique
des restrictions d'eau de VigiEau (590 Mo, 12 Go lus en flux) et les espaces
naturels de l'INPN, lus sur la Géoplateforme par pages (350 Mo, mis en cache
pour la journée). `--cache` les
réutilise, et sans lui il faut compter le téléchargement en plus.

La réingestion complète se lance aussi en intégration continue : workflow
« Réingestion des territoires » (onglet Actions, à la main). Il tourne sur le
réseau de GitHub, qui joint les sources sans tunnel, refait le contrôle de la
CI et ouvre une PR avec les fichiers réécrits et la liste des collectes en
échec. C'est la voie à préférer pour tout rafraîchir.

Chaque collecte de `scripts/*-emettre.ts` se lance aussi seule — `npx tsx
scripts/dvf-emettre.ts` — et réécrit ses fichiers `dep/XX-<jeu>.json`. Depuis
ici, le tunnel coupe parfois un gros téléchargement sans erreur : le
téléchargeur autonome compare à la longueur annoncée, mais un fichier de
l'INSEE servi compressé n'en annonce pas. En cas de doute, `curl -C -` dans
`.cache/`, puis `unzip -t`.

## Ce que l'environnement de développement ne joint pas

`www.data.gouv.fr` ne répond que par intermittence — les grosses réponses font
tomber le tunnel au bout de sept secondes. Ce qui marche :

- `tabular-api.data.gouv.fr` pour lire une ressource par pages de cent ;
- `https://www.data.gouv.fr/api/2/datasets/search/?q=…` pour chercher, la
  réponse étant plus légère que celle de l'API v1 ;
- les portails Opendatasoft : `data.economie.gouv.fr`, `data.education.gouv.fr`,
  `data.ofgl.fr`, `data.drees.solidarites-sante.gouv.fr`,
  `api-lannuaire.service-public.fr`.

Légifrance refuse les requêtes automatisées depuis cet environnement (403) : on
vérifie un article par recherche web, jamais de mémoire. Un identifiant
`LEGIARTI` écrit de tête a déjà été faux une fois.

**`npm run veille` ment depuis ici, et il écrit ce mensonge dans un fichier
suivi.** Les sources lourdes décrochent à 6,5 secondes — trois essais sur le
répertoire national des élus ont donné exactement 6,53 s, ce qui est le tunnel
et non la source ; le même jour, l'inventaire SRU répondait en 0,6 s et l'INSEE
en tête seule. Le contrôle qui fait autorité est celui du lundi matin en
intégration continue, qui tourne sur un réseau qui joint ces sources. Si on
lance la veille ici pour voir, on **jette `veille/etat.json`** au lieu de le
committer : sinon le dépôt garde des pannes qui n'ont pas eu lieu.

## Deux règles qui ne se négocient pas

- **Le contenu ne nomme aucune personne physique.** Le graphe décrit des
  fonctions ; le nom d'un titulaire est une donnée produite depuis un
  répertoire, jamais un nœud. La validation refuse un nom dans `contenu/`.
- **On ne publie pas un chiffre qu'on n'a pas vérifié**, et on refuse un
  agrégat dont on sait qu'il serait faux — voir le total des marchés publics
  dans `docs/05-roadmap.md`.

## Les noms dans les données

Décision du 1er octobre 2026 : la première règle vaut pour `contenu/` et pour
le graphe, pas pour les données territoriales. Un nom de personne physique
peut figurer dans `public/territoires/` **si toutes ces conditions tiennent** :

1. **Il vient d'un registre public dont la finalité couvre l'usage**, et la
   justification est écrite dans `docs/07-risques.md` *avant* la collecte :
   pourquoi le registre le publie, ce qu'une personne peut raisonnablement en
   attendre, ce qui est retenu et ce qui ne l'est pas.
2. **Il est affiché avec sa source, sa date et un lien vers la fiche
   d'origine.**
3. **Le site ne conclut rien.** Il montre le fait et nomme le décideur, sans
   qualificatif et sans rapprochement présenté comme un constat.
4. **Minimisation.** Le nom, le prénom, la qualité qui justifie la
   publication, la commune. Jamais l'adresse personnelle, la date de
   naissance ni l'âge.
5. **Aucun index par personne.** Une personne n'est ni un nœud, ni une page,
   ni une entrée de la recherche. Et on ne rapproche pas automatiquement un nom
   d'une source avec le même nom dans une autre : il n'existe pas
   d'identifiant commun entre le répertoire des élus et SIRENE, les homonymes
   sont nombreux, et un rapprochement faux entre un élu et une entreprise
   serait diffamatoire. Un tel recoupement demande une décision à part.
6. **Le retrait est possible.** Une opposition reçue par `/signaler` est
   appliquée à l'ingestion suivante, et `/mentions` dit ce qui est collecté.

Ce qui est autorisé à ce jour :

- **les élus exécutifs** — maire et adjoints — d'après le répertoire national
  des élus : nom, prénom, fonction, date de prise de fonction. Les autres
  conseillers restent décrits en agrégats ;
- **les entrepreneurs individuels** d'après SIRENE et le BODACC : le nom tel
  que publié, l'activité, la commune, le lien vers la fiche ou l'annonce.
  Jamais un entrepreneur en **diffusion partielle** au répertoire SIRENE — il
  a exercé son droit d'opposition (article R123-232-1 du code de commerce) :
  le statut se relit à chaque ingestion, et un établissement non diffusible
  est compté, pas nommé. Les **procédures collectives** d'un entrepreneur
  individuel restent comptées, pas nommées : c'est la défaillance d'une
  personne, et le BODACC sert déjà les créanciers qu'elle concerne.

Ce qui reste exclu : les particuliers cités dans les délibérations, les
dirigeants d'associations, toute nuance politique associée à un nom.
