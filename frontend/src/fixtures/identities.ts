/**
 * =============================================================================
 * `src/fixtures/identities.ts` — the identifiers the timelines and the records
 * must agree on
 * =============================================================================
 *
 * A small module holding the values that BOTH `fixtures/timelines.ts` and
 * `fixtures/records.ts` have to read, plus the two derivation helpers that
 * produce them.
 *
 * WHY IT EXISTS: THE CYCLE IT BREAKS
 * ----------------------------------
 * The two modules need each other in opposite directions and only one of those
 * directions can be an import:
 *
 *   records.ts needs a deal's `dealId` and `deadline`, because both are inside
 *   the seventeen-field verdict preimage. A record that hashed a different
 *   deadline from the one the docket shows would report tampering on a record
 *   nobody touched.
 *
 *   timelines.ts needs the record's THREE COMPUTED HASHES for its on-chain
 *   fields, because that is what makes the verify panel's three-way comparison
 *   come out `all-match` on an untampered fixture.
 *
 * Written as a cycle, one side always loses: ES modules evaluate a dependency
 * before its importer, so whichever module is reached second reads the other's
 * top-level `const` bindings before they are initialised and throws a
 * `ReferenceError` at import — a fixture module that crashes every route handler
 * on the platform, and crashes it identically on every instance. Deferring the
 * reads behind getters would technically work and would make the initialisation
 * order load-bearing and invisible.
 *
 * So the shared values move down here and the graph is acyclic:
 *
 *   identities.ts  →  records.ts  →  timelines.ts  →  engine.ts
 *
 * `timelines.ts` re-exports `AGENT_B_ADDRESS` and `AGENT_C_ADDRESS`, so it stays
 * the import site every other module already uses and nothing derives a second
 * address for the same agent.
 *
 * WHY ONLY TWO DEALS APPEAR HERE
 * ------------------------------
 * `DEAL_ALPHA` and `DEAL_BRAVO` are the two fixture deals that get judged, so
 * they are the two whose identity a verdict record commits to. `DEAL_CHARLIE`
 * and `DEAL_DELTA` are never judged — no record hashes their identifiers, so
 * nothing outside `timelines.ts` needs to agree with them and they stay there.
 * The asymmetry is the point rather than an oversight.
 *
 * NOTHING IS HAND-WRITTEN EXCEPT THE TWO DEADLINES
 * ------------------------------------------------
 * Every 32-byte commitment and every 20-byte address is derived from a label by
 * the same hasher the browser runs, for the reasons `timelines.ts` sets out at
 * length: a typed-in hash cannot be checked by reading it, a typed-in address is
 * the exact shape `scripts/check-copy.mjs` greps for, and a derived value is
 * identical on every process. The deadlines are literals because an instant
 * cannot be derived from anything, and they are checked below instead.
 */

import { hashCanonicalValue, normalizeDeadline } from '@/lib/canonicalize';
import type { Address, AgentId, Hex32, IsoTimestamp } from '@/types';

/* ===========================================================================
 * §1  The two derivations
 * ======================================================================== */

/**
 * A 32-byte commitment derived from a label.
 *
 * A real keccak256 digest over a label naming what the value stands for,
 * produced by `lib/canonicalize.ts` — the same module the verify panel runs.
 * Non-zero for any label, which `dealId` requires: the contract rejects a zero
 * identifier with `InvalidDealId` and `isNonZeroHex32` rejects it at the
 * boundary.
 *
 * WHAT THIS IS NOT: a commitment to any record's text. The verdict material is
 * hashed by `computeRubricHash`, `computeDeliverableHash`, and
 * `computeVerdictHash` in `fixtures/records.ts`. This helper produces
 * identifiers and the stand-in commitments of deals that are never judged.
 */
export const commitment = (label: string): Hex32 =>
  hashCanonicalValue(`arbitra-fixture:${label}`);

/**
 * A 20-byte address with a readable prefix and a derived tail.
 *
 * The prefix lets a reviewer tie a docket row to the reputation record for the
 * same agent without expanding anything; the tail comes from a hash, so two
 * agents never share a truncated display form.
 *
 * LOWERCASE THROUGHOUT, never mixed case. A mixed-case address is read as
 * EIP-55 checksummed and `ethers.getAddress` throws on one whose checksum does
 * not verify, so a hand-cased `0xB0b…` fixture would crash any screen that
 * normalises an address before display. Lowercase is unambiguously
 * un-checksummed and is accepted everywhere.
 */
