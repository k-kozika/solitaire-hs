#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
native_ghc=${NATIVE_GHC:-ghc-9.10.3}

if [[ ! -f "$root/vendor/ghc-wasm-bindgen/ghc-wasm-bindgen.cabal" ]]; then
  echo 'Initialize vendor/ghc-wasm-bindgen with git submodule update --init.' >&2
  exit 1
fi

mkdir -p "$root/build/tools"
cd "$root/vendor/ghc-wasm-bindgen"
cabal install exe:ghc-wasm-bindgen \
  --with-compiler="$native_ghc" \
  --installdir="$root/build/tools" \
  --install-method=copy \
  --overwrite-policy=always
