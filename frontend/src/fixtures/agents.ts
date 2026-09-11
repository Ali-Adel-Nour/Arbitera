/**
 * =============================================================================
 * `src/fixtures/agents.ts` — the two agents, their records, and alias resolution
 * =============================================================================
 *
 * Two agents, matching the demo terminal output exactly (Requirement 4.7):
 *
 *   agent-b   4 judged, 1 successful   success rate 0.25   trust score 14, Unproven
 *   agent-c   5 judged, 5 successful   success rate 1.00   trust score 63, Established
 *
 * Both appear in both identifier forms (Requirement 4.8): the plain slug the MCP
 * tool calls use, and the `0x` address the contract's `buyer` and `seller` fields
 * carry. Both forms come from `fixtures/identities.ts`, the same bindings the
 * docket rows and the verdict records read, so the reputation a reviewer opens
 * and the deal that produced it name the same agent by construction.
 *
 * EVERY TALLY IS COMPUTED FROM `history`
 * --------------------------------------
 * `totalJudged`, `successes`, `failures`, both rates, `byTaskCategory`, and
 * `recencyWeightedReliability` are derived from the judgment list below rather
 * than typed alongside it. A hand-written tally is a second source of truth for
 * the same fact, and the drill-down routes exist precisely to show that a figure
 * and the resolutions behind it agree — a fixture whose summary disagreed with
 * its own history would make that screen a liar for reasons that have nothing to
 * do with the code under review.
 *
 * WHY THE FOUR JUDGMENTS ON `agent-b` SIT CLOSE TOGETHER IN TIME
 * -------------------------------------------------------------
 * This is the one non-obvious constraint in the file, and it is worth stating
 * before someone spreads the dates out to look more natural.
 *
 * `lib/derive.ts` weights each judgment by `exp(-ageDays / 30)`, so a trust score
 * depends on the RELATIVE ages of an agent's judgments. `agent-b` scores 14 only
 * while its weighted reliability sits in [0.23625, 0.25375) — the interval that
 * rounds to 14 at four judgments. Four equally-weighted judgments with one
 * success give exactly 0.25, comfortably inside it. But if the single success is
 * materially older than the three failures, its weight shrinks, reliability falls
 * below the interval, and the score drops to 13 or lower — at which point the
 * design's stated 14 stops matching what the interface renders. The tolerance is
 * roughly two days older or half a day newer than the failures.
 *
 * So the four sit inside about thirty hours of each other. Nothing else about the
 * fixture depends on the spacing, and the ratio is invariant as real time passes:
 * every weight scales by the same factor, so the score stays 14 for as long as
 * these fixtures are in the tree.
 */

import {
  disputeRateByCategory,
  recencyWeightedReliability,
  trustScore,
  badgeTier,
} from '@/lib/derive';
import type {
  Address,
  AgentId,
  AgentListEntry,
  JudgmentHistoryEntry,
  ReputationSummary,
  TaskCategoryStats,
} from '@/types';

import {
  AGENT_B_ADDRESS,
  AGENT_B_ID,
  AGENT_C_ADDRESS,
  AGENT_C_ID,
  commitment,
  JUDGED_DEALS,
} from './identities';
import { ALPHA_RECORD, BRAVO_RECORD } from './records';

/* ===========================================================================
 * §1  The judgment histories
 *
 * Newest LAST, as the shipped reputation route returns them.
 *
 * The most recent entry of each agent is one of the two fixture deals, and it
 * carries that deal's real computed verdict hash rather than a stand-in — so a
 * reviewer following an agent's newest resolution lands on a record whose hashes
 * verify. The older entries are deals that exist only as history; their
 * identifiers and hashes are derived from labels by the same hasher, for the
 * reasons `fixtures/identities.ts` sets out.
 * ======================================================================== */

/** One history entry, with `score` derived from `approved` rather than restated. */
const judgment = (
  label: string,
  approved: boolean,
  timestamp: string,
  taskCategory: string,
  known?: { dealId: string; verdictHash: string },
): JudgmentHistoryEntry => ({
  dealId: known?.dealId ?? commitment(label),
  approved,
  score: approved ? 100 : 0,
  verdictHash: known?.verdictHash ?? commitment(`${label}:verdict`),
  timestamp,
  taskCategory,
});

/**
 * `agent-b` — one success in four.
 *
 * Two categories, so the dispute-rate-by-category region on the detail view has
 * something to distinguish: market research is nought for two, copywriting is one
 * for two. The newest entry is DEAL_BRAVO, the refused pricing brief.
 */
const AGENT_B_HISTORY: JudgmentHistoryEntry[] = [
  judgment('deal-india', false, '2026-09-06T09:05:00.000Z', 'market-research'),
  judgment('deal-juliett', true, '2026-09-06T15:40:00.000Z', 'copywriting'),
  judgment('deal-kilo', false, '2026-09-07T10:15:00.000Z', 'copywriting'),
  judgment('deal-bravo', false, BRAVO_RECORD.timestamp, 'market-research', {
    dealId: JUDGED_DEALS.bravo.dealId,
    verdictHash: BRAVO_RECORD.verdictHash,
  }),
];

