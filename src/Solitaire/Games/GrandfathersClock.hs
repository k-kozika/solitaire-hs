module Solitaire.Games.GrandfathersClock (grandfathersClock) where

import Solitaire.Engine

grandfathersClock :: Definition
grandfathersClock = Definition
  { gameName = "Grandfather's Clock"
  , deckSuits = [minBound .. maxBound]
  , layout = [(Foundation, 12), (Tableau, 8)]
  , fixedCards =
      [(Pile Foundation hour, Entry Up card) | (hour, card) <- zip [1 ..] bases]
  , initialDeal =
      [(Pile Tableau column, Up) | _ <- [1 .. 5 :: Int], column <- [1 .. 8]]
  , reservePile = Nothing
  , transfers =
      Transfer (GroupPiles Tableau) (GroupPiles Tableau) Single
        (Build (Descending AnySuit Cyclic) Nothing)
      : [ Transfer (GroupPiles Tableau) (ExactPile (Pile Foundation hour)) Single
            (StopAt terminal (Build (Ascending SameSuit Cyclic) (Just (rank base))))
        | (hour, base, terminal) <- zip3 [1 ..] bases [Ace .. Queen]
        ]
  , stockRule = NoStock
  , automatic = []
  , goal = CollectAll Foundation
  }
  where
    bases =
      [ Card Ten Hearts, Card Jack Spades, Card Queen Diamonds, Card King Clubs
      , Card Two Hearts, Card Three Spades, Card Four Diamonds, Card Five Clubs
      , Card Six Hearts, Card Seven Spades, Card Eight Diamonds, Card Nine Clubs
      ]
