# Web and WebAssembly development

The WebAssembly build exports the Haskell engine through `ghc-wasm-bindgen`. The frontend in [web/](../web/) uses Vite, Preact, and TypeScript to play all six registered solitaire games. The Haskell engine remains the source of truth for legal moves and victory.

## Playing in the browser

Choose a game in the opening dialog and optionally enter an unsigned 64-bit decimal seed. An empty seed creates a random deal; the actual seed appears above the board. The same game and seed reproduce the same deal.

Select a card or a face-up group, then select a marked destination. Desktop users can also drag cards to legal destinations. Only legal card selections, destinations, and stock actions are enabled. On narrow screens, scroll inside the card table to reach other columns. All moves also work with Tab and Enter/Space; Escape clears the selection.

The timer measures elapsed time from dealing until victory, including time in other tabs or the new-game dialog. Each successful move or stock action counts as one move. Automatic reveals and collections do not add moves.

**Undo** (Ctrl+Z / Cmd+Z) restores the position before the last move or stock action, including automatic reveals, collected runs, and stock recycling. Undo is repeatable back to the initial deal and reduces the move count; elapsed time is not rewound. The restored position is analyzed again and its old hint is cleared. Undoing the last move of a won game resumes play and the timer. A new deal clears the undo history. Shortcuts leave text editing in the settings dialog alone.

The background solver runs in a separate Web Worker after each board change. Its states are **Analyzing**, **Winning path found**, **No winning path**, and **Unable to determine**. Only an exhaustive search establishes that there is no winning path. The default limits are 3,500 expanded boards and five seconds of search time, configured in `web/src/analysis.ts`. Worker initialization has a separate 15-second deadline. A budget or time limit leaves the position undetermined; a worker error leaves gameplay available.

**Hint** highlights the first action of a discovered winning path without making the move. Analysis includes the identities of face-down cards. Changing the board cancels its old search and invalidates its hint; old worker results cannot update the new position.

After victory, **Another deal** starts the same game with a different random seed. **New Game** opens the game/seed selector. **Undo last move** returns to the position before victory. Closing the results lets you inspect the final board. There is no persistence or automatic solution playback.

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

## GitHub Actions and Pages

Three workflows handle validation and deployment:

- [Haskell Test](../.github/workflows/test.yml) builds the native executables and runs `cabal test all`, using GHC 9.10.3 and Cabal 3.16.1.0. It does not install Wasm tools.
- [Web Test and Build](../.github/workflows/web.yml) installs Bun 1.4.5 and a pinned `ghc-wasm-meta` toolchain with Wasm GHC 9.14. It uses the same native GHC and Cabal versions to generate Wasm, type-check and bundle the frontend, and run the frontend and Wasm tests. The production asset base is the repository's Pages path.
- [GitHub Pages](../.github/workflows/pages.yml) calls both workflows on pushes to `main` and deploys the tested `web/dist` artifact only after both succeed. Manual runs deploy only when the selected branch is `main`.

Pull requests and pushes to other branches run the two validation workflows directly. Native dependencies, Web build dependencies, and the Wasm toolchain have separate caches.

In the repository's **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions** before the first deployment.

## Frontend checks

From `web/`:

```sh
bun run build
bun run test
```

`build` regenerates Wasm, checks TypeScript, and bundles the application and module worker. `test` checks seed parsing, legal selections, session accounting, worker cancellation and stale-result handling, card motion, and board layout. It also exercises all games through the generated Wasm facade and replays the winning path for Klondike seed 7, so run the build before testing.

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
