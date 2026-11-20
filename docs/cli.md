# Terminal interface

The terminal interface is implemented in [app/Main.hs](../app/Main.hs). It reads commands from standard input and prints the current board after each successful action.

## Start a game

```sh
cabal run solitaire -- GAME [SEED]
```

| Game ID | Display name |
| --- | --- |
| `klondike` | Klondike |
| `spider` | Spider |
| `freecell` | FreeCell |
| `yukon` | Yukon |
| `golf` | Golf |
| `grandfathers-clock` | Grandfather's Clock |

Game IDs are case-insensitive in the terminal interface. The seed is an unsigned 64-bit integer, from `0` to `18446744073709551615`, inclusive. If omitted, it is taken from the monotonic clock at startup. The chosen seed is printed with the game name.

```sh
cabal run solitaire -- klondike 42
cabal run solitaire -- grandfathers-clock
cabal run solitaire -- --help
```

The same game definition and seed reproduce the same initial board. Seeds belong to this engine's shuffle algorithm; they are not Microsoft FreeCell deal numbers or a cross-implementation deal format.

## Commands

| Command | Behavior |
| --- | --- |
| `moves` | Print every currently legal action in terminal command syntax |
| `move FROM TO` | Move one exposed card |
| `move FROM TO COUNT` | Move the top `COUNT` cards together |
| `draw` | Execute the game's stock action |
| `help` | Print the command syntax |
| `quit` | Exit the game |

Commands and pile labels are case-insensitive. `COUNT` must be a positive integer within the native `Int` range. A syntactically valid command can still fail if the game rules reject the move.

Examples of command syntax:

```text
moves
move t1 f1
move t3 t2 3
draw
quit
```

The example moves are not guaranteed to be legal for a particular deal. Use `moves` to find available actions. `draw` draws a card in Klondike and Golf, deals a row in Spider, or recycles Klondike's waste when the stock is empty. Games without a stock reject it.

## Pile labels

| Label | Meaning |
| --- | --- |
| `t1`, `t2`, ... | Tableau columns |
| `f1`, `f2`, ... | Foundations |
| `c1`, `c2`, ... | Free cells |
| `s` | First stock pile |
| `w` | First waste pile |

Pile numbers start at one. Only piles in the selected definition exist. The first stock and waste use `s` and `w`, not `s1` and `w1`; additional stock or waste piles in a custom definition use numbered labels.

## Read the board

Cards use ranks `A`, `2` through `10`, `J`, `Q`, and `K`, followed by `C`, `D`, `H`, or `S` for clubs, diamonds, hearts, or spades. `##` is a face-down card; `-` is an empty non-stock pile.

Tableau columns are printed from the buried end to the exposed end. The rightmost card is the top card:

```text
t3: ## KC QH JS
```

Here, `JS` is exposed. Moving three cards selects `KC QH JS`, whose bottom card `KC` must fit the destination. Internal [board lists](engine.md#board-order) use the opposite display direction: their first entry is the exposed card.

The stock displays only its card count. Other non-tableau piles display only their top card.

## Session behavior

An invalid command or rejected action prints an explanation and leaves the board unchanged. If there are no legal actions, `moves` prints `No legal actions.`; the session remains open. A winning board prints `You win!` and exits. End-of-file also exits.

There are no terminal commands for undo, saving, loading, or requesting solver hints. The solver is a [separate executable and library function](solver.md).
