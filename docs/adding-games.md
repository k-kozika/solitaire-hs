# Adding and changing games

A game is a [Definition](rule-definitions.md). If a variant can be expressed with the existing constructors, the engine and solver need no game-specific changes.

## Change an existing definition

For example, define three-card Klondike without waste recycling:

```haskell
module Solitaire.Games.Klondike3 (klondike3) where

import Solitaire.Engine
import Solitaire.Games.Klondike (klondike)

klondike3 :: Definition
klondike3 = klondike
  { gameName = "Klondike (draw three, no recycling)"
  , stockRule = DrawTo (Pile Stock 1) (Pile Waste 1) 3 False
  }
```

Place this module at `src/Solitaire/Games/Klondike3.hs`. It inherits the original tableau, foundations, transfers, automatic reveals, and goal. A final draw can take fewer than three cards. Once the stock is empty, `Draw` is unavailable even if the waste contains cards.

## Register a selectable game

In [Solitaire.Games](../src/Solitaire/Games.hs), import the definition and add an ID to `games`:

```haskell
import Solitaire.Games.Klondike3 (klondike3)

-- Add to the existing games list:
-- ("klondike3", klondike3)
```

Choose a unique lowercase ID. The terminal executable, solver executable, and Wasm facade all use this catalog. The terminal interfaces lowercase the input; the Wasm facade expects the exact registered ID.

Add the module to the library's `exposed-modules` in [solitaire-hs.cabal](../solitaire-hs.cabal) if callers should import it directly. If it is an internal module, list it under `other-modules` instead. Re-export the value from `Solitaire.Games` if it should be available through that convenience module.

After registration:

```sh
cabal run solitaire -- klondike3 42
cabal run -O2 solitaire-solve -- klondike3 42 3500
```

Regenerate the Wasm bindings before using the updated catalog from JavaScript. An existing generated binary does not pick up source changes automatically outside the build scripts.

## Define a new layout

When a record update is insufficient, construct a complete `Definition`:

1. Declare the deck, including repeated suits for multiple copies.
2. Declare each pile group once with its pile count.
3. Specify fixed cards and the ordered initial deal. Account for every remaining card with either the deal or a reserve pile.
4. Declare each allowed transfer direction and its move/placement conditions.
5. Choose a stock rule and ordered automatic effects.
6. Choose the goal and test the result with `newGame`.

Existing definitions provide examples of fixed cards and individual foundation rules (Grandfather's Clock), unordered movable groups (Yukon), vacancy-limited runs (FreeCell), and automatic collection (Spider).

If the desired behavior requires a new rule constructor, update execution, definition validation, and any related goal scoring together. Legal enumeration and the solver reuse execution through `legalTransitions`, but still need regression coverage for the new behavior.

## Verify the variant

Add checks to [test/Spec.hs](../test/Spec.hs) for the deal, legal and illegal moves, automatic effects, and the winning condition. For a new catalog entry, the existing catalog-wide checks also exercise seed reproducibility, conservation of cards, and Wasm seed handling.

Use a small constructed board to test a final winning move and replay any returned solver actions through `applyAction`. This separates a rule error from a search that simply needs a larger budget.

```sh
cabal build all
cabal test all --test-show-details=direct
```

Document the chosen variant in [game rules](games.md), including differences such as recycling, rank wrapping, and moves out of foundations.
