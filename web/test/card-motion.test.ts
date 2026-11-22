import { describe, expect, test } from "bun:test";
import { cardPosition, planCardMotions } from "../src/card-motion";
import type { Board, Entry, Pile, Session } from "../src/game";

const pile = (group: Pile["contents"][0], number = 1): Pile => ({
  $tag: "Pile",
  contents: [group, number],
});
const entry = (rank: "Ace" | "Two", face: "Up" | "Down" = "Up"): Entry => ({
  $tag: "Entry",
  contents: [face, { $tag: "Card", suit: "Spades", rank }],
});
const stock = pile("Stock");
const waste = pile("Waste");
const tableau = pile("Tableau");
const position = (p: Pile, depth: number) =>
  cardPosition(`${p.contents[0]}:${p.contents[1]}`, depth);
const session = (board: Board, history: Board[] = []): Session => ({
  board,
  history,
  gameId: "test",
  name: "Test",
  seed: 0n,
  turns: history.length,
  revision: history.length + 1,
  actions: [],
  startedAt: 1,
  finishedAt: null,
});

describe("card motion planning", () => {
  test("initial deals flip face-up cards quickly and keep the stock face down", () => {
    const board: Board = new Map([
      [stock, [entry("Ace", "Down")]],
      [tableau, [entry("Ace"), entry("Two", "Down")]],
    ]);
    const motions = planCardMotions(null, session(board));
    expect(motions).toHaveLength(1);
    expect(motions[0]).toMatchObject({
      kind: "initial",
      target: position(tableau, 1),
      duration: 140,
    });
  });

  test("Klondike deals from the stock to the new waste card, including the last stock card", () => {
    const before: Board = new Map([
      [stock, [entry("Ace", "Down")]],
      [waste, [entry("Two")]],
    ]);
    const after: Board = new Map([
      [stock, []],
      [waste, [entry("Ace"), entry("Two")]],
    ]);
    expect(planCardMotions(session(before), session(after, [before]))).toEqual([
      {
        kind: "deal",
        target: position(waste, 1),
        source: "Stock:1",
        fromDown: true,
        toDown: false,
        duration: 240,
        delay: 0,
      },
    ]);
  });

  test("Spider uses the same stock motion for ten columns with duplicate cards", () => {
    const columns = Array.from({ length: 10 }, (_, i) =>
      pile("Tableau", i + 1),
    );
    const before: Board = new Map([
      [stock, Array.from({ length: 10 }, () => entry("Ace", "Down"))],
    ]);
    const after: Board = new Map([[stock, []]]);
    // Deliberately shuffled Map order must not affect dealing order.
    for (const column of [...columns].reverse()) {
      before.set(column, [entry("Ace"), entry("Ace", "Down")]);
      after.set(column, [entry("Ace"), entry("Ace"), entry("Ace", "Down")]);
    }
    const motions = planCardMotions(session(before), session(after, [before]));
    expect(motions).toHaveLength(10);
    expect(motions.map((motion) => motion.target)).toEqual(
      columns.map((column) => position(column, 2)),
    );
    expect(
      motions.every(
        (motion) =>
          motion.kind === "deal" &&
          motion.source === "Stock:1" &&
          motion.duration === 240,
      ),
    ).toBe(true);
    expect(motions.map((motion) => motion.delay)).toEqual(
      columns.map((_, i) => i * 24),
    );
  });

  test("moving a card flies face up while the exposed card flips in place", () => {
    const other = pile("Tableau", 2);
    const before: Board = new Map([
      [tableau, [entry("Two"), entry("Ace", "Down")]],
      [other, []],
    ]);
    const after: Board = new Map([
      [tableau, [entry("Ace")]],
      [other, [entry("Two")]],
    ]);
    const motions = planCardMotions(session(before), session(after, [before]));
    expect(motions).toHaveLength(2);
    expect(motions.find((motion) => motion.kind === "flip")).toMatchObject({
      kind: "flip",
      target: position(tableau, 0),
      fromDown: true,
      toDown: false,
    });
    expect(motions.find((motion) => motion.kind === "move")).toMatchObject({
      target: position(other, 0),
      source: "Tableau:1",
      sourceCard: position(tableau, 1),
      fromDown: false,
      toDown: false,
      duration: 240,
      delay: 0,
    });
    const reversed = planCardMotions(session(after, [before]), session(before));
    expect(reversed).toHaveLength(1);
    expect(reversed[0]).toMatchObject({
      kind: "flip",
      target: position(tableau, 0),
      fromDown: false,
      toDown: true,
    });
  });

  test("a stack moves together from each original card position", () => {
    const other = pile("Tableau", 2);
    const before: Board = new Map([
      [tableau, [entry("Ace"), entry("Two"), entry("Ace", "Down")]],
      [other, [entry("Two")]],
    ]);
    const after: Board = new Map([
      [tableau, [entry("Ace")]],
      [other, [entry("Ace"), entry("Two"), entry("Two")]],
    ]);
    const moves = planCardMotions(session(before), session(after, [before])).filter(
      (motion) => motion.kind === "move",
    );
    expect(moves).toHaveLength(2);
    expect(moves.map((motion) => [motion.sourceCard, motion.target])).toEqual([
      [position(tableau, 2), position(other, 2)],
      [position(tableau, 1), position(other, 1)],
    ]);
    expect(
      moves.every((motion) => motion.delay === 0 && !motion.fromDown && !motion.toDown),
    ).toBe(true);
  });

  test("duplicate cards already in the destination stay still", () => {
    const other = pile("Tableau", 2);
    const before: Board = new Map([
      [tableau, [entry("Ace")]],
      [other, [entry("Ace")]],
    ]);
    const after: Board = new Map([
      [tableau, []],
      [other, [entry("Ace"), entry("Ace")]],
    ]);
    const motions = planCardMotions(session(before), session(after, [before]));
    expect(motions).toHaveLength(1);
    expect(motions[0]).toMatchObject({
      kind: "move",
      sourceCard: position(tableau, 0),
      target: position(other, 1),
    });
  });

  test("moves from waste to foundation keep their original position and face", () => {
    const foundation = pile("Foundation");
    const before: Board = new Map([
      [waste, [entry("Ace"), entry("Two")]],
      [foundation, []],
    ]);
    const after: Board = new Map([
      [waste, [entry("Two")]],
      [foundation, [entry("Ace")]],
    ]);
    expect(planCardMotions(session(before), session(after, [before]))).toEqual([
      {
        kind: "move",
        target: position(foundation, 0),
        source: "Waste:1",
        sourceCard: position(waste, 1),
        fromDown: false,
        toDown: false,
        duration: 240,
        delay: 0,
      },
    ]);
  });

  test("recycling and undoing a draw do not trigger an initial deal or draw animation", () => {
    const before: Board = new Map([
      [stock, []],
      [waste, [entry("Ace")]],
    ]);
    const after: Board = new Map([
      [stock, [entry("Ace", "Down")]],
      [waste, []],
    ]);
    expect(planCardMotions(session(before), session(after, [before]))).toEqual(
      [],
    );
    expect(planCardMotions(session(after, [before]), session(before))).toEqual(
      [],
    );
  });

  test("a stock card collected automatically still flies to its visible destination", () => {
    const foundation = pile("Foundation");
    const before: Board = new Map([
      [stock, [entry("Ace", "Down")]],
      [tableau, [entry("Two")]],
      [foundation, []],
    ]);
    const after: Board = new Map([
      [stock, []],
      [tableau, []],
      [foundation, [entry("Ace"), entry("Two")]],
    ]);
    const motions = planCardMotions(session(before), session(after, [before]));
    expect(motions).toHaveLength(1);
    expect(motions[0]).toMatchObject({
      kind: "deal",
      source: "Stock:1",
      target: position(foundation, 1),
    });
  });

  test("starting a fresh deal replays the fast flip even for the same game and seed", () => {
    const first: Board = new Map([[tableau, [entry("Ace")]]]);
    const fresh: Board = new Map([[tableau, [entry("Ace")]]]);
    expect(planCardMotions(session(first), session(fresh))[0].kind).toBe(
      "initial",
    );
  });

  test("batched draws remain stock deals instead of replaying the initial flip", () => {
    const before: Board = new Map([
      [stock, [entry("Ace", "Down"), entry("Two", "Down")]],
      [waste, []],
    ]);
    const middle: Board = new Map([
      [stock, [entry("Two", "Down")]],
      [waste, [entry("Ace")]],
    ]);
    const after: Board = new Map([
      [stock, []],
      [waste, [entry("Two"), entry("Ace")]],
    ]);
    const motions = planCardMotions(
      session(before),
      session(after, [before, middle]),
    );
    expect(motions).toHaveLength(1);
    expect(motions[0]).toMatchObject({
      kind: "deal",
      source: "Stock:1",
      target: position(waste, 1),
    });
  });
});
