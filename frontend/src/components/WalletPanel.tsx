'use client';

/**
 * =============================================================================
 * `WalletPanel` — connection, chain, and what gas is denominated in
 * =============================================================================
 *
 * Shared by both write screens. It renders the connection state and, when the
 * wallet is on the wrong network, the control to change it.
 *
 * NOTHING HERE PROMPTS ON MOUNT. The prompt lives behind a button; `useWallet`
 * reads existing authorization silently with `eth_accounts`. `WALLET.idleNote`
 * says so, because a reviewer who expects a wallet popup and gets none should know
 * that is deliberate rather than broken.
 *
 * THE WALLET ICONS ARE NOT RENDERED. EIP-6963 supplies a data-uri `icon` per
 * wallet and showing them would look better. They are omitted because they are
 * arbitrary remote-authored images injected by an extension, rendered on a page
 * that is about to ask for a signature — a wallet-shaped image is exactly what a
 * malicious extension would supply to impersonate a different wallet. The `rdns`
 * identity is text, and text cannot pretend to be a logo.
 *
 * THE GAS NOTE IS ALWAYS VISIBLE, not deferred to a failure. Gas on this chain is
 * USDC (Requirement 12.7), and nearly everyone assumes ETH. Saying so after a
 * transaction fails for want of gas is too late to be useful.
 */

import { ARC_TESTNET } from '@/lib/chain';
import { WALLET } from '@/content/copy';
import type { WalletState } from '@/hooks/useWallet';
import { Button } from '@/components/primitives/Button';
import { MachineValue } from '@/components/primitives/MachineValue';
import { Panel } from '@/components/primitives/Panel';

export function WalletPanel({ wallet }: { wallet: WalletState }) {
  const { available, account, chainId, onTargetChain, busy, problem, connect, switchChain } =
    wallet;

  return (
    <Panel title={WALLET.connectHeading} padded>
      <div className="flex flex-col gap-4">
        {account === null ? (
          <>
            <p className="text-meta text-muted max-w-[68ch]">{WALLET.idleNote}</p>

            {available.length === 0 ? (
              <p className="text-body text-muted max-w-[68ch]">{WALLET.noWallet}</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {available.map((candidate) => (
                  <Button
                    key={candidate.info.rdns}
                    variant="primary"
                    disabled={busy}
                    onClick={() => void connect(candidate)}
                  >
                    {WALLET.connectWith(candidate.info.name)}
                  </Button>
                ))}
              </div>
            )}
          </>
        ) : (
          <dl className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <dt className="text-caption text-muted uppercase">{WALLET.accountLabel}</dt>
              <dd>
                <MachineValue value={account} label="connected account" copyable />
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-caption text-muted uppercase">{WALLET.chainLabel}</dt>
              <dd className="text-record text-primary">
                {onTargetChain ? ARC_TESTNET.name : (chainId ?? 'Unknown')}
              </dd>
            </div>
          </dl>
        )}

        {account !== null && !onTargetChain ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-state-expired max-w-[68ch]">
              {WALLET.wrongChain(ARC_TESTNET.name)}
            </p>
            <Button variant="primary" disabled={busy} onClick={() => void switchChain()}>
              {WALLET.switchChain(ARC_TESTNET.name)}
            </Button>
          </div>
        ) : null}

        {/* Before a transaction is attempted, not after one fails. */}
        <p className="text-meta text-muted max-w-[68ch]">{WALLET.gasNote(ARC_TESTNET.name)}</p>

        {busy ? (
          <p aria-live="polite" className="text-meta text-muted">
            {WALLET.busy}
          </p>
        ) : null}

        {/* A user rejection never reaches here — `useWallet` treats declining as an
            answer rather than a fault, so `problem` stays null for code 4001. */}
        {problem === null ? null : (
          <p role="alert" className="text-body text-state-expired max-w-[68ch]">
            {problem}
          </p>
        )}
      </div>
    </Panel>
  );
}
