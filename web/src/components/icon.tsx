import {
  ArrowDown,
  ArrowRight,
  Astroid,
  Check,
  ChevronDown,
  Clock,
  Club,
  CornerDownRight,
  Dot,
  ExclamationMark,
  LoaderCircle,
  PartyPopper,
  Plus,
  QuestionMark,
  RotateCw,
  Spade,
  Sparkles,
  Undo2,
  X,
} from "lucide-preact";
import type { LucideProps } from "lucide-preact";

const icons = {
  plus: Plus,
  hint: Astroid,
  sparkles: Sparkles,
  clock: Clock,
  arrow: ArrowRight,
  close: X,
  check: Check,
  x: X,
  "question-mark": QuestionMark,
  "exclamation-mark": ExclamationMark,
  undo: Undo2,
  loading: LoaderCircle,
  dot: Dot,
  recycle: RotateCw,
  spade: Spade,
  club: Club,
  move: CornerDownRight,
  down: ArrowDown,
  "chevron-down": ChevronDown,
  "party-popper": PartyPopper
};

export function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof icons;
  size?: LucideProps["size"];
}) {
  const LucideIcon = icons[name];
  return <LucideIcon size={size} strokeWidth={1.6} aria-hidden="true" />;
}
