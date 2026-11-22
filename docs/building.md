# Building and testing

Run the commands on this page from the repository root.

## Requirements

The native library, terminal interface, solver, and tests use GHC and Cabal. The package declares GHC 9.10.3 as its tested compiler. Its language is Haskell2010, with `-Wall` enabled for all components.

The library depends on `base` and `containers`; the executables depend on the library. Native builds do not require the Wasm compiler, JavaScript tooling, or the bindgen submodule.

The Cabal package name is `solitire-hs`, including that spelling. The executable names are `solitaire` and `solitaire-solve`.

## Build

```sh
cabal build all
```

The root `cabal.project` selects the current package and enables tests. Cabal stores build output in `dist-newstyle/`.

## Run

Start a terminal game:

```sh
cabal run solitaire -- klondike 42
```

Run a bounded search:

```sh
cabal run -O2 solitaire-solve -- klondike 7 3500
```

See the [terminal interface](cli.md) and [solver](solver.md) pages for arguments and behavior.

## Test

```sh
cabal test all --test-show-details=direct
```

The test suite is defined in [test/Spec.hs](../test/Spec.hs). It checks initial deals, reproducible seeds, card conservation, invalid definitions, fixed cards, pile selectors, game-specific move rules, automatic effects, victory detection, solver limits and solution replay, and the Haskell Wasm facade's game IDs and seed validation.

The Wasm facade checks run as native Haskell tests. They do not instantiate the generated Wasm module or test a browser UI.

## Interactive development

```sh
cabal repl lib:solitire-hs
```

For example, in GHCi:

```haskell
import Solitaire.Engine
import Solitaire.Games (klondike)

let initial = newGame klondike 42
fmap (legalActions klondike) initial
fmap (\board -> pileCards board (Pile Stock 1)) initial
```

## Source map

| Location | Responsibility |
| --- | --- |
| [src/Solitaire/Engine.hs](../src/Solitaire/Engine.hs) | Board model, rule types, dealing, move execution, legal transitions, and goals |
| [src/Solitaire/Games.hs](../src/Solitaire/Games.hs) | Game IDs and the shared game catalog |
| [src/Solitaire/Games/](../src/Solitaire/Games/) | Individual game definitions |
| [src/Solitaire/Solver.hs](../src/Solitaire/Solver.hs) | Bounded search over engine transitions |
| [src/Solitaire/Wasm.hs](../src/Solitaire/Wasm.hs) | Pure engine facade and opaque solver references exported through bindgen |
| [app/Main.hs](../app/Main.hs) | Interactive terminal interface |
| [app/Solve.hs](../app/Solve.hs) | Solver command-line interface |
| [scripts/](../scripts/) | Bindgen and Wasm build scripts |
| [web/](../web/) | Vite / Preact frontend and generated bindings |

For frontend requirements, generated files, and compiler overrides, see [Web and WebAssembly development](web-wasm.md).
