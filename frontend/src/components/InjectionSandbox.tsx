'use client';

/**
 * =============================================================================
 * `InjectionSandbox` — a reviewer attacks the judge, and reads the record
 * =============================================================================
 *
 * THE SCREEN'S HONESTY IS THE FIRST THING BUILT INTO IT. `SANDBOX.judgeNote`
 * renders above the form and states that no language model is called against the
 * bundled routes. A reviewer must not be able to leave here believing they defeated
 * a model's defences when they matched a regular expression. What the screen
 * demonstrates is the architectural claim — a deliverable is data, so an
 * instruction inside one is not followed — and that claim is true regardless of what
 * the evaluator is.
 *
 * THE RECORD IS SHOWN IN FULL, WITH ITS REAL HASHES. The judge route seals its
 * output with the same `sealRecord` the fixtures use, so the three hashes are
 * computed over the record's own material. That is why the verify link at the bottom
 * is worth having: a reviewer can take a record they just caused to exist and
 * recompute its hashes on the next screen.
 *
 * TWO SUBMIT PATHS, AND THE DIFFERENCE IS STATED. Judging touches no contract and
 * needs no credential. Settling relays through the pinned proxy that holds the
 * internal key server-side. Without that key the proxy answers 401 and names the
 * variable, and this component renders that as an ordinary error rather than as a
 * malfunction — a deployment that can judge but not settle is a sensible way to run
 * the demo.
 *
 * VALIDATION HAPPENS HERE BEFORE A REQUEST IS SPENT, and again on the server, which
 * is the authority. The client copy is a courtesy that saves a round trip; the
 * server's 400 carries a `field` and is rendered against the offending control
 * (Requirement 11.7). Where the two disagree the server wins, because it is the one
 * that decides.
 */

import { useCallback, useMemo, useState } from 'react';

import { SANDBOX, SANDBOX_PRESETS } from '@/content/copy';
import { errorCopy } from '@/lib/errorCopy';
import { instantLabel } from '@/lib/format';
import { isNonZeroHex32 } from '@/lib/guards';
import { postJudge, postJudgeAndSettle } from '@/services/api';
import { Button } from '@/components/primitives/Button';
import { ErrorState } from '@/components/primitives/ErrorState';
import { EvidenceExhibit } from '@/components/primitives/EvidenceExhibit';
import { FieldSet } from '@/components/primitives/FieldSet';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';
import { VerdictBanner } from '@/components/primitives/VerdictBanner';
import type { ApiError, AuditableVerdict, SettlementResult } from '@/types';

/** Days ahead the default deadline sits. Comfortably future, obviously arbitrary. */
const DEFAULT_DEADLINE_DAYS = 14;

/**
 * A fresh bytes32 identifier.
 *
 * `crypto.getRandomValues` rather than `Math.random`: this value is echoed into a
 * record, hashed, and — on the settling path — sent to a contract that rejects
 * collisions with `DealAlreadyExists`. A weak generator would make two reviewers
 * on the same deployment collide.
 */
function mintDealId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** An ISO instant `days` from now, to the second. */
function defaultDeadline(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 19) + 'Z';
}

/** Which control a server-side `field` refers to. */
type FieldName = 'dealId' | 'acceptanceCriteria' | 'deliverable' | 'deadline';

interface Outcome {
  verdict: AuditableVerdict;
  settlement: SettlementResult | null;
}

