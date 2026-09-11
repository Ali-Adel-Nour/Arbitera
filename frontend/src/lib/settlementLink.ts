/**
 * =============================================================================
 * `src/lib/settlementLink.ts` — a settlement reference, linked or not
 * =============================================================================
 *
 * A resolved deal has a transaction hash. Whether that hash becomes a link
 * depends on one thing: whether an explorer host was configured.
 *
 * THERE IS NO DEAD-LINK BRANCH, and that is the entire point of this module. The
 * tempting shortcut is to guess an explorer host from the chain id — every EVM
 * chain has one, the pattern is always `…/tx/0x…`, and it works right up until it
 * does not. A guessed host produces a confident blue link to a page that 404s,
 * which is worse than no link at all on a screen whose argument is that its
 * claims can be checked. Arc's testnet explorer host is not something this
 * interface can derive.
 *
 * So absence degrades to a copyable hash plus one sentence naming the variable.
 * The reader still has the value — they can paste it into whatever explorer they
 * trust — and the interface has not asserted a destination it cannot reach.
 *
 * PURE. No React, no fetch. `env.explorerTxBase` is read through `lib/env.ts`,
 * which is the single `NEXT_PUBLIC_*` read site.
 */

import { env } from '@/lib/env';

/** What a caller should render for a settlement reference. */
export type SettlementReference =
  /** An explorer host is configured. `href` is safe to link. */
  | { kind: 'link'; href: string; hash: string }
  /** No explorer host. Render the hash as a copyable value with the note. */
  | { kind: 'hash'; hash: string };

/**
 * Resolve a transaction hash into a link or a bare hash.
 *
 * The base is joined with exactly one separator regardless of whether the
 * configured value ends in a slash, because both forms are what people actually
 * paste into a dashboard and `…/tx//0x…` is a 404 on most explorers.
 */
export function settlementReference(txHash: string): SettlementReference {
  const base = env.explorerTxBase;
  if (base === null) return { kind: 'hash', hash: txHash };

  const joined = base.endsWith('/') ? `${base}${txHash}` : `${base}/${txHash}`;
  return { kind: 'link', href: joined, hash: txHash };
}
