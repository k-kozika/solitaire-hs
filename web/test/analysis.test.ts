import { describe, expect, test } from "bun:test";
import { AnalysisClient } from "../src/analysis";
import type { SearchMessage, SearchRequest, SearchWorker } from "../src/analysis";
import { AnalysisRunner } from "../src/analysis-runner";
import type { SolverApi } from "../src/analysis-runner";
import type { Analysis, Board } from "../src/game";
import type { SearchProgress, Solver, SolverStep } from "../src/generated/solitaire/solitaire.js";

class FakeWorker implements SearchWorker {
  onmessage: SearchWorker["onmessage"] = null;
  onerror: SearchWorker["onerror"] = null;
  requests: SearchRequest[] = [];
  terminated = false;
  postMessage(request: SearchRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  emit(data: SearchMessage) { this.onmessage?.({ data } as MessageEvent<SearchMessage>); }
  selections() { return this.requests.filter(r => r.type === "select"); }
}
const board: Board = new Map();
const progress = (revision: number, value: SearchProgress, dealId = 0): SearchMessage =>
  ({ type: "progress", dealId, revision, progress: value });
const running = { $tag: "Searching", contents: 32 } as const;
const exhausted: SearchProgress = { $tag: "Finished", contents: [{ $tag: "Exhausted" }, 64] };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe("analysis lifecycle", () => {
  test("moves and Undo reuse a worker, preserve the deal, and ignore stale revisions", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, v => updates.push(v));
    expect(worker.selections()).toHaveLength(0);
    worker.emit({ type: "ready" });
    worker.emit(progress(1, running));
    client.search("golf", board, 2, v => updates.push(v));
    worker.emit(progress(1, exhausted));
    expect(updates.at(-1)?.status).toBe("analyzing");
    client.cancel();
    client.search("golf", board, 3, v => updates.push(v));
    expect(worker.terminated).toBe(false);
    expect(worker.selections().map(r => r.dealId)).toEqual([0, 0, 0]);
    worker.emit(progress(3, { $tag: "Finished", contents: [{ $tag: "Solved", contents: [] }, 0] }));
    expect(updates.at(-1)?.status).toBe("solved");
    client.dispose();
    expect(worker.terminated).toBe(true);
  });
  test("same-game new deals reset the solver and ignore old deal responses", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, v => updates.push(v));
    worker.emit({ type: "ready" });
    client.newDeal();
    client.search("golf", board, 1, v => updates.push(v));
    expect(worker.requests).toContainEqual({ type: "reset" });
    worker.emit(progress(1, exhausted, 0));
    expect(updates.at(-1)?.status).toBe("analyzing");
    worker.emit(progress(1, exhausted, 1));
    expect(updates.at(-1)?.status).toBe("impossible");
    expect(worker.terminated).toBe(false);
    client.dispose();
  });
  test("heartbeats allow continuation beyond the old deadline; silence terminates", async () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker, 40);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, v => updates.push(v));
    worker.emit({ type: "ready" });
    for (let i = 0; i < 4; i++) {
      await sleep(15);
      worker.emit(progress(1, running));
    }
    expect(worker.terminated).toBe(false);
    expect(updates.at(-1)?.status).toBe("analyzing");
    await sleep(60);
    expect(updates.at(-1)?.status).toBe("error");
    expect(worker.terminated).toBe(true);
    client.dispose();
  });
  test("retention is undetermined, load/runtime errors are recoverable", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, v => updates.push(v));
    worker.emit({ type: "ready" });
    worker.emit(progress(1, { $tag: "RetentionLimit", contents: 20 }));
    expect(updates.at(-1)?.status).toBe("unknown");
    client.search("golf", board, 2, v => updates.push(v));
    worker.emit({ type: "error", dealId: 0, revision: 2, message: "runtime failure" });
    expect(updates.at(-1)).toEqual({ status: "error", reason: "runtime failure" });
    expect(worker.terminated).toBe(true);
    client.dispose();
  });
  test("cancellation before ready keeps initialization and dispatches only the current board", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, v => updates.push(v));
    client.cancel();
    client.search("golf", board, 2, v => updates.push(v));
    worker.emit({ type: "ready" });
    expect(worker.selections().map(r => r.revision)).toEqual([2]);
    client.cancel();
    worker.emit(progress(2, exhausted));
    expect(updates.map(v => v.status)).toEqual(["analyzing", "analyzing"]);
    client.dispose();
  });
});

