# 02 — Les grandes familles de rouages

> Statut : proposition, à valider. C'est le premier arbitrage à rendre.

Quatre familles, plus une famille d'outils. Ce ne sont pas quatre rubriques :
**ce sont quatre zones d'un même graphe**, partageant le même modèle de données
(voir `03-modele-de-donnees.md`). Rien ne les sépare techniquement ; elles disent
seulement dans quel ordre on peuple le réseau.

```mermaid
flowchart TB
    Q["Une situation concrète<br/>« mon voisin construit »"] --> D{Entrées}
    D --> F1["A. Rouages publics<br/>qui a le pouvoir"]
    D --> F2["B. Rouages du quotidien<br/>quelle procédure"]
    D --> F3["C. Rouages économiques<br/>qui fait quoi, quels flux"]
    D --> F4["D. Rouages de l'influence<br/>comment on vous oriente"]
    F1 --> G[(Graphe commun :<br/>acteurs · compétences · flux ·<br/>procédures · sources · leviers)]
    F2 --> G
    F3 --> G
    F4 --> G
    G --> O["E. Outils communautaires<br/>délibérations · PLU · procédures"]
```

---

## A. Rouages publics — « qui a le pouvoir »

**Définition.** La répartition des compétences, de l'argent et des mandats entre
les échelons : commune, intercommunalité (EPCI), département, région, État
déconcentré (préfet, rectorat, ARS), État central, Union européenne. Plus les
organismes que personne ne situe : SDIS, syndicat des eaux, bailleur social,
agence de l'eau, CAF, chambres consulaires.

**Exemples de nœuds.** « Le conseil municipal », « La communauté de communes »,
« Qui gère l'eau potable ? », « Le préfet », « Le budget d'une commune : d'où
vient l'argent », « Qui décide de la carte scolaire ».

**Open data typique.** Budgets locaux (DGFiP / OFGL), Base des collectivités
(BANATIC pour les EPCI et leurs compétences), Répertoire National des Élus,
subventions, marchés publics (DECP).

**Pourquoi en premier.** Densité de contact citoyen maximale, données ouvertes
riches et stables, et c'est le socle dont dépendent les familles B et E.

---

## B. Rouages du quotidien — « quelle procédure, quel délai »

**Définition.** L'entrée par la situation vécue, pas par l'institution. Chaque
nœud de cette famille est un **processus** : un déclencheur, des étapes datées, un résultat
et des voies de recours.

**Domaines.** Urbanisme et voisinage · École · Santé et grand âge · Logement ·
Justice du quotidien · Mobilité et voirie · Déchets, eau, énergie ·
Environnement et nuisances · Aides sociales.

**Exemples de nœuds.** « Un permis de construire, du dépôt au recours »,
« Une école ferme : le calendrier réel de la décision », « Contester une
délibération municipale », « Demander un document administratif (et que faire
si on refuse) », « Un projet éolien s'installe : les 6 fenêtres où l'on peut
s'exprimer ».

**Pourquoi.** Un processus est la seule chose qu'un graphe ne sait pas montrer :
le temps. C'est pourquoi il a ses propres vues (frise, fenêtres d'action) en plus
de sa place dans le réseau.

---

## C. Rouages économiques — « qui fait quoi dans une organisation »

**Définition.** Le fonctionnement interne des entreprises et des filières :
comment les métiers s'articulent, où circulent l'argent, l'information et la
décision, où se trouvent les points de friction.

**Deux sous-angles :**
- *L'organisation* : qui fait quoi dans une PME, une collectivité, un hôpital,
  une école ; ce que fait réellement un DAF, un chef de projet, un acheteur.
- *La filière* : comment un produit arrive dans le rayon, comment un logement se
  construit, comment un train circule, comment un médicament est remboursé.

**Exemples de nœuds.** « De la commande à la facture : le circuit dans une
PME », « Qui gagne quoi sur une baguette », « Un chantier de logement : les 14
intervenants », « Comment une commune achète (marchés publics) ».

**Pourquoi.** C'est le pendant privé de la famille A, ça élargit l'audience
au-delà du civisme, et c'est de la pédagogie professionnelle réutilisable en
formation. **Mais c'est aussi la famille la moins « sourçable »** (peu d'open
data, beaucoup de variabilité). À traiter après A et B, avec une exigence
particulière sur les sources.

---

## D. Rouages de l'influence — prebunking *(phase 2)*

**Définition.** Les mécanismes par lesquels on oriente une décision ou une
opinion : lobbying, astroturfing, capture réglementaire, économie de
l'attention, conflits d'intérêts, rhétorique manipulatoire.

**Règle absolue : on décrit des mécanismes, jamais des personnes.**
« Comment fonctionne un faux mouvement citoyen » est un nœud Rouages.
« Untel a monté un faux mouvement citoyen » ne l’est pas. Cette règle est ce
qui protège juridiquement le site et préserve sa crédibilité acquise sur A/B/C.

**Exemples de nœuds.** « Le cycle de vie d'une rumeur locale », « Comment un
amendement apparaît sans auteur apparent », « Astroturfing : les signaux
observables », « À qui appartient mon journal local ».

