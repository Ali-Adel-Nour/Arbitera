'use client';

/**
 * =============================================================================
 * `AgentResolutions` — the arithmetic, not a summary of it
 * =============================================================================
 *
 * The destination of every `DrillableMetric` on the detail screen. Its job is
 * narrow and worth stating: SHOW THE NUMBERS THAT PRODUCE THE SCORE, in enough
 * detail that a reader with a calculator can reach the same figure.
 *
 * So each judgment carries its own recency weight, the weighted sums are shown as
 * sums, and the volume factor is shown as the fraction it is. A drill-down that
 * restated "reliability 24.7%" in a larger typeface would be a second display of
 * the same assertion — the thing a reader clicked through for is the derivation.
 *
 * THE WEIGHTS ARE RECOMPUTED HERE FROM THE SAME FUNCTION the score uses, against
 * the same instant. `useAgentReputation` captures `computedAt` once and this
 * component derives every weight from it, so the per-row weights necessarily sum to
 * the denominator shown. Calling `Date.now()` here instead would drift the weights
 * a few milliseconds off the score they claim to explain, and the columns would not
 * quite add up — which on this screen is the whole product.
 *
 * THE FRAGMENT IN THE URL SELECTS NOTHING. `resolutionsHref` appends `#trust-score`
 * or `#reliability` so a reader lands on the relevant part, and each section
 * carries the matching `id`. It does not filter: a reader who clicked the success
 * rate still wants to see the weights, because the two figures are computed from
 * one list and hiding half of it would make each drill-down look like a different
 * dataset.
 */

import Link from 'next/link';

import { AGENTS } from '@/content/copy';
import { RELIABILITY_HALFLIFE_DAYS, VOLUME_CONFIDENCE_K } from '@/lib/derive';
import { errorCopy } from '@/lib/errorCopy';
import { formatRate, instantLabel } from '@/lib/format';
import { agentHref } from '@/lib/resolutionsHref';
import { useAgentReputation } from '@/hooks/useAgentReputation';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ErrorState } from '@/components/primitives/ErrorState';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';
import type { JudgmentHistoryEntry } from '@/types';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const MS_PER_DAY = 86_400_000;

/**
 * The weight one judgment carries at `nowMs`.
 *
 * Duplicating the exponential from `lib/derive.ts` would be the wrong kind of
 * convenience — two copies of a decay curve is two things to keep in step — but
 * that module exposes the aggregate, not the per-judgment weight, and this screen
 * needs the individual terms to show a sum. So the half-life constant is imported
 * rather than restated, and the one line of arithmetic is local. If the curve ever
 * changes shape, `RELIABILITY_HALFLIFE_DAYS` stops being enough and this function
 * has to move into `derive.ts` beside it.
 */
function weightOf(entry: JudgmentHistoryEntry, nowMs: number): number {
  const ageDays = Math.max(0, (nowMs - new Date(entry.timestamp).getTime()) / MS_PER_DAY);
  return Math.exp(-ageDays / RELIABILITY_HALFLIFE_DAYS);
}

/** A term in one of the two sums. */
function SumRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rule-derived flex flex-col gap-1 py-1">
      <span className="text-caption text-muted uppercase">{label}</span>
      <span className="text-record text-hi tabular-nums">{value}</span>
      {note === undefined ? null : <span className="text-meta text-muted">{note}</span>}
    </div>
  );
}

