# 06 — Choix techniques

> Statut : **engagé** pour la phase 1. Les points listés en fin de document
> restent à trancher.

## Principe

Le contenu est l'actif du projet, pas le code. Les choix ci-dessous privilégient
donc : contenu en fichiers versionnés, site statique, dépendances minimales,
possibilité de tout reprendre ailleurs.

## Recommandation

| Besoin | Choix retenu | Pourquoi |
|---|---|---|
| Site | **Astro**, sortie statique | contenu en fichiers, validation de schéma intégrée (collections + Zod), zéro JS par défaut, excellent référencement |
| Contenu | **YAML** (données) + **Markdown** (prose) dans le dépôt | relisible, diffable, contribuable par pull request, exportable |
| Validation | schémas **Zod** + contrôles maison en CI | la ligne éditoriale devient exécutable (`03-modele-de-donnees.md`) |
| Schémas au build | SVG généré, code maison | lisible sans JS, indexable, imprimable, partageable |
| Explorateur | SVG construit côté client, **sans bibliothèque** | la navigation *est* le produit ; d3-force a été écarté (voir plus bas) |
| Couleurs | palette validée, 3 teintes porteuses d'identité | vérifiée au validateur, pas à l'œil — voir `04-graphiques.md` |
| Recherche | **Pagefind** (index statique) | pas de serveur, suffisant jusqu'à plusieurs milliers de pages — *pas encore branché* |
| Hébergement | Cloudflare Pages ou Netlify | statique, gratuit à cette échelle, déploiement sur push |
| Analytique | Plausible ou Umami, sans cookie | cohérent avec le propos du site |
| Phase 4 | **Supabase** (Postgres + pgvector + stockage) | seul moment où un backend devient nécessaire |

## Alternatives écartées, et pourquoi

- **WordPress / un CMS classique** : contenu prisonnier d'une base, pas de
  validation structurelle, schémas ingérables. Le modèle de données est le cœur
  du projet, un CMS de blog le rend impossible.
- **Next.js / application rendue côté client** : complexité et coût
  d'exploitation sans contrepartie pour un site de contenu.
- **Notion / Airtable comme source** : confortable au début, verrouillant
  ensuite, et incompatible avec la contribution externe par pull request.
- **Mermaid en rendu final** : pratique pour la documentation, insuffisant en
  typographie, accessibilité et responsive pour la production.
- **d3-force / un moteur de graphe** : une disposition par forces est jolie en
  démonstration et mauvaise ici. Elle est non déterministe — la même donnée
  donne deux images différentes, donc rien n'est citable ni comparable — et elle
  ignore l'information la plus utile de ce réseau : l'échelon. Nos deux
  dispositions sont calculées (colonnes par échelon, puis radiale), en une
  centaine de lignes, sans dépendance.

## Une exception assumée au « pas de JavaScript »

La phase 0 avait tranché pour un site statique sans JS. Ce choix valait pour un
site de contenu ; ici la navigation dans le graphe **est** le produit, et elle
demande du code côté client.

Le repli reste complet : chaque nœud a sa page rendue au build, avec son schéma
de voisinage en SVG, ses relations en liste et ses liens sortants. La carte a
son équivalent textuel dans un `<noscript>`. Les moteurs de recherche et les
navigateurs sans JS voient tout le réseau.

## Points à trancher

1. **Licence.** Proposition : contenu en **CC BY-SA 4.0** (compatible avec la
   réutilisation depuis et vers Wikipédia), code en **MIT**. À confirmer : une
   licence *share-alike* impose la réciprocité aux réutilisateurs, ce qui est
   sans doute souhaitable ici, mais freine certains usages commerciaux (presse).
2. **Dépôt public ou privé.** Public dès maintenant permet la contribution et
   la crédibilité ; privé jusqu'à la phase 1 évite d'exposer des brouillons non
   vérifiés. Recommandation : **public dès la phase 1 publiée**.
3. **Langue.** Français uniquement au départ ; le modèle de données est agnostique
   mais le contenu est intrinsèquement lié au droit français.
4. **Nom des URL.** Stables et lisibles : `/rouages/permis-de-construire`. Une
   URL publiée ne change jamais (redirection sinon).

