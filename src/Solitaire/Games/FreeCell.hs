module Solitaire.Games.FreeCell (freecell) where

import Solitaire.Engine

freecell :: Definition
freecell = Definition
  { gameName = "FreeCell"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Cell, 4), (Foundation, 4), (Tableau, 8)]
  , fixedCards = []
  , initialDeal = [(Pile Tableau column, Up) | column <- take 52 (cycle [1 .. 8])]
  , reservePile = Nothing
  , transfers =
      [ Transfer (GroupPiles Tableau) (GroupPiles Tableau) (ByVacancies alternating Cell Tableau) loose
      , Transfer (GroupPiles Tableau) (GroupPiles Cell) Single EmptyOnly
      , Transfer (GroupPiles Cell) (GroupPiles Tableau) Single loose
      , Transfer (GroupPiles Tableau) (GroupPiles Foundation) Single suitFoundation
      , Transfer (GroupPiles Cell) (GroupPiles Foundation) Single suitFoundation
      ]
  , stockRule = NoStock
  , automatic = []
  , goal = CollectAll Foundation
  }
  where
    loose = Build alternating Nothing
    alternating = Descending AlternatingColors Linear
    suitFoundation = Build (Ascending SameSuit Linear) (Just Ace)
