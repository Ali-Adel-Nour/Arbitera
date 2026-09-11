/**
 * =============================================================================
 * `src/fixtures/activity.ts` — the MCP reputation-query log
 * =============================================================================
 *
 * Six entries for the activity feed. Each one is a reputation query an agent made
 * over MCP, the reliability figure it got back, and what it did next.
 *
 * THE DEMO'S ARGUMENT IS IN THIS FILE
 * -----------------------------------
 * The claim the feed exists to make legible is that a reputation query changed a
 * hiring decision. That is only readable if the decision sits next to the number
 * that produced it, so the two `declined` entries both name `agent-b` — one
 * success in four — and the `hired` entries both name `agent-c`. The same pairing
 * shows up on the docket: `agent-b` funded DEAL_ALPHA with `agent-c` delivering,
 * and `agent-c` funded DEAL_BRAVO with `agent-b` delivering and being refused.
 *
 * BOTH SOURCE LABELS APPEAR, AND NEITHER IS AN ERROR
 * --------------------------------------------------
 * `graph` and `backend` both occur. A `backend` label means the query fell back
 * from The Graph to the backend index: the answer is the same, the path to it was
 * different. The feed says that in its standing copy, because a reader who takes
 * `backend` for a failure has been misled by the interface's own labelling.
 * Nothing here asserts that a subgraph deployment is currently serving anything.
 *
 * BOTH IDENTIFIER FORMS APPEAR  (Requirement 4.8)
 * -----------------------------------------------
 * Most entries name agents by the slug the MCP tool calls use; two name them by
 * address. That is the pair of branches Requirement 7.5 asks the machine-value
 * primitive to handle — a slug renders whole, a hex value truncates and copies in
 * full — so the feed exercises both on every render rather than only in a test.
 *
 * THE FIGURES ARE THE FIXTURE'S OWN
 * ---------------------------------
 * `returnedReliability` is read from the reputation records in
 * `fixtures/agents.ts`, not typed in. A feed reporting a number the trust
 * explorer contradicts would be the most confusing possible defect on a surface
 * whose argument is that agents and reviewers read one record.
 *
 * TIMES ARE RELATIVE TO THE POLL, NOT BAKED IN
 * --------------------------------------------
 * Each entry declares how long before "now" it happened, and `mcpActivityAt`
 * turns that into an instant. Fixed timestamps would age: a feed whose newest
 * line is three weeks old reads as a dead service, and by the time anyone
 * reviews this it would be. The offsets are minutes and hours, so the log always
 * looks like a service that answered a query recently.
 *
 * `nowMs` is a parameter with a `Date.now()` default and nothing here reads the
 * clock any other way, which is the same discipline `fixtures/clock.ts` and
 * `fixtures/engine.ts` hold to: a route handler passes `Date.now()`, a test
 * passes an instant and asserts the result. Unlike deal state this is not folded
 * into a cycle, because a query log does not repeat — it only recedes.
 */

import type { HiringDecision, McpActivityEntry, McpDataSource } from '@/types';

import { isoInstantAt } from './clock';
import { AGENT_B_REPUTATION, AGENT_C_REPUTATION } from './agents';
import { AGENT_B_ADDRESS, AGENT_B_ID, AGENT_C_ADDRESS, AGENT_C_ID } from './identities';

/** The reliability each agent's record actually returns. See the header. */
const RELIABLE = AGENT_C_REPUTATION.recencyWeightedReliability;
const MIXED = AGENT_B_REPUTATION.recencyWeightedReliability;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * One logged query, with its age instead of its timestamp.
 *
 * `id` is fixed rather than derived from the instant, so a row keeps its React
 * key across polls even though its rendered time moves. A time-derived id would
 * remount every row on every poll, which on a feed is a visible flicker.
 */
interface ActivityFixture extends Omit<McpActivityEntry, 'timestamp'> {
  /** How long before `nowMs` this query happened. */
  agoMs: number;
}

/**
 * The log, newest first — the order the feed renders and the shipped route
 * promises.
 */