## Structure du dépôt

```
contenu/                  tout le YAML, à n'importe quelle profondeur
  sources.yaml            les pages de référence — le contenu du site
  acteurs.yaml
  competences.yaml
  flux.yaml
  processus/*.yaml        un fichier par processus (étapes + leviers)
src/
  modele/     schemas.ts (Zod) · graphe.ts (chargement, intégrité) · reseau.ts (nœuds et arêtes)
  client/     explorateur.ts — la carte et le focus
  vues/       voisinage, chronologie, fenêtres d'action — SVG au build
  pages/      index (l'explorateur) · n/[id] (une page par nœud) · methode
scripts/valider.ts        la ligne éditoriale, exécutable
docs/                     décisions et cadrage
```

Un fichier par type d'entité : le réseau se lit et se relit par catégorie, et
les processus, qui portent beaucoup plus de détail, restent isolés.

## Dépendances du rafraîchissement des données

`npm run territoires` — et lui seul — a besoin de&nbsp;:

| Dépendance | Pourquoi |
|---|---|
| `unzip` (système) | l'export national BANATIC : 1,4 Go de XML, lu en flux |
| `7zip-min` | l'extraction SISPEA n'existe qu'en archive 7z |
| `xlsx` (SheetJS) | et cette archive ne contient qu'un classeur `.xls` |
| `@etalab/decoupage-administratif` | le découpage communal, épinglé et reproductible |

### Le cache d'ingestion

`npm run territoires -- --cache` réutilise les gros fichiers déjà rapatriés :
l'export BANATIC (77 Mo) et le référentiel FINESS (244 Mo). Le gain n'est pas
la vitesse — le temps part surtout dans les exports OFGL et le parcours des
1,4 Go de XML — mais la **résilience** : la connexion a lâché en pleine session
sur les 244 Mo de FINESS, et sans cache chaque reprise repartait de zéro.

Deux garde-fous, parce qu'un cache silencieusement faux est pire que pas de
cache :

- **Écriture dans un fichier temporaire, renommé à la fin.** Un transfert coupé
  en route laissait sinon un fichier tronqué que le passage suivant prenait
  pour un cache valide, et l'ingestion produisait des données incomplètes sans
  rien signaler.
- **L'URL d'origine est déposée à côté du fichier.** FINESS est épinglé à une
  version datée : le jour où la veille en signale une plus récente et qu'on
  change l'URL, le cache porterait toujours le même nom et `--cache` servirait
  l'ancien millésime indéfiniment. Comparer l'URL est le seul moyen de s'en
  apercevoir.

**L'ingestion est reproductible.** Les API ne garantissent pas l'ordre de leurs
enregistrements : deux passages sur les mêmes données produisaient une centaine
de fichiers départementaux « modifiés » où rien n'avait bougé. Les services
sont donc triés avant écriture. Un diff qui bruit ainsi finit par ne plus être
lu — et c'est précisément là qu'un vrai changement passe inaperçu.

**SheetJS est installé depuis le dépôt de son éditeur**, pas depuis le registre
npm public : le paquet `xlsx` qui s'y trouve est abandonné à la version 0.18.5 et
porte des vulnérabilités de sévérité haute sans correctif. Une dépendance
durablement vulnérable rendrait `npm audit` rouge en permanence, et un audit
toujours rouge ne signale plus rien.

Le site lui-même n'a aucune de ces dépendances : il lit des fichiers versionnés.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | serveur local |
| `npm run valider` | structure, références, règles éditoriales |
| `npm run valider -- --liens` | vérifie en plus que les URL des sources répondent |
| `npm run fraicheur` | échoue si une fiche a dépassé sa date de revérification |
| `npm run build` | valide puis génère le site statique |
| `npm run veille` | contrôle que chaque source est vivante et à jour |
| `npm run veille -- --decouvrir` | cherche en plus ce qui est apparu en open data |

## La veille

Le site ne se périme pas par son code mais par ses sources. En une journée de
travail, trois ruptures ont été rencontrées : Hub'Eau figée à 2018, BANATIC qui
refait son site et perd son adresse de téléchargement, l'export SISPEA dont
l'URL change de forme selon le millésime. Aucune n'a produit d'alerte — toutes
ont été découvertes à la main, par hasard.

