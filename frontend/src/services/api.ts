/**
 * =============================================================================
 * `src/services/api.ts` — the only module in this application that fetches
 * =============================================================================
 *
 * Ten functions, one per row of the endpoint table, each returning an
 * `ApiResult<T>`. No component, hook, or library module issues a request; every
 * byte that arrives from a network arrives through here (Requirements 2.1, 2.7).
 * The route handlers under `app/api/*` are the other side of the seam: they read
 * fixtures directly and make no outbound request of their own.
 *
 * THE CLIENT NEVER THROWS
 * -----------------------
 * Every failure is a value. Throwing typed errors was the alternative and it
 * loses the discriminant exactly where it is needed: at a `catch` site the value
 * is `unknown`, so every hook would re-narrow what this module already knew, and
 * a hook that forgot to catch would take a screen down. With a result type,
 * `errorCopy(error)` is total over `ApiError` and the compiler reports a new
 * failure mode that has no copy.
 *
 * EVERY BODY IS SHAPE-GUARDED
 * ---------------------------
 * A response is not data until `lib/guards.ts` says so. A backend that renames
 * `verdictHash` produces a named `malformed` error carrying the shape that was
 * expected, instead of a hash comparison against `undefined` three components
 * deep — which would read as a tamper alarm on an untouched record.
 *
 * The `expected` label comes from `expectedShape(guard)` and NOT from
 * `guard.name`. `design.md` sketches the latter; `lib/guards.ts` deliberately
 * carries the label as a data member instead, because top-level names are
 * mangled by minification and the production error panel would otherwise tell a
 * reviewer the response "did not match the shape `r`".
 *
 * ABORT IS NOT A FAILURE
 * ----------------------
 * A cancelled request is distinguished from a network failure and produces no
 * state update at all. It is reported as the single `ABORTED` value, recognised
 * by identity through `isAborted`. See §3 for why that is a sentinel rather than
 * a new member of the error union.
 *
 * NO REACT, NO COMPONENTS, NO COPY
 * --------------------------------
 * This module produces error VALUES; `lib/errorCopy.ts` turns them into
 * sentences and `content/copy.ts` holds the sentences. Nothing here renders and
 * nothing here imports React.
 */

import { CONTRACT_ERROR_NAMES } from '@/lib/errorCopy';
import {
  expectedShape,
  isAgentsResponse,
  isAuditableVerdict,
  isDealsResponse,
  isEscrowDeal,
  isHealthResponse,
  isJudgeAndSettleResponse,
  isJudgmentResponse,
  isMcpActivityResponse,
  isReputationSummary,
  isVerifyPreimageResponse,
  type Guard,
} from '@/lib/guards';
import { API_BASE, ENDPOINTS, resolve } from '@/services/endpoints';

import type {
  AgentsResponse,
  ApiError,
  ApiResult,
  AuditableVerdict,
  ContractErrorName,
  DealsResponse,
  EscrowDeal,
  HealthResponse,
  JudgeAndSettleResponse,
  JudgeRequest,
  JudgmentResponse,
  McpActivityResponse,
  MissingResource,
  ReputationSummary,
  VerifyPreimageResponse,
} from '@/types';

/* ===========================================================================
 * §1  What a 404 is about
 * ======================================================================== */

/**
 * The record a 404 would be about, for the routes that take an identifier.
 *
 * Carried per call rather than per endpoint because the identifier is an
 * argument: `lib/errorCopy.ts` renders "No judgment record exists for deal {id}"
 * and it can only do that if the client says which lookup failed and what was
 * looked up.
 */
interface NotFoundSubject {
  readonly resource: MissingResource;
  readonly id: string;
}

/**
 * The 401 recovery interpolates the name of the server-only variable to set, and
 * this module cannot spell that name: the copy gate permits it in exactly one
 * module under `src/`, and that module is `lib/serverEnv.ts`, the one that
 * actually reads it. Spending the budget here would leave the real reader unable
 * to name what it reads.
 *
 * So the name travels ON THE RESPONSE. This deployment's `judge-and-settle`
 * proxy is the only producer of a 401 the browser can see, and it names the
 * variable in its body. This fallback is used when some other origin answers 401
 * without naming anything, and it is a noun phrase rather than a sentence — the
 * sentence around it lives in `content/copy.ts`.
 */
const UNNAMED_SETTLEMENT_KEY = 'the server-only settlement key';

/* ===========================================================================
 * §2  Reading a response without trusting it
 * ======================================================================== */

