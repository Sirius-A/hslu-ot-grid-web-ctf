#!/usr/bin/env bash
# Helper for running one isolated lab instance per student.
#
#   ./ctf.sh up 07      start instance 07 (portal :8107, collector :8207, scada :8307)
#   ./ctf.sh logs 07    follow logs
#   ./ctf.sh down 07    stop and remove it
#   ./ctf.sh up         start the default instance (portal :8100, collector :8200)
set -euo pipefail

cmd="${1:-up}"
id="${2:-00}"

if ! [[ "$id" =~ ^[0-9]{1,2}$ ]]; then
  echo "instance id must be 0-99" >&2
  exit 1
fi

n=$((10#$id))
export COMPOSE_PROJECT_NAME="hslu-ot-ctf-${id}"
export WEB_PORT=$((8100 + n))
export COLLECTOR_PORT=$((8200 + n))
export SCADA_PORT=$((8300 + n))

case "$cmd" in
  up)
    docker compose up -d --build
    echo
    echo "  portal     http://localhost:${WEB_PORT}"
    echo "  collector  http://localhost:${COLLECTOR_PORT}"
    echo "  scada      http://localhost:${SCADA_PORT}"
    ;;
  down)   docker compose down -v ;;
  logs)   docker compose logs -f ;;
  ps)     docker compose ps ;;
  *)      echo "usage: $0 {up|down|logs|ps} [instance-id]" >&2; exit 1 ;;
esac
