/**
 * =============================================================================
 * `HashStripRow` — one hash, its recomputation, and whether they agree
 * =============================================================================
 *
 * The unit of the verify panel. Three cells across: what this hash commits to,
 * the value, and the comparison outcome.
 *
 * `agreement` IS ALLOWED TO BE `null`, and that is the interesting case. `null`
 * means "not compared" — no on-chain counterpart exists, or the recomputation
 * has not run yet. It renders as a stated absence rather than as either a tick or
 * a cross, because a hash with nothing to compare against is not passing and is
 * not failing, and showing it as either would be a lie in the only place on this
 * surface where a lie actually matters.
 *
 * MISMATCH GETS `rule/tampered` AND THE TAMPERED INK. That token is reserved for
 * one condition in the whole application: a value that does not match its own
 * recomputation. Nothing else in the interface is red — not refunds, not
 * expiries, not errors — so red here is unambiguous.
 */

import { MachineValue } from './MachineValue';

interface HashStripRowProps {
  /** What this hash commits to: "Acceptance criteria", "Deliverable", "Verdict". */
  label: string;

  /** The hash. Truncated for display, full on copy. */
  value: string | null;

  /**
   * `true` agrees, `false` differs, `null` NOT COMPARED. See the note above —
   * the third case is a distinct outcome, not a default.
   */
  agreement: boolean | null;

  /** Where the value came from: "On-chain", "Stored record", "Recomputed here". */
  source: string;

  /** The comparison outcome in words, e.g. "Matches recomputation". */
  outcome: string;
}

export function HashStripRow({
  label,
  value,
  agreement,
  source,
  outcome,
}: HashStripRowProps) {
  const mismatch = agreement === false;

  return (
    <div
      className={`${
        mismatch ? 'rule-tampered' : 'rule-record'
      } grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-3.5 md:grid-cols-[12rem_1fr_auto] md:items-baseline md:px-5`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-muted uppercase">{label}</span>
        <span className="text-meta text-muted">{source}</span>
      </div>

      {value === null ? (
        <span className="text-record text-muted">Not recorded</span>
      ) : (
        <MachineValue
          value={value}
          label={`${label} hash`}
          copyable
          className={mismatch ? 'text-state-tampered' : 'text-primary'}
        />
      )}

      {/* The outcome is words, never a glyph alone. A tick and a cross are one
          shape apart and carry no meaning to a reader who cannot resolve the
          ink; the sentence carries it for everyone. */}
      <span
        className={`text-meta ${
          mismatch ? 'text-state-tampered' : agreement === null ? 'text-muted' : 'text-state-paid'
        }`}
      >
        {outcome}
      </span>
    </div>
  );
}
