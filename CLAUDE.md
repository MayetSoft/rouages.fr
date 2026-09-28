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
npm run build                valide puis génère (le build refuse un contenu invalide)
npm run relire               les fiches encore à vérifier contre leur source
npm run veille               l'état des sources surveillées
npm run territoires -- --cache   réingère tout en réutilisant les gros fichiers
```

`npm run territoires` dure une trentaine de minutes et touche plus de vingt
sources — dont vingt-quatre collectes facultatives, isolées : celle qui échoue laisse en
place les fichiers de l'ingestion précédente plutôt que de tout emporter. Ce qui
reste fatal, ce sont les référentiels dont dépend la structure du réseau,
BANATIC et le découpage.

Trois sources pèsent l'essentiel du temps : le répertoire national des
associations (1,2 Go), les séries communales Sitadel (500 Mo) et le référentiel
FINESS (244 Mo). `--cache` les réutilise, et sans lui il faut compter le
téléchargement en plus.

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
