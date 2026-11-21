import type { Engine } from "./game";
import type { Either } from "./generated/solitaire/solitaire.js";

function unwrap<T>(result: Either<string, T>): T {
  if ("Left" in result) throw new Error(result.Left);
  return result.Right;
}

export async function loadEngine(): Promise<Engine> {
  const api = await import("./generated/solitaire/solitaire.js");
  return {
    games: () => api.games(),
    newGame: (id, seed) => unwrap(api.newGame(id, seed)),
    applyAction: (id, board, action) =>
      unwrap(api.applyAction(id, board, action)),
    legalActions: (id, board) => unwrap(api.legalActions(id, board)),
    won: (id, board) => unwrap(api.won(id, board)),
  };
}
