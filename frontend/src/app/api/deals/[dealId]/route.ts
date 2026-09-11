/**
 * `GET /api/deals/:dealId` — one deal, for the verify panel's on-chain column.
 * (Requirements 4.1, 4.2)
 *
 * The judgment route supplies the off-chain record; this supplies the three
 * commitments the chain holds, which is the third source in the three-way
 * comparison. Without it the comparison degrades to two-way and the finding that
 * matters — the backend's row standing apart from a browser recomputation and an
 * immutable commitment that agree — becomes unreachable.
 *
 * A 404 here is a real not-found: `services/api.ts` names the subject as `deal`,
 * so the error copy says which lookup failed rather than that something was.
 */

import { badRequest, findDeal, identifier, json, notFound } from '@/app/api/mockApi';
import { isEscrowDeal } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ dealId: string }> },
): Promise<Response> {
  const dealId = identifier((await context.params).dealId);
  if (dealId === '') return badRequest('Deal ID is required', 'dealId');

  const deal = findDeal(dealId, Date.now());
  if (deal === undefined) return notFound('Deal not found');

  return json(isEscrowDeal, deal);
}
