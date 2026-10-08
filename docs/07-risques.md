# 07 — Risques, limites et garde-fous

> Statut : à relire avant chaque changement de phase.

## 1. Péremption du contenu — le risque n°1

Le droit et les compétences changent en permanence (transferts commune/EPCI,
réformes, jurisprudence). Un site d'explication institutionnelle non entretenu
devient **activement nuisible** : il fait rater des délais.

**Garde-fous** : `verifie_le` et `perime_apres_mois` obligatoires ; mention
automatique passé la date ; contrôle « fraîcheur » et vérification des liens une
fois par semaine en intégration continue ; plafond volontaire du nombre de nœuds
selon la capacité réelle de relecture.

Le format graphe atténue ce risque plus qu'un format d'articles : un nœud porte
une phrase et des liens, pas trois écrans de développements à réviser. Ce qui
périme vraiment, ce sont les **attributions de compétences** — et elles sont
concentrées dans un seul fichier.

## 2. Exactitude juridique

Nous ne sommes ni juristes ni administration. Une erreur sur un délai de recours
a des conséquences concrètes pour un usager.

**Garde-fous** : ne jamais formuler de conseil personnalisé ; toujours renvoyer
au texte et à l'interlocuteur compétent ; afficher le niveau de `confiance` ;
pour les procédures à enjeu, faire relire par un praticien avant publication.

Le parti pris « on ne rédige pas » est aussi une protection : moins nous
affirmons, moins nous pouvons nous tromper. Le lien vers Légifrance ne périme
pas de la même façon qu'un paragraphe d'explication.

## 3. Neutralité perçue et famille « influence »

Le prebunking peut faire basculer la perception du site de « ressource » à
« militant », et rétroactivement discréditer les familles A à C.

**Garde-fous** : mécanismes uniquement, **aucun nom de personne physique dans
le contenu** — le graphe de `contenu/` ; la règle est vérifiée automatiquement,
sur tout `contenu/` et non plus seulement sur cette famille. Les données
territoriales, elles, nomment depuis le 1er octobre 2026 les catégories que
`CLAUDE.md` énumère (« Les noms dans les données »), chacune justifiée plus bas
avant sa collecte ; sources académiques ou cas documentés
publiquement ; publication seulement après la phase 2 ; séparation visuelle
claire de cette famille.

### La frontière, depuis que le site nomme les maires

*Écrit quand seuls les maires étaient nommés. La frontière entre le graphe et
les données tient toujours ; la liste de ce qui est collecté s'est étendue
depuis — conseillers, année de naissance, titulaires, entrepreneurs
individuels, déclarations à la HATVP —, chaque fois par une section datée
ci-dessous, et `CLAUDE.md` en tient la liste à jour.*

La règle n'a pas été levée, elle a été **précisée** — et en le devenant, elle
s'est durcie plutôt qu'assouplie.

- Le **graphe** décrit des fonctions. Le nœud est « le maire », « le préfet »,
  jamais leur titulaire. Rien n'a changé de ce côté.
- Le **nom** du titulaire est une **donnée territoriale**, produite depuis le
  répertoire national des élus et affichée dans le bloc « chez vous », au même
  rang que le nom de la communauté de communes. Il ne crée aucun nœud, aucune
  arête, aucune page.

Trois conséquences pratiques :

1. **Aucun nom n'entre dans `contenu/`.** Le contrôle des civilités, qui ne
   visait que la famille « influence », porte désormais sur tous les textes
   visibles. Un nom en dur s'y périmerait en silence — le contenu n'a pas de
   date de rafraîchissement, les fichiers de données en ont une.
2. **Minimisation.** Le répertoire publie la date de naissance, le sexe et la
   catégorie socio-professionnelle de chaque élu. Aucun des trois ne sert à
   savoir qui décide : seuls le nom, le prénom et la date de prise de fonction
   sont collectés. Ce qui n'est pas collecté n'a pas à être protégé.
3. **La péremption est le risque principal**, avant la vie privée : le nom est
   public par nature, mais un nom périmé envoie écrire à quelqu'un qui n'est
   plus en poste. D'où la date de prise de fonction affichée avec le nom, la
   surveillance du répertoire dans la veille, et le mécanisme de signalement
   ouvert à qui constate l'erreur.

