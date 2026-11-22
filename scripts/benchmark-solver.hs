-- Run: cabal exec -- runghc -isrc scripts/benchmark-solver.hs
module Main (main) where

import Control.Exception (evaluate)
import qualified Data.List as List
import qualified Data.Map.Strict as Map
import qualified Data.Ord as Ord
import qualified Data.Set as Set
import GHC.Clock (getMonotonicTimeNSec)
import Solitaire.Engine
import Solitaire.Games (klondike)
import Solitaire.Solver
import Text.Printf (printf)

main :: IO ()
main = do
  board <- either fail pure (newGame klondike 7)
  _ <- evaluate (length (show board))
  timed "previous one-shot search" (legacy 3500 klondike board)
  let start = newSolver defaultSolverLimits klondike board
  timed "cold session" (measured (advance 3500 start))
  let (_, saved) = advance 32 start
  _ <- evaluate (length (show (solverStats saved)))
  timed "resume probe (zero budget)" (measured (advance 0 (selectBoard board saved)))
  let (result, complete) = advance 3500 saved
  timed "resume remaining search" (result, solverStats complete)
  case result of
    Finished (Solved (action : _)) _ -> do
      middle <- either fail pure (applyAction klondike board action)
      timed "cached solution suffix" (measured (advance 0 (selectBoard middle complete)))
      print (solverStats complete)
    _ -> print result
  where
    measured (progress, solver) = (progress, solverStats solver)
    timed :: Show a => String -> a -> IO ()
    timed label value = do
      start <- getMonotonicTimeNSec
      size <- evaluate (length (show value))
      end <- getMonotonicTimeNSec
      printf "%s: %.3f ms (%d rendered result characters)\n" label
        (fromIntegral (end - start) / 1000000 :: Double) size

-- Pre-session algorithm, retained here only as a reproducible speed baseline.
legacy :: Int -> Definition -> Board -> SearchResult
legacy budget def initial = search (max 0 budget) 1 (Set.singleton initial)
  (Map.singleton (score initial, 0 :: Int, 0 :: Integer) (initial, []))
  where
    search remaining serial visited ready = case Map.minViewWithKey ready of
      Nothing -> Exhausted
      Just (((_, depth, _), (board, path)), queue)
        | won def board -> Solved (reverse path)
        | remaining == 0 -> LimitReached
        | otherwise -> let (nextSerial, seen, frontier) = List.foldl'
                            (enqueue (depth + 1) path) (serial, visited, queue)
                            (legalTransitions def board)
                       in search (remaining - 1) nextSerial seen frontier
    enqueue depth path state@(serial, visited, ready) (action, board)
      | Set.member board visited = state
      | otherwise = (serial + 1, Set.insert board visited,
          Map.insert (score board, depth, serial) (board, action : path) ready)
    score board = (Ord.Down (goalProgress def board),
      sum [length [() | Entry Down _ <- entries]
          | (Pile group _, entries) <- Map.toList board, group /= Stock],
      Ord.Down (length [() | (Pile group _, entries) <- Map.toList board,
                       group `elem` [Cell, Tableau], null entries]))
