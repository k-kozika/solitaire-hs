# Web and WebAssembly development

The WebAssembly build exports the Haskell engine through `ghc-wasm-bindgen`. The frontend in [web/](../web/) uses Vite, Preact, and TypeScript. Its current app is the starter screen; a playable browser interface is not implemented yet.

## Toolchain

| Tool | Purpose |
| --- | --- |
| Native GHC 9.10.3 | Build the bindgen executable |
| Wasm GHC 9.14 and its matching `ghc-pkg` | Compile the game library to Wasm |
| Cabal | Build Haskell components |
| Binaryen `wasm-opt` | Required by the Wasm build pipeline |
| Node.js | JavaScript tooling used by the pipeline |
| Bun | Install frontend dependencies and run package scripts |

Use Node.js 22.12 or later for the Node 22 line. The installed Vite package declares `^20.19.0 || >=22.12.0`.

Install the compilers and tools before running the scripts. The scripts do not install GHC or Binaryen. If `~/.ghc-wasm` exists, the Wasm script prepends its `binaryen/bin`, `nodejs/bin`, and `wasm-run/bin` directories to `PATH`.

## Initialize bindgen

The repository declares [vendor/ghc-wasm-bindgen](../vendor/ghc-wasm-bindgen/) as a Git submodule. From the repository root:

```sh
git submodule update --init
```

The upstream examples contain Git LFS assets. If Git LFS is unavailable and those example binaries are not needed, initialize without running its filters:

```sh
git -c filter.lfs.process= -c filter.lfs.smudge= -c filter.lfs.required=false submodule update --init
```

## Start development

```sh
cd web
bun install --frozen-lockfile
bun run dev
```

`dev` first runs the Wasm build and then starts Vite. Use the URL printed by Vite. Running `bun run wasm` separately before `dev` is unnecessary.

The Wasm build occurs before Vite starts; there is no Haskell source watcher. After editing Haskell code, run `bun run wasm` from `web/` again or restart `bun run dev`. Frontend source changes use Vite's normal development workflow.

## Generate bindings only

From `web/`:

```sh
bun run wasm
```

Or, from the repository root:

```sh
bash scripts/build-wasm.sh
```

The script:

1. Resolves the configured Wasm compiler and package tool.
2. Adds any `~/.ghc-wasm` helper tools and checks for `wasm-opt`.
3. Runs `scripts/build-bindgen.sh`, which installs the submodule's bindgen executable into `build/tools/` using native GHC.
4. Creates local command wrappers/symlinks for bindgen and prepends `build/tools/` to `PATH`.
5. Runs `ghc-wasm-bindgen build src/Solitaire/Wasm.hs --name solitaire --out web/src/generated/solitaire`.

The Cabal wrapper forwards the compiler and matching package tool explicitly. Do not invoke it as a standalone build entry point; its environment is set by `build-wasm.sh`.

## Compiler overrides

| Variable | Default | Meaning |
| --- | --- | --- |
| `NATIVE_GHC` | `ghc-9.10.3` | Native compiler used to build bindgen |
| `WASM_GHC` | `wasm32-wasi-ghc-9.14` | Wasm compiler command or path |
| `WASM_GHC_PKG` | Derived from `WASM_GHC` by replacing `wasm32-wasi-ghc` with `wasm32-wasi-ghc-pkg` | Matching Wasm package tool |

For unversioned Wasm command names:

```sh
WASM_GHC=wasm32-wasi-ghc bash scripts/build-wasm.sh
```

Set both Wasm variables when custom filenames do not follow the naming convention:

```sh
WASM_GHC=/opt/wasm/bin/compiler WASM_GHC_PKG=/opt/wasm/bin/package-tool bash scripts/build-wasm.sh
```

`SOLITAIRE_WASM_GHC` and `SOLITAIRE_WASM_GHC_PKG` are internal resolved paths passed to the Cabal wrapper, rather than the public configuration inputs.

## Build and preview the frontend

From `web/`:

```sh
bun run build
bun run preview
```

`build` regenerates Wasm, runs `tsc -b`, and creates the Vite production build. `preview` serves that build locally; it does not rebuild it. The Vite output target is `es2022`, supporting the generated module's top-level `await`.

## Generated files

| Location | Contents |
| --- | --- |
| `build/tools/` | Installed bindgen executable and local Wasm command wrappers |
| `dist-newstyle/` | Root Cabal build output and intermediate artifacts |
| `vendor/ghc-wasm-bindgen/dist-newstyle/` | Bindgen's own Cabal build output |
| `web/src/generated/solitaire/` | `solitaire.js`, `solitaire.d.ts`, `solitaire.wasm`, and supporting JavaScript runtime files |
| `web/dist/` | Frontend production output |

Generated binding files are ignored by Git. Edit [Solitaire.Wasm](../src/Solitaire/Wasm.hs) or the underlying engine and regenerate them. See [the API guide](wasm-api.md) for import paths and data representations.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Bindgen source is missing | Initialize the submodule |
| `Wasm compiler not found` | Put the compiler on `PATH` or set `WASM_GHC` |
| `Wasm package tool not found` | Install the matching package tool or set `WASM_GHC_PKG` |
| Native compiler cannot be found | Set `NATIVE_GHC` to the installed native command |
| `wasm-opt not found` | Install Binaryen and expose `wasm-opt` on `PATH` |
| Frontend import cannot find generated bindings | Run `bun run wasm` successfully |
| Browser behavior uses old Haskell rules | Regenerate the bindings; Vite does not watch Haskell sources |
| Search freezes the interface | Move the synchronous `solve` call into a Web Worker |
