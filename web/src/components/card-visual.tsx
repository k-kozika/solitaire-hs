import type { Card } from "../game";
import { Face } from "./face";
import "./card-visual.css";

export function CardVisual({
  card,
  down = false,
}: {
  card: Card;
  down?: boolean;
}) {
  return (
    <span class="card-visual" aria-hidden="true">
      <span class={`card-rotator ${down ? "is-face-down" : ""}`}>
        <span class="card-side card-front">
          <Face card={card} />
        </span>
        <span class="card-side card-reverse">
          <span class="back-pattern">
            <span>♠</span>
          </span>
        </span>
      </span>
    </span>
  );
}
