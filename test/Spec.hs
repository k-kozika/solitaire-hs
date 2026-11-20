module Main (main) where

import Control.Monad (foldM, forM_, unless)
import Data.List (sort)
import qualified Data.Map.Strict as Map
import Solitaire.Engine
import Solitaire.Games (freecell, games, klondike, spider)
import Solitaire.Solver (SearchResult(..), solve)
import System.Exit (die)

main :: IO ()
main = do
  initialDeals
  klondikeRules
  spiderRules
  freecellRules
  winningMoves
  solverLimits
  solveInitialDeal
  putStrLn "All solitaire checks passed."

initialDeals :: IO ()
initialDeals = do
  k <- succeed (newGame klondike 42)
  check "Klondike tableau and stock" $
    sizes Tableau k == [1 .. 7] && sizes Stock k == [24] &&
    map (map entryFace . pileCards k) (pilesIn Tableau k) ==
      [Up : replicate hidden Down | hidden <- [0 .. 6]]
  s <- succeed (newGame spider 42)
  check "Spider tableau and stock" $
    sizes Tableau s == replicate 4 6 ++ replicate 6 5 && sizes Stock s == [50] &&
    all (\pile -> case map entryFace (pileCards s pile) of
           Up : rest -> all (== Down) rest
           _ -> False) (pilesIn Tableau s)
  f <- succeed (newGame freecell 42)
  check "FreeCell tableau and free cells" $
    sizes Tableau f == replicate 4 7 ++ replicate 4 6 && sizes Cell f == replicate 4 0
    && all ((== Up) . entryFace) (concat (Map.elems f))
  check "Invalid deal and rules fail during setup" $
    rejected (newGame (klondike {initialDeal = [(tableau 99, Up)]}) 42) &&
    rejected (newGame (spider {layout = [(Tableau, 10)]}) 42)
  forM_ games $ \(name, def) ->
    forM_ [1, 2, 42] $ \seed -> do
      board <- succeed (newGame def seed)
      let moveStep current step = case legalActions def current of
            [] -> pure current
            actions -> do
              next <- succeed (applyAction def current (actions !! (step `mod` length actions)))
              check (name ++ " move conserves the deck") (cards next == cards board)
              pure next
      check (name ++ " seed is reproducible") (newGame def seed == Right board)
      check (name ++ " shuffled deck and starting goal") $
        cards board == sort [Card r s' | r <- [Ace .. King], s' <- deckSuits def]
        && not (won def board)
      _ <- foldM moveStep board [0 .. 39]
      pure ()
  where
    sizes group board = map (length . pileCards board) (pilesIn group board)
    cards board = sort [card | Entry _ card <- concat (Map.elems board)]
    entryFace (Entry face _) = face

klondikeRules :: IO ()
klondikeRules = do
  start <- succeed (newGame klondike 42)
  drawn <- foldM (\board _ -> succeed (applyAction klondike board Draw)) start [1 .. 24 :: Int]
  check "Draw-one exhausts the stock and exposes the waste" $
    null (pileCards drawn stock) && length (pileCards drawn waste) == 24 &&
    all (\(Entry face _) -> face == Up) (pileCards drawn waste)
  recycled <- succeed (applyAction klondike drawn Draw)
  check "Waste recycling preserves the original draw order" (recycled == start)
  let drawThree = klondike {stockRule = DrawTo stock waste 3 False}
  alternate <- succeed (newGame drawThree 42)
  afterThree <- succeed (applyAction drawThree alternate Draw)
  check "A definition can change the draw count and recycling" $
    length (pileCards afterThree stock) == 21 &&
    length (pileCards afterThree waste) == 3 &&
    rejected (applyAction drawThree drawn Draw)
  let hidden = Card Ten Hearts
      board = Map.fromList
        [(tableau 1, [up Queen Hearts, up King Clubs, Entry Down hidden])
        ,(tableau 2, []), (tableau 3, [up Jack Spades]), (foundation 1, [])]
      move count from to = applyAction klondike board (Move count from to)
  check "Klondike rejects hidden cards, non-Kings on empty columns and non-Aces on foundations" $
    rejected (move 3 (tableau 1) (tableau 2)) &&
    rejected (move 1 (tableau 1) (tableau 2)) &&
    rejected (move 1 (tableau 1) (foundation 1))
  moved <- succeed (move 2 (tableau 1) (tableau 2))
  check "Klondike moves alternating runs and flips the exposed card" $
    pileCards moved (tableau 1) == [Entry Up hidden] &&
    pileCards moved (tableau 2) == [up Queen Hearts, up King Clubs]