Ce qui reste interdit est inchangé : relier une personne à une opinion, à un
financement, à un réseau. C'est ce que visait la règle, et cela ne devient pas
permis parce qu'un annuaire est devenu lisible.

### Les adjoints et les entrepreneurs individuels (1er octobre 2026)

Le site nomme désormais, en plus du maire, **ses adjoints** et **les
entrepreneurs individuels** de la commune. Les conditions — registre dont la
finalité couvre l'usage, source liée, aucune conclusion, retrait possible —
sont dans `CLAUDE.md`, « Les noms dans les données ». Voici la justification
de chacun, que la règle exige avant la collecte.

- **Les adjoints.** Le répertoire national des élus est publié pour rendre
  lisible la vie publique ; un adjoint détient des délégations du maire et
  signe en son nom. Savoir qui exerce une fonction exécutive est la question
  même du site, et c'est l'attente raisonnable de qui accepte un mandat. On
  retient la fonction et la date de prise de fonction, comme pour le maire.
- **Les entrepreneurs individuels.** SIRENE et le BODACC rendent publique
  l'identité de qui exerce une activité économique en son nom propre, pour que
  ses clients et ses créanciers sachent avec qui ils traitent. Nommer
  l'entreprise de la commune reste dans cette finalité. Deux limites la
  bornent : l'entrepreneur qui s'est opposé à la diffusion au répertoire SIRENE
  n'est pas nommé, et une procédure collective — la défaillance d'une personne
  — reste comptée, pas nommée.

**Révision du même jour, après relecture.** Deux conditions de la première
version sont levées : la minimisation (ni adresse, ni date de naissance, ni
âge) et l'interdiction d'indexer une personne ou de la rapprocher d'une source
à l'autre. Pappers le fait couramment pour les dirigeants, et la finalité est
la même : savoir qui exerce quoi. La date de naissance reste limitée au mois
et à l'année, comme l'INPI la diffuse.

Ce qui reste à tenir relève de l'autre règle, celle des chiffres : un
rapprochement est une affirmation, et on ne publie pas ce qu'on n'a pas
vérifié. Il n'existe pas d'identifiant commun entre le répertoire des élus et
SIRENE, et les homonymes sont nombreux. Un rapprochement faux entre un élu et
une entreprise qui a obtenu un marché serait diffamatoire. La collecte qui
rapproche dit donc sur quoi elle s'appuie — le nom seul, ou le nom avec le
mois et l'année de naissance et la commune — et la page le montre.

**Mise en œuvre.** Le statut de diffusion SIRENE est relu à chaque
ingestion, et un SIREN inconnu de la copie vaut refus. Les oppositions sont
tenues dans `retraits.yaml` par identifiant seulement ; la demande passe par
le courriel de l'éditeur, jamais par une issue publique, qui exposerait la
personne au moment même où elle demande à ne plus l'être. Une limite connue :
le retrait vaut pour Rouages, pas pour la source, et une copie du site faite
avant la mise à jour garde l'ancien état.

### Les nuances politiques et l'année de naissance (1er octobre 2026)

Décision du mainteneur, le même jour : **les élus ont choisi leur engagement
et répondent de leurs actes et de leurs idées.** Le site rapporte des faits,
et ils ont un droit de rectification.

- **La nuance d'une liste ou d'un candidat** est attribuée par le préfet,
  d'après une grille que le ministère publie (référentiel `nuances.xml`), dans
  les communes de 3 500 habitants et plus et les chefs-lieux d'arrondissement.
  Le Conseil d'État a rejeté en février 2026 les recours contre la circulaire
  qui la fixe. Le site reprend le code et son libellé officiel, jamais une
  appréciation à lui ; là où aucune n'est attribuée, il n'en devine pas.
  L'étiquette qu'une liste revendique peut différer, et la page le dit.
- **L'année de naissance des élus**, sans le jour ni le mois : elle dit la
  génération de qui décide. Le répertoire publie la date complète ; la
  réduire à l'année garde l'information utile et retire ce qui sert à
  identifier une personne hors de sa fonction.

