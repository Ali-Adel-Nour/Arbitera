/**
 * =============================================================================
 * `LogLine` — one entry in a continuous transcript
 * =============================================================================
 *
 * NO PER-LINE CONTAINER, and that is the whole treatment. Lines sit in one shared
 * recessed well with nothing between them: no border, no radius, no alternating
 * ground. A rule between lines would claim a field boundary that does not exist,
 * because consecutive queries are not fields of one record — they are separate
 * events in one stream.
 *
 * The continuity is what makes this read as a console transcript rather than a
 * table of cards, and it is the structural difference between this container kind
 * and `DocketEntry`, which uses `rule/instance` precisely because there each row
 * IS a separate record.
 *
 * THE TIMESTAMP COLUMN IS FIXED WIDTH BUT NOT MONOSPACE. A ragged left edge in a
 * log is unreadable, so the column is fixed and the figures are `tabular-nums` —
 * which is what actually makes digits align. Reaching for the mono family here
 * would be the easy move and the wrong one: monospace in this interface means
 * "you can compare this string byte for byte", and a wall-clock timestamp is not
 * something anyone compares against a recomputation. Spending the signal on log
 * chrome is exactly what `mono-confinement` exists to stop.
 */

import type { ReactNode } from 'react';

import { timeLabel } from '@/lib/format';

interface LogLineProps {
  /** ISO instant. Rendered UTC so two readers can compare notes. */
  timestamp: string;
  children: ReactNode;
}

export function LogLine({ timestamp, children }: LogLineProps) {
  return (
    <div className="flex gap-4 px-4 py-1.5 md:px-5">
      <span className="text-caption text-muted w-[4.5rem] shrink-0 pt-0.5 tabular-nums">
        {timeLabel(timestamp)}
      </span>

      {/* The hanging indent lands on the wrapped continuation, so the timestamp
          column stays clean when a line runs long at a narrow width. */}
      <span className="text-record text-primary min-w-0 flex-1 [text-indent:-2ch] [padding-inline-start:2ch]">
        {children}
      </span>
    </div>
  );
}
