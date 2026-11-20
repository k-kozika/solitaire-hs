module Main (main) where

import Data.Char (toLower)
import Data.List (intercalate)
import Data.Word (Word64)
import Solitaire.Engine
import Solitaire.Games (games)
import Solitaire.Solver
import System.Environment (getArgs)
import System.Exit (die)
import Text.Read (readMaybe)

main :: IO ()
main = do
  arguments <- getArgs
  case arguments of
    [name, seedText, budgetText]
      | Just def <- lookup (map toLower name) games
      , Just seed <- readMaybe seedText
      , seed >= 0 && seed <= toInteger (maxBound :: Word64)
      , Just budget <- readMaybe budgetText
      , budget >= 0 && budget <= toInteger (maxBound :: Int) ->
          either die (report . solve (fromInteger budget) def) (newGame def (fromInteger seed))
    _ -> die ("Usage: solitaire-solve (" ++ intercalate "|" (map fst games) ++ ") SEED BUDGET")

report :: SearchResult -> IO ()
report (Solved actions) = do
  putStrLn ("Solved in " ++ show (length actions) ++ " actions.")
  mapM_ print actions
report Exhausted = putStrLn "No solution in the reachable state space."
report LimitReached = putStrLn "Search limit reached."
