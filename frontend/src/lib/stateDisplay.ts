/**
 * =============================================================================
 * `src/lib/stateDisplay.ts` — how each display state is named and coloured
 * =============================================================================
 *
 * One table, so a state's label and its ink cannot drift apart. Requirement 14.5
 * and 14.6 require every state indicator to pair its colour with a text label,
 * and the cheapest way to guarantee that is to make the label part of the same
 * record as the colour: a caller cannot reach for the ink without the words.
 *
 * The labels say more than the enum does, on purpose:
 *
 *   `ResolvedRefund` becomes "Settled — buyer refunded" rather than "Refunded",
 *   because a refund IS a settlement and reading it as a failure is the most
 *   common misunderstanding of this protocol.
 *
 *   `Deliberating` says "off-chain" in the label itself, because it is the one
 *   state the chain does not hold (Requirement 9.4). A reader should not have to
 *   find a footnote to learn that.
 *
 * REFUNDED IS BLUE, NOT RED. A buyer refund is a correct protocol outcome. Red
 * belongs to the single condition that means something is actually wrong: a hash
 * that does not match its recomputation.
 */

import type { DisplayState } from '@/types';

export interface StateDisplay {
  /** The full label. Always rendered — colour never carries state alone. */
  label: string;
  /** Tailwind class for the state ink, used on text and the leading dot. */
  ink: string;
  /** Tailwind class for the pill ground. Solid, so its contrast is exact. */
  ground: string;
  /** True for the one state the contract does not hold. */
  derived?: boolean;
}

export const STATE_DISPLAY: Record<DisplayState, StateDisplay> = {
  Created: {
    label: 'Created — awaiting funding',
    ink: 'text-state-expired',
    ground: 'bg-state-expired-ground',
  },
  Funded: {
    label: 'Funded — awaiting delivery',
    ink: 'text-state-refunded',
    ground: 'bg-state-refunded-ground',
  },
  Submitted: {
    label: 'Submitted — awaiting judgment',
    ink: 'text-state-refunded',
    ground: 'bg-state-refunded-ground',
  },
  Deliberating: {
    label: 'Deliberating — off-chain',
    ink: 'text-state-deliberating',
    ground: 'bg-state-deliberating-ground',
    derived: true,
  },
  ResolvedSuccess: {
    label: 'Settled — seller paid',
    ink: 'text-state-paid',
    ground: 'bg-state-paid-ground',
  },
  ResolvedRefund: {
    label: 'Settled — buyer refunded',
    ink: 'text-state-refunded',
    ground: 'bg-state-refunded-ground',
  },
  ExpiredRefund: {
    label: 'Expired — refundable to buyer',
    ink: 'text-state-expired',
    ground: 'bg-state-expired-ground',
  },
};

/**
 * The seven groups, in on-chain lifecycle order.
 *
 * `Deliberating` sits between `Submitted` and the resolutions because that is
 * where it happens in time, even though the chain has no such step. Ordering it
 * by the lifecycle rather than alphabetically is what lets the docket read
 * top-to-bottom as a progression.
 */
export const DISPLAY_STATE_ORDER: DisplayState[] = [
  'Created',
  'Funded',
  'Submitted',
  'Deliberating',
  'ResolvedSuccess',
  'ResolvedRefund',
  'ExpiredRefund',
];
