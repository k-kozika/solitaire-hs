module Solitaire.Solver (SearchResult(..), solve) where

import qualified Data.List as List (foldl')
import qualified Data.Map.Strict as Map
import qualified Data.Ord as Ord
import qualified Data.Set as Set
import Solitaire.Engine

data SearchResult
  = Solved [Action]
  | Exhausted
  | LimitReached
  deriving (Eq, Show)

-- The budget counts expanded boards. A winning board needs no expansion.
solve :: Int -> Definition -> Board -> SearchResult
solve budget def initial =
  search (max 0 budget) 1 (Set.singleton initial)
    (Map.singleton (score initial, 0 :: Int, 0 :: Integer) (initial, []))
  where
    search remaining ticket seen frontier = case Map.minViewWithKey frontier of
      Nothing -> Exhausted
      Just (((_, depth, _), (board, path)), queue)
        | won def board -> Solved (reverse path)
        | remaining == 0 -> LimitReached
        | otherwise ->
            let (nextTicket, visited, ready) =
                  List.foldl' (enqueue (depth + 1) path) (ticket, seen, queue) (legalTransitions def board)
            in search (remaining - 1) nextTicket visited ready

    enqueue depth path state@(ticket, seen, queue) (action, next)
      | Set.member next seen = state
      | otherwise =
          ( ticket + 1
          , Set.insert next seen
          , Map.insert (score next, depth, ticket) (next, action : path) queue
          )

    score board =
      ( Ord.Down (goalProgress def board)
      , sum [length [() | Entry Down _ <- pileCards board pile]
            | pile@(Pile group _) <- Map.keys board, group /= Stock]
      , Ord.Down (length [pile | group <- [Cell, Tableau], pile <- pilesIn group board,
                            null (pileCards board pile)])
      )
