import { classifyResult } from "./game";
import type { Analysis, Board } from "./game";
import type { SearchProgress } from "./generated/solitaire/solitaire.js";

export const SEARCH_TIMEOUT_MS = 5000;
export type SearchRequest =
  | { type: "select"; dealId: number; revision: number; gameId: string; board: Board }
  | { type: "cancel"; dealId: number }
  | { type: "reset" };
export type SearchMessage =
  | { type: "ready" }
  | { type: "progress"; dealId: number; revision: number; progress: SearchProgress }
  | { type: "error"; dealId?: number; revision?: number; message: string };

export interface SearchWorker {
  onmessage: ((event: MessageEvent<SearchMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SearchRequest): void;
  terminate(): void;
}

export class AnalysisClient {
  private worker: SearchWorker | null = null;
  private ready = false;
  private dealId = 0;
  private gameId?: string;
  private pending: {
    request: Extract<SearchRequest, { type: "select" }>;
    receive: (analysis: Analysis) => void;
  } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private factory: () => SearchWorker;
  private timeoutMs: number;

  constructor(factory: () => SearchWorker, timeoutMs = SEARCH_TIMEOUT_MS) {
    this.factory = factory;
    this.timeoutMs = timeoutMs;
  }

  // A new deal discards the old handle even when game and seed are unchanged.
  newDeal(): void {
    this.cancel();
    this.dealId++;
    this.gameId = undefined;
    if (this.ready) {
      try { this.worker?.postMessage({ type: "reset" }); }
      catch { this.dispose(); }
    }
  }

  search(gameId: string, board: Board, revision: number, receive: (analysis: Analysis) => void): void {
    if (this.gameId !== undefined && this.gameId !== gameId) this.newDeal();
    this.cancel();
    this.gameId = gameId;
    this.pending = { request: { type: "select", dealId: this.dealId, gameId, board, revision }, receive };
    receive({ status: "analyzing" });
    if (this.worker) {
      if (this.ready) this.dispatch();
      return;
    }
    try {
      const worker = this.factory();
      this.worker = worker;
      worker.onmessage = ({ data: message }) => {
        if (this.worker !== worker) return;
        if (message.type === "ready") {
          clearTimeout(this.timer);
          this.ready = true;
          this.dispatch();
        } else if (message.type === "error" && message.revision === undefined) {
          this.fail(message.message);
        } else if (this.pending && message.dealId === this.pending.request.dealId &&
                   message.revision === this.pending.request.revision) {
          if (message.type === "error") this.fail(message.message);
          else if (message.type === "progress") {
            const progress = message.progress;
            if (progress.$tag === "Searching") this.watchdog();
            else {
              clearTimeout(this.timer);
              const receive = this.pending.receive;
              this.pending = null;
              receive(progress.$tag === "Finished"
                ? classifyResult(progress.contents[0])
                : { status: "unknown", reason: "Retention limit reached; the result is undetermined." });
            }
          }
        }
      };
      worker.onerror = () => {
        if (this.worker === worker) this.fail("The analysis worker could not run. You can keep playing.");
      };
      this.timer = setTimeout(() => this.fail("The analysis worker could not load. You can keep playing."), 15000);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Analysis could not start.");
    }
  }

  private watchdog(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail("The analysis worker stopped responding. You can keep playing."), this.timeoutMs);
  }

  private dispatch(): void {
    if (!this.pending || !this.worker) return;
    this.watchdog();
    try { this.worker.postMessage(this.pending.request); }
    catch { this.fail("The board could not be sent for analysis. You can keep playing."); }
  }

  private fail(reason: string): void {
    const receive = this.pending?.receive;
    this.dispose();
    receive?.({ status: "error", reason });
  }

  cancel(): void {
    if (this.ready) clearTimeout(this.timer);
    this.pending = null;
    if (this.ready) {
      try { this.worker?.postMessage({ type: "cancel", dealId: this.dealId }); }
      catch { this.dispose(); }
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
}
