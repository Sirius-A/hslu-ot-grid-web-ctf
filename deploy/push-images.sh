#!/usr/bin/env bash
#
# Build the five lab images and push them to the GitHub Container Registry
# (ghcr.io), so students can run the lab from docker-compose alone with no
# source code.
#
# Prerequisites (once):
#   1. A GitHub Personal Access Token with the `write:packages` scope.
#      Classic token: https://github.com/settings/tokens  (check write:packages,
#      read:packages). Fine-grained also works with "Packages: Read and write".
#   2. Log in:
#        echo "$GHCR_PAT" | docker login ghcr.io -u <your-gh-username> --password-stdin
#
# Usage:
#   GH_OWNER=my-gh-user ./deploy/push-images.sh            # pushes :1.0 and :latest
#   GH_OWNER=my-org VERSION=2026-ws ./deploy/push-images.sh
#
# GH_OWNER must be lowercase (ghcr requires it). An org works the same as a user.

set -euo pipefail

GH_OWNER="${GH_OWNER:?set GH_OWNER to your lowercase github username or org}"
VERSION="${VERSION:-1.0}"
REGISTRY="ghcr.io/${GH_OWNER}/hslu-ot-grid-web-ctf"

cd "$(dirname "$0")/.."

# service -> locally built image name (must match docker-compose.yml)
services="web scada scada-gate bot collector"

echo ">> building images locally"
docker compose build

for svc in $services; do
  local_img="hslu-ot-ctf/${svc}:latest"
  for tag in "$VERSION" latest; do
    remote="${REGISTRY}/${svc}:${tag}"
    echo ">> ${local_img}  ->  ${remote}"
    docker tag "$local_img" "$remote"
    docker push "$remote"
  done
done

echo
echo "Done. Images are at:"
for svc in $services; do
  echo "  ${REGISTRY}/${svc}:${VERSION}"
done
echo
echo "Next:"
echo "  * Make the packages public (or share a read token) -- see deploy/README.md."
echo "  * Hand students deploy/student/ (it defaults to ghcr.io/${GH_OWNER}/hslu-ot-grid-web-ctf)."