test("worker loop adapts slices, resumes selections, releases deals and stops on terminal results", () => {
  const tasks = new Map<number, () => void>();
  let ticket = 0, creates = 0;
  const budgets: number[] = [], selections: Board[] = [];
  const live = new Set<{ dispose(): void }>();
  const reference = () => {
    const ref = { dispose() { expect(live.delete(ref)).toBe(true); } };
    live.add(ref);
    return ref;
  };
  const solver = () => reference() as Solver;
  let result: SearchProgress = running;
  const api: SolverApi = {
    createSolver: () => { creates++; return solver(); },
    selectSolverBoard: (b, previous) => {
      expect(live.has(previous)).toBe(true);
      selections.push(b);
      return solver();
    },
    advanceSolver: (budget, previous) => {
      expect(live.has(previous)).toBe(true);
      budgets.push(budget);
      return reference() as SolverStep;
    },
    stepProgress: step => { expect(live.has(step)).toBe(true); return result; },
    stepSolver: step => { expect(live.has(step)).toBe(true); return solver(); },
  };
  const messages: SearchMessage[] = [];
  let time = 0, duration = 20;
  const runner = new AnalysisRunner(api, m => messages.push(m),
    callback => { tasks.set(++ticket, callback); return ticket; },
    id => { tasks.delete(id as number); }, () => { time += duration; return time; });
  const select = (revision: number, dealId = 0): SearchRequest =>
    ({ type: "select", dealId, revision, gameId: "golf", board });
  const tick = () => {
    const [id, task] = [...tasks][0]; tasks.delete(id); task();
    expect(live.size).toBe(1);
  };
  runner.receive(select(1));
  expect(live.size).toBe(1);
  expect(budgets).toEqual([32]);
  tick();
  expect(budgets).toEqual([32, 16]);
  duration = 10000;
  tick(); tick();
  expect(budgets.at(-1)).toBe(1);
  duration = 0.01;
  tick(); tick(); tick();
  expect(budgets.at(-1)).toBe(128);
  runner.receive({ type: "cancel", dealId: 0 });
  expect(tasks.size).toBe(0);
  expect(live.size).toBe(1);
  runner.receive(select(2));
  expect(creates).toBe(1);
  expect(selections).toHaveLength(1);
  expect(budgets.at(-1)).toBe(32);
  result = { $tag: "Finished", contents: [{ $tag: "Solved", contents: [] }, 200] };
  runner.receive(select(3));
  expect(tasks.size).toBe(0);
  expect(messages.at(-1)).toEqual(progress(3, result));
  runner.receive({ type: "reset" });
  expect(live.size).toBe(0);
  runner.receive(select(1, 1));
  expect(creates).toBe(2);
  runner.receive(select(2, 2));
  expect(live.size).toBe(1);
  expect(creates).toBe(3);
  runner.receive({ type: "reset" });
  expect(live.size).toBe(0);
});

test.each(["advance", "progress", "solver"])("worker %s exceptions release references and report the affected request", stage => {
  const messages: SearchMessage[] = [];
  let solverReleases = 0, stepReleases = 0;
  const fail = () => { throw new Error("boom"); };
  const runner = new AnalysisRunner({
    createSolver: () => ({ dispose() { solverReleases++; } }) as Solver,
    selectSolverBoard: () => { throw new Error("must not select"); },
    advanceSolver: () => {
      if (stage === "advance") return fail();
      return { dispose() { stepReleases++; } } as SolverStep;
    },
    stepProgress: () => stage === "progress" ? fail() : running,
    stepSolver: fail,
  }, message => messages.push(message), () => { throw new Error("must not schedule"); });
  runner.receive({ type: "select", dealId: 7, revision: 9, gameId: "golf", board });
  expect(messages).toEqual([{ type: "error", dealId: 7, revision: 9, message: "boom" }]);
  expect(solverReleases).toBe(1);
  expect(stepReleases).toBe(stage === "advance" ? 0 : 1);
});