Chaque source déclare donc, dans `contenu/veille.yaml`, **le signal le moins
coûteux qui soit réellement actionnable**. Un ping qui répond « 200 » pendant
que la donnée dort depuis huit ans ne surveille rien : c'est le millésime qu'on
interroge, pas le serveur.

| Signal | Ce qu'il détecte |
|---|---|
| `banatic-competences` | un code de compétence dont le contenu dépend a disparu du référentiel |
| `ofgl-millesime` | un exercice plus récent est publié, ou un agrégat que l'ingestion utilise a disparu |
| `sispea-millesime` | une extraction annuelle plus récente est parue |
| `paquet-npm` | le découpage administratif a bougé (fusions de communes) |
| `opendatasoft-total` | un référentiel a perdu ses lignes, ou changé d'identifiant |
| `datagouv-ressource` | une nouvelle version d'un fichier épinglé par URL datée est parue |
| `disponibilite` | le minimum, quand la source n'expose rien de mieux |

`veille/etat.json` est versionné : c'est lui qui permet de dire « ça a changé
depuis la dernière fois » plutôt que de tout redécouvrir. Pour les sources qui
n'exposent aucun millésime, une empreinte du contenu joue ce rôle.

**La découverte** (`--decouvrir`) interroge data.gouv.fr sur les mots-clés
déclarés. Le tri y est le vrai travail : data.gouv est très majoritairement
alimenté par des collectivités qui publient leur propre territoire, et sur
« délibérations » les premiers résultats sont une commune après l'autre. Trois
marqueurs permettent d'écarter le local — les zones déclarées, l'emprise
géographique (un jeu départemental tient dans 1,6° de longitude là où la
métropole en fait 14,8), et le badge du producteur. Aucun ne permet de conclure
« national » à coup sûr, et le badge ment parfois : la Région Île-de-France est
badgée `public-service` quand la Région des Pays de la Loire est badgée
`local-authority`. Ce qui reste indécidable est donc annoncé comme tel plutôt
que maquillé en certitude — la même règle à trois états que pour les
compétences territoriales.

Le workflow `veille.yml` passe une fois par semaine, tient **une seule issue**
à jour tant qu'il y a quelque chose à regarder, et la referme d'elle-même quand
tout est revenu au vert. Le script sort en `2` dans ce cas et en `1` s'il tombe
en panne lui-même : sans cette distinction, un script cassé ouvrirait une issue
rassurante.

## Le déploiement

Oui, le FTP vers o2switch fonctionne — à trois conditions, dont la première
est celle qui fait perdre une soirée.

**Cloudflare ne relaie que HTTP et HTTPS.** Un enregistrement proxifié (nuage
orange) ne transporte pas de FTP : la connexion part vers Cloudflare, qui n'a
rien à en faire. Le dépôt doit viser le serveur directement — le nom de machine
o2switch, ou un enregistrement laissé en « DNS only » (nuage gris). L'échec ne
dit pas pourquoi : il expire, simplement.

**FTPS explicite, jamais FTP simple.** o2switch le propose, et sans lui le mot
de passe du compte d'hébergement traverse le réseau en clair à chaque
publication. Le certificat est vérifié : un FTPS qui accepte n'importe quel
certificat ne protège de rien.

**Le cache Cloudflare survit au dépôt.** Sans purge, la mise en ligne reste
invisible pendant des heures. La purge vaut aussi pour `_astro/`, dont les
fichiers n'ont plus d'empreinte dans leur nom (ci-dessous).

### N'envoyer que ce qui a changé

`lftp mirror` compare la taille et la date. Sur une machine d'intégration
neuve, chaque fichier du build est daté du jour : les 77 000 fichiers
repartaient à chaque publication, un par un, y compris les 33 000 flux
identiques à l'octet près. Quatre heures d'envoi, et deux échecs de suite en
septembre 2026.

