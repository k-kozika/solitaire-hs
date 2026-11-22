import { useEffect, useRef, useState } from "preact/hooks";
import { AnalysisClient } from "./analysis";
import { Icon } from "./components/icon";
import { NewGameDialog } from "./components/new-game-dialog";
import { Table } from "./components/table";
import { WinDialog } from "./components/win-dialog";
import { loadEngine } from "./engine";
import {
  advanceSession,
  canSelect,
  createSession,
  describeAction,
  elapsedSeconds,
  formatTime,
  moveTo,
  pileKey,
  pilesFor,
  randomSeed,
  samePile,
  undoSession,
} from "./game";
import type {
  Action,
  Analysis,
  Engine,
  Pile,
  Selection,
  Session,
} from "./game";
import "./app.css";

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [catalog, setCatalog] = useState<[string, string][]>([]);
  const [loadError, setLoadError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [dialog, setDialog] = useState<"new" | "win" | null>("new");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [hint, setHint] = useState<Action | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>({ status: "idle" });
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ selection: Selection; revision: number } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const tableTitleRef = useRef<HTMLHeadingElement>(null);
  const client = useRef<AnalysisClient | null>(null);
  if (!client.current)
    client.current = new AnalysisClient(
      () =>
        new Worker(new URL("./analysis.worker.ts", import.meta.url), {
          type: "module",
        }),
    );

  useEffect(() => {
    let disposed = false;
    loadEngine()
      .then((value) => {
        if (!disposed) {
          setCatalog(value.games());
          setEngine(value);
        }
      })
      .catch((error) => {
        if (!disposed)
          setLoadError(
            error instanceof Error
              ? error.message
              : "The game engine could not load.",
          );
      });
    return () => {
      disposed = true;
      client.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    document.title = `${session.name} — Solitaire`;
    if (session.finishedAt !== null) {
      setAnalysis({ status: "solved", path: [] });
      return;
    }
    const revision = session.revision;
    client.current!.search(
      session.gameId,
      session.board,
      revision,
      (result) => {
        if (sessionRef.current?.revision === revision) setAnalysis(result);
      },
    );
    return () => client.current?.cancel();
  }, [session]);

  useEffect(() => {
    if (!session || session.finishedAt !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session?.startedAt, session?.finishedAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelection(null);
        setHint(null);
      }
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "z"
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        )
      )
        return;
      if (
        dialog === "new" ||
        !sessionRef.current?.history.length ||
        dragRef.current
      )
        return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, dialog]);

  function commit(next: Session) {
    client.current?.cancel();
    sessionRef.current = next;
    setSession(next);
    setNow(Date.now());
    setSelection(null);
    setHint(null);
    setError("");
    dragRef.current = null;
    setDragging(false);
    setAnalysis(
      next.finishedAt !== null
        ? { status: "solved", path: [] }
        : { status: "analyzing" },
    );
    setDialog(next.finishedAt !== null ? "win" : null);
  }

  function start(gameId: string, seed: bigint) {
    if (!engine) return;
    const name = catalog.find(([id]) => id === gameId)?.[1] ?? gameId;
    client.current?.newDeal();
    commit(
      createSession(
        engine,
        gameId,
        name,
        seed,
        (sessionRef.current?.revision ?? 0) + 1,
      ),
    );
    requestAnimationFrame(() => tableTitleRef.current?.focus());
  }

  function play(action: Action) {
    const current = sessionRef.current;
    if (!engine || !current || dialog) return;
    try {
      commit(advanceSession(engine, current, action));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "The move could not be made.",
      );
    }
  }

  function undo() {
    const current = sessionRef.current;
    if (
      !engine ||
      !current?.history.length ||
      dialog === "new" ||
      dragRef.current
    )
      return;
    try {
      commit(undoSession(engine, current));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The move could not be undone.",
      );
    }
  }

  function choose(pile: Pile, count: number) {
    if (suppressClick.current || !session || dialog) return;
    if (selection) {
      const action = moveTo(session.actions, selection, pile);
      if (action) {
        play(action);
        return;
      }
      if (samePile(selection.pile, pile) && selection.count === count) {
        setSelection(null);
        setHint(null);
        return;
      }
    }
    if (canSelect(session.actions, pile, count)) {
      setSelection({ pile, count });
      setHint(null);
    }
  }

  function activateDrag(pile: Pile, count: number) {
    if (!session || dialog) return;
    const next = { pile, count };
    dragRef.current = { selection: next, revision: session.revision };
    setSelection(next);
    setHint(null);
    setDragging(true);
    suppressClick.current = true;
  }

  function endDrag() {
    dragRef.current = null;
    setDragging(false);
    // Some browsers synthesize a click at the end of a drag.
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  }

  function dropOn(pile: Pile) {
    const drag = dragRef.current;
    if (!drag || !session || drag.revision !== session.revision) return;
    const action = moveTo(session.actions, drag.selection, pile);
    if (action) play(action);
    endDrag();
  }

  function showHint() {
    if (analysis.status !== "solved" || !analysis.path.length || !session)
      return;
    setSelection(null);
    setHint(analysis.path[0]);
    const target =
      analysis.path[0].$tag === "Move"
        ? analysis.path[0].contents[1]
        : pilesFor(session.board, "Stock")[0];
    if (target)
      document
        .querySelector<HTMLElement>(`[data-pile="${pileKey(target)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  const analysisLabels = {
    idle: "Choose a deal to begin",
    analyzing: "Analyzing…",
    solved: "Winning path found",
    impossible: "No winning path",
    unknown: "Unable to determine",
    error: "Analysis unavailable",
  };
  const analysisIcons = {
    idle: "dot",
    analyzing: "loading",
    solved: "check",
    impossible: "x",
    unknown: "question-mark",
    error: "exclamation-mark",
  } as const;
  const selectionText = selection
    ? `${selection.count} card${selection.count === 1 ? "" : "s"} selected.`
    : "";
  const hintText = hint && session ? describeAction(session.board, hint) : "";
  const hintAvailable =
    analysis.status === "solved" &&
    analysis.path.length > 0 &&
    !!session &&
    session.finishedAt === null;

  return (
    <main class="app-shell">
      <section class="game-table" aria-label="Solitaire game">
        <div class="table-toolbar">
          <div class="game-heading">
            <h1 tabIndex={-1} ref={tableTitleRef}>
              {session?.name ?? "Solitaire"}
            </h1>
            <div class="analysis-status" role="status" aria-live="polite">
              <span
                class={`status-symbol status-${analysis.status}`}
                aria-hidden="true"
              >
                <Icon name={analysisIcons[analysis.status]} size={15} />
              </span>
              <strong>{analysis.status === "unknown" && analysis.reason
                ? analysis.reason
                : analysisLabels[analysis.status]}</strong>
            </div>
          </div>
          <div class="toolbar-right">
            {session && (
              <div class="game-stats">
                <div class="stat">
                  <Icon name="clock" size={15} />
                  <span class="sr-only">Elapsed time </span>
                  <span>{formatTime(elapsedSeconds(session, now))}</span>
                </div>
                <span class="stat-divider" />
                <div class="stat">
                  <span>{session.turns}</span>
                  <span class="stat-label">moves</span>
                </div>
              </div>
            )}
            {session && (
              <p class="deal-seed">
                DEAL <span>#{session.seed.toString()}</span>
              </p>
            )}
          </div>
        </div>
        {session ? (
          <Table
            session={session}
            selection={selection}
            hint={hint}
            disabled={dialog !== null}
            onCard={choose}
            onDraw={() => {
              const draw = session.actions.find(
                (action) => action.$tag === "Draw",
              );
              if (draw) play(draw);
            }}
            onDrag={activateDrag}
            onDragEnd={endDrag}
            onDrop={dropOn}
          />
        ) : (
          <div class="waiting-table">
            {!engine && !loadError && (
              <span class="loading-line" role="status">
                Loading the game engine
              </span>
            )}
            {loadError && (
              <div class="load-error" role="alert">
                <p>The game engine could not load. Reload to try again.</p>
                <details>
                  <summary>Details</summary>
                  {loadError}
                </details>
                <button
                  class="button button-table"
                  type="button"
                  onClick={() => location.reload()}
                >
                  Reload
                </button>
              </div>
            )}
          </div>
        )}
        <div class="move-message" role="status" aria-live="polite">
          {hintText ? (
            <>
              <Icon name="hint" size={16} />
              {hintText}
            </>
          ) : (
            selectionText ||
            (session &&
            session.finishedAt === null &&
            session.actions.length === 0
              ? "No legal moves remain."
              : "")
          )}
        </div>
        <p class="play-error" role="alert">
          {error}
        </p>
        <footer class="table-footer">
          <div class="table-actions">
            <button
              type="button"
              class="button button-table"
              onClick={undo}
              disabled={!session?.history.length || dragging}
              title="Undo (Ctrl/Cmd+Z)"
              aria-keyshortcuts="Control+z Meta+z"
            >
              <Icon name="undo" size={16} />
              Undo
            </button>
            <button
              type="button"
              class="button button-table"
              onClick={showHint}
              disabled={!hintAvailable}
            >
              <Icon name="hint" size={16} />
              Hint
            </button>
            <button
              type="button"
              class="button button-table button-new"
              disabled={!engine}
              onClick={() => {
                setSelection(null);
                setHint(null);
                setDialog("new");
              }}
            >
              <Icon name="plus" size={16} />
              New Game
            </button>
          </div>
        </footer>
      </section>
      {engine && dialog === "new" && (
        <NewGameDialog
          catalog={catalog}
          current={session}
          onStart={start}
          onClose={
            session
              ? () => setDialog(session.finishedAt !== null ? "win" : null)
              : undefined
          }
        />
      )}
      {session && dialog === "win" && (
        <WinDialog
          session={session}
          onNew={() => setDialog("new")}
          onDeal={() => {
            try {
              start(session.gameId, randomSeed(session.seed));
            } catch (error) {
              setDialog(null);
              setError(
                error instanceof Error
                  ? error.message
                  : "The deal could not start.",
              );
            }
          }}
          onClose={() => setDialog(null)}
          onUndo={undo}
        />
      )}
    </main>
  );
}
