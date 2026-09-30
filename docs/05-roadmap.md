# 05 — Feuille de route

Principe : **densifier le réseau avant de l'élargir.** Un graphe clairsemé ne
montre rien ; c'est la densité des relations qui fait la valeur, pas le nombre
de nœuds.

## Phase 0 — Cadrage ✔

Vision, familles, modèle de données, vues, choix techniques.

## Phase 1 — Le réseau local ✔

Carte d'ensemble, focus, pages de nœud sans JavaScript, encodage visuel validé,
validation du contenu en intégration continue.

## Phase 2 — Densifier *(en cours)*

Fait :

- **5 processus**, choisis pour couvrir les quatre prises réelles d'un
  habitant : l'information (demander un document administratif), le contrôle
  (contester une délibération), la participation (une enquête publique),
  l'argent (le vote du budget communal), et l'urbanisme (le permis de
  construire) ;
- les acteurs qui manquaient à ces circuits : CADA, commissaire enquêteur,
  chambre régionale des comptes, Défenseur des droits, CCAS, conseil d'école ;
- les réseaux : syndicat d'énergie et Enedis, autorité organisatrice de la
  mobilité et son exploitant, syndicat de SCoT, agence d'urbanisme, employeurs ;
- huit flux de plus — versement mobilité, redevance de concession, compensation
  à l'exploitant, cotisations, données ouvertes de réseau ;
- au total : 75 acteurs, 84 compétences, 19 flux, 11 processus, 24 documents,
  541 relations et 346 pages de référence.

Reste :
- ~~la relecture des attributions marquées `confiance: a_confirmer`~~ — faite.
  Les 204 fiches sont relues contre leur source : 37 acteurs, 41 compétences,
  15 flux, 11 processus et tout ce qu'ils portent. `npm run relire` affiche
  désormais « aucune fiche à confirmer », et le détail est plus bas.
- ~~le plan local d'urbanisme, seul document que rien ne reliait~~ — fait&nbsp;:
  le douzième processus l'écrit, et `npm run valider` ne signale plus rien.
- ~~l'ingestion du Géoportail de l'urbanisme~~ — faite pour ce qu'elle apporte
  sans risque&nbsp;: le document approuvé que l'enquête annuelle ne peut pas
  connaître. Le zonage reste à faire, et le coût en est mesuré plus bas.

**Fini quand** — le critère tenait en une phrase et n'avait jamais été
mesuré&nbsp;: « partir de n'importe quel nœud et atteindre n'importe quel autre
en trois clics, sans passer par une impasse ». Mesuré, il se révèle fait de deux
exigences de nature différente, et `npm run verifier-reseau` les tient chacune
comme elle le mérite&nbsp;:

- **sans impasse — un invariant.** Aucun nœud isolé, le graphe d'un seul tenant.
  Toute régression fait échouer le build. C'est acquis&nbsp;: 0 isolé,
  38 220 paires atteignables sur 38 220 ;
- **trois clics — un cliquet.** 67,5 % des paires y sont, diamètre 6 — contre
  62,0 % et 7 à la première mesure. À 215 nœuds, l'exiger de *toutes* les paires
  reviendrait à demander un graphe presque complet&nbsp;; le contrôle retient
  donc le plancher atteint et refuse de redescendre, plutôt que de poursuivre un
  absolu.

Le détail de la première mesure est plus bas.

### Une contrainte d'outillage levée ✔

Cette section décrivait une politique réseau qui refusait les hôtes d'open
data, et qui obligeait à écrire l'ingestion à l'aveugle. Ce n'est plus le cas :
BANATIC, l'OFGL, les portails Opendatasoft, `files.georisques.fr` et
`tabular-api.data.gouv.fr` répondent tous, et les huit sources sont ingérées
depuis cet environnement.

Ce qui reste fermé est consigné dans `CLAUDE.md` plutôt qu'ici, parce que c'est
une contrainte de travail et non une étape de la feuille de route : les grosses
réponses de `www.data.gouv.fr` font tomber le tunnel au bout de sept secondes —
on passe donc par l'API v2 de recherche ou par `tabular-api` — et Légifrance
refuse les requêtes automatisées, si bien qu'un article se vérifie par
recherche web et jamais de mémoire. Un identifiant `LEGIARTI` écrit de tête a
déjà été faux une fois.

## Phase 2 bis — Mettre en ligne ✔

Déploiement ✔, sitemap ✔, licences ✔, mentions légales ✔ — `contenu/editeur.yaml`
est rempli : éditeur, contact, directeur de la publication, hébergeur et
réalisation technique. C'étaient les seules informations du site que personne ne
peut déduire d'une source, et le déploiement refusait de publier tant qu'elles
manquaient.

Le domaine répond, et chaque poussée sur la branche par défaut valide, génère,
téléverse en FTPS et purge le cache. Il reste que rien n'est réel tant que
personne d'extérieur n'a touché le site — mais ce n'est plus une question de
mise en ligne.

## Phase 2 ter — « Chez moi » ✔ *(en place)*

La résolution territoriale : pour une commune donnée, qui exerce réellement les
compétences que le site décrit comme variables.

- `npm run territoires` fait la jointure entre l'export national BANATIC et le
  découpage administratif d'Etalab, puis écrit des fichiers versionnés dans
  `public/territoires`. **Le site n'appelle aucune interface à l'exécution** :
  la donnée vit dans le dépôt, le build est reproductible et hors ligne, et un
  changement se relit dans un diff.
- 34 875 communes, 9 290 groupements, 14 compétences résolues.
- Chargement en deux temps : un index de recherche léger, puis le seul
  département concerné — personne ne télécharge la France pour trouver sa
  commune.

**Le point le plus important n'est pas la jointure, c'est ce qu'on refuse de
dire.** Le registre a des trous : dans la Sarthe, 15 % des communes ont un
exerçant identifié pour la concession électrique, contre 94 % en France.
Conclure « la commune s'en charge » y serait faux — et faux avec aplomb, ce qui
est le pire défaut possible pour ce site. La couverture est donc mesurée par
département et comparée à la moyenne nationale, et le site distingue trois
états : transférée, communale, non renseignée.

**Choisir sa commune est la première marche, et elle est piégeuse.** 1 481 noms
de communes sont portés par plusieurs communes, soit 3 769 communes — plus d'une
sur dix. « Mayet » n'est pas « Le Mayet-de-Montagne ». La recherche classe donc
la correspondance exacte avant le préfixe, développe les abréviations — 3 885
communes commencent par Saint, personne ne l'écrit en entier — fait passer le
code postal devant le code INSEE, qui occupe le même espace de valeurs, et
affiche le département en toutes lettres avec la population pour départager.
`npm run verifier-recherche` fixe ces cas sur l'index réel : une régression de
tri est invisible à l'œil et proposerait la mauvaise commune.

### Les chiffres ✔

Six repères financiers par commune, tirés des comptes publiés par l'OFGL :
dotation de l'État, impôts locaux, dépenses de fonctionnement, frais de
personnel, dépenses d'équipement, encours de dette. En euros par habitant, et
rapportés à la médiane des communes de taille voisine — c'est précisément ce
que le site recommande par ailleurs de faire avant de conclure.

Là encore, ce qu'on refuse de dire compte : Paris exerce aussi des fonctions
départementales, ses comptes ne se comparent à ceux d'aucune autre commune, la
médiane lui est donc retirée et il est écarté du calcul des médianes des autres.
Et aucun montant faible n'est arrondi à zéro : la dotation communale de Paris
vaut 0,1 € par habitant, « 0 » se lirait « Paris ne reçoit rien ».

### Le prix de l'eau ✔

Rattaché au service qui la distribue réellement, puisque la structure est
identifiée pour chaque commune : prix TTC au m³, mode de gestion, et le nom du
délégataire quand il y en a un. 32 469 communes sur 34 875 sont couvertes ;
seules Mayotte, la Guadeloupe et le Territoire de Belfort décrochent, et
l'absence y est silencieuse plutôt qu'approximative.

**Le choix de source mérite d'être noté**, parce qu'il coûte cher. L'API
Hub'Eau expose ces indicateurs en JSON propre — mais s'arrête à 2018. Pour le
seul service de Mayet, le prix est passé de 2,11 € en 2018 à 2,73 € en 2024,
soit +30 % : un chiffre de 2018 serait faux aujourd'hui, même daté. La source à
jour n'existe que sous forme d'archive 7z contenant un classeur .xls, ce qui
impose deux dépendances de plus au script de rafraîchissement. On a préféré la
complexité au chiffre commode et faux.

### La veille ✔

Trois demandes distinctes — être alerté qu'une source change, réagir quand une
donnée plus fraîche paraît, se voir proposer de nouveaux jeux — sont le même
mécanisme avec trois déclencheurs. Elles ont été traitées ensemble.

Le point de bascule est celui-ci : la donnée sur le prix de l'eau avait déjà
deux ans avant qu'on s'en aperçoive, et on ne s'en est aperçu qu'en la
recoupant à la main. Un projet dont les sources se dégradent en silence ne
tombe pas en panne, il devient faux. Voir `06-stack-technique.md`.

### Le déploiement ✔

Publication automatique sur o2switch en FTPS, avec purge du cache Cloudflare.
Le piège n'était pas le FTP mais le DNS : Cloudflare ne relaie que HTTP et
HTTPS, un enregistrement proxifié ne transporte rien d'autre. Voir
`06-stack-technique.md`.

### Les branches du pouvoir ✔

Les entités de l'État étaient jusque-là un seul échelon indifférencié : sept
nœuds, sans distinction entre celui qui vote la loi, celui qui l'applique et
celui qui tranche. Elles sont maintenant 23, rangées par branche, avec une page
dédiée — la carte d'ensemble range par échelon, la séparation des pouvoirs est
orthogonale à cet axe.

Manquaient entièrement : le Parlement et ses deux chambres, le président de la
République, le Gouvernement, l'administration centrale, le Conseil d'État, le
Conseil constitutionnel, la Cour des comptes, les juridictions d'appel et
l'ordre judiciaire, la CNIL. Le Sénat méritait à lui seul d'être ajouté : ses
grands électeurs sont très majoritairement des conseillers municipaux, et les
textes sur l'organisation des collectivités lui sont soumis en premier.

La règle de validation a payé immédiatement : elle a révélé que le tribunal
administratif et la chambre régionale des comptes étaient typés
`service_deconcentre`, c'est-à-dire rangés parmi les bras de l'exécutif. Voir
`02-familles.md`.

### Où sont les services publics ✔

Écoles, collèges, lycées, France services, CCAS et établissements de santé —
83 719 implantations dans 22 958 communes, affichées sous le nom de la commune
choisie. Le reste du panneau dit qui décide ; ce bloc dit où l'on va.

Les casernes de pompiers manquent, et manqueront : elles ne sont pas publiées
en open data national, seuls les 98 états-majors départementaux le sont. On
nomme le SDIS compétent et on dit qu'on ne situe pas la caserne — plutôt que
d'inventer une proximité. Voir `06-stack-technique.md`.

### Ce qui a changé ✔ (et ce qui ne se tracera pas)

Les six repères financiers sont désormais suivis sur huit exercices, 2018-2025,
avec une courbe et la variation depuis le début de la série. Un chiffre isolé
ne se discute pas ; « +57 % depuis 2018 » appelle une question, et le site
nomme déjà celui à qui la poser.

Le traçage des **décisions** restait à voir. Une partie de ce constat était
fausse et a été corrigée depuis : voir « Ce qu'une école est devenue ». Ce qui
tient : ni les subventions de l'État aux communes, ni a fortiori le **motif**
d'une décision n'existent en open data national exploitable. Le détail des
vérifications est dans `06-stack-technique.md`. Mieux vaut le dire que le
simuler.

### Onze entités de plus ✔

