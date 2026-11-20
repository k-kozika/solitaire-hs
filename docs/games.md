# Game rules

These are the variants implemented by this repository's [game definitions](../src/Solitaire/Games/). Each definition supplies its own deal, transfers, stock actions, automatic effects, and goal to the common engine.

## Klondike

Game ID: `klondike`. Definition: [Klondike.hs](../src/Solitaire/Games/Klondike.hs).

- One 52-card deck; seven tableau columns containing one through seven cards. Only the top card of each column starts face up. The stock starts with 24 cards; the waste and four foundations start empty.
- Tableau builds downward in alternating colors. An ordered, face-up run can move as a unit. An empty column accepts a King or a run with a King at its bottom.
- Waste and foundation cards can move singly to the tableau. Tableau and waste cards can move singly to foundations, which build upward in suit from Ace to King.
- `draw` turns one stock card face up onto the waste. When the stock is empty, another `draw` returns the entire waste to the stock, face down, preserving the next pass's draw order. Recycling does not also draw a card. Recycling is unlimited.
- Newly exposed tableau cards turn face up automatically.
- Win by collecting all 52 cards in the foundations.

## Spider

Game ID: `spider`. Definition: [Spider.hs](../src/Solitaire/Games/Spider.hs).

- Two full decks, including all four suits: 104 cards. There are ten tableau columns, eight collection foundations, and a stock.
- The first four columns start with six cards each; the remaining six start with five. Only each column's top card starts face up. The stock contains 50 cards.
- Tableau placement builds downward by rank regardless of suit. A multi-card move requires a descending run of a single suit. Any otherwise movable card or run can enter an empty column.
- `draw` deals one face-up card to each tableau column. Every column must be nonempty, and the stock must contain a complete ten-card row.
- A complete face-up, same-suit King-to-Ace run at the top of a column moves automatically to an empty collection foundation. Cards exposed underneath are revealed; multiple exposed complete runs can be collected during one action.
- Collection foundations are not sources for player moves. Win by collecting all 104 cards in the eight foundations.

## FreeCell

Game ID: `freecell`. Definition: [FreeCell.hs](../src/Solitaire/Games/FreeCell.hs).

- One 52-card deck, all face up. The first four of eight tableau columns contain seven cards each; the remaining four contain six. Four free cells and four foundations start empty. There is no stock.
- Tableau builds downward in alternating colors. Any card or otherwise legal run can enter an empty column.
- A free cell accepts one tableau card only when empty. A cell card can move singly to the tableau or a foundation. Foundations also accept single tableau cards and build upward in suit from Ace to King. Foundation cards cannot move back.
- A descending alternating-color run can move between tableau columns if its length does not exceed `(emptyCells + 1) * 2 ^ emptyAuxiliaryColumns`. The source and destination columns are excluded from the auxiliary count. In particular, an empty destination cannot also count as temporary space.
- The engine applies such a run move directly; it does not return an expanded sequence of single-card moves.
- Win by collecting all 52 cards in the foundations.

## Yukon

Game ID: `yukon`. Definition: [Yukon.hs](../src/Solitaire/Games/Yukon.hs).

- One 52-card deck and seven tableau columns of sizes `1, 6, 7, 8, 9, 10, 11`. The first column has one face-up card. Each other column has five face-up cards above one through six face-down cards. Four foundations start empty; there is no stock.
- Any contiguous group of top face-up cards can move together, even if the cards inside the group are unordered.
- The group's bottom card must fit the destination in descending, alternating-color order. An empty column accepts only a group whose bottom card is a King.
- Single tableau cards can move to foundations, building upward in suit from Ace to King. Foundation cards cannot move back.
- Newly exposed tableau cards turn face up automatically.
- Win by collecting all 52 cards in the foundations.

## Golf

Game ID: `golf`. Definition: [Golf.hs](../src/Solitaire/Games/Golf.hs).

- One 52-card deck. Seven tableau columns start with five face-up cards each. One face-up card starts the waste; the remaining 16 cards form the stock. There are no foundations.
- Move one exposed tableau card onto the waste when its rank is exactly one above or below the waste's top card, regardless of suit.
- Queen and King are adjacent in both directions. King and Ace do not wrap. Equal ranks and skipped ranks are illegal.
- Tableau-to-tableau moves and moves out of the waste are unavailable.
- `draw` turns one stock card face up onto the waste without a rank restriction. There is no recycling.
- Win as soon as every tableau column is empty, even if the stock still contains cards. Drawing from the stock alone does not advance this goal.

## Grandfather's Clock

Game ID: `grandfathers-clock`. Definition: [GrandfathersClock.hs](../src/Solitaire/Games/GrandfathersClock.hs).

One 52-card deck is divided between twelve fixed foundation cards and eight tableau columns of five face-up cards. There is no stock. Foundations `f1` through `f12` correspond to clock hours.

| Foundation / hour | Fixed starting card | Final rank | Completed pile size |
| --- | --- | --- | --- |
| `f1` / 1 | Ten of hearts | Ace | 5 |
| `f2` / 2 | Jack of spades | Two | 5 |
| `f3` / 3 | Queen of diamonds | Three | 5 |
| `f4` / 4 | King of clubs | Four | 5 |
| `f5` / 5 | Two of hearts | Five | 4 |
| `f6` / 6 | Three of spades | Six | 4 |
| `f7` / 7 | Four of diamonds | Seven | 4 |
| `f8` / 8 | Five of clubs | Eight | 4 |
| `f9` / 9 | Six of hearts | Nine | 4 |
| `f10` / 10 | Seven of spades | Ten | 4 |
| `f11` / 11 | Eight of diamonds | Jack | 4 |
| `f12` / 12 | Nine of clubs | Queen | 4 |

Move one tableau card at a time. Tableau columns build downward regardless of suit, allowing King onto Ace. Any card can enter an empty tableau column.

Foundations build upward in the starting card's suit, allowing Ace onto King. Each foundation stops accepting cards when its top rank reaches its clock hour: Ace for 1, Jack for 11, Queen for 12. Foundation cards cannot move out.

Win by collecting all 52 cards in the foundations. The fixed cards are removed from the deck before shuffling, so the seed affects the remaining tableau deal.
