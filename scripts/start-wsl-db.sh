#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! pgrep -f '[b]ook-todo-wsl-keepalive' >/dev/null; then
  nohup bash -c 'exec -a book-todo-wsl-keepalive sh -c "while true; do sleep 3600; done"' \
    >/tmp/book-todo-keepalive.log 2>&1 &
fi

cd "$repo_dir"
if docker container inspect todo-postgres >/dev/null 2>&1; then
  docker start todo-postgres >/dev/null
else
  docker compose up -d todo-postgres
fi
