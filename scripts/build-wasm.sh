#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

# ghcup may install only versioned command names. Provide the names bindgen
# expects locally, without changing the user's global toolchain.
wasm_ghc=${WASM_GHC:-wasm32-wasi-ghc-9.14}
wasm_ghc_pkg=${WASM_GHC_PKG:-${wasm_ghc/wasm32-wasi-ghc/wasm32-wasi-ghc-pkg}}
export SOLITAIRE_WASM_GHC
export SOLITAIRE_WASM_GHC_PKG
if ! SOLITAIRE_WASM_GHC=$(command -v "$wasm_ghc"); then
  echo "Wasm compiler not found: $wasm_ghc (set WASM_GHC)." >&2
  exit 1
fi
if ! SOLITAIRE_WASM_GHC_PKG=$(command -v "$wasm_ghc_pkg"); then
  echo "Wasm package tool not found: $wasm_ghc_pkg (set WASM_GHC_PKG)." >&2
  exit 1
fi

if [[ -d "$HOME/.ghc-wasm" ]]; then
  export PATH="$HOME/.ghc-wasm/binaryen/bin:$HOME/.ghc-wasm/nodejs/bin:$HOME/.ghc-wasm/wasm-run/bin:$PATH"
fi
if ! command -v wasm-opt >/dev/null; then
  echo 'wasm-opt not found. Install Binaryen or add it to PATH.' >&2
  exit 1
fi

bash "$root/scripts/build-bindgen.sh"
ln -sf "$SOLITAIRE_WASM_GHC" "$root/build/tools/wasm32-wasi-ghc"
ln -sf "$root/scripts/wasm32-wasi-cabal.sh" "$root/build/tools/wasm32-wasi-cabal"
export PATH="$root/build/tools:$PATH"

cd "$root"
ghc-wasm-bindgen build src/Solitaire/Wasm.hs \
  --name solitaire \
  --out web/src/generated/solitaire