**Pourquoi après.** Le prebunking n'a d'effet que porté par une source déjà
perçue comme neutre. Publier ça en premier ferait basculer le site dans la
catégorie « média d'opinion » et contaminerait la lecture des familles A à C.

---

## E. Outils communautaires *(phase 3, produit distinct)*

Recherche plein texte dans les délibérations de conseils municipaux et
communautaires · assistance à la lecture d'un PLU · recherche de la procédure
applicable dans les documents officiels.

Ce ne sont pas des nœuds, ce sont des **applications** adossées au graphe.
Elles ont un coût technique, juridique et d'exploitation d'un autre ordre. Voir
`05-roadmap.md` et `07-risques.md`.

---

## Critère d'admission d'un nœud

Un nœud est publiable si, et seulement si :

- [ ] il est **relié** à au moins un autre nœud — un nœud isolé n'apporte rien ;
- [ ] il porte **au moins un lien sortant** vers une page de référence ;
- [ ] il tient en **une phrase** (280 signes, contrôlés par le schéma) ;
- [ ] il porte une **date de vérification** ;
- [ ] son niveau de `confiance` est honnête, y compris
      « variable selon le territoire ».

## Les branches du pouvoir

La carte d'ensemble range par échelon territorial : qui est loin, qui est près.
La séparation des pouvoirs est orthogonale à cet axe — elle se joue entièrement
à l'intérieur d'une seule colonne, celle de l'État. Les deux ne tiennent donc
pas dans le même schéma, d'où la page dédiée.

Toute entité de l'État déclare la branche dont elle relève, dans `pouvoirs`.
Le champ est **exigé** de tout acteur national, de toute juridiction et de toute
autorité indépendante, et **refusé** partout ailleurs — `scripts/valider.ts`
applique la règle. Sans elle, `pouvoirs` serait un champ facultatif que
personne ne remplirait, et une vue « par branche » à moitié remplie est pire
que pas de vue du tout.

Trois écarts au schéma appris à l'école sont assumés plutôt que masqués.

**`independant` n'est pas une quatrième branche inventée pour l'occasion.**
C'est une catégorie juridique existante : la loi n° 2017-55 place les autorités
administratives et publiques indépendantes hors de la hiérarchie des trois
pouvoirs. Les ranger sous « exécutif » parce qu'elles sont administratives
dirait exactement le contraire de ce qui les définit.

**Le champ est une liste, parce qu'une institution peut en exercer deux.** Le
Conseil d'État est à la fois le conseil juridique obligatoire du Gouvernement
et le juge suprême de l'ordre administratif. Choisir l'une des deux fonctions
serait plus simple, et faux : il apparaît donc dans les deux bandes, tracé en
pointillé.

**Le critère n'est pas seulement l'échelon.** Une chambre régionale des comptes
siège en région tout en étant une juridiction de l'État. À l'inverse, les
personnes physiques sont exclues : un commissaire enquêteur est désigné pour
une mission, il n'incarne aucune branche. Un mandat électif, lui, en est bien
un organe — d'où la distinction entre les types `personne` et `mandat_electif`.

Cette classification a immédiatement corrigé deux erreurs de typage qui
dataient du socle : le tribunal administratif et la chambre régionale des
comptes étaient tous deux déclarés `service_deconcentre`. Un service déconcentré
est un bras de l'exécutif, ce qu'une juridiction n'est précisément pas.

## La colonne et la boîte : où l'on agit, à qui l'on appartient

Décision du 12 octobre 2026, à la demande du mainteneur, qui avait relevé que
la carte montrait « L'Union européenne » à côté de ses propres institutions.

**Deux axes étaient confondus.** La colonne dit *où* un acteur agit — commune,
intercommunalité, département, région, État, Union. Mais chaque colonne
mêlait trois choses : l'entité elle-même (la commune, la région, l'État,
l'Union, qui sont des personnes morales), ses organes (le conseil, l'exécutif,
les services), et des acteurs rangés là par géographie qui n'en font pas
partie — l'ARS et la DREAL agissent en région et relèvent de l'État ; le CAUE
est une association, le SDIS un établissement public à part.

**L'entité n'est pas un faux nœud.** Elle reçoit des impôts, verse des
dotations, porte des compétences : la retirer du graphe ferait mentir les
flux. C'est son *dessin* qui était faux — une pastille parmi ses propres
parties.

**La règle** :

