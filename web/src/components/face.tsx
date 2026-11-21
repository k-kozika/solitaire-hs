import { rankLabels, suitSymbols } from "../game";
import type { Card } from "../game";
import "./face.css";

export function Face({ card }: { card: Card }) {
  const symbol = suitSymbols[card.suit];
  return (
    <>
      <span class="card-corner">
        <span>{rankLabels[card.rank]}</span>
        <span>{symbol}</span>
      </span>
      <span class="card-suit">{symbol}</span>
      <span class="card-corner card-corner-bottom">
        <span>{rankLabels[card.rank]}</span>
        <span>{symbol}</span>
      </span>
    </>
  );
}
