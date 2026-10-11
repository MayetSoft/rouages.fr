#!/usr/bin/env bash
# Pour les commandes lancées sur le dépôt monté dans /rouages : elles tournent
# sous l'utilisateur à qui appartient le dépôt (sous WSL, le vôtre), pour que
# les fichiers réécrits restent les siens. Docker crée en root les volumes du
# cache et des modules à l'intérieur du dépôt : on les lui donne d'abord.
set -euo pipefail
uid=$(stat -c %u /rouages)
gid=$(stat -c %g /rouages)
for d in /rouages/.cache /rouages/node_modules; do
  [ -d "$d" ] && chown "$uid:$gid" "$d"
done
[ "$uid" = 0 ] && exec "$@"
exec setpriv --reuid="$uid" --regid="$gid" --clear-groups env HOME=/home/node "$@"
