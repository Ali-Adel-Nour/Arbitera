/**
 * `GET /api/mcp-activity` — the reputation-query log, newest first.
 * (Requirements 4.1, 4.2)
 *
 * `mcpActivityAt` turns each entry's declared age into an instant, so the newest
 * line is always a few minutes old however long this deployment has been up.
 * Fixed timestamps would age into a feed whose most recent entry is weeks old,
 * which reads as a dead service.
 *
 * Both `source` labels occur in the fixtures and neither is an error: `backend`
 * means the query fell back from The Graph to the backend index. Nothing in this
 * payload asserts that a subgraph deployment is serving anything.
 */

import { asOf, json } from '@/app/api/mockApi';
import { mcpActivityAt } from '@/fixtures/activity';
import { isMcpActivityResponse } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const nowMs = Date.now();
  return json(isMcpActivityResponse, { entries: mcpActivityAt(nowMs), asOf: asOf(nowMs) });
}
