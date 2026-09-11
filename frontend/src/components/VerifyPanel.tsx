'use client';

/**
 * =============================================================================
 * `VerifyPanel` — three commitments, three sources each, one conclusion
 * =============================================================================
 *
 * THE SCREEN'S SHAPE IS ITS ARGUMENT. Each commitment gets a panel, and inside it
 * one row per source: recomputed here, stored by the backend, committed on-chain.
 * Three rows rather than one row with three columns, because at 375px a
 * three-column strip of 66-character digests either overflows or truncates to
 * uselessness — and because a row per source is what lets each one carry its own
 * provenance label and its own outcome. The reader is meant to be able to point at
 * a row and say which party produced it.
 *
 * `all-match` STILL RENDERS THREE ROWS. `TripleComparison` collapses the matching
 * case to a single `value`, and it is tempting to render that once. It is not:
 * three rows showing the same digest under three different source labels is the
 * whole point being made — three parties independently arrived at this value. One
 * row would show the conclusion while hiding the evidence for it.
 *
 * THE CONCLUSION COMES FROM `outcome.conclusion` AND NOTHING ELSE. This component
 * does no comparison of its own; it does not read `backendVerifiedFlag` in any
 * branch that decides what the conclusion says. The flag is rendered in its own
 * panel, below, with copy stating that it is not used. Requirement 8.7 is upheld
 * in `lib/verify.ts` structurally, and this file must not quietly reintroduce the
 * dependency by, say, styling the conclusion differently when the flag disagrees.
 *
 * ONLY A MISMATCHED ROW GETS THE TAMPERED INK, and it is the only red on any
 * screen in this application. `HashStripRow` applies it from `agreement === false`.
 * A row with nothing to compare against is `null` — neither passing nor failing —
 * and says so in words rather than defaulting to either.
 */

import Link from 'next/link';

import { VERIFY } from '@/content/copy';
import { errorCopy } from '@/lib/errorCopy';
import { DISAGREEING_PAIR, type TripleComparison } from '@/lib/verify';
import { useVerification } from '@/hooks/useVerification';
import { ErrorState } from '@/components/primitives/ErrorState';
import { EmptyState } from '@/components/primitives/EmptyState';
import { HashStripRow } from '@/components/primitives/HashStripRow';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** One source's row data, flattened out of the comparison union. */
interface SourceRow {
  source: string;
  value: string | null;
  agreement: boolean | null;
  outcome: string;
}

/**
 * Flatten a comparison into three rows.
 *
 * The switch is exhaustive over `TripleComparison`, so a kind added to that union
 * stops compiling here rather than silently rendering nothing. That is the reason
 * this is a switch on `kind` and not a chain of property checks.
 *
 * `agreement` is assigned per SOURCE, not per row-group: in `stored-differs` the
 * recomputed and on-chain rows agree and the stored row does not, and the whole
 * diagnostic value of the screen is that a reader can see which single row is the
 * odd one out.
 */
function sourceRows(comparison: TripleComparison): SourceRow[] {
  const { recomputed, stored, onChain } = VERIFY.sources;
  const { agrees, differs, notCompared, notCommitted } = VERIFY.outcomes;

  switch (comparison.kind) {
    case 'all-match':
      // Three rows, one value. See the note above on why this is not collapsed.
      return [
        { source: recomputed, value: comparison.value, agreement: true, outcome: agrees },
        { source: stored, value: comparison.value, agreement: true, outcome: agrees },
        { source: onChain, value: comparison.value, agreement: true, outcome: agrees },
      ];

    case 'stored-differs':
      return [
        { source: recomputed, value: comparison.recomputed, agreement: true, outcome: agrees },
        { source: stored, value: comparison.stored, agreement: false, outcome: differs },
        { source: onChain, value: comparison.onChain, agreement: true, outcome: agrees },
      ];

    case 'onchain-differs':
      return [
        { source: recomputed, value: comparison.recomputed, agreement: true, outcome: agrees },
        { source: stored, value: comparison.stored, agreement: true, outcome: agrees },
        { source: onChain, value: comparison.onChain, agreement: false, outcome: differs },
      ];

    case 'recomputed-differs':
      return [
        { source: recomputed, value: comparison.recomputed, agreement: false, outcome: differs },
        { source: stored, value: comparison.stored, agreement: true, outcome: agrees },
        { source: onChain, value: comparison.onChain, agreement: true, outcome: agrees },
      ];

    case 'all-differ':
      // No source agrees with any other, so every row stands apart. There is no
      // odd one out to name, and the row-group sentence says exactly that.
      return [
        { source: recomputed, value: comparison.recomputed, agreement: false, outcome: differs },
        { source: stored, value: comparison.stored, agreement: false, outcome: differs },
        { source: onChain, value: comparison.onChain, agreement: false, outcome: differs },
      ];

    case 'onchain-absent':
      // The two available sources are compared against each other; the third is
      // absent rather than failing, and gets `null` so it renders as neither.
      return [
        {
          source: recomputed,
          value: comparison.recomputed,
          agreement: comparison.storedMatches,
          outcome: comparison.storedMatches ? agrees : differs,
        },
        {
          source: stored,
          value: comparison.stored,
          agreement: comparison.storedMatches,
          outcome: comparison.storedMatches ? agrees : differs,
        },
        { source: onChain, value: null, agreement: null, outcome: notCompared },
      ];
  }
}

