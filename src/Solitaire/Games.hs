module Solitaire.Games (games, klondike, spider, freecell) where

import Solitaire.Engine (Definition)
import Solitaire.Games.FreeCell (freecell)
import Solitaire.Games.Klondike (klondike)
import Solitaire.Games.Spider (spider)

games :: [(String, Definition)]
games = [("klondike", klondike), ("spider", spider), ("freecell", freecell)]