Sécurité (gendarmerie, police nationale), services déconcentrés (DDT, DREAL,
finances publiques), médiation (conciliateur de justice, médiateur de
l'énergie) et agences (Anah, ANCT, ADEME, CAUE). 53 acteurs deviennent 64, et
66 compétences.

Le choix n'est pas encyclopédique : ce sont les entités qu'un habitant ou une
petite commune rencontre vraiment. Gendarmerie et police nationale ne se
partagent pas les tâches mais la carte, et c'est la première chose à savoir.
Le conciliateur de justice est gratuit et son passage est obligatoire avant le
juge sous 5 000 €. Le CAUE conseille gratuitement celui qui construit, et il
est déjà financé par la taxe d'aménagement qu'il paie.

Les liens pointent vers l'annuaire de Service-public plutôt que vers les pages
nationales : ce qu'on cherche, c'est sa brigade, sa DDT, sa DREAL.

Le repli par famille a tenu : « La commune » passe de 29 à 29 relations
partagées sans qu'une pastille de plus soit dessinée, et la colonne « État » du
plan d'ensemble s'est repliée d'elle-même en trois piles.

### La mobilité ne retombe jamais sur la commune ✔

La loi du 24 décembre 2019 ne laisse pas de trou : les communautés
d'agglomération, urbaines et les métropoles sont autorités organisatrices de
plein droit ; les communautés de communes le sont si elles ont délibéré avant
le 31 mars 2021 ; sinon la région exerce la compétence depuis le 1er juillet
2021. Le site répondait « la commune » là où le registre était muet —
c'est-à-dire dans le seul cas où la commune n'est certainement pas la réponse.

D'où un quatrième état du verdict : `a-defaut` nomme celui que la loi désigne,
et s'affiche à l'encre pleine parce que c'est une réponse, pas une incertitude.
12 113 communes répondent désormais avec leur région.

### Signaler une erreur ✔

Le site se trompera. Le registre ignore ce qui se décide en conseil
communautaire, une convention de mutualisation ne laisse aucune trace dans
l'open data, et le droit bouge. Le lecteur qui habite la commune en sait alors
plus que la donnée.

Un formulaire de contact générique aurait produit des messages incorrigeables.
« C'est faux » n'est pas une correction. `/signaler` ne reçoit donc que des
identifiants — un nœud, un code INSEE, un chemin interne — et recalcule le
relevé avec le code de l'explorateur : la page, la fiche, la commune, la
réponse exacte et son origine. Un relevé recopié depuis l'URL serait
falsifiable par qui fabrique un lien, et vieillirait sans qu'on le sache.

Le signalement devient une issue publique du dépôt : la correction se discute
au même endroit que le contenu. Pour qui n'a pas de compte, le même texte se
copie et part par un autre canal — pas d'adresse inventée, un lien mort vaut
moins que pas de lien.

### Culture, sport, funéraire, numérique ✔

Les quatre compétences qui manquaient, plus une cinquième que le référentiel
imposait de distinguer : BANATIC sépare les *activités* culturelles (5035) et
sportives (5040) des *équipements* qui les abritent (5000), et les
intercommunalités ne déclarent pas les mêmes.

Culture et sport sont un cas à part dans tout le site : l'article L1111-4 du
CGCT les déclare **partagés** entre commune, département, région et État.
Ailleurs, Rouages répond « qui exerce » ; ici la réponse honnête est
« plusieurs à la fois », et la réserve le dit plutôt que de laisser croire à un
exerçant unique.

Le cimetière est l'enseignement le plus utile. Sa couverture est de 5 %, et
c'est **correct** — l'inverse du cas de la concession électrique, où un
département à 15 % contre 94 % en France signale un registre incomplet. Ici,
l'article L2223-1 oblige chaque commune à disposer d'un cimetière : presque
aucune ne le transfère, et le silence du registre veut bien dire « la commune ».
L'heuristique ne s'y trompe pas, parce qu'elle compare le département à la
moyenne nationale et non à 100 %.

Reste que la Métropole du Grand Paris déclare ce code, et le site la nomme donc
pour Paris. En conclure qu'elle gère le Père-Lachaise serait faux : déclarer la
compétence n'est pas gérer chaque cimetière. C'est le cas où la réserve compte
le plus, parce que la réponse est exacte et l'inférence qu'on en tire ne l'est
pas.

### Une panne qu'on ne pouvait pas voir ✔

`public/territoires/meta.json` est écrit par `npm run territoires`, pas par le
build. Corriger une réserve dans les compétences ne suffisait donc pas à la
corriger sur le site : le contenu était juste, la validation passait, et le
panneau affichait l'ancien texte. C'est arrivé en écrivant la réserve du
cimetière, et rien ne l'aurait signalé.

Une règle de validation compare désormais les trois champs recopiés —
`obligatoires`, `reserves`, `aDefaut` — et refuse de publier tant qu'ils
divergent. Elle a attrapé son auteur dans la minute.

### Chiffrer les flux ✔

Deux des flux dont on parle le plus à un habitant — la taxe d'enlèvement des
ordures ménagères et le versement mobilité — n'apparaissaient nulle part sur le
site. La raison est un piège d'échelon : ils ne sont presque jamais dans les
comptes d'une commune, c'est le groupement qui les perçoit. Les chercher au
mauvais endroit ramène 568 lignes au lieu de 1 942, et répondre « la commune ne
perçoit rien » aurait été exact et sans intérêt.

Un repère déclare donc désormais l'échelon où sa mesure a un sens, et le site
sait déjà quelle structure sert chaque commune : la jointure BANATIC lui donne
le SIREN de chacun de ses groupements. Il ne manquait que le chiffre en face.
1 016 structures sont chiffrées, sur huit exercices, dans un fichier de 88 ko
chargé à part — le fondre dans `meta.json` ferait payer ce poids à chaque
visite pour une information que peu de gens ouvriront.

Ce qui a été refusé : combler l'absence. 886 intercommunalités perçoivent la
taxe d'enlèvement et 281 le versement mobilité ; les autres financent le
service autrement, par une redevance ou par un syndicat qui n'est pas un
groupement à fiscalité propre. La médiane ne porte donc que sur celles qui
perçoivent — les compter pour zéro ferait passer un taux ordinaire pour une
anomalie — et une valeur manquante reste manquante.

En vérifiant l'affichage, un défaut plus ancien est apparu : l'évolution était
annoncée « depuis 2018 » quelle que soit la première année réellement
renseignée. La communauté de communes Sud Sarthe n'a de taxe d'enlèvement qu'à
partir de 2022, et le site écrivait pourtant « + 6 % depuis 2018 ». Les deux
blocs nomment maintenant l'année du premier chiffre.

La veille, enfin, ne surveillait que la base communale de l'OFGL. Un agrégat
peut disparaître d'une base sans bouger dans l'autre, et « Versement transport »
existe résiduellement dans les deux : le contrôle aurait été rassurant à tort.
Chaque surveillance déclare désormais l'échelon dont elle répond.

### Ce qu'une école est devenue ✔ *(et un constat corrigé)*

Cette feuille de route affirmait que les effectifs par école, année après
année, n'existaient pas en open data exploitable. **C'était faux.** L'Éducation
nationale les publie depuis 2009 : 859 372 lignes, 55 928 écoles, avec le
nombre de classes. Le constat a été écrit sans vérifier, et il a tenu jusqu'à
ce qu'on cherche.

Le site montre désormais, pour chaque école du premier degré d'une commune, son
nombre de classes et d'élèves sur dix rentrées, et nomme la dernière variation :
« −1 classe à la rentrée 2025 ». À Mayet, l'école Jules Ferry est passée de 7 à
6 classes en 2018 et la maternelle St Exupéry de 4 à 3 en 2025 ; au
Mayet-de-Montagne, l'école Yves Duteil a perdu une classe en 2021. 46 670
écoles sont suivies.

Ce qui reste refusé, c'est le **motif**. Ni le seuil appliqué cette année-là, ni
l'arbitrage du rectorat ne sont publiés. Montrer le fait et nommer le décideur
suffit à savoir à qui écrire — et c'est justement là que le site sert : la
carte scolaire relève des services de l'État, pas du maire, même quand la
commune est propriétaire des murs.

**La jointure méritait de la méfiance.** Le jeu des effectifs porte un champ
nommé `code_commune_insee` qui contient en réalité le code postal. Pour Mayet
(Sarthe) il vaut 72360 — qui est aussi un vrai code INSEE, celui de Trangé, à
quarante kilomètres. S'y fier aurait rattaché les écoles à la mauvaise commune,
sans erreur visible ni ligne perdue : le pire genre de bogue, celui qui produit
une réponse plausible. La clé retenue est le numéro UAI, que l'annuaire de
l'éducation fournit avec le bon code INSEE.

### Qui est le maire ✔

Le site nommait des structures et ne nommait personne. « La commune décide » ne
dit pas à qui écrire, et c'est la question qui amène le plus de monde. Les
34 743 communes pour lesquelles le répertoire national publie un maire
l'affichent désormais, avec sa date de prise de fonction.

**La règle « aucun nom de personne physique » n'a pas été levée, elle a été
précisée — et en le devenant, elle s'est durcie.** Le graphe décrit des
fonctions : le nœud reste « le maire ». Le nom du titulaire est une donnée
territoriale, au même rang que le nom de la communauté de communes ; il ne crée
ni nœud, ni arête, ni page. Et le contrôle des civilités, qui ne visait que la
famille « influence », porte maintenant sur **tout** le contenu : un nom en dur
dans `contenu/` s'y périmerait en silence, puisque le contenu n'a pas de date de
rafraîchissement là où les fichiers de données en ont une. La règle a été
éprouvée en y glissant volontairement un nom : elle l'a refusé.

Minimisation : le répertoire publie la date de naissance, le sexe et la
catégorie socio-professionnelle de chaque élu. Aucun des trois ne sert à savoir
qui décide, aucun n'est collecté — ce qui n'est pas collecté n'a pas à être
protégé.

Le risque principal n'est pas la vie privée, le mandat étant public par nature :
c'est la péremption. D'où la date affichée avec le nom, la surveillance du
répertoire dans la veille avec un seuil serré à 5 %, et le signalement ouvert à
qui constate l'erreur. Voir `07-risques.md`.

Note d'outillage : `data.gouv.fr` reste hors d'atteinte depuis l'environnement
de développement, mais son API tabulaire (`tabular-api.data.gouv.fr`) répond.
Elle sert la ressource par pages de cent — 349 pages, environ 90 secondes — et
l'ingestion refuse d'écrire si elle en a perdu plus d'un dixième : mieux vaut
échouer que publier un annuaire troué.

### Les « frais de notaire » sont un impôt ✔

C'est le malentendu le plus répandu de la fiscalité locale, et le site est fait
pour ce genre de chose. L'essentiel de ce qu'on appelle « frais de notaire » ne
va pas au notaire : ce sont les droits de mutation, qu'il collecte et reverse au
département et aux communes — deux échelons déjà décrits ici. Dans l'Allier :
37,7 M€ pour le département en 2025, 9,2 M€ pour les communes du département.
Et la série dit ce qu'un chiffre seul ne dirait pas : 42,7 M€ en 2021, 32,8 M€
en 2024, un quart de la recette perdu en trois ans sur un budget départemental.

**La part communale change de destinataire selon la taille de la commune**, et
c'est le seul endroit du site où une règle de droit dépend de la population.
Au-dessus de 5 000 habitants, l'article 1584 du CGI verse la taxe additionnelle
à la commune ; en dessous, l'article 1595 bis l'oriente vers un fonds de
péréquation départemental redistribué selon un barème voté par le conseil
départemental. Le site connaît la population : il tranche au lieu de décrire les
deux cas. Le Mayet-de-Montagne relève du second, Moulins du premier. Les
stations de tourisme classées font exception, et le site ne connaît pas ce
classement — il le dit.

**Le taux voté par chaque département n'est pas recopié.** Il existe, dans un
tableau officiel département par département, et le site y conduit. Recopier
cent une valeurs révisées chaque année, c'est se condamner à les laisser
vieillir : c'est exactement ce que le projet s'interdit ailleurs.

Trois professions entrent au graphe avec le notaire, parce que l'État leur
délègue une prérogative et que leur intervention est obligatoire, pas choisie :
le notaire qui donne force authentique, le commissaire de justice sans qui un
jugement gagné ne s'exécute pas, et le géomètre-expert seul habilité à fixer une
limite de propriété — le cadastre sert l'impôt et ne délimite rien. Aucune étude
n'est listée : le site renvoie vers l'annuaire de chaque profession, comme il le
fait pour la gendarmerie ou la DDT.

### Le conseil juridique gratuit ✔

2 524 points-justice — permanences d'avocat, de notaire, de conciliateur ou
d'association, gratuites, coordonnées par le conseil départemental de l'accès
au droit. Ils étaient déjà dans l'annuaire que le site ingère : il ne les
lisait pas.

Le travail n'a pas été de les collecter mais de **généraliser le voisinage**.
Une école est dans la commune ou elle n'y est pas ; un point-justice existe par
bassin de vie. Le mécanisme qui signalait les France services des communes
voisines ne servait qu'à elles ; il vaut maintenant pour toute famille qui le
mérite. Au Mayet-de-Montagne, le panneau répond « aucun dans la commune —
Saint-Germain-des-Fossés, Saint-Yorre » là où il n'aurait rien dit.

Les 110 points-justice installés en détention sont écartés : ils ne sont pas
ouverts au public. Dans l'Allier, 18 des 20 recensés sont retenus.

### L'obligation de logements sociaux ✔

L'article 55 de la loi SRU est l'une des rares obligations à la fois chiffrée,
datée et sanctionnée qui pèse sur une commune : un taux à atteindre, un écart
constaté, un prélèvement quand il n'est pas comblé, et la carence — seule
situation où le préfet peut se substituer au maire pour délivrer les permis.
L'inventaire annuel du ministère donne tout cela, commune par commune, avec un
code INSEE propre : 2 206 communes soumises, 1 140 déficitaires, 335 carencées,
690 prélevées pour 135 M€.

Deux silences sont volontaires. **Les communes absentes du fichier ne sont pas
en défaut** : elles n'atteignent pas les seuils de population et
d'agglomération, et écrire « 0 » se lirait comme un manquement. Et **« Pas
d'inventaire » n'est pas une donnée manquante** : Le Mans porte cette mention
avec un taux « >25% », parce que la commune dépasse la cible et que
l'inventaire détaillé ne lui est donc pas demandé. Le site reprend le texte du
fichier plutôt que d'afficher un trou.

La fragilité connue : l'identifiant de la ressource change à chaque millésime.
La veille la surveille pour que sa disparition se voie au lieu de se deviner.

**Le répertoire des logements locatifs sociaux (RPLS) proprement dit n'est pas
intégré** : le fichier national par commune n'est pas servi par une interface
requêtable joignable, et l'inventaire SRU couvre déjà les communes où
l'obligation — et le débat — existent.

### Ce qui est commandé ✔

Les données essentielles de la commande publique disent à quoi une collectivité
passe commande. C'est la forme la plus concrète de « où va l'argent » : un
objet, une date, un montant. Le site montre les marchés de la commune, puis
ceux de chacun de ses syndicats — qui dépensent souvent davantage et que
personne ne pense à regarder. 13 473 acheteurs du bloc communal sont couverts,
sur 379 986 marchés notifiés depuis 2023.

La jointure est sûre : `acheteur_id` est un SIRET dont les neuf premiers
chiffres sont le SIREN, et le site connaît déjà le SIREN de chaque commune
(découpage Etalab) comme de chaque groupement (BANATIC).

**Ce qui a demandé le plus de discernement, c'est de refuser le total.** Un
accord-cadre déclare un plafond, et chacun de ses lots le redéclare en entier :
sept marchés parisiens portent 21 M€ chacun pour un seul accord. Additionner
les 661 873 marchés attribue 185 Md€ au seul bloc communal en trois ans —
davantage que la commande publique française entière. Le chiffre aurait été
faux d'un ordre de grandeur, et personne ne l'aurait vu. Le site affiche donc
les lignes et pas de somme, et dit pourquoi.

Deux limites de plus sont dites plutôt que corrigées : un même marché figure
parfois deux fois sous deux libellés — le recensement n'est pas dédoublonné à
la source, et un rapprochement approximatif serait une devinette ; et le
recensement n'est complet que depuis 2023. Deux corrections seulement sont
appliquées, parce qu'aucune ne peut rien abîmer : `¿` tient lieu d'apostrophe
dans 3 603 objets, toujours entre deux lettres ; et les octets 0x80 à 0x9F de
Windows-1252 arrivent lus comme du Latin-1, donc comme des caractères de
commande — « GROS UVRE », « DACTIONS » — dans 1 783 objets sur
369 872. Un caractère de commande n'a aucune raison d'être dans un libellé, et
la table de Windows-1252 dit exactement lequel était visé.

### Les 88 % de marchés qu'on ne montrait pas ✔

Le fichier du département ne portait que les cinq marchés les plus récents de
chaque acheteur : **49 804 lignes sur 419 052**, et la mention « les 5 plus
récents » ne menait nulle part. Vichy Communauté en a 325, la ville de
Marseille 5 523 — un lecteur ne pouvait en voir cinq.

La suite de chaque liste a désormais son propre fichier, chargé au clic :
**6 670 fichiers, 45 Mo, 2 ko dans le cas médian**. Un fichier par acheteur et
non par département, parce qu'on ouvre la liste d'un acheteur, jamais celle de
tout un département — et 2 ko à télécharger au lieu de 1,5 Mo. Les cinq
premiers n'y sont pas répétés : le client les a déjà, et les redonner aurait
coûté cinq mégaoctets pour rien.

Côté panneau, le bouton se déplie par vingt-cinq et dit toujours combien il
reste : « voir les 295 autres ». Une liste de 5 523 marchés dépliée d'un coup
ne se lit pas, et fige le panneau sur un téléphone. Le décompte lui-même
informe : c'est lui qui donne la mesure de ce qu'une collectivité commande.

Le site passe ainsi de 36 000 à près de 43 000 fichiers, ce qui allonge
l'envoi FTP complet sans changer le poids de la page : qui ne clique pas ne
télécharge rien de plus.

### Une page par commune ✔

Le panneau « chez vous » répondait déjà, mais il ne répondait qu'à qui
exécutait le JavaScript et savait qu'il existait. 34 875 communes n'avaient
aucune adresse propre : rien à envoyer à un voisin, rien à indexer, rien à
ouvrir depuis un moteur de recherche.

Chaque commune a désormais sa page statique, `/commune/03165` pour
Le Mayet-de-Montagne, construite au build à partir des mêmes fichiers que le
panneau. Le verdict — qui exerce réellement chaque compétence — a été sorti
dans `src/modele/verdict.ts` pour que les deux rendus ne puissent pas diverger :
une seule fonction, deux appelants.

Le coût est réel et il est mesuré : **35 954 fichiers, 455 Mo, 108 secondes de
build**, environ 10 Ko par page, et de l'ordre d'une demi-heure de miroir FTP
complet. Le déploiement est passé à huit transferts parallèles pour tenir.

Le plan de site suit la même arithmétique : un index, un plan des pages du
réseau, puis un plan par département. Un fichier unique serait sous la limite
de 50 000 URL, mais sans aucune marge.

### Les comptes du département et de la région ✔

Le site nommait le département à chaque écran — le collège, la route, le revenu
de solidarité active, l'aide à l'autonomie — sans jamais montrer ce qu'il
dépense. Un lecteur pouvait connaître les six repères financiers de sa commune
de 1 400 habitants et rien de l'échelon qui décide de son collège.

Les mêmes agrégats de l'OFGL sont désormais lus pour les 97 départements et les
17 régions qu'il publie, sur huit exercices, et affichés sous les comptes
communaux avec la médiane de l'échelon. Deux précautions :

- **le budget principal seulement.** 230 391 lignes sur 318 638 sont des
  budgets annexes — un domaine, un laboratoire, un service d'incendie. Les
  additionner gonflerait tout sans rien expliquer.
- **« Impôts locaux » est retiré à ces deux échelons.** La part départementale
  de la taxe foncière est passée aux communes en 2021 ; départements et régions
  sont depuis compensés par une fraction de TVA, que cet agrégat ne porte pas.
  Il reste 65 € par habitant dans l'Allier contre 375 en 2020, et des valeurs
  *négatives* pour les régions — une écriture de restitution, pas un impôt.
  Afficher cela sous ce libellé ferait conclure qu'un département ne lève
  presque rien : vrai de l'agrégat, faux de ses recettes. Le repère est donc
  absent et la raison écrite dans le code qui l'écarte.

Les explications des repères ne sont pas recopiées non plus : celles de
`reperes.yaml` sont écrites pour une commune — « ce que l'État verse à la
commune » — et diraient autre chose que le chiffre affiché sous les comptes
d'un département.

### Cinq démarches de plus ✔

Le site savait décrire un permis de construire et une enquête publique, c'est-à-
dire ce qu'on subit. Il ne disait rien de ce qu'on demande. Cinq processus
comblent le trou, chacun avec ses leviers d'action et ses pièges :

- **inscrire un enfant à l'école** — la mairie inscrit, le directeur admet :
  deux actes, deux autorités, et un refus possible de chaque côté ;
- **demander le revenu de solidarité active** — le département décide, la
  caisse verse, France Travail accompagne. Écrire à la caisse pour contester
  fait perdre le délai ;
- **demander un logement social** — la date du premier enregistrement fixe
  l'ancienneté, et une part des logements est attribuée par des réservataires
  que le bailleur ne choisit pas ;
- **contester une facture d'eau** — le plafonnement après fuite n'est jamais
  automatique, et la médiation exige une réclamation écrite préalable ;
- **s'inscrire sur la liste électorale** — depuis 2019 le maire décide seul,
  le recours devant la commission de contrôle est un préalable obligatoire, et
  c'est le juge judiciaire qui tranche.

Deux acteurs et une compétence sont apparus avec eux : la Médiation de l'eau,
la commission de contrôle des listes électorales, et la tenue de la liste
électorale — une compétence que la commune exerce au nom de l'État, sans code
BANATIC, donc absente de la résolution territoriale et présente dans le réseau.

Les fiches `service-public.fr` sont enregistrées sous `service-public.gouv.fr` :
le portail a migré, les anciennes adresses redirigent.

### À quoi l'endroit est exposé ✔

Tout le reste du site dit qui décide. Ce bloc-là dit ce qui arrive — et c'est
la première question qu'on se pose en arrivant quelque part, bien avant de
savoir qui exerce la compétence voirie.

GASPAR, la base du ministère de la Transition écologique, tient en **une
archive de 8 Mo** : les risques recensés au dossier départemental, les
**247 141 arrêtés de catastrophe naturelle depuis 1982**, les 32 789 procédures
de plan de prévention et les documents d'information communaux. Un seul
téléchargement, là où l'interface par commune de Géorisques imposerait 34 875
appels.

**Deux listes, et le site refuse de les fondre.** Le dossier départemental
recense ce à quoi l'État estime la commune exposée ; les arrêtés disent ce qui
est arrivé. Au Mayet-de-Montagne, le premier retient le séisme et le feu de
forêt ; le second compte trois inondations, une sécheresse, une tempête et un
mouvement de terrain — aucun des deux risques recensés. Ce sont deux
instruments, l'un prospectif et l'autre constaté ; les rapprocher serait
tentant et faux. Le site les affiche côte à côte et dit qu'ils ne se recouvrent
pas.

Trois autres décisions :

- **Le nombre d'arrêtés ne vaut que comparé.** 34 699 communes sur 34 875 en
  ont au moins un : le chiffre brut ne distingue personne. La médiane
  nationale est de 6, et c'est elle qui donne son sens au chiffre local — Le
  Mayet-de-Montagne en compte exactement 6.
- **Les plans caducs sont écartés.** Seuls `Opposable` et `Prescrit` sont
  montrés : un plan caduc ne s'impose plus à personne, et l'afficher laisserait
  croire le contraire. « Opposable » est le mot qui compte — le plan vaut alors
  servitude d'utilité publique et s'impose aux permis, y compris à l'État
  (art. L562-4 du code de l'environnement).
- **L'absence de document d'information communal se dit, sans conclure.**
  9 744 communes sur 34 875 en ont publié un. Son absence ne dit rien des
  risques eux-mêmes, seulement que l'information n'a pas été faite — et le
  site distingue les deux cas, puisque l'obligation d'informer la population
  tous les deux ans ne pèse que là où un plan est prescrit ou approuvé.

Avec ce bloc viennent deux compétences que le graphe séparait mal : **l'État
prescrit la contrainte, le maire doit la faire connaître.** Un habitant qui
ignore laquelle est en jeu s'adresse presque toujours au mauvais des deux. Et
un processus, `s-informer-sur-les-risques`, dont les leviers portent les pièges
de forme habituels : l'état des risques doit dater de moins de six mois et
figurer dès l'annonce immobilière depuis 2023 ; le délai de déclaration après
un arrêté de catastrophe naturelle court depuis sa publication au Journal
officiel et non depuis le sinistre, et il est passé de dix à trente jours en
2023 ; et un particulier ne peut pas demander lui-même la reconnaissance —
seule la commune peut saisir le préfet, si bien que sans démarche du maire
aucun sinistré n'est couvert.

### Comment le conseil a été élu ✔

Le site nomme le maire. Il ne disait pas dans quelles conditions ce maire avait
été désigné — ce qui est la même question, posée en amont.

Les résultats du ministère de l'Intérieur, commune par commune, donnent trois
chiffres et **34 801 communes** couvertes : la participation, la part de
bulletins blancs ou nuls, et le nombre de listes en présence. Chacun rapporté à
sa médiane nationale, parce qu'un taux seul ne se discute pas — 57 % n'est ni
bon ni mauvais tant qu'on ignore que la médiane est à 63,2 %.

**Ce que le module ne collecte pas, et c'est la décision principale : les
nuances politiques.** Le fichier les porte, liste par liste. `07-risques.md`
est explicite : « relier une personne à une opinion, à un financement, à un
réseau » reste interdit, et la règle n'a pas été levée quand le site s'est mis
à nommer les maires — elle a été précisée. Le nom d'un titulaire est une donnée
d'annuaire ; sa couleur politique est autre chose. Le fichier des résultats par
commune ne porte d'ailleurs aucun nom de candidat : ils sont dans un fichier
séparé, que le site n'ouvre pas.

Ce qui reste est structurel, et parle de soi. Au Mayet-de-Montagne :
**56,8 % de participation, et 28,2 % de bulletins blancs ou nuls** — trois fois
la médiane nationale de 9,3 % — pour **une seule liste**. À Vichy, trois
listes : 50,5 % de participation et 3,2 % de blancs et nuls. Le rapprochement
se fait tout seul, et sans que le site ait à conclure quoi que ce soit.

Deux repères nationaux accompagnent chaque fiche : **23 681 communes sur
34 836 n'avaient qu'une seule liste au premier tour**, soit 68 % ; et 1 526
communes seulement ont connu un second tour. S'y ajoutent les sièges au conseil
municipal et **au conseil communautaire** — le poids de la commune là où se
décident les compétences transférées, que tout le reste du panneau décrit.

Le scrutin de 2026 est aussi le premier où toutes les communes votent au
scrutin de liste paritaire : la loi du 21 mai 2025 l'a étendu aux communes de
moins de 1 000 habitants, sept sur dix, et le panachage a disparu. Le processus
d'inscription électorale le dit.

### Les délibérations, sans recensement national ✔

C'est là que se décide ce que tout le reste du site décrit : une compétence
transférée l'a été par une délibération, un budget voté l'est en séance, un
marché est autorisé par une autorisation de signature. Le site montrait le
résultat sans jamais montrer l'acte.

**Il n'existe aucune consolidation nationale**, et la raison est juridique :
l'ordonnance n° 2021-1310 impose depuis le 1er juillet 2022 de publier les
actes en ligne — mais **sur le site de la collectivité**. Elle a dématérialisé
la publicité sans créer de dépôt central, et l'open data reste facultatif.

Ce qui existe, en revanche, c'est un **format commun** : le schéma SCDL
« délibérations ». Le collecteur s'y adosse, et se remplit par deux robinets :

- **la découverte**, par l'attribut de schéma que data.gouv expose — 211
  ressources aujourd'hui, ingérées sans qu'on ait à les connaître, et la
  couverture grossit d'elle-même ;
- **une liste déclarée**, pour les agrégateurs qui publient au format sans le
  déclarer sur leurs ressources. Mégalis Bretagne est le plus gros — la
  découverte seule le manquerait, et avec lui l'essentiel du volume.

Résultat : **570 916 délibérations depuis 2014, pour 1 260 collectivités** —
communes, intercommunalités, syndicats, un département et une région. Le
rattachement se fait par SIREN, exactement comme les marchés, si bien qu'une
délibération de la communauté d'agglomération ou du syndicat d'eau apparaît
sous la commune qu'elle engage.

**Le bloc ne vaut jamais zéro.** Une collectivité absente n'est pas une
collectivité qui ne délibère pas : c'est une collectivité qui ne verse pas ses
actes en données ouvertes, et la phrase de source le dit en toutes lettres. Ce
n'est pas la même chose que les subventions, où un total partiel aurait été un
chiffre faux ; ici, une liste absente est une liste absente.

**3 294 délibérations sont écartées** parce que leur objet nomme quelqu'un —
« cession de la parcelle AC 0151 à Madame X », « aide sociale à M. Y ». Ce sont
précisément celles qui statuent sur le cas d'une personne. Le filtre réutilise
le motif qui interdit déjà un nom dans `contenu/`, désormais dans
`src/modele/civilites.ts` pour que les deux usages ne divergent pas. Il est
grossier — un nom sans civilité lui échappe — et il ne remplace pas la
précaution qui vaut pour tout le bloc : **le site relaie un intitulé et un
lien, jamais le document**, qui reste chez la collectivité qui l'a publié.
C'était la réserve de `07-risques.md` sur les délibérations : elle visait
« republier et indexer », et lier ne fait ni l'un ni l'autre.

Deux défauts que le premier essai a révélés, et qu'aucune relecture de code
n'aurait attrapés : un producteur écrit en point-virgule et un autre en
virgule — le délimiteur se tranche sur l'en-tête ; et un fichier est en
Windows-1252 quand tous les autres sont en UTF-8 — le décodage strict échoue
sur ces octets, et c'est ce qui les signale, sans avoir à deviner.

Un troisième est resté tel quel, après vérification de la source : un
producteur retire les apostrophes de ses intitulés — « en application de
larticle L2122-22 ». Le réparer demanderait de distinguer « larticle » de
« larve », donc un dictionnaire. Le site rend l'intitulé tel qu'il a été
publié, comme il rend les majuscules sans accents des marchés publics.

### Les subventions aux associations ✔ *(revenues par une autre porte)*

Elles avaient été écartées : publiées collectivité par collectivité, sans
agrégat national, elles ne permettaient pas de reconstituer un total qui ne
soit pas trompeur. Le collecteur écrit pour les délibérations a changé la
donne — il ingère **tout jeu conforme à un schéma du socle commun**, sans
qu'on ait à connaître les producteurs, et le schéma « subventions » existe au
même titre que celui des délibérations.

La mécanique commune est sortie dans `scripts/donnees-ouvertes.ts` : détection
du délimiteur, détection de l'encodage, découverte par attribut de schéma.
Trois précautions qu'un fichier réel a exigées chacune, et qui servent
désormais deux collecteurs au lieu d'un.

**Aucun total n'est affiché, et cette fois la raison est dans le texte.** Le
décret n° 2017-779 n'impose la publication qu'au-dessus de **23 000 €**, et
seulement pour les collectivités de plus de 3 500 habitants employant plus de
cinquante agents. Certains producteurs publient tout, d'autres s'en tiennent
au seuil — le titre de leurs jeux le dit souvent : « subventions de
fonctionnement supérieures à 23 000 € ». Sommer les deux donnerait un chiffre
sous-estimé d'un facteur inconnu, variable d'une commune à l'autre. Le site
montre les lignes, les plus grosses d'abord, et dit pourquoi il ne les
additionne pas.

Deux découvertes en chemin :

- **Les trois quarts des lignes venaient de départements et de régions que le
  site ne savait pas rattacher.** Les collectivités territoriales portent un
  SIREN construit — `22` puis le code du département, `23` puis celui du
  département chef-lieu pour une région — et la règle a été vérifiée sur huit
  cas observés avant d'être écrite. Les collecteurs prennent désormais un
  prédicat plutôt qu'une liste figée, ce qui profite aussi aux délibérations :
  les assemblées départementales et régionales y entrent du même coup.
- **9 971 lignes sont perdues sans recours** : leur SIRET a été enregistré par
  un tableur en notation scientifique — `2,256E+13`. La précision est partie
  avec, et aucun traitement ne la rend. On le constate, on ne le devine pas.

Le mot-clé reste dans la veille : le jour où un agrégat national paraît, la
couverture cesse d'être une affaire de bonne volonté.

### Les obligations de publication ✔

La phase 2 bis listait « mentions légales, licence » sans que rien n'existe :
le pied de page affirmait un contenu « sous licence CC BY-SA 4.0 » qu'aucun
fichier du dépôt n'adoptait, et le README la donnait comme une « proposition ».

Ce qui est en place :

- **`LICENSE` (MIT) pour le code, `LICENSE-CONTENU.md` (CC BY-SA 4.0) pour le
  contenu éditorial.** Le second est la licence de Wikipédia, ce qui est
  cohérent avec un projet qui relie plutôt qu'il ne réécrit.
- **La licence de chaque jeu réutilisé, vérifiée une par une** plutôt que
  supposée : OFGL et DECP en Licence Ouverte v2.0, GASPAR et le répertoire des
  associations en Licence Ouverte, le découpage Etalab en Licence Ouverte
  également — ses codes postaux, autrefois sous ODbL, ne le sont plus.
  **Aucun ODbL**, donc aucun partage à l'identique qui entrerait en conflit
  avec le CC BY-SA du reste. La seule obligation est de citer la source et sa
  date : chaque bloc de chiffres le fait déjà.
- **Une page `/mentions`** qui dit ce que le site sait de son lecteur — un
  site statique, aucune mesure d'audience, aucun cookie, une seule clé de
  stockage local pour la commune choisie — et qui **construit la liste des
  jeux réutilisés depuis la veille** plutôt que de la recopier : une liste
  écrite à la main vieillirait dès la source suivante.
- **L'identité de l'éditeur est du contenu, donc vérifiée par le build.**
  `contenu/editeur.yaml` la déclare, et `npm run publier` — ce que lance le
  déploiement — refuse de générer tant qu'un champ porte sa valeur d'attente.
  `npm run build` se contente d'un avertissement : l'obligation de l'article 6
  de la loi pour la confiance dans l'économie numérique naît de la mise à
  disposition du public, pas de l'écriture d'une fiche.

### Ce qu'une visite pesait vraiment ✔

Six blocs de données ont été ajoutés en quelques jours — risques, élections,
délibérations, subventions, comptes des échelons, marchés complets — sans que
personne mesure le cumul. La mesure, faite au navigateur sur
Le Mayet-de-Montagne, a donné **2 265 Ko pour une commune**, dont
**1 444 Ko pour le seul `index.json`** : les deux tiers du poids total.

Cet index est le catalogue des 34 875 communes, et il ne sert qu'à **chercher
par nom**. Or `trouverParCode` le chargeait entier pour résoudre un seul code
— c'est-à-dire à chaque arrivée sur une commune déjà choisie, par un lien
partagé ou par le choix mémorisé. Le catalogue de la France pour trois champs.

Le fichier du département porte déjà le nom et la population, et `resoudre`
allait le chercher juste après de toute façon. Il lui manquait les codes
postaux — trois kilo-octets par département — et le nom du département, sorti
dans un `deps.json` de deux kilo-octets. Le code INSEE donne le département
sans ambiguïté : vérifié sur les 34 875 communes avant d'écrire la règle.

**2 265 Ko → 826 Ko, soit 64 % de moins**, sans rien retirer du panneau.
L'index ne descend plus que si l'on ouvre la recherche.

**Un bug introduit et attrapé par la même mesure.** Ranger la structure du
département dès `trouverParCode` faisait passer la garde de `resoudre` pour
satisfaite, et les onze autres fichiers — finances, services, marchés,
risques — n'étaient plus chargés du tout. Le panneau s'affichait à moitié sans
rien signaler : 482 Ko et quatre blocs au lieu de neuf. Une relecture de code
ne l'aurait pas vu ; le compteur d'octets, si. La garde est désormais un
ensemble distinct, et son commentaire dit pourquoi.

Restait un chiffre que l'allègement ne pouvait pas corriger : le panneau
faisait **7 032 pixels de haut**, sept mètres de défilement sur un téléphone.
Ce n'était pas un poids, c'était une absence de navigation — traitée ci-dessous.

### Sept mètres de défilement, ramenés à un écran ✔

Jusqu'à douze blocs empilés, aucune hiérarchie, aucun moyen d'aller au dernier
sans passer par tous les autres. Au Mayet-de-Montagne, où neuf s'affichent, le
bloc « chez vous » mesurait **6 849 pixels** ; à Plouézec, qui publie en plus
ses délibérations et ses subventions, davantage encore.

Le remède n'est pas d'en retirer. Chaque bloc est désormais **replié derrière
son propre titre** — un `<details>` dont le résumé est le titre qui s'y
trouvait déjà, donc rien d'ajouté, rien de répété. Un **sommaire** de
pastilles, au-dessus, ouvre n'importe lequel et l'amène en haut de l'écran ;
le focus clavier suit, sans quoi la touche suivante repartirait du sommaire.

Un seul bloc reste ouvert : **qui exerce quoi**. C'est la réponse que le reste
du site ne sait pas donner sans connaître la commune, et la replier reviendrait
à cacher ce pour quoi on est venu. Il se referme comme les autres — un bloc
qu'on ne peut pas refermer redevient un mur.

| | Le Mayet-de-Montagne | Plouézec (12 blocs) |
| --- | --- | --- |
| Avant | 6 849 px | — |
| Après, à l'ouverture | 1 747 px | 2 242 px |
| Après, tout replié | 581 px | 641 px |

Mesuré au navigateur à 420 pixels de large, comme le reste : c'est la hauteur
réelle rendue, pas une estimation.

### Ce qui se crée en associations ✔

Le site disait ce que les institutions décident, dépensent, commandent et
versent. Il ne disait rien de ce qui se monte sans qu'aucune d'elles ait eu à
le décider — et c'est la forme d'organisation collective la plus répandue du
pays. Le répertoire national des associations le sait : **420 475 créations de
2020 à 2025, dans 27 541 communes**, dix au Mayet-de-Montagne.

**Un compte d'associations aurait été faux, et le site n'en publie pas.** Le
répertoire se lit en deux fichiers, et le ministère dit lui-même comment ils se
partagent : `waldec` porte les associations créées ou ayant déclaré un
changement depuis 2009, `import` celles créées depuis 1901 qui n'ont rien
déclaré depuis. Or `import` ne porte **aucun code INSEE** — seulement un code
postal, qui couvre plusieurs communes — et sa colonne de position marque encore
« active » des associations déclarées en 1903. Additionner les deux donnerait un
total faux dans les deux sens à la fois : trop haut par les dormantes, mal placé
par le code postal.

Une date de création, elle, est un fait daté. Les données le confirment : les
créations de `import` s'arrêtent en 2009 — 1 415 cette année-là, puis une
poignée de dates manifestement fautives, jusqu'à 2029. **Waldec est donc
complet pour tout ce qui se crée depuis 2010.** Le site compte des créations sur
une fenêtre de six années civiles complètes, les rapporte à mille habitants
(médiane nationale **5,3**, calculée sur toutes les communes peuplées, celles
sans création comprises), les répartit par domaine déclaré et nomme les quatre
dernières.

Trois choses qu'il ne reprend pas :

- **l'adresse.** Le siège d'une petite association est souvent le domicile de
  celui qui l'a déclarée. Le site en retient la commune, rien d'autre — ni la
  voie, ni le numéro, ni la civilité du dirigeant, que le répertoire publie
  pourtant ;
- **le jugement sur la vie de l'association.** Une dissolution se déclare, elle
  ne se constate pas ; le bloc dit qu'il compte ce qui s'ouvre ;
- **les intitulés qui nomment quelqu'un** — 334 écartés par le même motif qui
  interdit un nom dans `contenu/`.

Le rattachement a demandé une table, et le découpage la portait déjà. Onze pour
cent des créations ne tombaient sur aucune commune connue : quatre cinquièmes
parce que Paris, Lyon et Marseille déclarent par arrondissement, le reste parce
qu'une association déclarée à Annecy-le-Vieux porte encore le code d'avant la
fusion. Le fichier des communes d'Etalab nomme les deux — `commune` pour un
arrondissement municipal, `chefLieu` pour une commune déléguée ou associée — soit
**2 037 codes à reporter**. La perte tombe de 11,2 % à **0,02 %** : soixante-six
créations sur quatre cent vingt mille, dont onze sans code du tout. Écrire cette
table à la main aurait couvert les arrondissements et manqué les fusions.

**Trois départements n'ont aucun fichier, et ce n'est pas un trou.** Le
Bas-Rhin pèse vingt et une lignes dans tout le répertoire, la Moselle onze, le
Haut-Rhin deux — contre vingt-deux mille pour la Meurthe-et-Moselle voisine. En
Alsace-Moselle une association ne se déclare pas en préfecture : elle s'inscrit
au registre des associations tenu par le greffe du tribunal judiciaire, sous le
code civil local. Laisser le bloc absent se serait lu comme « on ne sait pas » ;
le panneau y affiche donc la phrase qui nomme l'institution qui tient le
registre. C'est exactement ce que ce site existe pour faire.

Le domaine vient de la nomenclature WALDEC, et **c'est le préfixe du code qui
fait foi, pas le rattachement déclaré** : sur ses 297 entrées, vingt se
contredisent — « cantines, restaurants d'entreprises » y est rangé sous la
représentation d'intérêts économiques, « amicale de sapeurs pompiers » sous un
parent que la table des parents ne nomme même pas. Le préfixe les range sous la
conduite d'activités économiques et sous la sécurité civile ; il tombe juste
dans les vingt cas.

La veille a gagné une nature de signal pour l'occasion. Le fichier est réécrit
au même nom à chaque millésime mensuel : un « 200 » n'y prouve rien, et c'est
exactement le ping que ce projet refuse. `fichier-date` lit la date de dernière
modification par une requête d'en-tête — on ne rapatrie pas 1,2 Go pour lire une
date — et alerte au-delà de six mois de silence.

Une visite au Mayet-de-Montagne passe de 826 à 885 Ko. Les triplets plutôt que
des objets, le mois plutôt que le jour et six domaines au lieu de tous ont ramené
le fichier du département de 77 à 54 Ko avant de l'ajouter.

### Le moteur du journal ✔

Le site répond « qui décide, combien, où ». Il ne répondait pas à « qu'est-ce
qui a changé depuis la dernière fois ? » — la question de celui qui habite là,
par opposition à celui qui découvre. Le journal est la matière de cette
réponse : **67 651 événements sur six mois**, dont trente au
Mayet-de-Montagne — cinq par mois, et presque tous intercommunaux.

**Il ne garde aucune mémoire, et c'est le choix qui structure le reste.** On
pourrait noter la date de première vue de chaque événement, pour classer un
flux par ordre de découverte plutôt que par ordre des faits : ce serait un état
à conserver entre deux ingestions, à faire grossir, et à réparer le jour où il
se désynchronise. Or **c'est le lecteur qui fait déjà ce travail** — un
agrégateur retient les identifiants d'entrée qu'il a montrés, si bien qu'un
marché notifié en juin mais publié en septembre lui apparaît comme nouveau même
daté de juin. Le journal reste donc une projection pure de la donnée du moment :
idempotente, incapable d'inventer un changement, et qui ne s'effondre pas quand
une source ne répond pas.

**Ce n'est pas non plus un diff des fichiers publiés**, et la raison est
mesurée : ce sont des vues tronquées — cinq marchés par acheteur, quatre
créations d'association par commune, deux cents dans les listes dites
complètes. Un diff signalerait comme nouveau ce qui vient d'entrer dans les cinq
premiers et manquerait ce qui en est sorti entre deux passages. Chaque
collecteur émet donc ses propres événements, puisque lui seul sait dater et
attribuer.

Fenêtre de six mois, plafond de douze par acteur **et par genre** — sans quoi
les cent marchés annuels d'une agglomération chasseraient ses délibérations. Un
événement d'acheteur est écrit une fois sous son SIREN : le marché d'une
agglomération est celui de ses cent quatre communes, et c'est au lecteur du
fichier de faire l'éventail. Les 68 495 lignes écrites pour 67 651 événements
retenus ne sont pas une erreur — un syndicat à cheval sur une frontière figure
dans les deux départements qu'il dessert.

| | Événements sur six mois |
| --- | --- |
| Associations créées | 26 003 |
| Marchés notifiés | 21 223 |
| Délibérations | 15 560 |
| Changements de maire | 5 708 |
| Subventions votées | 1 |

Dix méga-octets en tout, 1,4 Mo pour l'Ille-et-Vilaine, 398 événements pour
l'Allier. **Le poids d'une visite ne bouge pas** — 885 Ko : rien ne charge le
journal côté navigateur, il est là pour le flux et pour la page de commune, qui
se construisent au build.

`npm run verifier-journal` fixe les dix règles qui ne se voient pas : la
fenêtre, les deux plafonds, l'ordre, et le refus des dates futures — le
répertoire des associations porte onze créations datées de 2029, et une seule
occuperait la tête d'un flux pendant trois ans.

**Trois choses que le journal ne dit pas, et qui viennent des sources.** Une
seule subvention y figure : les producteurs publient tard et beaucoup ne datent
leur convention qu'à l'année, auquel cas elle n'entre pas plutôt que d'entrer au
premier janvier. Aucune catastrophe naturelle : l'arrêté le plus récent de
GASPAR date du 18 décembre 2025, l'archive du ministère a neuf mois de retard.
Et surtout, **aucun transfert de compétence** : BANATIC ne les date pas. Le jour
où une commune confie l'eau à son agglomération, rien dans la donnée ne dit
quand — c'est pourtant le changement que ce site devrait annoncer le premier, et
le repérer demandera un diff entre deux états du registre, justifié celui-là
puisqu'il n'y a aucune date à projeter.

### Une adresse recopiée la veille rendait déjà 404 ✔

Le journal a fait remonter une panne que rien ne signalait : sur six mois,
**soixante-douze délibérations dans toute la France**, pour mille trois cent
quatre-vingt-six collectivités qui publient.

La cause n'était pas le journal. Mégalis Bretagne — le plus gros agrégateur, et
le seul que la découverte par schéma ne voit pas — republie **chaque jour**,
sous un chemin qui porte l'horodatage de la publication. Les trois adresses
recopiées dans le collecteur rendaient 404 pour le millésime en cours : le site
montrait des délibérations qui s'arrêtaient au 31 décembre pendant que la source
publiait quotidiennement.

On nomme donc le jeu de données, jamais le fichier. `ressourcesDuJeu()` demande
ses ressources au moment de l'ingestion, par l'API v2 — plus légère que la v1,
et la seule des deux qui réponde depuis l'environnement de développement. Six
ressources résolues au lieu des trois figées, les millésimes 2021 à 2026 :
**586 022 délibérations au lieu de 496 110**, pour 1 400 collectivités, et
15 560 dans le journal au lieu de 72.

C'est le genre de panne pour lequel la veille existe, et qu'elle ne voyait pas :
elle surveillait le jeu de données, pas la validité des adresses que le
collecteur en avait recopiées. Ne plus rien recopier est le seul remède qui
tienne.

### Un flux par commune ✔

« Préviens-moi quand quelque chose bouge chez moi » est la seule demande
d'abonnement qui ait un sens ici. La réponse n'est pas le courriel : une
adresse est une donnée personnelle, elle veut un registre de traitement, un
double opt-in, un désabonnement, un responsable nommé — les quatre champs de
`contenu/editeur.yaml` sont encore à compléter — un expéditeur tiers, et
quelque chose qui tourne, là où le déploiement est un `lftp mirror` vers un
mutualisé. Elle renierait en une fois tout ce que les mentions légales
promettent.

Un site statique sait publier un **flux Atom**. Aucune adresse collectée, aucun
consentement à recueillir, aucun tiers, rien à faire tourner : le lecteur
s'abonne dans son agrégateur, qui va chercher le fichier comme il irait
chercher une page. **33 219 flux** — les communes où rien n'a bougé sur la
fenêtre n'en ont pas, parce qu'un flux vide ne s'abonne pas.

**Deux précautions décident si c'est déployable.** La première : `<updated>`
porte la date du fait le plus récent, jamais celle de la génération. Sinon les
trente-trois mille fichiers changeraient à chaque ingestion et l'envoi par FTP
repasserait de quelques minutes à plus d'une demi-heure — `mirror` ne transfère
que ce qui a changé, encore faut-il que l'inchangé reste identique à l'octet
près. La seconde : l'`id` d'une entrée est stable, et c'est lui qui dit à un
agrégateur ce qu'il a déjà montré. C'est ce qui permet au journal de n'avoir
aucune mémoire à tenir, et à un marché notifié en juin mais publié en septembre
d'apparaître comme nouveau tout en se rangeant à sa date.

**Le format a été resserré deux fois, sur mesure et non sur impression.**
Vingt entrées par flux et un lien répété dans chacune donnaient 287 Mo ;
quinze entrées et pas de lien quand l'entrée n'en a pas de propre — RFC 4287
l'autorise dès lors qu'elle porte un `content`, et le lien de tête y conduit
déjà — ramènent à 161 Mo. Puis le premier build complet a donné **1,1 Go et
76 552 fichiers**, pour un déploiement FTPS qui mettait déjà une demi-heure à
43 000. Deux causes :

- `/commune/03165/flux.xml` créait **33 219 dossiers**, soit 133 Mo de blocs et
  autant de commandes `MKD` en FTP, pour un chemin à peine plus joli.
  `/commune/03165-flux.xml` en crée zéro — `dist/` compte sept répertoires en
  tout — et le site nomme déjà ses plans de site ainsi ;
- la section de la page de commune pesait **4,4 Ko sur 16,1**, multipliés par
  34 875. C'est le raisonnement que cette page s'applique déjà à elle-même
  lorsqu'elle écarte les marchés et les courbes. Six lignes au lieu de douze :
  2,2 Ko, et la suite est dans le flux vers lequel la section conduit.

| | Avant | Après |
| --- | --- | --- |
| Poids de `dist/` | ~684 Mo | 889 Mo |
| Fichiers | ~43 300 | 76 552 |
| Répertoires | 7 | 7 |
| Durée du build | ~2 min 30 | 2 min 47 |

Les flux pèsent 161 Mo pour 33 219 fichiers, les sections de page 44 Mo. Un
envoi complet passe d'une demi-heure à environ une heure ; les suivants restent
de quelques minutes, puisqu'un flux dont la commune n'a rien vu bouger reste
identique à l'octet près.

La page de commune gagne la même liste, « ce qui a bougé récemment », et
déclare le flux dans son en-tête pour qu'un navigateur le trouve seul. Le
`.htaccess` sert ces fichiers en `application/atom+xml` plutôt qu'en XML
quelconque, sans toucher aux plans de site.

Au Mayet-de-Montagne, le flux ouvre sur l'aménagement de la place de la Mairie,
les compteurs d'eau télérelevés du SMEA et le gardiennage des bâtiments de
Vichy Communauté. Presque tout y est intercommunal — et c'est précisément ce
que personne ne regarde.

### Ce que pèse une commune dans son intercommunalité ✔ *(et un total refusé)*

Les sièges étaient déjà collectés et déjà affichés dans la carte&nbsp;; la page
de commune, elle, n'en disait rien. Elle le dit maintenant&nbsp;: quinze sièges
au conseil municipal du Mayet-de-Montagne, un au conseil de CA Vichy
Communauté.

**Le « sur combien » a été calculé, vérifié, et jeté.** Sommer les sièges de
toutes les communes membres donnait 53 pour Vichy Communauté&nbsp;; l'agglo en
publie **77**. La vérification a montré pourquoi&nbsp;: **vingt-quatre de ses
trente-neuf communes n'ont aucun siège dans le fichier des résultats**, et
toutes font moins de mille habitants. Sous ce seuil, les conseillers
communautaires ne sont pas élus au scrutin fléché — ce sont les conseillers
municipaux pris dans l'ordre du tableau, le maire puis les adjoints
(**article L273-11 du code électoral**). Le total était donc structurellement
sous-estimé, d'un montant qui varie d'une intercommunalité à l'autre. C'est
exactement l'agrégat que `CLAUDE.md` interdit de publier.

Le trou est devenu l'information. Là où le fichier ne porte pas de siège, la
commune ne se tait plus&nbsp;: elle explique qu'elle est représentée sans
élire ses représentants, et par qui. C'est plus utile qu'un nombre — et c'est
le sujet du site.

Le vrai total viendra du référentiel officiel, « Nombre de sièges à pourvoir
aux conseils municipaux et conseils communautaires », qui couvre toutes les
communes quel que soit leur mode de désignation. Son adresse est résolue, mais
le fichier n'a pas répondu depuis cet environnement au moment de l'écrire.

### « En fonction depuis » était faux ✔

Le site écrivait «&nbsp;Jean-Pierre RAYMOND, en fonction depuis mars 2026&nbsp;».
La formule se lit comme une ancienneté&nbsp;; elle n'en est pas une.

La vérification tient en une ligne&nbsp;: **les 34 743 maires nommés portent une
date de 2026, sans une exception**. Le répertoire national des élus remet le
compteur à chaque scrutin — la date qu'il publie est celle du mandat en cours,
et un maire reconduit depuis vingt ans y figure à la date des dernières
municipales. Le site écrit donc «&nbsp;**mandat en cours depuis** mars
2026&nbsp;», sur la page comme dans la carte, et la méthode explique pourquoi.

Le journal portait la même erreur, en pire&nbsp;: 5 708 événements intitulés
«&nbsp;Changement de maire&nbsp;» dont beaucoup sont des reconductions. Le
genre devient «&nbsp;**Élection du maire**&nbsp;», qui est vrai dans les deux
cas — le conseil élit son maire à sa première séance, reconduction comprise —
et le détail «&nbsp;prise de fonction&nbsp;» devient «&nbsp;début du
mandat&nbsp;». L'identité des entrées de flux ne change pas&nbsp;: elle repose
sur le rang du genre, pas sur son libellé.

### Le dénominateur a enfin une histoire ✔

Le site affichait «&nbsp;1 383 habitants&nbsp;» sans dire que la commune en
comptait **2 320 en 1931**. Or **tous ses autres chiffres sont par habitant** —
les comptes, les dotations, les créations d'associations, les droits de
mutation. Sans cette série, une dotation qui baisse se lit comme une décision
de l'État alors qu'elle suit souvent une population qui s'en va.

La source est le recensement lui-même&nbsp;: l'INSEE publie en un fichier de
sept méga-octets les populations communales **de 1876 à 2023**, ramenées à la
géographie en vigueur — ce qui règle d'avance le problème des fusions, puisque
c'est l'INSEE qui recompose les séries des communes nouvelles. **34 857 des
34 875 communes** du site y figurent.

Deux précisions que le bloc porte lui-même. **Trois définitions se succèdent
dans la même ligne**&nbsp;: population totale jusqu'en 1954, sans doubles
comptes jusqu'en 1999, municipale depuis. L'INSEE les publie comme une seule
série et c'est ainsi qu'on la rend, mais comparer les deux extrémités reste une
lecture de tendance, pas une soustraction exacte. Et le maximum est cherché sur
les **trente-sept** recensements du fichier, alors que la courbe n'en montre que
quatorze&nbsp;: le sommet du Mayet-de-Montagne est en 1931, une année que
l'échantillon ne porte pas.

La courbe a demandé une correction au tracé&nbsp;: **l'abscisse suit désormais
l'année et non le rang**. Sans cela, 1876→1901 aurait occupé la même largeur
que 2020→2023, écrasant un siècle pour étirer trois ans. Pour les séries
annuelles — les comptes, les droits de mutation — les deux coïncident et rien
ne change.

### De quoi un conseil est fait — sans nommer personne ✔

La question posée était bonne&nbsp;: la composition sociale d'une assemblée est
une information politique de premier ordre. La réponse ne demandait aucun nom.

Le répertoire national des élus publie **511 225 conseillers municipaux** avec
leur nom, leur date de naissance et leur profession. **Rien de tout cela
n'entre ici**&nbsp;: republier un annuaire indexable de cette taille n'est pas
le projet, et les mentions légales promettent le contraire. Ce qui entre est ce
qu'aucune liste de noms ne dirait — un effectif, une part de femmes, un âge
médian, huit compteurs&nbsp;:

> **Le Mayet-de-Montagne** — 15 élus, 47 % de femmes, âge médian 57 ans&nbsp;:
> 5 professions intermédiaires, 4 retraités, 2 artisans, 2 cadres, 1 employé,
> 1 ouvrier.
>
> **Vichy** — 35 élus, 49 % de femmes, âge médian 51 ans&nbsp;: **17 cadres**,
> 7 artisans, 7 retraités, 2 employés — **aucun ouvrier, aucun agriculteur**.

L'âge est donné avec son étendue, et non par la seule médiane&nbsp;: un conseil
de 57 ans de médiane dont le plus jeune a 28 ans et le plus âgé 73 ne ressemble
pas à celui où personne n'a moins de cinquante ans. La médiane le cachait.

Les huit groupes sont ceux de la **PCS 2003** de l'INSEE, pris au premier
chiffre du code comme les familles d'actes le sont au leur. Les quarante-deux
catégories du répertoire correspondent exactement aux quarante-deux de la
nomenclature, ce qui confirme le rattachement.

**Le répertoire décrit le conseil tel qu'il est, pas tel qu'il a été élu**, et
c'est une information en soi. Comparé au nombre de sièges à pourvoir du
scrutin&nbsp;: **32 767 conseils coïncident, 2 016 diffèrent**, et l'écart est
presque toujours négatif — un siège vacant qu'une démission ou un décès a
laissé. La page affiche donc l'effectif réel et nomme les sièges vacants.

Gain de côté&nbsp;: le répertoire porte les conseillers communautaires de
**toutes** les communes, y compris celles de moins de mille habitants dont le
fichier des résultats ne portait aucun siège. Espinasse-Vozelle affiche
désormais son représentant **et** l'explication de pourquoi il n'est pas élu.

**Ce qu'on refuse encore&nbsp;: le nombre total de sièges d'une
intercommunalité.** Compter les lignes du répertoire donne 81 pour CA Vichy
Communauté, qui en publie 77, et ne rattache ses élus qu'à 38 de ses 39
communes. Le nombre de représentants d'une commune, lui, est une donnée de
ligne et non un agrégat&nbsp;: il est repris tel quel.

Un défaut de lecture corrigé au passage. Le lecteur de CSV en flux décidait de
l'encodage en décodant le premier bloc amputé de quatre octets, pour éviter une
coupure au milieu d'un caractère — ce qui en recrée une ailleurs. Les
soixante-cinq méga-octets du répertoire, pourtant en UTF-8, repartaient donc en
Windows-1252 et toutes les colonnes accentuées devenaient introuvables. Le mode
«&nbsp;stream&nbsp;» d'un décodeur strict tolère une séquence incomplète en fin
de morceau&nbsp;: c'est exactement ce qu'il fallait.

### Qui écrit la règle de ce qui peut se construire ✔

Le site décrivait le permis de construire comme un acte du maire. C'est exact
de la signature, et faux de la règle appliquée&nbsp;: sur les **34 931 communes**
que l'enquête recense, **8 578 n'ont aucun document d'urbanisme local** (25 %)
et **10 141 relèvent d'une règle intercommunale** (29 %). Trois situations qui
n'ont rien de comparable pour un habitant, et qu'on découvrait jusqu'ici en
déposant un dossier.

> **Le Mayet-de-Montagne** — plan local d'urbanisme intercommunal sectoriel,
> approuvé le 31 mars 2022, porté par CA Vichy Communauté&nbsp;: ses règles sont
> votées par le conseil communautaire, où la commune a un siège.
>
> **Vichy** — plan local d'urbanisme communal de 2017, mais **la compétence est
> passée à l'agglomération**&nbsp;: c'est elle qui en votera la révision. Le
> fichier distingue les deux cas, le site aussi.
>
> **Agonges, Ainay-le-Château, et 8 576 autres** — aucun document&nbsp;: on ne
> construit en principe que dans les parties déjà urbanisées (art. L111-3 du code de
> l'urbanisme) et le préfet donne sur chaque permis un **avis conforme**, qu'un
> refus de sa part rend contraignant (art. L422-5). Les deux articles ont été
> vérifiés par recherche, Légifrance refusant les requêtes de cet environnement.

Quand une procédure est en cours, la page le dit et dit sa date de
prescription&nbsp;: c'est le seul moment où l'avis d'un habitant a encore prise
sur le texte, avant que l'enquête publique la clôture.

**Le Géoportail de l'urbanisme ne pouvait pas servir**&nbsp;: son interface
répond commune par commune, et trente-cinq mille appels ne sont pas une
ingestion. L'enquête **SuDocUH**, que la direction de l'habitat mène chaque
année auprès des directions départementales des territoires, publie le même
état des lieux en un seul classeur. Elle est annuelle et paraît avec quelques
mois de retard&nbsp;: la page ne prétend donc pas être à jour, elle dit jusqu'où
la donnée va — les approbations connues jusqu'au 10 janvier 2025, date lue dans
le fichier et non supposée.

Le jeu est désigné par son identifiant et la ressource par son intitulé, jamais
par son adresse&nbsp;: le classeur est redéposé sous une URL neuve à chaque
millésime. C'est la leçon de Mégalis, apprise une fois.

### Ce qui s'y construit, une fois la règle écrite ✔

L'autre moitié de l'urbanisme. Deux communes sous le même plan intercommunal ne
vivent pas la même chose selon que rien n'en sort ou que trente logements y sont
autorisés chaque année, et aucun document réglementaire ne le dit.

**Sitadel** publie, commune par commune et mois par mois depuis 2013, les
logements autorisés et commencés. Sur les dix dernières années pleines,
2016-2025&nbsp;: **4 311 126 logements autorisés** dans 33 694 communes, soit
431 000 par an — l'ordre de grandeur que le service statistique publie par
ailleurs, ce qui vaut vérification de la lecture.

> **Le Mayet-de-Montagne** — 29 logements autorisés en dix ans, 21,0 pour mille
> habitants contre 32,1 à la médiane des communes&nbsp;; 21 commencés (72 %),
> 25 maisons individuelles (86 %).
>
> **Vichy** — 1 539 autorisés, 61,3 pour mille&nbsp;; 769 commencés (50 %), et
> **86 maisons seulement** (6 %) — une ville qui construit en collectif.

**Trois précautions, reprises sur la page.** Un logement n'est pas un
permis&nbsp;: un permis d'immeuble en porte vingt, et c'est bien des logements
qu'on compte. La série est en *date de prise en compte*, le mois où
l'autorisation entre dans le système et non celui où le maire l'a signée. Et
autoriser n'est pas construire&nbsp;: les deux colonnes sont montrées à part,
parce que leur écart est l'information.

La fenêtre s'arrête à la dernière année **pleine**. Le fichier va jusqu'à
juillet 2026&nbsp;; afficher 2026 à côté de dix années entières se lirait comme
un effondrement de la construction, et ce serait faux.

### Ce qui est prélevé ici, et par qui ✔

Le site savait dire combien une commune dépense par habitant. Il ne savait pas
dire ce que son propriétaire paie, ni surtout **à qui**. Or la ligne « taxe
foncière » d'un avis d'imposition n'est pas un taux&nbsp;: c'est une somme de
taux votés par des assemblées différentes, et les séparer est exactement ce que
ce site existe pour faire.

> **Le Mayet-de-Montagne**, 39,24 % au total&nbsp;: 38,17 % pour la commune,
> 0,41 % pour l'intercommunalité, 0,21 % de taxes spéciales d'équipement,
> 0,45 % pour la gestion des milieux aquatiques. Médiane des communes&nbsp;:
> 40,34 %.
>
> **Vichy**, 48,88 %, avec une ligne de plus — 0,26 % pour des syndicats.

S'y ajoutent, sur la même base, les **ordures ménagères**&nbsp;: 14,76 % au
Mayet, perçus par l'intercommunalité. Le fichier dit *qui* perçoit, et la
réponse surprend — sur 34 873 communes, l'intercommunalité dans 24 199 cas, un
syndicat dans 203, et **la commune elle-même dans deux**. Les 10 468 restantes
n'ont pas de TEOM du tout&nbsp;: elles financent le service par une redevance
ou sur le budget général.

Puis la **taxe d'habitation des résidences secondaires** — celle sur la
résidence principale n'existe plus depuis 2023 — et la **cotisation foncière
des entreprises**, que sous fiscalité professionnelle unique la commune ne vote
plus et ne perçoit plus.

**La vérification.** Le total est la somme exhaustive des taux que la trace du
fichier déclare applicables au foncier bâti — commune, intercommunalité,
syndicats, TSE, TASA, GEMAPI. Testé sur Rennes&nbsp;: 45,66 % commune + 1,73 %
métropole + annexes = **47,703 %**, quand la valeur publiée ailleurs est
47,70 %. Testé sur Paris&nbsp;: 20,50 % pour la part communale, le chiffre que
la Ville affiche elle-même. Sans ces deux recoupements le total n'aurait pas
été publié.

**Un piège écarté.** Le taux communal a absorbé en 2021 l'ancienne part
départementale (article 16 de la loi de finances pour 2020)&nbsp;: le comparer à
celui de 2020 n'a aucun sens, et la page le dit plutôt que de laisser conclure
à un doublement. Le fichier compte sept cents colonnes aux noms opaques
(`E12`, `H52gGEMAPI`, `F71`)&nbsp;; aucune n'a été devinée — la trace publiée
avec le fichier les documente une à une, et c'est elle qui a servi.

### Ce qu'on trouve sur place, et ce pour quoi il faut partir ✔

Le site nommait les services publics d'une commune — ses écoles, ses
établissements de santé, ses guichets. Il ne disait rien de la boulangerie, de
l'épicerie, du médecin&nbsp;: ce n'est pas du service public, et c'est la
première chose qu'un habitant regarde.

La base permanente des équipements de l'INSEE recense 235 types d'équipements
ouverts au public, marchands compris. Surtout, elle les range en **gammes** —
proximité, intermédiaire, supérieure — et c'est ce classement-là que le site
reprend plutôt que d'inventer sa liste de « ce qui compte »&nbsp;: la gamme de
proximité est un objet statistique publié et daté, pas une opinion.

> **Le Mayet-de-Montagne** — 24 des 26 équipements de proximité, quand la
> médiane des communes est de 9&nbsp;: 9 infirmiers, 7 médecins généralistes,
> 5 boulangeries, 2 pharmacies, un bureau de poste, une bibliothèque, un
> collège. Manquent une agence immobilière et un boulodrome.
>
> **Agonges**, 250 habitants — 7 sur 26. Ni boulangerie, ni épicerie, ni
> médecin, ni école.

**Le piège qu'il a fallu écarter.** Compter par *type* faisait mentir la page&nbsp;:
Le Mayet a une école primaire, et « école maternelle » comme « école
élémentaire » apparaissaient alors comme absentes — deux écoles manquantes là
où il n'en manque aucune. L'INSEE publie précisément, pour cela, une colonne de
**regroupements**&nbsp;: les trois écoles n'en font qu'un, comme le bureau de
poste, le relais poste et l'agence postale. La présence et l'absence se
comptent donc par regroupement, et les 85 types suivis n'en forment que 74 —
26 de proximité, non 33.

C'est la seule liste du site qui affiche explicitement **ce qui manque**. Une
liste de ce qui existe ne dit pas pour quoi il faut prendre la voiture.

### Les fiches « à confirmer » : la relecture est finie ✔

Deux cent quatre attributions portaient `confiance: a_confirmer` — une
affirmation écrite mais jamais contrôlée contre sa source. C'était un nombre
dans cette feuille de route, et rien ne disait *lesquelles*.

**Les 37 acteurs sont faits.** Sept étaient faux ou imprécis, et c'est le
rendement de l'exercice&nbsp;:

| Fiche | Ce qui était écrit | Ce que dit le texte |
|---|---|---|
| Syndicat de SCoT | les PLU doivent s'y **conformer** | ils doivent être **compatibles** (L131-4) — un PLU peut s'en écarter sans en remettre en cause les orientations |
| DREAL | « c'est elle qui **autorise** » les installations classées | elle **instruit** et **inspecte** ; le préfet signe |
| SDIS | « dirigé opérationnellement par le **préfet** » | sous l'autorité du **maire ou** du préfet, selon le pouvoir de police (L1424-3) |
| DDT | instruit pour les communes **sans document d'urbanisme** | le critère est la **population**, dix mille habitants (L422-8) |
| Conseil d'école | « il est **consulté** » | il **vote** le règlement intérieur (D411-2) |
| Géomètre-expert | « le bornage **fait foi** » | c'est le **procès-verbal signé** par les voisins qui engage |
| Bailleur social | « sur des terrains largement publics » | non vérifié — remplacé par la liste des aides, elle documentée |

Trois précisions utiles au passage. Le **CCAS** est une personne morale
distincte de la commune et n'est obligatoire qu'au-dessus de 1 500 habitants —
Le Mayet-de-Montagne, 1 383, est en dessous. Le **versement mobilité** est dû à
partir de onze salariés, et seulement là où l'autorité organisatrice l'a
institué. Le **commissaire enquêteur** est désigné par le tribunal
administratif, non par le porteur du projet, et son rapport est public de droit.

Chaque fiche confirmée a gagné l'article qui la fonde&nbsp;: trente-deux pages
de référence sont entrées au contenu à cette occasion. Et la validation a fait
son travail pendant l'exercice — deux sigles employés sans entrée au glossaire,
refusés à la publication.

**`npm run relire`** transforme le reste en file de travail&nbsp;: pour chaque
fiche, l'affirmation exacte et les pages qui devraient la fonder. Toutes ne
finiront pas en `etabli` — un délai observé ou une pratique locale doit garder
sa réserve, et le site l'affiche plutôt que de la taire.

**La suite, sur les compétences, a appris quelque chose sur la méthode.** Trois
des erreurs corrigées sur les acteurs s'y répétaient mot pour mot — le service
d'incendie « sous l'autorité opérationnelle du préfet », les PLU qui doivent
« se conformer » au SCoT, l'instruction gratuite réservée aux « communes sans
document d'urbanisme ». Une formulation fausse recopiée d'une famille à l'autre
ne se voit pas en relisant une fiche&nbsp;: elle se voit en relisant la même
affirmation deux fois.

Et une **quatrième variante** de la même famille d'erreur est apparue&nbsp;: le
schéma régional « s'impose aux documents d'urbanisme locaux ». Il ne s'impose
pas. Ses **objectifs** sont pris en compte, ses **règles générales** respectées
en compatibilité (art. L4251-3), et il n'atteint le plan communal qu'à travers
le SCoT. Trois rapports juridiques différents dans une phrase de onze mots, et
c'est exactement la chaîne que ce site existe pour montrer.

Deux précisions valent d'être retenues. L'**intérêt communautaire** doit être
défini dans les deux ans suivant le transfert&nbsp;: à défaut, le groupement
exerce la compétence **en entier**. Le silence ne laisse donc rien à la commune,
il lui enlève tout. Et la **carte scolaire** relève du directeur académique
seul, la commune propriétaire de l'école n'étant qu'informée — ce que le
ministère écrit lui-même.

Deux leviers sont entrés au passage, tirés de la relecture des acteurs&nbsp;: le
**rapport annuel du délégataire**, dont l'assemblée « prend acte » sans
l'approuver et que la CADA tient pour communicable après occultation du secret
des affaires, et le **compte rendu annuel de la concession d'électricité**,
remis à l'autorité concédante — qui n'est pas la mairie là où la compétence a
été transférée, ce qui est précisément le piège.

**Les 41 compétences sont faites**, et la relecture y a trouvé autre chose
qu'une erreur&nbsp;: un **nœud en trop**. « Transports régionaux » disait
exactement ce que « Trains et cars régionaux » et « Transport scolaire » disent
déjà, en moins précis, et rien ne le référençait — ni processus, ni partage, ni
code BANATIC. Une région l'aurait affiché deux fois. Il est retiré.

Cinq précisions décident d'un droit, d'un refus, ou de l'adresse où écrire&nbsp;:

- l'**allocation personnalisée d'autonomie** s'arrête aux quatre premiers degrés
  de perte d'autonomie sur six&nbsp;; les deux derniers n'y ouvrent pas droit ;
- l'**intérêt communautaire** non défini dans les deux ans fait passer la
  compétence **entière** au groupement&nbsp;;
- le **plan de prévention des risques** approuvé vaut servitude d'utilité
  publique et s'impose directement aux permis, sans que le maire ait à le
  reprendre dans son arrêté&nbsp;;
- une **autorisation d'activité de soins** est signée par le directeur général
  de l'agence régionale de santé — une fermeture de maternité ne se plaide ni en
  mairie ni au département&nbsp;;
- la **clé de répartition d'une dotation** ne « se décide » pas dans les
  ministères&nbsp;: la loi la fixe, l'administration la calcule. On conteste un
  calcul devant le juge, pas un choix.

Deux fiches gagnent le **nom de l'autorité** plutôt que celui de
l'institution — le directeur académique pour la carte scolaire, le directeur
général de l'agence pour les soins. C'est à quelqu'un qu'on écrit, pas à un
sigle.

**Les 15 flux ensuite**, et la même mécanique&nbsp;: deux des erreurs déjà
corrigées y revenaient une **cinquième** fois — les pompiers « que le préfet
dirige en opération », le schéma « auquel leurs PLU devront se conformer ». Une
phrase fausse se recopie cinq fois avant qu'on la relise une.

Ce que la vérification a ajouté&nbsp;:

- la **taxe d'aménagement** a **trois** parts, pas deux&nbsp;: la fiche oubliait
  la part régionale d'Île-de-France ;
- le **versement mobilité** pèse environ **la moitié** des recettes des
  autorités organisatrices (Cerema), là où la fiche disait « souvent plus que la
  recette des billets » ;
- la **TEOM** partage la base de la taxe foncière, et son produit **ne doit pas
  être disproportionné** au coût du service — la délibération qui s'en écarte
  est illégale, et depuis la loi de finances pour 2019 le dégrèvement n'est plus
  supporté par l'État mais par la collectivité. Le levier qui en découle est
  écrit&nbsp;;
- la **redevance de concession** a deux parts nommées par le contrat&nbsp;: l'une
  finance le contrôle que l'autorité exerce sur le concessionnaire, l'autre les
  travaux qu'elle conduit elle-même.

Et une abstention&nbsp;: la part du billet dans le coût d'un réseau de transport
reste écrite « minoritaire », sans chiffre. Les taux publiés varient trop d'une
agglomération à l'autre et selon le périmètre retenu — charges d'exploitation ou
coût complet — pour qu'un nombre unique soit honnête.

**Les processus ont d'abord imposé une règle.** Les onze portaient leur niveau
de confiance indépendamment de leurs étapes&nbsp;: un processus pouvait se
déclarer établi pendant que cinq de ses six étapes restaient à vérifier. Or
c'est l'étape qui porte le délai, et le délai est ce qu'un lecteur vient
chercher. `npm run valider` refuse désormais un processus établi dont un
élément reste à confirmer, et `npm run relire` affiche ce qui bloque chacun.
La réciproque n'est pas imposée&nbsp;: un processus dont toutes les étapes sont
vérifiées peut rester `a_confirmer` si son ordonnancement ne l'est pas.

**Deux processus entiers sont relus.** « Demander un document administratif »
d'abord&nbsp;: les quatre délais tiennent, dits par la CADA elle-même — un mois
de silence vaut refus, deux mois pour la saisir, un mois pour son avis, et sa
saisine conditionne le recours au juge. Une précision manquait, ajoutée&nbsp;:
après l'avis, le silence de l'administration pendant deux mois vaut nouveau
refus, et c'est lui qu'on attaque.

« S'inscrire sur les listes électorales » ensuite, où une **erreur** attendait.
La fiche disait que « tout électeur de la commune peut être désigné assesseur ».
C'est l'inverse du mécanisme&nbsp;: ce sont les **candidats** qui désignent,
parmi les électeurs du **département**&nbsp;; la commune ne prend les siens qu'à
défaut. La formulation décourageait exactement les gens qu'elle aurait dû
appeler — un habitant du village voisin peut tenir un bureau de vote.

Trois délais y ont été chiffrés, là où la fiche renvoyait au vague&nbsp;: cinq
jours pour la décision du maire, **cinq jours** pour la contester devant la
commission — « les délais indiqués sur la décision », disait-elle —, et le
**troisième jour précédant le scrutin à dix-huit heures** pour se faire
désigner assesseur. Et une surprise confirmée&nbsp;: passé dix jours, la liste
d'émargement devient une archive fermée **cinquante ans**, parce qu'elle révèle
qui est allé voter.

**Le permis de construire**, troisième processus relu, a rendu deux
corrections qui vont toutes deux dans le sens du citoyen.

La première était une contradiction interne&nbsp;: une demande de pièces
manquantes « suspend l'instruction **et** fait repartir le compte à rebours ».
Ni l'un ni l'autre. Le dossier est **réputé complet** si la mairie n'a pas
notifié la liste dans le mois du dépôt, et une demande faite après ce mois **ne
décale plus rien** — l'administration ne peut pas repousser sa propre échéance
en réclamant tard.

La seconde tient à un détail du panneau. Un recours doit être notifié au
bénéficiaire du permis dans les quinze jours, sous peine d'irrecevabilité —
c'est ce que la fiche disait. Ce qu'elle ne disait pas&nbsp;: **si le panneau ne
mentionne pas cette obligation, l'irrecevabilité n'est pas opposable**. Le
voisin qui photographie le panneau le fait donc pour deux raisons, et la
seconde peut sauver son recours.

**L'enquête publique** a obligé à toucher au modèle. Sa durée ne peut pas être
inférieure à trente jours quand le projet est soumis à évaluation
environnementale — et la fiche l'annonçait comme un délai « indicatif ». Un
plancher n'est pas un plafond&nbsp;: le lecteur en déduisait qu'il pouvait être
raccourci, quand c'est le contraire. Le schéma a donc gagné une quatrième
nature de délai, `minimum_legal`, qui s'affiche « délai minimum prévu par les
textes — il ne peut pas être plus court ». L'avis de publicité, lui aussi un
plancher de quinze jours, en relève également.

Deux autres corrections sur ce seul processus&nbsp;:

- le résumé promettait « **le seul** moment où la loi organise votre prise de
  parole ». C'est faux — la concertation préalable et la participation par voie
  électronique en sont d'autres. L'enquête reste le plus **formel**&nbsp;;
- « passer outre un avis défavorable fragilise la décision devant le juge »
  sous-estimait beaucoup&nbsp;: après des conclusions défavorables, le juge des
  référés **suspend** dès qu'un moyen fait naître un doute sérieux, **sans**
  condition d'urgence à démontrer. Et une collectivité qui veut passer outre sur
  son propre projet doit le réitérer par délibération motivée.

**Les sept processus restants ont suivi.** Ce qu'ils ont rendu, dans l'ordre
où il faut le savoir&nbsp;:

- **Contester une délibération** décrivait l'**ancien régime**. L'ordonnance du
  7 octobre 2021, en vigueur depuis le 1er juillet 2022, a supprimé l'affichage
  du compte rendu sous huit jours au profit de la publication du procès-verbal,
  électronique là où la commune a un site. Le piège qui en découle est ajouté,
  et c'est le plus coûteux&nbsp;: le procès-verbal n'est publié qu'une fois
  **approuvé**, à la séance suivante, quand le délai de recours contre la
  délibération court déjà depuis sa propre publication. Le document qui donne
  les motifs arrive après la fenêtre pour s'en servir.
- **Inscrire un enfant à l'école** nommait le mauvais accord. Ce n'est pas
  celui de la commune d'accueil qui commande, c'est celui du maire de la commune
  de **résidence**, parce qu'il commande sa participation aux frais — et c'est
  sur ce coût qu'un refus se fonde presque toujours. L'article L212-8 prévoit
  **trois cas** où la participation est due sans cet accord&nbsp;: fratrie déjà
  scolarisée, obligations professionnelles des parents sans garde sur place,
  raisons médicales. Ce ne sont pas des arguments pour convaincre, ce sont les
  cas où l'argument du coût tombe.
- **Le RSA**&nbsp;: contester un indu a un **effet suspensif**, la récupération
  s'arrête pendant l'examen du recours. Beaucoup subissent les retenues en
  croyant devoir payer d'abord. Et la suspension de l'allocation est
  **réversible**&nbsp;: reprendre ses engagements la fait lever, avec
  régularisation des sommes retenues — ce qu'une notification de suspension ne
  dit pas.
- **Le budget communal** a gagné trois chiffres et deux conséquences. Le débat
  d'orientation budgétaire est une **formalité substantielle**&nbsp;: un budget
  adopté sans lui est illégal, c'est un moyen de recours. Et dès la saisine de
  la chambre régionale des comptes, le conseil **ne peut plus délibérer** sur
  son budget&nbsp;; c'est le préfet qui l'arrête. La commune perd la main, ce
  que « le préfet saisit la chambre » ne laissait pas voir.
- **Demander un logement social**&nbsp;: le contingent de l'État représente
  **30 %** du parc de chaque organisme. Relancer le bailleur pour un logement
  réservé ne sert à rien, et la fiche ne chiffrait pas la part. Le droit au
  logement opposable, lui, a des dents&nbsp;: faute de proposition, le tribunal
  administratif peut condamner l'État à une **astreinte**.
- **Contester une facture d'eau** est la **première fiche juste de bout en
  bout** — sept étapes, six leviers, rien à corriger. Les onze précédentes
  portaient toutes au moins une inexactitude.
- **S'informer sur les risques**, enfin, a rendu une correction et une
  abstention. Les dispositions d'un plan de prévention rendues opposables par
  anticipation **tombent si le plan n'est pas approuvé dans les trois ans** —
  une contrainte anticipée n'est pas définitive. Et l'affirmation qu'elles
  n'ouvrent « aucun droit à indemnisation » a été **retirée**&nbsp;: le principe
  existe, mais il n'a pas été vérifié ici, et la fiche n'en a pas besoin.

**Reste zéro fiche.** Deux cent quatre attributions écrites sans contrôle,
deux cent quatre relues contre leur source. Ce que l'exercice a appris tient en
une phrase&nbsp;: *une formulation fausse se recopie avant qu'on la relise.* Le
service d'incendie « sous l'autorité opérationnelle du préfet » et les PLU qui
doivent « se conformer » au SCoT sont apparus **cinq fois** chacun, dans trois
familles de nœuds différentes. Aucune relecture fiche par fiche ne les aurait
vus&nbsp;; c'est la deuxième occurrence de la même phrase qui les a trahis.

**Un levier repéré pendant la relecture a été écrit ensuite**, sur « contester
une délibération »&nbsp;: la **réclamation fiscale**. Une délibération qui fixe
un taux d'imposition se conteste deux fois — par le recours pour excès de
pouvoir, deux mois, et par la réclamation contre son propre avis d'imposition,
recevable **jusqu'au 31 décembre de l'année suivant la mise en recouvrement du
rôle**. La seconde voie est bien plus longue, et c'est la seule qui rende de
l'argent. Le piège est net&nbsp;: l'annulation obtenue par un autre contribuable
**ne rouvre pas votre délai**, parce que le juge qui censure la délibération ne
crée pas un « événement » au sens fiscal — le Bulletin officiel des finances
publiques l'écrit en toutes lettres. Qui n'a pas réclamé pour son propre compte
ne rattrape rien.

**Et un dernier défaut de la même famille a été transformé en règle.** Quatre
pages de référence annonçaient un article dans leur titre — « art. R600-1 et
R600-2 », « art. L424-2 », « art. A424-15 et s. », « art. 9 » — en renvoyant à
la racine du code ou du décret. Le lecteur qui suivait le lien pour vérifier
tombait sur un sommaire, ce qui vide de son sens la règle « on cite l'article
qui fonde l'affirmation ». `npm run valider` refuse désormais un renvoi à
Légifrance qui nomme un article sans le pointer. La règle a trouvé la quatrième
occurrence toute seule, à la minute où elle est entrée.

Au passage, les deux articles du contentieux de l'urbanisme ont été
**séparés**, parce qu'ils ne disent pas la même chose&nbsp;: R*600-1 impose la
notification du recours sous quinze jours à peine d'irrecevabilité, R*600-2 fait
courir le délai des tiers du premier jour d'une période continue de deux mois
d'affichage. Chaque affirmation cite maintenant celui des deux qui la fonde.

Ce qui reste vrai après coup&nbsp;: `npm run relire` ne repartira pas de zéro.
Chaque fiche porte un `perime_apres_mois`, et la file se remplira d'elle-même
au fil des péremptions. C'est le but — une relecture qui revient, pas une
campagne qu'on termine.

### Le douzième processus : faire évoluer le PLU ✔

Le plan local d'urbanisme était le seul document du site que rien ne reliait.
Un document ne s'attache au graphe que par le processus qui le produit, et
celui-là n'existait pas&nbsp;: le site montrait le permis qui applique la règle,
jamais l'écriture de la règle.

Il a fallu commencer par vérifier le droit en vigueur, et bien en prendre&nbsp;:
la **loi du 26 novembre 2025** a supprimé la révision allégée et la modification
simplifiée, ses dispositions de planification s'appliquent depuis le
**26 mai 2026**, et **pas** aux procédures engagées avant cette date. Une fiche
écrite de mémoire aurait décrit quatre procédures là où il en reste deux — la
même erreur que « contester une délibération » portait sur l'ordonnance de 2021.

Ce que la fiche apporte, et qu'aucune page officielle ne met côte à côte&nbsp;:

- **le choix de la procédure n'appartient pas à la collectivité.** Changer les
  orientations du projet d'aménagement et de développement durables impose la
  révision&nbsp;; tout le reste relève de la modification. C'est l'objet visé qui
  décide de la lourdeur — et donc de la longueur de la fenêtre offerte au
  public&nbsp;: des années pour l'une, **un mois** pour l'autre ;
- **la délibération de prescription est le document à lire en premier.** Elle
  fixe les objectifs de la révision *et* les modalités de la concertation, qui
  n'ont aucune forme imposée par la loi. Un objectif qui n'y figure pas ne sera
  pas traité&nbsp;; une observation déposée ailleurs que là où elle l'indique peut
  n'être jamais enregistrée ;
- **sous plan intercommunal, le conseil municipal a une prise chiffrée.** Son
  avis défavorable sur les orientations d'aménagement et de programmation ou sur
  les règles qui concernent directement la commune oblige le conseil
  communautaire à délibérer de nouveau, et à réunir **les deux tiers** des voix
  pour passer outre. C'est le seul endroit du droit de l'urbanisme où une
  commune pèse contre son groupement, et un habitant qui n'a pas de prise sur le
  conseil communautaire en a une sur le sien ;
- **le silence des personnes publiques associées ne bloque rien**&nbsp;: trois
  mois, puis avis réputé favorable ;
- et le piège qui ferme tout&nbsp;: passé **six mois** à compter de la prise
  d'effet du plan, un vice de forme ou de procédure ne peut plus être soulevé par
  voie d'exception contre un permis. Deux défauts y échappent — l'absence de mise
  à disposition du public, et la violation des règles de l'enquête publique.

### Le Géoportail de l'urbanisme : approuvé n'est pas opposable ✔

L'enquête SuDocUH dit quel document couvre chaque commune, mais elle est
annuelle&nbsp;: elle connaît les approbations jusqu'à sa clôture — **le
10 janvier 2025** pour le millésime en place — et rien au-delà. Le Géoportail,
lui, est alimenté au fil de l'eau par les collectivités.

Le standard CNIG distingue deux états que le langage courant confond, et c'est
toute la valeur de la collecte&nbsp;:

- **« opposable »** — le document est approuvé *et* a fait l'objet de toutes les
  transmissions et publicités nécessaires. C'est lui qui fonde un permis
  aujourd'hui ;
- **« approuvé »** — la délibération est prise, ces formalités ne sont pas
  achevées, **le document ne s'applique pas encore**.

Le Mayet-de-Montagne est le cas d'école. SuDocUH donne un plan intercommunal
sectoriel approuvé le 31 mars 2022. Le Géoportail porte, en plus, un plan
intercommunal de Vichy Communauté approuvé le **8 janvier 2026**, encore à
l'état « approuvé », couvrant **quinze** des trente-neuf communes du
groupement — et son règlement est en ligne. Dire que ce plan s'applique serait
faux&nbsp;; ne rien dire laisserait un habitant préparer son projet sur un texte
en sursis. La fiche de commune dit les deux, dans cet ordre.

**Trois pièges ont été trouvés en route, et chacun aurait publié un faux.**

1. **`partition` n'est pas la clé d'un document.** C'est un *lot de dépôt*&nbsp;:
   la direction départementale des territoires de l'Allier a versé cent
   trente-neuf documents sous la seule `DU_03053`. Joindre là-dessus faisait
   d'une carte communale de 2016 un document couvrant **cent vingt-neuf
   communes**, et l'attribuait au Mayet-de-Montagne, qui relève d'un plan
   intercommunal. La vraie clé est `idurba`.
2. **Les deux sources ne mesurent pas la même date.** Sur les 16 108 communes
   dont les deux connaissent le document opposable, elles s'accordent sur le
   **type** dans 86 % des cas mais sur la **date** dans 20 % seulement — parce
   que le Géoportail date la *dernière procédure ayant fait évoluer le
   document*, fût-ce une modification du seul règlement écrit. Le site ne publie
   donc pas l'opposable du Géoportail&nbsp;: il lui manque en outre plus de la
   moitié des communes que SuDocUH situe.
3. **L'état « approuvé » seul ne veut rien dire.** Le fichier en porte 7 536,
   dont plus de sept cents antérieurs à 2020 — des lignes jamais repassées à
   « opposable » — et des dates à `00000000`, une à 2035. Le filtre retenu n'est
   pas un seuil choisi&nbsp;: **on ne garde que ce qui est postérieur à l'horizon
   déclaré par SuDocUH**. En deçà, les deux sources ont eu la même occasion de
   voir le document et n'en disent pas la même chose — sans moyen de trancher,
   le site se tait. Il reste **4 809 communes**, toutes 2025 ou 2026.

Coût&nbsp;: trois couches, 69 643 lignes, **sept secondes**. La source entre à la
veille, et un défaut d'accord révélé au passage est corrigé — « une carte
communale, **approuvé** […] **Il** est voté » était écrit au masculin pour le
seul document féminin de la liste.

**Ce qui n'est pas fait, et ce qu'il en coûterait.** La couche `zone_urba`
porte, zone par zone, le libellé long et **jusqu'à la page du règlement** qui la
décrit — `200071363_reglement_20260108_A.pdf#page=38`. C'est la « lecture
assistée du PLU » de la phase 4, pour le prix d'une ingestion. Mesuré&nbsp;:
**1 341 261 entités**, environ 1,1 Mo par page de cinq mille, quelque **290 Mo**
en tout, et une vingtaine de secondes par page en pagination profonde. Faisable,
pas gratuit. Et une limite qui n'est pas de volume&nbsp;: un zonage se rapporte
au **document**, pas à la commune. Sans géométrie, on ne peut pas dire laquelle
de ces zones couvre une adresse — et le laisser croire serait pire que se taire.

### Le critère de fin, mesuré pour la première fois ✔

Il était écrit en 2026 et jamais éprouvé. La mesure, le 23 septembre&nbsp;:

```
196 nœuds, 555 arêtes
d'un seul tenant : 38 220 paires atteignables sur 38 220 — 0 nœud isolé
diamètre 7 · à trois clics ou moins : 62,0 % des paires
   hors échelon État : 71,6 %        échelon État seul : 50,0 %
```

La moitié « sans impasse » est acquise. La moitié « trois clics » ne l'est pas,
et la poursuivre telle quelle serait une erreur de cadrage&nbsp;: entre 196
nœuds, trois sauts pour toutes les paires demandent une densité qu'aucun réseau
lisible n'a. Le contrôle la tient donc en cliquet, avec un plancher à 60 % — deux
points sous la mesure, pour qu'une fiche nouvelle ne fasse pas échouer le build
en déplaçant le chiffre de quelques dixièmes.

**Là où la mollesse se trouve, elle est concentrée.** 43 nœuds sont de degré 1
ou 2, documents exclus, et l'échelon État en porte la moitié — le Conseil
constitutionnel, le député et la cour administrative d'appel tiennent chacun à
un seul fil. Deux cas sortent du lot&nbsp;:

| Assemblée | Arêtes |
|---|---|
| conseil municipal | 8, dont 4 processus |
| conseil communautaire | 2 |
| conseil départemental | 1 — le vote de son budget |
| conseil régional | 1 — le vote de son budget |

Les assemblées délibérantes de deux échelons entiers n'apparaissent dans **aucun
processus**. Ce n'est pas forcément un défaut — le RSA est décidé par le
*président* du conseil départemental, et le site a raison de le dire — mais
c'est la forme du réseau qui s'en ressent.

**Et 25 documents sont de degré 1 par construction**, soit 13 % du graphe. Un
document ne se relie qu'au processus qui le *produit*. La délibération, le
procès-verbal, le plan local d'urbanisme, le budget primitif&nbsp;: chacun pend
d'un seul fil alors qu'ils sont consultés, cités et contestés un peu partout.
D'où la question&nbsp;: faut-il une arête « utilise » à côté de « produit »&nbsp;?

**Non — et c'est la simulation qui le dit, contre l'intuition.** Avant de
toucher au modèle, les quatre cas ont été mesurés&nbsp;:

| Scénario | Part à trois clics | Diamètre |
|---|---|---|
| tel quel | 62,0 % | 7 |
| + les 6 arêtes « utilise » que les fiches énoncent déjà | **62,3 %** | 7 |
| documents retirés du graphe | 67,5 % | 7 |
| borne haute&nbsp;: chaque document relié à *tous* les processus (+300 arêtes) | 70,1 % | 7 |

Six arêtes honnêtes rapportent **trois dixièmes de point**, et le maximum
physiquement possible — qui serait un mensonge — en rapporte huit sans réduire
le diamètre d'un cran. La raison est structurelle&nbsp;: un nœud de degré 1 est
périphérique par définition, et le rapprocher d'un pôle déjà bien relié ne
raccourcit aucun chemin entre les *autres* paires.

**Ce qui pèse, c'est la densité, et elle pèse le plus à l'échelon État.** Mesuré
en ajoutant des arêtes au hasard&nbsp;:

| Arêtes ajoutées | Part à trois clics | Diamètre |
|---|---|---|
| +50 (9 % de plus) | 68,7 % | 7 |
| +100 réparties partout | 72,9 % | 6 |
| **+100 dans le seul échelon État** | **76,0 %** | 6 |
| +400 | 93,7 % | 5 |

Cent relations concentrées sur l'État rapportent plus que cent réparties au
hasard. Le chiffre ne bougera donc pas par un ajustement de modèle, mais par du
contenu — et du contenu placé là où le réseau est le plus mince.

L'arête « utilise » reste défendable pour une autre raison, qui n'est pas
métrique&nbsp;: un lecteur arrivé sur la fiche du plan local d'urbanisme aimerait
voir « s'applique au permis de construire ». C'est un argument de navigation, à
peser pour lui-même, pas un moyen d'atteindre un seuil.

### L'échelon État densifié : les institutions nationales agissent enfin ✔

L'inventaire a montré ce que le chiffre ne disait pas&nbsp;: les institutions
nationales se tenaient **entre elles**. Le Parlement partageait ses compétences
avec le Gouvernement, le Conseil constitutionnel avec les deux assemblées — et
aucune n'intervenait dans une seule démarche d'habitant. L'échelon ne touchait
le reste du réseau que par l'État et le préfet.

Densifier, ce n'était donc pas ajouter des partages mais **les faire agir**. Trois
processus, là où le site menait déjà sans le dire&nbsp;:

- **faire appel d'un jugement du tribunal administratif** — tous les contentieux
  du site s'arrêtaient au tribunal, du permis de construire au refus de
  document, sans dire ce qui suit ;
- **contester une loi au cours d'un procès** — la question prioritaire de
  constitutionnalité, seule voie par laquelle un habitant fait juger une loi ;
- **faire interroger le Gouvernement par son député ou son sénateur** — la
  question écrite, dont ce site cite lui-même plusieurs réponses parmi ses
  pages de référence.

Et un acteur qui manquait&nbsp;: **la Cour de cassation**. Le graphe avait le
sommet de l'ordre administratif et pas celui de l'ordre judiciaire, alors que
c'est elle qui filtre toute question de constitutionnalité posée devant un juge
judiciaire.

**Deux affirmations fausses ont été écartées avant publication**, et elles
auraient été crues sur parole&nbsp;:

1. Un résultat de recherche donnait la liste des appels dispensés d'avocat, en
   tête de laquelle **les recours pour excès de pouvoir**. C'était une ancienne
   version de l'article R811-7&nbsp;: aujourd'hui l'avocat est obligatoire en
   appel, y compris là où l'on plaidait seul devant le tribunal, et les
   exceptions se réduisent aux contraventions de grande voirie et aux demandes
   d'exécution. La fiche écrite de mémoire aurait dit à un habitant qu'il
   pouvait faire appel seul — et son appel aurait été irrecevable.
2. Le délai de réponse aux questions écrites était, de mémoire, d'**un mois**. Il
   est de **deux**, à l'Assemblée comme au Sénat.

Ce que les fiches apportent, et qui décide d'une issue&nbsp;:

- **en zone tendue, il n'y a pas d'appel** contre un permis de construire de plus
  de deux logements, pour les recours introduits jusqu'au 31 décembre 2027 — le
  tribunal juge en premier et dernier ressort, et seule la cassation reste ;
- **le pourvoi en cassation ne suspend pas la décision attaquée** — il faut
  demander à part qu'il soit sursis à son exécution ;
- **dans la QPC, le silence joue pour le justiciable** : si le Conseil d'État ou
  la Cour de cassation n'a pas statué dans les trois mois, le Conseil
  constitutionnel est saisi de plein droit ;
- **le refus de transmettre une QPC ne se conteste jamais seul**, et celui du
  second filtre est sans recours ;
- **un député n'a que cinquante-deux questions écrites par session** depuis
  2015 ; la page du Sénat ne mentionne aucun quota comparable.

Trois partages vérifiés complètent l'ensemble, pour des nœuds qui tenaient à un
seul fil&nbsp;: la police et la gendarmerie exécutent le **concours de la force
publique** qu'un commissaire de justice requiert auprès du préfet — et dont le
refus ouvre droit à réparation&nbsp;; l'ANCT **pilote le réseau France
Services**&nbsp;; l'ADEME **accompagne les collectivités compétentes pour les
déchets**.

| | Avant | Après |
|---|---|---|
| Nœuds | 196 | 202 |
| Arêtes | 555 | 591 |
| Diamètre | 7 | **6** |
| Part à trois clics, tout le graphe | 62,0 % | **64,5 %** |
| Part à trois clics, échelon État | 50,0 % | **60,6 %** |

Le cliquet de `npm run verifier-reseau` suit&nbsp;: plancher relevé à 62 %,
diamètre maximal abaissé à 6. On ne redescendra pas sans le voir.

### Le département et la région agissent à leur tour ✔

Le chiffre disait le contraire de l'intuition&nbsp;: département et région réunis
atteignaient déjà **84,8 %** à trois clics, parce que `departement` et `region`
sont des pôles de trente et vingt-deux arêtes. Le défaut n'était pas métrique
mais de fond — **une seule démarche** faisait intervenir le département, le RSA,
et la région n'apparaissait que par la chambre régionale des comptes, dans le
budget communal. Ni les assemblées, ni la maison départementale des
personnes handicapées, ni la DREAL n'agissaient nulle part.

Cinq processus, choisis parmi les démarches qu'une famille rencontre&nbsp;:

- **demander l'allocation personnalisée d'autonomie** — pour un parent qui perd
  son autonomie ;
- **demander une aide ou une reconnaissance à la MDPH** ;
- **s'opposer à une installation classée** — élevage, carrière, usine&nbsp;: la
  plus fréquente des oppositions en territoire rural ;
- **connaître le collège de secteur, et en demander un autre** ;
- **inscrire un enfant au transport scolaire.**

**Un contraste que personne ne met côte à côte.** Pour l'APA, deux mois de
silence du département **valent accord**, au forfait, jusqu'à la décision
expresse. Pour la MDPH, quatre mois de silence de la commission **valent
refus**. Deux démarches du même échelon, deux règles de silence opposées&nbsp;:
la famille qui attend sans rien faire gagne dans un cas et perd dans l'autre.

**Une réforme récente, encore.** Comme pour le plan local d'urbanisme, une fiche
écrite de mémoire aurait décrit un droit disparu&nbsp;: depuis la loi du
23 octobre 2023 sur l'industrie verte, pour les demandes déposées à partir du
22 octobre 2024, l'enquête publique sur une installation classée est remplacée
par une **consultation de trois mois menée en parallèle de l'instruction** —
toujours sous un commissaire enquêteur, avec deux réunions publiques. Attendre
la fin de l'examen par l'État pour réagir, c'est désormais arriver après la
fenêtre.

Ce qui décide d'une issue&nbsp;:

- **l'APA n'est jamais reprise sur la succession**, ni auprès d'un légataire,
  d'un donataire ou du bénéficiaire d'une assurance-vie — des familles s'en
  privent en croyant le contraire&nbsp;;
- **le règlement départemental d'aide sociale**, voté par le conseil
  départemental, peut être plus favorable que la loi&nbsp;: c'est le seul
  endroit où le département l'écrit&nbsp;;
- **à la MDPH, deux mentions d'une même carte relèvent de deux juges** — le
  stationnement du tribunal administratif, la priorité du tribunal
  judiciaire&nbsp;; et la conciliation suspend le délai du recours préalable
  seulement si on la demande avant lui&nbsp;;
- **contre une installation classée, le recours des tiers dure quatre mois**, doit
  être notifié à peine d'irrecevabilité comme pour un permis, et une
  **réclamation reste possible après la mise en service** contre des
  prescriptions insuffisantes&nbsp;;
- **le département trace le secteur du collège, l'État affecte l'élève**&nbsp;:
  protester auprès du collège ne sert à rien, il ne dessine pas son secteur&nbsp;;
- **un trajet scolaire qui franchit la limite de deux réseaux** peut exiger deux
  inscriptions et deux paiements — le règlement régional d'Auvergne-Rhône-Alpes
  le prévoit en toutes lettres.

**Ce qui n'est pas fait, et pourquoi.**

- ~~**Le conseil régional tient toujours à un seul fil.**~~ Il n'a pas été
  relié au transport scolaire, faute de preuve qu'il en vote le règlement — le
  règlement lu désigne le *président* de Région. Il l'a été ensuite par deux
  textes qui le nomment lui-même, voir la section suivante.
- **Les critères de priorité des dérogations au collège restent à confirmer.**
  Les pages du ministère et des académies refusent les requêtes de cet
  environnement&nbsp;; l'étape est marquée `a_confirmer`, la fiche avec elle, et
  `npm run relire` la signale.
- ~~La PMI, le CAUE, le service d'incendie et l'agence régionale de santé
  n'interviennent encore dans aucune démarche.~~ Fait, voir la section
  suivante.

| | Avant | Après |
|---|---|---|
| Nœuds / arêtes | 202 / 591 | 207 / 628 |
| Trois clics, tout le graphe | 64,5 % | **66,2 %** |
| Trois clics, département et région | 84,8 % | **87,4 %** |
| Démarches où intervient le département | 1 | **4** |
| Démarches où intervient un acteur régional | 1 — le budget communal, par la chambre régionale des comptes | **3** |

Le cliquet suit&nbsp;: plancher relevé à 64 %.

### La PMI, le CAUE, le SDIS et l'ARS rejoignent le réseau ✔

Quatre services qui tenaient chacun par deux partages et n'agissaient dans
aucune démarche. Pour chacun, la même question&nbsp;: *où un habitant le
rencontre-t-il vraiment&nbsp;?*

- **La PMI instruit l'agrément des assistants maternels** — un processus neuf,
  « devenir assistant maternel ». Dans une commune rurale, c'est souvent le seul
  mode de garde. Trois mois de silence du département valent agrément, et les
  cent vingt heures de formation obligatoire, dont quatre-vingts avant le premier
  enfant, sont organisées et financées par le département.
- **Le CAUE conseille gratuitement avant un permis** — une étape ajoutée en tête
  du permis de construire, conditionnelle, avec son levier. Au-delà de 150 m² de
  surface de plancher, un particulier qui construit pour lui-même doit prendre
  un architecte&nbsp;; en dessous, c'est le conseil du CAUE qui reste gratuit.
  L'insertion a décalé les sept étapes et les ancres des leviers d'un cran, par
  script et vérifié sur la page générée.
- **L'ARS contrôle l'eau du robinet** — un processus neuf, « connaître la qualité
  de l'eau du robinet », et un partage sur la compétence eau potable.
  L'exploitant surveille, l'agence contrôle, et les résultats sont affichés en
  mairie, publiés en ligne et résumés chaque année avec la facture.
- **Le SDIS** n'a pas de démarche d'habitant qui soit la sienne, et on ne lui en a
  pas inventé. Il gagne deux relations structurelles, toutes deux vérifiées&nbsp;:
  la **défense extérieure contre l'incendie** — les poteaux et réserves d'eau
  dont le maire répond, selon un règlement départemental que le SDIS élabore et
  que le préfet arrête — et la **contribution communale**, dépense obligatoire du
  budget de la commune dont le flux manquait, seul celui du département y
  figurant.

Au passage, une page de référence en double a été fusionnée&nbsp;: l'article
L421-3 du code de l'action sociale et des familles existait déjà, pointé sur la
section entière&nbsp;; il pointe désormais l'article.

| | PMI | CAUE | SDIS | ARS |
|---|---|---|---|---|
| Arêtes avant | 2 | 2 | 2 | 2 |
| Arêtes après | **3** | **3** | **4** | **4** |
| Démarches | 1 | 1 | — | 1 |

Réseau&nbsp;: 207 → 211 nœuds, 628 → 650 arêtes, 66,2 % → **67,0 %** à trois
clics. Plancher du cliquet relevé à 65 %.

### Le conseil régional, par les textes qui le nomment ✔

Il tenait au réseau par son seul budget, et la première tentative l'avait laissé
ainsi&nbsp;: rien ne prouvait qu'il votât le règlement du transport scolaire. La
règle a donc été de ne le relier que là où **la loi nomme l'assemblée
elle-même**, et non la région en général ou son président. Deux articles le
font&nbsp;:

- **le schéma régional d'aménagement est adopté par délibération du conseil
  régional**, dans les trois ans qui suivent son renouvellement, puis approuvé
  par arrêté du préfet de région — qui peut refuser par décision motivée
  (art. L4251-7). D'où un processus neuf, « peser sur le schéma régional
  d'aménagement », et le document qu'il produit&nbsp;;
- **le conseil régional est seul compétent pour définir les régimes d'aides aux
  entreprises** et en décider l'octroi&nbsp;; communes et intercommunalités n'y
  participent que par convention avec la région (art. L1511-2). D'où un partage
  sur la compétence développement économique.

Le processus rend visible ce que la chaîne d'urbanisme cache&nbsp;: ce que le PLU
d'une commune devra respecter dans dix ans se décide ici, par le SCoT interposé.
L'enquête publique sur le schéma est le seul moment où un habitant peut en
discuter les règles générales — et c'est justement parce qu'il ne se lit pas
comme un règlement de parcelle qu'on le laisse passer.

Écarté faute de pouvoir le lire&nbsp;: un jugement d'annulation partielle d'un
schéma régional, que les résultats de recherche mentionnaient mais dont la page
renvoie à l'accueil du Conseil d'État.

Conseil régional&nbsp;: **1 → 4 arêtes**, une démarche. Réseau&nbsp;: 211 → 213 nœuds,
650 → 663 arêtes, 67,0 % → **67,5 %** à trois clics.

### La chambre régionale des comptes, et une erreur d'avant 2023 ✔

La chambre n'apparaissait que comme une étape du budget communal. Son contrôle
des comptes et de la gestion est une procédure à part entière, et un processus
neuf la décrit&nbsp;: « suivre un contrôle de la chambre régionale des comptes ».

**Une vérification préalable a trouvé une fiche fausse.** Celle de la Cour des
comptes disait qu'elle « **juge** les comptes de l'État ». Le mot était faux
deux fois&nbsp;: la Cour **certifie** les comptes de l'État (art. 47-2 de la
Constitution), et le jugement des comptables publics a disparu le 1er janvier
2023, remplacé par un régime unique de responsabilité des gestionnaires publics
— jugé par une chambre du contentieux de la Cour où les magistrats des chambres
régionales siègent à parité. La fiche de la chambre régionale gagne au passage
sa quatrième mission, l'évaluation des politiques publiques, ouverte par la loi
du 21 février 2022.

Ce que le processus rend visible&nbsp;:

- **la publication ne peut pas être retardée**&nbsp;: le rapport est publié à
  l'issue du débat, et au plus tard deux mois après sa communication par la
  chambre, même si le conseil ne s'est pas réuni&nbsp;;
- **rien ne paraît en période électorale**, du premier jour du troisième mois
  précédant le scrutin jusqu'au lendemain du résultat — un rapport attendu avant
  une élection peut ne paraître qu'après&nbsp;;
- **sous une intercommunalité, le rapport revient devant chaque conseil
  municipal**, avec débat — celui du groupement ne se discute pas qu'entre ses
  délégués&nbsp;;
- **un an après, l'exécutif doit présenter ce qu'il a fait** des observations.
  C'est le seul document qui dise ce qui a changé, et presque personne ne le
  réclame&nbsp;;
- **un habitant peut proposer un thème de contrôle** sur la plateforme de
  participation de la Cour, qui vaut pour les chambres régionales — ce n'est pas
  une saisine, les juridictions retiennent ou non.

Laissé tel quel, et à réexaminer&nbsp;: la chambre régionale figure toujours parmi
les acteurs de la compétence « comptable public ». Le lien tenait au jugement des
comptes, qui a disparu&nbsp;; la chambre contrôle toujours les comptes que le
comptable produit, ce qui le rend défendable, mais il mérite une relecture à
part.

Chambre régionale des comptes&nbsp;: 7 → 8 arêtes, deux démarches au lieu d'une.
Réseau&nbsp;: 213 → 215 nœuds, 663 → 672 arêtes, 67,5 % à trois clics — inchangé,
les nouveaux nœuds ajoutant eux-mêmes des paires à relier.

### Une feuille de relecture pour les fiches de septembre

Treize démarches nouvelles en deux jours, vérifiées une à une mais jamais
relues par quelqu'un qui connaît le terrain. [`docs/relecture-2026-09.md`](relecture-2026-09.md)
retient les affirmations qui décident d'une issue, dit pour chacune si elle a
été vérifiée sur une page lue, sur un extrait d'article ou sur une source
secondaire, et les range par risque.

La préparer a suffi à en faire tomber deux au rang « à confirmer »&nbsp;: le
partage entre révision et modification du PLU, qui dépend d'un article réécrit
en mai 2026 que cet environnement ne peut pas lire, et un piège de la fiche MDPH
qui tirait du rejet implicite une conséquence probablement trop forte.
`npm run relire` en liste désormais trois, avec les dérogations au collège.

Le point le plus sérieux n'est pourtant pas dans les fiches mais dans les
données&nbsp;: la page du Mayet-de-Montagne annonce un plan intercommunal
« approuvé mais pas encore opposable » depuis janvier. Huit mois après, il est
plus probable que le Géoportail n'ait pas été mis à jour que les formalités ne
soient pas faites.

### Une ingestion qui ne se perd plus en route

Le rapatriement complet touche huit sources et dure une dizaine de minutes.
Qu'une seule soit momentanément injoignable — c'est arrivé sur le répertoire
des élus — et tout était perdu, y compris ce qui avait déjà abouti. Les
collectes facultatives sont désormais isolées : celle qui échoue laisse en
place les fichiers de l'ingestion précédente, datés, plutôt que de tout
emporter. Restent fatals les référentiels dont dépend la structure du réseau,
BANATIC et le découpage : sans eux il n'y a rien à écrire.

### Une seule fiche par commune, et la carte rendue à ce qu'elle sait faire ✔

La page d'une commune renvoyait vers la carte pour « les comptes, les marchés
publics, les droits de mutation et les courbes ». Deux programmes décrivaient
donc la même commune — l'un au build, l'autre dans le navigateur — et ils
avaient dérivé&nbsp;: la faute d'accord sur « une carte communale, approuvé »,
corrigée sur la page, restait dans le panneau&nbsp;; le plan intercommunal
approuvé en janvier, ajouté à la page, n'avait jamais atteint le panneau. Sur
trois communes témoins, **59 %** seulement des faits chiffrés du panneau se
retrouvaient sur la page.

La page est maintenant **la seule source**. Les assemblages du panneau ont été
repris tels quels dans `src/modele/fiche-commune.ts`, qui lit les mêmes
fichiers depuis le disque&nbsp;; chaque bloc a son composant sous
`src/composants/commune/`, avec les textes et les classes du panneau. Là où les
deux versions différaient, la plus complète l'a emporté&nbsp;: la liste entière
des équipements plutôt que les huit premiers, la médiane des ordures ménagères
et le foncier non bâti, la série annuelle des logements autorisés, la mention
des urgences — et **« −1 classe à la rentrée 2021 »** pour l'école Yves Duteil,
que la page ne disait pas. Mesuré au navigateur sur Le Mayet-de-Montagne,
Vichy et Quimper&nbsp;: **863 faits chiffrés du panneau sur
863** sont sur la page. Un sommaire de pastilles y conduit bloc par bloc.

La carte ne garde que ce qu'elle est seule à savoir faire&nbsp;: dire, sur
chaque compétence, qui l'exerce ici — et le prix de l'eau sur l'eau potable.
Le reste du panneau est un lien vers la page.

| | Avant | Après |
| --- | --- | --- |
| Fichiers chargés par la carte pour une commune | 19 | 4 |
| Poids d’une visite de la carte, Le Mayet-de-Montagne | 826 Ko (mesure précédente) | 431 Ko |
| `explorateur.ts` / `territoire.ts` | 3 425 / 2 017 lignes | 1 274 / 260 lignes |
| Page d'une commune, médiane | 19 Ko | 65 Ko (14 Ko compressée) |
| `dist/` complet | 889 Mo (dernière mesure) | 2,4 Go, 77 406 fichiers |
| Durée du build complet | 2 min 47 | 6 min |

**Le coût est réel et il est là**&nbsp;: ce que la page gagne se multiplie par
34 875. Deux économies sans perte ont été faites — la réglette dessinée en CSS
plutôt qu'en SVG (−5 Ko par page), la suite des marchés laissée dans son
fichier et chargée à la demande. L'assemblage des données coûte 0,2 ms par
commune&nbsp;: la durée du build suit le volume de HTML écrit, pas le calcul.
Si l'envoi FTPS s'en ressent, le premier gisement est connu — les comptes du
département et de la région, 6,5 Ko identiques sur chaque page d'un même
département, qui trouveraient leur place sur la page du département.

**Une commune se trouve depuis n'importe quelle page.** Le champ de l'en-tête
cherche par nom ou par code postal, avec le classement que
`verifier-recherche` garantit, et mène à la page. L'index national n'est
téléchargé qu'à la première frappe. Sans JavaScript, le champ est remplacé par
un lien vers `/communes`, qui liste les départements, puis les communes de
chacun — un chemin de liens que les moteurs suivent aussi, déclaré au plan du
site.

**Une année impossible, attrapée en relisant Quimper.** Quimper Bretagne
Occidentale publie trois conventions de subvention dont la date se lit
« 1735 » et dont l'objet dit 2025&nbsp;; le panneau affichait « 90 subventions
publiées, 1735-2024 ». L'ingestion refuse désormais une année hors de
2000 → l'an prochain (`src/modele/annees.ts`), et la page la tait dans les
fichiers déjà produits.

### Un déploiement qui n'envoie plus que ce qui a changé ✔

Les deux déploiements précédents avaient échoué après quatre heures chacun :
`lftp mirror` compare taille et date, et sur une machine d'intégration neuve
tout est daté du jour. Les 77 000 fichiers repartaient donc à chaque
publication, y compris les 33 000 flux par commune identiques à l'octet près.

Trois changements, et aucun ne retire rien au site :

- **un manifeste d'empreintes** déposé sur le serveur au dernier envoi réussi.
  Le suivant n'envoie que la différence. Essayé contre un serveur FTP local :
  un fichier modifié, un supprimé, un ajouté donnent deux envois et un
  effacement, les 8 628 autres ne bougent pas, et le serveur est ensuite
  identique à `dist/` ;
- **des noms sans empreinte dans `_astro/`.** Une retouche de CSS seule ne
  change plus qu'un fichier sur 8 630 — elle changeait toutes les pages ;
- **1 741 fichiers de données retirés de `dist/`**, que le navigateur ne lit
  plus depuis que la page de commune est la seule source.

**La vraie cause des échecs, trouvée au premier envoi du nouveau mode.** Il a
fini ses 35 000 pages en deux heures, puis a échoué sur la dernière ligne :
`Removing old file '.ftpquota'`. Ce fichier appartient au serveur FTP, qui
refuse qu'on l'efface, et `mirror --delete` s'y arrêtait en erreur — après
que tout était parti, donc sans manifeste déposé ni cache purgé. C'était déjà,
selon toute vraisemblance, la fin silencieuse des deux déploiements
précédents. Il est exclu du miroir, avec `.well-known/` et `cgi-bin/`, qui
appartiennent eux aussi à l'hébergement.

Les flux par commune restent : c'est ce que le site offre de plus utile à un
habitant, et une fois le manifeste en place ils ne coûtent plus rien tant que
rien ne bouge chez eux.

### Le HTML, contrôlé plutôt que supposé ✔

Onze pages représentatives passées à html-validate et à axe-core, en clair
comme en sombre. Le balisage était valide et la hiérarchie des titres sans
saut ; il manquait l'essentiel des repères. Corrigé :

- aucune page n'avait de `<main>`, ni de lien d'évitement ;
- le gris des sources, des médianes et des dates tenait 3,4:1 en clair et
  4,1:1 en sombre, sous les 4,5:1 qu'exige un petit texte — 642 éléments, un
  seul jeton, qui tient désormais au moins 4,6:1 sur chacun des fonds ;
- le schéma de voisinage était déclaré image alors qu'il contient des liens,
  que les lecteurs d'écran ne voyaient donc plus ;
- la carte n'avait pas de titre de premier niveau, et la navigation de
  l'en-tête pas de nom.

axe ne signale plus rien. html-validate garde une remarque, qu'on laisse :
il préférerait un `<select>` pour la recherche de commune, où 34 875 options
ne se parcourent pas.

### Trois acteurs qu'un habitant rencontre, enfin mis en action ✔

Le CCAS, les finances publiques et le conciliateur de justice étaient décrits
sans agir dans aucune démarche. Trois processus, chacun sur ses textes :

- **contester sa taxe foncière** — la réclamation jusqu'au 31 décembre de
  l'année suivante, six mois pour répondre, le silence qui vaut rejet et
  n'enferme dans aucun délai ; et la commission communale des impôts directs,
  nouvel acteur, où six contribuables de la commune évaluent avec
  l'administration les propriétés bâties ;
- **régler un litige par le conciliateur** — gratuit, obligatoire avant le juge
  jusqu'à 5 000 € et pour un trouble de voisinage depuis le 1ᵉʳ octobre 2023,
  après une annulation en 2022 : la fiche cite la version en vigueur de
  l'article 750-1 et le décret qui l'a rétabli, pas l'identifiant de 2019 ;
- **demander de l'aide au CCAS** — le dépôt de l'aide sociale légale, la
  transmission obligatoire dans le mois quel que soit l'avis du centre, les
  aides qu'il décide seul, et la domiciliation qu'il ne peut refuser qu'à qui
  n'a aucun lien avec la commune.

Réseau : 215 → 220 nœuds, 672 → 701 arêtes, 67,5 % → 68,1 % des paires à trois
clics. Les comptes des CCAS sont publiés par l'OFGL depuis 2018 — au
Mayet-de-Montagne, 12 504 € de recettes en 2024, dont 7 500 € de la commune ;
ils entreront sur la page de chaque commune.

### Ce que publient les entreprises ✔

Le BODACC publie chaque jour ce qui s'ouvre, change de mains et ferme :
créations, arrivées par transfert, modifications, ventes de fonds, radiations,
procédures collectives. La page de chaque commune en donne le décompte par
année depuis 2016, et les huit dernières annonces des sociétés, chacune liée à
sa page sur bodacc.fr ; le flux de la commune annonce les créations, arrivées,
cessions et radiations.

Trois règles, qui tiennent à celle des personnes physiques :

- **les entrepreneurs individuels sont comptés, jamais nommés** — ils exercent
  sous leur nom. Le nom affiché vient de la liste des personnes de l'annonce,
  et une annonce qui en cite une physique n'est pas nommée du tout : le champ
  « commerçant » mêlait, pour une vente, la société et l'ancien exploitant ;
- **les procédures collectives sont comptées, avec un lien** vers la
  recherche du BODACC lui-même, jamais listées ;
- **les dépôts de comptes ne sont pas repris.**

Le BODACC ne donne pas de code commune. Le rattachement passe par le code
postal, puis par le nom — débarrassé de « Cedex » et de l'arrondissement —
dans le département, communes déléguées et associées comprises : Lomme et
Hellemmes sont Lille. 10,5 % des annonces depuis 2016 restent sans commune,
dont dix points sans aucune adresse ; la page le dit. Au
Mayet-de-Montagne, 10 créations en 2024 et 8 annonces de procédure collective
en 2019, recoupées une à une avec le BODACC.

Les naissances et les décès (INSEE, depuis 2008) et le CCAS (comptes de
l'OFGL, établissements FINESS) sont entrés sur la même page juste avant.

### Qui sont les habitants : la pyramide des âges ✔

La courbe dit combien ils sont, les naissances et les décès pourquoi leur
nombre bouge ; la pyramide dit qui ils sont. Elle vient de la table POP1 du
recensement de l'INSEE, millésime 2023 — les enquêtes de 2021 à 2025, que
l'INSEE combine —, par sexe et par âge pour chaque commune et chaque
département.

- **En part des habitants, et le département en trait** à la même échelle :
  c'est ce qui permet de poser un village sur un département et de voir
  quelle tranche est plus fournie ou plus creuse qu'alentour.
- **Tranches de cinq ans**, de quinze sous 500 habitants, rien sous 100 ; aucun
  âge détaillé n'est publié. Les valeurs sont des estimations pondérées,
  arrondies à l'unité dans le tableau replié sous le dessin.
- **Le dessin pèse 2,8 Ko** : une chaîne SVG, un seul tracé par côté pour
  toutes les barres. La première version, un élément et une infobulle par
  barre, en pesait 10 — 350 Mo sur l'ensemble du site.

Au Mayet-de-Montagne : 1 383 habitants, le total même de la population
municipale ; 43 % ont 60 ans ou plus, contre 36 % dans l'Allier, et 19 % moins
de 20 ans, contre 20 %. Mayotte, hors du recensement annuel, n'a pas de
pyramide.

### Les voix de la liste arrivée en tête, en part des inscrits ✔

La prime majoritaire (code électoral, art. L262) donne d'office la moitié des
sièges à la liste arrivée en tête : elle tient le conseil, qu'elle ait réuni
30 % des inscrits ou 80 %. La participation et les bulletins blancs ou nuls ne
le disaient qu'à moitié ; le bloc de l'élection donne désormais ses voix
rapportées aux inscrits, au tour qui a attribué les sièges, contre la médiane
nationale — 48,1 %.

Le chiffre n'est pas une construction du site : le ministère le publie liste
par liste (« % Voix/inscrits »), et le collecteur recoupe le sien avec — 36 362
pourcentages, aucun écart. Il vaut pour toutes les communes depuis que la loi
du 21 mai 2025 a étendu le scrutin de liste à celles de moins de 1 000
habitants. La page dit « des inscrits », jamais « de la population » : les
mineurs, les étrangers hors Union européenne et les non-inscrits n'y sont pas.

Au Mayet-de-Montagne : une seule liste, 420 voix sur 1 030 inscrits, 40,8 % ;
165 bulletins blancs ou nuls sur 585 votants, 28 % contre une médiane de 9 %.

### Ce qui est installé : les établissements par secteur ✔

Le BODACC disait ce qui s'ouvre, change de mains et ferme ; la base SIRENE dit
ce qui est là. Le bloc des entreprises donne désormais les établissements
actifs de la commune, secteur par secteur, et parmi eux les employeurs — ceux
qui ont déclaré un salarié à l'URSSAF.

Les deux nombres vont ensemble : un établissement actif au répertoire n'est
pas forcément ouvert. Au Mayet-de-Montagne, 379 établissements actifs dont 72
employeurs ; 51 des 52 de l'immobilier et les 13 de l'énergie n'emploient
personne — des SCI, des toits équipés de panneaux solaires. La réglette porte
sur les employeurs rapportés aux habitants : 52,1 pour 1 000, contre une
médiane de 22,2 — un bourg-centre qui sert les villages autour.

La source est la copie de SIRENE que tient Opendatasoft, agrégeable côté
serveur : un département répond en deux secondes, la France en moins de deux
minutes. Rien n'est nommé.

### Déployer par archives ✔ *(à activer : secret `DEPLOI_JETON`)*

Chaque nouveauté de la page de commune coûtait trois heures et demie de
déploiement — trente-cinq mille fichiers, une connexion FTP chacun — et deux
envois ont échoué sur un seul fichier coupé en route, laissant Paris et Lyon
tronquées en ligne. Deux correctifs d'abord : l'envoi sous nom temporaire, qui
ne laisse plus jamais une page à moitié écrite, et une seconde passe qui
rattrape les fichiers perdus.

Puis le changement de fond : au-delà de trois cents fichiers, ils partent par
archives de deux mille, et un script PHP déposé le temps du déploiement les
ouvre sur le serveur. Vingt fichiers au lieu de trente-cinq mille. Le script
est protégé par un jeton dont il ne connaît que l'empreinte, refuse tout
chemin ou fichier qui n'est pas du site, et disparaît à la fin. Sans jeton, ou
au moindre échec, rien ne change : le miroir fichier par fichier reprend.

Essayé contre un serveur FTP et un PHP locaux : 4 100 fichiers en trois
archives, déballées en plusieurs appels ; les chemins piégés refusés ; le repli
quand PHP ne répond pas, sans rien laisser derrière.

**Premier essai réel, le 26 septembre : repli.** 68 088 fichiers en 35
archives (708 Mo) sont partis en deux minutes, puis le premier appel au script
a reçu de Cloudflare un 520 — l'origine a rendu une réponse vide ou coupée.
Le repli a joué son rôle : le miroir a pris la suite, et le nettoyage n'a rien
laissé sur le serveur. Le journal ne gardait que les premiers octets de la page
d'erreur, le gabarit commun à toutes celles de Cloudflare ; il garde désormais
le code, le `cf-ray` et le titre de la page, retente un 52x, et commence par
une requête sans jeton qui doit rendre le 403 du script — ce qui sépare
« PHP ne répond pas » de « le POST est arrêté en route ».

**Diagnostic, le 30 septembre : la protection de l'hébergeur.** Le témoin et
la sonde sans jeton rendent eux aussi un 520. Le journal d'accès d'Apache de
septembre compte 207 000 lignes, jusqu'aux 404 sur des `.php` inexistants, et
aucune pour `temoin-*.php` ni `deballer-*.php` ; le journal d'erreurs n'en dit
rien non plus. Un `test.php` créé à la main depuis cPanel répond, à un client
qui n'est pas un navigateur, par un 403 « Accès interdit — Request ID » qui
n'est ni la page de Cloudflare ni celle d'Apache. Une requête vers un fichier
PHP qui existe est donc arrêtée devant Apache — vraisemblablement par
TigerProtect, l'anti-robot d'o2switch. À faire dans cPanel : le désactiver
pour rouages.fr (le site est statique ; le seul PHP est le script de
déballage, gardé par son jeton et effacé après usage), puis relancer « Sonder
le déballage ». Une liste blanche d'adresses ne servirait à rien : les
machines de GitHub changent d'adresse à chaque job.

TigerProtect désactivé le même jour, la requête atteint PHP et échoue : un
500 au corps vide, avec un navigateur comme avec la sonde, et rien dans le
journal d'erreurs d'Apache — PHP tourne sans doute à côté, sous PHP-FPM ou
LSAPI, qui journalise ailleurs. Reste à voir dans cPanel la version et le
gestionnaire PHP du domaine.

Le même journal d'erreurs a montré autre chose : `/communes` finissait en
403. Apache ajoute la barre finale au nom d'un dossier avant toute réécriture
(`DirectorySlash`), et `communes/` n'a pas d'index — la page est
`communes.html`. Le `.htaccess` sert désormais cette page à `/communes/` ;
essayé contre un Apache 2.4 local avec le même fichier.

Le même déploiement a buté sur une seconde limite : GitHub arrête un job au
bout de six heures, et soixante-huit mille fichiers un par un n'y tiennent
pas. Arrêté en route, il n'aurait déposé aucun manifeste, et le suivant
aurait tout renvoyé — sur une machine neuve, la date d'un fichier ne dit plus
s'il est parti. Le repli envoie désormais par lots de quatre mille et dépose
après chacun le manifeste de ce qui est en ligne ; passé cinq heures dix, il
ne commence plus de lot et s'arrête en le disant. Relancé, il reprend au lot
suivant. Essayé contre un serveur FTP local : 9 000 fichiers, arrêt après le
premier lot, reprise qui n'envoie que les 5 001 restants puis efface ce qui a
disparu.

### Une page qu'on lit sans la parcourir en entier ✔

La page de commune dépassait dix écrans. Quatre changements pour celui qui ne
descendra pas jusqu'au bout :

- **L'essentiel**, en haut : cinq ou six chiffres — habitants et part des 60
  ans ou plus, voix de la liste en tête, dépenses de fonctionnement par
  habitant, employeurs, CCAS, faits du journal —, chacun renvoyant au bloc qui
  le rapporte à sa médiane et à sa source. Rien n'y figure qui ne soit pas
  plus bas.
- **Les démarches liées**, sous neuf blocs : le graphe les décrivait, la page
  ne les montrait pas. Du CCAS à la demande d'aide, de la taxe foncière à sa
  contestation, de l'élection à l'inscription.
- **Depuis la dernière visite** : le navigateur retient, commune par commune,
  la date du dernier fait vu, et marque ce qui est plus récent. Rien ne part au
  serveur.
- **Les services plafonnés à quarante par famille**, les écoles qui ont gagné
  ou perdu une classe en tête. Paris passe de 612 à 136 Ko : ses 833 écoles en
  pesaient 520, repliées mais présentes dans le HTML.

Au passage, les bulletins blancs et nuls sont comptés à part — au
Mayet-de-Montagne, 41 blancs et 124 nuls —, et le rattachement des annonces du
BODACC a son script de vérification, `npm run verifier-rattachement`, lancé en
intégration continue.

### De quoi ils vivent, ce qu'ils ont étudié ✔

Deux sources de l'INSEE, au millésime 2023, dans une section qui suit celle des
habitants :

- **Le niveau de vie**, d'après Filosofi : la médiane et le taux de pauvreté,
  rapportés au département et à la France métropolitaine — une médiane de
  médianes communales ne voudrait rien dire, et c'est à la métropole que se
  mesure le seuil de pauvreté. Ce sont les deux seuls chiffres que l'INSEE
  publie sous le département. La médiane est publiée pour 30 794 communes, le
  taux de pauvreté pour 5 242 seulement ; quand le secret statistique couvre
  un chiffre, le bloc le dit et donne celui du département. Rien pour la
  Guadeloupe, la Martinique, la Guyane et Mayotte, et le bloc le dit aussi.
  Le millésime 2023 est le premier de « Filosofi 2 », refondu après la
  suppression de la taxe d'habitation : l'INSEE proscrit la comparaison avec
  les précédents, et le site ne montre aucune évolution.
- **Les diplômes**, d'après le recensement : le diplôme le plus élevé des
  habitants de 15 ans ou plus sortis de l'école, sept niveaux d'« aucun » à
  « bac + 5 ou plus », en barres rapportées au département, 2017 et la France
  dans le tableau replié. Le recensement ne va pas au-delà du bac + 5 : ni
  doctorat ni bac + 8 à l'échelle d'une commune, même dans la table détaillée.
  Sous 100 personnes, pas de graphique.

Au Mayet-de-Montagne : un niveau de vie médian de 22 680 € par an, contre
24 430 € dans l'Allier et 25 920 € en France métropolitaine ; taux de pauvreté
sous secret. 17 % des habitants sortis de l'école ont un diplôme du supérieur,
contre 24 % dans l'Allier et 34 % en France, 4 % un bac + 5 ou plus ; 25 %
n'ont aucun diplôme, contre 30 % en 2017. Le niveau de vie médian entre dans
« L'essentiel ».

### Toutes les recettes et les dépenses, en euros et par habitant ✔

Le bloc des comptes montrait six lignes, dont deux seulement de recettes : la
dotation de l'État et les impôts locaux. L'OFGL publie pourtant tout l'arbre —
recettes et dépenses de fonctionnement et d'investissement, poste par poste — et
le site l'affiche désormais, pour la commune, le département et la région :

- **En tête, huit lignes** avec leur réglette, leur médiane et leur série depuis
  2018, et désormais leur montant en euros : recettes et dépenses de
  fonctionnement, impôts levés par la commune, dotation de l'État, frais de
  personnel, dépenses d'équipement, épargne brute, encours de dette.
- **Dessous, un tableau poste par poste** : montant, euros par habitant, médiane.
  Les parts d'un poste sont en retrait sous lui ; « dont » marque celles qui
  n'en détaillent qu'une partie. Chez le département : RSA, APA, PCH, pompiers,
  droits de mutation, fraction de TVA ; chez la région : cartes grises.
- **L'arbre vient de `contenu/reperes.yaml`**, qui dit pour chaque poste son
  parent, s'il est un « dont », s'il a sa ligne en tête, et quels échelons le
  portent.
- **Les sommes sont contrôlées à l'ingestion**, commune par commune : les parts
  de chaque poste doivent refaire son total. Aucun écart sur les 34 778
  communes, les 97 départements et les 17 régions. Une ligne absente à l'OFGL
  vaut zéro — c'est ce que le contrôle montre pour la dotation globale (515
  absences) et les autres impôts (631).

**Une erreur corrigée au passage.** La ligne « Impôts locaux » était expliquée
comme « ce que la commune perçoit directement des contribuables ». D'après les
définitions de l'OFGL, elle comprend la fiscalité reversée — pour l'essentiel
ce que l'intercommunalité reverse. Le site sépare désormais les deux : au
Mayet-de-Montagne, sur 716 280 € d'impôts locaux en 2025, 245 408 € viennent
de Vichy Communauté, et la commune en lève elle-même 470 872 € — contre
260 160 € en 2018, le reversement restant stable.

Chez un département ou une région, les impôts locaux sont minces, parfois
négatifs — −72,9 M€ pour Auvergne-Rhône-Alpes : l'essentiel de ce qu'ils
levaient est remplacé depuis 2021 par une fraction de TVA, que l'OFGL range
dans les autres impôts et taxes. Le tableau montre l'un et l'autre.

`npx tsx scripts/comptes-emettre.ts` rejoue les comptes seuls, sans
l'ingestion complète.

**Une page par département et par région.** Les comptes de l'échelon
au-dessus pesaient une vingtaine de kilo-octets sur chaque page de commune,
identiques sur les trois cents communes d'un même département. Ils ont
désormais leur page — `/departement/03`, `/region/84` —, et la commune garde,
à la même place, deux chiffres et le lien : au Mayet-de-Montagne, la page
passe de 129 à 107 Ko. Au passage, trois cas que le site traitait mal : les
communes alsaciennes relèvent de la Collectivité européenne d'Alsace (`67A`),
dont les comptes ne s'affichaient pas ; celles de la Métropole de Lyon
relèvent d'elle (`691`), et non du Rhône, dont elles montraient les comptes ;
la Corse, la Martinique et la Guyane ont une collectivité unique, que la page
nomme ainsi.

### Deux déploiements tombés sur un village sans habitants ✔

Les déploiements #102 et #103 ont échoué au build, sur la même page : Beaumont-
en-Verdunois (55039), l'un des six villages de la Meuse détruits en 1916 et
jamais reconstruits. Le recensement leur donne des effectifs nuls, et le bloc
des diplômes calculait des parts sur zéro personne. Le contrôle des PR ne
construisait que trois départements ; il construit désormais la Meuse aussi.

Le déploiement #101, lui, est passé — par lots, en 2 h 47 : le déballage
reçoit un 520 jusque sur une requête GET sans jeton, ce qui écarte un POST
arrêté en route. Un témoin — le PHP le plus simple — est désormais déposé et
appelé avant le script : s'il répond et pas le script, c'est le script que
l'hébergeur bloque ; si aucun ne répond, c'est PHP.

### La vie qu'on y mène : dix sources de plus ✔

Onze pistes avaient été listées, sans vérification. Dix se sont révélées
publiées à la commune et joignables ; chacune a son collecteur
(`scripts/*-emettre.ts`, lançable seul), sa source, sa veille et son bloc :

- **Voir un médecin généraliste** — l'accessibilité potentielle localisée de
  la DREES, 2022 à 2024, rapportée au seuil de 2,5 consultations sous lequel
  l'INSEE tient une commune pour sous-dotée, et ce qui dépend des médecins de
  plus de 65 ans. Le zonage de l'ARS est cité par son article (L1434-4).
- **L'eau du robinet** — douze mois de contrôle sanitaire, les limites de
  qualité seulement, les dérogations préfectorales à part (R1321-31), avec le
  maître d'ouvrage du réseau.
- **La fibre et la fin du cuivre** — l'indicateur France Très Haut Débit de
  l'ANCT : locaux raccordables, porteur du réseau, année de fermeture du cuivre.
- **L'électricité et le gaz** — l'Agence ORE : consommation par logement et
  distributeur, Enedis ou l'une des entreprises locales qui desservent
  3 767 communes.
- **Les logements** — le recensement (principales, secondaires, vacantes, et
  qui les occupe, logement social compris) et le prix des ventes d'après DVF.
- **L'emploi et les trajets** — l'activité des 15-64 ans et où travaillent
  ceux qui ont un emploi, dans « De quoi ils vivent ».
- **Qui fréquente ses écoles** — l'indice de position sociale de chaque école
  et collège, comparé au département et à la France du même secteur.
- **La délinquance enregistrée** — la base communale du SSMSI.
- **La surface agricole** — le recensement agricole 2020.
- **La participation aux élections nationales** depuis 2022.

Au Mayet-de-Montagne : 8,9 consultations de généraliste par habitant en 2024,
7,7 sans les médecins de plus de 65 ans ; 24 prélèvements d'eau sur douze
mois, tous conformes ; 973 locaux sur 1 136 raccordables à la fibre, cuivre
fermé fin 2030 ; 18 % de logements vacants, contre 15 % en 2012 ; 59 maisons
vendues de 2023 à 2025, prix médian 52 000 €, 671 € le mètre carré contre
1 188 € dans l'Allier ; 13 % des actifs se déclarent au chômage, 77 % vont
travailler en voiture ; IPS de 93,7 à l'école Yves Duteil ; 1 512 hectares
cultivés par les exploitations de la commune, à 91 % en prairies.

**Ce qui a été vérifié, et comment.** Chaque collecte a été rapprochée de sa
source sur Le Mayet-de-Montagne : les valeurs du recensement contre l'API de
l'INSEE, cellule par cellule ; les prélèvements d'eau recomptés à part ; la
surface agricole totale — 26,9 millions d'hectares — contre le chiffre
qu'Agreste publie. Un recomptage indépendant des ventes immobilières trouvait
une maison de plus : c'est lui qui se trompait, la vente portait aussi sur une
parcelle de Ferrières-sur-Sichon, et la règle écarte les ventes à cheval sur
deux communes.

**Ce qui a été refusé :**

- **Le répertoire des logements sociaux (RPLS).** Il n'est publié que
  logement par logement — 5,4 millions de lignes — et aucun décompte communal
  n'est en données ouvertes nationales. Le logement social est lu par ses
  occupants, au recensement.
- **Les résultats au brevet par établissement** : le jeu national s'arrête à
  la session 2021.
- **La couverture mobile** : aucun jeu communal national trouvé, seulement des
  cartes et des relevés départementaux.
- **Une moyenne nationale de participation qui ne serait pas la bonne** : la
  référence additionne les communes de métropole et des départements
  d'outre-mer, et la page dit qu'elle n'est pas la participation officielle,
  qui compte les Français de l'étranger.

**Repris ensuite, une fois l'obstacle levé :**

- **La moyenne de l'APL.** L'écart avec l'INSEE — 3,745 calculé, 3,8 publié
  pour 2023 — venait de la pondération, pas d'une révision du fichier : la note
  de la DREES conseille la population standardisée, l'INSEE pondère par la
  population totale. Avec sa pondération, le calcul redonne ses deux chiffres
  publiés, 3,8 pour la France et 2,9 pour le Centre-Val de Loire (3,751 et
  2,924). Le bloc compare donc au département et à la France, par la méthode de
  l'INSEE, et Paris, Lyon et Marseille ont leur moyenne et le détail de chaque
  arrondissement.
- **Les voix.** Les six premiers candidats ou listes de la commune, en part des
  exprimés, le reste réuni — la somme retombe sur les exprimés, vérifié au
  Mayet-de-Montagne (694 + 78 = 772 au premier tour de 2022). Aux législatives,
  la nuance est l'abréviation du ministère, affichée telle quelle : sa grille
  de 2024 (UG, UXD, HOR…) n'est pas publiée en données ouvertes avec ses
  libellés, et le dictionnaire de data.gouv s'arrête avant. Les 126 communes qui
  couvrent plusieurs circonscriptions n'ont pas de classement : le fichier par
  commune les réunit en une ligne, et mélangerait des candidats qui ne
  s'affrontaient pas. On les reconnaît à deux candidats d'une même grande
  coalition — UG, RN, UXD, ENS n'en présentaient qu'un par circonscription.
- **Les noms d'écoles** de l'annuaire, rendus lisibles : abréviations
  parisiennes développées (« E E PU » → école élémentaire publique), accents
  rendus, nom répété dédoublé, adresse séparée par un tiret — c'est elle qui
  distingue deux homonymes.
- **« L'essentiel »** reçoit l'accès aux généralistes, le prix médian d'une
  maison et la part de locaux raccordables à la fibre, arrondis comme dans leur
  bloc.

**Deux obstacles d'outillage.** Le site d'Agreste ne présente pas toute sa
chaîne de certificats ; le collecteur fait ce que fait un navigateur — il va
chercher l'intermédiaire à l'adresse que donne le certificat et l'ajoute aux
autorités connues, sans jamais désactiver la vérification. Et depuis cet
environnement, le tunnel coupe les gros fichiers de l'INSEE servis compressés,
qui n'annoncent pas leur longueur : ils ont été repris par `curl -C -`, puis
contrôlés par `unzip -t`.

## Plan d'octobre 2026 : sept lots

Toutes les pistes proposées après les PR #10 et #11 ont été retenues. Elles sont
rangées en lots, un lot par PR. Chaque lot se termine de la même façon : chaque
source sondée puis vérifiée contre elle-même sur Le Mayet-de-Montagne, `npm run
verifier-types`, `npm run valider`, build sur le périmètre de l'intégration
continue, une entrée ici et une surveillance dans la veille.

**Contrainte de rythme.** Tant que le déploiement par archives ne fonctionne pas,
un lot qui touche toutes les pages de commune coûte un envoi complet de près de
trois heures. D'où l'ordre : le lot 0 d'abord, puis des lots assez gros pour
qu'un envoi en vaille la peine — pas une PR par source.

État des sources au 29 septembre 2026, sondées depuis l'environnement de
développement : « joignable » veut dire qu'on a lu le catalogue ou le fichier,
pas encore qu'on a vérifié ses chiffres.

### Lot 0 — Fiabiliser avant d'ajouter

- **Réingérer en intégration continue.** Fait : le workflow « Réingestion
  des territoires » (`.github/workflows/reingerer.yml`), déclenché à la main,
  lance `npm run territoires` sur le réseau de GitHub, refait le contrôle de
  `ci.yml` — une PR ouverte par le jeton du workflow ne le relance pas — et
  ouvre une PR avec les fichiers réécrits, les collectes en échec et le
  nombre de fichiers par jeu. Il faut autoriser GitHub Actions à ouvrir des
  PR (Settings → Actions → General) ; sinon la branche est poussée et le
  journal donne le lien. Premier passage à faire : c'est aussi celui des dix
  collectes de la PR #10 dans la chaîne entière.
- **Déploiement par archives.** Bloqué côté hébergeur : aucun PHP ne s'exécute
  sur rouages.fr. Ce qu'il faut regarder dans le cPanel d'o2switch — journal
  d'erreurs, version de PHP du domaine, pare-feu applicatif — est noté dans
  « Déployer par archives ». Demande l'accès du mainteneur ; rien d'autre ne
  l'attend.

### Lot 1 — Une page par intercommunalité

Fait : `/intercommunalite/<SIREN>`, une page pour chacune des 1 264
intercommunalités à fiscalité propre — communautés de communes,
d'agglomération, urbaines, métropoles, établissements publics territoriaux du
Grand Paris. Au Mayet-de-Montagne : Vichy Communauté, 39 communes.

- **Ce que ses communes lui ont transféré**, d'après BANATIC, parmi les
  compétences que le site décrit, avec celles que la loi impose à sa nature.
- **Ses comptes** (OFGL, `ofgl-base-gfp`, budget principal), le même arbre de
  postes que pour les autres échelons, avec la fiscalité reversée et la
  fraction de TVA. Les sommes se vérifient à l'euro près pour les 1 262
  groupements de 2025. La médiane est celle de la **strate** : communautés de
  communes à fiscalité additionnelle (160) ou professionnelle unique (826),
  d'agglomération (229), communautés urbaines et métropoles (34),
  établissements publics territoriaux (11). Une médiane de tout l'échelon
  comparerait une communauté rurale à une métropole. La Métropole de Lyon et
  celle du Grand Paris, seules de leur espèce, n'ont pas de médiane.
- **Ce qu'elle perçoit à la place des communes** : ordures ménagères,
  versement mobilité.
- **Ses communes**, avec leur population.

La page de commune y renvoie depuis « Les structures dont elle dépend » et
« Les comptes des échelons au-dessus », qui donne maintenant l'intercommunalité
avant le département ; la page de département liste ses intercommunalités.
`npx tsx scripts/comptes-emettre.ts --echelons` rafraîchit ces comptes seuls.

**Refusé : le conseil communautaire.** La répartition des sièges est fixée par
arrêté préfectoral, que rien ne publie en données ouvertes. Le répertoire
national des élus ne la refait pas : à Vichy Communauté, il donne deux
conseillers à Bost (183 habitants) et à Châtel-Montagne, aucun à Molles, deux à
Saint-Rémy-en-Rollat là où le scrutin de 2026 en élit un — des suppléants et
des vacances, sans doute. Additionner ces nombres donnerait un conseil qui
n'existe pas.

**Vérifié, et retiré (30 septembre)** : la page de commune prenait ce même
nombre du répertoire pour les sièges au conseil communautaire. Le fichier n'a
aucune colonne qui distingue titulaire et suppléant. Sur les quelque dix mille
communes de moins de trois cents habitants, 9 785 y ont un conseiller et 192
en ont deux, dispersées dans cent intercommunalités : ce n'est pas un accord
local, qui vaudrait pour toutes les petites communes d'un même groupement.
La page prend désormais les sièges dans les résultats du scrutin, qui n'en
portent qu'à partir de mille habitants ; en dessous, elle dit comment les
représentants sont désignés, pas combien ils sont.

### Lot 2 — Le sol et les logements ✔

Trois collectes de plus, chacune lancée seule ou avec l'ingestion :

- **Les terres consommées** (`artificialisation-emettre.ts`, Cerema) : les
  hectares d'espaces naturels, agricoles et forestiers consommés chaque année
  du 1er janvier 2011 au 1er janvier 2025, l'habitat et les activités, la
  décennie 2011-2021 que la loi Climat et résilience prend pour référence et
  ce qui a suivi — les totaux tels que le Cerema les publie, pas des sommes
  d'années arrondies. La page dit que l'objectif de moitié moins en 2021-2031
  est national, décliné par la planification régionale puis le SCoT et le
  PLU : pas un plafond communal. Au Mayet-de-Montagne : 11,09 ha, dont
  10,24 ha de 2011 à 2021 et 0,85 ha depuis. Chaque millésime du Cerema est un
  jeu distinct sur data.gouv ; l'adresse est fixée dans le collecteur.
- **Le radon** (`radon-emettre.ts`, ASN) : la zone de l'arrêté du 27 juin
  2018, sur les communes au 1er janvier 2016, reportée sur les communes
  actuelles par le découpage ; 72 communes fusionnées en réunissent deux et la
  page le dit. Toutes les communes du site sauf quatre, recréées depuis. En
  zone 3, l'information de l'acquéreur ou du locataire est obligatoire
  (article R125-23 du code de l'environnement, vérifié). Au
  Mayet-de-Montagne : zone 3, que GASPAR ne recense pas.
- **Les étiquettes énergétiques** (`dpe-emettre.ts`, ADEME) : l'ADEME agrège
  elle-même, une requête par département, une minute en tout. Des
  diagnostics, pas des logements — faits à la vente ou à la location, parfois
  deux fois pour le même logement —, et seulement depuis la méthode de juillet
  2021. En dessous de vingt diagnostics, la page donne des nombres, pas une
  part. Au Mayet-de-Montagne : 364 diagnostics, 54 % en F ou G, contre 18 %
  dans l'Allier et 10 % en France. Seule l'interdiction de louer un logement
  G depuis 2025 est citée : un projet de loi de 2026 propose d'assouplir la
  suite du calendrier.

### Les rapports de la chambre régionale des comptes — un renvoi, pas une donnée

Demandé le 30 septembre : afficher les recommandations de la Cour des comptes
en regard des chiffres. Ce qui existe en données ouvertes ne le permet pas :
les rapports d'observations des chambres régionales sur data.gouv s'arrêtent
à 2019, les recommandations de la Cour à mai 2018, et le suivi annuel des
recommandations n'existe qu'en PDF, à l'échelle nationale. Afficher ces
rapports anciens comme une liste ferait lire « aucun contrôle » là où il y en
a peut-être eu un depuis. Les pages de commune, d'intercommunalité, de
département et de région renvoient donc à la recherche de leur chambre sur
ccomptes.fr (`src/vues/chambre-comptes.ts`).

ccomptes.fr ne répond ni depuis l'environnement de développement ni depuis
GitHub : le workflow « Sonder des sources » (`scripts/sonder-sources.ts`) le
montre, et c'est lui qu'on relancera pour voir si un plan du site ou un flux
permettrait un jour de lister les rapports par collectivité.

### Le plan « approuvé mais pas encore opposable » ne l'était pas ✔

La relecture de septembre avait signalé le risque (point 2.1). Il était
plus grave que prévu. Au Mayet-de-Montagne, le « PLUi approuvé le 8 janvier
2026 » du Géoportail est le PLUi de la Montagne bourbonnaise de 2022 : le
8 janvier est un arrêté de mise à jour des annexes, qui ajoute le règlement de
publicité modifié à tous les documents de Vichy Communauté. La date
`datappro` est celle de la dernière procédure déposée, pas de l'approbation.
L'état 07, lui, reste sur des centaines de documents de 2022 : il ne dit pas
qu'un document attend ses formalités.

Le site affirmait donc à 4 809 communes qu'un plan ne s'appliquait pas
encore. Il dit maintenant, pour les 12 779 où le Géoportail porte une version
plus récente que l'enquête SuDocUH, que cette version existe, à quelle date,
ce que peut être cette date, et où lire son règlement. Il ne dit plus ce
qui s'applique : c'est la mairie qui le sait. `npx tsx scripts/plu-emettre.ts`
réécrit ces fichiers seul.

### Lot 3 — Ce que l'État et la CAF versent ✔

- **Dotations de l'État** ✔ (`dotations-emettre.ts`) : la dotation globale de
  fonctionnement notifiée à chaque commune de 2018 à 2026, et ses parts la
  dernière année — forfaitaire, solidarité rurale et ses trois fractions,
  solidarité urbaine, péréquation, et outre-mer la dotation d'aménagement.
  Source : les notifications de la DGCL, que l'OFGL republie
  (`dotations-communes`) ; le site de la DGCL, qui les publie aussi, ne se
  prête pas à une collecte. Deux contrôles, comme pour les comptes : la DGF
  est la somme de ses parts, la DSR celle de ses fractions — exacts pour
  toutes les communes en 2018 et en 2026 ; de 2 à 19 communes nouvelles s'en
  écartent en 2021-2023 et en 2025 d'un montant que le fichier ne détaille
  pas, et leurs parts ne sont pas affichées pour ces années-là. La dotation
  des communes nouvelles, créée en 2024, est hors du total « DGF » du
  fichier : la page la donne à part. Au Mayet-de-Montagne : 432 707 € en
  2026, +10 % depuis 2018 ; 603 communes n'en reçoivent plus aucune, Paris
  depuis 2022.
- **CAF** ✔ (`caf-emettre.ts`) : les foyers allocataires de chaque commune en
  décembre, de 2020 à 2024 — au moins une prestation, personnes couvertes, et
  parmi eux RSA, prime d'activité, aide au logement, allocations familiales,
  accueil du jeune enfant. Le portail de la CNAF publie bien à la commune
  (`s_ben_com_f`). Nombres arrondis à 5 par la CAF, que la page dit ; Paris,
  Lyon et Marseille, publiées par arrondissement, sont des sommes d'arrondis
  précédées d'« environ ». Le taux de couverture de l'accueil du jeune enfant
  n'existe qu'au-delà de 10 000 habitants : pas repris. Au Mayet-de-Montagne :
  250 foyers en décembre 2024, dont 35 au RSA et 90 à la prime d'activité.

### Lot 4 — Se déplacer, et la sécurité

- **Transports en commun** — reporté, à faire comme un chantier à part.
  transport.data.gouv.fr (802 jeux, joignable) ne publie aucun fichier national
  des arrêts rattachés aux communes : il faudrait lire les centaines de flux
  GTFS et placer chaque arrêt dans sa commune par sa position, donc disposer
  des contours communaux, que le site n'a pas. Les horaires GTFS restent à
  faire (décision du 30 septembre : 6b, plus tard).
- **Gares SNCF** ✔ (`gares-emettre.ts`, décision 6a) : les gares de voyageurs
  de SNCF Gares & Connexions jointes à leur fréquentation 2024 par code UIC ;
  une gare sans voyageurs est écartée, la liste comptant des gares fermées.
  Une commune sans gare reçoit la plus proche de sa mairie, à vol d'oiseau —
  position prise dans l'annuaire de l'administration, écartée hors de la
  métropole ou au-delà de 80 km (7 fiches de mairie fausses, à trois mille
  kilomètres). Deux limites dites sur la page : ce ne sont que les gares de
  SNCF — les gares du RER A exploitées par la RATP (Rueil-Malmaison, Chatou,
  Saint-Maur) et les Chemins de fer de Provence n'y sont pas, d'où aucune
  « gare la plus proche » en Île-de-France, en Corse et outre-mer —, et rien
  n'y dit la desserte. 2 766 gares dans 2 432 communes ; au Mayet-de-Montagne,
  pas de gare, Vichy à 19,3 km.
- **Accidents de la route** ✔ (`accidents-emettre.ts`) : les accidents
  corporels, les tués et les blessés sur les cinq dernières années publiées
  (2020-2024), d'après les bases de l'ONISR — une année seule, dans une petite
  commune, dirait surtout le hasard. Blessés hospitalisés et légers réunis. Les
  fichiers changent de nom et, en 2022, de nom de colonne (`Accident_Id`) : la
  collecte s'y attend. Au total 268 751 accidents et 16 372 tués ; au
  Mayet-de-Montagne, 4 accidents, 5 blessés, aucun tué.
- **Défibrillateurs** ✔ (`dae-emettre.ts`) : Géo'DAE, fiches validées,
  appareils en fonctionnement, hors mobiles et doublons signalés — l'état
  « actif » n'est pas exigé, la moitié des fiches le laissent vide. Ni nom
  d'appareil ni exploitant, qui peut être une personne : la page renvoie à la
  carte nationale. La déclaration est obligatoire pour tout exploitant (décret
  du 27 décembre 2018, arrêté du 29 octobre 2019, vérifiés). 138 074 appareils
  dans 17 044 communes ; au Mayet-de-Montagne, 4 dont 1 à l'extérieur — deux
  au même supermarché, probablement le même appareil déclaré deux fois.

### Lot 5 — Énergie produite et patrimoine

- **Production d'électricité renouvelable** par commune et par filière,
  d'après l'Agence ORE (à sonder, même portail que la consommation).
- **Monuments historiques** (immeubles protégés, jeu du ministère de la
  culture sur data.gouv) **et équipements culturels** (à sonder).

### Lot 6 — Outils

- **Comparer deux communes**, bloc par bloc, sur une page qui ne calcule rien
  de plus que les pages qu'elle rapproche.
- **Couverture mobile** — à retenter : aucune donnée communale nationale
  trouvée aux deux premiers sondages ; l'Arcep publie une « base de
  population » dont il faudra voir si elle porte la couverture par commune.

## Phase 3 — Élargir

- **Rouages économiques** : métiers, filières, chaînes de valeur. Même modèle,
  autres nœuds.
- **Rouages de l'influence** (prebunking), une fois la neutralité installée, et
  sous la règle absolue : des mécanismes, jamais des personnes.

## Phase 4 — Les outils communautaires

Recherche dans les délibérations · lecture assistée du PLU · recherche de la
procédure applicable. Adossés au graphe, jamais construits isolément. Voir
`07-risques.md` avant la première ligne de code.

## Ce qu'on ne fait pas

- Pas d'articles. Jamais. Le plafond de 280 signes sur les résumés est là pour
  ça, et il est appliqué par le schéma.
- Pas de comptes utilisateurs avant la phase 4.
- Pas de commentaires : coût de modération sans rapport avec la valeur.
- Pas de couverture nationale exhaustive : mieux vaut un réseau dense et juste
  qu'un annuaire creux.
