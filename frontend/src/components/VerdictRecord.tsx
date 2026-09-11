'use client';

/**
 * =============================================================================
 * `VerdictRecord` — one deal, its verdict, and the exhibits behind it
 * =============================================================================
 *
 * THE READING ORDER IS THE ARGUMENT. Verdict first, then the lifecycle, then the
 * terms the chain holds, then the evidence, then the commitments. A reviewer
 * arriving from the docket wants the outcome immediately; a reviewer checking the
 * outcome works downward from it into the material it was drawn from. Putting the
 * exhibits first would make the screen read as a document dump with a conclusion
 * buried at the end.
 *
 * THE VERDICT BANNER IS THE ONLY LOUD THING, and it is the only thing on this
 * screen allowed to be. Everything below it is the same panel treatment at the
 * same weight, because ranking the exhibits by visual prominence would be this
 * interface deciding which evidence matters — which is the reviewer's job.
 *
 * "TAMPER-EVIDENT" IS NOT SAID HERE AT ALL. This screen displays the stored
 * record and the hashes stored with it. It does not compare them, so it must not
 * imply agreement. The comparison is the verify panel's, and the link at the
 * bottom hands off to it. A record screen that said "verified" while doing no
 * verification would be the exact failure the whole vocabulary exists to prevent.
 *
 * AN UNJUDGED DEAL IS NOT AN ERROR. Most deals on a live docket have no verdict
 * yet. The terms and the lifecycle still render, and the evidence region says why
 * it is empty. Only a failed DEAL request produces an error panel.
 */

import Link from 'next/link';

import { DEAL } from '@/content/copy';
import { deriveDisplayState } from '@/lib/deriveState';
import { errorCopy } from '@/lib/errorCopy';
import { deadlineLabel, formatUsdc, instantLabel } from '@/lib/format';
import { settlementReference } from '@/lib/settlementLink';
import { useDealRecord } from '@/hooks/useDealRecord';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ErrorState } from '@/components/primitives/ErrorState';
import { EvidenceExhibit } from '@/components/primitives/EvidenceExhibit';
import { LifecycleRail } from '@/components/primitives/LifecycleRail';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';
import { StateChip } from '@/components/primitives/StateChip';
import { VerdictBanner } from '@/components/primitives/VerdictBanner';
import type { DisplayState, EscrowDeal } from '@/types';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** The three terminal states, for the lifecycle rail's endpoint. */
function terminalOf(state: DisplayState) {
  return state === 'ResolvedSuccess' || state === 'ResolvedRefund' || state === 'ExpiredRefund'
    ? state
    : null;
}

/**
 * Who the money went to, in words.
 *
 * Derived from the on-chain state rather than from the verdict, because the state
 * is what actually happened. A `PASS` verdict on a deal the oracle never settled
 * has not paid anybody, and saying "seller paid" there would describe an intention
 * as an event.
 */
function settlementSentence(deal: EscrowDeal): string {
  if (deal.state === 'ResolvedSuccess') return 'Seller paid';
  if (deal.state === 'ResolvedRefund') return 'Buyer refunded';
  if (deal.state === 'ExpiredRefund') return 'Refundable to buyer';
  return 'Not yet settled';
}

/** A labelled term in the deal-terms list. */
function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rule-record flex flex-col gap-1 px-4 py-3 md:px-5">
      <dt className="text-caption text-muted uppercase">{label}</dt>
      <dd className="text-record text-primary">{children}</dd>
    </div>
  );
}

