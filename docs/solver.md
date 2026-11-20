# Solver

Source: [Solitaire.Solver](../src/Solitaire/Solver.hs). The solver searches boards using the same `legalTransitions` and `won` functions as gameplay. It supports every registered definition without separate game-specific move logic.

## Command-line use

```sh
cabal run -O2 solitaire-solve -- GAME SEED BUDGET
```

All three arguments are required. Game IDs are case-insensitive. `SEED` is an unsigned 64-bit integer; `BUDGET` is a nonnegative integer no larger than the executable's `maxBound :: Int`.

```sh
cabal run -O2 solitaire-solve -- klondike 7 3500
```

This seed and budget are also exercised by the native test suite. Optimization is useful for search performance but does not change the rules.

## Results

```haskell
data SearchResult
  = Solved [Action]
  | Exhausted
  | LimitReached
```

| Result | Meaning | Terminal output |
| --- | --- | --- |
| `Solved actions` | A path to a winning board was found | `Solved in N actions.`, then one Haskell action per line |
| `Exhausted` | The frontier is empty; no winning board is reachable under the supplied rules and state | `No solution in the reachable state space.` |
| `LimitReached` | Search needs another expansion but has no remaining budget | `Search limit reached.` |

`LimitReached` does not establish that a deal is unwinnable. The command reports search outcomes as text; they are not assigned distinct process exit codes. Invalid arguments or a failed initial deal terminate with an error.

Actions are printed with their derived Haskell representation, such as `Move 1 (Pile Tableau 1) (Pile Foundation 1)` and `Draw`. This output is not directly the interactive terminal's `move t1 f1` syntax.

## Budget semantics

The budget counts expanded boards, not generated successors, visited boards, moves in the solution, or elapsed time. One expansion enumerates all legal transitions of a board.

The search checks for a winning board before spending an expansion. An already won board returns `Solved []` with zero budget. A winning successor can also be recognized after the last permitted expansion. A non-winning initial board with zero budget returns `LimitReached`, even if it would prove to have no legal moves.

At the library level a negative budget is clamped to zero. The command-line interface rejects negative budgets.

## Search order

The frontier is ordered by:

1. Higher `goalProgress`.
2. Fewer face-down cards outside stock piles.
3. More empty tableau columns and free cells.
4. Shallower path depth.
5. Insertion order as a final tie-breaker.

Boards are marked seen when enqueued. Exact duplicate boards are not enqueued again, which lets searches terminate on cycles such as repeatedly recycling a stock. Pile numbers and the complete card arrangement are part of board equality; the solver does not normalize symmetric foundations, columns, or cells.

This is a heuristic best-first search. It returns the first solution reached in that ordering and does not guarantee a shortest solution. The expansion budget is not a memory limit: the frontier and seen set can grow substantially.

The board includes face-down card identities. The solver therefore searches with knowledge of the complete deal, rather than modeling decisions made without knowing hidden cards.

## Library use and replay

```haskell
solve :: Int -> Definition -> Board -> SearchResult
```

Search can begin from an initial deal or a partially played board. Supply the same definition used to create and update that board.

```haskell
import Control.Monad (foldM)
import Solitaire.Engine
import Solitaire.Games (klondike)
import Solitaire.Solver

solveAndReplay :: Either String Bool
solveAndReplay = do
  board <- newGame klondike 7
  case solve 3500 klondike board of
    Solved actions -> do
      final <- foldM (applyAction klondike) board actions
      pure (won klondike final)
    Exhausted -> Left "No reachable winning board."
    LimitReached -> Left "Search budget exhausted."
```

The returned list is in execution order and contains explicit player actions only. Automatic reveals and collections happen when each action is replayed through the engine.

In JavaScript, search is synchronous after module initialization. Use a Web Worker for interactive browser use; see the [Wasm API](wasm-api.md#solver-results).
