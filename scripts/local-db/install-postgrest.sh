#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/.local/bin"
mkdir -p "$BIN"
if [[ -x "$BIN/postgrest" ]]; then
  "$BIN/postgrest" --version
  exit 0
fi
VERSION="${POSTGREST_VERSION:-v16.3}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ASSET="postgrest-${VERSION}-linux-static-x86-64.tar.xz" ;;
  aarch64|arm64) ASSET="postgrest-${VERSION}-linux-static-aarch64.tar.xz" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac
URL="https://github.com/PostgREST/postgrest/releases/download/${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL"
curl -fsSL -o "$TMP/postgrest.tar.xz" "$URL"
tar -xJf "$TMP/postgrest.tar.xz" -C "$TMP"
mv "$TMP/postgrest" "$BIN/postgrest"
chmod +x "$BIN/postgrest"
"$BIN/postgrest" --version
