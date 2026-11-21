import { describe, expect, test } from "bun:test";
import { AnalysisClient } from "../src/analysis";
import type {
  SearchMessage,
  SearchRequest,
  SearchWorker,
} from "../src/analysis";
import type { Analysis, Board } from "../src/game";

class FakeWorker implements SearchWorker {
  onmessage: SearchWorker["onmessage"] = null;
  onerror: SearchWorker["onerror"] = null;
  requests: SearchRequest[] = [];
  terminated = false;
  postMessage(request: SearchRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  emit(data: SearchMessage) {
    this.onmessage?.({ data } as MessageEvent<SearchMessage>);
  }
}
const board: Board = new Map();

describe("analysis lifecycle", () => {
  test("waits for ready, reuses an idle worker, and rejects stale revisions", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, (value) => updates.push(value));
    expect(worker.requests.length).toBe(0);
    worker.emit({ type: "ready" });
    expect(worker.requests[0].revision).toBe(1);
    worker.emit({ type: "result", revision: 0, result: { $tag: "Exhausted" } });
    expect(updates.at(-1)?.status).toBe("analyzing");
    worker.emit({
      type: "result",
      revision: 1,
      result: { $tag: "LimitReached" },
    });
    expect(updates.at(-1)?.status).toBe("unknown");
    client.search("golf", board, 2, (value) => updates.push(value));
    expect(worker.requests.length).toBe(2);
    worker.emit({ type: "result", revision: 1, result: { $tag: "Exhausted" } });
    expect(updates.at(-1)?.status).toBe("analyzing");
    worker.emit({
      type: "result",
      revision: 2,
      result: { $tag: "Solved", contents: [] },
    });
    expect(updates.at(-1)?.status).toBe("solved");
    client.cancel();
  });
  test("terminates busy workers and ignores their late results after a new deal", () => {
    const workers: FakeWorker[] = [];
    const client = new AnalysisClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const oldUpdates: Analysis[] = [];
    const newUpdates: Analysis[] = [];
    client.search("klondike", board, 1, (value) => oldUpdates.push(value));
    workers[0].emit({ type: "ready" });
    client.search("spider", board, 2, (value) => newUpdates.push(value));
    expect(workers[0].terminated).toBe(true);
    workers[0].emit({
      type: "result",
      revision: 1,
      result: { $tag: "Exhausted" },
    });
    workers[1].emit({ type: "ready" });
    workers[1].emit({
      type: "result",
      revision: 2,
      result: { $tag: "LimitReached" },
    });
    expect(oldUpdates.map((value) => value.status)).toEqual(["analyzing"]);
    expect(newUpdates.map((value) => value.status)).toEqual([
      "analyzing",
      "unknown",
    ]);
    client.cancel();
  });
  test("a deadline is unknown, not impossible, and terminates the worker", async () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker, 5);
    const done = new Promise<Analysis>((resolve) => {
      client.search("golf", board, 1, (result) => {
        if (result.status !== "analyzing") resolve(result);
      });
    });
    worker.emit({ type: "ready" });
    expect((await done).status).toBe("unknown");
    expect(worker.terminated).toBe(true);
    client.cancel();
  });
  test("load and runtime errors are recoverable analysis errors", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, (value) => updates.push(value));
    worker.emit({ type: "error", message: "Wasm unavailable" });
    expect(updates.at(-1)).toEqual({
      status: "error",
      reason: "Wasm unavailable",
    });
    expect(worker.terminated).toBe(true);
    client.cancel();
  });
  test("cancelled searches do not publish future messages", () => {
    const worker = new FakeWorker();
    const client = new AnalysisClient(() => worker);
    const updates: Analysis[] = [];
    client.search("golf", board, 1, (value) => updates.push(value));
    client.cancel();
    worker.emit({ type: "error", message: "late failure" });
    worker.emit({ type: "ready" });
    expect(updates.map((value) => value.status)).toEqual(["analyzing"]);
  });
});
