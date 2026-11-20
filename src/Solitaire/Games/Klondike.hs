module Solitaire.Games.Klondike (klondike) where

import Solitaire.Engine

klondike :: Definition
klondike = Definition
  { gameName = "Klondike"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Stock, 1), (Waste, 1), (Foundation, 4), (Tableau, 7)]
  , initialDeal = [ (Pile Tableau column, if row == column then Up else Down)
                  | row <- [1 .. 7], column <- [row .. 7] ]
  , reservePile = Just stock
  , transfers =
      [ Transfer Tableau Tableau (Run alternating) kings
      , Transfer Waste Tableau Single kings
      , Transfer Foundation Tableau Single kings
      , Transfer Tableau Foundation Single suitFoundation
      , Transfer Waste Foundation Single suitFoundation
      ]
  , stockRule = DrawTo stock (Pile Waste 1) 1 True
  , automatic = [RevealTop Tableau]
  , goalGroup = Foundation
  }
  where
    kings = Build alternating (Just King)
    stock = Pile Stock 1
    alternating = Descending AlternatingColors
    suitFoundation = Build (Ascending SameSuit) (Just Ace)
