module Main (main) where

import Control.Monad (foldM, forM_, unless)
import Data.List (nub, sort)
import qualified Data.Map.Strict as Map
import Solitaire.Engine
import Solitaire.Games (freecell, games, golf, grandfathersClock, klondike, spider, yukon)
import Solitaire.Solver
import qualified Solitaire.Wasm as Wasm
import System.Exit (die)

main :: IO ()
main = do
  initialDeals
  fixedDeals
  selectors
  transitionEnumeration
  klondikeRules
  spiderRules
  freecellRules
  yukonRules
  golfRules
  clockRules
  winningMoves
  solverLimits
  solveInitialDeal
  solverSessions
  wasmSessions
  wasmApi
  putStrLn "All solitaire checks passed."

wasmApi :: IO ()
wasmApi = do
  check "Wasm game catalog matches the engine" $
    Wasm.games == [(name, gameName def) | (name, def) <- games]
  forM_ games $ \(name, def) -> do
    forM_ [0, 42, 2 ^ (64 :: Int) - 1] $ \seed ->
      check (name ++ " Wasm preserves the seed") $
        Wasm.newGame name seed == newGame def (fromInteger seed)
    check (name ++ " Wasm rejects seed overflow and underflow") $
      rejected (Wasm.newGame name (-1)) &&
      rejected (Wasm.newGame name (2 ^ (64 :: Int)))
  check "Wasm rejects unknown game IDs" $ rejected (Wasm.newGame "unknown-game" 0)

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
  y <- succeed (newGame yukon 42)
  check "Yukon has seven columns with one or five exposed cards" $
    sizes Tableau y == [1, 6, 7, 8, 9, 10, 11] &&
    map (map entryFace . pileCards y) (pilesIn Tableau y) ==
      [[Up]] ++ [replicate 5 Up ++ replicate hidden Down | hidden <- [1 .. 6]] &&
    null (pilesIn Stock y) && sizes Foundation y == replicate 4 0
  g <- succeed (newGame golf 42)
  check "Golf has 35 exposed tableau cards, one waste and 16 stock cards" $
    sizes Tableau g == replicate 7 5 && sizes Waste g == [1] && sizes Stock g == [16] &&
    all ((== Up) . entryFace) (concatMap (pileCards g) (waste : pilesIn Tableau g)) &&
    all ((== Down) . entryFace) (pileCards g stock)
  c <- succeed (newGame grandfathersClock 42)
  check "Clock has twelve fixed foundations and eight exposed columns" $
    sizes Tableau c == replicate 8 5 && sizes Foundation c == replicate 12 1 &&
    map (pileCards c . foundation) [1 .. 12] == map (: []) clockBases &&
    all ((== Up) . entryFace) (concat (Map.elems c))
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

fixedDeals :: IO ()
fixedDeals = do
  let base = klondike {initialDeal = []}
      ace = up Ace Spades
      pair = [(foundation 1, ace), (foundation 1, ace)]
      one = base {fixedCards = take 1 pair}
  board <- succeed (newGame one 42)
  check "Fixed cards are removed before shuffling" $
    pileCards board (foundation 1) == [ace] && length (pileCards board stock) == 51 &&
    all (\(Entry _ card) -> card /= Card Ace Spades) (pileCards board stock)
  two <- succeed (newGame (spider {initialDeal = [], fixedCards = pair}) 42)
  check "Fixed cards consume individual copies in a multi-deck game" $
    pileCards two (foundation 1) == [ace, ace] && length (pileCards two stock) == 102 &&
    length [() | Entry _ (Card Ace Spades) <- pileCards two stock] == 0
  ordered <- succeed (newGame (base {fixedCards = [(foundation 1, ace),
                                                   (foundation 1, up Two Spades)]}) 42)
  check "Fixed entries are pushed in the declared order" $
    pileCards ordered (foundation 1) == [up Two Spades, ace]
  check "Invalid fixed cards, selectors and goals fail during setup" $
    rejected (newGame (base {fixedCards = pair}) 42) &&
    rejected (newGame (one {deckSuits = [Hearts]}) 42) &&
    rejected (newGame (base {fixedCards = [(foundation 99, ace)]}) 42) &&
    rejected (newGame (yukon {transfers =
      [Transfer (ExactPile (tableau 99)) (GroupPiles Foundation) Single EmptyOnly]}) 42) &&
    rejected (newGame (yukon {transfers =
      [Transfer (GroupPiles Tableau) (ExactPile (foundation 99)) Single EmptyOnly]}) 42) &&
    rejected (newGame (yukon {goal = Clear Stock}) 42) &&
    rejected (newGame (grandfathersClock {initialDeal = replicate 41 (tableau 1, Up)}) 42) &&
    rejected (newGame (grandfathersClock {initialDeal = replicate 39 (tableau 1, Up)}) 42)

