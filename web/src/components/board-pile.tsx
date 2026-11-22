import { cardPosition } from "../card-motion";
import {
  canSelect,
  cardName,
  entriesFor,
  moveTo,
  pileKey,
  pileName,
  samePile,
} from "../game";
import type { Action, Pile, Selection, Session } from "../game";
import { CardVisual } from "./card-visual";
import { Icon } from "./icon";
import "./board-pile.css";

export function BoardPile({
  session,
  pile,
  selection,
  hint,
  disabled = false,
  onCard,
  onDraw,
}: {
  session: Session;
  pile: Pile;
  selection: Selection | null;
  hint: Action | null;
  disabled?: boolean;
  onCard: (pile: Pile, count: number) => void;
  onDraw: () => void;
}) {
  const entries = entriesFor(session.board, pile);
  const group = pile.contents[0];
  const tableau = group === "Tableau";
  const stock = group === "Stock";
  const targetAction = selection
    ? moveTo(session.actions, selection, pile)
    : undefined;
  const target = !!targetAction;
  const hintTarget = hint?.$tag === "Move" && samePile(hint.contents[2], pile);
  const hintSource = hint?.$tag === "Move" && samePile(hint.contents[1], pile);
  const hintDraw = hint?.$tag === "Draw" && stock;
  const drawAvailable = session.actions.some(
    (action) => action.$tag === "Draw",
  );
  const displayed = tableau
    ? entries.map((entry, index) => ({ entry, index })).reverse()
    : entries.slice(0, 1).map((entry, index) => ({ entry, index }));
  const cardCount = tableau ? Math.max(entries.length - 1, 0) : 0;
  const name = pileName(pile);
  return (
    <div
      class={`pile ${tableau ? "tableau-pile" : ""} ${target ? "is-target" : ""} ${hintTarget ? "hint-target" : ""} ${hintDraw ? "hint-source" : ""}`}
      data-pile={pileKey(pile)}
      role="group"
      aria-label={name}
    >
      <div class="pile-heading">
        {tableau
          ? String(pile.contents[1]).padStart(2, "0")
          : group === "Foundation"
            ? String(pile.contents[1]).padStart(2, "0")
            : group === "Cell"
              ? `CELL ${pile.contents[1]}`
              : group.toUpperCase()}
        {hintTarget && <Icon name="down" size="1em" />}
      </div>
      <div
        class={`pile-stack ${tableau ? "tableau-stack" : ""}`}
        style={{ "--stack-count": cardCount }}
      >
        {entries.length === 0 && (
          <button
            type="button"
            class={`empty-slot ${hintDraw ? "is-hint" : ""}`}
            disabled={disabled || (stock ? !drawAvailable : !target)}
            aria-label={
              stock
                ? "Recycle stock"
                : target
                  ? `Move selected cards to empty ${name}`
                  : `Empty ${name}`
            }
            onClick={() => (stock ? onDraw() : onCard(pile, 0))}
          >
            <span aria-hidden="true">
              <Icon
                name={
                  stock
                    ? "recycle"
                    : group === "Foundation"
                      ? "spade"
                      : group === "Cell"
                        ? "plus"
                        : "club"
                }
                size="1em"
              />
            </span>
            {target && <span class="target-caption">MOVE HERE</span>}
            {stock && (
              <span class="slot-caption">
                {drawAvailable ? "RECYCLE" : "EMPTY"}
              </span>
            )}
          </button>
        )}
        {displayed.map(({ entry, index }, position) => {
          const [face, card] = entry.contents;
          const down = stock || face === "Down";
          const count = index + 1;
          const movable = !down && canSelect(session.actions, pile, count);
          const selected =
            !!selection &&
            samePile(selection.pile, pile) &&
            index < selection.count;
          const hinted =
            hintSource && hint?.$tag === "Move" && index < hint.contents[0];
          const enabled = stock
            ? drawAvailable
            : !down && (movable || (target && index === 0));
          const label = stock
            ? `Draw from stock, ${entries.length} cards remaining`
            : down
              ? `Face-down card in ${name}`
              : target && index === 0
                ? `Move selected cards to ${name}, ${cardName(card)}`
                : `${cardName(card)} in ${name}${tableau && count > 1 ? `, select ${count} cards` : ""}`;
          return (
            <button
              key={cardPosition(pileKey(pile), entries.length - index - 1)}
              type="button"
              class={`card ${down ? "card-back" : ""} ${!down && (card.suit === "Hearts" || card.suit === "Diamonds") ? "card-red" : ""} ${selected ? "is-selected" : ""} ${hinted ? "is-hint" : ""}`}
              style={
                tableau
                  ? { top: `calc(${position} * var(--card-overlap))` }
                  : undefined
              }
              disabled={disabled || !enabled}
              data-drag-count={!disabled && movable ? count : undefined}
              data-card-position={cardPosition(
                pileKey(pile),
                entries.length - index - 1,
              )}
              aria-label={label}
              aria-pressed={!down && movable ? selected : undefined}
              onClick={() => (stock ? onDraw() : onCard(pile, count))}
              onContextMenu={(event) => {
                if (movable) event.preventDefault();
              }}
            >
              <CardVisual card={card} down={down} />
              {target && index === 0 && (
                <span class="target-marker" aria-hidden="true">
                  <Icon name="move" size="1em" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!tableau && (
        <span class="pile-count">
          {stock
            ? `${entries.length} cards`
            : group === "Foundation" && entries.length
              ? `${entries.length} collected`
              : "\u00a0"}
        </span>
      )}
    </div>
  );
}