- chaque acteur qui est un organe, un service ou un établissement public d'une
  entité le déclare dans `releve_de` ; `scripts/valider.ts` vérifie que
  l'entité existe, qu'elle est une collectivité au sens large (l'État et
  l'Union compris) et qu'elle ne relève elle-même de personne — un seul
  niveau ;
- un acteur qui est une personne morale à part n'a pas de `releve_de` : les
  syndicats, les associations, la CAF (organisme de sécurité sociale de droit
  privé), le SDIS, la MDPH (groupement d'intérêt public). La raison est écrite
  en commentaire dans `contenu/acteurs.yaml` quand elle n'est pas évidente ;
- un établissement public rattaché à une entité en relève quand il est
  l'entité qui agit — le CCAS est la commune en matière sociale, l'ARS l'État
  en matière de santé.

**Le dessin** (`src/modele/reseau.ts`, `disposerCarte`) :

- dans chaque colonne, une boîte par entité ; son nœud en est l'en-tête,
  cliquable comme les autres, et ses liens partent de lui ; ses organes sont
  dedans ;
- la boîte de l'État se subdivise par branche du pouvoir (`pouvoirs`, la
  première déclarée) ;
- les organes d'une entité qui agissent dans une autre colonne y forment une
  boîte en pointillés : « L'État en région » ;
- les acteurs qui ne relèvent de personne viennent en dessous, sans boîte.

Le graphe, lui, ne change pas : mêmes nœuds, mêmes arêtes, mêmes propriétés
(`npm run verifier-reseau`). Seul le dessin de la carte d'ensemble change.

**Ce qui reste ouvert** : le préfet, la DDT, l'architecte des Bâtiments de
France agissent dans le département, et restent rangés dans la colonne de
l'État ; les déplacer dans une boîte « L'État dans le département » est une
décision de contenu à prendre à part.

## Quand la loi répond avant le registre

BANATIC enregistre les transferts *déclarés*. Il en manque beaucoup : **54 %
seulement** des 1 264 intercommunalités à fiscalité propre y déclarent le
développement économique, que la loi NOTRe leur impose pourtant à toutes depuis
le 1er janvier 2017. Conclure « la commune » du silence du registre était donc
faux presque une fois sur deux.

Une compétence peut donc déclarer `obligatoire_pour`, la liste des catégories
d'intercommunalité auxquelles la loi la transfère de plein droit. La résolution
consulte le registre d'abord, la loi ensuite, et le silence en dernier — et
elle dit laquelle des trois a répondu. `scripts/valider.ts` exige qu'une
compétence ainsi déclarée cite un texte de droit : se tromper avec l'autorité
de la loi est pire que se tromper tout court.

Trois compétences sont marquées à ce jour, chacune après vérification de son
article, et l'effet se mesure :

| Compétence | Catégories | Réponses corrigées |
|---|---|---|
| Développement économique | CC, CA, CU, métropoles | **12 114 communes** |
| Logement social | CA, CU, métropoles — pas les CC | **1 110 communes** |
| Déchets ménagers | CC, CA, CU, métropoles | **57 communes** |

Soit 13 281 réponses que le site donnait fausses. Les déchets sont
instructifs : la couverture du registre s'affichait à 100 %, l'arrondi cachait
57 trous réels.

**Ce qui n'est délibérément pas marqué compte autant.** Trois compétences ont
été examinées puis écartées, et la raison est consignée dans le contenu à côté
de chacune :

- **Mobilité** — la loi d'orientation des mobilités n'a rien transféré d'office.
  Chaque communauté de communes devait délibérer avant mars 2021 ; à défaut,
  c'est la *région* qui est devenue autorité organisatrice. Un registre muet ne
  veut donc dire ni « l'intercommunalité » ni « la commune » : la réponse juste
  est ailleurs. D'où une réserve, et non une marque d'obligation.
- **PLU** — transféré par défaut, mais une minorité de blocage de communes peut
  s'y opposer, et beaucoup l'ont fait. Une règle conditionnelle ne se réduit
  pas à « la loi tranche ».
- **Eau et assainissement** — le calendrier de transfert aux communautés de
  communes a été repoussé plusieurs fois. Le registre couvre déjà 92 % et 97 %
  des communes : le gain serait mince, et se tromper avec l'autorité de la loi
  coûte plus cher que de ne rien dire.

**La couverture d'un code n'est pas toujours un défaut de saisie.** Le code
« délivrance des autorisations d'urbanisme » n'est déclaré que par 2 à 4 % des
intercommunalités, et c'est exact : le maire signe — la compétence est
communale — et seule l'*instruction* se mutualise, par convention de service
commun. Une convention n'est pas un transfert et n'entre dans aucun registre.
La compétence porte donc une `reserve` : une phrase affichée avec la réponse,
qui dit ce que la réponse, même exacte, laisse de côté.

## Granularité

Un nœud = **une chose qu'on peut relier**, pas un thème. « L'urbanisme » n'est
pas un nœud : ce n'est ni un acteur, ni une compétence attribuable, ni un
processus. « Écrire la règle d'urbanisme (PLU) » en est un, parce qu'on peut
nommer qui la détient et avec qui il la partage.

Test simple : si on ne peut pas tracer une arête depuis le nœud, il est mal
découpé.

## Ordre de traitement proposé

1. **A** (socle, échelon local d'abord) — indispensable au reste.
2. **B** (valeur d'usage, trafic) — en s'appuyant sur A.
3. **C** (élargissement d'audience).
4. **D** (prebunking) — une fois la crédibilité installée.
5. **E** (outils) — quand le graphe est assez dense pour en tirer parti.
