# Engine API and board model

Source: [Solitaire.Engine](../src/Solitaire/Engine.hs).

The engine represents rules as a `Definition` and game state as a `Board`. Dealing, move validation, automatic effects, legal transitions, and victory checks are pure functions. The terminal interface, solver, and Wasm facade use the same rules.

## Cards and piles

| Type | Representation |
| --- | --- |
| `Suit` | `Clubs`, `Diamonds`, `Hearts`, `Spades` |
| `Rank` | `Ace`, `Two`, ..., `Ten`, `Jack`, `Queen`, `King` |
| `Card` | `Card { rank :: Rank, suit :: Suit }` |
| `Face` | `Down` or `Up` |
| `Entry` | `Entry Face Card` |
| `Group` | `Stock`, `Waste`, `Tableau`, `Foundation`, `Cell` |
| `Pile` | `Pile Group Int` |
| `Board` | `Map.Map Pile [Entry]` |

Pile numbers start at one in boards created from a definition. Empty piles remain present as keys with empty lists. Cards have no individual copy ID: two copies of the same rank and suit in Spider compare equal.

### Board order

The head of every pile list is its exposed end. For a stock, it is the next card to draw. For a tableau, it is the top card selected first by a move.

```haskell
[Entry Up (Card Jack Spades), Entry Up (Card Queen Hearts), Entry Up (Card King Clubs)]
```

This is a King-to-Jack descending run with Jack exposed. The terminal prints it as `KC QH JS`. Moving all three tests the King against the destination and preserves the list order in the resulting pile.

The board contains the actual identities of face-down cards. `Down` controls visibility and legal moves; it does not hide those identities from the solver or API caller.

## Public functions

```haskell
newGame          :: Definition -> Word64 -> Either String Board
applyAction      :: Definition -> Board -> Action -> Either String Board
legalActions     :: Definition -> Board -> [Action]
legalTransitions :: Definition -> Board -> [(Action, Board)]
won              :: Definition -> Board -> Bool
goalProgress     :: Definition -> Board -> Int
pileCards        :: Board -> Pile -> [Entry]
pilesIn          :: Group -> Board -> [Pile]
```

`newGame` validates the definition, deals a board, and applies automatic rules. See [initialization and validation](rule-definitions.md#initialization-and-validation) for the exact sequence.

`pileCards` returns an empty list for an absent pile as well as an empty pile. `pilesIn` returns existing piles of a group in map order, which gives ascending pile numbers for that group.

## Apply an action

```haskell
data Action = Move Int Pile Pile | Draw
```

`Move count source target` selects the first `count` entries of the source. Execution requires:

1. Different source and target piles, both present in the board.
2. A positive count and enough source cards.
3. Every selected card face up.
4. At least one transfer rule matching both piles, whose move limit and destination placement both accept the selection.

The selected entries are removed from the source and prepended to the destination. `Draw` executes the definition's stock rule instead. Every successful action then applies the automatic rules in their declared order. A failed action returns `Left message`; it does not produce an updated board.

Automatic rules run as an ordered pass, not a general fixed-point calculation. A `CollectRun` rule can repeat collection within a source pile, as described in the [rule reference](rule-definitions.md#automatic-effects).

`applyAction` does not reject actions simply because `won` is already true. Callers decide when to stop a session.

## Enumerate legal transitions

`legalTransitions` tries `Draw` and candidate moves through `applyAction`, retaining only successful results. Candidate moves use the contiguous face-up prefix of each source pile and routes allowed by the transfer selectors. Overlapping transfer rules do not duplicate an action.

`legalActions` returns only the actions from these transitions. Use `legalTransitions` when the successor boards are needed, as in the solver, to avoid calculating each result again.

Action enumeration order is an implementation detail, not a move recommendation. Different actions can produce equivalent boards.

## Goals

`CollectAll group` wins when the number of cards in that group equals the definition's deck size. `Clear group` wins when the group contains no cards.

`goalProgress` returns the collected card count for `CollectAll`. For `Clear`, it returns the deck size minus the number of cards still in the target group. It is a search heuristic, not a percentage; a freshly dealt Golf board already has nonzero progress because stock and waste cards are outside the tableau.

## Seeds and shuffling

`newGame` takes a `Word64` seed. The shuffle advances a 64-bit state and uses the SplitMix64 output mixer to choose and remove one card at a time from the remaining list. Fixed cards are removed before shuffling. Deck order, definition, and seed together determine the deal.

The implementation is deterministic. It is intended for repeatable game deals, not cryptography or compatibility with other solitaire programs' seed numbers.

## Board invariants

Create boards with `newGame` and evolve them with `applyAction` to preserve card counts, pile structure, and automatic effects. A `Board` is an exposed map type, so a caller can also construct arbitrary test positions.

Action execution checks the relevant move conditions but does not validate an entire supplied board against the original deck or deal. Likewise, `won` counts cards; it does not independently prove that a fabricated foundation contains the right cards. Keep a board paired with the definition that created it. Custom positions supplied to the solver should already have any required automatic effects applied.