selectors :: IO ()
selectors = do
  let placement = Build (Ascending SameSuit Linear) (Just Ace)
      exact = Transfer (ExactPile (tableau 1)) (ExactPile (foundation 2)) Single placement
      grouped = Transfer (GroupPiles Tableau) (GroupPiles Foundation) Single placement
      def = yukon {transfers = [exact]}
      board = Map.fromList [(tableau 1, [up Ace Spades]), (tableau 2, [up Ace Hearts]),
                            (foundation 1, []), (foundation 2, [])]
      action = Move 1 (tableau 1) (foundation 2)
  check "Exact selectors restrict both source and destination" $
    legalActions def board == [action] &&
    rejected (applyAction def board (Move 1 (tableau 2) (foundation 2))) &&
    rejected (applyAction def board (Move 1 (tableau 1) (foundation 1)))
  let overlap = def {transfers = [exact, grouped, grouped]}
      actions = legalActions overlap board
  check "Overlapping selectors are additive and do not duplicate actions" $
    length actions == 4 && length (nub actions) == 4 && action `elem` actions
  forM_ (legalTransitions overlap board) $ \(move, next) ->
    check "Enumerated transitions use the same rules as execution" $
      applyAction overlap board move == Right next

-- Brute-force execution is independent of the candidate-generation bounds.
-- Compare complete transitions in order: search tie-breaking depends on it.
transitionEnumeration :: IO ()
transitionEnumeration = do
  forM_ games $ \(name, def) ->
    forM_ [0, 7, 42] $ \seed -> do
      initial <- succeed (newGame def seed)
      _ <- foldM (walk name def) initial [0 .. 39 :: Int]
      pure ()
  let descending = Descending AlternatingColors Linear
      cyclic = Descending AnySuit Cyclic
      board = Map.fromList
        [(tableau 1, [up Ace Clubs, up Two Hearts, up Three Clubs,
                      up Seven Hearts, Entry Down (Card King Spades)])
        ,(tableau 2, [up Four Hearts]), (tableau 3, [])
        ,(tableau 4, [up King Hearts, up Ace Spades, up Two Hearts])
        ,(Pile Cell 1, []), (Pile Cell 2, [up Five Clubs])]
      route limit = Transfer (GroupPiles Tableau) (GroupPiles Tableau) limit
                      (Build descending Nothing)
      limits = [Single, AnyFaceUp, Run descending, Run cyclic,
                ByVacancies descending Cell Tableau,
                ByVacancies descending Tableau Cell]
  forM_ limits $ \limit ->
    verifyTransitions "Custom move limit" (freecell {transfers = [route limit]}) board
  let overlap = freecell {transfers =
        [route Single, route (Run descending), route AnyFaceUp, route AnyFaceUp]}
  verifyTransitions "Overlapping move limits" overlap board
  let vacancies = freecell {transfers =
        [Transfer (GroupPiles Tableau) (GroupPiles Cell)
          (ByVacancies descending Cell Tableau) EmptyOnly]}
  verifyTransitions "Vacant cell destination is excluded" vacancies board
  check "A vacant cell destination cannot also increase the move capacity" $
    Move 3 (tableau 1) (Pile Cell 1) `notElem` legalActions vacancies board &&
    Move 2 (tableau 1) (Pile Cell 1) `elem` legalActions vacancies board
  let cyclicDef = freecell {transfers =
        [Transfer (GroupPiles Tableau) (GroupPiles Tableau) (Run cyclic)
          (Build cyclic Nothing)]}
      cyclicBoard = Map.insert (tableau 2) [up Three Clubs] board
  verifyTransitions "Cyclic run bounds" cyclicDef cyclicBoard
  check "Run candidates include a sequence crossing King and Ace" $
    Move 3 (tableau 4) (tableau 2) `elem` legalActions cyclicDef cyclicBoard
  where
    walk name def board step = do
      verifyTransitions name def board
      case legalTransitions def board of
        [] -> pure board
        transitions -> pure (snd (transitions !! (step `mod` length transitions)))