/**
 * `agent-c` — five for five, spread over four weeks.
 *
 * The spacing is free here: with every judgment approved, the weighted mean is 1
 * whatever the weights are, so reliability does not depend on the dates and the
 * history can look like a record accumulated over time. The newest entry is
 * DEAL_ALPHA, the approved churn review.
 */
const AGENT_C_HISTORY: JudgmentHistoryEntry[] = [
  judgment('deal-echo', true, '2026-08-14T10:00:00.000Z', 'api-integration'),
  judgment('deal-foxtrot', true, '2026-08-21T14:30:00.000Z', 'data-analysis'),
  judgment('deal-golf', true, '2026-08-28T09:15:00.000Z', 'data-analysis'),
  judgment('deal-hotel', true, '2026-09-04T16:45:00.000Z', 'api-integration'),
  judgment('deal-alpha', true, ALPHA_RECORD.timestamp, 'data-analysis', {
    dealId: JUDGED_DEALS.alpha.dealId,
    verdictHash: ALPHA_RECORD.verdictHash,
  }),
];

/* ===========================================================================
 * §2  Summarising a history
 * ======================================================================== */

/** Per-category success tallies, in the shipped `byTaskCategory` shape. */
function tallyByCategory(history: JudgmentHistoryEntry[]): Record<string, TaskCategoryStats> {
  const stats: Record<string, TaskCategoryStats> = {};

  // Built from the same `DisputeRateByCategory` bucketing `lib/derive.ts` uses,
  // so the success rates here and the dispute rates on the detail view are two
  // readings of one tally rather than two tallies that agree today.
  for (const [category, rate] of Object.entries(disputeRateByCategory(history))) {
    const successes = rate.denominator - rate.numerator;
    stats[category] = {
      total: rate.denominator,
      successes,
      successRate: successes / rate.denominator,
    };
  }

  return stats;
}

/**
 * The instant a history is summarised as of: its newest judgment.
 *
 * Self-anchored rather than `Date.now()`, so the reliability figure baked into
 * the fixture is deterministic on every process — the same discipline
 * `fixtures/clock.ts` applies to deal state, for the same reason.
 *
 * It agrees with what the interface computes at render time anyway. Every weight
 * is `exp(-ageDays / 30)`, so advancing the clock scales all of them by one
 * common factor and leaves their ratio — which is what the weighted mean is —
 * unchanged. The anchor decides nothing about the answer; it only removes the
 * clock from the fixture.
 */
const anchorOf = (history: JudgmentHistoryEntry[]): number =>
  history.reduce((latest, entry) => Math.max(latest, Date.parse(entry.timestamp)), 0);

/** A full `ReputationSummary`, every figure computed from `history`. */
function summarise(agent: AgentId, history: JudgmentHistoryEntry[]): ReputationSummary {
  const totalJudged = history.length;
  const successes = history.filter((entry) => entry.approved).length;
  const failures = totalJudged - successes;

  return {
    agent,
    totalJudged,
    successes,
    failures,
    // Rates are FRACTIONS in [0, 1], never percentages: `isReputationSummary`
    // rejects anything outside that range, and a figure switched to 0-100 would
    // render as `8500%` on a trust surface.
    successRate: totalJudged === 0 ? 0 : successes / totalJudged,
    failureRate: totalJudged === 0 ? 0 : failures / totalJudged,
    recencyWeightedReliability: recencyWeightedReliability(history, anchorOf(history)),
    byTaskCategory: tallyByCategory(history),
    history,
  };
}

/* ===========================================================================
 * §3  The two agents
 * ======================================================================== */

/** The address form of each agent, keyed by slug. The only place the two are paired. */
export const AGENT_ADDRESSES: Record<AgentId, Address> = {
  [AGENT_B_ID]: AGENT_B_ADDRESS,
  [AGENT_C_ID]: AGENT_C_ADDRESS,
};

/** `agent-b`'s record: 1 of 4, a 25 percent success rate. */
export const AGENT_B_REPUTATION: ReputationSummary = summarise(AGENT_B_ID, AGENT_B_HISTORY);

/** `agent-c`'s record: 5 of 5, a 100 percent success rate. */
export const AGENT_C_REPUTATION: ReputationSummary = summarise(AGENT_C_ID, AGENT_C_HISTORY);

/** Every reputation record, keyed by the CANONICAL slug form of the identifier. */
export const REPUTATIONS: Record<AgentId, ReputationSummary> = {
  [AGENT_B_ID]: AGENT_B_REPUTATION,
  [AGENT_C_ID]: AGENT_C_REPUTATION,
};

/**
 * The agent list, in the order the trust explorer receives it.
 *
 * `taskCategories` comes off each agent's own tally, so the search filter matches
 * against the categories the agent actually has judgments in. `totalJudged` is
 * the only figure in a row that is not derived — the score and the tier are
 * computed per row by `lib/derive.ts`, which is why they are absent here.
 */
