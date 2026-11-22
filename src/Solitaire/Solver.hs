module Solitaire.Solver
  ( SearchResult(..), SearchProgress(..), Solver, SolverLimits(..)
  , defaultSolverLimits, SolverStats(..), solverStats
  , newSolver, selectBoard, advance, solve
  ) where

import qualified Data.List as List
import qualified Data.Map.Strict as Map
import qualified Data.Ord as Ord
import qualified Data.Set as Set
import Solitaire.Engine

data SearchResult = Solved [Action] | Exhausted | LimitReached
  deriving (Eq, Show)

-- Counts are cumulative expansions of the selected starting board.
-- Finished never contains LimitReached: running out of budget is inconclusive.
data SearchProgress = Searching Int | Finished SearchResult Int | RetentionLimit Int
  deriving (Eq, Show)

data SolverLimits = SolverLimits { maxSearches :: Int, maxEntries :: Int }
  deriving (Eq, Show)

defaultSolverLimits :: SolverLimits
defaultSolverLimits = SolverLimits 8 100000

type Score = (Ord.Down Int, Int, Ord.Down Int)
type Frontier = Map.Map (Score, Int, Integer) (Board, [Action])
data Search = Search
  { seen :: !(Set.Set Board), frontier :: !Frontier, ticket :: !Integer
  , expanded :: !Int, searchAge :: !Integer, outcome :: Maybe SearchResult
  }
data Cached = Cached
  { cachedScore :: Maybe Score, transitions :: Maybe [(Action, Board)]
  , proven :: Maybe SearchResult, cacheAge :: !Integer
  }
-- The definition and all internals stay private. No visited set crosses roots.
data Solver = Solver
  { definition :: Definition, limits :: SolverLimits, selected :: Board
  , searches :: !(Map.Map Board Search), cache :: !(Map.Map Board Cached)
  , cacheOrder :: !(Map.Map Integer Board), cacheEntries :: !Int
  , clock :: !Integer, generated :: !Int
  }

data SolverStats = SolverStats
  { retainedSearches :: Int, retainedEntries :: Int, transitionGenerations :: Int }
  deriving (Eq, Show)

solverStats :: Solver -> SolverStats
solverStats s = SolverStats (Map.size (searches s)) (entryCount s) (generated s)

newSolver :: SolverLimits -> Definition -> Board -> Solver
newSolver lim def board = selectBoard board
  (Solver def lim board Map.empty Map.empty Map.empty 0 0 0)

selectBoard :: Board -> Solver -> Solver
selectBoard board s = case Map.lookup board (searches s) of
  Just _ -> trim s {selected = board}
  Nothing ->
    let (priority, prepared) = cachedPriority board s
        search = Search (Set.singleton board)
          (Map.singleton (priority, 0, 0) (board, []))
          1 0 (clock s) Nothing
    in trim prepared {selected = board, clock = clock prepared + 1,
         searches = Map.insert board search (searches prepared)}

-- One expansion is a transaction. If its mandatory state cannot fit, keep
-- the previous frontier and seen set intact so it can never falsely exhaust.
advance :: Int -> Solver -> (SearchProgress, Solver)
advance budget = go (max 0 budget)
  where
    go remaining s =
      let root = selected s
          search = searches s Map.! root
          finish result current =
            let done = search {outcome = Just result}
                saved = saveProof root search result current
            in (Finished result (expanded search), trim saved
                 { searches = Map.insert root done (searches saved) })
      in case outcome search of
        Just result -> (Finished result (expanded search), s)
        Nothing -> case Map.minViewWithKey (frontier search) of
          Nothing -> finish Exhausted s
          Just (((_, depth, _), (board, path)), queue)
            | won (definition s) board -> finish (Solved (reverse path)) s
            | Just (Solved rest) <- Map.lookup board (cache s) >>= proven ->
                finish (Solved (reverse path ++ rest)) s
            | Just Exhausted <- Map.lookup board (cache s) >>= proven ->
                go remaining s {searches = Map.insert root
                  search {frontier = queue} (searches s)}
            | remaining == 0 -> (Searching (expanded search), s)
            | otherwise ->
                let (edges, prepared) = cachedTransitions board s
                    (nextTicket, visited, ready, scored) = List.foldl'
                      (enqueue (depth + 1) path)
                      (ticket search, seen search, queue, prepared) edges
                    next = search {seen = visited, frontier = ready,
                      ticket = nextTicket, expanded = expanded search + 1}
                    candidate = trim scored
                      {searches = Map.insert root next (searches scored)}
                in if entryCount candidate > max 0 (maxEntries (limits s))
                   then (RetentionLimit (expanded search), trim s
                     {searches = Map.restrictKeys (searches s) (Map.keysSet (searches candidate)),
                      cache = Map.empty, cacheOrder = Map.empty, cacheEntries = 0})
                   else go (remaining - 1) candidate

    enqueue depth path state@(serial, visited, queue, s) (action, board)
      | Set.member board visited = state
      | otherwise =
          let (priority, next) = cachedPriority board s
          in (serial + 1, Set.insert board visited,
              Map.insert (priority, depth, serial) (board, action : path) queue, next)