verifyTransitions :: String -> Definition -> Board -> IO ()
verifyTransitions name def board =
  check (name ++ " transitions match brute-force execution in order") $
    legalTransitions def board ==
      [(action, next) | action <- Draw : moves,
                        Right next <- [applyAction def board action]]
  where
    moves = [Move count source target
            | (source, entries) <- Map.toList board
            , target <- Map.keys board, source /= target
            , count <- [1 .. length entries]]

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

yukonRules :: IO ()
yukonRules = do
  let stack = [up Jack Spades, up Three Hearts, up Five Clubs]
      hidden = Entry Down (Card Eight Hearts)
      board = Map.fromList
        [(tableau 1, stack ++ [hidden]), (tableau 2, [up Six Hearts]),
         (tableau 3, [up Queen Hearts]), (tableau 4, []),
         (tableau 5, [up Two Hearts, up King Spades]), (foundation 1, [])]
      move count target = applyAction yukon board (Move count (tableau 1) target)
  next <- succeed (move 3 (tableau 2))
  check "Yukon moves an unordered face-up stack and reveals the card below" $
    pileCards next (tableau 1) == [up Eight Hearts] &&
    pileCards next (tableau 2) == stack ++ [up Six Hearts]
  check "Yukon tests the stack's bottom card, visibility and empty-column rank" $
    rejected (move 3 (tableau 3)) && rejected (move 4 (tableau 2)) &&
    rejected (move 3 (tableau 4)) && rejected (move 0 (tableau 4)) &&
    rejected (move 2 (foundation 1)) && rejected (applyAction yukon board Draw)
  kings <- succeed (applyAction yukon board (Move 2 (tableau 5) (tableau 4)))
  check "Yukon accepts an unordered stack headed by a King on an empty column" $
    pileCards kings (tableau 4) == [up Two Hearts, up King Spades]
  let foundationBoard = Map.fromList [(tableau 1, [up Ace Clubs]), (foundation 1, [])]
  banked <- succeed (applyAction yukon foundationBoard (Move 1 (tableau 1) (foundation 1)))
  check "Yukon foundations start with Aces and cannot move back" $
    rejected (applyAction yukon banked (Move 1 (foundation 1) (tableau 1)))

