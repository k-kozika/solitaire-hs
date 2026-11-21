import { classifyResult } from "./game";
import type { Analysis, Board, SearchResult } from "./game";

export const SEARCH_BUDGET = 3500;
export const SEARCH_TIMEOUT_MS = 5000;
export type SearchRequest = {
  revision: number;
  gameId: string;
  board: Board;
  budget: number;
};
export type SearchMessage =
  | { type: "ready" }
  | { type: "result"; revision: number; result: SearchResult }
  | { type: "error"; revision?: number; message: string };

export interface SearchWorker {
  onmessage: ((event: MessageEvent<SearchMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SearchRequest): void;
  terminate(): void;
}

// A busy synchronous Wasm search can only be cancelled by terminating its worker.
export class AnalysisClient {
  private worker: SearchWorker | null = null;
  private ready = false;
  private pending: {
    request: SearchRequest;
    receive: (analysis: Analysis) => void;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private factory: () => SearchWorker;
  private timeoutMs: number;

  constructor(factory: () => SearchWorker, timeoutMs = SEARCH_TIMEOUT_MS) {
    this.factory = factory;
    this.timeoutMs = timeoutMs;
  }

  search(
    gameId: string,
    board: Board,
    revision: number,
    receive: (analysis: Analysis) => void,
  ): void {
    if (this.pending) this.cancel();
    this.pending = {
      request: { gameId, board, revision, budget: SEARCH_BUDGET },
      receive,
    };
    receive({ status: "analyzing" });
    if (this.worker && this.ready) {
      this.dispatch();
      return;
    }
    try {
      const worker = this.factory();
      this.worker = worker;
      worker.onmessage = (event) => {
        if (this.worker !== worker) return;
        const message = event.data;
        if (message.type === "ready") {
          clearTimeout(this.timer);
          this.ready = true;
          this.dispatch();
        } else if (
          this.pending &&
          ((message.type === "error" && message.revision === undefined) ||
            message.revision === this.pending.request.revision)
        ) {
          if (message.type === "error") this.fail(message.message);
          else if (message.type === "result")
            this.finish(classifyResult(message.result));
        }
      };
      worker.onerror = () => {
        if (this.worker === worker)
          this.fail("The analysis worker could not run. You can keep playing.");
      };
      // Loading has its own deadline; search time is counted after Wasm is ready.
      this.timer = setTimeout(
        () =>
          this.fail(
            "The analysis worker could not load. You can keep playing.",
          ),
        15000,
      );
    } catch (error) {
      this.fail(
        error instanceof Error ? error.message : "Analysis could not start.",
      );
    }
  }

  private dispatch(): void {
    if (!this.pending || !this.worker) return;
    this.timer = setTimeout(() => {
      const receive = this.pending?.receive;
      this.cancel();
      receive?.({ status: "unknown", reason: "Search time limit reached." });
    }, this.timeoutMs);
    try {
      this.worker.postMessage(this.pending.request);
    } catch {
      this.fail(
        "The board could not be sent for analysis. You can keep playing.",
      );
    }
  }

  private finish(analysis: Analysis): void {
    clearTimeout(this.timer);
    const receive = this.pending?.receive;
    this.pending = null;
    receive?.(analysis);
  }

  private fail(reason: string): void {
    const receive = this.pending?.receive;
    this.cancel();
    receive?.({ status: "error", reason });
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}