const ACTIVITY_LOG: ActivityFixture[] = [
  {
    id: 'mcp-006',
    agoMs: 3 * MINUTE_MS,
    queryingAgent: AGENT_B_ID,
    queriedAgent: AGENT_C_ID,
    returnedReliability: RELIABLE,
    decision: 'hired',
    source: 'graph',
  },
  {
    // The one the demo narrates: a buyer agent read one success in four and
    // walked away.
    id: 'mcp-005',
    agoMs: 11 * MINUTE_MS,
    queryingAgent: AGENT_C_ID,
    queriedAgent: AGENT_B_ID,
    returnedReliability: MIXED,
    decision: 'declined',
    source: 'backend',
  },
  {
    // The address form of the querying agent, so the feed renders a truncating
    // machine value alongside the untruncated slugs.
    id: 'mcp-004',
    agoMs: 47 * MINUTE_MS,
    queryingAgent: AGENT_B_ADDRESS,
    queriedAgent: AGENT_C_ID,
    returnedReliability: RELIABLE,
    decision: 'queried-only',
    source: 'graph',
  },
  {
    id: 'mcp-003',
    agoMs: 2 * HOUR_MS + 26 * MINUTE_MS,
    queryingAgent: AGENT_C_ID,
    queriedAgent: AGENT_B_ADDRESS,
    returnedReliability: MIXED,
    decision: 'declined',
    source: 'backend',
  },
  {
    id: 'mcp-002',
    agoMs: 5 * HOUR_MS + 9 * MINUTE_MS,
    queryingAgent: AGENT_B_ID,
    queriedAgent: AGENT_C_ADDRESS,
    returnedReliability: RELIABLE,
    decision: 'hired',
    source: 'backend',
  },
  {
    id: 'mcp-001',
    agoMs: 9 * HOUR_MS + 34 * MINUTE_MS,
    queryingAgent: AGENT_C_ID,
    queriedAgent: AGENT_B_ID,
    returnedReliability: MIXED,
    decision: 'queried-only',
    source: 'graph',
  },
];

/**
 * The activity feed as of `nowMs`, newest first.
 *
 * A pure function of its argument: same instant in, same entries out, on any
 * process and any serverless instance. Fresh objects each call, so a route
 * handler cannot write back into the shared log on its way out.
 */
export function mcpActivityAt(nowMs: number = Date.now()): McpActivityEntry[] {
  return ACTIVITY_LOG.map(({ agoMs, ...entry }) => ({
    ...entry,
    timestamp: isoInstantAt(nowMs - agoMs),
  }));
}

/* ===========================================================================
 * §  Module-load assertions
 *
 * Both source labels and all three decisions have to occur, or a screen state
 * ships unexercised: the `backend` label is what the feed's standing copy
 * explains, and `queried-only` is the branch that shows a lookup with no hiring
 * decision attached. Both are conditions an edit can quietly remove.
 * ======================================================================== */

const SOURCES_PRESENT = new Set<McpDataSource>(ACTIVITY_LOG.map((entry) => entry.source));
const DECISIONS_PRESENT = new Set<HiringDecision>(ACTIVITY_LOG.map((entry) => entry.decision));

for (const source of ['graph', 'backend'] satisfies McpDataSource[]) {
  if (!SOURCES_PRESENT.has(source)) {
    throw new Error(`fixtures/activity.ts: no entry carries the ${source} source label`);
  }
}

for (const decision of ['hired', 'declined', 'queried-only'] satisfies HiringDecision[]) {
  if (!DECISIONS_PRESENT.has(decision)) {
    throw new Error(`fixtures/activity.ts: no entry records a ${decision} decision`);
  }
}

if (new Set(ACTIVITY_LOG.map((entry) => entry.id)).size !== ACTIVITY_LOG.length) {
  throw new Error('fixtures/activity.ts: every entry needs a distinct id');
}

for (const [index, entry] of ACTIVITY_LOG.entries()) {
  const previous = ACTIVITY_LOG[index - 1];

  // Newest first, so the ages ascend. A log that drifted out of order would
  // render as a feed whose lines are not in the order they happened, which is
  // the one thing a log is for.
  if (previous && entry.agoMs <= previous.agoMs) {
    throw new Error(`fixtures/activity.ts: ${entry.id} is not older than ${previous.id}`);
  }
}
