module Solitaire.Games.FreeCell (freecell) where

import Solitaire.Engine

freecell :: Definition
freecell = Definition
  { gameName = "FreeCell"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Cell, 4), (Foundation, 4), (Tableau, 8)]
  , initialDeal = [(Pile Tableau column, Up) | column <- take 52 (cycle [1 .. 8])]
  , reservePile = Nothing
  , transfers =
      [ Transfer Tableau Tableau (ByVacancies alternating Cell Tableau) loose
      , Transfer Tableau Cell Single EmptyOnly
      , Transfer Cell Tableau Single loose
      , Transfer Tableau Foundation Single suitFoundation
      , Transfer Cell Foundation Single suitFoundation
      ]
  , stockRule = NoStock
  , automatic = []
  , goalGroup = Foundation
  }
  where
    loose = Build alternating Nothing
    alternating = Descending AlternatingColors
    suitFoundation = Build (Ascending SameSuit) (Just Ace)
