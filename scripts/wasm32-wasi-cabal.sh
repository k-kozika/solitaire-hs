#!/usr/bin/env bash
set -euo pipefail

subcommand=$1
shift
exec cabal "$subcommand" \
  --with-compiler="${SOLITAIRE_WASM_GHC:?Run scripts/build-wasm.sh}" \
  --with-hc-pkg="${SOLITAIRE_WASM_GHC_PKG:?Run scripts/build-wasm.sh}" \
  "$@"
