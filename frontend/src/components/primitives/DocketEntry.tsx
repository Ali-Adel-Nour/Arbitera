/**
 * =============================================================================
 * `DocketEntry` — one deal, as a row in a ledger
 * =============================================================================
 *
 * NO RADIUS AND NO BORDER BOX, and that absence is the design decision. A docket
 * entry is a line in a register, not a panel. Radius here is exactly what turns a
 * list into a stack of cards, and a stack of cards is what makes every dark
 * dashboard's feed interchangeable with every other one.
 *
 * What separates entries is `rule/instance`, whose documented meaning is "end of
 * one record, start of another" — full-strength, because it is a boundary a
 * reader must perceive. Within a record the quieter `rule/record` is used
 * instead. That contrast between a hairline inside and a full rule between is the
 * whole ledger effect, and it is information: a reader can see where one deal
 * ends without reading any text.
 *
 * THE WHOLE ROW IS THE LINK. A row with a link buried in one cell makes a reader
 * hunt for the target; a row that is itself a link has one obvious action.
 *
 * HOVER CHANGES COLOUR AND MOVES NOTHING. Requirement 14.12 permits interactive
 * transitions within 200ms and forbids hover transforms outright; the
 * `hover-motion` rule in `check-design.mjs` greps for the scale, translate and
 * shadow variants by name and fails the build on any of them. A row that lifts
 * under the cursor is a card pretending to be a physical object.
 */

import Link from 'next/link';

import { deadlineLabel, formatUsdc } from '@/lib/format';
import type { DisplayState, EscrowDeal } from '@/types';

import { MachineValue } from './MachineValue';
import { StateChip } from './StateChip';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

interface DocketEntryProps {
  deal: EscrowDeal;
  /** The derived display state, which may be `Deliberating`. */
  state: DisplayState;
}

export function DocketEntry({ deal, state }: DocketEntryProps) {
  return (
    <Link
      href={`/deals/${encodeURIComponent(deal.dealId)}`}
      className={`rule-instance hover:bg-panel-2 grid grid-cols-1 items-center gap-x-6 gap-y-3 px-4 py-4 transition-colors duration-100 md:grid-cols-[auto_1fr_auto] md:px-5 ${FOCUS}`}
    >
      <StateChip state={state} />

      <div className="flex min-w-0 flex-col gap-1.5">
        <MachineValue value={deal.dealId} label="deal identifier" />

        {/* Labelled pairs, never a middle-dot strip. A joined string is one
            thing on the page: nothing in it is individually labelled or
            addressable, and a reader cannot tell protocol data from the
            interface's own arithmetic. Requirement 14.11. */}
        <dl className="text-meta text-muted flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-caption uppercase">Buyer</dt>
            <dd>
              <MachineValue value={deal.buyer} label="buyer address" />
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-caption uppercase">Seller</dt>
            <dd>
              <MachineValue value={deal.seller} label="seller address" />
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-1 md:items-end">
        <span className="text-record text-hi tabular-nums">{formatUsdc(deal.amount)}</span>
        <span className="text-meta text-muted">{deadlineLabel(deal.deadline)}</span>
      </div>
    </Link>
  );
}