spiderRules :: IO ()
spiderRules = do
  start <- succeed (newGame spider 42)
  next <- succeed (applyAction spider start Draw)
  let columns = pilesIn Tableau start
      vacancy = Map.insert (tableau 1) [] start
      incomplete = Map.adjust (take 9) stock start
  check "Spider deals a whole row in column order" $
    length (pileCards next stock) == 40 &&
    and (zipWith (\pile (Entry _ card) -> pileCards next pile == Entry Up card : pileCards start pile)
          columns (pileCards start stock))
  check "Spider rejects a deal with an empty column or an incomplete row" $
    rejected (applyAction spider vacancy Draw) &&
    rejected (applyAction spider incomplete Draw) &&
    Draw `notElem` legalActions spider vacancy
  let mixed = Map.fromList
        [(tableau 1, [up Five Hearts, up Six Clubs]), (tableau 2, [up Seven Diamonds])
        ,(tableau 3, [up Six Spades]), (tableau 4, [])]
  check "Spider sequences must be suited, while placement may cross suits" $
    rejected (applyAction spider mixed (Move 2 (tableau 1) (tableau 2))) &&
    not (rejected (applyAction spider mixed (Move 1 (tableau 1) (tableau 3)))) &&
    not (rejected (applyAction spider mixed (Move 1 (tableau 1) (tableau 4))))
  let board = Map.fromList
        [(tableau 1, up Ace Spades : [up r Spades | r <- [Ace .. King]])
        ,(tableau 2, [up r Spades | r <- [Two .. King]] ++ [Entry Down (Card Five Hearts)])
        ,(foundation 1, []), (foundation 2, [])]
  completed <- succeed (applyAction spider board (Move 1 (tableau 1) (tableau 2)))
  check "Spider collects two completed runs and exposes the card underneath" $
    all ((== [up r Spades | r <- [Ace .. King]]) . pileCards completed)
      [foundation 1, foundation 2] &&
    null (pileCards completed (tableau 1)) &&
    pileCards completed (tableau 2) == [up Five Hearts]

freecellRules :: IO ()
freecellRules = do
  let run = [up Three Clubs, up Four Hearts, up Five Clubs, up Six Hearts]
      board = Map.fromList
        [(tableau 1, run), (tableau 2, [up Seven Clubs]), (tableau 3, [])
        ,(Pile Cell 1, []), (Pile Cell 2, [up Ace Hearts]), (foundation 1, [])]
      source = tableau 1
  check "FreeCell has no stock and limits cells to one card" $
    rejected (applyAction freecell board Draw) &&
    rejected (applyAction freecell board (Move 2 source (Pile Cell 1))) &&
    rejected (applyAction freecell board (Move 1 source (Pile Cell 2))) &&
    not (rejected (applyAction freecell board (Move 1 source (Pile Cell 1))))
  moved <- succeed (applyAction freecell board (Move 4 source (tableau 2)))
  check "FreeCell uses vacant columns and cells to move runs" $
    pileCards moved (tableau 2) == run ++ [up Seven Clubs]
  check "FreeCell excludes an empty destination from the run limit" $
    rejected (applyAction freecell board (Move 3 source (tableau 3))) &&
    not (rejected (applyAction freecell board (Move 2 source (tableau 3))))
  let move = Move 1 (Pile Cell 2) (foundation 1)
  check "FreeCell can move from a cell to a foundation" (move `elem` legalActions freecell board)

winningMoves :: IO ()
winningMoves = do
  forM_ [klondike, freecell] $ \def -> do
    let goal n s r = (foundation n, [up value s | value <- reverse [Ace .. r]])
        board = Map.fromList
          [(tableau 1, [up King Spades]), goal 1 Clubs King, goal 2 Diamonds King,
           goal 3 Hearts King, goal 4 Spades Queen]
    end <- succeed (applyAction def board (Move 1 (tableau 1) (foundation 4)))
    check (gameName def ++ " recognizes the last foundation move") (not (won def board) && won def end)
    let beforeQueen = Map.insert (tableau 1) [up Queen Spades, up King Spades]
                    $ Map.adjust (drop 1) (foundation 4) board
    checkSolution def beforeQueen
    check "An already won board needs no search budget" (solve 0 def end == Solved [])
  let suits = init (deckSuits spider)
      board = Map.fromList $
        [(foundation n, [up r s | r <- [Ace .. King]]) | (n, s) <- zip [1 ..] suits] ++
        [(foundation 8, []), (tableau 1, [up Ace Spades]), (tableau 2, [up r Spades | r <- [Two .. King]])]
  end <- succeed (applyAction spider board (Move 1 (tableau 1) (tableau 2)))
  check "Spider recognizes the eighth completed sequence" (not (won spider board) && won spider end)
  checkSolution spider board

checkSolution :: Definition -> Board -> IO ()
checkSolution def board = do
  check "An unfinished board needs a search budget" (solve 0 def board == LimitReached)
  case solve 16 def board of
    Solved actions -> do
      end <- succeed (foldM (applyAction def) board actions)
      check (gameName def ++ " solver actions reach a winning board") (not (null actions) && won def end)
    _ -> die ("FAILED: " ++ gameName def ++ " solver did not find a solution.")

solverLimits :: IO ()
solverLimits = do
  let onlyDraw = klondike {deckSuits = [Spades], initialDeal = [], transfers = []}
  board <- succeed (newGame onlyDraw 42)
  check "Search budget can stop a reachable draw cycle" (solve 1 onlyDraw board == LimitReached)
  check "Solver detects repeated boards and exhausts the draw cycle" (solve 16 onlyDraw board == Exhausted)

solveInitialDeal :: IO ()
solveInitialDeal = do
  board <- succeed (newGame klondike 7)
  case solve 3500 klondike board of
    Solved actions -> do
      end <- succeed (foldM (applyAction klondike) board actions)
      check "Klondike solver wins from a seeded initial deal" (won klondike end)
    _ -> die "FAILED: Klondike solver did not solve seed 7."

up :: Rank -> Suit -> Entry
up r s = Entry Up (Card r s)

tableau, foundation :: Int -> Pile
tableau = Pile Tableau
foundation = Pile Foundation

stock, waste :: Pile
stock = Pile Stock 1
waste = Pile Waste 1

succeed :: Either String a -> IO a
succeed = either die pure

rejected :: Either String a -> Bool
rejected = either (const True) (const False)

check :: String -> Bool -> IO ()
check description condition = unless condition (die ("FAILED: " ++ description))
