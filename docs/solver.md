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

This is a heuristic best-first search. It returns the first solution reached in that ordering and does not guarantee a shortest solution. The one-shot expansion budget is not a memory limit: the frontier and seen set can grow substantially. Sessions also have configurable retention limits.

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

## Resumable sessions

```haskell
newSolver :: SolverLimits -> Definition -> Board -> Solver
selectBoard :: Board -> Solver -> Solver
advance :: Int -> Solver -> (SearchProgress, Solver)

defaultSolverLimits = SolverLimits { maxSearches = 8, maxEntries = 100000 }
```

`Solver` is opaque and permanently bound to its `Definition`. Keep the returned
solver after every call. `selectBoard` chooses a starting board without expanding
it. Returning to a retained board resumes its frontier, visited set, paths and
insertion tickets. Each starting board has its own visited set. All searches in
a session share generated transitions, scores and proven results by exact board.
Winning paths register their remaining actions on intermediate boards. Negative
results are registered only after exhaustive proof, never from a cycle or a limit.

`Searching n` means more work remains; `Finished result n` contains only `Solved`
or `Exhausted`; `RetentionLimit n` means the position is still undetermined.
`n` is the selected search's cumulative expansion count. Additional budgets are
clamped at zero and can be split without changing search order or budget use.
Known solution suffixes and proven exhausted boards can resolve without expansions.
`solve` uses these same steps with unrestricted retention and retains its existing
`LimitReached` budget semantics.

Retention entries count each search's visited boards and frontier entries, plus
shared cache keys and stored transitions. Paths and card counts are not separate
entries. When space is needed, whole inactive searches are removed oldest first,
then shared cache keys in insertion order. The active visited set and frontier
are never partially removed. An expansion that cannot fit is rolled back as a
whole and reports `RetentionLimit`; retrying does not lose its pending board or
claim exhaustion. At least the selected search is retained even when configured
limits are smaller than its initial state. Selecting an evicted root starts a
fresh search, which can still use retained shared proof or transitions.

Use `solverStats` to inspect retained search/entry counts and committed transition
generations. To compare cold searches and reuse locally, run:

```sh
cabal exec -- runghc -isrc scripts/benchmark-solver.hs
```

Sessions live only in memory. Create a new solver for a new deal.

One local optimized GHC 9.10.3 run (Klondike seed 7, budget 3,500) measured
56 ms for the previous one-shot algorithm and 93 ms for a cold session. Resuming
with zero additional budget took 0.007 ms; a cached intermediate solution took
1.3 ms and generated no transitions. The solved search expanded 737 boards and
retained 13,400 entries. These are illustrative single-run timings, not performance
thresholds: retaining reusable state adds cold-search work, while resumption and
solution reuse avoid repeating completed expansions.
