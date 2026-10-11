# L'image de l'ingestion : la même sur un PC (Docker Desktop), sur un serveur
# ou en runner auto-hébergé. Voir `docs/08-runner-auto-heberge.md`.
#
# Node 22, comme la CI, et ce dont le workflow « Réingestion des territoires »
# a besoin hors de Node : git, curl, unzip, gh pour ouvrir la PR, et les
# bibliothèques du runner GitHub Actions. Le runner lui-même n'est pas dans
# l'image : il se télécharge au premier lancement, dans son volume, et se met
# à jour seul.
FROM node:22-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git curl unzip ca-certificates gh jq \
      libicu72 libkrb5-3 liblttng-ust1 libssl3 zlib1g \
 && rm -rf /var/lib/apt/lists/*

# Les points de montage des volumes, à l'utilisateur `node` (uid 1000) :
# un volume neuf prend le propriétaire du dossier qu'il recouvre.
RUN mkdir -p /home/node/runner /home/node/rouages-cache \
 && chown node:node /home/node/runner /home/node/rouages-cache

COPY --chmod=755 runner.sh ingerer.sh dans-depot.sh /usr/local/bin/

ENV ROUAGES_CACHE_JOURS=6 \
    NODE_OPTIONS=--max-old-space-size=12288
