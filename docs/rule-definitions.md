# Rule definition reference

All types on this page are exported by [Solitaire.Engine](../src/Solitaire/Engine.hs). For complete examples, see the [built-in definitions](games.md) and [adding games guide](adding-games.md).

## Definition fields

```haskell
data Definition = Definition
  { gameName    :: String
  , deckSuits   :: [Suit]
  , layout      :: [(Group, Int)]
  , fixedCards  :: [(Pile, Entry)]
  , initialDeal :: [(Pile, Face)]
  , reservePile :: Maybe Pile
  , transfers   :: [Transfer]
  , stockRule   :: StockRule
  , automatic   :: [Automatic]
  , goal        :: Goal
  }
```

| Field | Meaning |
| --- | --- |
| `gameName` | Display name; the selectable ID is registered separately |
| `deckSuits` | Each occurrence contributes all thirteen ranks of that suit; repeating suits creates multiple copies |
| `layout` | Groups and pile counts; each group occurs once with a positive count |
| `fixedCards` | Specific entries removed from the deck and pushed onto named piles before the shuffle |
| `initialDeal` | One destination and face per shuffled card, in dealing order |
| `reservePile` | Destination for undealt cards, placed face down; `Nothing` requires every card to be dealt |
| `transfers` | Allowed source/target routes, move limits, and placement conditions |
| `stockRule` | Behavior of `Draw` |
| `automatic` | Ordered effects applied after initialization and successful actions |
| `goal` | Victory condition |

For one full deck, use `[minBound .. maxBound]` for `deckSuits`. Spider uses `concat (replicate 2 [minBound .. maxBound])`. A repeated card in `fixedCards` consumes another copy; it must exist in the declared deck.

Fixed entries and initial-deal entries are pushed one at a time. Later entries for the same pile become its top. If a reserve pile also received earlier cards, the undealt cards are prepended to those cards.

## Rank sequences

```haskell
data Relation = AnySuit | SameSuit | AlternatingColors
data RankOrder = Linear | Cyclic
data Sequence
  = Descending Relation RankOrder
  | Ascending Relation RankOrder
```

Hearts and diamonds are red; clubs and spades are black. A sequence requires adjacent ranks as well as the specified suit/color relationship.

`Linear` does not connect Ace and King. `Cyclic` allows Ace onto King when ascending and King onto Ace when descending.

For a run, adjacency is checked from its bottom toward its exposed top. For placement, it is checked from the destination's exposed card to the moved group's bottom card.

## Destination placement

```haskell
data Placement
  = EmptyOnly
  | Build Sequence (Maybe Rank)
  | StopAt Rank Placement
```

| Constructor | Behavior |
| --- | --- |
| `EmptyOnly` | Accept only an empty destination |
| `Build sequence Nothing` | Accept any bottom card on an empty pile; on a nonempty pile require the sequence relation |
| `Build sequence (Just rank)` | Require that bottom rank on an empty pile; otherwise use the sequence relation |
| `StopAt terminal placement` | Reject a pile whose existing top rank is `terminal`; otherwise delegate to the nested placement |

`Build` rejects a nonempty destination whose top card is face down. The rank requirement in `Just rank` applies only to an empty destination, so it does not assign a permanent suit or rank to a pile.

Examples:

```haskell
Build (Descending AlternatingColors Linear) (Just King)
Build (Ascending SameSuit Linear) (Just Ace)
StopAt Ace (Build (Ascending SameSuit Cyclic) (Just Ten))
```

The last example describes the placement used by the first clock foundation. It stops when the existing top reaches Ace; it is not a general rank-range constraint.

## Move limits

```haskell
data MoveLimit
  = Single
  | AnyFaceUp
  | Run Sequence
  | ByVacancies Sequence Group Group
```

All moves independently require every selected card to be face up.

- `Single` permits exactly one card.
- `AnyFaceUp` adds no ordering requirement within the selected group, as used by Yukon.
- `Run sequence` requires every adjacent pair within the selected group to match the sequence.
- `ByVacancies sequence cells columns` requires an ordered run with length at most `(1 + vacantCells) * 2 ^ vacantColumns`. Empty source and destination piles are excluded from both vacancy counts. The two auxiliary groups must be distinct and present in the layout.

Destination placement is checked separately. For example, Spider requires a same-suit run to move several cards together but permits placing it on a card of any suit.

## Transfers and selectors

```haskell
data PileSelector = GroupPiles Group | ExactPile Pile
data Transfer = Transfer PileSelector PileSelector MoveLimit Placement
```

`GroupPiles Tableau` selects every tableau pile. `ExactPile (Pile Foundation 1)` selects a specific pile. Every transfer describes one direction; a reverse route must be declared explicitly.

```haskell
Transfer (GroupPiles Tableau) (GroupPiles Foundation) Single
  (Build (Ascending SameSuit Linear) (Just Ace))
```

Transfers are additive. An action is accepted if at least one matching transfer accepts both its move limit and its placement. A restrictive transfer does not override a more permissive one. The engine does not combine a limit accepted by one transfer with a placement accepted only by another.

## Stock rules

```haskell
data StockRule
  = NoStock
  | DrawTo Pile Pile Int Bool
  | DealAcross Pile Group Bool
```

`NoStock` rejects `Draw`.

`DrawTo stock waste count recycle` takes up to `count` cards from the stock and pushes them face up onto the waste. The final card drawn becomes the waste's exposed card. A short final draw is allowed. If the stock is empty and `recycle` is true, a nonempty waste is reversed back into a face-down stock. Recycling consumes the action and does not draw a new card. There is no built-in recycle limit.

`DealAcross stock group requireFilled` deals one face-up card to each pile of `group`, in ascending pile order. It requires enough stock cards for a complete row. When `requireFilled` is true, every target pile must already contain a card. The stock cannot belong to the target group.

## Automatic effects

```haskell
data Automatic
  = RevealTop Group
  | CollectRun Group Group Sequence Int Bool
```

`RevealTop group` flips the exposed entry of each nonempty pile in the group face up.

`CollectRun source target sequence count expose` checks each source pile for an exposed run of exactly `count` top cards, all face up and in sequence. It moves a matching run to the first empty target pile, preserving order. If `expose` is true, it reveals the newly exposed source card. It repeats on that source while another complete run and empty target are available, then continues to the next source.

The source and target groups must differ. Collection fills an empty target pile each time, so this repetition terminates. The rules in `automatic` are each applied once in list order; the complete list is not repeated until stable.

Spider uses:

```haskell
[ RevealTop Tableau
, CollectRun Tableau Foundation (Descending SameSuit Linear) 13 True
]
```

## Goals

```haskell
data Goal = CollectAll Group | Clear Group
```

`CollectAll Foundation` checks whether all deck cards are in foundations. `Clear Tableau` checks whether every tableau is empty. The group must exist in the layout.

## Initialization and validation

`newGame` performs these steps:

1. Construct empty piles numbered from one using `layout`.
2. Validate the nonempty deck, unique positive layout counts, goal group, transfer selectors and vacancy groups, stock rule, and automatic-rule references/counts.
3. Remove and place `fixedCards`, rejecting missing piles or unavailable card copies.
4. Shuffle the remaining deck using the seed.
5. Deal one shuffled card for each `initialDeal` entry, rejecting absent piles or an oversized deal.
6. Place leftovers face down in `reservePile`, or reject leftovers if it is `Nothing`.
7. Apply automatic effects and return the board.

Invalid definitions return `Left message`. Validation checks structural references and card availability; it does not establish that a game is solvable or that automatic effects and goals express the intended variant.
