import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { calculateBoardLayout } from "../board-layout";
import {
  animateCardMotions,
  captureCardPositions,
  planCardMotions,
} from "../card-motion";
import type { CardPositions } from "../card-motion";
import { mountCardDnd } from "../dnd";
import { entriesFor, moveTo, pileKey, pilesFor } from "../game";
import type { Pile, Selection, Session } from "../game";
import { BoardPile } from "./board-pile";
import { CardVisual } from "./card-visual";
import "./table.css";

export function Table({
  session,
  selection,
  hint,
  disabled,
  onCard,
  onDraw,
  onDrag,
  onDragEnd,
  onDrop,
}: Omit<Parameters<typeof BoardPile>[0], "pile"> & {
  disabled: boolean;
  onDrag: (pile: Pile, count: number) => void;
  onDragEnd: () => void;
  onDrop: (pile: Pile) => void;
}) {
  const stocks = pilesFor(session.board, "Stock");
  const waste = pilesFor(session.board, "Waste");
  const cells = pilesFor(session.board, "Cell");
  const foundations = pilesFor(session.board, "Foundation");
  const tableaus = pilesFor(session.board, "Tableau");
  const boardRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const previousSession = useRef<Session | null>(null);
  const previousPositions = useRef<CardPositions>(new Map());
  const draggedSession = useRef<Session | null>(null);
  const stopMotions = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<Selection | null>(null);
  const callbacks = useRef({ onStart: onDrag, onEnd: onDragEnd, onDrop });
  callbacks.current = { onStart: onDrag, onEnd: onDragEnd, onDrop };
  const reserveColumns =
    stocks.length +
    waste.length +
    cells.length +
    (foundations.length === 12 ? 6 : foundations.length);
  const applyLayout = useRef<() => void>(() => {});
  const layoutSignature = useRef("");
  applyLayout.current = () => {
    const root = boardRef.current;
    const shell = root?.closest<HTMLElement>(".game-table");
    const board = root?.querySelector<HTMLElement>(".board-layout");
    if (!root || !shell || !board) return;
    const chrome = [...shell.children].filter((element) => element !== root);
    const messages = chrome.filter(
      (element) =>
        element.matches(".move-message, .play-error") &&
        element.getBoundingClientRect().height > 0,
    );
    const style = getComputedStyle(root);
    const layout = calculateBoardLayout({
      width:
        root.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      chromeHeight: chrome.reduce(
        (height, element) => height + element.getBoundingClientRect().height,
        0,
      ),
      messageCount: messages.length,
      columns: Math.max(tableaus.length, reserveColumns),
      reserveRows: foundations.length === 12 ? 2 : reserveColumns ? 1 : 0,
      tableauLengths: tableaus.map(
        (pile) => entriesFor(session.board, pile).length,
      ),
      compact: matchMedia("(max-width: 700px)").matches,
    });
    const signature = JSON.stringify(layout);
    if (signature !== layoutSignature.current) {
      stopMotions.current?.();
      layoutSignature.current = signature;
    }
    const variable = (element: HTMLElement, name: string, value: number) =>
      element.style.setProperty(name, `${value}px`);
    variable(shell, "--edge-space", layout.edgeSpace);
    variable(shell, "--section-gap", layout.sectionGap);
    variable(board, "--card-width", layout.cardWidth);
    variable(board, "--card-height", layout.cardHeight);
    variable(board, "--pile-gap", layout.pileGap);
    variable(board, "--reserve-gap", layout.reserveGap);
    variable(board, "--foundation-gap", layout.foundationGap);
    for (const [index, pile] of tableaus.entries()) {
      const element = root.querySelector<HTMLElement>(
        `[data-pile="${pileKey(pile)}"]`,
      );
      if (element) variable(element, "--card-overlap", layout.overlaps[index]);
    }
    if (preview && previewRef.current) {
      const source = root.querySelector<HTMLElement>(
        `[data-pile="${pileKey(preview.pile)}"]`,
      );
      if (source)
        previewRef.current.style.setProperty(
          "--card-overlap",
          getComputedStyle(source).getPropertyValue("--card-overlap"),
        );
    }
    if (previousSession.current === session && motionRef.current)
      previousPositions.current = captureCardPositions(root, motionRef.current);
  };
  // Also runs for selections/hints, whose messages can change the height budget.
  useLayoutEffect(() => {
    applyLayout.current();
  });
  useLayoutEffect(() => {
    const root = boardRef.current!;
    const shell = root.closest<HTMLElement>(".game-table")!;
    const resize = () => applyLayout.current();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    for (const element of shell.children)
      if (element !== root) observer.observe(element);
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      shell.style.removeProperty("--edge-space");
      shell.style.removeProperty("--section-gap");
    };
  }, []);
  useLayoutEffect(() => {
    const motions = planCardMotions(previousSession.current, session).filter(
      (motion) =>
        motion.kind !== "move" || draggedSession.current !== previousSession.current,
    );
    draggedSession.current = null;
    previousSession.current = session;
    if (!boardRef.current || !motionRef.current) return;
    const cleanup = animateCardMotions(
      boardRef.current,
      motionRef.current,
      motions,
      previousPositions.current,
    );
    previousPositions.current = captureCardPositions(
      boardRef.current,
      motionRef.current,
    );
    stopMotions.current = cleanup;
    return cleanup;
  }, [session]);
  useLayoutEffect(() => {
    setPreview(null);
    if (disabled || !boardRef.current || !previewRef.current) return;
    let dragged: Selection | null = null;
    return mountCardDnd(boardRef.current, previewRef.current, session, {
      onStart: (pile, count) => {
        dragged = { pile, count };
        callbacks.current.onStart(pile, count);
      },
      onEnd: () => callbacks.current.onEnd(),
      onDrop: (pile) => {
        if (dragged && moveTo(session.actions, dragged, pile))
          draggedSession.current = session;
        callbacks.current.onDrop(pile);
      },
      onPreview: (value) => {
        if (value) stopMotions.current?.();
        setPreview(value);
      },
    });
  }, [session, disabled]);

  const props = { session, selection, hint, disabled, onCard, onDraw };
  const renderPile = (pile: Pile) => (
    <BoardPile key={pileKey(pile)} {...props} pile={pile} />
  );
  return (
    <div
      class="board-scroll"
      tabIndex={0}
      role="region"
      aria-label="Card table"
      ref={boardRef}
    >
      <div
        class={`board-layout ${session.gameId === "grandfathers-clock" ? "clock-layout" : ""}`}
        style={{
          "--columns": tableaus.length,
          "--layout-columns": Math.max(tableaus.length, reserveColumns),
        }}
      >
        {reserveColumns > 0 && (
          <div class="reserve-row">
            <div class="reserve-piles">
              {[...stocks, ...waste, ...cells].map(renderPile)}
            </div>
            {foundations.length > 0 && (
              <div
                class={`foundation-piles ${foundations.length === 12 ? "clock-foundations" : ""}`}
                aria-label="Foundations"
              >
                {foundations.map(renderPile)}
              </div>
            )}
          </div>
        )}
        <div class="tableau-row">{tableaus.map(renderPile)}</div>
        <div
          ref={previewRef}
          class="drag-preview"
          aria-hidden="true"
          style={{ display: preview ? undefined : "none" }}
        >
          {preview &&
            entriesFor(session.board, preview.pile)
              .slice(0, preview.count)
              .reverse()
              .map((entry, index) => (
                <div
                  class={`card ${entry.contents[1].suit === "Hearts" || entry.contents[1].suit === "Diamonds" ? "card-red" : ""}`}
                  style={{ top: `calc(${index} * var(--card-overlap))` }}
                >
                  <CardVisual card={entry.contents[1]} />
                </div>
              ))}
        </div>
        <div ref={motionRef} class="card-motion-layer" aria-hidden="true" />
      </div>
    </div>
  );
}
