#!/usr/bin/env bash
# Stickut — installation locale en mode dev (sans Docker).
#
# Usage:
#   scripts/install.sh                # installe backend + frontend
#   scripts/install.sh --with-models  # idem + pré-télécharge les modèles ONNX
#   scripts/install.sh --reset-venv   # supprime backend/.venv avant de réinstaller
#
# Idempotent : peut être relancé sans casser un setup existant.

set -euo pipefail

# ---------- helpers ---------------------------------------------------------
here() { cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd; }
ROOT="$(here)"
cd "$ROOT"

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }

step() {
  printf '\n'
  bold "──▶ $*"
}

require() {
  local cmd="$1"
  local hint="${2:-}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    red "❌ $cmd introuvable. $hint"
    exit 1
  fi
}

# ---------- options --------------------------------------------------------
WITH_MODELS=false
RESET_VENV=false
for arg in "$@"; do
  case "$arg" in
    --with-models) WITH_MODELS=true ;;
    --reset-venv)  RESET_VENV=true ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      red "Argument inconnu : $arg"
      exit 2
      ;;
  esac
done

# ---------- prerequisites --------------------------------------------------
step "Vérification des prérequis"

require python3 "Installe Python 3.12 (apt install python3.12 python3.12-venv)."
PYVER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ "$PYVER" != "3.12" ]]; then
  yellow "⚠ Python 3.$PYVER détecté — Stickut a été testé avec 3.12. Continuer quand même."
fi

require node "Installe Node 20+ (https://nodejs.org)."
NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  red "❌ Node $NODE_MAJOR détecté — il faut au moins Node 20."
  exit 1
fi

require npm

# ---------- system libs (best-effort) --------------------------------------
step "Vérification des libs système (libheif / libavif / libxml2)"
MISSING_LIBS=()
for lib in libheif.so.1 libavif.so.15 libavif.so.16 libxml2.so.2; do
  if ! ldconfig -p 2>/dev/null | grep -q "$lib"; then
    MISSING_LIBS+=("$lib")
  fi
done
# libavif a deux soversions possibles — on accepte si au moins une est présente.
if printf '%s\n' "${MISSING_LIBS[@]}" | grep -q '^libavif.so.15$' \
   && ! printf '%s\n' "${MISSING_LIBS[@]}" | grep -q '^libavif.so.16$'; then
  : # ok, libavif.so.16 trouvée
fi
HAS_HEIF=true
HAS_AVIF=true
ldconfig -p 2>/dev/null | grep -q libheif.so.1 || HAS_HEIF=false
ldconfig -p 2>/dev/null | grep -qE 'libavif\.so\.(15|16)' || HAS_AVIF=false
if ! $HAS_HEIF || ! $HAS_AVIF; then
  yellow "⚠ Libs manquantes : "
  $HAS_HEIF || yellow "    - libheif1 (sudo apt install libheif1 libheif-plugin-libde265 libheif-plugin-aomdec)"
  $HAS_AVIF || yellow "    - libavif (sudo apt install libavif15)"
  yellow "    Le décodage HEIC/AVIF côté serveur sera désactivé sans ces libs."
fi

# ---------- backend venv ---------------------------------------------------
VENV="$ROOT/backend/.venv"
if $RESET_VENV && [[ -d "$VENV" ]]; then
  step "Suppression du venv existant ($VENV)"
  rm -rf "$VENV"
fi

if [[ ! -d "$VENV" ]]; then
  step "Création du venv backend ($VENV)"
  python3 -m venv "$VENV"
fi

step "Installation des dépendances backend (peut prendre 2–5 min — onnxruntime + scipy)"
"$VENV/bin/pip" install --upgrade pip wheel >/dev/null
"$VENV/bin/pip" install -e "$ROOT/backend[dev]"

# ---------- frontend npm ---------------------------------------------------
step "Installation des dépendances frontend"
if [[ -f "$ROOT/frontend/package-lock.json" ]]; then
  ( cd "$ROOT/frontend" && npm ci )
else
  ( cd "$ROOT/frontend" && npm install )
fi

# ---------- runtime dirs ---------------------------------------------------
step "Création des dossiers runtime (cache, tmp)"
mkdir -p "$ROOT/cache/cutouts" "$ROOT/tmp"

# ---------- env file -------------------------------------------------------
if [[ ! -f "$ROOT/.env" ]]; then
  step "Création de .env (copie de .env.example)"
  cp "$ROOT/.env.example" "$ROOT/.env"
  green "  .env créé. Personnalise-le si besoin."
fi

# ---------- ONNX models ----------------------------------------------------
if $WITH_MODELS; then
  step "Pré-téléchargement des modèles ONNX (~700 Mo cumulés)"
  "$VENV/bin/python" - <<'PY'
from rembg import new_session

MODELS = ["birefnet-general", "isnet-general-use", "u2net", "isnet-anime"]
for name in MODELS:
    print(f"→ {name}…", flush=True)
    new_session(name)
    print(f"  ok", flush=True)
print("Tous les modèles sont en cache local (~/.u2net/).")
PY
else
  yellow "ℹ Modèles ONNX non téléchargés. Ils le seront automatiquement"
  yellow "  au premier détourage (~5 min pour birefnet-general)."
  yellow "  Pour les pré-télécharger maintenant : scripts/install.sh --with-models"
fi

# ---------- typecheck quickly ----------------------------------------------
step "Sanity check TypeScript (tsc --noEmit)"
( cd "$ROOT/frontend" && ./node_modules/.bin/tsc --noEmit ) && green "  TS OK"

# ---------- résumé ---------------------------------------------------------
echo
green "✅ Installation terminée."
echo
bold "Pour lancer Stickut en mode dev :"
echo "    scripts/dev.sh"
echo
bold "Ou manuellement, dans deux terminaux :"
echo "    # backend"
echo "    cd backend && ./.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
echo
echo "    # frontend"
echo "    cd frontend && npm run dev"
echo
bold "URLs après lancement :"
echo "    UI            http://127.0.0.1:5173/"
echo "    API           http://127.0.0.1:8000/api/health"
echo "    Swagger docs  http://127.0.0.1:8000/api/docs"
