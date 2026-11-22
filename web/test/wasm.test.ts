import { expect, test } from "bun:test";
import * as api from "../src/generated/solitaire/solitaire.js";
import type { Board } from "../src/game.ts";
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

test("Wasm solver references preserve states, resume, reuse solution suffixes and validate lifetimes", () => {
  const owned = new Set<{ dispose(): void }>();
  const own = <T extends { dispose(): void }>(ref: T): T => { owned.add(ref); return ref; };
  const dispose = (ref: { dispose(): void }) => { ref.dispose(); owned.delete(ref); };
  const probe = (solver: api.Solver, budget: number): api.SearchProgress => {
    const step = api.advanceSolver(budget, solver);
    try { return api.stepProgress(step); }
    finally { step.dispose(); }
  };
  const advance = (solver: api.Solver, budget: number): [api.SearchProgress, api.Solver] => {
    const step = api.advanceSolver(budget, solver);
    try {
      const progress = api.stepProgress(step);
      const next = own(api.stepSolver(step));
      dispose(solver);
      return [progress, next];
    } finally { step.dispose(); }
  };
  const select = (board: Board, solver: api.Solver): api.Solver => {
    const next = own(api.selectSolverBoard(board, solver));
    dispose(solver);
    return next;
  };
  const initial = engine.newGame("klondike", 7n);
  try {
    const original = own(api.createSolver("klondike", initial));
    const second = own(api.createSolver("klondike", initial));
    const step = own(api.advanceSolver(32, original));
    expect(api.stepProgress(step)).toEqual({ $tag: "Searching", contents: 32 });
    let first = own(api.stepSolver(step));
    const independentlyOwned = own(api.stepSolver(step));
    expect(independentlyOwned).not.toBe(first);
    expect(() => api.advanceSolver(1, step as unknown as api.Solver)).toThrow(TypeError);
    expect(() => api.stepProgress(first as unknown as api.SolverStep)).toThrow(TypeError);
    dispose(step);
    expect(() => api.stepProgress(step)).toThrow(TypeError);
    expect(probe(original, 0)).toEqual({ $tag: "Searching", contents: 0 });
    expect(probe(independentlyOwned, 0)).toEqual({ $tag: "Searching", contents: 32 });
    dispose(independentlyOwned);
    dispose(original);

    const moved = engine.applyAction("klondike", initial, engine.legalActions("klondike", initial)[0]);
    first = select(moved, first);
    let progress: api.SearchProgress;
    [progress, first] = advance(first, 1);
    expect(progress.$tag).toBe("Searching");
    first = select(initial, first);
    expect(probe(first, 0)).toEqual({ $tag: "Searching", contents: 32 });
    [progress, first] = advance(first, 128);
    for (let i = 0; progress.$tag === "Searching" && i < 100; i++)
      [progress, first] = advance(first, 128);
    expect(progress.$tag).toBe("Finished");
    if (progress.$tag !== "Finished" || progress.contents[0].$tag !== "Solved")
      throw new Error("Expected a cached solution");
    const actions = progress.contents[0].contents;
    const middle = engine.applyAction("klondike", initial, actions[0]);
    first = select(middle, first);
    expect(probe(first, 0)).toEqual({
      $tag: "Finished", contents: [{ $tag: "Solved", contents: actions.slice(1) }, 0],
    });
    expect(probe(second, 0)).toEqual({ $tag: "Searching", contents: 0 });
    dispose(first);
    expect(() => first.dispose()).not.toThrow();
    expect(() => api.advanceSolver(1, first)).toThrow(TypeError);
    expect(() => api.selectSolverBoard(initial, first)).toThrow(TypeError);
    expect(() => api.createSolver("missing", initial)).toThrow(api.HaskellError);
    expect(probe(second, 0)).toEqual({ $tag: "Searching", contents: 0 });
  } finally {
    for (const ref of owned) ref.dispose();
  }
});
