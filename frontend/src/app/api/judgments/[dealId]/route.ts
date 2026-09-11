/**
 * `GET /api/judgments/:dealId` — the stored record and the backend's own flag.
 * (Requirements 4.1, 4.2)
 *
 * The one difference from the verify route above is that `verified` is REQUIRED
 * here, which is why `types.ts` declares two shapes for what is otherwise the
 * same body: the shipped judgments route always sends the flag, and the verify
 * route may not.
 *
 * The flag is what a real backend would compute — its own record checked against
 * its own stored hashes — so it is `false` for the corrupted variant and `true`
 * for the intact records. It is displayed as an input and never as an answer
 * (Requirement 8.7).
 *
 * `?tampered=1` reaches the corrupted variant here too, so a reviewer sees the
 * same record from both routes rather than one route disagreeing with the other
 * about what is stored.
 */

import {
  backendVerified,
  badRequest,
  identifier,
  json,
  notFound,
  recordFor,
  wantsTampered,
} from '@/app/api/mockApi';
import { isJudgmentResponse } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ dealId: string }> },
): Promise<Response> {
  const dealId = identifier((await context.params).dealId);
  if (dealId === '') return badRequest('Deal ID is required', 'dealId');

  const tampered = wantsTampered(request);
  const record = recordFor(dealId, tampered);

  if (record === null) {
    return notFound(
      tampered ? 'No tampered variant is recorded for this deal' : 'Judgment not found',
    );
  }

  return json(isJudgmentResponse, { ...record, verified: backendVerified(record) });
}
