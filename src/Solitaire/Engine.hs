module Solitaire.Engine
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board
  , Relation(..), RankOrder(..), Sequence(..), Placement(..), MoveLimit(..)
  , PileSelector(..), Transfer(..), StockRule(..), Automatic(..), Goal(..), Definition(..), Action(..)
  , newGame, applyAction, legalActions, legalTransitions, won, goalProgress, pileCards, pilesIn
  ) where

import Control.Monad (foldM, unless)
import Data.Bits (shiftR, xor)
import Data.List (find)
import qualified Data.List as List (foldl')
import qualified Data.Map.Strict as Map
import Data.Word (Word64)

data Suit = Clubs | Diamonds | Hearts | Spades
  deriving (Eq, Ord, Enum, Bounded, Show)

data Rank = Ace | Two | Three | Four | Five | Six | Seven
          | Eight | Nine | Ten | Jack | Queen | King
  deriving (Eq, Ord, Enum, Bounded, Show)

data Card = Card { rank :: Rank, suit :: Suit }
  deriving (Eq, Ord, Show)

data Face = Down | Up deriving (Eq, Ord, Show)
data Entry = Entry Face Card deriving (Eq, Ord, Show)

data Group = Stock | Waste | Tableau | Foundation | Cell
  deriving (Eq, Ord, Show)
data Pile = Pile Group Int deriving (Eq, Ord, Show)

-- The head is the exposed end of a pile, including the next stock card.
type Board = Map.Map Pile [Entry]

data Relation = AnySuit | SameSuit | AlternatingColors deriving (Eq, Show)
data RankOrder = Linear | Cyclic deriving (Eq, Show)
data Sequence = Descending Relation RankOrder | Ascending Relation RankOrder deriving (Eq, Show)
data Placement = EmptyOnly | Build Sequence (Maybe Rank) | StopAt Rank Placement deriving (Eq, Show)

data MoveLimit = Single | AnyFaceUp | Run Sequence | ByVacancies Sequence Group Group
  deriving (Eq, Show)

data PileSelector = GroupPiles Group | ExactPile Pile deriving (Eq, Show)
data Transfer = Transfer PileSelector PileSelector MoveLimit Placement deriving (Eq, Show)

data StockRule
  = NoStock
  | DrawTo Pile Pile Int Bool
  | DealAcross Pile Group Bool
  deriving (Eq, Show)

data Automatic
  = RevealTop Group
  | CollectRun Group Group Sequence Int Bool
  deriving (Eq, Show)

data Goal = CollectAll Group | Clear Group deriving (Eq, Show)

data Definition = Definition
  { gameName :: String
  , deckSuits :: [Suit]
  , layout :: [(Group, Int)]
  , fixedCards :: [(Pile, Entry)]
  , initialDeal :: [(Pile, Face)]
  , reservePile :: Maybe Pile
  , transfers :: [Transfer]
  , stockRule :: StockRule
  , automatic :: [Automatic]
  , goal :: Goal
  } deriving (Eq, Show)

data Action = Move Int Pile Pile | Draw deriving (Eq, Show)

deck :: Definition -> [Card]
deck def = [Card r s | s <- deckSuits def, r <- [minBound .. maxBound]]

newGame :: Definition -> Word64 -> Either String Board
newGame def seed = do
  let board = Map.fromList
        [(Pile group number, []) | (group, count) <- layout def, number <- [1 .. count]]
      present group = not (null (pilesIn group board))
      exists pile = Map.member pile board
      validSelector (GroupPiles group) = present group
      validSelector (ExactPile pile) = exists pile
      validTransfer (Transfer from to limit _) =
        all validSelector [from, to] && case limit of
          ByVacancies _ cells columns -> cells /= columns && all present [cells, columns]
          _ -> True
      validAutomatic (RevealTop group) = present group
      validAutomatic (CollectRun from to _ count _) =
        from /= to && count > 0 && all present [from, to]
      validStock = case stockRule def of
        NoStock -> True
        DrawTo stock waste count _ -> stock /= waste && count > 0 && all exists [stock, waste]
        DealAcross stock group _ -> exists stock && present group && pileGroup stock /= group
      validGoal = case goal def of
        CollectAll group -> present group
        Clear group -> present group
  unless (not (null (deckSuits def))) (Left "The deck is empty.")
  unless (all ((> 0) . snd) (layout def) && Map.size board == sum (map snd (layout def)))
    (Left "Each pile group needs one positive count.")
  unless validGoal (Left "The goal group is missing.")
  unless (all validTransfer (transfers def) && all validAutomatic (automatic def) && validStock)
    (Left "A rule has an invalid pile, group, or card count.")
  (fixed, rest) <- foldM placeFixed (board, deck def) (fixedCards def)
  let (dealt, remaining) = splitAt (length (initialDeal def)) (shuffle seed rest)
  unless (length dealt == length (initialDeal def)) (Left "The initial deal exceeds the deck.")
  initialized <- foldM dealOne fixed (zip (initialDeal def) dealt)
  settle (automatic def) <$> case reservePile def of
    Just reserve -> do
      unless (Map.member reserve board) (Left "The reserve pile is missing.")
      pure (push reserve (map (Entry Down) remaining) initialized)
    Nothing -> do
      unless (null remaining) (Left "The definition leaves cards without a pile.")
      pure initialized
  where
    placeFixed (board, remaining) (pile, entry@(Entry _ card)) = do
      unless (Map.member pile board) (Left "A fixed card refers to a missing pile.")
      case break (== card) remaining of
        (before, _ : after) -> Right (push pile [entry] board, before ++ after)
        _ -> Left "A fixed card is unavailable in the deck."
    dealOne board ((pile, face), card) = do
      unless (Map.member pile board) (Left "The initial deal refers to a missing pile.")
      pure (push pile [Entry face card] board)

shuffle :: Word64 -> [a] -> [a]
shuffle _ [] = []
shuffle seed items = case splitAt index items of
  (before, chosen : after) -> chosen : shuffle next (before ++ after)
  _ -> items
  where
    -- SplitMix64 output mixer with an incrementing state.
    next = seed + 0x9e3779b97f4a7c15
    a = (next `xor` (next `shiftR` 30)) * 0xbf58476d1ce4e5b9
    b = (a `xor` (a `shiftR` 27)) * 0x94d049bb133111eb
    index = fromIntegral ((b `xor` (b `shiftR` 31)) `mod` fromIntegral (length items))

pileCards :: Board -> Pile -> [Entry]
pileCards board pile = Map.findWithDefault [] pile board

pilesIn :: Group -> Board -> [Pile]
pilesIn group = filter ((== group) . pileGroup) . Map.keys

pileGroup :: Pile -> Group
pileGroup (Pile group _) = group

matches :: PileSelector -> Pile -> Bool
matches (GroupPiles group) pile = pileGroup pile == group
matches (ExactPile expected) pile = pile == expected

push :: Pile -> [Entry] -> Board -> Board
push pile entries = Map.adjust (entries ++) pile

applyAction :: Definition -> Board -> Action -> Either String Board
applyAction def board action = settle (automatic def) <$> case action of
  Draw -> applyStock (stockRule def) board
  Move count source target -> applyMove (transfers def) board count source target

applyMove :: [Transfer] -> Board -> Int -> Pile -> Pile -> Either String Board
applyMove rules board count source target = do
  unless (source /= target && all (`Map.member` board) [source, target])
    (Left "Choose two different piles on this board.")
  unless (count > 0 && length selected == count) (Left "Invalid number of cards.")
  cards <- traverse visible selected
  let stack = reverse cards
      matching = [ (limit, placement)
                 | Transfer from to limit placement <- rules
                 , matches from source, matches to target ]
      movable = filter (\(limit, _) -> fitsLimit limit board source target stack) matching
  unless (not (null matching)) (Left "This route is unavailable.")
  unless (not (null movable)) (Left "This stack cannot be moved together.")
  case stack of
    bottom : _ -> do
      unless (any (\(_, placement) -> fits placement bottom (pileCards board target)) movable)
        (Left "These cards do not fit the destination.")
      pure (push target selected (Map.insert source remaining board))
    [] -> Left "Choose at least one card."
  where
    (selected, remaining) = splitAt count (pileCards board source)
    visible (Entry Up card) = Right card
    visible (Entry Down _) = Left "Face-down cards cannot be moved."

fitsLimit :: MoveLimit -> Board -> Pile -> Pile -> [Card] -> Bool
fitsLimit Single _ _ _ cards = length cards == 1
fitsLimit AnyFaceUp _ _ _ _ = True
fitsLimit (Run order) _ _ _ cards = ordered order cards
fitsLimit (ByVacancies order cells columns) board source target cards =
  ordered order cards && toInteger (length cards) <= capacity
  where
    vacant group = length [pile | pile <- pilesIn group board,
                           pile /= source, pile /= target, null (pileCards board pile)]
    capacity = (1 + toInteger (vacant cells)) * 2 ^ vacant columns

fits :: Placement -> Card -> [Entry] -> Bool
fits EmptyOnly _ entries = null entries
fits (StopAt terminal placement) card entries = case entries of
  Entry _ top : _ | rank top == terminal -> False
  _ -> fits placement card entries
fits (Build _ required) card [] = maybe True (== rank card) required
fits (Build order _) card (Entry Up previous : _) = follows order previous card
fits (Build _ _) _ (Entry Down _ : _) = False

ordered :: Sequence -> [Card] -> Bool
ordered order cards = and (zipWith (follows order) cards (drop 1 cards))

follows :: Sequence -> Card -> Card -> Bool
follows order previous next = case order of
  Descending relation rankOrder -> adjacent rankOrder (-1) && suitsMatch relation
  Ascending relation rankOrder -> adjacent rankOrder 1 && suitsMatch relation
  where
    difference = fromEnum (rank next) - fromEnum (rank previous)
    adjacent Linear step = difference == step
    adjacent Cyclic step = difference `mod` rankCount == step `mod` rankCount
    rankCount = fromEnum (maxBound :: Rank) - fromEnum (minBound :: Rank) + 1
    suitsMatch AnySuit = True
    suitsMatch SameSuit = suit previous == suit next
    suitsMatch AlternatingColors = red (suit previous) /= red (suit next)
    red s = s == Hearts || s == Diamonds

applyStock :: StockRule -> Board -> Either String Board
applyStock NoStock _ = Left "This game has no stock."
applyStock (DrawTo stock waste count recycle) board = do
  unless (stock /= waste && count > 0 && all (`Map.member` board) [stock, waste])
    (Left "Invalid stock rule.")
  case splitAt count (pileCards board stock) of
    ([], _) | recycle && not (null wasteCards) ->
      Right (Map.insert waste [] (Map.insert stock (map (faceAs Down) (reverse wasteCards)) board))
    ([], _) -> Left "There are no cards to draw."
    (picked, rest) ->
      Right (push waste (map (faceAs Up) (reverse picked)) (Map.insert stock rest board))
  where
    wasteCards = pileCards board waste
applyStock (DealAcross stock group requireFilled) board = do
  unless (Map.member stock board && stock `notElem` targets && not (null targets))
    (Left "Invalid stock rule.")
  unless (not requireFilled || all (not . null . pileCards board) targets)
    (Left "Fill every column before dealing from stock.")
  unless (length picked == length targets) (Left "There are no full rows left to deal.")
  pure (List.foldl' dealOne (Map.insert stock rest board) (zip targets picked))
  where
    targets = pilesIn group board
    (picked, rest) = splitAt (length targets) (pileCards board stock)
    dealOne current (target, entry) = push target [faceAs Up entry] current

faceAs :: Face -> Entry -> Entry
faceAs face (Entry _ card) = Entry face card

-- Each collection fills an empty pile, so one pass per rule terminates.
settle :: [Automatic] -> Board -> Board
settle rules board = List.foldl' (flip perform) board rules
  where
    perform (RevealTop group) current =
      List.foldl' (flip (Map.adjust reveal)) current (pilesIn group current)
    perform (CollectRun source target order count expose) current =
      List.foldl' collect current (pilesIn source current)
      where
        collect state pile =
          case (splitAt count (pileCards state pile), find (null . pileCards state) (pilesIn target state)) of
            ((entries, remaining), Just destination)
              | count > 0 && length entries == count
              , Just cards <- traverse faceUp entries
              , ordered order (reverse cards) ->
                let rest = if expose then reveal remaining else remaining
                in collect (push destination entries (Map.insert pile rest state)) pile
            _ -> state
    faceUp (Entry Up card) = Just card
    faceUp (Entry Down _) = Nothing
    reveal (entry : rest) = faceAs Up entry : rest
    reveal [] = []

legalActions :: Definition -> Board -> [Action]
legalActions def board = map fst (legalTransitions def board)

legalTransitions :: Definition -> Board -> [(Action, Board)]
legalTransitions def board =
  [(action, next) | action <- Draw : moves, Right next <- [applyAction def board action]]
  where
    routes = [(from, to) | Transfer from to _ _ <- transfers def]
    moves = [ Move count source target
            | (source, entries) <- Map.toList board
            , let visibleCount = length (takeWhile exposed entries)
            , visibleCount > 0
            , target <- Map.keys board
            , source /= target
            , any (\(from, to) -> matches from source && matches to target) routes
            , count <- [1 .. visibleCount] ]
    exposed (Entry face _) = face == Up

won :: Definition -> Board -> Bool
won def board = case goal def of
  CollectAll group -> groupSize group board == length (deck def)
  Clear group -> groupSize group board == 0

-- Higher is better; drawing from stock does not advance a Clear goal.
goalProgress :: Definition -> Board -> Int
goalProgress def board = case goal def of
  CollectAll group -> groupSize group board
  Clear group -> length (deck def) - groupSize group board

groupSize :: Group -> Board -> Int
groupSize group board = sum (map (length . pileCards board) (pilesIn group board))
