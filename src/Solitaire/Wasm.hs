-- | Pure engine API and opaque solver references consumed by ghc-wasm-bindgen.
module Solitaire.Wasm
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board, Action(..), SearchResult(..), SearchProgress(..)
  , Solver, SolverStep, createSolver, selectSolverBoard, advanceSolver
  , stepProgress, stepSolver
  , games, newGame, applyAction, legalActions, won, solve, pileCards, pilesIn
  ) where

import Data.Word (Word64)
import Solitaire.Engine
  ( Suit(..), Rank(..), Card(..), Entry(..), Face(..)
  , Group(..), Pile(..), Board, Action(..), Definition, pileCards, pilesIn
  )
import qualified Solitaire.Engine as Engine
import qualified Solitaire.Games as Games
import Solitaire.Solver (SearchResult(..), SearchProgress(..), Solver)
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

-- References cross the boundary directly; bindgen owns their retention.
-- Strict fields complete the slice before its reference is returned to JS.
data SolverStep = SolverStep !SearchProgress !Solver

-- Opaque references cannot be nested in Either. Unknown games throw a
-- HaskellError at the JS boundary, just like other evaluation failures.
createSolver :: String -> Board -> Solver
createSolver name board = case definition name of
  Left err -> error err
  Right def -> Solver.newSolver Solver.defaultSolverLimits def board

selectSolverBoard :: Board -> Solver -> Solver
selectSolverBoard = Solver.selectBoard

advanceSolver :: Int -> Solver -> SolverStep
advanceSolver budget solver =
  let (progress, next) = Solver.advance budget solver
  in SolverStep progress next

stepProgress :: SolverStep -> SearchProgress
stepProgress (SolverStep progress _) = progress

stepSolver :: SolverStep -> Solver
stepSolver (SolverStep _ solver) = solver