### Les conseillers, les têtes de liste, les titulaires, la HATVP (1er octobre 2026)

Décision du mainteneur, le même jour : le site n'a pas d'opinion, il montre
des recoupements de données sourcées. Justification de chaque ajout, écrite
avant la collecte :

- **Les conseillers municipaux.** Le répertoire national des élus les publie
  tous, et un conseiller vote les délibérations : savoir qui siège est la
  question même du site. On retient le nom, le prénom, l'année de naissance
  et le siège au conseil communautaire ; ni le sexe ni la profession, qui
  restent des décomptes. Le siège communautaire vient d'un second fichier du
  même répertoire, rapproché sur quatre champs — commune, nom, prénom, date
  de naissance complète — : 61 115 sièges sur 62 111 trouvent leur
  conseiller ; les autres ne sont pas affichés plutôt que devinés. Le
  retrait d'un conseiller sans fonction passe par une empreinte, pour que
  `retraits.yaml` ne le nomme pas.
- **Les têtes de liste.** Le fichier des candidatures est publié par le
  ministère pour que l'électeur sache qui se présente. La tête de liste est
  nommée avec sa liste, rien de plus.
- **Les titulaires des marchés.** Les données essentielles de la commande
  publique sont publiées pour la transparence de la dépense : le SIRET du
  titulaire y figure, et SIRENE dit à qui il appartient. Une société est
  nommée par sa dénomination ; un entrepreneur individuel seulement s'il est
  diffusible au répertoire, comme au BODACC.
- **Les représentants d'intérêts.** Le répertoire de la HATVP est tenu pour
  que le public sache qui cherche à influencer la décision publique ; ses
  dirigeants y sont déclarés par l'organisation elle-même. On reprend
  l'organisation, ses dirigeants et leur fonction, avec le lien vers la fiche
  de la HATVP ; ni les collaborateurs, ni les adresses, ni les téléphones.
  C'est le seul registre public qui nomme des dirigeants d'associations, et
  seulement pour celles qui font de la représentation d'intérêts : les
  autres restent anonymes, faute de source.

### Les déclarations des élus à la HATVP (1er octobre 2026)

Demande du mainteneur : sourcer les déclarations de patrimoine des élus. Ce
que la loi permet, vérifié avant la collecte :

- **Les déclarations de situation patrimoniale des élus locaux ne sont jamais
  publiées.** La HATVP les contrôle, l'électeur n'y a pas accès, et leur
  publication ou leur divulgation hors des cas prévus est punie (article 26
  de la loi n° 2013-907). Le site n'en reprend rien, pas même l'existence.
- **Les déclarations d'intérêts le sont** (article 12), pour les maires des
  communes de plus de 20 000 habitants, les adjoints délégués de celles de
  plus de 100 000, les présidents et vice-présidents délégués des grandes
  intercommunalités. La HATVP publie la liste des déclarations en données
  ouvertes, avec leur statut et la page nominative de chaque déclarant.

Ce qui est repris : pour un élu que le site nomme déjà, chaque déclaration
d'intérêts — sa qualité, son statut, sa date — et le lien vers sa page à la
HATVP. **Et, depuis le 2 octobre 2026, le contenu de sa dernière déclaration
d'intérêts publiée**, à la demande du mainteneur : c'est la partie la plus
obscure de la transparence de la vie publique, publiée mais rarement lue.

Vérifié avant la collecte : la délibération de la HATVP n° 2017-111 (article
7) dit que les déclarations publiées « peuvent être réutilisées librement »,
sous licence ouverte, libre et gratuite, dans le respect de l'article
L. 322-1 du code des relations entre le public et l'administration — ne pas
altérer, ne pas dénaturer, citer la source et la date. Aucune restriction
d'usage commercial n'y figure. Le site reprend donc les rubriques telles
quelles, en disant que ce sont des extraits et où lire la déclaration
entière.

Retenu : les activités professionnelles des cinq dernières années, les
activités de conseil, les mandats électifs, les participations aux organes
dirigeants, les participations financières, les fonctions bénévoles, et les
rémunérations que la déclaration publie.

