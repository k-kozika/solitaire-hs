import type { TargetedSubmitEvent } from "preact";
import { useRef, useState } from "preact/hooks";
import { parseSeed, randomSeed } from "../game";
import type { Session } from "../game";
import { Icon } from "./icon";
import { Modal } from "./modal";
import "./new-game-dialog.css";

export function NewGameDialog({
  catalog,
  current,
  demoMode,
  onStart,
  onClose,
}: {
  catalog: [string, string][];
  current: Session | null;
  demoMode: boolean;
  onStart: (id: string, seed: bigint, demoMode: boolean) => void;
  onClose?: () => void;
}) {
  const [gameId, setGameId] = useState(current?.gameId ?? catalog[0][0]);
  const [seedText, setSeedText] = useState("");
  const [demo, setDemo] = useState(demoMode);
  const [error, setError] = useState("");
  const seedRef = useRef<HTMLInputElement>(null);
  const submit = (event: TargetedSubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    let seed: bigint | null;
    try {
      seed = parseSeed(seedText);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Check your seed.");
      seedRef.current?.focus();
      return;
    }
    try {
      onStart(gameId, seed ?? randomSeed(current?.seed), demo);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "The deal could not start.",
      );
    }
  };
  return (
    <Modal
      titleId="new-game-title"
      className="new-game-modal"
      onClose={onClose}
    >
      <h2 id="new-game-title">New Game</h2>
      <form onSubmit={submit}>
        <label for="game">Game</label>
        <div class="select-wrap">
          <select
            id="game"
            name="game"
            value={gameId}
            onChange={(event) => setGameId(event.currentTarget.value)}
          >
            {catalog.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={14} />
        </div>
        <div class="seed-label">
          <label for="seed">
            Deal seed <span class="optional">optional</span>
          </label>
        </div>
        <input
          ref={seedRef}
          id="seed"
          name="seed"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Random"
          value={seedText}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "seed-error" : undefined}
          onInput={(event) => {
            setSeedText(event.currentTarget.value);
            setError("");
          }}
        />
        <p class="form-error" id="seed-error" role="alert">
          {error}
        </p>
        <label class="demo-mode" for="demo-mode">
          <input
            id="demo-mode"
            name="demo-mode"
            type="checkbox"
            checked={demo}
            onChange={(event) => setDemo(event.currentTarget.checked)}
          />
          Demo mode
        </label>
        <button class="button button-primary start-button" type="submit">
          Start <Icon name="arrow" />
        </button>
        {current && (
          <button
            class="button button-text cancel-button"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
        )}
      </form>
    </Modal>
  );
}
