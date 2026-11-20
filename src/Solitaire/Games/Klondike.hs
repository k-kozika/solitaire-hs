module Solitaire.Games.Klondike (klondike) where

import Solitaire.Engine

klondike :: Definition
klondike = Definition
  { gameName = "Klondike"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Stock, 1), (Waste, 1), (Foundation, 4), (Tableau, 7)]
  , fixedCards = []
  , initialDeal = [ (Pile Tableau column, if row == column then Up else Down)
                  | row <- [1 .. 7], column <- [row .. 7] ]
  , reservePile = Just stock
  , transfers =
      [ Transfer (GroupPiles Tableau) (GroupPiles Tableau) (Run alternating) kings
      , Transfer (GroupPiles Waste) (GroupPiles Tableau) Single kings
      , Transfer (GroupPiles Foundation) (GroupPiles Tableau) Single kings
      , Transfer (GroupPiles Tableau) (GroupPiles Foundation) Single suitFoundation
      , Transfer (GroupPiles Waste) (GroupPiles Foundation) Single suitFoundation
      ]
  , stockRule = DrawTo stock (Pile Waste 1) 1 True
  , automatic = [RevealTop Tableau]
  , goal = CollectAll Foundation
  }
  where
    kings = Build alternating (Just King)
    stock = Pile Stock 1
    alternating = Descending AlternatingColors Linear
    suitFoundation = Build (Ascending SameSuit Linear) (Just Ace)
