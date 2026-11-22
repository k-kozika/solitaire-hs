# Solitaire HS

Define and solve card puzzles using Haskell.
The game is defined in code, and a single engine handles the evaluation of each solver and the victory conditions.

## Presets

Several solitaire games, including Klondike, have already been defined. See the [documentation](docs/games.md) for details.

## Running

This project uses GHC and Cabal. You can interactively explore the engine and game definitions by running `cabal repl lib:solitaire-hs`.

Tested with GHC 9.10.3.

For playing:
```sh
cabal run solitaire -- klondike 42
```

| Commands | Operation |
| --- | --- |
| `moves` | Show legal moves |
| `move t1 t2` | Move one card from the first tableau column to the second |
| `move t1 t2 3` | Move the three frontmost cards from the first column together |
| `draw` | Flip over one card from the stock pile |
| `help` / `quit` |  |

For more details on the commands, see the [documentation](docs/cli.md).

## Docs

Most of the remaining details are covered in the docs. You can find the table of contents [here](docs/README.md).
If you're interested in how the rules are defined, check out [this document](docs/rule-definitions.md) as well.
You can also [run it on the web](docs/wasm-api.md)!

## License

BSD-3-Clause
