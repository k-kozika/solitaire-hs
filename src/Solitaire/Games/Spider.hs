module Solitaire.Games.Spider (spider) where

import Solitaire.Engine

spider :: Definition
spider = Definition
  { gameName = "Spider"
  , deckSuits = concat (replicate 2 [minBound .. maxBound])
  , layout = [(Stock, 1), (Foundation, 8), (Tableau, 10)]
  , initialDeal =
      [(Pile Tableau column, Down) | row <- [1 .. 5 :: Int], column <- [1 .. 10], row <= 4 || column <= 4]
      ++ [(Pile Tableau column, Up) | column <- [1 .. 10]]
  , reservePile = Just stock
  , transfers = [Transfer Tableau Tableau (Run suitedRun) (Build (Descending AnySuit) Nothing)]
  , stockRule = DealAcross stock Tableau True
  , automatic = [RevealTop Tableau, CollectRun Tableau Foundation suitedRun 13 True]
  , goalGroup = Foundation
  }
  where
    stock = Pile Stock 1
    suitedRun = Descending SameSuit
