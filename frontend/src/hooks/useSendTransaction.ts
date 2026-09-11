'use client';

/**
 * =============================================================================
 * `src/hooks/useSendTransaction.ts` — one signature at a time
 * =============================================================================
 *
 * `eth_sendTransaction` through the selected EIP-6963 provider. Shared by both
 * write screens so the rejection handling and the one-at-a-time guarantee exist
 * once.
 *
 * A REJECTION CLEARS AND SAYS NOTHING. Code 4001 is the user declining, which is a
 * valid answer. An error panel reading "transaction failed" after someone chose to
 * cancel is the interface arguing with them.
 *
 * ONE OUTSTANDING REQUEST. `pending` gates the caller's button. Two overlapping
 * wallet popups is a state MetaMask handles badly and a user cannot reason about —
 * they see two dialogs and cannot tell which is which.
 *
 * A HASH IS NOT A RECEIPT, and the copy that renders this says so. `eth_send-
 * Transaction` resolves when the transaction is BROADCAST. It can still revert.
 * This hook deliberately does NOT wait for a receipt: doing so would make the
 * button spin for however long the chain takes, and the honest thing is to hand
 * back the hash and let the docket show the result when it lands.
 */

import { useCallback, useState } from 'react';

import type { Eip1193Provider } from '@/lib/eip6963';
import type { UnsignedCall } from '@/lib/escrowWrite';

/** EIP-1193: the user declined. */
const USER_REJECTED = 4001;

function providerCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'number' ? code : null;
}

/**
 * A revert reason the wallet surfaced, when it did.
 *
 * Shown verbatim rather than paraphrased. The contract's ten named errors carry
 * real diagnostic content — `DealAlreadyExists` and `DeadlinePassed` mean very
 * different things — and `lib/errorCopy.ts` already maps those names to sentences
 * for the read path. Rewriting the message here would put a second author between
 * the contract and the reader.
 */
function revertMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() !== '' ? message : null;
}

export interface SendTransactionResult {
  /** The broadcast transaction hash, or `null` before one exists. */
  hash: string | null;

  /** A request is open in the wallet. */
  pending: boolean;

  /** A failure sentence, or `null`. Stays `null` when the user declined. */
  problem: string | null;

  /** Sign and broadcast. Resolves to the hash, or `null` on rejection or failure. */
  send: (provider: Eip1193Provider, from: string, call: UnsignedCall) => Promise<string | null>;

  /** Clear the last hash and failure, for a screen starting a second transaction. */
  reset: () => void;
}

export function useSendTransaction(): SendTransactionResult {
  const [hash, setHash] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const send = useCallback(
    async (
      provider: Eip1193Provider,
      from: string,
      call: UnsignedCall,
    ): Promise<string | null> => {
      setPending(true);
      setProblem(null);

      try {
        const result = await provider.request({
          method: 'eth_sendTransaction',
          // No `gas` and no `value`. Gas is the wallet's estimate to make — an
          // estimate from here would be a guess that could strand a transaction —
          // and these calls move ERC-20 tokens, so the native value is zero.
          params: [{ from, to: call.to, data: call.data }],
        });

        if (typeof result !== 'string') {
          setProblem('The wallet did not return a transaction hash.');
          return null;
        }

        setHash(result);
        return result;
      } catch (error) {
        if (providerCode(error) === USER_REJECTED) return null;

        const detail = revertMessage(error);
        setProblem(
          detail === null
            ? 'The wallet could not send the transaction.'
            : `The wallet could not send the transaction. It reported: ${detail}`,
        );
        return null;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setHash(null);
    setProblem(null);
  }, []);

  return { hash, pending, problem, send, reset };
}
