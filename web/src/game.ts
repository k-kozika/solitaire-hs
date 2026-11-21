import type {
  Action,
  Card,
  Entry,
  Group,
  Pile,
  SearchResult,
} from "./generated/solitaire/solitaire.js";

export type { Action, Card, Entry, Group, Pile, SearchResult };
export type Board = Map<Pile, Entry[]>;
export type Selection = { pile: Pile; count: number };

export interface Engine {
  games(): [string, string][];
  newGame(gameId: string, seed: bigint): Board;
  applyAction(gameId: string, board: Board, action: Action): Board;
  legalActions(gameId: string, board: Board): Action[];
  won(gameId: string, board: Board): boolean;
}

export interface Session {
  gameId: string;
  name: string;
  seed: bigint;
  board: Board;
  history: Board[];
  actions: Action[];
  turns: number;
  startedAt: number;
  finishedAt: number | null;
  revision: number;
}

export const MAX_SEED = (1n << 64n) - 1n;

export function parseSeed(input: string): bigint | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text))
    throw new Error("Enter a whole number from 0 to 18446744073709551615.");
  const seed = BigInt(text);
  if (seed > MAX_SEED)
    throw new Error("Seed must be at most 18446744073709551615.");
  return seed;
}

export function randomSeed(exclude?: bigint): bigint {
  const words = crypto.getRandomValues(new Uint32Array(2));
  const seed = (BigInt(words[0]) << 32n) | BigInt(words[1]);
  return seed === exclude ? (seed + 1n) & MAX_SEED : seed;
}

export const pileKey = (pile: Pile) =>
  `${pile.contents[0]}:${pile.contents[1]}`;
export const samePile = (a: Pile, b: Pile) => pileKey(a) === pileKey(b);

export function entriesFor(board: Board, pile: Pile): Entry[] {
  for (const [key, entries] of board) if (samePile(key, pile)) return entries;
  return [];
}

export function pilesFor(board: Board, group: Group): Pile[] {
  return [...board.keys()]
    .filter((p) => p.contents[0] === group)
    .sort((a, b) => a.contents[1] - b.contents[1]);
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.$tag === "Draw" || b.$tag === "Draw") return a.$tag === b.$tag;
  return (
    a.contents[0] === b.contents[0] &&
    samePile(a.contents[1], b.contents[1]) &&
    samePile(a.contents[2], b.contents[2])
  );
}

export function movesFor(actions: Action[], selection: Selection): Action[] {
  return actions.filter(
    (action) =>
      action.$tag === "Move" &&
      action.contents[0] === selection.count &&
      samePile(action.contents[1], selection.pile),
  );
}

export function canSelect(
  actions: Action[],
  pile: Pile,
  count: number,
): boolean {
  return movesFor(actions, { pile, count }).length > 0;
}

export function moveTo(
  actions: Action[],
  selection: Selection,
  target: Pile,
): Action | undefined {
  return movesFor(actions, selection).find(
    (action) => action.$tag === "Move" && samePile(action.contents[2], target),
  );
}

export function createSession(
  engine: Engine,
  gameId: string,
  name: string,
  seed: bigint,
  revision: number,
  now = Date.now(),
): Session {
  const board = engine.newGame(gameId, seed);
  const finished = engine.won(gameId, board);
  return {
    gameId,
    name,
    seed,
    board,
    history: [],
    actions: finished ? [] : engine.legalActions(gameId, board),
    turns: 0,
    startedAt: now,
    finishedAt: finished ? now : null,
    revision,
  };
}

export function advanceSession(
  engine: Engine,
  session: Session,
  action: Action,
  now = Date.now(),
): Session {
  if (
    session.finishedAt !== null ||
    !session.actions.some((legal) => sameAction(legal, action))
  ) {
    throw new Error("That move is not available.");
  }
  const board = engine.applyAction(session.gameId, session.board, action);
  const finished = engine.won(session.gameId, board);
  return {
    ...session,
    board,
    history: [...session.history, session.board],
    actions: finished ? [] : engine.legalActions(session.gameId, board),
    turns: session.turns + 1,
    finishedAt: finished ? now : null,
    revision: session.revision + 1,
  };
}

export function undoSession(engine: Engine, session: Session): Session {
  const board = session.history.at(-1);
  if (!board) return session;
  // Snapshot the whole board, including automatic reveals, collections and stock order.
  // Only unfinished positions enter history; undoing a win resumes the same deal.
  return {
    ...session,
    board,
    history: session.history.slice(0, -1),
    actions: engine.legalActions(session.gameId, board),
    turns: session.turns - 1,
    finishedAt: null,
    revision: session.revision + 1,
  };
}

export function elapsedSeconds(session: Session, now = Date.now()): number {
  return Math.max(
    0,
    Math.floor(((session.finishedAt ?? now) - session.startedAt) / 1000),
  );
}

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export const suitSymbols = {
  Clubs: "♣",
  Diamonds: "♦",
  Hearts: "♥",
  Spades: "♠",
};
export const rankLabels = {
  Ace: "A",
  Two: "2",
  Three: "3",
  Four: "4",
  Five: "5",
  Six: "6",
  Seven: "7",
  Eight: "8",
  Nine: "9",
  Ten: "10",
  Jack: "J",
  Queen: "Q",
  King: "K",
};
export const cardName = (card: Card) => `${card.rank} of ${card.suit}`;
export const pileName = (pile: Pile) =>
  `${{ Stock: "Stock", Waste: "Waste", Tableau: "Column", Foundation: "Foundation", Cell: "Free cell" }[pile.contents[0]]} ${pile.contents[1]}`;

export function describeAction(board: Board, action: Action): string {
  if (action.$tag === "Draw") return "Use the stock to draw or deal cards.";
  const [count, source, target] = action.contents;
  const entry = entriesFor(board, source)[count - 1];
  const name =
    entry?.contents[0] === "Up"
      ? cardName(entry.contents[1])
      : `${count} card${count === 1 ? "" : "s"}`;
  return `Move ${name}${count > 1 ? ` and the ${count - 1} card${count === 2 ? "" : "s"} on it` : ""} from ${pileName(source)} to ${pileName(target)}.`;
}

export type Analysis =
  | { status: "idle" | "analyzing" | "impossible" | "unknown"; reason?: string }
  | { status: "solved"; path: Action[] }
  | { status: "error"; reason: string };

export function classifyResult(result: SearchResult): Analysis {
  switch (result.$tag) {
    case "Solved":
      return { status: "solved", path: result.contents };
    case "Exhausted":
      return { status: "impossible" };
    case "LimitReached":
      return { status: "unknown", reason: "Search budget reached." };
  }
}
