import type { SearchMessage, SearchRequest } from "./analysis";
import { AnalysisRunner } from "./analysis-runner";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<SearchRequest>) => void;
  postMessage(message: SearchMessage): void;
};
try {
  const api = await import("./generated/solitaire/solitaire.js");
  const runner = new AnalysisRunner(api, (message) => scope.postMessage(message));
  scope.onmessage = ({ data }) => runner.receive(data);
  scope.postMessage({ type: "ready" });
} catch {
  scope.postMessage({ type: "error", message: "The analysis engine could not load. You can keep playing." });
}
