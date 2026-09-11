/**
 * `GET /api/deals` — the docket's source.  (Requirements 4.1, 4.2, 4.3, 4.4)
 *
 * One `Date.now()`, one snapshot, one `asOf` describing the same instant. The
 * engine is a pure function of that instant, so two serverless instances
 * answering two polls agree on where every deal is — see `fixtures/clock.ts` for
 * why a module-load epoch would let a deal appear to move backwards.
 *
 * `force-dynamic` is what keeps this honest. Rendered statically, the handler
 * would answer with the instant the build ran, forever.
 */

import { asOf, json } from '@/app/api/mockApi';
import { snapshotAt } from '@/fixtures/engine';
import { isDealsResponse } from '@/lib/guards';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const nowMs = Date.now();
  return json(isDealsResponse, { deals: snapshotAt(nowMs), asOf: asOf(nowMs) });
}
