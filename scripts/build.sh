#!/usr/bin/env bash
# =============================================================================
#  Conquer Overlay — Linux build script
#  Produces:  dist/Conquer Overlay-*.AppImage
#             dist/conquer-overlay_*_amd64.deb
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[build]${NC} $*"; }
warn()  { echo -e "${YELLOW}[build]${NC} $*"; }
error() { echo -e "${RED}[build] ERROR:${NC} $*" >&2; exit 1; }

# ── 1. System dependency check ────────────────────────────────────────────────
info "Checking system dependencies..."

check_cmd() {
  command -v "$1" &>/dev/null || error "'$1' not found. $2"
}

check_cmd node  "Install Node.js ≥18: https://nodejs.org"
check_cmd npm   "Install Node.js ≥18: https://nodejs.org"
check_cmd cargo "Install Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"

# python3 is only needed by node-gyp when native modules must be compiled from source.
# Warn rather than abort — prebuilt binaries skip node-gyp entirely.
command -v python3 &>/dev/null || warn "python3 not found. node-gyp (native source builds) may fail if prebuilt binaries are unavailable."

# Check X11 dev libs — only install the ones that are actually missing.
MISSING_PKGS=()
for pkg in libx11-dev libxtst-dev libxi-dev libxrandr-dev; do
  dpkg -s "$pkg" &>/dev/null 2>&1 || MISSING_PKGS+=("$pkg")
done

if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
  warn "Missing apt packages: ${MISSING_PKGS[*]}"
  info "Installing missing packages (requires sudo)..."
  sudo apt-get update -q
  sudo apt-get install -y "${MISSING_PKGS[@]}"
else
  info "System packages already installed — skipping apt."
fi

# ── 2. Node dependencies ──────────────────────────────────────────────────────
# node_modules is up-to-date when the internal .package-lock.json marker
# (written by npm after every install) is at least as new as package-lock.json.
node_modules_current() {
  [[ -d node_modules ]] || return 1
  [[ -f node_modules/.package-lock.json ]] || return 1
  # package-lock.json must NOT be newer than the installed marker
  [[ ! package-lock.json -nt node_modules/.package-lock.json ]]
}

# Native .node binaries need a rebuild when the canary binary (better-sqlite3)
# is absent — e.g. after a fresh clone or an Electron upgrade.
native_modules_built() {
  [[ -f node_modules/better-sqlite3/build/Release/better_sqlite3.node ]]
}

if node_modules_current; then
  info "SKIP: node_modules is up-to-date — skipping npm install."
else
  info "Installing Node.js dependencies..."
  npm install
fi

if native_modules_built; then
  info "SKIP: Native modules already built — skipping postinstall."
else
  info "Rebuilding native Node modules for Electron..."
  npm run postinstall
fi

# ── 3. Rust native helper ─────────────────────────────────────────────────────
HELPER_BIN="native-helper/conquer-helper/target/release/conquer-helper"

if [[ -f "$HELPER_BIN" ]]; then
  info "SKIP: Rust helper binary already exists at $HELPER_BIN — skipping cargo build."
  info "      Run 'npm run build:helper:linux' manually to force a rebuild."
else
  info "Building Rust native helper (release)..."
  npm run build:helper:linux
  if [[ ! -f "$HELPER_BIN" ]]; then
    error "Rust build succeeded but binary not found at $HELPER_BIN"
  fi
fi
chmod +x "$HELPER_BIN"
info "Rust helper ready: $HELPER_BIN  ($(du -sh "$HELPER_BIN" | cut -f1))"

# ── 4. Electron build ─────────────────────────────────────────────────────────
info "Building Electron app for Linux..."
npm run build:linux

info ""
info "Build complete. Installers in dist/:"
ls -lh dist/*.AppImage dist/*.deb 2>/dev/null || true
