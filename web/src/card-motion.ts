import { entriesFor, pileKey, pilesFor } from "./game";
import type { Card, Session } from "./game";

type CardMotion = {
  target: string;
  source?: string;
  kind: "initial" | "deal" | "flip";
  fromDown: boolean;
  toDown: boolean;
  duration: number;
  delay: number;
};

const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

// Depth is counted from the bottom, so exposing a card or adding a card on top
// does not change the identity of the other slots, even in a two-deck game.
export const cardPosition = (pile: string, depth: number) => `${pile}@${depth}`;

export function planCardMotions(
  previous: Session | null,
  next: Session,
): CardMotion[] {
  const forward = previous !== null && next.history.includes(previous.board);
  const undo = previous !== null && previous.history.includes(next.board);
  const initial = !forward && !undo;
  const motions: CardMotion[] = [];
  const dealt: { card: Card; source: string; order: number }[] = [];

  if (forward) {
    for (const stock of pilesFor(previous.board, "Stock")) {
      const before = entriesFor(previous.board, stock);
      const after = entriesFor(next.board, stock);
      const count = before.length - after.length;
      for (const entry of before.slice(0, Math.max(0, count))) {
        dealt.push({
          card: entry.contents[1],
          source: pileKey(stock),
          order: dealt.length,
        });
      }
    }
  }

  // Use pile order for deal order, not Map insertion order or suit/rank keys.
  const piles = [...next.board.keys()].sort(
    (a, b) =>
      a.contents[0].localeCompare(b.contents[0]) ||
      a.contents[1] - b.contents[1],
  );
  for (const pile of piles) {
    if (pile.contents[0] === "Stock") continue;
    const entries = entriesFor(next.board, pile);
    const before = previous ? entriesFor(previous.board, pile) : [];
    const visible =
      pile.contents[0] === "Tableau"
        ? entries.length
        : Math.min(1, entries.length);
    for (let index = 0; index < visible; index++) {
      const [face, card] = entries[index].contents;
      const depth = entries.length - index - 1;
      const old = before[before.length - depth - 1];
      const target = cardPosition(pileKey(pile), depth);
      if (initial) {
        if (face === "Up")
          motions.push({
            target,
            kind: "initial",
            fromDown: true,
            toDown: false,
            duration: 140,
            delay: 0,
          });
        continue;
      }
      // A draw appends above the previous pile. Do not confuse a duplicate
      // Spider card already in that pile with the newly dealt copy.
      const incoming =
        forward && !old
          ? dealt.findIndex((item) => sameCard(item.card, card))
          : -1;
      if (incoming >= 0) {
        const [item] = dealt.splice(incoming, 1);
        motions.push({
          target,
          source: item.source,
          kind: "deal",
          fromDown: true,
          toDown: face === "Down",
          duration: 240,
          delay: item.order * 24,
        });
      } else if (
        old &&
        sameCard(old.contents[1], card) &&
        old.contents[0] !== face
      ) {
        motions.push({
          target,
          kind: "flip",
          fromDown: old.contents[0] === "Down",
          toDown: face === "Down",
          duration: 240,
          delay: 0,
        });
      }
    }
  }
  if (initial) {
    motions.forEach((motion, index) => {
      motion.delay =
        index * Math.min(20, 100 / Math.max(1, motions.length - 1));
    });
  }
  return motions;
}

export function animateCardMotions(
  root: HTMLElement,
  layer: HTMLElement,
  motions: CardMotion[],
): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start: (() => void)[] = [];
  const cleanups: (() => void)[] = [];
  const bounds = layer.getBoundingClientRect();

  for (const [index, motion] of motions.entries()) {
    const target = root.querySelector<HTMLElement>(
      `[data-card-position="${motion.target}"]`,
    );
    const visual = target?.querySelector<HTMLElement>(".card-visual");
    if (!target || !visual) continue;
    let surface = visual;
    let flight: HTMLElement | undefined;
    const source = motion.source
      ? root.querySelector<HTMLElement>(
          `[data-pile="${motion.source}"] .pile-stack`,
        )
      : null;

    if (source && !reduced) {
      const from = source.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      flight = document.createElement("div");
      flight.className = `card card-flight ${target.classList.contains("card-red") ? "card-red" : ""} ${target.closest(".tableau-stack") ? "card-flight-tableau" : ""}`;
      Object.assign(flight.style, {
        left: `${to.left - bounds.left}px`,
        top: `${to.top - bounds.top}px`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        zIndex: String(motions.length - index),
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)`,
      });
      surface = visual.cloneNode(true) as HTMLElement;
      flight.append(surface);
      layer.append(flight);
      visual.style.visibility = "hidden";
      const moving = flight;
      start.push(() => {
        moving.style.transition = `transform ${motion.duration}ms cubic-bezier(0.2, 0, 0, 1) ${motion.delay}ms`;
        moving.style.transform = "translate(0, 0)";
      });
    }

    surface.dataset.cardMotion = motion.kind;
    const rotator = surface.querySelector<HTMLElement>(".card-rotator")!;
    const duration = reduced ? 120 : motion.duration;
    const delay = reduced ? 0 : motion.delay;
    if (reduced) {
      surface.style.opacity = "0.25";
      start.push(() => {
        surface.style.transition = `opacity ${duration}ms ease-out`;
        surface.style.opacity = "1";
      });
    } else {
      rotator.style.transform = `rotateY(${motion.fromDown ? 180 : 0}deg)`;
      start.push(() => {
        rotator.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0, 0, 1) ${delay}ms`;
        rotator.style.transform = `rotateY(${motion.toDown ? 180 : 0}deg)`;
      });
    }
    const cleanup = () => {
      flight?.remove();
      visual.style.removeProperty("visibility");
      surface.style.removeProperty("opacity");
      surface.style.removeProperty("transition");
      rotator.style.removeProperty("transition");
      rotator.style.removeProperty("transform");
      delete surface.dataset.cardMotion;
    };
    const timer = setTimeout(cleanup, duration + delay + 30);
    cleanups.push(() => {
      clearTimeout(timer);
      cleanup();
    });
  }
  // Commit all starting positions together, then transition to the new board.
  if (start.length) {
    void root.offsetWidth;
    start.forEach((run) => run());
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}
