/**
 * =============================================================================
 * `src/lib/escrowWrite.ts` — the two transactions this interface can build
 * =============================================================================
 *
 * TWO, AND ONLY TWO. A buyer creates and funds an escrow; a seller submits a
 * deliverable. The contract has other entry points and this interface encodes
 * none of them, because the oracle owns settlement and a refund claim — those are
 * the backend's key, not a browser's. `check-copy.mjs` enforces the absence by
 * name, so the restriction cannot erode by someone adding "just one more" call.
 *
 * THE ABI IS A HUMAN-READABLE FRAGMENT LIST, NOT AN IMPORTED ARTIFACT. Four
 * signatures written out in full, which a reviewer can check against the contract
 * source in seconds. Importing a compiled artifact from the blockchain workspace
 * would couple this build to that one and pull a large JSON file into a client
 * bundle to use four of its entries.
 *
 * `criteriaHash` AND `deliverableHash` ARE `string`, NOT `bytes32`, and that is
 * the contract's own choice — it stores them as strings so an IPFS CID fits. The
 * hex digest this interface computes goes in as its `0x…` text. Encoding it as
 * `bytes32` would produce a different commitment than the one the backend's
 * record hashes to, and the verify panel would report a mismatch on an untouched
 * deal.
 *
 * THE APPROVAL IS EXACT, NOT INFINITE. `approve(escrow, amount)` for the amount
 * of this one deal. An unlimited approval is the convenient version and it leaves
 * a standing permission to move every USDC in the wallet — on a demo whose whole
 * argument is careful custody, that would be indefensible.
 *
 * NO ADDRESS IS WRITTEN DOWN HERE. Both come from `lib/env.ts`, and absence is
 * reported rather than defaulted. `check-copy.mjs` also forbids a 40-hex literal
 * outside the fixtures, which is the mechanical half of the same rule.
 */

import { Interface, parseUnits } from 'ethers';

import { USDC_DECIMALS } from '@/lib/chain';
import { env } from '@/lib/env';
import type { PersistedCriteria, PersistedDeliverable } from '@/lib/persisted';

/**
 * The four signatures used, written out.
 *
 * `createAndFundEscrow` does both halves in one call, so a buyer signs twice in
 * total — once to approve, once to create and fund — rather than three times.
 */
const ESCROW_ABI = [
  'function createAndFundEscrow(bytes32 dealId, address seller, address token, uint256 amount, string criteriaHash, uint256 durationSeconds)',
  'function submitDeliverable(bytes32 dealId, string deliverableHash)',
] as const;

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;

const escrowInterface = new Interface(ESCROW_ABI);
const erc20Interface = new Interface(ERC20_ABI);

/** A transaction ready for `eth_sendTransaction`. */
export interface UnsignedCall {
  to: string;
  data: string;
  /** What this call does, for the confirmation copy beside the button. */
  summary: string;
}

/** Configuration absent, so no transaction can be built. */
export interface WriteUnavailable {
  reason: string;
}

export type BuildResult<T> = { ok: true; value: T } | { ok: false; unavailable: WriteUnavailable };

/** The two addresses, or a sentence naming what is missing. */
function addresses(): BuildResult<{ escrow: string; token: string }> {
  const escrow = env.escrowAddress;
  const token = env.usdcAddress;

  if (escrow === null) {
    return {
      ok: false,
      unavailable: {
        reason:
          'No escrow contract address is configured for this deployment, so no transaction can be built. Set NEXT_PUBLIC_ESCROW_ADDRESS. Nothing is guessed here: an address baked into the interface outlives its deployment, and an approval signed to a stale escrow cannot be taken back.',
      },
    };
  }

  if (token === null) {
    return {
      ok: false,
      unavailable: {
        reason:
          'No USDC token address is configured for this deployment, so an approval cannot be built. Set NEXT_PUBLIC_USDC_ADDRESS.',
      },
    };
  }

  return { ok: true, value: { escrow, token } };
}

