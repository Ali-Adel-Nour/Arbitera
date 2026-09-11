/**
 * `GET /api/reputation/:agent` — either identifier form, one record.
 * (Requirements 4.1, 4.2, 4.7, 4.8)
 *
 * `reputationFor` runs the requested identifier through `resolveAgentAlias`, so
 * `agent-b` and that agent's address resolve to the same record — both forms are
 * live at once, because the MCP tool calls name agents as slugs while the
 * contract's `buyer` and `seller` fields are addresses. The record echoes the
 * form that was requested rather than the canonical slug, matching the shipped
 * route: a reviewer who asked by address is not silently told about something
 * else.
 *
 * THERE IS NO 404 HERE, and that is the shipped behaviour rather than an
 * omission. An unknown agent gets a zero-filled summary, so the empty state is
 * driven by `totalJudged === 0` and the trust explorer can name the action that
 * would produce a first record instead of rendering an error for the ordinary act
 * of looking up an agent with no history.
 */

import { badRequest, identifier, json } from '@/app/api/mockApi';
import { reputationFor } from '@/fixtures/agents';
import { isReputationSummary } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const agent = identifier((await context.params).agent);
  if (agent === '') return badRequest('Agent is required', 'agent');

  return json(isReputationSummary, reputationFor(agent));
}
