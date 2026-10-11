#!/usr/bin/env bash
# Le runner auto-hébergé : téléchargé au premier lancement, inscrit auprès du
# dépôt avec l'étiquette `rouages`, puis à l'écoute. Son installation et son
# inscription restent dans le volume : un redémarrage ne demande rien.
set -euo pipefail
cd /home/node/runner

if [ ! -x ./run.sh ]; then
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Architecture non prise en charge : $(uname -m)" >&2; exit 1 ;;
  esac
  version=$(curl -fsSI https://github.com/actions/runner/releases/latest \
    | tr -d '\r' | sed -n 's#^[Ll]ocation: .*/tag/v\([0-9.]*\)$#\1#p')
  [ -n "$version" ] || { echo "Version du runner introuvable." >&2; exit 1; }
  echo "Téléchargement du runner $version ($arch)."
  curl -fsSL "https://github.com/actions/runner/releases/download/v$version/actions-runner-linux-$arch-$version.tar.gz" | tar xz
fi

if [ ! -f .runner ]; then
  : "${RUNNER_TOKEN:?Le jeton d'inscription manque : RUNNER_TOKEN dans .env (Settings → Actions → Runners → New self-hosted runner).}"
  ./config.sh --unattended --replace \
    --url "${RUNNER_URL:-https://github.com/MayetSoft/rouages.fr}" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-rouages-$(hostname)}" \
    --labels rouages --work _work
fi

exec ./run.sh