**Puis, le même jour, le reste de ce que la HATVP publie**, à la demande du
mainteneur : l'activité professionnelle du conjoint, les collaborateurs, les
commentaires de chaque ligne et les observations libres. La première version
les écartait parce qu'ils concernent d'autres personnes ; le mainteneur a
tranché qu'ils sont publiés précisément pour cela — un employeur du conjoint
qui contracte avec la collectivité, un collaborateur parlementaire de la
famille, comme dans l'affaire du couple Fillon. Ce qui protège les tiers est
ce que la HATVP elle-même masque, et le site s'y tient : le nom du conjoint
est « [Données non publiées] » dans le fichier, et reste absent ; tout ce qui
porte cette mention est retiré. Les collaborateurs ne figurent que dans les
déclarations des parlementaires : ils apparaissent pour un député ou un
sénateur qui siège aussi au conseil municipal. Un collaborateur ou un
conjoint qui demande le retrait de la ligne qui le concerne l'obtient par
`retraits.yaml`, sans y être nommé. Le contenu est rapproché du
répertoire des élus sur le nom, le prénom **et la date de naissance
complète**, que la déclaration et le répertoire portent tous deux.

Le statut des déclarations, lui, vient de la liste, qui ne porte pas la date
de naissance : il est rapproché sur le nom, le prénom et le département, et
seulement quand un seul conseiller municipal du département porte ce nom et
ce prénom ; quand la qualité nomme la commune, elle doit concorder.

### Les élus des départements, des régions et du Parlement (2 octobre 2026)

Le répertoire national des élus publie aussi les conseillers départementaux,
les conseillers régionaux, les députés et les sénateurs, pour la même raison
que les conseillers municipaux : rendre lisible qui exerce un mandat. Le
site les nomme sur la page du département — les conseillers départementaux
par canton, les sénateurs, les députés par circonscription — et sur celle de
la région, avec leur fonction et leur année de naissance ; ni le jour de
naissance, ni le sexe, ni la profession.

Leurs déclarations d'intérêts à la HATVP suivent la règle déjà écrite pour
les élus municipaux : statut et lien d'après la liste, rapprochés sur le nom,
le prénom et le département quand un seul élu de l'échelon les porte ;
contenu de la dernière déclaration publiée d'après le fichier XML, rapproché
sur le nom, le prénom et la date de naissance complète. Celles-là sont
publiées en nombre, contrairement à celles des communes élues en 2026. **Les
déclarations de patrimoine restent exclues à tous les échelons** : celles
des élus locaux ne sont jamais publiques, celles des parlementaires ne se
consultent qu'en préfecture et leur divulgation est punie.

Le site ne rattache pas encore ces élus à une commune : le découpage qu'il
lit ne donne ni le canton ni la circonscription, et une correspondance
devinée nommerait le mauvais élu. La page de la commune renvoie à celle du
département.

### Les exploitants des sites pollués et des installations classées (8 octobre 2026)

Écrit avant la première collecte, qui ne tourne que depuis l'hébergement
français : Géorisques et le service du BRGM refusent les machines de GitHub.

Deux registres de l'État, tenus pour l'information du public sur
l'environnement :

- **La carte des anciens sites industriels et activités de services
  (CASIAS)**, avec les pollutions connues (ex-BASOL) et les secteurs
  d'information sur les sols. Le BRGM la tient « pour conserver la mémoire
  d'anciens sites industriels et activités de service » et fournir des
  informations utiles à l'urbanisme et à la santé publique. Elle nomme
  l'exploitant de chaque site, y compris d'activités fermées depuis des
  décennies, souvent sans SIRET.
- **Les installations classées pour la protection de l'environnement**, avec
  leur régime, leur classement Seveso et la date de la dernière inspection.
  Géorisques nomme l'exploitant ; c'est presque toujours une société, parfois
  un éleveur ou un artisan en nom propre.

Ce qu'une personne peut en attendre : qu'une activité soumise au contrôle de
l'État, ou qui a pu polluer un terrain, soit connue de ceux qui y vivent ou
y achètent, sous le nom qu'elle exploitait — le registre le publie pour
cela. Un entrepreneur qui s'est opposé à la diffusion de son identité peut,
lui, attendre qu'on respecte ce choix.

