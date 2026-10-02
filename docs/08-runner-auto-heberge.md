# La réingestion sur une machine à nous

La réingestion complète tourne par défaut sur les machines de GitHub
(workflow « Réingestion des territoires »). Elle peut aussi tourner sur un
**runner auto-hébergé** : le même workflow, déclenché de la même façon, mais
exécuté sur un serveur que Rouages loue ou possède. C'est l'option
« auto-hebergee » au lancement.

## Pourquoi

- **La souveraineté du calcul.** Les données sont publiques : l'enjeu n'est
  pas leur confidentialité, mais de ne pas dépendre d'un seul acteur pour
  produire le site.
- **Le cache.** Sur GitHub, chaque ingestion repart de zéro et retélécharge
  plusieurs gigaoctets — le répertoire des associations, VigiEau, Palissy,
  FINESS. Le runner garde ces fichiers d'une fois sur l'autre.
- **Les ressources.** Mémoire et disque sont ceux du serveur, et le temps de
  calcul ne se décompte pas.

Ce qu'on garde : le déclenchement depuis l'onglet Actions, le contrôle de la
CI dans le même job, la PR ouverte avec les fichiers réécrits et la liste des
collectes en échec. Les machines de GitHub restent le choix par défaut, et le
secours quand le serveur est éteint.

Ce que le runner ne change pas : les sources que l'environnement de
développement ne joint pas (data.gouv.fr en gros volume, Légifrance,
Géorisques) sont joignables depuis GitHub comme depuis un serveur ordinaire.
Le tunnel est une limite de l'environnement de développement, pas de GitHub.

## Le cache, et ce qui l'empêche de mentir

Le workflow relie `.cache/` à `~/rouages-cache` sur le serveur, hors de
l'espace de travail que le checkout nettoie à chaque fois, et lance
`npm run territoires -- --cache`.

Un fichier en cache n'est réutilisé que s'il vient de la même adresse
(`.source` à côté de lui) **et** s'il a moins de six jours
(`ROUAGES_CACHE_JOURS=6`) : certaines sources gardent la même adresse en
changeant de contenu, et un cache sans âge servirait un état périmé sans
le dire. Les collectes qui téléchargent toujours (HATVP, répertoire des
élus des autres échelons) ne passent pas par lui.

## Le serveur

- **Un hébergeur en France**, si l'objectif est la souveraineté. Un runner
  GitHub est un service qui reste à l'écoute : il demande une machine où un
  processus peut tourner en permanence, ce que l'hébergement mutualisé
  d'o2switch ne permet pas. L'hébergement lui-même peut porter l'ingestion
  par une autre voie, sans runner : voir plus bas.
- **De quoi tenir l'ingestion** : elle demande 6 Go de mémoire à Node
  (`--max-old-space-size=6144`) et lit en flux des fichiers de plusieurs
  gigaoctets. Prévoir 8 Go de mémoire au moins, et un disque qui garde le
  cache — une soixantaine de gigaoctets laisse de la marge.
- **Un système Linux à jour**, avec `git`, `curl`, `unzip`, et un utilisateur
  dédié sans droits d'administration pour le runner. Node n'a pas à être
  installé : le workflow le pose avec `actions/setup-node`.

## L'installation

1. Sur GitHub : *Settings → Actions → Runners → New self-hosted runner*,
   système Linux. La page donne les commandes exactes, avec un jeton valable
   une heure : télécharger l'archive du runner, puis `./config.sh` avec
   l'adresse du dépôt et le jeton.
2. Pendant `./config.sh`, ajouter l'étiquette **`rouages`** : c'est elle que
   le workflow demande, avec `self-hosted`.
3. L'installer comme service, pour qu'il survive à un redémarrage :
   `sudo ./svc.sh install <utilisateur>` puis `sudo ./svc.sh start`.
4. Vérifier que le secret `ROUAGES_RETRAITS_SECRET` est défini dans le dépôt
   (*Settings → Secrets and variables → Actions*) : le workflow le passe au
   runner comme aux machines de GitHub.
5. Lancer : onglet *Actions → Réingestion des territoires → Run workflow*,
   machine « auto-hebergee ».

## L'autre voie : une tâche planifiée sur l'hébergement o2switch

