'use client';

/**
 * =============================================================================
 * `CreateDeal` — store the criteria, then sign twice
 * =============================================================================
 *
 * THE ORDERING IS ENFORCED BY A TYPE, NOT BY THIS COMPONENT'S DISCIPLINE. The
 * signing controls need a `PersistedCriteria`, which only `persistCriteria` can
 * produce, so there is no arrangement of this JSX that reaches a signature with
 * unstored text. The escrow commits to a hash and not the text, so a deal whose
 * criteria were never written down is permanently unauditable — by everyone,
 * including its author. That is why the guarantee is structural.
 *
 * THE HASH IS COMPUTED BY `computeRubricHash`, the same function the verify panel
 * recomputes with. This is the join between the write path and the audit path: if
 * this screen computed its own digest, a deal created here could fail verification
 * here, and the two halves of the application would disagree about the same bytes.
 *
 * TWO SIGNATURES, NAMED SEPARATELY. An approval and a create-and-fund. Each has a
 * sentence saying what it authorizes, rendered BEFORE its button. The approval is
 * for exactly this deal's amount — `buildApproval` refuses to build an unlimited
 * one — and the copy says so, because "approve" in a wallet dialog looks identical
 * whether the allowance is one dollar or unlimited.
 *
 * THE DEAL IDENTIFIER IS MINTED, NOT ASKED FOR. It is 32 bytes of randomness with
 * no meaning; asking a person to invent one invites collisions the contract rejects
 * with `DealAlreadyExists` after they have already paid gas.
 */

import { useCallback, useMemo, useState } from 'react';

import { CREATE, WRITE_SHARED } from '@/content/copy';
import { computeRubricHash } from '@/lib/canonicalize';
import {
  buildApproval,
  buildCreateAndFund,
  toBaseUnits,
  type UnsignedCall,
} from '@/lib/escrowWrite';
import { formatUsdc } from '@/lib/format';
import { persistCriteria } from '@/lib/localRecords';
import type { PersistedCriteria } from '@/lib/persisted';
import { useSendTransaction } from '@/hooks/useSendTransaction';
import { useWallet } from '@/hooks/useWallet';
import { Button } from '@/components/primitives/Button';
import { FieldSet } from '@/components/primitives/FieldSet';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';
import { WalletPanel } from '@/components/WalletPanel';

/** Twenty bytes of hex. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** A fresh 32-byte identifier. See the note above on why this is not an input. */
function mintDealId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

type FieldName = 'seller' | 'amount' | 'criteria' | 'duration';

