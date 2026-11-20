module Solitaire.Games (games, klondike, spider, freecell, yukon, golf, grandfathersClock) where

import Solitaire.Engine (Definition)
import Solitaire.Games.FreeCell (freecell)
import Solitaire.Games.Golf (golf)
import Solitaire.Games.GrandfathersClock (grandfathersClock)
import Solitaire.Games.Klondike (klondike)
import Solitaire.Games.Spider (spider)
import Solitaire.Games.Yukon (yukon)

games :: [(String, Definition)]
games =
  [("klondike", klondike), ("spider", spider), ("freecell", freecell)
  ,("yukon", yukon), ("golf", golf), ("grandfathers-clock", grandfathersClock)]
