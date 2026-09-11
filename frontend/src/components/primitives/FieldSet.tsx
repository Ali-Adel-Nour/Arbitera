/**
 * =============================================================================
 * `FieldSet` — a labelled form control, and the second mono owner
 * =============================================================================
 *
 * THE MONO ALLOWANCE IS EARNED HERE, NOT BENT. `check-design.mjs` permits
 * `font-mono` in two files: `MachineValue.tsx` and this one. The rule's meaning is
 * "monospace marks a value you compare byte for byte", and a 42-character address
 * or a bytes32 deal identifier TYPED INTO A FIELD is exactly that kind of value —
 * a reader checking what they pasted needs the same character-by-character
 * legibility they get when reading it back. `MachineValue` renders a `<span>` and
 * cannot render an `<input>`, so the second owner exists because the first
 * structurally cannot cover the case.
 *
 * It is gated behind `machine`, which defaults to FALSE. An acceptance criterion
 * or a deliverable is prose, and setting prose in monospace would spend the signal
 * on the majority of this form's fields — which is the outcome the confinement
 * exists to prevent.
 *
 * THE LABEL IS AN ELEMENT, NEVER A PLACEHOLDER. A placeholder disappears the
 * moment a reader types, so a field labelled only by its placeholder is a field
 * with no label for anyone mid-edit — and none at all for a screen reader that
 * ignores it. `htmlFor`/`id` is the association, not `aria-label`, so clicking the
 * label focuses the control.
 *
 * AN ERROR IS ANNOUNCED AND POINTED AT. `aria-invalid` marks the control,
 * `aria-describedby` ties it to the message, and the message renders below with
 * the tampered ink — the only place in this application that colour is red, and it
 * is paired with words in every case.
 */

import type { ReactNode } from 'react';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

interface FieldSetProps {
  /** Stable id. Ties the label, the control, the hint, and the error together. */
  id: string;

  /** The visible label. Required — see the note above. */
  label: string;

  /**
   * Machine-identity data, so the control is set in monospace. Default `false`:
   * prose fields must not spend the mono signal.
   */
  machine?: boolean;

  /** One sentence under the label, for a format requirement or a unit. */
  hint?: string;

  /** The validation failure, when there is one. */
  error?: string;

  /** Render the control. Receives the props that wire up the associations. */
  children: (props: {
    id: string;
    className: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

export function FieldSet({
  id,
  label,
  machine = false,
  hint,
  error,
  children,
}: FieldSetProps) {
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined ? undefined : `${id}-error`;

  // Both when both exist, so a reader hears the format requirement AND what went
  // wrong rather than only the most recent of the two.
  const describedBy = [hintId, errorId].filter((value) => value !== undefined).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-caption text-muted uppercase">
        {label}
      </label>

      {hint === undefined ? null : (
        <p id={hintId} className="text-meta text-muted max-w-[68ch]">
          {hint}
        </p>
      )}

      {children({
        id,
        className: [
          'bg-well text-primary placeholder:text-muted w-full rounded-[--radius-control] border px-3.5 py-2.5 transition-colors duration-150',
          machine ? 'text-record font-mono [overflow-wrap:anywhere]' : 'text-body',
          error === undefined ? 'border-rule' : 'border-state-tampered',
          FOCUS,
        ].join(' '),
        'aria-invalid': error !== undefined,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
      })}

      {error === undefined ? null : (
        <p id={errorId} className="text-meta text-state-tampered max-w-[68ch]">
          {error}
        </p>
      )}
    </div>
  );
}
