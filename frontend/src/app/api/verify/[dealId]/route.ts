/**
 * `GET /api/verify/:dealId` — the canonical preimage, for local recomputation.
 * (Requirements 4.1, 4.2, 4.5, 4.6)
 *
 * THE ROUTE THE README SENDS AUDITORS TO, and the one the backend has never
 * implemented. `types.ts` records what ships today: the path is aliased to the
 * judgment handler, which returns the stored record plus the backend's own answer
 * to the question being asked. What the verify panel needs is the PREIMAGE — the
 * source fields, byte-exact as stored — so the browser can hash them itself and
 * reach its own conclusion.
 *
 * So this handler returns the record as the fixtures sealed it. Nothing is
 * re-serialised, trimmed, re-cased, or reordered on the way out:
 * `acceptanceCriteria` keeps its given order, and `evaluationPrompt` and
 * `rawResponse` are the strings that were hashed. Any normalisation applied here
 * would change the recomputed hash and report a mismatch on an untouched record,
 * which is the one failure an audit surface must never fake.
 *
 * `verified` is included and is the backend's own assessment, recomputed rather
 * than asserted. It is displayed in its own labelled cell and read by no code
 * path that produces the panel's conclusion (Requirement 8.7) — the value of
 * recomputing in the reader's browser evaporates if the answer is taken from the
 * party being checked.
 *
 * `?tampered=1` serves the corrupted variant, which exists for exactly one
 * record. See `TAMPERED_PARAM` in `app/api/mockApi.ts` for why the corrupted
 * record cannot have a path of its own, and `frontend/README.md` for the reviewer
 * -facing instructions.
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
import { isVerifyPreimageResponse } from '@/lib/guards';

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
    // Two different facts, said differently. A deal with no judgment has no
    // preimage; a deal with a judgment has no CORRUPTED preimage unless one was
    // built for it. Answering the second case with the intact record would let a
    // clean three-way match be read as the corrupted case.
    return notFound(
      tampered
        ? 'No tampered variant is recorded for this deal'
        : 'Verification preimage not found',
    );
  }

  return json(isVerifyPreimageResponse, { ...record, verified: backendVerified(record) });
}