Ce qui est retenu, pour chaque site ou installation : le code du registre et
le lien vers sa fiche, l'inventaire ou le régime, l'état d'activité, le
classement Seveso, les natures cochées (élevage, carrière, éolien,
industrie), la priorité nationale d'inspection, l'année de la dernière
inspection, l'activité. Ce qui ne l'est pas : l'adresse, les coordonnées,
les rubriques de la nomenclature, la description des pollutions — la fiche
d'origine les donne.

Le nom de l'exploitant est repris tel que le registre le publie, anciennes
entreprises comprises : c'est la trace historique que la CASIAS est faite
pour garder (décision du mainteneur, 8 octobre 2026). Deux exceptions :

- **un entrepreneur individuel en diffusion partielle** au répertoire
  SIRENE — il a exercé son droit d'opposition (article R123-232-1 du code de
  commerce) — n'est pas nommé, même quand le registre le nomme ; avec un
  SIRET diffusible, il est nommé sous le nom que publie SIRENE ;
- **une opposition inscrite dans `retraits.yaml`**, par SIREN ou, sans SIRET,
  par le code du site ou de l'installation, retire le nom à l'ingestion
  suivante.

Sans SIRET, rien ne permet de vérifier une opposition : le nom est repris
comme le registre le publie, et le retrait reste ouvert à tout moment.

Le site ne conclut rien : un site recensé à la CASIAS n'est pas un sol
pollué, et la page le dit à chaque fois ; une installation classée n'est
pas une infraction. Aucun rapprochement entre un exploitant et un élu ou un
marché n'est fait.

### Les coordonnées des acheteurs et les avis du BOAMP (8 octobre 2026)

Écrit avant la première collecte. Deux sources de plus pour les fichiers
nationaux des marchés, qu'aucune personne physique ne doit traverser :

- **L'annuaire de l'administration** (service-public.fr, Licence Ouverte)
  publie pour chaque mairie et chaque intercommunalité un téléphone, une
  adresse électronique et un site, pour que le public puisse les joindre.
  C'est l'usage qu'en fait le site : dire à qui écrire au sujet d'un marché.
  Est retenue la fiche de la mairie principale ou de l'intercommunalité, pas
  celle d'un service ni d'une mairie déléguée ; le nom d'un responsable, que
  certaines fiches portent (`affectation_personne`), n'est pas lu. Une petite
  commune publie parfois l'adresse de sa secrétaire — « prénom.nom@… » — :
  une adresse dont un morceau est un prénom connu des conseils municipaux,
  hors du nom de la collectivité, n'est pas reprise. Le filtre se trompe dans
  les deux sens : il écarte une adresse faite d'un prénom seul « @mairie-… »,
  qui est peut-être celle du secrétariat, et laisserait passer une initiale
  suivie d'un nom, qui ne contient pas de prénom entier. Le second cas se signale et se retire comme le reste.