Le déploiement dépose donc à la racine un **manifeste** — l'empreinte SHA-256
de chaque fichier du dernier envoi réussi, sous `.manifeste`, que le
`.htaccess` refuse de servir comme tout fichier caché. L'envoi suivant le
récupère, compare, n'envoie que les fichiers nouveaux ou modifiés, efface ceux
qui ont disparu, et ne dépose le nouveau manifeste qu'en dernier : un envoi
interrompu laisse l'ancien en place, et le suivant renverra ce qui manque. Le
détail est dans `scripts/manifeste.ts`.

Deux conditions pour que la comparaison serve à quelque chose :

- **un build déterministe.** Deux builds du même contenu donnent les mêmes
  octets — vérifié sur 8 630 fichiers ;
- **des noms de fichiers sans empreinte dans `_astro/`**
  (`integrations/noms-fixes.mjs`). Avec elle, retoucher une règle de CSS
  changeait le nom de la feuille, donc la balise qui la cite dans les 35 000
  pages. Désormais, un changement de CSS seul modifie un fichier, et un seul.
  Ces fichiers ne sont plus mis en cache un an : le navigateur les revalide à
  chaque visite, pour un 304 de quelques octets.

`dist/` ne contient plus non plus les données que seul le build lit
(`integrations/elaguer.mjs`) : le navigateur ne lit, par département, que les
groupements et le prix de l'eau. 1 741 fichiers de moins à chaque envoi
complet.

Sans manifeste sur le serveur — au premier envoi de ce mode —, la comparaison
se fait par la taille seule : un fichier de même taille est tenu pour
identique. C'est vrai des flux et des données, que rien ne modifie entre deux
ingestions, et le manifeste déposé à la fin rend le pari inutile ensuite.
L'entrée **complet** de `workflow_dispatch` revient à la comparaison taille et
date, c'est-à-dire à tout renvoyer.

### Par lots, quand beaucoup de fichiers changent

Un bloc de plus sur la page de commune modifie trente-cinq mille fichiers, et
le FTP coûte une connexion de données par fichier : deux à trois heures et
demie par publication.

L'envoi part par lots de quatre mille fichiers (`manifeste.ts lots`), et
le manifeste de ce qui est en ligne est déposé après chaque lot. GitHub arrête
un job au bout de six heures : passé cinq heures dix, aucun lot n'est plus
commencé, l'étape échoue en le disant, sans rien effacer ni déposer le
manifeste final, et le déploiement suivant reprend où celui-ci s'est arrêté.

### Le garde-fou

`mirror --delete` est ce qui garde le serveur propre : sans lui, une page
retirée du réseau resterait en ligne indéfiniment. C'est aussi une commande
destructrice si la racine désigne le mauvais dossier — le répertoire personnel
d'un compte cPanel contient le courrier et la configuration.

Ce qui appartient à l'hébergement est exclu du miroir, et donc de la
suppression : `.ftpquota`, que le serveur FTP tient lui-même et refuse qu'on
efface — `--delete` s'y cassait en toute fin d'envoi, et c'est ce qui a fait
échouer trois déploiements de suite en septembre 2026 —, `.well-known/`, qui
sert au renouvellement du certificat, et `cgi-bin/`, que cPanel crée.

Le déploiement ne supprime donc rien tant qu'il n'a pas trouvé le marqueur
`.rouages` à la racine visée. Le premier envoi le dépose ; les suivants le
trouvent et s'autorisent alors la suppression. Un chemin erroné ne peut ainsi
détruire quoi que ce soit : il se contente d'ajouter.

### Secrets attendus

| Secret | Contenu |
|---|---|
| `FTP_HOTE` | le serveur **non proxifié** — sans lui, le job ne fait rien et le dit |
| `FTP_UTILISATEUR` · `FTP_MOTDEPASSE` | le compte FTP |
| `FTP_RACINE` | la racine du site, `public_html` par défaut |
| `CLOUDFLARE_ZONE` · `CLOUDFLARE_JETON` | facultatifs : sans eux, le dépôt réussit mais avertit que le cache n'est pas purgé |

`workflow_dispatch` accepte une entrée **simulation** qui exécute le miroir en
`--dry-run` : de quoi vérifier ce qui serait écrit avant de l'écrire.

### Ce que fait `.htaccess`

