# JavaScript and WebAssembly API

The hand-written boundary is [Solitaire.Wasm](../src/Solitaire/Wasm.hs). Bindgen generates the JavaScript module and TypeScript declarations from its exports. Rules remain in Haskell; callers select a registered game by ID.

Generate the bindings as described in [Web and WebAssembly development](web-wasm.md). Examples below assume a caller under `web/src/`.

## Import and initialization

```ts
import * as solitaire from './generated/solitaire/solitaire.js'
```

The generated module loads `solitaire.wasm` using top-level `await`. Import completion initializes the module; there is no separate exported initialization function. Calls are synchronous after import. Keep the generated module, Wasm binary, and runtime files together for the bundler to resolve.

## Functions

The declarations use `Map<Pile, Entry[]>` for boards and `Either<string, T>` for fallible calls. `Board` below is a local convenience alias, not an exported generated type.

```ts
import type { Action, Entry, Group, Pile, SearchResult, Either } from './generated/solitaire/solitaire.js'

type Board = Map<Pile, Entry[]>

// API signature summary:
// games(): [string, string][]
// newGame(gameId: string, seed: bigint): Either<string, Board>
// applyAction(gameId: string, board: Board, action: Action): Either<string, Board>
// legalActions(gameId: string, board: Board): Either<string, Action[]>
// won(gameId: string, board: Board): Either<string, boolean>
// solve(budget: number, gameId: string, board: Board): Either<string, SearchResult>
// pileCards(board: Board, pile: Pile): Entry[]
// pilesIn(group: Group, board: Board): Pile[]
```

`games()` returns ID/display-name pairs for the shared game catalog. IDs are exact and case-sensitive here, unlike the terminal interfaces. An unknown ID returns `Left` from functions that resolve a game.

Use a board only with its corresponding game ID. The facade does not associate an ID with a returned board or perform complete board validation on every call.

## Start and update a game

`Either` is represented as `{ Left: error }` or `{ Right: value }`. Handle both branches:

```ts
const gameId = 'klondike'
const result = solitaire.newGame(gameId, 42n)

if ('Left' in result) {
  console.error(result.Left)
} else {
  const board = result.Right
  const actions = solitaire.legalActions(gameId, board)

  if ('Right' in actions && actions.Right.length > 0) {
    const next = solitaire.applyAction(gameId, board, actions.Right[0]!)
    if ('Right' in next) {
      console.log(solitaire.won(gameId, next.Right))
    } else {
      console.error(next.Left)
    }
  } else if ('Left' in actions) {
    console.error(actions.Left)
  }
}
```

A successful action returns a new board including automatic effects. Retain that returned board for the next action. A rejected action returns `Left`; keep the prior state.

### Seeds

Pass a JavaScript `bigint`, such as `42n`, not a `number`. The facade accepts a Haskell `Integer`, verifies `0 <= seed <= 2^64 - 1`, and converts it to the engine's `Word64`. This preserves every seed bit without passing through floating-point numbers.

```ts
solitaire.newGame('klondike', 18446744073709551615n)
solitaire.newGame('klondike', -1n) // Left: out of range
```

Move counts, pile numbers, and solver budgets use JavaScript `number` for Haskell `Int`. Pass integers representable by the generated target rather than assuming every JavaScript number is valid.

## Data representation

| Haskell value | Generated JavaScript representation |
| --- | --- |
| `Clubs`, `Ace`, `Up`, `Tableau` | Strings such as `'Clubs'`, `'Ace'`, `'Up'`, `'Tableau'`, with exported constants |
| `Card rank suit` | `{ $tag: 'Card', rank, suit }` |
| `Entry face card` | `{ $tag: 'Entry', contents: [face, card] }` |
| `Pile group number` | `{ $tag: 'Pile', contents: [group, number] }` |
| `Move count source target` | `{ $tag: 'Move', contents: [count, source, target] }` |
| `Draw` | `{ $tag: 'Draw' }` |
| `Board` | `Map<Pile, Entry[]>` |

Prefer generated constructors and constants:

```ts
const source = solitaire.Pile(solitaire.Tableau, 1)
const target = solitaire.Pile(solitaire.Foundation, 1)
const action = solitaire.Move(1, source, target)
const draw = solitaire.Draw
```

`Move` and `Pile` are constructor functions. `Draw` is a value, not a function. `Card` takes a fields object; `Entry` takes two positional arguments.

### Inspect piles

```ts
const result = solitaire.newGame('klondike', 42n)
if ('Right' in result) {
  const board = result.Right
  for (const pile of solitaire.pilesIn(solitaire.Tableau, board)) {
    const entries = solitaire.pileCards(board, pile)
    for (const entry of entries) {
      const [face, card] = entry.contents
      console.log(face, card.rank, card.suit)
    }
  }
}
```

Entry arrays are exposed-card-first, including the next card in the stock. Reverse a copy when rendering a tableau with its top card on the right. Hide the card identity when `face === solitaire.Down`; the board contains its identity even though it is face down.

JavaScript `Map` compares object keys by identity. A newly constructed `Pile(Tableau, 1)` is not the same key object as the decoded pile in a board. Use `pileCards(board, pile)` for structural pile lookup, or use an actual key obtained from that board when calling `Map.get`. `pileCards` returns `[]` for an absent pile.

## Solver results

The outer `Either` reports facade errors such as an unknown game ID. A successful call contains one of these search results:

```ts
type SearchResult =
  | { $tag: 'Solved'; contents: solitaire.Action[] }
  | { $tag: 'Exhausted' }
  | { $tag: 'LimitReached' }
```

The `Solved.contents` array is already in execution order. Replay it with `applyAction` and the same game ID. `LimitReached` means the expansion budget was consumed, not that the game is unwinnable. See [solver semantics](solver.md) for budget accounting and search limitations.

`solve` blocks the calling thread until it returns. For a browser UI, initialize the module and perform search in a Web Worker. Exchanging requests and results, handling cancellation, and keeping a worker result synchronized with the current board belong to the caller; this repository does not yet include a worker implementation.

## Errors and generated declarations

Rule rejections and facade validation use `Either`. Module loading and marshalling can fail separately; the generated module also exports `HaskellError`. Do not assume a `Left` branch handles every runtime or loading failure.

The generated `solitaire.d.ts` is the precise declaration of the built artifact. If Haskell exports or the pinned bindgen implementation change, regenerate and check those declarations before changing consumers. Do not edit generated bindings by hand.
