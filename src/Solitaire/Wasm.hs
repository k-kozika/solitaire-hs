-- | Pure API consumed by ghc-wasm-bindgen. Keep UI and IO outside this module.
module Solitaire.Wasm
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board, Action(..), SearchResult(..)
  , games, newGame, applyAction, legalActions, won, solve, pileCards, pilesIn
  ) where

import Data.Word (Word64)
import Solitaire.Engine
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board, Action(..), Definition, pileCards, pilesIn
  )
import qualified Solitaire.Engine as Engine
import qualified Solitaire.Games as Games
import Solitaire.Solver (SearchResult(..))
import qualified Solitaire.Solver as Solver

-- | Stable game IDs and their display names; rules stay on the Haskell side.
games :: [(String, String)]
games = [(name, Engine.gameName def) | (name, def) <- Games.games]

-- | Integer crosses the JS boundary as bigint, retaining all 64 seed bits.
newGame :: String -> Integer -> Either String Board
newGame name seed = do
  def <- definition name
  if seed < 0 || seed > toInteger (maxBound :: Word64)
    then Left "SEED must be an unsigned 64-bit integer."
    else Engine.newGame def (fromInteger seed)

applyAction :: String -> Board -> Action -> Either String Board
applyAction name board action = do
  def <- definition name
  Engine.applyAction def board action

legalActions :: String -> Board -> Either String [Action]
legalActions name board = do
  def <- definition name
  pure (Engine.legalActions def board)

won :: String -> Board -> Either String Bool
won name board = do
  def <- definition name
  pure (Engine.won def board)

-- | Synchronous search: call from a Web Worker when used by a browser UI.
solve :: Int -> String -> Board -> Either String SearchResult
solve budget name board = do
  def <- definition name
  pure (Solver.solve budget def board)

definition :: String -> Either String Definition
definition name = case lookup name Games.games of
  Just def -> Right def
  Nothing -> Left ("Unknown game: " ++ name)