golfRules :: IO ()
golfRules = do
  let attempt card top = applyAction golf
        (Map.fromList [(tableau 1, [Entry Up card]), (waste, [Entry Up top])])
        (Move 1 (tableau 1) waste)
  check "Golf builds up and down without regard to suit" $
    all (not . rejected)
      [ attempt (Card Five Hearts) (Card Four Hearts)
      , attempt (Card Five Clubs) (Card Six Diamonds)
      , attempt (Card Queen Hearts) (Card King Spades)
      , attempt (Card King Hearts) (Card Queen Spades)
      , attempt (Card Ace Spades) (Card Two Hearts)
      , attempt (Card Two Spades) (Card Ace Hearts)
      ]
  check "Golf rejects K/A wrapping, equal ranks and skipped ranks" $
    all rejected
      [ attempt (Card Ace Hearts) (Card King Spades)
      , attempt (Card King Hearts) (Card Ace Spades)
      , attempt (Card Five Hearts) (Card Five Spades)
      , attempt (Card Three Hearts) (Card Five Spades)
      ]
  let board = Map.fromList
        [(tableau 1, [up Five Hearts, up Six Clubs]), (tableau 2, []),
         (waste, [up Four Spades]), (stock, [])]
  check "Golf only moves a single exposed tableau card to waste" $
    rejected (applyAction golf board (Move 2 (tableau 1) waste)) &&
    rejected (applyAction golf board (Move 1 (tableau 1) (tableau 2))) &&
    rejected (applyAction golf board (Move 1 waste (tableau 1))) &&
    rejected (applyAction golf (Map.insert (tableau 1) [Entry Down (Card Five Hearts)] board)
              (Move 1 (tableau 1) waste))
  progressed <- succeed (applyAction golf board (Move 1 (tableau 1) waste))
  check "Clearing a tableau card advances the Golf search score" $
    goalProgress golf progressed == goalProgress golf board + 1
  start <- succeed (newGame golf 42)
  exhausted <- foldM (\current _ -> succeed (applyAction golf current Draw)) start [1 .. 16 :: Int]
  check "Golf exposes stock cards without recycling or advancing the goal" $
    null (pileCards exhausted stock) && length (pileCards exhausted waste) == 17 &&
    all (\(Entry face _) -> face == Up) (pileCards exhausted waste) &&
    goalProgress golf exhausted == goalProgress golf start &&
    not (won golf exhausted) && rejected (applyAction golf exhausted Draw) &&
    Draw `notElem` legalActions golf exhausted