/**
 * The body as JSON, or `undefined`.
 *
 * `res.json()` throws on an empty body and on a truncated one, and both are
 * ordinary outcomes: a 204 has no body, a proxy timing out mid-response
 * truncates, and an origin that answers with an HTML error page returns
 * something that parses as nothing. None of those should reach a caller as an
 * exception, so the text is read first and parsed defensively. `undefined` then
 * fails whichever guard applies, and the failure is reported as the shape
 * mismatch it is.
 */
async function readJsonSafely(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (text.trim() === '') return undefined;
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** A string field of an error body, or `undefined` when blank or absent. */
function textField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * `Retry-After` in milliseconds, when it is a plain number of seconds.
 *
 * The header's other legal form is an HTTP date, which is not read: a date
 * requires trusting agreement between two clocks, and a wrong answer here
 * becomes a wrong figure in a sentence telling a reviewer when to retry. An
 * unread header yields `undefined`, and `lib/errorCopy.ts` says "a few seconds"
 * rather than inventing a number.
 */
function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (raw === null) return undefined;

  const seconds = Number(raw.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
}

/**
 * A contract revert name relayed inside an error message, if there is one.
 *
 * The backend forwards a revert reason as text, so the ten names are looked for
 * as whole words. Derived from `CONTRACT_ERROR_NAMES` rather than written out
 * again, so a name added to the union is recognised here without a second edit.
 *
 * ONLY CONSULTED ON 500 AND 502, which is where `types.ts` records that judging
 * or settling failed. `Unauthorized` is both one of the ten contract errors and
 * the standard phrase in an HTTP 401 body, so scanning a 401 would answer an
 * authorization failure with "Only the registered oracle can resolve a deal" —
 * a confident sentence about the wrong layer.
 */
const CONTRACT_NAME_PATTERN = new RegExp(`\\b(?:${CONTRACT_ERROR_NAMES.join('|')})\\b`);

function relayedContractError(message: string | undefined): ContractErrorName | null {
  if (message === undefined) return null;
  const match = CONTRACT_NAME_PATTERN.exec(message);
  return match === null ? null : (match[0] as ContractErrorName);
}

/* ===========================================================================
 * §3  Abort, as a value
 * ======================================================================== */

/**
 * The result of a cancelled request. Compared BY IDENTITY, never by shape.
 *
 * WHY A SENTINEL AND NOT AN ERROR KIND. `ApiError` is closed and every member
 * has copy in `content/copy.ts`; an `aborted` member would need a sentence, and
 * there is no sentence to write, because an abort is not a failure a reader can
 * act on — the interface asked for the cancellation. Adding the member would put
 * a variant into a union whose totality is the thing that makes the error panel
 * trustworthy.
 *
 * WHY NOT A THIRD RESULT SHAPE. `hooks/usePolling.ts` takes a fetcher returning
 * `ApiResult<T>`, and widening that type would put an `if (aborted)` in every
 * consumer, including the ones that never cancel anything. One value, recognised
 * by identity, keeps the type as it is and keeps the check optional.
 *
 * The payload is a `network` error so that a caller who does not check still
 * renders something honest rather than reading `undefined`. Nothing distinguishes
 * it by shape, and nothing should: the identity IS the discriminant.
 */
export const ABORTED: ApiResult<never> = Object.freeze({
  ok: false,
  error: Object.freeze({ kind: 'network', base: API_BASE } as const),
} as const);

/**
 * Was this result an abort rather than an answer?
 *
 * The one question a caller asks before writing state. `hooks/usePolling.ts`
 * returns early on `true`, which is how Requirement 9.7's "no state update on
 * abort" is met without a component ever seeing an `AbortError`.
 */
export function isAborted(result: ApiResult<unknown>): boolean {
  return result === ABORTED;
}

/**
 * Did this rejection come from a cancellation?
 *
 * The SIGNAL is checked first and the exception second, in that order on
 * purpose. `signal.aborted` is a fact about what the caller asked for;
 * `error.name === 'AbortError'` is a convention about how a runtime reports it,
 * and it varies — a `DOMException` in a browser, a differently-constructed error
 * in some server runtimes, and occasionally a `TypeError` when a request is torn
 * down mid-flight. Reading the signal first means the answer does not depend on
 * which runtime produced the rejection.
 */
function wasAborted(reason: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted === true) return true;
  if (typeof reason !== 'object' || reason === null) return false;
  return (reason as { name?: unknown }).name === 'AbortError';
}

/* ===========================================================================
 * §4  Status to error
 * ======================================================================== */

