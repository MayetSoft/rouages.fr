#!/usr/bin/env bash
# L'ingestion lancée à la main, sur le dépôt monté dans /rouages : les mêmes
# étapes que le workflow, sans la PR — on relit le diff avec git, puis on
# committe comme d'habitude.
set -euo pipefail
cd /rouages
git config --global --add safe.directory /rouages

npm ci --no-audit --no-fund
set -o pipefail
npm run territoires -- --cache "$@" 2>&1 | tee ingestion.log

echo
echo "Collectes en échec (leurs fichiers d'avant sont restés en place) :"
sed 's/\x1b\[[0-9;]*m//g' ingestion.log | grep -B1 'ne seront pas réécrits' \
  | grep -v -e 'ne seront pas réécrits' -e '^--$' || echo "aucune."

echo
echo "Contrôle comme la CI."
npm run valider
npm run verifier-recherche
npm run verifier-journal
npm run verifier-rattachement
npm run verifier-reseau
npm run verifier-types
ROUAGES_DEPS='03,29,55,75' npx astro build
echo
echo "Fini. Relire avec « git status public/territoires », puis committer."