/**
 * A decimal USDC figure as base units.
 *
 * `parseUnits` with `USDC_DECIMALS`, never `ARC_TESTNET.nativeCurrency.decimals`
 * — those are 6 and 18 and `lib/chain.ts` explains at length why they must stay
 * apart. Reading the wrong one scales the amount by 10^12, and no confirmation
 * dialog makes a trillion-fold error obvious.
 */
export function toBaseUnits(amount: string): bigint | null {
  try {
    return parseUnits(amount.trim(), USDC_DECIMALS);
  } catch {
    return null;
  }
}

/** `approve(escrow, amount)` — exact, never unlimited. */
export function buildApproval(amountBaseUnits: bigint): BuildResult<UnsignedCall> {
  const resolved = addresses();
  if (!resolved.ok) return resolved;

  const { escrow, token } = resolved.value;

  return {
    ok: true,
    value: {
      to: token,
      data: erc20Interface.encodeFunctionData('approve', [escrow, amountBaseUnits]),
      summary:
        'Permits the escrow contract to move exactly this deal’s amount, and no more. Not an unlimited approval.',
    },
  };
}

/** `allowance(owner, escrow)` — read, so a second approval can be skipped. */
export function buildAllowanceQuery(owner: string): BuildResult<UnsignedCall> {
  const resolved = addresses();
  if (!resolved.ok) return resolved;

  const { escrow, token } = resolved.value;

  return {
    ok: true,
    value: {
      to: token,
      data: erc20Interface.encodeFunctionData('allowance', [owner, escrow]),
      summary: 'Reads how much the escrow is already permitted to move.',
    },
  };
}

/**
 * `createAndFundEscrow(…)`.
 *
 * `criteria` is a `PersistedCriteria`, so this cannot be called with text that
 * has not been written down — see `lib/persisted.ts`. The type is the enforcement:
 * the escrow stores only the hash, so a deal whose criteria were never stored is
 * permanently unauditable.
 *
 * `criteriaHash` is computed by the CALLER with `computeRubricHash`, the same
 * function the verify panel recomputes with. That shared function is the join
 * between the write path and the audit path — if this encoded its own digest, a
 * deal created here could fail verification here.
 */
export function buildCreateAndFund(args: {
  dealId: string;
  seller: string;
  amountBaseUnits: bigint;
  criteriaHash: string;
  durationSeconds: number;
  /** Present to prove the criteria were stored. Not encoded. */
  criteria: PersistedCriteria;
}): BuildResult<UnsignedCall> {
  const resolved = addresses();
  if (!resolved.ok) return resolved;

  const { escrow, token } = resolved.value;

  return {
    ok: true,
    value: {
      to: escrow,
      data: escrowInterface.encodeFunctionData('createAndFundEscrow', [
        args.dealId,
        args.seller,
        token,
        args.amountBaseUnits,
        args.criteriaHash,
        args.durationSeconds,
      ]),
      summary:
        'Registers the deal and moves the escrow amount from your wallet to the contract in one transaction.',
    },
  };
}

/**
 * `submitDeliverable(dealId, deliverableHash)`.
 *
 * Same persistence guarantee, same reason: the chain holds the digest, so the text
 * has to exist somewhere first or the submission can never be checked against
 * anything.
 */
export function buildSubmitDeliverable(args: {
  dealId: string;
  deliverableHash: string;
  /** Present to prove the deliverable was stored. Not encoded. */
  deliverable: PersistedDeliverable;
}): BuildResult<UnsignedCall> {
  const resolved = addresses();
  if (!resolved.ok) return resolved;

  return {
    ok: true,
    value: {
      to: resolved.value.escrow,
      data: escrowInterface.encodeFunctionData('submitDeliverable', [
        args.dealId,
        args.deliverableHash,
      ]),
      summary: 'Records your deliverable’s hash against the deal on chain.',
    },
  };
}