clockRules :: IO ()
clockRules = do
  let def = grandfathersClock
      foundationBoard card top = Map.fromList
        [(tableau 1, [card]), (foundation 1, [top])]
      move card top = applyAction def (foundationBoard card top)
        (Move 1 (tableau 1) (foundation 1))
  wrapped <- succeed (move (up Ace Hearts) (up King Hearts))
  check "Clock foundations wrap K to A in suit" $
    pileCards wrapped (foundation 1) == [up Ace Hearts, up King Hearts] &&
    rejected (move (up Ace Spades) (up King Hearts))
  let tableauBoard = Map.fromList
        [(tableau 1, [up King Clubs]), (tableau 2, [up Ace Hearts]), (tableau 3, [])]
  check "Clock tableaus wrap A to K and allow any card on empty columns" $
    not (rejected (applyAction def tableauBoard (Move 1 (tableau 1) (tableau 2)))) &&
    not (rejected (applyAction def tableauBoard (Move 1 (tableau 2) (tableau 3))))
  check "Clock has no stock, stack moves or foundation-to-tableau moves" $
    rejected (applyAction def tableauBoard Draw) &&
    rejected (applyAction def (Map.insert (tableau 1) [up Queen Hearts, up King Clubs] tableauBoard)
              (Move 2 (tableau 1) (tableau 3))) &&
    rejected (applyAction def (foundationBoard (up King Clubs) (up Ace Hearts))
              (Move 1 (foundation 1) (tableau 1)))
  forM_ (zip3 [1 ..] clockBases [Ace .. Queen]) $ \(hour, Entry _ base, terminal) -> do
    let suit' = suit base
        previous = toEnum ((fromEnum terminal + 12) `mod` 13)
        following = toEnum ((fromEnum terminal + 1) `mod` 13)
        before = Map.fromList
          [(tableau 1, [up terminal suit']), (foundation hour, [up previous suit'])]
        action = Move 1 (tableau 1) (foundation hour)
    complete <- succeed (applyAction def before action)
    let after = Map.insert (tableau 1) [up following suit'] complete
    check ("Clock foundation " ++ show hour ++ " stops at its hour") $
      action `elem` legalActions def before &&
      rejected (applyAction def after action) && action `notElem` legalActions def after

clockBases :: [Entry]
clockBases =
  [up Ten Hearts, up Jack Spades, up Queen Diamonds, up King Clubs,
   up Two Hearts, up Three Spades, up Four Diamonds, up Five Clubs,
   up Six Hearts, up Seven Spades, up Eight Diamonds, up Nine Clubs]

winningMoves :: IO ()
winningMoves = do
  forM_ [klondike, freecell, yukon] $ \def -> do
    let foundationCards n s r = (foundation n, [up value s | value <- reverse [Ace .. r]])
        board = Map.fromList
          [(tableau 1, [up King Spades]), foundationCards 1 Clubs King, foundationCards 2 Diamonds King,
           foundationCards 3 Hearts King, foundationCards 4 Spades Queen]
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
  let golfBoard = Map.fromList
        [(tableau 1, [up Five Hearts]), (tableau 2, []),
         (waste, [up Four Clubs]), (stock, [Entry Down (Card Ten Spades)])]
  golfEnd <- succeed (applyAction golf golfBoard (Move 1 (tableau 1) waste))
  check "Golf wins when tableaus are empty even with cards left in stock" $
    not (won golf golfBoard) && won golf golfEnd && not (null (pileCards golfEnd stock)) &&
    solve 0 golf golfEnd == Solved []
  checkSolution golf golfBoard
  let completeClock = Map.fromList
        [(foundation hour,
          [up (toEnum ((fromEnum (rank base) + offset) `mod` 13)) (suit base)
          | offset <- reverse [0 .. (if hour <= 4 then 4 else 3)]])
        | (hour, Entry _ base) <- zip [1 .. 12] clockBases]
      clockEnd = Map.insert (tableau 1) [] completeClock
      clockBefore = Map.insert (tableau 1) [up Ace Hearts]
                  $ Map.adjust (drop 1) (foundation 1) clockEnd
  check "Clock wins with the twelve completed clock-face foundations" $
    won grandfathersClock clockEnd && not (won grandfathersClock clockBefore) &&
    map (\pile -> length (pileCards clockEnd pile)) (pilesIn Foundation clockEnd) ==
      replicate 4 5 ++ replicate 8 4 &&
    map (\pile -> case pileCards clockEnd pile of
           Entry _ card : _ -> rank card
           [] -> King) (pilesIn Foundation clockEnd) == [Ace .. Queen] &&
    sort [card | Entry _ card <- concat (Map.elems clockEnd)] ==
      sort [Card r s | r <- [Ace .. King], s <- [Clubs .. Spades]] &&
    solve 0 grandfathersClock clockEnd == Solved []
  checkSolution grandfathersClock clockBefore

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

solverSessions :: IO ()
solverSessions = do
  let a = Map.fromList [(tableau 1, [up Five Hearts, up Six Clubs]),
                        (waste, [up Four Spades]), (stock, [])]
      b = Map.insert (tableau 1) [up Ten Hearts] a
      fresh = newSolver defaultSolverLimits golf a
      (first, saved) = advance 1 fresh
      (batch, batchSolver) = advance 2 fresh
      (split, splitSolver) = advance 1 saved
  check "Zero and negative session budgets leave an unfinished search untouched" $
    fst (advance 0 fresh) == Searching 0 && fst (advance (-4) fresh) == Searching 0
  check "Splitting budgets preserves result, path, expansion count and generated work" $
    first == Searching 1 && split == batch &&
    transitionGenerations (solverStats splitSolver) ==
      transitionGenerations (solverStats batchSolver)
  check "Completed searches remain completed without spending more budget" $
    fst (advance 100 splitSolver) == split
  let other = selectBoard b saved
      (otherResult, otherDone) = advance 1 other
      resumed = selectBoard a otherDone
  check "A to B to A resumes A without sharing B's visited set" $
    otherResult == Finished Exhausted 1 &&
    fst (advance 0 resumed) == Searching 1 && fst (advance 1 resumed) == batch
  middle <- succeed (applyAction golf a (Move 1 (tableau 1) waste))
  let (reuse, reused) = advance 0 (selectBoard middle batchSolver)
  check "A solved path registers the remaining actions on intermediate boards" $
    reuse == Finished (Solved [Move 1 (tableau 1) waste]) 0 &&
    transitionGenerations (solverStats reused) == transitionGenerations (solverStats batchSolver)
  let evicted = selectBoard a (selectBoard b
        (snd (advance 1 (newSolver (SolverLimits 1 1000) golf a))))
  check "Old inactive searches are evicted whole and restart safely" $
    retainedSearches (solverStats evicted) == 1 &&
    fst (advance 0 evicted) == Searching 0 && fst (advance 2 evicted) == batch
  let tiny = newSolver (SolverLimits 8 2) golf a
      (stopped, intact) = advance 100 tiny
  check "Retention rejects an entire expansion and preserves its prior state" $
    stopped == RetentionLimit 0 && fst (advance 0 intact) == Searching 0 &&
    fst (advance 1 intact) == stopped && retainedEntries (solverStats intact) == 2
  let onlyDraw = klondike {deckSuits = [Spades], initialDeal = [], transfers = []}
  cycleBoard <- succeed (newGame onlyDraw 42)
  let cycleStart = newSolver defaultSolverLimits onlyDraw cycleBoard
      chunks 0 current = advance 0 current
      chunks n current = case advance 1 current of
        (Searching _, next) -> chunks (n - 1 :: Int) next
        done -> done
  check "Chunked cycles exhaust only after the complete reachable space" $
    fst (chunks 20 cycleStart) == fst (advance 20 cycleStart) &&
    fst (advance 1 cycleStart) == Searching 1
  let twoCycle = Map.fromList [(stock, [Entry Down (Card Ace Spades)]), (waste, [])]
      (cycleFirst, cycleSaved) = advance 1 (newSolver defaultSolverLimits onlyDraw twoCycle)
  cycleNext <- succeed (applyAction onlyDraw twoCycle Draw)
  let (independent, nextSaved) = advance 1 (selectBoard cycleNext cycleSaved)
  check "Overlapping cyclic searches keep independent visited sets" $
    cycleFirst == Searching 1 && independent == Searching 1 &&
    fst (advance 0 (selectBoard twoCycle nextSaved)) == Searching 1 &&
    fst (advance 1 (selectBoard twoCycle nextSaved)) == Finished Exhausted 2
  let (_, combined) = advance 1 (selectBoard twoCycle nextSaved)
  check "Independent roots share generated transitions without repeating expansion work" $
    transitionGenerations (solverStats combined) == 2
  let (_, smallSaved) = advance 1 (newSolver (SolverLimits 8 5) onlyDraw twoCycle)
      (_, smallOther) = advance 1 (selectBoard cycleNext smallSaved)
      (smallResult, smallAgain) = advance 1 (selectBoard twoCycle smallOther)
  check "Old shared cache entries can be evicted and regenerated without false exhaustion" $
    smallResult == Searching 1 && transitionGenerations (solverStats smallAgain) == 3 &&
    retainedEntries (solverStats smallAgain) <= 5
  let (_, cycleDone) = advance 10 cycleSaved
  check "Exhaustive proof can resolve a different root without expansions" $
    fst (advance 0 (selectBoard cycleNext cycleDone)) == Finished Exhausted 0
  let boundedCycle = newSolver (SolverLimits 8 5) onlyDraw cycleBoard
  check "A bounded cycle never reports false exhaustion" $ case fst (advance 100 boundedCycle) of
    RetentionLimit _ -> True
    _ -> False
  initial <- succeed (newGame klondike 7)
  let (whole, _) = advance 3500 (newSolver (SolverLimits 8 1000000) klondike initial)
      byChunks current = case advance 32 current of
        (Searching _, next) -> byChunks next
        (result, _) -> result
  check "Seeded initial deal has identical chunked and batch solution and budget use" $
    whole == byChunks (newSolver (SolverLimits 8 1000000) klondike initial)

wasmSessions :: IO ()
wasmSessions = do
  let a = Map.fromList [(tableau 1, [up Five Hearts, up Six Clubs]),
                        (waste, [up Four Spades]), (stock, [])]
      initial = Wasm.createSolver "golf" a
      first = Wasm.advanceSolver 1 initial
      second = Wasm.advanceSolver 0 initial
      saved = Wasm.stepSolver first
      resumed = Wasm.advanceSolver 0 (Wasm.selectSolverBoard a saved)
  check "Wasm pure solver steps keep the original state unchanged" $
    Wasm.stepProgress first == Searching 1 && Wasm.stepProgress second == Searching 0
  check "Wasm board selection resumes the returned state" $
    Wasm.stepProgress resumed == Wasm.stepProgress first