Une première version de cette page disait que l'hébergement mutualisé « ne
fait pas tourner une tâche d'une heure ». C'était écrit sans vérification, et
c'est faux pour l'essentiel. Ce qui est vérifié, d'après la documentation
d'o2switch (octobre 2026) :

- l'offre donne **12 threads, 48 Go de mémoire et 42 Mo/s d'entrées-sorties**,
  partagés et non réservés comme sur un serveur dédié, et un disque NVMe sans
  plafond annoncé ; elle compte **huit sous-comptes**, chacun avec les mêmes
  ressources ;
- **Node.js s'y exécute**, et les **tâches cron** lancent des commandes shell ;
  seule la méthode par appel web est coupée à 360 secondes ;
- **pas de processus permanent** : c'est ce qui exclut le runner, pas la durée.

Ce qui reste à vérifier, par un premier essai à la main :

- **la durée effective.** Aucune limite n'est documentée pour une commande
  cron, mais l'environnement mutualisé (CloudLinux LVE) peut tuer un
  processus qui consomme trop de CPU ou d'entrées-sorties sur une fenêtre
  courte — un cas est rapporté sur o2switch pour une décompression de
  plusieurs dizaines de gigaoctets. L'ingestion décompresse et lit en flux
  plusieurs gigaoctets : il faut le constater, pas le supposer ;
- **la version de Node** : le projet tourne sur Node 22. Le sélecteur de
  cPanel ou une installation dans le dossier personnel (`nvm`) y pourvoit ;
- **les conditions d'utilisation** de l'offre pour un traitement qui n'est
  pas du service web : à demander au support avant d'en faire une habitude.

Si l'essai passe, la voie est simple :

1. **Un sous-compte dédié**, pour que l'ingestion — et les dépendances npm
   qu'elle exécute — n'ait aucun accès aux fichiers du site en ligne.
2. Un clone du dépôt, `npm ci`, et le secret `ROUAGES_RETRAITS_SECRET` dans
   l'environnement du sous-compte.
3. **Une tâche cron en commande shell**, protégée par `flock` comme le
   recommande o2switch : récupérer `main`, `npm run territoires -- --cache`
   avec `ROUAGES_CACHE_JOURS=6`, refaire les contrôles de la CI, pousser une
   branche et ouvrir la PR par l'API de GitHub, avec un jeton à portée
   limitée à ce dépôt (contenu et pull requests).
4. Le workflow de GitHub reste le secours, et le contrôle de la CI s'exécute
   toujours sur la PR.

Ce qu'on y gagne : pas de serveur à louer, un hébergement français déjà
payé, le cache gardé sur place. Ce qu'on y perd : la garantie de ressources
d'une machine dédiée, et l'exécution n'est plus visible dans l'onglet
Actions — le journal reste sur le sous-compte, et la PR dit ce qui a échoué.

## La sécurité

Le dépôt est public. Un runner auto-hébergé exécute le code qu'on lui donne :
s'il acceptait les workflows déclenchés par une pull request, quelqu'un
pourrait lui faire exécuter le sien. D'où trois règles :

- **Seul ce workflow, déclenché à la main, vise l'étiquette `rouages`.** Les
  workflows déclenchés par une pull request (`ci.yml`, `sonder-sources.yml`)
  tournent sur `ubuntu-latest` et doivent y rester ; un ajout qui viserait
  `self-hosted` sur `pull_request` est à refuser en relecture.
- **Le déclenchement manuel demande les droits d'écriture sur le dépôt** :
  un contributeur extérieur ne peut pas lancer la réingestion.
- **Le runner tourne sous un utilisateur dédié**, sans `sudo`, sur une
  machine qui ne sert qu'à cela. Ce que la machine contient d'autre, un
  workflow compromis pourrait le lire.

Dans *Settings → Actions → General*, garder l'approbation obligatoire des
workflows proposés par des contributeurs extérieurs.

## La suite possible

Quitter GitHub pour une forge européenne (Codeberg, ou Forgejo hébergé par
Rouages) irait plus loin : le code, les PR et l'intégration continue
quitteraient tous un acteur américain. C'est un chantier — les workflows,
les jetons, l'habitude des contributeurs —, à mettre en balance avec la
visibilité qu'apporte GitHub. Le runner auto-hébergé n'engage pas ce choix.