/**
 * A failed response as an `ApiError`. Total over every status code.
 *
 * The mapped statuses are the ones `types.ts` documents per route. What happens
 * to the rest is the interesting decision, and it is `malformed`:
 *
 *   A status `types.ts` does not document for a route means the backend and the
 *   contract have DRIFTED, which is precisely what `malformed` says and what its
 *   copy tells a reader to do about it. The realistic case is concrete: with
 *   `NEXT_PUBLIC_API_BASE_ALL=1` set before the five unshipped routes land, the
 *   backend answers 404 on a route this interface expects to exist. "The backend
 *   and `types.ts` have drifted" is exactly right there.
 *
 *   The alternative was to squeeze an unmapped status into a neighbouring
 *   member, and every version of that lies in a field: `status: 500` on a 404,
 *   or a "correct the input and send it again" recovery for a route that is not
 *   deployed. `malformed` carries no status field to falsify.
 *
 * A 404 on a route that takes an identifier is a real not-found and is reported
 * as one — those routes document it, and the subject names which lookup failed.
 */
function toApiError(
  res: Response,
  body: unknown,
  expected: string,
  notFound: NotFoundSubject | undefined,
): ApiError {
  const message = textField(body, 'error');
  const drift: ApiError = { kind: 'malformed', expected };

  switch (res.status) {
    case 400:
      // The backend's own text, verbatim: it knows what it rejected. `field` is
      // a hint it sometimes supplies, and the sandbox accents that exhibit.
      return {
        kind: 'bad-request',
        status: 400,
        message: message ?? '',
        field: textField(body, 'field'),
      };

    case 401:
      return {
        kind: 'unauthorized',
        status: 401,
        envVar: textField(body, 'envVar') ?? UNNAMED_SETTLEMENT_KEY,
      };

    case 404:
      return notFound === undefined
        ? drift
        : { kind: 'not-found', status: 404, resource: notFound.resource, id: notFound.id };

    case 500:
      return (
        contractError(message) ?? { kind: 'server', status: 500, message: message ?? '' }
      );

    case 502:
      return (
        contractError(message) ?? { kind: 'upstream', status: 502, message: message ?? '' }
      );

    case 503:
      return { kind: 'unavailable', status: 503, retryAfterMs: retryAfterMs(res) };

    default:
      return drift;
  }
}

/** A relayed revert as a `contract` error, or `null` to fall through to the status. */
function contractError(message: string | undefined): ApiError | null {
  const name = relayedContractError(message);
  return name === null ? null : { kind: 'contract', name, detail: message };
}

/* ===========================================================================
 * §5  The one request function
 * ======================================================================== */

/**
 * What a call may set.
 *
 * A narrow shape rather than `RequestInit`, which `design.md` sketches, for one
 * concrete reason: merging a default `accept` header into a `HeadersInit` is
 * unsound, because that type is also `Headers` and `[string, string][]`, and
 * spreading either of those silently drops every header. `headers` here is a
 * plain record, so the merge below is the merge it looks like.
 *
 * `json` is the body to send, serialised here. Callers pass a value, never a
 * string, so no call site can send JSON with the wrong content type.
 */
interface RequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly json?: unknown;
  readonly signal?: AbortSignal;
  readonly notFound?: NotFoundSubject;
}

/**
 * Fetch, read, guard. The only `fetch` call in the application.
 *
 * `cache: 'no-store'` on every request. The docket and the activity feed are
 * polled for change, and a cached response would present a stale record as a
 * current one — on the one screen whose claim is that it shows what is happening
 * now. It also keeps Next.js's server-side fetch cache out of the picture for
 * anything that ever renders on the server.
 *
 * The abort check after the body read is deliberate and is not redundant with the
 * one in the `catch`: a request can be cancelled after the response arrived and
 * while its body is being read, and in that case the fetch never rejects.
 * Without the second check, an unmount mid-body would land as a `malformed`
 * error on a response that was fine.
 */