cachedPriority :: Board -> Solver -> (Score, Solver)
cachedPriority board s = case Map.lookup board (cache s) >>= cachedScore of
  Just value -> (value, s)
  Nothing -> let value = score (definition s) board
             in (value, updateCache board (\c -> c {cachedScore = Just value}) s)

cachedTransitions :: Board -> Solver -> ([(Action, Board)], Solver)
cachedTransitions board s = case Map.lookup board (cache s) >>= transitions of
  Just edges -> (edges, s)
  Nothing -> let edges = legalTransitions (definition s) board
             in (edges, updateCache board (\c -> c {transitions = Just edges})
                  s {generated = generated s + 1})

cacheCost :: Cached -> Int
cacheCost c = 1 + maybe 0 length (transitions c)

updateCache :: Board -> (Cached -> Cached) -> Solver -> Solver
updateCache board update s =
  let old = Map.lookup board (cache s)
      value = update (maybe (Cached Nothing Nothing Nothing (clock s)) id old)
  in s {cache = Map.insert board value (cache s), clock = clock s + 1,
        cacheOrder = Map.insert (cacheAge value) board (cacheOrder s),
        cacheEntries = cacheEntries s + cacheCost value - maybe 0 cacheCost old}

saveProof :: Board -> Search -> SearchResult -> Solver -> Solver
saveProof root search result s = case result of
  Solved actions -> suffixes root actions s
  -- Every enqueued board was expanded or already proven exhausted.
  -- Cycles alone and budget/retention stops never register negative results.
  Exhausted -> Set.foldl' (\acc board -> record board Exhausted acc) s (seen search)
  LimitReached -> s
  where
    record board value = updateCache board (\c -> c {proven = Just value})
    suffixes board actions acc =
      let saved = record board (Solved actions) acc
      in case actions of
        [] -> saved
        action : rest -> case applyAction (definition s) board action of
          Right next -> suffixes next rest saved
          Left _ -> saved -- Only engine-produced paths enter this function.

entryCount :: Solver -> Int
entryCount s = cacheEntries s + Map.foldl' (\n x ->
  n + Set.size (seen x) + Map.size (frontier x)) 0 (searches s)

-- Evict whole inactive searches first, then cache keys in insertion order.
-- An active search is never partially deleted, even with a limit below its size.
trim :: Solver -> Solver
trim s
  | tooMany || tooBig = case oldestInactive of
      Just board -> trim s {searches = Map.delete board (searches s)}
      Nothing | tooBig -> case Map.minViewWithKey (cacheOrder s) of
        Just ((_, board), rest) ->
          let cost = maybe 0 cacheCost (Map.lookup board (cache s))
          in trim s {cache = Map.delete board (cache s), cacheOrder = rest,
                     cacheEntries = cacheEntries s - cost}
        Nothing -> s
      Nothing -> s
  | otherwise = s
  where
    tooMany = Map.size (searches s) > max 1 (maxSearches (limits s))
    tooBig = entryCount s > max 0 (maxEntries (limits s))
    oldestInactive = case List.sortOn (searchAge . snd)
      (Map.toList (Map.delete (selected s) (searches s))) of
        (board, _) : _ -> Just board
        [] -> Nothing

-- The one-shot API uses the same steps with no retention restriction.
solve :: Int -> Definition -> Board -> SearchResult
solve budget def board = case fst (advance budget
  (newSolver (SolverLimits maxBound maxBound) def board)) of
    Finished result _ -> result
    _ -> LimitReached

data BoardCounts = BoardCounts !Int !Int

score :: Definition -> Board -> Score
score def board =
  let BoardCounts hidden empty = Map.foldlWithKey' count (BoardCounts 0 0) board
  in (Ord.Down (goalProgress def board), hidden, Ord.Down empty)
  where
    count (BoardCounts hidden empty) (Pile group _) entries = BoardCounts
      (hidden + if group == Stock then 0 else length [() | Entry Down _ <- entries])
      (empty + if group `elem` [Cell, Tableau] && null entries then 1 else 0)
