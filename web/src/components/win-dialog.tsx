import { elapsedSeconds, formatTime } from "../game";
import type { Session } from "../game";
import { Icon } from "./icon";
import { Modal } from "./modal";
import "./win-dialog.css";

export function WinDialog({
  session,
  onNew,
  onDeal,
  onClose,
  onUndo,
}: {
  session: Session;
  onNew: () => void;
  onDeal: () => void;
  onClose: () => void;
  onUndo: () => void;
}) {
  return (
    <Modal titleId="win-title" className="win-modal" onClose={onClose}>
      <div class="win-symbol" aria-hidden="true">
        <Icon name="party-popper" size={64} />
      </div>
      <h2 id="win-title">You win!</h2>
      <div class="result-game">{session.name}</div>
      <div class="result-stats">
        <div>
          <span>TIME</span>
          <strong>{formatTime(elapsedSeconds(session))}</strong>
        </div>
        <div>
          <span>MOVES</span>
          <strong>{session.turns}</strong>
        </div>
      </div>
      <p class="result-seed">
        DEAL SEED <span>{session.seed.toString()}</span>
      </p>
      <button
        class="button button-primary start-button"
        type="button"
        onClick={onDeal}
      >
        Another deal <Icon name="arrow" />
      </button>
      <button
        class="button button-text cancel-button"
        type="button"
        onClick={onNew}
      >
        New Game
      </button>
      <button
        class="button button-text cancel-button"
        type="button"
        onClick={onUndo}
        disabled={!session.history.length}
      >
        <Icon name="undo" size={16} />
        Undo last move
      </button>
    </Modal>
  );
}
