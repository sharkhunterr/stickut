#!/usr/bin/env bash
# Stickut — lance backend + frontend en mode dev local.
#
# Charge .env si présent, exporte les chemins vers cache/, tmp/ et templates/
# locaux, puis démarre uvicorn (--reload) et vite (HMR).
# Ctrl-C arrête les deux proprement.

set -euo pipefail

here() { cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd; }
ROOT="$(here)"
cd "$ROOT"

# ---------- env ------------------------------------------------------------
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Override paths to local dev dirs (les valeurs par défaut pointent vers /app/...).
export STICKUT_CACHE_DIR="${STICKUT_CACHE_DIR:-$ROOT/cache}"
export STICKUT_TEMPLATES_DIR="${STICKUT_TEMPLATES_DIR:-$ROOT/templates}"
export STICKUT_TMP_DIR="${STICKUT_TMP_DIR:-$ROOT/tmp}"
export STICKUT_REMBG_WORKERS="${STICKUT_REMBG_WORKERS:-2}"
export STICKUT_BEHIND_PROXY="${STICKUT_BEHIND_PROXY:-false}"
mkdir -p "$STICKUT_CACHE_DIR/cutouts" "$STICKUT_TMP_DIR"

VENV="$ROOT/backend/.venv"
if [[ ! -x "$VENV/bin/uvicorn" ]]; then
  echo "❌ venv introuvable ou incomplet ($VENV). Lance d'abord scripts/install.sh." >&2
  exit 1
fi
if [[ ! -x "$ROOT/frontend/node_modules/.bin/vite" ]]; then
  echo "❌ node_modules absent. Lance d'abord scripts/install.sh." >&2
  exit 1
fi

# ---------- subprocesses ---------------------------------------------------
LOG_DIR="$ROOT/.dev-logs"
mkdir -p "$LOG_DIR"
BACK_LOG="$LOG_DIR/backend.log"
FRONT_LOG="$LOG_DIR/frontend.log"

cleanup() {
  echo
  echo "↳ arrêt des serveurs…"
  if [[ -n "${BACK_PID:-}" ]] && kill -0 "$BACK_PID" 2>/dev/null; then
    kill "$BACK_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONT_PID:-}" ]] && kill -0 "$FRONT_PID" 2>/dev/null; then
    kill "$FRONT_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "──▶ Backend (uvicorn --reload) sur 127.0.0.1:8000  → $BACK_LOG"
(
  cd "$ROOT/backend"
  exec "$VENV/bin/uvicorn" app.main:app \
    --host 127.0.0.1 --port 8000 --reload \
    >> "$BACK_LOG" 2>&1
) &
BACK_PID=$!

echo "──▶ Frontend (vite HMR) sur 127.0.0.1:5173        → $FRONT_LOG"
(
  cd "$ROOT/frontend"
  exec ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 \
    >> "$FRONT_LOG" 2>&1
) &
FRONT_PID=$!

sleep 2
echo
echo "✅ Stickut en marche :"
echo "    UI   → http://127.0.0.1:5173/"
echo "    API  → http://127.0.0.1:8000/api/docs"
echo
echo "Logs en continu (Ctrl-C pour quitter) :"
echo

# Suivre les deux logs jusqu'à interruption.
tail -n 0 -F "$BACK_LOG" "$FRONT_LOG"
