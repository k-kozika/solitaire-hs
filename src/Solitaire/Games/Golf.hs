module Solitaire.Games.Golf (golf) where

import Solitaire.Engine

golf :: Definition
golf = Definition
  { gameName = "Golf"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Stock, 1), (Waste, 1), (Tableau, 7)]
  , fixedCards = []
  , initialDeal =
      [(Pile Tableau column, Up) | _ <- [1 .. 5 :: Int], column <- [1 .. 7]]
      ++ [(waste, Up)]
  , reservePile = Just stock
  , transfers =
      [ Transfer (GroupPiles Tableau) (ExactPile waste) Single (Build order Nothing)
      | order <- [Ascending AnySuit Linear, Descending AnySuit Linear]
      ]
  , stockRule = DrawTo stock waste 1 False
  , automatic = []
  , goal = Clear Tableau
  }
  where
    stock = Pile Stock 1
    waste = Pile Waste 1
