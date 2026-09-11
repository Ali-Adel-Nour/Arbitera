/**
 * =============================================================================
 * `LifecycleRail` — where this deal sits in the lifecycle
 * =============================================================================
 *
 * Six on-chain steps, plus the derived one when it applies.
 *
 * NO GRADIENT ON THIS COMPONENT, and the reason is worth stating because a
 * gradient here is the obvious move. The two-file gradient cap is spent on the
 * home hero and the nav rule, and the deeper objection is that a gradient across
 * a progress rail would encode progress AS THE GRADIENT — position along a colour
 * ramp becomes the only thing saying how far along a deal is. That is
 * information carried by colour alone, which Requirement 14.5 rules out. Reached
 * steps are marked by ink, weight, and a filled marker, and the current step is
 * additionally named in words underneath.
 *
 * THE DERIVED STEP IS MARKED AS DERIVED. `Deliberating` is inserted only when the
 * deal is actually in it, and it carries `rule/derived` plus an explicit note,
 * because it is the one step the chain does not hold (Requirement 9.4). A reader
 * counting steps on this rail against the contract's enum must be able to see
 * which one is the interface's inference.
 */

import { STATE_DISPLAY } from '@/lib/stateDisplay';
import type { DisplayState } from '@/types';

/** The on-chain path. `Deliberating` is spliced in at render when it applies. */
const CHAIN_STEPS: DisplayState[] = ['Created', 'Funded', 'Submitted'];

interface LifecycleRailProps {
  /** The deal's current display state. */
  current: DisplayState;

  /** How this deal ended, when it has. `null` while it is still open. */
  terminal: 'ResolvedSuccess' | 'ResolvedRefund' | 'ExpiredRefund' | null;
}

export function LifecycleRail({ current, terminal }: LifecycleRailProps) {
  // The derived step exists on the rail only when the deal is in it. Showing it
  // permanently would present an off-chain inference as a fixed part of the
  // protocol's lifecycle.
  const steps: DisplayState[] = [
    ...CHAIN_STEPS,
    ...(current === 'Deliberating' ? (['Deliberating'] as DisplayState[]) : []),
    ...(terminal === null ? [] : [terminal]),
  ];

  const currentIndex = steps.indexOf(current);

  return (
    <ol className="flex flex-col gap-0 md:flex-row md:items-start md:gap-0">
      {steps.map((step, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        const isCurrent = step === current;
        const { label, ink, derived } = STATE_DISPLAY[step];

        return (
          <li
            key={step}
            className={`${derived ? 'rule-derived' : ''} flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-2.5`}
          >
            <span
              // Reached steps carry the state ink; unreached are muted. The
              // marker is a second, non-colour channel for the same fact.
              className={`text-caption inline-flex items-center gap-2 uppercase ${reached ? ink : 'text-muted'}`}
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-chip ${reached ? 'bg-current' : 'border border-rule'}`}
              />
              {step}
            </span>

            {/* The current step is named in full, so the rail's position is never
                the only thing communicating state. */}
            {isCurrent ? <span className="text-meta text-hi">{label}</span> : null}

            {derived ? (
              <span className="text-meta text-muted">
                Derived by this interface. The contract has no such state.
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
