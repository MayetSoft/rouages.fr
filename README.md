# Rouages.fr

**Qui fait quoi, et avec qui.**

Rouages est une carte navigable des acteurs publics, de leurs compétences et de
ce qui circule entre eux. Le site ne rédige rien : chaque nœud tient en une
phrase et renvoie vers les pages qui font autorité — Wikipédia pour la
définition, Légifrance pour la règle, l'open data pour les chiffres.

Ce qui manque ailleurs, ce n'est pas l'information. Ce sont **les liens**.

> État : **phase 2 en cours**. Le réseau de l'échelon local compte 39 acteurs,
> 37 compétences, 18 flux, 5 processus et 215 relations, reliés à 86 pages de
> référence.

## Comment ça marche

- **La carte** — tous les acteurs en colonnes par échelon, reliés par l'argent
  qui circule et les compétences qu'ils se partagent.
- **Le focus** — un clic ouvre un nœud : ses relations autour, chacune nommée,
  et ses liens sortants dans le panneau.
- **Les pages de nœud** (`/n/<id>`) — la même chose rendue au build, sans
  JavaScript, pour les moteurs de recherche et l'impression.
- **Les processus** ont en plus une frise des délais et une vue des fenêtres
  d'action : c'est la seule chose qu'un graphe ne sait pas montrer, le temps.

## Les familles

| | Famille | Objet | Phase |
|---|---|---|---|
| A | Rouages publics | Acteurs, compétences, argent entre échelons | 1–2 |
| B | Rouages du quotidien | Processus, délais, recours | 1–2 |
| C | Rouages économiques | Métiers, organisations, filières | 3 |
| D | Rouages de l'influence | Prebunking : mécanismes, jamais des personnes | 3 |
| E | Outils communautaires | Délibérations, PLU, procédures | 4 |

Un seul modèle de données pour les quatre premières. C'est le pari structurant.

## « Chez moi »

Le site ne se contente plus de dire « variable selon le territoire » : indiquez
votre commune et il nomme la structure qui exerce réellement chaque compétence —
votre syndicat des eaux, votre intercommunalité, votre syndicat de SCoT. Il
affiche aussi les comptes de la commune — par habitant et rapportés à la médiane
des communes de taille voisine — et le prix de l'eau du service qui la dessert.

```sh
npm run territoires          # refait la jointure BANATIC × découpage Etalab
npm run territoires -- --cache   # réutilise l'export déjà téléchargé
```

Les fichiers produits sont **versionnés** dans `public/territoires` : le site
n'appelle aucune interface à l'exécution, le build est reproductible hors ligne,
et une évolution de la donnée se relit dans un diff.

## Faire tourner

```sh
npm install
npm run dev        # http://localhost:4321
npm run valider    # liens sortants, intégrité du graphe, règles éditoriales
npm run build      # valide puis génère le site statique
```

Le contenu vit dans `contenu/`, en YAML versionné. `npm run valider` refuse un
nœud sans lien sortant, sans date de vérification, avec une référence cassée ou
un résumé trop long. La ligne éditoriale est appliquée mécaniquement, pas par
vigilance — c'est ce qui permettra d'accepter des contributions extérieures.

## Documents de cadrage

| Document | Contenu |
|---|---|
| [`docs/01-vision.md`](docs/01-vision.md) | Le problème, le parti pris « on ne rédige pas », le positionnement |
| [`docs/02-familles.md`](docs/02-familles.md) | Les familles, critères d'admission d'un nœud, granularité |
| [`docs/03-modele-de-donnees.md`](docs/03-modele-de-donnees.md) | Les entités et les règles — **le cœur** |
| [`docs/04-graphiques.md`](docs/04-graphiques.md) | Les quatre vues et leurs contraintes |
| [`docs/05-roadmap.md`](docs/05-roadmap.md) | Phases et conditions de sortie |
| [`docs/06-stack-technique.md`](docs/06-stack-technique.md) | Choix techniques et alternatives écartées |
| [`docs/07-risques.md`](docs/07-risques.md) | Péremption, exactitude, neutralité, RGPD |

Le contenu vit dans `contenu/`&nbsp;: acteurs, compétences, flux, processus,
sources et **glossaire**. Tout sigle employé doit y avoir son entrée, sans quoi
le build échoue.

## Licence

**Code** : [GNU AGPL 3.0 ou ultérieure](LICENSE), © 2026 MayetCo SAS. Qui
modifie le code et le fait tourner pour d'autres, y compris comme service en
ligne, doit en publier les modifications. Les contributions sont régies par la
[charte de contribution](CONTRIBUTING.md).

**Contenu éditorial** (`contenu/`) : CC BY-SA 4.0, la licence de Wikipédia,
donc réutilisable depuis et vers elle sans friction. Voir
[`LICENSE-CONTENU.md`](LICENSE-CONTENU.md).

**Données republiées** (`public/territoires/`) : elles restent sous la licence
de leur producteur. Tous les jeux réutilisés sont sous **Licence Ouverte**
(Etalab), vérifié jeu par jeu — aucun ODbL, dont le partage à l'identique
serait incompatible avec le CC BY-SA du reste. La seule obligation est de citer
la source et sa date, ce que chaque bloc de chiffres fait déjà.

## Mentions légales

`contenu/editeur.yaml` déclare qui édite et qui héberge le site.
`npm run publier` — ce que lance le déploiement — refuse de générer tant qu'un
champ y porte encore sa valeur d'attente. `npm run build` se contente d'un
avertissement : l'obligation naît de la mise à disposition du public, pas de
l'écriture d'une fiche.
