import type { SearchMessage, SearchRequest } from "./analysis";
import type { Board } from "./game";
import type { SearchProgress, Solver, SolverStep } from "./generated/solitaire/solitaire.js";

export interface SolverApi {
  createSolver(game: string, board: Board): Solver;
  selectSolverBoard(board: Board, solver: Solver): Solver;
  advanceSolver(budget: number, solver: Solver): SolverStep;
  stepProgress(step: SolverStep): SearchProgress;
  stepSolver(step: SolverStep): Solver;
}

// Scheduling is injected so lifecycle tests can run the actual worker loop.
export class AnalysisRunner {
  private solver: Solver | null = null;
  private dealId: number | null = null;
  private active: Extract<SearchRequest, { type: "select" }> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private budget = 32;

  private api: SolverApi;
  private post: (message: SearchMessage) => void;
  private schedule: (callback: () => void) => ReturnType<typeof setTimeout>;
  private unschedule: typeof clearTimeout;
  private now: () => number;

  constructor(api: SolverApi, post: (message: SearchMessage) => void,
    schedule = (callback: () => void) => setTimeout(callback, 0),
    unschedule = clearTimeout.bind(globalThis), now = () => performance.now()) {
    this.api = api;
    this.post = post;
    this.schedule = schedule;
    this.unschedule = unschedule;
    this.now = now;
  }

  receive(request: SearchRequest): void {
    this.stop();
    if (request.type === "cancel") return;
    if (request.type === "reset") { this.release(); return; }
    try {
      if (this.dealId !== request.dealId) this.release();
      if (this.solver === null) {
        this.solver = this.api.createSolver(request.gameId, request.board);
        this.dealId = request.dealId;
      } else {
        const previous = this.solver;
        this.solver = this.api.selectSolverBoard(request.board, previous);
        previous.dispose();
      }
      this.active = request;
      this.budget = 32;
      this.tick();
    } catch (error) { this.error(request, error); }
  }

  private tick(): void {
    const request = this.active;
    if (!request || this.solver === null) return;
    try {
      const start = this.now();
      const step = this.api.advanceSolver(this.budget, this.solver);
      let progress: SearchProgress;
      try {
        progress = this.api.stepProgress(step);
        const previous = this.solver;
        this.solver = this.api.stepSolver(step);
        previous.dispose();
      } finally {
        step.dispose();
      }
      const elapsed = Math.max(0.1, this.now() - start);
      this.post({ type: "progress", dealId: request.dealId, revision: request.revision, progress });
      if (progress.$tag !== "Searching") { this.active = null; return; }
      this.budget = Math.max(1, Math.min(128, Math.round(this.budget * 10 / elapsed)));
      this.timer = this.schedule(() => this.tick());
    } catch (error) { this.error(request, error); }
  }

  private error(request: Extract<SearchRequest, { type: "select" }>, error: unknown): void {
    this.stop();
    this.release();
    this.post({ type: "error", dealId: request.dealId, revision: request.revision,
      message: error instanceof Error ? error.message : "Analysis failed." });
  }
  private stop(): void {
    this.unschedule(this.timer);
    this.timer = undefined;
    this.active = null;
  }
  private release(): void {
    this.solver?.dispose();
    this.solver = null;
    this.dealId = null;
  }
}