/** The sentence naming the odd source out, when there is one. */
function comparisonNote(comparison: TripleComparison): string | undefined {
  if (comparison.kind === 'all-match') return undefined;
  if (comparison.kind === 'onchain-absent') {
    return comparison.storedMatches ? VERIFY.outcomes.notCommitted : undefined;
  }
  return DISAGREEING_PAIR[comparison.kind];
}

/** One commitment: its heading, its note, and its three source rows. */
function ComparisonPanel({
  label,
  note,
  comparison,
}: {
  label: string;
  note: string;
  comparison: TripleComparison;
}) {
  const diagnosis = comparisonNote(comparison);

  return (
    <Panel title={label} note={diagnosis === undefined ? note : `${note} ${diagnosis}`}>
      {sourceRows(comparison).map((row) => (
        <HashStripRow
          key={row.source}
          label={label}
          value={row.value}
          agreement={row.agreement}
          source={row.source}
          outcome={row.outcome}
        />
      ))}
    </Panel>
  );
}

export function VerifyPanel({ dealId }: { dealId: string }) {
  const { inputs, outcome, error, lastUpdatedAt, refetch } = useVerification(dealId);

  if (inputs === null) {
    return error === null ? (
      <p className="text-body text-muted">{VERIFY.loading}</p>
    ) : (
      <ErrorState
        cause={errorCopy(error).cause}
        recovery={errorCopy(error).recovery}
        onRetry={refetch}
        retryLabel="Request the record again"
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {error === null ? null : (
        <ErrorState
          cause={errorCopy(error).cause}
          recovery={errorCopy(error).recovery}
          onRetry={refetch}
          retryLabel="Request the record again"
        />
      )}

      <header className="flex flex-col gap-4">
        <h1 className="text-screen text-hi">{VERIFY.heading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{VERIFY.lede}</p>
        <MachineValue value={inputs.deal.dealId} label="deal identifier" copyable />
        <p className="text-body">
          <Link
            href={`/deals/${encodeURIComponent(inputs.deal.dealId)}`}
            className={`text-accent-text underline decoration-1 underline-offset-4 ${FOCUS}`}
          >
            {VERIFY.recordLinkLabel}
          </Link>
        </p>
      </header>

      {outcome === null ? (
        <Panel title={VERIFY.conclusionHeading}>
          <EmptyState condition={VERIFY.noRecord} />
        </Panel>
      ) : (
        <>
          {/* The conclusion first. A reviewer who wants only the answer gets it
              without scrolling; the evidence follows for one who wants to check
              it. Both are on the same screen, which is the point. */}
          <Panel title={VERIFY.conclusionHeading} padded>
            <div className="flex flex-col gap-3">
              <p
                className={`text-lede ${
                  outcome.conclusion === 'mismatch' ? 'text-state-tampered' : 'text-state-paid'
                }`}
              >
                {outcome.conclusion === 'mismatch' ? VERIFY.mismatch : VERIFY.tamperEvident}
              </p>
              <p className="text-body text-muted max-w-[68ch]">{VERIFY.conclusionScope}</p>
            </div>
          </Panel>

          <div className="flex flex-col gap-4">
            <ComparisonPanel
              label={VERIFY.rows.rubric.label}
              note={VERIFY.rows.rubric.note}
              comparison={outcome.rubric}
            />
            <ComparisonPanel
              label={VERIFY.rows.deliverable.label}
              note={VERIFY.rows.deliverable.note}
              comparison={outcome.deliverable}
            />
            <ComparisonPanel
              label={VERIFY.rows.verdict.label}
              note={VERIFY.rows.verdict.note}
              comparison={outcome.verdict}
            />
          </div>

          {/* Displayed, and read by nothing above. The copy says so, because a
              reader deciding whether to trust this screen needs to know that the
              party being checked did not supply the answer. */}
          <Panel title={VERIFY.backendFlagHeading} note={VERIFY.backendFlagNote} padded>
            <p className="text-body text-primary">
              {outcome.backendVerifiedFlag === null
                ? VERIFY.backendFlagAbsent
                : outcome.backendVerifiedFlag
                  ? VERIFY.backendFlagTrue
                  : VERIFY.backendFlagFalse}
            </p>
          </Panel>
        </>
      )}

      {lastUpdatedAt === null ? null : (
        <p aria-live="polite" className="text-meta text-muted">
          Updated {new Date(lastUpdatedAt).toISOString().slice(11, 19)} UTC
        </p>
      )}
    </div>
  );
}
