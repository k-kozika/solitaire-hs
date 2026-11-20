# Solitaire

Klondike、Spider、FreeCellなどのソリティアを、共通のHaskellエンジンと端末UIで遊べます。

## ビルドと検証

GHCと標準付属の `base`、`containers` を使います。アーカイブを展開し、このREADMEがあるディレクトリで実行します。GHC 9.6.7で検証済みです。

```sh
mkdir -p build/app build/test
ghc -Wall -Werror -isrc -outputdir build/app -o build/solitaire app/Main.hs
ghc -Wall -Werror -isrc -outputdir build/test -o build/spec test/Spec.hs
./build/spec
```

## 遊び方

```sh
./build/solitaire klondike 42
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
| `draw` | 山札を1枚めくるか |
| `help` / `quit` | コマンド一覧を表示 / 終了 |

`t1` などは場札、`f1` などは組札、`c1` などはフリーセル、`s` は山札、`w` は捨て札です。場札の右端が手前のカードで、`##` は裏向きです。

| ゲーム | 採用ルール |
| --- | --- |
| Klondike | 1枚めくり。山札が空になったら `draw` で捨て札を戻します。再利用回数に上限はありません。組札から場札への戻しも可能です。 |
| Spider | 4スート・2デッキ。空列があると山札から配れません。同じスートでKからAまで揃うと自動回収します。 |
| FreeCell | 空きセルと補助に使える空列に応じて、連続した束を一度に移せます。移動先の空列は補助列に含めません。 |
| Yukon | 山札なし。順番の揃っていない表向きの束も移動できます。移動先との接続は赤黒交互の降順で、空列にはKを底とする束だけを置けます。組札からの戻しはできません。 |
| Golf | 場札から捨て札`w`へ、スート不問でランクが±1のカードを1枚移動できます。K↔Aは不可、Q↔Kは可。山札の再利用はなく、山札が残っていても場札が空なら勝利です。 |
| Grandfather's Clock | 組札`f1`〜`f12`が時計の1時〜12時に対応します。同スートの昇順でK→Aも許し、各組札は時刻のランク（1時はA、11時はJ、12時はQ）で止まります。場札はスート不問の降順・1枚移動でA→Kも可、空列には任意のカードを置けます。組札からの移動はできません。 |

## ソルバー

```sh
mkdir -p build/solve
ghc -O2 -Wall -Werror -isrc -outputdir build/solve -o build/solitaire-solve app/Solve.hs
./build/solitaire-solve klondike 7 3500
```

引数はゲーム、シード、展開する盤面数の上限です。`Solitaire.Solver.solve` は途中の盤面からも呼べます。
6種とも同じ合法手・盤面更新を使います。

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
| Yukon | [Yukon.hs](src/Solitaire/Games/Yukon.hs) |
| Golf | [Golf.hs](src/Solitaire/Games/Golf.hs) |
| Grandfather's Clock | [GrandfathersClock.hs](src/Solitaire/Games/GrandfathersClock.hs) |

各ファイルの `Definition` に、デッキ・場の構成・固定カード・配札・移動条件・山札操作・自動処理・勝利条件を指定します。CLIで選べるゲームは [Games.hs](src/Solitaire/Games.hs) の `games` に登録します。

| 定義 | 指定する内容 |
| --- | --- |
| `fixedCards :: [(Pile, Entry)]` | シャッフル前にデッキから取り出す固定カード。記載順に各山の手前へ積みます。同じカードを複数指定する場合も、デッキにある枚数までです。 |
| `initialDeal :: [(Pile, Face)]` | 固定カードを配置後、残りのデッキをシャッフルして、この順に配ります。未配札分は`reservePile`へ裏向きで置きます。 |
| `Ascending relation rankOrder` / `Descending relation rankOrder` | スート・色の関係と、`Linear`（循環なし）または`Cyclic`（KとAが隣接）を指定します。 |
| `Transfer from to limit placement` | 移動元・移動先には`GroupPiles Tableau`のようなグループ指定、または`ExactPile (Pile Foundation 1)`のような個別指定を使います。複数のルールは、いずれかを満たせば移動可能です。 |
| `AnyFaceUp` | 表向きの束なら、内部の順番を問わずまとめて動かせます。移動先との接続条件は別に検査します。 |
| `StopAt terminal placement` | 移動先の先頭が`terminal`なら受け入れを禁止します。それ以外では内側の配置条件を使います。 |
| `goal = CollectAll group` / `goal = Clear group` | 全カードを指定グループへ集めるか、指定グループを空にすれば勝利です。 |

`newGame`は配置先・ルールの参照先・カードの不足を検査し、不正な定義には`Left`を返します。
`Board`と`Action`は全ゲームで共通です。`newGame`・`applyAction`・`legalTransitions`・`won`・`solve`はIOを伴わない純粋関数です。
探索用の`goalProgress`は`CollectAll`では集約済み枚数、`Clear`ではデッキ枚数から対象グループの残枚数を引いた値を返します。
従来の定義からは`fixedCards = []`を追加し、順序に`Linear`、移動元・移動先に`GroupPiles`を指定し、`goalGroup`を`goal = CollectAll ...`へ置き換えます。

たとえば、3枚めくりで山札を再利用しないKlondikeを追加するには、`Klondike.hs` に次の定義を足してエクスポートし、`Games.hs` で読み込んで `games` に `("klondike3", klondike3)` を追加します。新しい定義も共通の合法手判定とCLIを使います。

```haskell
klondike3 :: Definition
klondike3 = klondike {stockRule = DrawTo (Pile Stock 1) (Pile Waste 1) 3 False}
```

`test/Spec.hs` は配札、固定カードの枚数管理、個別の山のルール、合法手、禁止手、自動処理、勝利判定に加え、複数のシードでカードの総数・内訳が操作前後で一致することを確認します。ソルバーが見つけた手順を、全6種の終盤盤面とシード7のKlondike初期配札から再実行します。
