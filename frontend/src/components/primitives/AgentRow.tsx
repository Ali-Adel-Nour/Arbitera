/**
 * =============================================================================
 * `AgentRow` — one agent in the trust explorer, with the evidence attached
 * =============================================================================
 *
 * A ledger row, not a card: borderless, separated by `rule/instance`, same
 * argument as `DocketEntry`.
 *
 * THE TIER NEVER APPEARS WITHOUT ITS DENOMINATOR. "Established" alone is a claim;
 * "Established, 5 of 5 resolutions" is evidence a reader can weigh, and a reader
 * who sees "Unproven, 1 of 4" understands the tier is about volume rather than
 * about failure. `basis` is therefore required, not optional — the fixture agent
 * scoring 14 on one success in four is exactly the case where a bare tier
 * misleads.
 *
 * THE SCORE IS A `DrillableMetric`, so it opens the resolutions that produced it.
 * The row is NOT itself a link, because it contains one: nesting an anchor inside
 * an anchor is invalid HTML and gives keyboard users two targets with different
 * destinations and no way to tell them apart. The agent's name is the link to the
 * detail screen; the score is the link to the arithmetic. Two deliberate targets.
 */

import Link from 'next/link';

import { formatRate } from '@/lib/format';
import { agentHref, resolutionsHref } from '@/lib/resolutionsHref';
import type { BadgeTier } from '@/types';

import { DrillableMetric } from './DrillableMetric';
import { MachineValue } from './MachineValue';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

interface AgentRowProps {
  /** Slug or address. `MachineValue` decides whether to truncate. */
  agent: string;

  /** The interface's own 0–100 figure. */
  score: number;

  /** The band that figure falls in. */
  tier: BadgeTier;

  /** Recency-weighted reliability in [0, 1]. */
  reliability: number;

  /** "5 of 5 resolutions". Required — see the note above. */
  basis: string;
}

export function AgentRow({ agent, score, tier, reliability, basis }: AgentRowProps) {
  return (
    <div className="rule-instance grid grid-cols-1 items-start gap-x-8 gap-y-4 px-4 py-4 md:grid-cols-[1fr_auto_auto] md:items-center md:px-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={agentHref(agent)}
          className={`text-hi hover:text-accent-text min-w-0 transition-colors duration-100 ${FOCUS}`}
        >
          <MachineValue value={agent} label="agent identifier" />
        </Link>

        {/* Tier and denominator on one line, so the claim and its evidence
            cannot be read apart. */}
        <span className="text-meta text-muted">
          {tier}, {basis}
        </span>
      </div>

      <DrillableMetric
        label="Trust score"
        value={String(score)}
        href={resolutionsHref(agent, 'trust-score')}
        basis={basis}
      />

      <DrillableMetric
        label="Reliability"
        value={formatRate(reliability)}
        href={resolutionsHref(agent, 'reliability')}
        basis="30-day half-weight"
      />
    </div>
  );
}
