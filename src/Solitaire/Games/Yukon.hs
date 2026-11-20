module Solitaire.Games.Yukon (yukon) where

import Solitaire.Engine

yukon :: Definition
yukon = Definition
  { gameName = "Yukon"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Tableau, 7), (Foundation, 4)]
  , fixedCards = []
  , initialDeal =
      [(Pile Tableau column, if row == column then Up else Down)
      | row <- [1 .. 7], column <- [row .. 7]]
      ++ [(Pile Tableau column, Up) | _ <- [1 .. 4 :: Int], column <- [2 .. 7]]
  , reservePile = Nothing
  , transfers =
      [ Transfer (GroupPiles Tableau) (GroupPiles Tableau) AnyFaceUp
          (Build (Descending AlternatingColors Linear) (Just King))
      , Transfer (GroupPiles Tableau) (GroupPiles Foundation) Single
          (Build (Ascending SameSuit Linear) (Just Ace))
      ]
  , stockRule = NoStock
  , automatic = [RevealTop Tableau]
  , goal = CollectAll Foundation
  }
