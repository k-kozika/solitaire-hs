module Solitaire.Engine
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board
  , Relation(..), Sequence(..), Placement(..), MoveLimit(..), Transfer(..)
  , StockRule(..), Automatic(..), Definition(..), Action(..)
  , newGame, applyAction, legalActions, won, pileCards, pilesIn
  ) where

import Control.Monad (foldM, unless)
import Data.Bits (shiftR, xor)
import Data.List (find, foldl')
import qualified Data.Map.Strict as Map
import Data.Word (Word64)

data Suit = Clubs | Diamonds | Hearts | Spades
  deriving (Eq, Ord, Enum, Bounded, Show)

data Rank = Ace | Two | Three | Four | Five | Six | Seven
          | Eight | Nine | Ten | Jack | Queen | King
  deriving (Eq, Ord, Enum, Bounded, Show)

data Card = Card { rank :: Rank, suit :: Suit }
  deriving (Eq, Ord, Show)

data Face = Down | Up deriving (Eq, Show)
data Entry = Entry Face Card deriving (Eq, Show)

data Group = Stock | Waste | Tableau | Foundation | Cell
  deriving (Eq, Ord, Show)
data Pile = Pile Group Int deriving (Eq, Ord, Show)

-- The head is the exposed end of a pile, including the next stock card.
type Board = Map.Map Pile [Entry]

data Relation = AnySuit | SameSuit | AlternatingColors deriving (Eq, Show)
data Sequence = Descending Relation | Ascending Relation deriving (Eq, Show)
data Placement = EmptyOnly | Build Sequence (Maybe Rank) deriving (Eq, Show)

data MoveLimit = Single | Run Sequence | ByVacancies Sequence Group Group
  deriving (Eq, Show)

data Transfer = Transfer Group Group MoveLimit Placement deriving (Eq, Show)

data StockRule
  = NoStock
  | DrawTo Pile Pile Int Bool
  | DealAcross Pile Group Bool
  deriving (Eq, Show)

data Automatic
  = RevealTop Group
  | CollectRun Group Group Sequence Int Bool
  deriving (Eq, Show)

data Definition = Definition
  { gameName :: String
  , deckSuits :: [Suit]
  , layout :: [(Group, Int)]
  , initialDeal :: [(Pile, Face)]
  , reservePile :: Maybe Pile
  , transfers :: [Transfer]
  , stockRule :: StockRule
  , automatic :: [Automatic]
  , goalGroup :: Group
  } deriving (Eq, Show)

data Action = Move Int Pile Pile | Draw deriving (Eq, Show)

deck :: Definition -> [Card]
deck def = [Card r s | s <- deckSuits def, r <- [minBound .. maxBound]]

newGame :: Definition -> Word64 -> Either String Board
newGame def seed = do
  let board = Map.fromList
        [(Pile group number, []) | (group, count) <- layout def, number <- [1 .. count]]
      (dealt, remaining) = splitAt (length (initialDeal def)) (shuffle seed (deck def))
      present group = not (null (pilesIn group board))
      exists pile = Map.member pile board
      validTransfer (Transfer from to limit _) =
        present from && present to && case limit of
          ByVacancies _ cells columns -> cells /= columns && all present [cells, columns]
          _ -> True
      validAutomatic (RevealTop group) = present group
      validAutomatic (CollectRun from to _ count _) =
        from /= to && count > 0 && all present [from, to]
      validStock = case stockRule def of
        NoStock -> True
        DrawTo stock waste count _ -> stock /= waste && count > 0 && all exists [stock, waste]
        DealAcross stock group _ -> exists stock && present group && pileGroup stock /= group
  unless (not (null (deckSuits def))) (Left "The deck is empty.")
  unless (all ((> 0) . snd) (layout def) && Map.size board == sum (map snd (layout def)))
    (Left "Each pile group needs one positive count.")
  unless (present (goalGroup def)) (Left "The goal group is missing.")
  unless (all validTransfer (transfers def) && all validAutomatic (automatic def) && validStock)
    (Left "A rule has an invalid pile, group, or card count.")
  unless (length dealt == length (initialDeal def)) (Left "The initial deal exceeds the deck.")
  initialized <- foldM dealOne board (zip (initialDeal def) dealt)
  settle (automatic def) <$> case reservePile def of
    Just reserve -> do
      unless (Map.member reserve board) (Left "The reserve pile is missing.")
      pure (push reserve (map (Entry Down) remaining) initialized)
    Nothing -> do
      unless (null remaining) (Left "The definition leaves cards without a pile.")
      pure initialized
  where
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
                 , from == pileGroup source, to == pileGroup target ]
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
fitsLimit (Run order) _ _ _ cards = ordered order cards
fitsLimit (ByVacancies order cells columns) board source target cards =
  ordered order cards && toInteger (length cards) <= capacity
  where
    vacant group = length [pile | pile <- pilesIn group board,
                           pile /= source, pile /= target, null (pileCards board pile)]
    capacity = (1 + toInteger (vacant cells)) * 2 ^ vacant columns

fits :: Placement -> Card -> [Entry] -> Bool
fits EmptyOnly _ entries = null entries
fits (Build _ required) card [] = maybe True (== rank card) required
fits (Build order _) card (Entry Up previous : _) = follows order previous card
fits (Build _ _) _ (Entry Down _ : _) = False

ordered :: Sequence -> [Card] -> Bool
ordered order cards = and (zipWith (follows order) cards (drop 1 cards))

follows :: Sequence -> Card -> Card -> Bool
follows order previous next = case order of
  Descending relation -> difference == -1 && suitsMatch relation
  Ascending relation -> difference == 1 && suitsMatch relation
  where
    difference = fromEnum (rank next) - fromEnum (rank previous)
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
  pure (foldl' dealOne (Map.insert stock rest board) (zip targets picked))
  where
    targets = pilesIn group board
    (picked, rest) = splitAt (length targets) (pileCards board stock)
    dealOne current (target, entry) = push target [faceAs Up entry] current

faceAs :: Face -> Entry -> Entry
faceAs face (Entry _ card) = Entry face card

-- Each collection fills an empty pile, so one pass per rule terminates.
settle :: [Automatic] -> Board -> Board
settle rules board = foldl' (flip perform) board rules
  where
    perform (RevealTop group) current =
      foldl' (flip (Map.adjust reveal)) current (pilesIn group current)
    perform (CollectRun source target order count expose) current =
      foldl' collect current (pilesIn source current)
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
legalActions def board = filter legal (Draw : moves)
  where
    legal action = case applyAction def board action of
      Right _ -> True
      Left _ -> False
    moves = [ Move count source target
            | source <- Map.keys board, target <- Map.keys board, source /= target
            , count <- [1 .. length (takeWhile exposed (pileCards board source))] ]
    exposed (Entry face _) = face == Up

won :: Definition -> Board -> Bool
won def board =
  sum (map (length . pileCards board) (pilesIn (goalGroup def) board)) == length (deck def)
