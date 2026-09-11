/**
 * A status pill: leading dot in the state ink, then the state named in words.
 *
 * The pill shape and the leading dot are adopted from the dark dashboard idiom.
 * What is NOT adopted is colour-only status: Requirements 14.5 and 14.6 put the
 * state word inside the pill, so a reader with any form of colour vision
 * deficiency reads exactly what a reader distinguishing green from blue reads.
 * `STATE_DISPLAY` makes that structural rather than remembered — the ink and the
 * label come out of the same record, so a caller cannot take one without the
 * other.
 *
 * Every ink measures at least 6.4:1 against its own pill ground, and each ground
 * is a solid hex rather than an alpha over a panel, so the ratio holds wherever
 * the chip sits rather than depending on what is behind it.
 */

import { STATE_DISPLAY } from '@/lib/stateDisplay';
import type { DisplayState } from '@/types';

export function StateChip({ state }: { state: DisplayState }) {
  const { label, ink, ground } = STATE_DISPLAY[state];

  return (
    <span
      className={`text-caption inline-flex shrink-0 items-center gap-2 rounded-chip border border-rule px-2.5 py-1 transition-colors duration-150 ${ground} ${ink}`}
    >
      {/* Decorative: the label carries the state, so the dot is not announced. */}
      <span aria-hidden className="size-1.5 rounded-chip bg-current" />
      {label}
    </span>
  );
}
