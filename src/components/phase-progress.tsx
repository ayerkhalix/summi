import { PHASES, PHASE_LABELS } from "@/game/config";
import type { Phase } from "@/game/types";

export function PhaseProgress({ phase }: { phase: Phase }) {
  const current = PHASES.indexOf(phase);
  return (
    <nav className="phase-progress" aria-label="Round progress">
      <span className="phase-count">{String(current + 1).padStart(2, "0")} <span>/ 09</span></span>
      <ol>
        {PHASES.map((step, index) => (
          <li key={step} className={index < current ? "complete" : index === current ? "current" : ""} aria-current={step === phase ? "step" : undefined} title={PHASE_LABELS[step]}>
            <span className="sr-only">{PHASE_LABELS[step]}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
