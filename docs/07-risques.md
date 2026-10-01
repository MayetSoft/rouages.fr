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
le contenu** (règle vérifiée automatiquement, sur tout `contenu/` et non plus
seulement sur cette famille) ; sources académiques ou cas documentés
publiquement ; publication seulement après la phase 2 ; séparation visuelle
claire de cette famille.

### La frontière, depuis que le site nomme les maires

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
entrepreneurs individuels** de la commune. Les conditions — source liée,
aucune conclusion, minimisation, pas d'index par personne, retrait possible —
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

Le risque principal n'est pas la publication, c'est le rapprochement. Un nom
seul ne fait pas une identité : sans identifiant commun entre le répertoire
des élus et SIRENE, rapprocher un adjoint d'une entreprise sur son seul nom
produirait des faux rapprochements, et un faux rapprochement entre un élu et
un marché public est une diffamation. Le site ne le fait pas automatiquement.

## 4. Risques juridiques directs

- **Diffamation** (famille D) : traitée par la règle « pas de personnes ».
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