export function InjectionSandbox() {
  // Minted once per mount rather than per render, so editing another field does not
  // silently change the identifier under the reviewer.
  const [dealId, setDealId] = useState(mintDealId);
  // Annotated `string` rather than inferred. `SANDBOX_PRESETS` is `as const`, so
  // inference would narrow this state to the honest preset's literal type and the
  // injection preset would not be assignable to it. The state is editable free text;
  // its type is `string`.
  const [criteriaText, setCriteriaText] = useState<string>(
    SANDBOX_PRESETS.honest.criteria.join('\n'),
  );
  const [deliverable, setDeliverable] = useState<string>(SANDBOX_PRESETS.honest.deliverable);
  const [deadline, setDeadline] = useState<string>(() =>
    defaultDeadline(DEFAULT_DEADLINE_DAYS),
  );

  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(
    null,
  );

  const criteria = useMemo(
    () =>
      criteriaText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    [criteriaText],
  );

  const applyPreset = useCallback((preset: keyof typeof SANDBOX_PRESETS) => {
    setCriteriaText(SANDBOX_PRESETS[preset].criteria.join('\n'));
    setDeliverable(SANDBOX_PRESETS[preset].deliverable);
    // A preset fills the fields and nothing else. The result is left alone, so a
    // reviewer can load the second preset while still reading the first record.
    setFieldError(null);
  }, []);

  /** Client-side checks. The server repeats all of them and is the authority. */
  const localFault = useCallback((): { field: FieldName; message: string } | null => {
    if (!isNonZeroHex32(dealId)) {
      return { field: 'dealId', message: SANDBOX.validation.dealIdShape };
    }
    if (criteria.length === 0) {
      return { field: 'acceptanceCriteria', message: SANDBOX.validation.criteriaEmpty };
    }
    if (deliverable.trim() === '') {
      return { field: 'deliverable', message: SANDBOX.validation.deliverableEmpty };
    }
    if (!(Date.parse(deadline) > Date.now())) {
      return { field: 'deadline', message: SANDBOX.validation.deadlinePast };
    }
    return null;
  }, [dealId, criteria, deliverable, deadline]);

  const submit = useCallback(
    async (settle: boolean) => {
      const fault = localFault();
      if (fault !== null) {
        setFieldError(fault);
        return;
      }

      setFieldError(null);
      setError(null);
      setPending(true);

      const body = { dealId, acceptanceCriteria: criteria, deliverable, deadline };

      // The two calls are kept apart rather than unified behind a ternary result,
      // because their payloads differ and narrowing them separately means neither
      // needs an `as` cast — a cast here would be able to hide a real shape change.
      if (settle) {
        const result = await postJudgeAndSettle(body);
        setPending(false);

        if (!result.ok) {
          if (result.error.kind === 'bad-request' && result.error.field !== undefined) {
            setFieldError({
              field: result.error.field as FieldName,
              message: result.error.message,
            });
            return;
          }
          setError(result.error);
          return;
        }

        setOutcome({ verdict: result.data.verdict, settlement: result.data.settlement });
        return;
      }

      const result = await postJudge(body);

      setPending(false);

      if (!result.ok) {
        // A 400 naming a field is rendered against that control; anything else is
        // a panel. Requirement 11.7.
        if (result.error.kind === 'bad-request' && result.error.field !== undefined) {
          setFieldError({
            field: result.error.field as FieldName,
            message: result.error.message,
          });
          return;
        }
        setError(result.error);
        return;
      }

      setOutcome({ verdict: result.data, settlement: null });
    },
    [localFault, dealId, criteria, deliverable, deadline],
  );

  const faultFor = (field: FieldName): string | undefined =>
    fieldError?.field === field ? fieldError.message : undefined;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-display text-hi max-w-[24ch]">{SANDBOX.heading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{SANDBOX.lede}</p>
        {/* Before the form, before a conclusion can be formed. */}
        <p className="text-meta text-muted max-w-[68ch]">{SANDBOX.judgeNote}</p>
      </header>

      <Panel title={SANDBOX.formHeading} padded>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            // The default submit would reload the page and lose the record.
            event.preventDefault();
            void submit(false);
          }}
        >
          <div className="flex flex-col gap-2">
            <span className="text-caption text-muted uppercase">{SANDBOX.presetsLabel}</span>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => applyPreset('honest')}>{SANDBOX.presetHonest}</Button>
              <Button onClick={() => applyPreset('injection')}>
                {SANDBOX.presetInjection}
              </Button>
            </div>
            <p className="text-meta text-muted max-w-[68ch]">{SANDBOX.presetNote}</p>
          </div>

          {/* `machine` — a bytes32 identifier is compared character by character,
              which is the whole reason this file may use the mono family. */}
          <FieldSet
            id="sandbox-deal-id"
            label={SANDBOX.fields.dealId.label}
            hint={SANDBOX.fields.dealId.hint}
            machine
            error={faultFor('dealId')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={dealId}
                onChange={(event) => setDealId(event.target.value)}
              />
            )}
          </FieldSet>

          <FieldSet
            id="sandbox-criteria"
            label={SANDBOX.fields.criteria.label}
            hint={SANDBOX.fields.criteria.hint}
            error={faultFor('acceptanceCriteria')}
          >
            {(props) => (
              <textarea
                {...props}
                rows={4}
                value={criteriaText}
                onChange={(event) => setCriteriaText(event.target.value)}
              />
            )}
          </FieldSet>

          <FieldSet
            id="sandbox-deliverable"
            label={SANDBOX.fields.deliverable.label}
            hint={SANDBOX.fields.deliverable.hint}
            error={faultFor('deliverable')}
          >
            {(props) => (
              <textarea
                {...props}
                rows={10}
                value={deliverable}
                onChange={(event) => setDeliverable(event.target.value)}
              />
            )}
          </FieldSet>

          <FieldSet
            id="sandbox-deadline"
            label={SANDBOX.fields.deadline.label}
            hint={SANDBOX.fields.deadline.hint}
            machine
            error={faultFor('deadline')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
            )}
          </FieldSet>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? SANDBOX.pending : SANDBOX.submitJudge}
              </Button>
              <Button onClick={() => void submit(true)} disabled={pending}>
                {SANDBOX.submitJudgeAndSettle}
              </Button>
            </div>
            <p className="text-meta text-muted max-w-[68ch]">{SANDBOX.submitNote}</p>
          </div>
        </form>
      </Panel>

      {error === null ? null : (
        <ErrorState
          cause={errorCopy(error).cause}
          recovery={errorCopy(error).recovery}
          onRetry={() => void submit(false)}
          retryLabel="Judge without settling"
        />
      )}

      <section aria-labelledby="result-heading" className="flex flex-col gap-4">
        <h2 id="result-heading" className="text-heading text-hi">
          {SANDBOX.resultHeading}
        </h2>

        {outcome === null ? (
          <Panel title={SANDBOX.resultHeading} padded>
            <p className="text-body text-muted max-w-[60ch]">{SANDBOX.emptyResult}</p>
          </Panel>
        ) : (
          <div className="flex flex-col gap-4">
            <VerdictBanner
              outcome={outcome.verdict.verdict}
              settlement={
                outcome.settlement === null ? 'Not settled — judged only' : 'Settled on chain'
              }
              // No escrow was funded on this path, so there is no amount that moved.
              // Zero is the honest figure: the judging route touches no contract.
              amount="0"
              isFresh
            />

            <p className="text-body text-muted max-w-[68ch]">
              {outcome.verdict.approved ? SANDBOX.approvedNote : SANDBOX.refusedNote}
            </p>

            <EvidenceExhibit label="Reasoning" membership="hashed">
              {outcome.verdict.reasoning}
            </EvidenceExhibit>

            <EvidenceExhibit label="Evaluation prompt" membership="hashed" kind="transcript">
              {outcome.verdict.evaluationPrompt}
            </EvidenceExhibit>

            <EvidenceExhibit label="Raw response" membership="hashed" kind="transcript">
              {outcome.verdict.rawResponse}
            </EvidenceExhibit>

            <Panel title="Commitments">
              <div className="flex flex-col">
                {(
                  [
                    ['Rubric hash', outcome.verdict.rubricHash],
                    ['Deliverable hash', outcome.verdict.deliverableHash],
                    ['Verdict hash', outcome.verdict.verdictHash],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rule-record flex flex-col gap-1 px-4 py-3 md:px-5">
                    <span className="text-caption text-muted uppercase">{label}</span>
                    <MachineValue value={value} label={label} copyable />
                  </div>
                ))}

                <div className="rule-record flex flex-col gap-1 px-4 py-3 md:px-5">
                  <span className="text-caption text-muted uppercase">Recorded at</span>
                  <span className="text-record text-primary">
                    {instantLabel(outcome.verdict.timestamp)}
                  </span>
                </div>

                {/* NO LINK TO THE VERIFY PANEL, and the reason is worth stating.
                    These three hashes are real — the judge route seals its record
                    with the same function the fixtures use — but this deal was
                    never registered or funded, so there is no on-chain commitment
                    to compare them against. The verify panel needs a third source
                    and would answer with a not-found error. `lib/settlementLink.ts`
                    spends a module refusing to link at a page that cannot exist;
                    the same rule applies to a link this component would control. */}
                <p className="text-meta text-muted max-w-[68ch] px-4 py-4 md:px-5">
                  {SANDBOX.noChainSide}
                </p>
              </div>
            </Panel>

            {outcome.settlement === null ? null : (
              <Panel title={SANDBOX.settlementHeading} note={SANDBOX.settlementNote}>
                <div className="flex flex-col">
                  <div className="rule-record flex flex-col gap-1 px-4 py-3 md:px-5">
                    <span className="text-caption text-muted uppercase">Transaction</span>
                    <MachineValue
                      value={outcome.settlement.transactionHash}
                      label="settlement transaction hash"
                      copyable
                    />
                  </div>
                  <div className="rule-record flex flex-col gap-1 px-4 py-3 md:px-5">
                    <span className="text-caption text-muted uppercase">
                      Reasoning hash committed
                    </span>
                    <MachineValue
                      value={outcome.settlement.reasoningHash}
                      label="committed reasoning hash"
                      copyable
                    />
                  </div>
                </div>
              </Panel>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
