/**
 * `GET /api/agents` — the trust explorer's index.  (Requirements 4.1, 4.2, 4.7)
 *
 * The sharpest gap in the backend contract, so it is worth restating why nothing
 * shipped can substitute: `GET /api/reputation/:agent` takes an identifier as
 * input, so it cannot be the source of identifiers. Without this route the
 * explorer's list cannot exist at all — not degraded, not partial.
 *
 * The list carries `totalJudged` and the categories each agent has judgments in,
 * and nothing else. The trust score and badge tier are computed per row by
 * `lib/derive.ts` from the reputation record, which is why they are absent from
 * the payload: a derived figure served as protocol data would be indistinguishable
 * from one, on the surface whose whole job is to keep them apart.
 *
 * Filtering is the client's, over the whole list. It is small, the search should
 * feel instant, and a round trip per keystroke would be worse in every way.
 */

import { asOf, json } from '@/app/api/mockApi';
import { AGENT_LIST } from '@/fixtures/agents';
import { isAgentsResponse } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return json(isAgentsResponse, { agents: AGENT_LIST, asOf: asOf(Date.now()) });
}