export function VerdictRecord({ dealId }: { dealId: string }) {
  const { data, error, lastUpdatedAt, refetch } = useDealRecord(dealId);

  // Only a failed deal request blanks the screen, and only before anything has
  // loaded. Once `data` exists, `usePolling` keeps it through a failure and the
  // error panel renders above the record instead of replacing it.
  if (data === null) {
    return error === null ? (
      <p className="text-body text-muted">{DEAL.loading}</p>
    ) : (
      <ErrorState
        cause={errorCopy(error).cause}
        recovery={errorCopy(error).recovery}
        onRetry={refetch}
        retryLabel="Request the record again"
      />
    );
  }

  const { deal, judgment } = data;
  const state = deriveDisplayState(deal, judgment);

  /**
   * A settlement transaction is shown only when the deal actually reached a
   * terminal state, regardless of whether the payload carries a hash.
   *
   * The guard is not defensive padding: the bundled fixtures emit
   * `resolvedTransactionHash` on every phase of the two deals that eventually
   * resolve, so without this check a `Submitted` deal renders a settlement
   * reference for a settlement that has not happened. The fixture is being fixed
   * separately, but the interface should not depend on a producer getting this
   * right — the state is what the contract actually says, and it is the field to
   * trust when the two disagree.
   */
  const settledOnChain = terminalOf(state) !== null;
  const txHash = settledOnChain ? deal.resolvedTransactionHash : undefined;
  const settlement = settlementReference(txHash ?? '');

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
        <div className="flex flex-col gap-2">
          <h1 className="text-screen text-hi">{DEAL.heading}</h1>
          <MachineValue value={deal.dealId} label="deal identifier" copyable />
        </div>
        <StateChip state={state} />
      </header>

      {/* The one loud region. Absent when there is no verdict — a banner with a
          placeholder outcome would be the screen inventing a ruling. */}
      {judgment === null ? null : (
        <VerdictBanner
          outcome={judgment.verdict}
          settlement={settlementSentence(deal)}
          amount={deal.amount}
        />
      )}

      <Panel title={DEAL.lifecycleHeading} padded>
        <LifecycleRail current={state} terminal={terminalOf(state)} />
      </Panel>

      <Panel title={DEAL.termsHeading} note={DEAL.termsNote}>
        <dl className="flex flex-col">
          <Term label="Amount">
            <span className="tabular-nums">{formatUsdc(deal.amount)}</span>
          </Term>
          <Term label="Buyer">
            <MachineValue value={deal.buyer} label="buyer address" copyable />
          </Term>
          <Term label="Seller">
            <MachineValue value={deal.seller} label="seller address" copyable />
          </Term>
          <Term label="Token">
            <MachineValue value={deal.token} label="token address" copyable />
          </Term>
          <Term label="Deadline">{deadlineLabel(deal.deadline)}</Term>
          <Term label="Criteria hash">
            <MachineValue value={deal.criteriaHash} label="criteria hash" copyable />
          </Term>
        </dl>
      </Panel>

      <section aria-labelledby="evidence-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="evidence-heading" className="text-heading text-hi">
            {DEAL.evidenceHeading}
          </h2>
          <p className="text-meta text-muted max-w-[68ch]">{DEAL.evidenceNote}</p>
        </div>

        {judgment === null ? (
          <Panel title={DEAL.evidenceHeading}>
            <EmptyState condition={DEAL.noJudgment} />
          </Panel>
        ) : (
          <div className="flex flex-col gap-4">
            <EvidenceExhibit
              label={DEAL.exhibits.criteria.label}
              membership="hashed"
              note={DEAL.exhibits.criteria.note}
            >
              {/* An ordered list, because the order is part of the agreement and
                  the hash preserves it. A joined paragraph would lose the one
                  property the canonicalizer guarantees about this field. */}
              <ol className="flex flex-col gap-2">
                {judgment.acceptanceCriteria.map((criterion, index) => (
                  <li key={`${index}-${criterion}`} className="flex gap-3">
                    <span className="text-muted tabular-nums">{index + 1}.</span>
                    <span>{criterion}</span>
                  </li>
                ))}
              </ol>
            </EvidenceExhibit>

            <EvidenceExhibit
              label={DEAL.exhibits.deliverable.label}
              membership="hashed"
              note={DEAL.exhibits.deliverable.note}
            >
              {judgment.deliverable}
            </EvidenceExhibit>

            <EvidenceExhibit
              label={DEAL.exhibits.reasoning.label}
              membership="hashed"
              note={DEAL.exhibits.reasoning.note}
            >
              {judgment.reasoning}
            </EvidenceExhibit>

            <EvidenceExhibit
              label={DEAL.exhibits.prompt.label}
              membership="hashed"
              kind="transcript"
              note={DEAL.exhibits.prompt.note}
            >
              {judgment.evaluationPrompt}
            </EvidenceExhibit>

            <EvidenceExhibit
              label={DEAL.exhibits.response.label}
              membership="hashed"
              kind="transcript"
              note={DEAL.exhibits.response.note}
            >
              {judgment.rawResponse}
            </EvidenceExhibit>

            <EvidenceExhibit
              label={DEAL.exhibits.model.label}
              membership="hashed"
              note={DEAL.exhibits.model.note}
            >
              <MachineValue
                value={`${judgment.modelId}@${judgment.modelVersion}`}
                label="model identity and version"
              />
            </EvidenceExhibit>

            {/* The one excluded exhibit. Its dashed rule is the vocabulary saying
                what the note says in words. */}
            <EvidenceExhibit
              label={DEAL.exhibits.recordedAt.label}
              membership="excluded"
              note={DEAL.exhibits.recordedAt.note}
            >
              {instantLabel(judgment.timestamp)}
            </EvidenceExhibit>
          </div>
        )}
      </section>

      {judgment === null ? null : (
        <Panel title={DEAL.hashesHeading} note={DEAL.hashesNote}>
          <dl className="flex flex-col">
            <Term label="Rubric hash">
              <MachineValue value={judgment.rubricHash} label="rubric hash" copyable />
            </Term>
            <Term label="Deliverable hash">
              <MachineValue
                value={judgment.deliverableHash}
                label="deliverable hash"
                copyable
              />
            </Term>
            <Term label="Verdict hash">
              <MachineValue value={judgment.verdictHash} label="verdict hash" copyable />
            </Term>
          </dl>

          {/* The handoff. This screen displays the commitments; it does not
              compare them, which is why it never says "verified". The comparison
              is one route away and the reader is told where. */}
          <p className="text-body px-4 py-4 md:px-5">
            <Link
              href={`/deals/${encodeURIComponent(deal.dealId)}/verify`}
              className={`text-accent-text underline decoration-1 underline-offset-4 ${FOCUS}`}
            >
              {DEAL.verifyLinkLabel}
            </Link>
          </p>
        </Panel>
      )}

      <Panel title={DEAL.settlementHeading}>
        {txHash === undefined ? (
          <EmptyState condition={DEAL.settlementPending} />
        ) : settlement.kind === 'link' ? (
          <p className="text-body px-4 py-4 md:px-5">
            <Link
              href={settlement.href}
              className={`text-accent-text underline decoration-1 underline-offset-4 ${FOCUS}`}
            >
              {DEAL.settlementLinkLabel}
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2 px-4 py-4 md:px-5">
            <MachineValue
              value={settlement.hash}
              label="settlement transaction hash"
              copyable
            />
            <p className="text-meta text-muted max-w-[68ch]">{DEAL.settlementNoExplorer}</p>
          </div>
        )}
      </Panel>

      {lastUpdatedAt === null ? null : (
        <p aria-live="polite" className="text-meta text-muted">
          Updated {new Date(lastUpdatedAt).toISOString().slice(11, 19)} UTC
        </p>
      )}
    </div>
  );
}
