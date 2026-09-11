/**
 * =============================================================================
 * `src/app/api/mockApi.ts` — what the eight Mock_API handlers share
 * =============================================================================
 *
 * Not a route. Next.js routes `route.ts` files and nothing else, so this module
 * sits beside the handlers it serves rather than in `lib/`, which keeps the
 * Mock_API readable as one unit: the handlers below it are each a few lines of
 * "read the fixtures, answer", and everything they have in common is here.
 *
 * WHAT THE MOCK_API IS FOR  (Requirements 4.1, 4.2, 2.3)
 * -----------------------------------------------------
 * With `NEXT_PUBLIC_API_BASE` unset, `services/endpoints.ts` resolves every path
 * relative to the current origin, which lands on these handlers. So the whole
 * interface is reachable from a deployment with no backend configured at all,
 * and a backend outage cannot make the protocol look broken.
 *
 * NO HANDLER MAKES AN OUTBOUND REQUEST  (Requirement 2.7, Property 18)
 * -------------------------------------------------------------------
 * There is no `fetch` in this module or in any handler that imports it. The
 * fixtures are imported and read directly. `services/api.ts` is the only module
 * in the application that fetches, and these route handlers are the other side
 * of that seam rather than a second client.
 *
 * EVERY BODY IS GUARDED ON THE WAY OUT
 * ------------------------------------
 * `json` takes the same `lib/guards.ts` guard the client will apply to the body
 * on the way in, and checks it before responding. The check cannot fail in
 * practice — the fixtures are built to satisfy it, and Property 14 asserts that
 * at every point in the cycle — so its job is to fail LOUDLY if a fixture ever
 * drifts: a 500 naming the shape beats a 200 the client reports as `malformed`,
 * because only one of those names the layer to go and look at.
 *
 * EVERY HANDLER IS DYNAMIC, AND THAT IS NOT OPTIONAL
 * --------------------------------------------------
 * Each `route.ts` exports `dynamic = 'force-dynamic'`. Fixture state is a
 * function of `Date.now()`, so a statically rendered handler would freeze the
 * docket at build time and serve one instant forever — a feed that looks live
 * and never moves, which is the most damaging defect this layer could ship.
 * `NO_STORE` says the same thing to every cache between here and the browser.
 *
 * THE ERROR BODIES ARE THE BACKEND'S OWN SHAPE
 * --------------------------------------------
 * `{ success: false, error, field? }` — `types.ts`'s `BackendErrorBody`, which
 * is what `services/api.ts` reads: the `error` text on a 400, and a `field` hint
 * when one is supplied. Matching it here is what makes `lib/errorCopy.ts` render
 * the right sentence against a fixture failure and against a real one.
 */

import { isoInstantAt } from '@/fixtures/clock';
import { snapshotAt } from '@/fixtures/engine';
import { TAMPERED_RECORD, VERDICT_RECORDS } from '@/fixtures/records';
import {
  computeDeliverableHash,
  computeRubricHash,
  computeVerdictHash,
} from '@/lib/canonicalize';
import { expectedShape, type Guard } from '@/lib/guards';
import type { AuditableVerdict, EscrowDeal, IsoTimestamp } from '@/types';

/* ===========================================================================
 * §1  Responding
 * ======================================================================== */

/**
 * Never cache a fixture response.
 *
 * The docket and the activity feed are polled for change; a cached body would
 * present one instant of the cycle as every instant, on the screens whose whole
 * claim is that they show what is happening now. `services/api.ts` also sends
 * `cache: 'no-store'` — the two ends agree deliberately, because either one
 * alone leaves a CDN in the middle free to answer from its own copy.
 */
const NO_STORE = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store, max-age=0, must-revalidate',
} as const;

/** A body, serialised with the no-store headers. */
const send = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: NO_STORE });

/**
 * A 200 whose body has been checked against the shape the client expects.
 *
 * The guard is the one named for this route in the table at the head of
 * `lib/guards.ts`, so the handler cannot pass a guard the client does not apply.
 */
export function json<T>(guard: Guard<T>, body: T): Response {
  if (!guard(body)) {
    return send(500, {
      success: false,
      error: `Fixture data does not match ${expectedShape(guard)}. The fixtures and types.ts have drifted.`,
    });
  }

  return send(200, body);
}

/**
 * A failure, in the shipped backend's error shape.
 *
 * `field` is omitted rather than set to `undefined` when absent: `JSON.stringify`
 * drops an `undefined` member anyway, and spelling the omission keeps the body a
 * reader sees identical to the body the client parses.
 */
export function failure(status: number, error: string, field?: string): Response {
  return send(status, field === undefined
    ? { success: false, error }
    : { success: false, error, field });
}

/** 404 — the record does not exist. `lib/errorCopy.ts` names which lookup failed. */
export const notFound = (error: string): Response => failure(404, error);

/** 400 — the request could not be read. `field` names the input at fault. */
export const badRequest = (error: string, field?: string): Response =>
  failure(400, error, field);

/* ===========================================================================
 * §2  Time, and the identifier in the path
 * ======================================================================== */

