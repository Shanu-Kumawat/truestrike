#!/usr/bin/env bash
# Manages the TrueStrike demo target (OWASP Juice Shop, localhost only).
# Usage: scripts/demo-target.sh [start|stop|restart|status|remove]
set -euo pipefail

CONTAINER="${JUICE_SHOP_CONTAINER:-juice-shop}"
PORT="${JUICE_SHOP_PORT:-3000}"
IMAGE="bkimminich/juice-shop"
URL="http://localhost:${PORT}"

command_exists() { command -v "$1" >/dev/null 2>&1; }

require_docker() {
  if ! command_exists docker; then
    echo "error: docker is not installed or not on PATH" >&2
    exit 1
  fi
}

container_state() {
  docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "absent"
}

wait_healthy() {
  echo "waiting for ${URL} to become reachable..."
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
    if [ "$code" = "200" ]; then
      echo "demo target is up: ${URL}"
      return 0
    fi
    sleep 2
  done
  echo "error: ${URL} did not become reachable; check: docker logs ${CONTAINER}" >&2
  return 1
}

start() {
  require_docker
  state=$(container_state)
  case "$state" in
    running)
      echo "container '${CONTAINER}' already running"
      ;;
    exited|created)
      echo "starting existing container '${CONTAINER}'"
      docker start "$CONTAINER" >/dev/null
      ;;
    absent)
      echo "pulling and starting ${IMAGE} on port ${PORT}"
      docker run -d -p "${PORT}:3000" --name "$CONTAINER" "$IMAGE" >/dev/null
      ;;
  esac
  wait_healthy
}

stop() {
  require_docker
  if [ "$(container_state)" = "running" ]; then
    docker stop "$CONTAINER" >/dev/null
    echo "stopped '${CONTAINER}'"
  else
    echo "container '${CONTAINER}' is not running"
  fi
}

status() {
  require_docker
  state=$(container_state)
  echo "container: ${state}"
  if [ "$state" = "running" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
    echo "http: ${URL} -> ${code}"
  fi
}

remove() {
  require_docker
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "removed '${CONTAINER}'"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  remove) remove ;;
  *)
    echo "usage: $0 [start|stop|restart|status|remove]" >&2
    exit 2
    ;;
esac