export const AGENT_LIST: AgentListEntry[] = Object.values(REPUTATIONS).map((summary) => ({
  agent: summary.agent,
  address: AGENT_ADDRESSES[summary.agent],
  totalJudged: summary.totalJudged,
  taskCategories: Object.keys(summary.byTaskCategory),
}));

/* ===========================================================================
 * §4  Alias resolution  (Requirement 4.8)
 * ======================================================================== */

/**
 * Resolve either identifier form onto the canonical slug, or `null` for an agent
 * this fixture set does not know.
 *
 * `GET /api/reputation/:agent` runs every lookup through here, so a reviewer who
 * pastes `agent-b` and a reviewer who pastes the address get the same record —
 * which is the point of Requirement 4.8 rather than an incidental convenience:
 * the MCP terminal names agents as slugs and the contract names them as
 * addresses, and both forms are live at once.
 *
 * ADDRESSES ARE MATCHED CASE-INSENSITIVELY, slugs are not. An address that
 * arrives EIP-55 checksummed is the same twenty bytes as the lowercase form and
 * must resolve; a slug is an opaque identifier the backend stores verbatim, and
 * folding its case would claim `AGENT-B` and `agent-b` are one agent when nothing
 * in the protocol says so. Surrounding whitespace is trimmed either way, because
 * it comes from a URL segment or a pasted value and never from an identifier.
 */
export function resolveAgentAlias(input: string): AgentId | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  if (Object.hasOwn(REPUTATIONS, trimmed)) return trimmed;

  const lowered = trimmed.toLowerCase();
  for (const [slug, address] of Object.entries(AGENT_ADDRESSES)) {
    if (address.toLowerCase() === lowered) return slug;
  }

  return null;
}

/**
 * A zero-filled summary for an identifier with no judgments.
 *
 * The shipped route answers an unknown agent with this rather than a 404, which
 * `types.ts` records, so the empty state is driven by `totalJudged === 0` and not
 * by a status code. Echoing the requested identifier keeps the screen honest
 * about what was asked for.
 */
export const emptyReputation = (agent: AgentId): ReputationSummary => summarise(agent, []);

/**
 * The record for a requested identifier, in either form.
 *
 * The `agent` field ECHOES THE REQUESTED FORM rather than the canonical slug,
 * matching the shipped route's behaviour as `types.ts` documents it: a reviewer
 * who asked by address sees the identifier they asked with, and the interface
 * does not silently rename what they looked up.
 */
export function reputationFor(requested: string): ReputationSummary {
  const slug = resolveAgentAlias(requested);
  if (slug === null) return emptyReputation(requested.trim());

  return { ...REPUTATIONS[slug], agent: requested.trim() };
}

/* ===========================================================================
 * §5  Module-load assertions
 *
 * Requirement 4.7 names four figures and the design's table names two more. All
 * six are checked here, because they are the numbers a reviewer compares against
 * the demo terminal output, and a fixture edit that moved one of them would
 * otherwise be discovered by that comparison rather than by the build.
 *
 * The scores are asserted at each history's own anchor. They are the same at any
 * instant — see `anchorOf` — but pinning the anchor keeps the assertion itself
 * independent of when the build runs.
 * ======================================================================== */

const EXPECTED = [
  { summary: AGENT_B_REPUTATION, totalJudged: 4, successes: 1, successRate: 0.25, score: 14, tier: 'Unproven' },
  { summary: AGENT_C_REPUTATION, totalJudged: 5, successes: 5, successRate: 1, score: 63, tier: 'Established' },
] as const;

for (const expected of EXPECTED) {
  const { summary } = expected;
  const anchor = anchorOf(summary.history);
  const score = trustScore(summary, anchor);
  const tier = badgeTier(score, summary.totalJudged);

  if (
    summary.totalJudged !== expected.totalJudged ||
    summary.successes !== expected.successes ||
    summary.successRate !== expected.successRate
  ) {
    throw new Error(
      `fixtures/agents.ts: ${summary.agent} is ${summary.successes} of ${summary.totalJudged} at rate ${summary.successRate}, expected ${expected.successes} of ${expected.totalJudged} at ${expected.successRate}`,
    );
  }

  if (score !== expected.score || tier !== expected.tier) {
    throw new Error(
      `fixtures/agents.ts: ${summary.agent} scores ${score} (${tier}), expected ${expected.score} (${expected.tier}). Check the spacing of its judgment timestamps — see this module's header.`,
    );
  }
}

for (const slug of Object.keys(REPUTATIONS)) {
  const address = AGENT_ADDRESSES[slug];

  if (address === undefined) {
    throw new Error(`fixtures/agents.ts: ${slug} has no address form (Requirement 4.8)`);
  }

  // Both forms must land on the same record, which is the whole contract of
  // `resolveAgentAlias`. Checked including the checksummed spelling of the
  // address, since that is the form an RPC node hands back.
  for (const form of [slug, address, address.toUpperCase().replace('0X', '0x')]) {
    if (resolveAgentAlias(form) !== slug) {
      throw new Error(`fixtures/agents.ts: ${form} does not resolve to ${slug}`);
    }
  }
}
