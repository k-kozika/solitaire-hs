import type { SearchMessage, SearchRequest } from "./analysis";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<SearchRequest>) => void;
  postMessage(message: SearchMessage): void;
};

try {
  const { solve } = await import("./generated/solitaire/solitaire.js");
  scope.onmessage = ({ data }) => {
    try {
      const result = solve(data.budget, data.gameId, data.board);
      scope.postMessage(
        "Left" in result
          ? { type: "error", revision: data.revision, message: result.Left }
          : { type: "result", revision: data.revision, result: result.Right },
      );
    } catch (error) {
      scope.postMessage({
        type: "error",
        revision: data.revision,
        message: error instanceof Error ? error.message : "Analysis failed.",
      });
    }
  };
  scope.postMessage({ type: "ready" });
} catch {
  scope.postMessage({
    type: "error",
    message: "The analysis engine could not load. You can keep playing.",
  });
}
