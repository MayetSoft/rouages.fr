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
naturels de l'INPN et les contours des communes d'Admin Express, lus sur la
Géoplateforme par pages (350 et 420 Mo, mis en cache pour la journée). `--cache` les
réutilise, et sans lui il faut compter le téléchargement en plus.

La réingestion complète se lance aussi en intégration continue : workflow
« Réingestion des territoires » (onglet Actions, à la main). Il tourne sur le
réseau de GitHub, qui joint les sources sans tunnel, refait le contrôle de la
CI et ouvre une PR avec les fichiers réécrits et la liste des collectes en
échec. C'est la voie à préférer pour tout rafraîchir. Au lancement, la machine
« auto-hebergee » l'exécute sur le runner de Rouages, qui garde le cache des
gros fichiers six jours (`ROUAGES_CACHE_JOURS`) : voir
`docs/08-runner-auto-heberge.md`.

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

Géorisques et le service de téléchargement du BRGM (`mapsref.brgm.fr`)
refusent cet environnement **et les machines de GitHub** : « Request
Rejected », connexions coupées. Ils répondent depuis l'hébergement français
(constaté le 8 octobre 2026). `scripts/georisques-emettre.ts` ne produit donc
ses fichiers que lancé de là ; partout ailleurs il échoue et laisse les
précédents en place.

L'API de Kohesio (`kohesio.ec.europa.eu/api`) refuse les adresses des
hébergeurs : la sortie directe d'ici (curl comme Node, 403 d'un répartiteur
AWS) **et les machines de GitHub** (réingestion du 9 octobre 2026). Elle
répond par le mandataire de l'environnement : lancer
`scripts/europe-emettre.ts` avec `NODE_USE_ENV_PROXY=1`, puis committer les
`dep/XX-europe21.json`. La période 2014-2020, lue sur cohesiondata, passe
partout.

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
4. **Le retrait est possible.** Une opposition reçue par `/signaler` est
   appliquée à l'ingestion suivante, et `/mentions` dit ce qui est collecté.

Les empreintes de conseillers sans fonction reposent sur le secret privé
`ROUAGES_RETRAITS_SECRET` (au moins 32 octets aléatoires), configuré dans GitHub
Actions et dans l'environnement de l'ingestion locale. Ne jamais le publier ni
le changer tant qu'une empreinte correspondante reste dans `retraits.yaml`.

Ce qui est autorisé à ce jour :

- **les membres du conseil municipal** — maire, adjoints, conseillers —
  d'après le répertoire national des élus : nom, prénom, fonction, date de
  prise de fonction, et le siège au conseil communautaire, rapproché sur la
  commune, le nom, le prénom et la date de naissance complète. Le sexe et la
  profession restent des agrégats ;
- **les élus des autres échelons** — conseillers départementaux par canton,
  conseillers régionaux par section départementale, députés par
  circonscription, sénateurs par département — d'après le même répertoire :
  nom, prénom, fonction, année de naissance, sur la page du département et de
  la région ;
- **la date de naissance**, quand une source la donne, au mois et à l'année
  seulement, comme l'INPI la diffuse pour les dirigeants. Pour les élus,
  **l'année seule** : elle dit la génération, c'est ce qui sert. Le répertoire
  des élus publie le jour : on ne le reprend pas ;
- **les candidats et les listes aux élections, avec leur nuance politique**,
  telle que le ministère de l'Intérieur l'attribue et sous son libellé
  officiel, sans commentaire, et **les têtes de liste** d'après le fichier des
  candidatures. Un candidat a choisi de se présenter ; la nuance est un acte
  public de l'administration, et l'élu a son droit de rectification ;
- **les titulaires des marchés publics**, d'après le SIRET que donnent les
  données essentielles et le nom que publie SIRENE : sous le marché obtenu,
  avec un lien vers la fiche de l'annuaire des entreprises. Mêmes exclusions
  de diffusion que pour les entrepreneurs individuels ; les oppositions vont dans
  `retraits.yaml` ;
