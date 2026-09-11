/**
 * =============================================================================
 * `ErrorState` — cause, then recovery, then the retry
 * =============================================================================
 *
 * Requirement 16.3: every failure states what went wrong AND what to do about it.
 * The two are separate props rather than one message because they are separate
 * sentences with separate authors — `lib/errorCopy.ts` derives both from the
 * closed `ApiError` union, and that function is total, so an error kind without
 * recovery copy does not compile.
 *
 * NOT RED. Red in this application means exactly one thing: a hash that does not
 * match its recomputation. A network timeout is not tampering, and colouring it
 * the same way would spend the one alarm colour on a condition that resolves
 * itself on the next poll. An error panel gets a boundary rule and muted ink —
 * legible, unmistakable, not alarming.
 *
 * `onRetry` IS OPTIONAL because some failures are not retryable. A malformed
 * response will be malformed again; offering a button that cannot help is worse
 * than offering none, and the recovery sentence is the honest response there.
 */

import { Button } from './Button';

interface ErrorStateProps {
  /** What went wrong, in the reader's terms rather than the stack's. */
  cause: string;

  /** What to do about it. Names the setting or the action, not "try again later". */
  recovery: string;

  /** Present only when retrying could actually change the outcome. */
  onRetry?: () => void;

  /** The retry control's label, e.g. "Request the record again". */
  retryLabel?: string;
}

export function ErrorState({ cause, recovery, onRetry, retryLabel }: ErrorStateProps) {
  return (
    <div
      // `role="alert"` rather than `aria-live`: this replaces content the reader
      // was waiting on, so it should be announced when it appears.
      role="alert"
      className="rule-boundary bg-panel-1 flex flex-col items-start gap-3 rounded-[--radius-panel] border border-panel-edge px-5 py-5"
    >
      <p className="text-body text-hi max-w-[60ch]">{cause}</p>
      <p className="text-body text-muted max-w-[60ch]">{recovery}</p>

      {onRetry !== undefined && retryLabel !== undefined ? (
        <Button onClick={onRetry}>{retryLabel}</Button>
      ) : null}
    </div>
  );
}
