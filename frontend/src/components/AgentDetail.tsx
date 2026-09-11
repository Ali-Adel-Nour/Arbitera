'use client';

/**
 * =============================================================================
 * `AgentDetail` — one agent, every figure drillable
 * =============================================================================
 *
 * EVERY NUMBER ON THIS SCREEN IS A `DrillableMetric`, which means every number
 * opens the resolutions it came from. That is Requirement 6.5 taken literally: a
 * score you cannot open is an assertion, and this screen's job is to make an
 * assertion into evidence. The primitive enforces it — `href` is required and has
 * no default — so a figure cannot be added here without a destination.
 *
 * THE CEILING IS STATED, NOT IMPLIED. An agent with four judgments cannot score
 * above 57 no matter how good the outcomes are, because the volume factor holds it
 * down. Showing 14 next to "Unproven" without that context invites a reader to
 * conclude the agent performs badly, when the fixture agent's real story is one
 * success in four with too little history to say much either way. The ceiling
 * sentence is where the interface says which of the two is doing the work.
 *
 * ZERO JUDGMENTS IS A RECORD, NOT AN ABSENCE. The shipped route answers an unknown
 * agent with zeroes rather than a 404, so this screen renders the identifier and
 * says nobody has hired this agent yet. Reporting that as an error would tell a
 * reviewer the deployment was broken while it was answering correctly.
 */

import Link from 'next/link';

import { AGENTS } from '@/content/copy';
import { errorCopy } from '@/lib/errorCopy';
import { formatBasis, formatRate } from '@/lib/format';
import { resolutionsHref } from '@/lib/resolutionsHref';
import { useAgentReputation } from '@/hooks/useAgentReputation';
import { DrillableMetric } from '@/components/primitives/DrillableMetric';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ErrorState } from '@/components/primitives/ErrorState';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function AgentDetail({ agent }: { agent: string }) {
  const { data, error, isLoading, reload } = useAgentReputation(agent);

  if (data === null) {
    return error === null ? (
      <p className="text-body text-muted">{AGENTS.detailLoading}</p>
    ) : (
      <ErrorState
        cause={errorCopy(error).cause}
        recovery={errorCopy(error).recovery}
        onRetry={reload}
        retryLabel="Request the reputation again"
      />
    );
  }

  const { summary, score, tier, ceiling, reliability, disputes, computedAt } = data;
  const judged = summary.totalJudged;
  const basis = formatBasis(summary.successes, judged, 'resolutions');
  const categories = Object.entries(disputes);

  return (
    <div className="flex flex-col gap-10">
      {error === null ? null : (
        <ErrorState
          cause={errorCopy(error).cause}
          recovery={errorCopy(error).recovery}
          onRetry={reload}
          retryLabel="Request the reputation again"
        />
      )}

      <header className="flex flex-col gap-4">
        <MachineValue value={summary.agent} label="agent identifier" copyable />
        <p className="text-body">
          <Link
            href="/agents"
            className={`text-accent-text underline decoration-1 underline-offset-4 ${FOCUS}`}
          >
            {AGENTS.backToList}
          </Link>
        </p>
      </header>

      {judged === 0 ? (
        <Panel title={AGENTS.scoreHeading}>
          <EmptyState condition={AGENTS.neverJudged} />
        </Panel>
      ) : (
        <>
          <Panel title={AGENTS.scoreHeading} note={AGENTS.scoreNote} padded>
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                <DrillableMetric
                  label="Trust score"
                  value={String(score)}
                  href={resolutionsHref(summary.agent, 'trust-score')}
                  basis={`${tier}, ${basis}`}
                />
                <DrillableMetric
                  label="Reliability"
                  value={formatRate(reliability)}
                  href={resolutionsHref(summary.agent, 'reliability')}
                  basis="Recency-weighted, 30-day half weight"
                />
                <DrillableMetric
                  label="Success rate"
                  value={formatRate(summary.successRate)}
                  href={resolutionsHref(summary.agent, 'success-rate')}
                  basis={basis}
                />
              </div>

              {/* Which of volume and outcome is holding the score down. */}
              <p className="text-meta text-muted max-w-[68ch]">
                {AGENTS.ceilingNote(ceiling, judged)}
              </p>
            </div>
          </Panel>

          <Panel
            title={AGENTS.categoriesHeading}
            note={AGENTS.categoriesNote}
            count={categories.length}
            padded={categories.length === 0}
          >
            {categories.length === 0 ? (
              <EmptyState condition={AGENTS.categoriesEmpty} />
            ) : (
              <div className="grid grid-cols-1 gap-6 px-4 py-4 sm:grid-cols-2 md:px-5 lg:grid-cols-3">
                {categories.map(([category, rate]) => (
                  <DrillableMetric
                    key={category}
                    label={category}
                    value={formatRate(rate.rate)}
                    href={resolutionsHref(summary.agent, 'category')}
                    basis={formatBasis(rate.numerator, rate.denominator, 'disputed')}
                  />
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* The instant the figures describe. Not decoration: recency weighting is a
          function of time, so a score is only reproducible against a stated
          moment. `useAgentReputation` captures it once for the whole derivation. */}
      <p className="text-meta text-muted">
        Computed {new Date(computedAt).toISOString().slice(11, 19)} UTC
      </p>
    </div>
  );
}