export function CreateDeal() {
  const wallet = useWallet();
  const tx = useSendTransaction();

  const [dealId] = useState(mintDealId);
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [duration, setDuration] = useState('604800');

  /**
   * The evidence that the criteria were stored. `null` until they are, and the
   * signing controls are unreachable while it is `null`.
   */
  const [stored, setStored] = useState<PersistedCriteria | null>(null);
  const [criteriaHash, setCriteriaHash] = useState<string | null>(null);

  const [fault, setFault] = useState<{ field: FieldName; message: string } | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const criteria = useMemo(
    () =>
      criteriaText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    [criteriaText],
  );

  const baseUnits = useMemo(() => (amount.trim() === '' ? null : toBaseUnits(amount)), [amount]);

  /**
   * Store the text, then hash what was stored.
   *
   * The hash is computed from `persistCriteria`'s RETURN VALUE rather than from the
   * local array, so the digest commits to the bytes that were actually kept. If
   * the store ever normalises anything, this is what keeps the commitment and the
   * record in agreement.
   */
  const store = useCallback(() => {
    if (criteria.length === 0) {
      setFault({ field: 'criteria', message: CREATE.validation.criteria });
      return;
    }

    setFault(null);

    const persisted = persistCriteria(dealId, criteria);
    if (persisted === null) {
      setUnavailable(
        'The criteria could not be stored in this browser, so no signature will be requested. Committing to a hash whose text is not kept would produce a deal nobody can ever verify.',
      );
      return;
    }

    setUnavailable(null);
    setStored(persisted);
    setCriteriaHash(computeRubricHash({ acceptanceCriteria: [...persisted] }));
  }, [criteria, dealId]);

  /** Validate everything the transaction needs. */
  const validate = useCallback((): { field: FieldName; message: string } | null => {
    if (!ADDRESS.test(seller.trim())) {
      return { field: 'seller', message: CREATE.validation.seller };
    }
    if (baseUnits === null || baseUnits <= 0n) {
      return { field: 'amount', message: CREATE.validation.amount };
    }
    if (!/^\d+$/.test(duration.trim()) || Number(duration) <= 0) {
      return { field: 'duration', message: CREATE.validation.duration };
    }
    return null;
  }, [seller, baseUnits, duration]);

  /** Send one of the two calls, after checking the inputs it depends on. */
  const sign = useCallback(
    async (build: () => ReturnType<typeof buildApproval>) => {
      const provider = wallet.selected?.provider;
      const account = wallet.account;
      if (provider === undefined || account === null) return;

      const invalid = validate();
      if (invalid !== null) {
        setFault(invalid);
        return;
      }
      setFault(null);

      const built = build();
      if (!built.ok) {
        setUnavailable(built.unavailable.reason);
        return;
      }

      setUnavailable(null);
      await tx.send(provider, account, built.value);
    },
    [wallet.selected, wallet.account, validate, tx],
  );

  const faultFor = (field: FieldName): string | undefined =>
    fault?.field === field ? fault.message : undefined;

  const canSign = wallet.account !== null && wallet.onTargetChain && !tx.pending;

  /** Built only to show what a button would authorize, before it is pressed. */
  const preview: UnsignedCall | null = useMemo(() => {
    if (stored === null || criteriaHash === null || baseUnits === null) return null;
    const built = buildCreateAndFund({
      dealId,
      seller: seller.trim(),
      amountBaseUnits: baseUnits,
      criteriaHash,
      durationSeconds: Number(duration),
      criteria: stored,
    });
    return built.ok ? built.value : null;
  }, [stored, criteriaHash, baseUnits, dealId, seller, duration]);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-display text-hi max-w-[24ch]">{CREATE.heading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{CREATE.lede}</p>
        <p className="text-meta text-muted max-w-[68ch]">{CREATE.persistNote}</p>
      </header>

      <WalletPanel wallet={wallet} />

      <Panel title={CREATE.heading} padded>
        <div className="flex flex-col gap-6">
          <FieldSet
            id="create-deal-id"
            label="Deal identifier"
            hint="Minted here as 32 bytes of randomness. It carries no meaning, and inventing one by hand risks a collision the contract rejects after you have paid gas."
            machine
          >
            {(props) => <input {...props} type="text" value={dealId} readOnly />}
          </FieldSet>

          <FieldSet
            id="create-seller"
            label={CREATE.fields.seller.label}
            hint={CREATE.fields.seller.hint}
            machine
            error={faultFor('seller')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                value={seller}
                onChange={(event) => setSeller(event.target.value)}
              />
            )}
          </FieldSet>

          <FieldSet
            id="create-amount"
            label={CREATE.fields.amount.label}
            hint={CREATE.fields.amount.hint}
            error={faultFor('amount')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            )}
          </FieldSet>

          {/* Echoed back in base units, because that is what gets signed. A reader
              should see the integer the contract will receive, not only the decimal
              they typed. */}
          {baseUnits === null ? null : (
            <p className="text-meta text-muted">
              Signs as {baseUnits.toString()} base units, which is {formatUsdc(baseUnits.toString())}.
            </p>
          )}

          <FieldSet
            id="create-criteria"
            label={CREATE.fields.criteria.label}
            hint={CREATE.fields.criteria.hint}
            error={faultFor('criteria')}
          >
            {(props) => (
              <textarea
                {...props}
                rows={5}
                value={criteriaText}
                onChange={(event) => {
                  setCriteriaText(event.target.value);
                  // Editing invalidates the stored evidence. Without this the screen
                  // could sign a hash of the OLD text while showing the new — the
                  // exact divergence the persistence rule exists to prevent.
                  setStored(null);
                  setCriteriaHash(null);
                }}
              />
            )}
          </FieldSet>

          <FieldSet
            id="create-duration"
            label={CREATE.fields.duration.label}
            hint={CREATE.fields.duration.hint}
            error={faultFor('duration')}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            )}
          </FieldSet>

          {/* Step one, always. The signing controls do not exist until this
              produces a branded value. */}
          <div className="flex flex-col items-start gap-3">
            <Button onClick={store}>{CREATE.storeCriteria}</Button>

            {criteriaHash === null ? null : (
              <div className="flex flex-col gap-2">
                <p className="text-body text-state-paid">{CREATE.criteriaStored}</p>
                <p className="text-meta text-muted max-w-[68ch]">{CREATE.hashNote}</p>
                <div className="flex flex-col gap-1">
                  <span className="text-caption text-muted uppercase">
                    {CREATE.criteriaHashLabel}
                  </span>
                  <MachineValue value={criteriaHash} label="criteria hash" copyable />
                </div>
              </div>
            )}
          </div>

          {stored === null || baseUnits === null ? null : (
            <div className="flex flex-col gap-4">
              <h3 className="text-caption text-muted uppercase">
                {WRITE_SHARED.reviewHeading}
              </h3>

              <div className="flex flex-col items-start gap-2">
                <p className="text-meta text-muted max-w-[68ch]">
                  {buildApproval(baseUnits).ok
                    ? 'Permits the escrow contract to move exactly this deal’s amount, and no more. Not an unlimited approval.'
                    : ''}
                </p>
                <Button
                  variant="primary"
                  disabled={!canSign}
                  onClick={() => void sign(() => buildApproval(baseUnits))}
                >
                  {CREATE.approve}
                </Button>
              </div>

              {preview === null ? null : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-meta text-muted max-w-[68ch]">{preview.summary}</p>
                  <Button
                    variant="primary"
                    disabled={!canSign}
                    onClick={() =>
                      void sign(() =>
                        buildCreateAndFund({
                          dealId,
                          seller: seller.trim(),
                          amountBaseUnits: baseUnits,
                          criteriaHash: criteriaHash ?? '',
                          durationSeconds: Number(duration),
                          criteria: stored,
                        }),
                      )
                    }
                  >
                    {CREATE.createAndFund}
                  </Button>
                </div>
              )}
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
