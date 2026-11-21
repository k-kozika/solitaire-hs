import {
  DragDropManager,
  Draggable,
  Droppable,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import { canSelect, moveTo, pileKey } from "./game";
import type { Pile, Selection, Session } from "./game";

export function mountCardDnd(
  root: HTMLElement,
  overlay: HTMLElement,
  session: Session,
  callbacks: {
    onStart: (pile: Pile, count: number) => void;
    onEnd: () => void;
    onDrop: (pile: Pile) => void;
    onPreview: (preview: Selection | null) => void;
  },
) {
  const manager = new DragDropManager({
    sensors: [
      PointerSensor.configure({
        activationConstraints: [
          new PointerActivationConstraints.Distance({ value: 6 }),
        ],
      }),
      KeyboardSensor,
    ],
    // Preact renders the stack; dnd-kit positions its overlay.
    plugins: (defaults) => [
      ...defaults.filter((plugin) => plugin !== Feedback),
      Feedback.configure({ dropAnimation: null }),
    ],
  });
  const feedback = manager.registry.plugins.get(Feedback);
  if (feedback) feedback.overlay = overlay;
  const sources = new Map<string | number, Selection>();
  const targets = new Map<string | number, Pile>();
  let active = false;

  for (const pile of session.board.keys()) {
    const key = pileKey(pile);
    const element = root.querySelector<HTMLElement>(`[data-pile="${key}"]`);
    if (!element) continue;
    targets.set(key, pile);
    new Droppable(
      {
        id: key,
        element,
        accept: (source) => {
          const selection = sources.get(source.id);
          return !!selection && !!moveTo(session.actions, selection, pile);
        },
      },
      manager,
    );
    for (const card of element.querySelectorAll<HTMLElement>(
      "[data-drag-count]",
    )) {
      const count = Number(card.dataset.dragCount);
      if (!canSelect(session.actions, pile, count)) continue;
      const id = `${key}:${count}`;
      sources.set(id, { pile, count });
      new Draggable({ id, element: card }, manager);
    }
  }

  manager.monitor.addEventListener("dragstart", ({ operation }) => {
    const source = operation.source;
    const selection = source && sources.get(source.id);
    if (!selection) return;
    active = true;
    callbacks.onStart(selection.pile, selection.count);
    callbacks.onPreview(selection);
  });
  manager.monitor.addEventListener("dragend", ({ operation, canceled }) => {
    const pile = operation.target && targets.get(operation.target.id);
    active = false;
    callbacks.onPreview(null);
    if (!canceled && pile) callbacks.onDrop(pile);
    else callbacks.onEnd();
  });

  return () => {
    manager.destroy();
    if (active) callbacks.onEnd();
  };
}
