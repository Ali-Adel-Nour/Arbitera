'use client';

/**
 * =============================================================================
 * `SubmitDeliverable` — store the work, then commit its hash
 * =============================================================================
 *
 * The seller's half of the write path, and the same ordering rule as `CreateDeal`
 * for the same reason: the contract stores a digest, so text that was never written
 * down produces a commitment nobody can check. `buildSubmitDeliverable` demands a
 * `PersistedDeliverable`, so the signing control is unreachable until the store has
 * returned.
 *
 * ONE SIGNATURE, NOT TWO. No approval is involved — the seller moves no tokens, they
 * record a hash. That asymmetry is worth showing rather than smoothing over: the
 * buyer's side asks for two signatures because it moves money, and this side asks
 * for one because it does not.
 *
 * `computeDeliverableHash` IS THE SHARED FUNCTION, as `computeRubricHash` is on the
 * buyer's side. The verify panel recomputes with the same code, which is what makes
 * a submission made here checkable here.
 */

import { useCallback, useState } from 'react';

import { SUBMIT, WRITE_SHARED } from '@/content/copy';
import { computeDeliverableHash } from '@/lib/canonicalize';
import { buildSubmitDeliverable } from '@/lib/escrowWrite';
import { isNonZeroHex32 } from '@/lib/guards';
import { persistDeliverable } from '@/lib/localRecords';
import type { PersistedDeliverable } from '@/lib/persisted';
import { useSendTransaction } from '@/hooks/useSendTransaction';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/primitives/Button';
import { FieldSet } from '@/components/primitives/FieldSet';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';
import { WalletPanel } from '@/components/WalletPanel';

type FieldName = 'dealId' | 'deliverable';

export function SubmitDeliverable() {
  const wallet = useWallet();
  const tx = useSendTransaction();

  const [dealId, setDealId] = useState('');
  const [deliverable, setDeliverable] = useState('');

  const [stored, setStored] = useState<PersistedDeliverable | null>(null);
  const [deliverableHash, setDeliverableHash] = useState<string | null>(null);

  const [fault, setFault] = useState<{ field: FieldName; message: string } | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  /** Store first, hash what was stored. Same argument as on the buyer's side. */
  const store = useCallback(() => {
    if (!isNonZeroHex32(dealId.trim())) {
      setFault({ field: 'dealId', message: SUBMIT.validation.dealId });
      return;
    }
    if (deliverable.trim() === '') {
      setFault({ field: 'deliverable', message: SUBMIT.validation.deliverable });
      return;
    }

    setFault(null);

    const persisted = persistDeliverable(dealId.trim(), deliverable);
    if (persisted === null) {
      setUnavailable(
        'The deliverable could not be stored in this browser, so no signature will be requested. Committing to a hash whose text is not kept would produce a submission nobody can ever verify.',
      );
      return;
    }

    setUnavailable(null);
    setStored(persisted);
    setDeliverableHash(computeDeliverableHash({ deliverable: persisted }));
  }, [dealId, deliverable]);

  const submit = useCallback(async () => {
    const provider = wallet.selected?.provider;
    const account = wallet.account;
    if (provider === undefined || account === null || stored === null || deliverableHash === null) {
      return;
    }

    const built = buildSubmitDeliverable({
      dealId: dealId.trim(),
      deliverableHash,
      deliverable: stored,
    });

    if (!built.ok) {
      setUnavailable(built.unavailable.reason);
      return;
    }

    setUnavailable(null);
    await tx.send(provider, account, built.value);
  }, [wallet.selected, wallet.account, stored, deliverableHash, dealId, tx]);

  const faultFor = (field: FieldName): string | undefined =>
    fault?.field === field ? fault.message : undefined;

  const canSign =
    wallet.account !== null && wallet.onTargetChain && !tx.pending && stored !== null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-display text-hi max-w-[24ch]">{SUBMIT.heading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{SUBMIT.lede}</p>
        <p className="text-meta text-muted max-w-[68ch]">{SUBMIT.persistNote}</p>
      </header>

      <WalletPanel wallet={wallet} />

      <Panel title={SUBMIT.heading} padded>
        <div className="flex flex-col gap-6">
          <FieldSet
            id="submit-deal-id"
            label={SUBMIT.fields.dealId.label}
            hint={SUBMIT.fields.dealId.hint}
            machine
            error={faultFor('dealId')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={dealId}
                onChange={(event) => {
                  setDealId(event.target.value);
                  // A different deal means the stored evidence no longer applies.
                  setStored(null);
                  setDeliverableHash(null);
                }}
              />
            )}
          </FieldSet>

          <FieldSet
            id="submit-deliverable"
            label={SUBMIT.fields.deliverable.label}
            hint={SUBMIT.fields.deliverable.hint}
            error={faultFor('deliverable')}
          >
            {(props) => (
              <textarea
                {...props}
                rows={12}
                value={deliverable}
                onChange={(event) => {
                  setDeliverable(event.target.value);
                  // Editing invalidates the evidence, so the screen cannot commit a
                  // hash of the old text while displaying the new.
                  setStored(null);
                  setDeliverableHash(null);
                }}
              />
            )}
          </FieldSet>

          <div className="flex flex-col items-start gap-3">
            <Button onClick={store}>{SUBMIT.storeDeliverable}</Button>

            {deliverableHash === null ? null : (
              <div className="flex flex-col gap-2">
                <p className="text-body text-state-paid">{SUBMIT.deliverableStored}</p>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-muted uppercase">
                    {SUBMIT.deliverableHashLabel}
                  </span>
                  <MachineValue value={deliverableHash} label="deliverable hash" copyable />
                </div>
              </div>
            )}
          </div>

          {stored === null ? null : (
            <div className="flex flex-col items-start gap-2">
              <h3 className="text-caption text-muted uppercase">
                {WRITE_SHARED.reviewHeading}
              </h3>
              <p className="text-meta text-muted max-w-[68ch]">
                Records this deliverable’s hash against the deal on chain. No tokens
                move: the seller commits a digest, and settlement is the oracle’s
                step, not yours.
              </p>
              <Button variant="primary" disabled={!canSign} onClick={() => void submit()}>
                {SUBMIT.submitOnChain}
              </Button>
            </div>
          )}

          {unavailable === null ? null : (
            <p role="alert" className="text-body text-state-expired max-w-[68ch]">
              {unavailable}
            </p>
          )}

          {tx.problem === null ? null : (
            <p role="alert" className="text-body text-state-expired max-w-[68ch]">
              {tx.problem}
            </p>
          )}
        </div>
      </Panel>

      {tx.hash === null ? null : (
        <Panel title={WRITE_SHARED.sentHeading} note={WRITE_SHARED.sentNote} padded>
          <div className="flex flex-col gap-1">
            <span className="text-caption text-muted uppercase">{WRITE_SHARED.txLabel}</span>
            <MachineValue value={tx.hash} label="transaction hash" copyable />
          </div>
        </Panel>
      )}
    </div>
  );
}