- **les exploitants des sites et sols pollués et des installations classées**,
  d'après Géorisques et le BRGM, sous le site ou l'installation, avec le lien
  vers sa fiche : le nom tel que le registre le publie, anciennes entreprises
  comprises, pour garder la trace historique — sauf un entrepreneur
  individuel en diffusion partielle à SIRENE et les retraits de
  `retraits.yaml` (par SIREN, ou par code du site sans SIRET). Un site
  recensé à la CASIAS n'est pas présenté comme un sol pollué ;
- **les dirigeants déclarés au répertoire des représentants d'intérêts** de
  la HATVP : nom, prénom, fonction, l'organisation et le lien vers sa fiche.
  Le registre est publié pour dire qui cherche à influencer la décision
  publique ;
- **les déclarations des élus à la HATVP** : pour un élu déjà nommé, le
  type de chaque déclaration, son statut, sa date et le lien vers sa page
  nominative ; et le **contenu de sa dernière déclaration d'intérêts
  publiée**, tel quel — activités professionnelles et de conseil, mandats,
  participations aux organes dirigeants, participations financières,
  fonctions bénévoles, activité du conjoint, collaborateurs, commentaires et
  observations, avec les montants publiés — tout ce que la HATVP publie, et
  seulement cela : ce qu'elle masque (« [Données non publiées] », dont le nom
  du conjoint) reste masqué. Les déclarations publiées sont librement réutilisables
  (délibération HATVP n° 2017-111, article 7), sans altération ni
  dénaturation, avec leur source et leur date (article L. 322-1 du code des
  relations entre le public et l'administration). **Jamais une déclaration de
  patrimoine d'élu local** : la loi ne la rend pas publique, et sa divulgation
  est un délit (article 26 de la loi du 11 octobre 2013) ;
- **le rapprochement par le nom** entre la déclaration d'intérêts d'un élu
  et les titulaires des marchés des collectivités où il siège — décision du
  10 octobre 2026 : activités, organes dirigeants et participations
  financières de l'élu, jamais celles du conjoint ni d'un collaborateur ; le
  nom plié, comparé à l'identique ; affiché sous l'élu et sous le marché,
  avec la phrase qui dit qu'il repose sur le nom seul et ne dit pas si l'élu
  a pris part à la décision. Retrait par la page nominative et le SIREN,
  sous `rapprochements` dans `retraits.yaml`. Voir `docs/07-risques.md` ;
- **les bénéficiaires des aides de la PAC** (FEAGA et FEADER), d'après la
  liste que le ministère de l'Agriculture publie en application de l'article
  98 du règlement (UE) 2021/2116 — décision du 8 octobre 2026 : la
  dénomination telle que publiée, la commune, le code postal, les montants
  par mesure et le total, avec l'exercice et le lien vers le module de
  l'ASP. Un bénéficiaire que le registre anonymise (1 250 € ou moins) reste
  anonyme. **Pas plus longtemps que le registre** : deux ans à compter de la
  première publication, puis les totaux par commune seulement. Faute de
  SIREN, les oppositions s'inscrivent dans `retraits.yaml` par la commune et
  l'empreinte de la dénomination. Voir `docs/07-risques.md` ;
- **les entrepreneurs individuels** d'après SIRENE et le BODACC : le nom tel
  que publié, l'activité, la commune, le lien vers la fiche ou l'annonce.
  Jamais un entrepreneur en **diffusion partielle** au répertoire SIRENE — il
  a exercé son droit d'opposition (article R123-232-1 du code de commerce) :
  le statut se relit à chaque ingestion, et un établissement non diffusible
  est compté, pas nommé ;
- **la situation des titulaires des marchés**, entrepreneurs individuels
  compris (décision du 8 octobre 2026, justifiée dans `docs/07-risques.md`) :
  le dernier jugement de procédure collective publié au BODACC dans les
  vingt-quatre derniers mois — sa nature telle que publiée, sa date, le lien
  vers l'annonce — et la cessation dite par SIRENE. Ni avis de dépôt, ni
  complément du jugement, ni qualificatif. Sur la page de commune, les
  annonces de procédures collectives restent pour l'instant comptées.

Ce qui reste exclu : les particuliers cités dans les délibérations, les
dirigeants d'associations hors du répertoire de la HATVP — aucun registre
public ne les nomme —, et toute opinion du site. **Le site n'a pas d'opinion :
il montre des recoupements de données sourcées**, et chaque recoupement dit
sur quels champs il repose.
