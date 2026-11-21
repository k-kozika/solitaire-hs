import { expect, test } from "bun:test";
import * as api from "../src/generated/solitaire/solitaire.js";
import { loadEngine } from "../src/engine.ts";
import {
  advanceSession,
  createSession,
  MAX_SEED,
  undoSession,
} from "../src/game.ts";

const unwrap = (result: ReturnType<typeof api.solve>) => {
  if ("Left" in result) throw new Error(result.Left);
  return result.Right;
};

const engine = await loadEngine();

test("all six games preserve deterministic seeds and accept enumerated legal actions", () => {
  expect(engine.games()).toHaveLength(6);

  for (const [id, name] of engine.games()) {
    for (const seed of [0n, 42n, MAX_SEED]) {
      const firstBoard = engine.newGame(id, seed);
      const secondBoard = engine.newGame(id, seed);
      expect(firstBoard).toStrictEqual(secondBoard);

      let session = createSession(engine, id, name, seed, 1);
      const initialBoard = session.board;

      expect(session.board).toStrictEqual(firstBoard);

      for (let step = 0; step < 8 && session.actions.length; step++) {
        session = advanceSession(
          engine,
          session,
          session.actions[step % session.actions.length],
        );

        expect(session.turns).toBe(step + 1);
        expect([...session.board.values()].flat()).toHaveLength(
          id === "spider" ? 104 : 52,
        );
        expect(session.actions).toStrictEqual(
          engine.legalActions(id, session.board),
        );
      }

      while (session.history.length) {
        session = undoSession(engine, session);
      }

      expect(session.board).toStrictEqual(initialBoard);
      expect(session.actions).toStrictEqual(
        engine.legalActions(id, initialBoard),
      );
      expect(session.turns).toBe(0);
    }
  }

  expect(() => engine.newGame("klondike", MAX_SEED + 1n)).toThrow();
});

test("all enumerated initial legal actions can be applied and undone", () => {
  for (const [id, name] of engine.games()) {
    for (const seed of [0n, 42n, MAX_SEED]) {
      const initial = createSession(engine, id, name, seed, 1);

      for (const action of initial.actions) {
        const session = createSession(engine, id, name, seed, 1);
        const next = advanceSession(engine, session, action);

        expect(next.turns).toBe(1);
        expect(next.actions).toStrictEqual(
          engine.legalActions(id, next.board),
        );

        const restored = undoSession(engine, next);

        expect(restored.board).toStrictEqual(session.board);
        expect(restored.actions).toStrictEqual(session.actions);
        expect(restored.turns).toBe(0);
      }
    }
  }
});

test("Klondike seed 7 has a legal winning hint path within the default budget", () => {
  let session = createSession(engine, "klondike", "Klondike", 7n, 1);
  const result = unwrap(api.solve(3500, session.gameId, session.board));

  expect(result.$tag).toBe("Solved");
  expect(result.contents.length).toBeGreaterThan(0);

  for (const action of result.contents) {
    session = advanceSession(engine, session, action);
  }

  expect(session.finishedAt != null).toBe(true);
  expect(engine.won(session.gameId, session.board)).toBe(true);
  expect(session.turns).toBe(result.contents.length);

  const undone = undoSession(engine, session);

  expect(undone.finishedAt).toBeNull();
  expect(engine.won(undone.gameId, undone.board)).toBe(false);
  expect(undone.revision).toBeGreaterThan(session.revision);

  session = advanceSession(engine, undone, result.contents.at(-1));

  expect(engine.won(session.gameId, session.board)).toBe(true);

  while (session.history.length) {
    session = undoSession(engine, session);
  }

  expect(session.board).toStrictEqual(engine.newGame("klondike", 7n));
  expect(session.turns).toBe(0);
});