Astro est configuré en `format: 'file'` : il écrit `n/abf.html` et pointe vers
`/n/abf`. C'est au serveur d'origine de faire le rapprochement. Le fichier est
dans `public/`, donc copié tel quel à la racine du site.

Il a été vérifié sous Apache 2.4, page par page : URL sans extension servie
directement, `.html` et barre finale redirigés en 301 vers l'adresse
canonique, `/index.html` renvoyé vers `/`, adresse inconnue sur le 404 du
site, fichiers cachés refusés. Les en-têtes de cache suivent la nature du
fichier — revalidation systématique pour le HTML et pour `_astro/`, une heure
pour les données territoriales — et la compression ramène
un département de 24,8 ko à 8,1 ko.

Il ne force **ni HTTPS ni le domaine canonique** : Cloudflare est devant et
s'en charge. Le faire aussi à l'origine crée une boucle de redirection dès que
Cloudflare passe en mode SSL « flexible ».

## La localisation des services publics

Trois référentiels nationaux, parce qu'aucun ne couvre l'ensemble : l'Annuaire
de l'administration (France services, CCAS, SDIS), l'Annuaire de l'éducation
(écoles, collèges, lycées) et le référentiel FINESS (établissements de santé,
et ceux qui ont un service d'urgences). 83 719 implantations dans 22 958
communes, écrites par département à côté des données d'eau et de finances, et
lues au build pour écrire la page de chaque commune.

Le reste de la page dit **qui décide** ; ce bloc dit **où l'on va**. Ce sont
deux questions différentes, et la seconde est souvent la première qu'on se
pose.

### Trois pièges, et ce qu'on en fait

**Les casernes de pompiers n'existent pas en open data national.** L'annuaire
ne connaît que les 98 états-majors départementaux ; les centres de secours ne
sont publiés que par quelques SDIS pour leur propre territoire — Marseille,
l'Hérault. On nomme donc le SDIS compétent, ce qui est vrai et utile, en disant
qu'on ne situe pas la caserne la plus proche. C'est exactement le genre de jeu
départemental que le tri de la découverte écarte par ailleurs.

**Paris, Lyon et Marseille n'existent pas dans ces référentiels.** Une école
parisienne est déposée sous le code de son arrondissement (75112), jamais sous
celui de la commune (75056). Sans repli, les trois plus grandes villes de
France apparaissaient dépourvues d'école et d'hôpital — c'est ce qu'elles
faisaient au premier passage. Le rattachement vient du découpage administratif
lui-même, qui publie la commune de chaque arrondissement, plutôt que de plages
de codes écrites à la main : 2 790 implantations récupérées.

**Une France services ne déclare pas son ressort.** Le champ qui pourrait le
dire ne contient que la commune d'implantation. Pour une commune qui n'en
accueille pas, on regarde donc son intercommunalité — un rattachement réel, que
le site résout déjà, là où une distance à vol d'oiseau ne dirait que la
géométrie. Le raccourci ne tient que pour une intercommunalité de taille
humaine : la Métropole du Grand Paris en compte 131 communes, et y énumérer
quatre-vingts France services n'aidait personne. Au-delà de trois communes, on
donne le nombre sans la liste.

Enfin Le Mans compte 87 écoles : les nommer toutes d'affilée, c'est n'en
montrer aucune. Au-delà d'une poignée, la liste se replie derrière
son décompte — un `details` natif, qui marche sans script et que les lecteurs
d'écran annoncent déjà. Les urgences, elles, remontent toujours en tête de leur
famille : c'est l'établissement qu'on cherche quand on cherche vite.

## Ce qui a changé : les comptes sur huit exercices

Un chiffre isolé ne se discute pas. « 308 € de dotation par habitant » n'appelle
aucune question ; « +57 % depuis 2018 » en appelle une, et c'est de là que part
toute conversation avec un élu.

Chaque repère financier est donc collecté sur toute la profondeur que publie
l'OFGL — 2018 à 2025, huit exercices complets — et restitué en courbe minuscule
sous le montant, avec la variation entre le premier et le dernier exercice
renseignés. Un seul export par repère, tous exercices confondus : huit requêtes
séparées ramèneraient les mêmes lignes en huit fois plus d'allers-retours.
`annee_join` est un champ **texte** à l'OFGL, et une comparaison numérique y
renvoie une erreur 400 — les exercices voulus sont donc énumérés.

Trois précautions, qui sont la même que partout ailleurs sur ce site : ne pas
conclure plus que la donnée ne permet.

- **Moins de trois points, pas de pourcentage.** Deux valeurs isolées à huit ans
  d'écart peuvent tenir à un investissement exceptionnel plutôt qu'à une
  tendance.
- **Une série qui part de zéro n'a pas de variation.** « +∞ % » ne veut rien
  dire.
- **Aucune couleur selon le sens.** Une dette qui baisse et un investissement
  qui baisse ne se lisent pas de la même façon, et ce n'est pas au site d'en
  juger. La courbe montre, elle ne commente pas.

L'échelle de chaque courbe part de zéro plutôt que de cadrer sur les extrêmes :
une dotation qui passe de 300 à 280 € doit se voir comme une inflexion, pas
comme un effondrement.

### Ce qu'on ne peut pas tracer, et pourquoi

La demande initiale était un outil de traçage des **décisions** — pourquoi une
classe ferme, pourquoi des lits d'hôpital disparaissent. Cette partie-là ne se
fera pas, et il vaut mieux le dire que de la simuler.

| Ce qu'on voulait | Ce qui existe en open data national |
|---|---|
| Subventions de l'État aux communes (DETR, DSIL) | rien — un jeu « équipements sportifs » de 2015, et le contrat d'une agglomération |
| Subventions aux associations | rien de national : chaque commune publie les siennes, ou non |
| Effectifs par école, année par année | le jeu national est marqué obsolète depuis 2016 ; seule Nantes publie les siens |
| Le motif d'une décision | nulle part, par construction : il n'est consigné dans aucun registre ouvert |

Ce que le site peut faire, et fait : montrer **ce qui a changé** dans les
comptes, et nommer **qui décide** — c'est déjà de quoi savoir à qui poser la
question. Le reste relèverait des délibérations, qui ne sont pas en données
ouvertes exploitables : c'est la phase 4, et c'est un autre projet.

## La navigation

**Ouvrir un nœud est une navigation, pas un changement d'affichage.** Elle
empile une entrée d'historique, et le bouton Retour du navigateur y ramène.
Auparavant tout passait par `replaceState` sans écouteur `popstate` : parcourir
dix nœuds n'en laissait aucune trace, le Retour faisait sortir du site, et
coller un lien `#id` dans une page déjà ouverte ne redessinait rien — le
fragment changeait, l'écran non.

La famille dépliée d'un voisinage replié, elle, reste **hors de l'URL** : c'est
un état d'affichage, pas un endroit où l'on se trouve, et l'empiler rendrait le
Retour imprévisible. Échap et « Vue d'ensemble » remontent d'abord aux grappes,
puis à la carte — un cran à la fois.

## Le téléphone

L'interface occupait 290 px sur un écran de 844, soit **34 %**, contre 11 % sur
ordinateur : la carte n'avait plus la place d'être une carte. Trois économies
sans rien retirer — la signature disparaît (le nom du site la porte déjà), la
légende descend en dernier pour que « chez moi » et les commandes de zoom
partagent une ligne, et la carte prend ce qui reste du premier écran au lieu
d'une fraction fixe. 290 px d'interface deviennent 242, et la carte passe de
506 à 596 px.

`dvh` plutôt que `vh` : la barre d'adresse des navigateurs mobiles se rétracte,
et `vh` l'ignore.

**Une mise en garde de méthode.** Les premières captures de cette page, prises
avec `chrome --headless --screenshot`, montraient du texte coupé et une
navigation qui débordait. J'ai failli corriger un débordement horizontal qui
n'existait pas : mesuré avec un vrai viewport, `scrollWidth` vaut exactement la
largeur de la fenêtre sur toutes les pages. Le drapeau `--window-size` n'impose
pas le viewport CSS qu'on croit. Pour juger d'un rendu, mesurer dans la page,
pas regarder une capture.