export function AgentResolutions({ agent }: { agent: string }) {
  const { data, error, reload } = useAgentReputation(agent);

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

  const { summary, score, reliability, ceiling, computedAt } = data;
  const judged = summary.totalJudged;

  // Newest first for display. The route returns newest-last, and a reader looking
  // for "what happened recently" should not have to scroll to find it.
  const history = [...summary.history].reverse();

  const weighted = history.map((entry) => ({ entry, weight: weightOf(entry, computedAt) }));
  const weightTotal = weighted.reduce((sum, row) => sum + row.weight, 0);
  const weightedSuccesses = weighted.reduce(
    (sum, row) => sum + (row.entry.approved ? row.weight : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <h1 className="text-screen text-hi">{AGENTS.resolutionsHeading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{AGENTS.resolutionsLede}</p>
        <MachineValue value={summary.agent} label="agent identifier" copyable />
        <p className="text-body">
          <Link
            href={agentHref(summary.agent)}
            className={`text-accent-text underline decoration-1 underline-offset-4 ${FOCUS}`}
          >
            {AGENTS.backToAgent}
          </Link>
        </p>
      </header>

      {judged === 0 ? (
        <Panel title={AGENTS.arithmeticHeading}>
          <EmptyState condition={AGENTS.resolutionsEmpty} />
        </Panel>
      ) : (
        <>
          {/* The two steps, with this record's actual numbers in them. The ids are
              the fragment targets `resolutionsHref` produces. */}
          <section id="trust-score" className="scroll-mt-8">
            <Panel title={AGENTS.arithmeticHeading} note={AGENTS.arithmeticNote} padded>
              <div id="reliability" className="grid grid-cols-1 gap-6 scroll-mt-8 sm:grid-cols-2 lg:grid-cols-4">
                <SumRow
                  label="Weighted successes"
                  value={weightedSuccesses.toFixed(4)}
                  note="Sum of the weights of approved judgments"
                />
                <SumRow
                  label="Total weight"
                  value={weightTotal.toFixed(4)}
                  note="Sum of every judgment’s weight"
                />
                <SumRow
                  label="Reliability"
                  value={formatRate(reliability)}
                  note="Weighted successes over total weight"
                />
                <SumRow
                  label="Volume factor"
                  value={`${judged} / ${judged + VOLUME_CONFIDENCE_K}`}
                  note={`Judgments over judgments plus ${VOLUME_CONFIDENCE_K}. This is what caps the score at ${ceiling}.`}
                />
              </div>
            </Panel>
          </section>

          <section id="success-rate" className="scroll-mt-8">
            <Panel
              title={AGENTS.weightHeading}
              note={AGENTS.weightNote}
              count={history.length}
            >
              {weighted.map(({ entry, weight }) => (
                <div
                  key={`${entry.dealId}-${entry.timestamp}`}
                  className="rule-instance grid grid-cols-1 items-baseline gap-x-6 gap-y-2 px-4 py-3.5 md:grid-cols-[1fr_auto_auto_auto] md:px-5"
                >
                  <Link
                    href={`/deals/${encodeURIComponent(entry.dealId)}`}
                    className={`min-w-0 ${FOCUS}`}
                  >
                    <MachineValue value={entry.dealId} label="deal identifier" />
                  </Link>

                  {/* The outcome in words. Colour alone never carries it. */}
                  <span
                    className={`text-meta ${
                      entry.approved ? 'text-state-paid' : 'text-state-refunded'
                    }`}
                  >
                    {entry.approved ? 'Approved' : 'Refused'}
                  </span>

                  <span className="text-meta text-muted">
                    {entry.taskCategory ?? 'uncategorized'}
                  </span>

                  <span className="text-record text-hi tabular-nums">
                    {weight.toFixed(4)}
                  </span>

                  <span className="text-meta text-muted md:col-span-4">
                    {instantLabel(entry.timestamp)}
                  </span>
                </div>
              ))}
            </Panel>
          </section>

          {/* `#category` also lands here: the category column is on these rows, so
              a reader who clicked a category rate can see which resolutions are in
              its bucket and what each currently weighs. */}
          <section id="category" className="scroll-mt-8">
            <p className="text-meta text-muted max-w-[68ch]">
              Trust score {score}. Reliability {formatRate(reliability)} scaled by{' '}
              {judged} / {judged + VOLUME_CONFIDENCE_K}, computed{' '}
              {new Date(computedAt).toISOString().slice(11, 19)} UTC from the{' '}
              {history.length} resolutions above.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
