/**
 * =============================================================================
 * `Panel` — a titled region, and the docket group's container
 * =============================================================================
 *
 * The only container primitive with a radius and a border box. That is what makes
 * it a REGION rather than a record: a docket group, a hash strip, an activity
 * well. Records inside it get no box of their own — see `DocketEntry`, which is
 * deliberately borderless so a group of them reads as a ledger rather than a
 * stack of cards.
 *
 * THE COUNT IS NOT DECORATION. A group heading reading "Funded" with nine rows
 * under it makes a reader count; "Funded 9" does not. And on an empty group the
 * count is what distinguishes "nothing is in this state" from "this section
 * failed to load" — which are very different facts about a live deployment.
 *
 * `padded` DEFAULTS TO FALSE because the common case is a list whose rows own
 * their own inset. Padding here as well would double the gutter and push the
 * rows' left edges out of alignment with the heading above them.
 */

import type { ReactNode } from 'react';

interface PanelProps {
  /** The region's name. Rendered as a heading over a within-record rule. */
  title: string;

  /**
   * How many records the region holds. Rendered beside the title. Pass `null` for
   * a region where a count is meaningless, such as a prose explainer.
   */
  count?: number | null;

  /** One sentence under the title, where the region needs framing. */
  note?: string;

  /** Inset the body. Leave false for lists whose rows carry their own padding. */
  padded?: boolean;

  children: ReactNode;
}

export function Panel({ title, count = null, note, padded = false, children }: PanelProps) {
  return (
    <section className="bg-panel-1 overflow-hidden rounded-[--radius-panel] border border-panel-edge">
      <header className="rule-record flex flex-col gap-1 px-4 py-3.5 md:px-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-caption text-muted uppercase">{title}</h2>
          {count === null ? null : (
            <span className="text-meta text-muted tabular-nums">{count}</span>
          )}
        </div>
        {note === undefined ? null : (
          <p className="text-meta text-muted max-w-[68ch]">{note}</p>
        )}
      </header>

      <div className={padded ? 'px-4 py-4 md:px-5' : ''}>{children}</div>
    </section>
  );
}