export const fixtureAddress = (prefix: string, label: string): Address =>
  `0x${prefix}${commitment(label).slice(-(40 - prefix.length))}` as Address;

/* ===========================================================================
 * §2  The two agents, in both identifier forms  (Requirement 4.8)
 *
 * Both forms of both agents are declared here, once, because both are live:
 * the MCP tool calls in the demo terminal name an agent as a plain slug, while
 * the contract's `buyer` and `seller` fields are addresses. The docket rows, the
 * verdict records, the reputation summaries, and the activity feed all read
 * these bindings, so the slug a reviewer types into `/api/reputation/agent-b`
 * and the address on the deal that produced the record are the same agent by
 * construction rather than by two literals happening to agree.
 * ======================================================================== */

/** `agent-b` — the seller with a mixed record. Buyer on the deals it funds. */
export const AGENT_B_ID: AgentId = 'agent-b';

/** `agent-c` — the reliable seller. */
export const AGENT_C_ID: AgentId = 'agent-c';

/** The address form of `agent-b`. */
export const AGENT_B_ADDRESS: Address = fixtureAddress('b0b', AGENT_B_ID);

/** The address form of `agent-c`. */
export const AGENT_C_ADDRESS: Address = fixtureAddress('c1c', AGENT_C_ID);

/* ===========================================================================
 * §3  The judged deals' identity
 * ======================================================================== */

/**
 * The `dealId` and `deadline` of one judged deal: exactly the two fields a
 * verdict record and a docket row have to agree on letter for letter.
 */
export interface JudgedDealIdentity {
  dealId: Hex32;

  /** Already in the canonical `toISOString()` form. Asserted in §4. */
  deadline: IsoTimestamp;
}

/**
 * THE DEADLINES ARE FIXED INSTANTS, NOT OFFSETS FROM NOW.
 *
 * They have to be. The same deadline sits inside the seventeen-field verdict
 * preimage and the record hashes are sealed at module load, so a deadline that
 * moved with the clock would change the preimage between the moment a hash was
 * computed and the moment the browser recomputed it — and the verify panel would
 * report tampering on a record nobody touched. The dates are set far enough out
 * to stay in the future through any plausible review.
 *
 * They are also the reason this module runs `normalizeDeadline` over its own
 * literals at import: `normalizeDeadline` is what the preimage builder applies,
 * so a literal it would rewrite — a missing `Z`, seconds without milliseconds, a
 * non-UTC offset — is a deal whose record hashes a different string from the one
 * on screen. The check is three lines and it makes that unrepresentable.
 */
export const JUDGED_DEALS = {
  /** The approved path: `agent-b` hires `agent-c`, the work passes. */
  alpha: {
    dealId: commitment('deal-alpha'),
    deadline: '2027-03-31T17:00:00.000Z',
  },

  /** The rejected path: `agent-c` hires `agent-b`, the work is refunded. */
  bravo: {
    dealId: commitment('deal-bravo'),
    deadline: '2027-02-14T12:00:00.000Z',
  },
} as const satisfies Record<string, JudgedDealIdentity>;

/* ===========================================================================
 * §4  Module-load assertions
 *
 * Loud at the first import rather than quietly wrong later, in the same spirit
 * as `lib/chain.ts`'s literal-agreement check and `timelines.ts`'s step-order
 * checks. Both of these are conditions a later edit can break silently, and
 * both present as a verify-panel mismatch on an untouched record — the one
 * failure this surface must never fake.
 * ======================================================================== */

for (const [name, identity] of Object.entries(JUDGED_DEALS)) {
  const normalised = normalizeDeadline(identity.deadline);
  if (normalised !== identity.deadline) {
    throw new Error(
      `fixtures/identities.ts: ${name} deadline ${identity.deadline} is not canonical; normalises to ${normalised}`,
    );
  }
}

if (JUDGED_DEALS.alpha.dealId === JUDGED_DEALS.bravo.dealId) {
  throw new Error('fixtures/identities.ts: the judged deals need distinct identifiers');
}

if (AGENT_B_ADDRESS === AGENT_C_ADDRESS) {
  throw new Error('fixtures/identities.ts: the two agents need distinct addresses');
}
