module Main (main) where

import Data.Char (toLower)
import Data.List (find, intercalate)
import Data.Word (Word64)
import GHC.Clock (getMonotonicTimeNSec)
import Solitaire.Engine
import Solitaire.Games (games)
import System.Environment (getArgs)
import System.Exit (die)
import System.IO (hFlush, isEOF, stdout)
import Text.Read (readMaybe)

main :: IO ()
main = do
  arguments <- getArgs
  case arguments of
    ["--help"] -> putStrLn usage
    [name] -> getMonotonicTimeNSec >>= start name
    [name, seedText] -> case boundedInteger 0 seedText of
      Just seed -> start name seed
      Nothing -> die "SEED must be an unsigned 64-bit integer."
    _ -> die usage

usage :: String
usage = "Usage: solitaire (" ++ intercalate "|" (map fst games) ++ ") [SEED]"

start :: String -> Word64 -> IO ()
start name seed = case lookup (map toLower name) games of
  Nothing -> die usage
  Just def -> case newGame def seed of
    Left message -> die message
    Right board -> do
      putStrLn (gameName def ++ "  seed " ++ show seed)
      putStrLn help
      play def board

data Command = Play Action | ShowMoves | Help | Quit

help :: String
help = "move FROM TO [COUNT] | draw | moves | help | quit"

play :: Definition -> Board -> IO ()
play def board = do
  putStrLn (renderBoard def board)
  if won def board
    then putStrLn "You win!"
    else awaitCommand
  where
    awaitCommand = do
      putStr "> "
      hFlush stdout
      done <- isEOF
      if done then pure () else getLine >>= handle . parseCommand def
    handle (Left message) = putStrLn message >> awaitCommand
    handle (Right Quit) = pure ()
    handle (Right Help) = putStrLn help >> awaitCommand
    handle (Right ShowMoves) = do
      case legalActions def board of
        [] -> putStrLn "No legal actions."
        actions -> mapM_ (putStrLn . showAction) actions
      awaitCommand
    handle (Right (Play action)) = case applyAction def board action of
      Right next -> play def next
      Left message -> putStrLn message >> awaitCommand

parseCommand :: Definition -> String -> Either String Command
parseCommand def input = case words (map toLower input) of
  ["quit"] -> Right Quit
  ["help"] -> Right Help
  ["moves"] -> Right ShowMoves
  ["draw"] -> Right (Play Draw)
  ["move", source, target] -> move source target "1"
  ["move", source, target, countText] -> move source target countText
  _ -> Left help
  where
    move source target countText = do
      from <- resolve source
      to <- resolve target
      count <- case boundedInteger 1 countText of
        Just value -> Right value
        Nothing -> Left "COUNT must be a positive integer."
      Right (Play (Move count from to))
    resolve name = case find ((== name) . pileLabel) available of
      Just pile -> Right pile
      Nothing -> Left ("Unknown pile: " ++ name)
    available = [Pile group number | (group, count) <- layout def, number <- [1 .. count]]

boundedInteger :: (Integral a, Bounded a) => a -> String -> Maybe a
boundedInteger lower input = do
  integer <- readMaybe input
  let value = fromInteger integer
  if value >= lower && toInteger value == integer then Just value else Nothing

pileLabel :: Pile -> String
pileLabel (Pile group number) = prefix group ++ suffix
  where
    prefix Stock = "s"
    prefix Waste = "w"
    prefix Tableau = "t"
    prefix Foundation = "f"
    prefix Cell = "c"
    suffix
      | number == 1 && group `elem` [Stock, Waste] = ""
      | otherwise = show number

showAction :: Action -> String
showAction Draw = "draw"
showAction (Move count source target) =
  unwords (["move", pileLabel source, pileLabel target] ++ [show count | count /= 1])

renderBoard :: Definition -> Board -> String
renderBoard def board = intercalate "\n"
  [unlines [pileLabel pile ++ ": " ++ render pile | pile <- pilesIn group board]
  | (group, _) <- layout def]
  where
    render pile@(Pile Stock _) = show (length (pileCards board pile)) ++ " cards"
    render pile@(Pile Tableau _) = case pileCards board pile of
      [] -> "-"
      entries -> unwords (map showEntry (reverse entries))
    render pile = case pileCards board pile of
      [] -> "-"
      entry : _ -> showEntry entry

showEntry :: Entry -> String
showEntry (Entry Down _) = "##"
showEntry (Entry Up card) = rankLabel (rank card) ++ [suitLabel (suit card)]
  where
    rankLabel Ace = "A"
    rankLabel Jack = "J"
    rankLabel Queen = "Q"
    rankLabel King = "K"
    rankLabel value = show (fromEnum value + 1)
    suitLabel Clubs = 'C'
    suitLabel Diamonds = 'D'
    suitLabel Hearts = 'H'
    suitLabel Spades = 'S'
