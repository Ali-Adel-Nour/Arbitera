/**
 * =============================================================================
 * `MachineValue` — the ONLY component permitted the monospace family
 * =============================================================================
 *
 * Monospace in this interface marks one thing: a value you can compare byte for
 * byte. Hashes, addresses, deal identifiers, transaction hashes, model
 * identifiers, agent identifier strings.
 *
 * THE CONFINEMENT IS THE POINT, AND IT IS ENFORCED. `scripts/check-design.mjs`
 * fails the build if `font-mono` appears outside this file and `FieldSet.tsx`.
 * The dark dashboard idiom this palette borrows from puts monospace on
 * navigation labels, section headings and status pills, and that is precisely
 * what the rule exists to prevent: if the chrome is mono, a hash in mono is no
 * longer marked as anything, and the one signal that says "this string is
 * checkable" is spent on decoration.
 *
 * `FieldSet` is the second file on the allow-list and it earns the place rather
 * than bending the rule — a 42-character address typed into a form field IS
 * machine-identity data, and an `<input>` cannot render through this component.
 *
 * WHY THIS IS NOT A CLIENT COMPONENT. Reading a value needs no state. The copy
 * control does, so it is its own client component and is only mounted when a
 * caller asks for one. A hash strip with fifteen rows therefore ships one
 * client component per copyable cell rather than fifteen mono renderers.
 */

import { isTruncated, truncateMachineValue } from '@/lib/formatMachine';

import { CopyAffordance } from './CopyAffordance';

interface MachineValueProps {
  /** The full value. Truncation is display-only and never reaches the clipboard. */
  value: string;

  /**
   * What this value IS, for the copy control's accessible name and the title
   * attribute. Required rather than optional: "Copy" repeated down a hash strip
   * tells a screen reader user nothing about which row they are on.
   */
  label: string;

  /** Render a copy control beside the value. */
  copyable?: boolean;

  /** Extra classes on the value itself, for colour in a mismatched row. */
  className?: string;
}

export function MachineValue({
  value,
  label,
  copyable = false,
  className = '',
}: MachineValueProps) {
  const display = truncateMachineValue(value);

  return (
    <span className="inline-flex min-w-0 items-baseline gap-2">
      <span
        // `overflow-wrap: anywhere` is what keeps a 66-character digest from
        // forcing horizontal overflow at 375px when it is NOT truncated — a
        // long plain identifier has no elision to fall back on.
        className={`text-record font-mono [overflow-wrap:anywhere] ${className}`}
        // Only when shortened. A title on an untruncated value is a tooltip that
        // repeats what is already on screen.
        title={isTruncated(value) ? value : undefined}
      >
        {display}
      </span>

      {copyable ? <CopyAffordance value={value} label={label} /> : null}
    </span>
  );
}