- **Le BOAMP** (DILA, Licence Ouverte) publie les avis de marché pour que les
  entreprises y répondent. Il nomme souvent la personne à contacter, voire
  le maire en tant que représentant du pouvoir adjudicateur
  (`correspondantPRM`). Rien de cela n'est retenu : de chaque avis, le site
  garde l'identifiant, la date de parution, la date limite, l'objet, le code
  CPV, la nature du marché, le lien vers l'avis, et l'acheteur rattaché —
  une collectivité. Le rattachement dit sur quoi il repose (`par` : le SIRET
  publié dans l'avis, ou le nom dans le même département), et un nom qui
  désigne plusieurs acheteurs ne rattache rien.

### La situation des titulaires : procédures collectives et cessations (8 octobre 2026)

Écrit avant la première collecte, sur décision du mainteneur du même jour :
**les procédures collectives sont nommées, entrepreneurs individuels
compris**, sous le titulaire d'un marché. La règle du 1er octobre les
comptait sans les nommer ; elle est levée pour cet usage, parce qu'un
service qui suit les marchés publics doit être complet sur qui les tient.

- **Ce que le registre publie, et pourquoi.** Le BODACC publie les jugements
  des procédures collectives — sauvegarde, redressement, liquidation, plan,
  clôture — pour que les créanciers et les partenaires de l'entreprise le
  sachent. L'acheteur public est un partenaire : un titulaire en liquidation
  ne finira peut-être pas son marché, et le marché reviendra plus tôt. Ses
  concurrents sont dans la même attente légitime. SIRENE publie de même
  qu'une unité légale a cessé.
- **Ce qu'une personne peut en attendre.** L'entrepreneur individuel sait que
  le jugement est publié sous son nom, au BODACC, en accès libre ; il n'attend
  pas qu'un service qui le nomme déjà comme titulaire d'un marché taise la
  procédure. La DILA rappelle que la réutilisation reste soumise au RGPD :
  la finalité, la durée et le retrait ci-dessous en sont la réponse.
- **Ce qui est retenu.** Pour un SIREN déjà nommé comme titulaire d'un marché,
  et seulement pour lui : le dernier jugement publié au BODACC dans les
  **vingt-quatre derniers mois** (sa nature telle que le BODACC l'écrit, sa
  date, le lien vers l'annonce), et le fait que SIRENE dise l'unité légale
  cessée. Au-delà de vingt-quatre mois, plus rien. Les avis de dépôt (état des
  créances, état de collocation), qui ne disent rien de la marche de
  l'entreprise, ne sont pas retenus ; ni le complément du jugement, ni le
  mandataire, ni l'adresse.
- **Ce qui ne l'est pas.** Un entrepreneur en **diffusion partielle** au
  répertoire SIRENE n'est toujours pas nommé : c'est un droit d'opposition
  légal (article R123-232-1 du code de commerce), pas un choix du site. Les
  avis de rétablissement personnel, que la DILA n'ouvre pas, non plus.
- **Le site ne conclut rien.** Il écrit le jugement tel que publié, avec sa
  date et son lien ; jamais « en difficulté » ni « à risque ».
- **Le retrait.** Une opposition reçue par `/signaler` va dans `retraits.yaml`,
  par SIREN, et s'applique à l'ingestion suivante, comme pour les titulaires.

### Les bénéficiaires des aides de la PAC — à décider (8 octobre 2026)

Écrit avant toute collecte, pour que le mainteneur tranche. Rien n'est
collecté tant que la décision n'est pas inscrite ici et dans `CLAUDE.md`.

**Le registre.** Chaque année, le ministère de l'Agriculture publie, par
le module de l'Agence de services et de paiement, la liste des
bénéficiaires du FEAGA (premier pilier : aides directes, marchés) et du
FEADER (second pilier : développement rural). C'est une obligation de
l'article 98 du règlement (UE) 2021/2116 : publication *a posteriori*,
chaque année, avec la commune où le bénéficiaire réside ou est enregistré
et le code postal, et les montants par mesure. Sa finalité est la
transparence de l'usage des fonds agricoles européens — la plus grosse
dépense de l'Union, et souvent la première aide publique d'une commune
rurale.

**Ce que le registre lui-même retient.** Le même article fixe deux limites,
vérifiées sur son texte le 8 octobre 2026 :

- le nom n'est pas publié quand le bénéficiaire a reçu **1 250 € ou moins**
  dans l'année ;
- l'information reste accessible **deux ans** à compter de sa première
  publication, et l'article 99 oblige à prévenir les bénéficiaires.

Ces limites viennent de l'arrêt *Volker und Markus Schecke et Eifert* de la
Cour de justice (grande chambre, 9 novembre 2010, affaires C-92/09 et
C-93/09), qui a invalidé en partie l'ancienne publication nominative des
personnes physiques, jugée disproportionnée.

**Ce qu'une personne peut en attendre.** Un exploitant en nom propre sait
que son nom, sa commune et ses aides sont publiés, pour deux ans. Il n'a
pas choisi d'être public au sens d'un candidat ou d'un élu : il a demandé
une aide. Republier au-delà de deux ans, ou rendre le nom trouvable depuis
la page de sa commune pour des années, dépasserait ce que le registre
annonce. Une société — GAEC, EARL, SCEA — porte souvent le nom de la
famille qui l'exploite.

**Trois options, de la plus prudente à la plus large.**

1. **Des totaux par commune, sans aucun nom** : nombre de bénéficiaires,
   montants FEAGA et FEADER, répartition par grandes mesures, sur la
   dernière année publiée. C'est un agrégat : il ne nomme personne et ne
   relève pas de la règle des noms. Une commune de moins de quelques
   bénéficiaires ne serait pas détaillée par mesure, pour qu'on ne puisse
   pas remonter à un exploitant.
2. **Les totaux, plus les bénéficiaires qui ne sont pas des personnes
   physiques** — collectivités, établissements publics, associations,
   sociétés —, sous leur dénomination, avec le lien vers le module de
   l'ASP, retirés après deux ans. À vérifier sur le fichier : qu'il
   distingue les personnes physiques, sinon la forme juridique dans la
   dénomination ne suffira pas à les écarter sans erreur.
3. **Tout ce que le ministère publie**, personnes physiques comprises au-delà
   de 1 250 €, retiré après deux ans, avec les oppositions de
   `retraits.yaml`.

**Recommandation.** L'option 1 d'abord : elle répond à la question qu'on
se pose sur une commune rurale — combien l'Europe y verse par l'agriculture
— sans exposer personne. L'option 2 se décide ensuite, fichier en main.
L'option 3 n'est pas recommandée : le site la rendrait plus durable et plus
trouvable que le registre ne l'annonce.

**Ce qui bloque, en plus de la décision.** Le fichier n'est pas joignable
depuis l'environnement de développement : la page du ministère coupe la
connexion, et le module de l'ASP renvoie à l'identification. Il faut
l'adresse du fichier national, relevée depuis une autre machine, pour écrire
la collecte.

## 4. Risques juridiques directs

- **Diffamation** (famille D) : traitée par la règle « pas de personnes » dans
  le graphe, et, dans les données, par celle des noms : un nom ne vient que
  d'un registre public, avec sa source, sans qualificatif ni conclusion.
- **Droit d'auteur** : ne pas recopier service-public.fr ou Wikipédia — citer,
  lier, reformuler. Vérifier la licence de chaque jeu de données réutilisé
  (Licence Ouverte, ODbL : obligations de partage à l'identique différentes).
- **RGPD (phase 4)** : les délibérations de conseils municipaux sont publiques,
  mais contiennent des noms de personnes physiques. Republier et **indexer**
  n'est pas neutre au regard du droit à l'effacement et du référencement. À
  cadrer avant la première collecte : pseudonymisation des mentions non
  publiques par nature, exclusion de l'indexation par les moteurs, procédure de
  retrait. Recommandation : avis juridique avant la phase 4.

## 5. L'assistance à la lecture du PLU

C'est la fonctionnalité la plus demandée et la plus dangereuse. Un modèle qui
répond « votre terrain est constructible » alors qu'il ne l'est pas cause un
préjudice réel.

**Garde-fous** : l'outil **retrouve et cite**, il ne **conclut jamais**.
Réponse attendue : « voici l'article du règlement applicable à votre zone, son
texte intégral, et le lien vers le document opposable ». Toute réponse non
étayée par une citation littérale est refusée par le système. Avertissement
permanent. Aucune réponse à une question de faisabilité.

## 6. Soutenabilité

Un projet bénévole d'explication institutionnelle meurt généralement par la
maintenance, pas par le lancement.

**Garde-fous** : rester statique et sans compte utilisateur le plus longtemps
possible (coût d'exploitation ≈ 0) ; automatiser la détection de péremption
plutôt que de compter sur la vigilance ; concevoir la contribution externe dès
la phase 2 ; se donner un critère d'arrêt explicite par phase.

## 7. Concurrence de l'existant

Risque de produire un doublon moins bon de vie-publique.fr.

**Garde-fous** : l'entité `levier` et la vue V4 (« où puis-je agir ») ; l'échelon
local ; le format graphique. Si une fiche n'apporte rien de plus que la page
service-public correspondante, ne pas la publier — la lier.