async function request<T>(
  url: string,
  guard: Guard<T>,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { method = 'GET', json, signal, notFound } = options;

  const headers: Record<string, string> = { accept: 'application/json' };
  if (json !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      cache: 'no-store',
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (reason) {
    return wasAborted(reason, signal)
      ? ABORTED
      : { ok: false, error: { kind: 'network', base: API_BASE } };
  }

  const body = await readJsonSafely(res);
  if (signal?.aborted === true) return ABORTED;

  if (!res.ok) {
    return { ok: false, error: toApiError(res, body, expectedShape(guard), notFound) };
  }

  if (!guard(body)) {
    return { ok: false, error: { kind: 'malformed', expected: expectedShape(guard) } };
  }

  return { ok: true, data: body };
}

/* ===========================================================================
 * §6  The endpoints, one function each
 *
 * Every function takes its identifiers raw — never pre-encoded — and an optional
 * `AbortSignal` last, which is the shape `hooks/usePolling.ts` calls: it hands a
 * signal to a fetcher and aborts it on unmount and before each new poll.
 *
 * The guard on each line is the one named in the route table at the head of
 * `lib/guards.ts`. They are the same table, and they have to stay the same table.
 * ======================================================================== */

/** `GET /health`. The one route with no `/api` prefix. */
export function getHealth(signal?: AbortSignal): Promise<ApiResult<HealthResponse>> {
  return request(resolve(ENDPOINTS.health), isHealthResponse, { signal });
}

/** `GET /api/deals` — the docket's source, polled. */
export function getDeals(signal?: AbortSignal): Promise<ApiResult<DealsResponse>> {
  return request(resolve(ENDPOINTS.deals), isDealsResponse, { signal });
}

/** `GET /api/deals/:dealId` — the on-chain side of the verify panel. */
export function getDeal(
  dealId: string,
  signal?: AbortSignal,
): Promise<ApiResult<EscrowDeal>> {
  return request(resolve(ENDPOINTS.deal, dealId), isEscrowDeal, {
    signal,
    notFound: { resource: 'deal', id: dealId },
  });
}

/**
 * `GET /api/verify/:dealId` — the canonical preimage, for local recomputation.
 *
 * A 404 here is `preimage`, not `deal`: the deal may exist and be unresolved,
 * and the verify panel keeps the hashes it already has on screen while saying
 * this one is unavailable.
 */
export function getVerifyPreimage(
  dealId: string,
  signal?: AbortSignal,
): Promise<ApiResult<VerifyPreimageResponse>> {
  return request(resolve(ENDPOINTS.verify, dealId), isVerifyPreimageResponse, {
    signal,
    notFound: { resource: 'preimage', id: dealId },
  });
}

/** `GET /api/judgments/:dealId` — the stored record and the backend's own flag. */
export function getJudgment(
  dealId: string,
  signal?: AbortSignal,
): Promise<ApiResult<JudgmentResponse>> {
  return request(resolve(ENDPOINTS.judgment, dealId), isJudgmentResponse, {
    signal,
    notFound: { resource: 'judgment', id: dealId },
  });
}

/**
 * `GET /api/reputation/:agent` — either identifier form, encoded once on the way
 * into the path.
 *
 * The shipped route answers an unknown agent with a zero-filled summary rather
 * than a 404, so the empty state is driven by `totalJudged === 0`. The subject is
 * supplied anyway, for the case where some other origin does answer 404.
 */
export function getReputation(
  agent: string,
  signal?: AbortSignal,
): Promise<ApiResult<ReputationSummary>> {
  return request(resolve(ENDPOINTS.reputation, agent), isReputationSummary, {
    signal,
    notFound: { resource: 'agent', id: agent },
  });
}

/** `GET /api/agents` — the trust explorer's index. Filtering is client-side. */
export function getAgents(signal?: AbortSignal): Promise<ApiResult<AgentsResponse>> {
  return request(resolve(ENDPOINTS.agents), isAgentsResponse, { signal });
}

/** `GET /api/mcp-activity` — the reputation-query log, polled, newest first. */
export function getMcpActivity(
  signal?: AbortSignal,
): Promise<ApiResult<McpActivityResponse>> {
  return request(resolve(ENDPOINTS.mcpActivity), isMcpActivityResponse, { signal });
}

/**
 * `POST /api/judge` — judge without settling. Nothing reaches the contract.
 *
 * Two validations the caller must respect, both enforced by the shipped route:
 * `deadline` strictly in the future at the moment the request is received, and
 * `acceptanceCriteria` a non-empty array of non-empty strings. Both come back as
 * a 400 whose message is the backend's own text.
 */
export function postJudge(
  body: JudgeRequest,
  signal?: AbortSignal,
): Promise<ApiResult<AuditableVerdict>> {
  return request(resolve(ENDPOINTS.judge), isAuditableVerdict, {
    method: 'POST',
    json: body,
    signal,
  });
}

/**
 * `POST /api/judge-and-settle` — this deployment's proxy, never the backend.
 *
 * The endpoint is pinned, so the URL is same-origin whatever the environment
 * says; the proxy holds the internal key server-side and forwards the request.
 * A 401 means this deployment has no settlement authorization, and the proxy
 * names the variable to set in its body.
 *
 * One requirement beyond `postJudge`: `dealId` must be 32 bytes of non-zero hex,
 * because this path reaches the contract. A slug judges fine and fails to settle.
 */
export function postJudgeAndSettle(
  body: JudgeRequest,
  signal?: AbortSignal,
): Promise<ApiResult<JudgeAndSettleResponse>> {
  return request(resolve(ENDPOINTS.judgeAndSettle), isJudgeAndSettleResponse, {
    method: 'POST',
    json: body,
    signal,
  });
}
