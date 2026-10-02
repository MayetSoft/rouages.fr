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

- **Un hébergeur en France**, si l'objectif est la souveraineté. L'hébergement
  mutualisé qui sert le site ne convient pas : il ne fait pas tourner une
  tâche d'une heure.
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