/**
 * The server's assembly time, for the `asOf` member every collection response
 * carries.
 *
 * REQUIRED, not decorative. The docket's last-updated figure reads it instead of
 * the client clock, because a laptop a minute out of step would otherwise make a
 * live feed look stale or impossibly fresh. One `Date.now()` per request is read
 * by the handler and threaded through, so the deals in a response and the `asOf`
 * beside them describe the same instant.
 */
export const asOf = (nowMs: number): IsoTimestamp => isoInstantAt(nowMs);

/**
 * The identifier from a dynamic segment, trimmed.
 *
 * Next.js has already percent-decoded it, which is the other half of
 * `services/endpoints.ts` encoding every identifier once on the way in — so
 * `agent-b`, an address, and anything carrying a slash all round-trip
 * (Requirement 2.6). Trimming covers a pasted value with a trailing space; an
 * empty result is a 400 at the handler, matching the shipped routes.
 */
export const identifier = (raw: string): string => raw.trim();

/* ===========================================================================
 * §3  Reading the fixtures
 * ======================================================================== */

/**
 * One deal from the snapshot at `nowMs`, or `undefined`.
 *
 * Matched case-insensitively, for the reason `lib/verify.ts` folds case when it
 * compares hashes: a digest that arrives from an RPC node may be upper case
 * where `keccak256` emits lower case, and they are the same 32 bytes. A reviewer
 * pasting the upper-case form of a `dealId` is asking about the same deal.
 */
export function findDeal(dealId: string, nowMs: number): EscrowDeal | undefined {
  const wanted = dealId.toLowerCase();
  return snapshotAt(nowMs).find((deal) => deal.dealId.toLowerCase() === wanted);
}

/**
 * The query parameter that serves the corrupted record.  (Requirement 4.6)
 *
 * `TAMPERED_RECORD` carries the same `dealId` as the record it was derived from,
 * because it IS that record after a corruption rather than a different deal. So
 * one path cannot serve both, and a reviewer needs some way to ask for the
 * corrupted one on a live deployment.
 *
 * `?tampered=1` is that way, on both `/api/verify/:dealId` and
 * `/api/judgments/:dealId`. It is documented in `frontend/README.md` rather than
 * being a secret, because a mismatch nobody can reach is a claim rather than a
 * demonstration.
 *
 * The alternative was a synthetic `dealId` for the corrupted variant. It was
 * rejected because the corrupted record's identifier is inside its own verdict
 * preimage: minting a different one would change the recomputed hash as well as
 * the stored one, and the panel would report `all-differ` on a record whose only
 * defect is a single flipped nibble in the value the backend stored. The
 * instructive finding — `stored-differs`, the backend's row standing apart from a
 * browser recomputation and an immutable on-chain commitment that agree — is only
 * reachable if the identifier is left alone.
 *
 * EXACTLY `'1'`, not truthiness, for the same reason `FORCE_BACKEND` is exact:
 * `?tampered=0` and `?tampered=false` are both non-empty strings, and reading
 * either as a yes would answer an explicit "no" with a corrupted record.
 */
export const TAMPERED_PARAM = 'tampered';

/** Whether this request asked for the corrupted variant. */
export function wantsTampered(request: Request): boolean {
  return new URL(request.url).searchParams.get(TAMPERED_PARAM) === '1';
}

/**
 * The stored record for a deal, or `null`.
 *
 * With `tampered` set, ONLY the record that has a corrupted variant answers, and
 * every other deal is `null` — a 404 at the handler. That asymmetry is the
 * important part. Serving the intact record under a URL that says `tampered=1`
 * would invite a reviewer to read a clean three-way match as the corrupted case,
 * and conclude that corruption does not show up here. A 404 says what is true:
 * no corrupted variant of that record exists.
 *
 * The reverse mistake is the one this layer must never make, and it cannot: the
 * intact path never consults the corrupted record at all, so an untampered
 * record cannot be made to look tampered by anything a caller sends.
 */
export function recordFor(dealId: string, tampered: boolean): AuditableVerdict | null {
  const wanted = dealId.toLowerCase();

  if (tampered) {
    return TAMPERED_RECORD.dealId.toLowerCase() === wanted ? TAMPERED_RECORD : null;
  }

  return VERDICT_RECORDS.find((record) => record.dealId.toLowerCase() === wanted) ?? null;
}

/**
 * The backend's OWN assessment of a record it stored — the `verified` flag.
 *
 * Computed rather than asserted: the three hashes are recomputed from the
 * record's own fields and compared against the three it carries, which is the
 * check a backend can actually perform on its own row. So the intact records
 * report `true` and the corrupted one reports `false`, and neither figure is a
 * literal somebody has to remember to flip.
 *
 * WHAT THIS FLAG IS NOT. It is not the verify panel's answer and must never be
 * read as one (Requirement 8.7). It is the party being checked reporting on
 * itself; `lib/verify.ts` assigns it last, displays it in its own labelled cell,
 * and reaches its conclusion from a recomputation in the reader's browser. A
 * backend that had rewritten a record would also rewrite this boolean, which is
 * exactly why the panel does not consult it.
 */
export function backendVerified(record: AuditableVerdict): boolean {
  return (
    record.rubricHash === computeRubricHash(record) &&
    record.deliverableHash === computeDeliverableHash(record) &&
    record.verdictHash === computeVerdictHash(record)
  );
}
