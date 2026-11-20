# Solitaire

Klondike、Spider、FreeCellを、共通のHaskellエンジンと端末UIで遊べます。

## ビルドと検証

GHCと標準付属の `base`、`containers` を使います。アーカイブを展開し、このREADMEがあるディレクトリで実行します。GHC 9.6.6で検証済みです。

```sh
mkdir -p build/app build/test
ghc -Wall -Werror -isrc -outputdir build/app -o build/solitaire app/Main.hs
ghc -Wall -Werror -isrc -outputdir build/test -o build/spec test/Spec.hs
./build/spec
```

## 遊び方

```sh
./build/solitaire klondike 42
./build/solitaire spider 42
./build/solitaire freecell 42
```

末尾のシードは省略できます。同じゲームとシードを指定すると、同じ配札を再現できます。

配札前に、64ビットのシードから SplitMix64 の出力混合関数で擬似乱数を作ります。
乱数を残り枚数で割った余りを添字としてカードを1枚ずつ取り出し、その順で配札します。
端末アプリでシードを省略した場合は、起動時の単調時計のナノ秒値を使用します。
Klondikeで捨て札を山札に戻すときは、元の順序に戻します。

| コマンド | 操作 |
| --- | --- |
| `moves` | 現在の盤面で実行できる操作を一覧表示 |
| `move t1 t2` | 場札の1列目から2列目へ1枚移動 |
| `move t1 t2 3` | 1列目の手前から3枚をまとめて移動 |
| `draw` | Klondikeで山札を1枚めくるか、Spiderで各列に1枚配る |
| `help` / `quit` | コマンド一覧を表示 / 終了 |

`t1` などは場札、`f1` などは組札、`c1` などはフリーセル、`s` は山札、`w` は捨て札です。場札の右端が手前のカードで、`##` は裏向きです。

| ゲーム | 採用ルール |
| --- | --- |
| Klondike | 1枚めくり。山札が空になったら `draw` で捨て札を戻します。再利用回数に上限はありません。組札から場札への戻しも可能です。 |
| Spider | 4スート・2デッキ。空列があると山札から配れません。同じスートでKからAまで揃うと自動回収します。 |
| FreeCell | 空きセルと補助に使える空列に応じて、連続した束を一度に移せます。移動先の空列は補助列に含めません。 |

## ソルバー

```sh
mkdir -p build/solve
ghc -O2 -Wall -Werror -isrc -outputdir build/solve -o build/solitaire-solve app/Solve.hs
./build/solitaire-solve klondike 7 3500
```

引数はゲーム、シード、展開する盤面数の上限です。`Solitaire.Solver.solve` は途中の盤面からも呼べます。
3種とも同じ合法手・盤面更新を使い、組札に集まったカードが多い盤面を優先して探索します。同じ盤面は一度だけ探索します。

| 結果 | 意味 |
| --- | --- |
| `Solved [Action]` | 勝利に至る手順が見つかりました。 |
| `Exhausted` | 到達可能な盤面を調べ切りました。 |
| `LimitReached` | 指定上限までに勝利盤面は見つかりませんでした。 |

探索では裏向きのカードと山札の順も既知として扱います。解の最短性は保証しません。

## ルール定義を差し替える

| ゲーム | ルール定義 |
| --- | --- |
| Klondike | [Klondike.hs](src/Solitaire/Games/Klondike.hs) |
| Spider | [Spider.hs](src/Solitaire/Games/Spider.hs) |
| FreeCell | [FreeCell.hs](src/Solitaire/Games/FreeCell.hs) |

各ファイルの `Definition` に、デッキ・場の構成・配札・移動条件・山札操作・自動処理・勝利判定に使う組札グループを指定します。CLIで選べるゲームは [Games.hs](src/Solitaire/Games.hs) の `games` に登録します。

たとえば、3枚めくりで山札を再利用しないKlondikeを追加するには、`Klondike.hs` に次の定義を足してエクスポートし、`Games.hs` で読み込んで `games` に `("klondike3", klondike3)` を追加します。新しい定義も共通の合法手判定とCLIを使います。

```haskell
klondike3 :: Definition
klondike3 = klondike {stockRule = DrawTo (Pile Stock 1) (Pile Waste 1) 3 False}
```

`test/Spec.hs` は配札、合法手、禁止手、自動処理、勝利判定に加え、複数のシードでカードの総数・内訳が操作前後で一致することを確認します。ソルバーが見つけた手順を、3種の終盤盤面とシード7のKlondike初期配札から再実行します。
