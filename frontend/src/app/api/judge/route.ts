/**
 * =============================================================================
 * `POST /api/judge` — the fixture judge  (Requirements 4.1, 4.2, 11.7)
 * =============================================================================
 *
 * The one Mock_API route that takes a body. It exists so the injection sandbox
 * works on a deployment with no backend and no model provider configured, which
 * is the deployment a reviewer will open first.
 *
 * NO LANGUAGE MODEL IS CALLED, AND THE RECORD SAYS SO
 * --------------------------------------------------
 * There is no `fetch` here (Requirement 2.7). The decision comes from a
 * deterministic rule over the submitted text, and the first sentence of every
 * `reasoning` this route produces states that plainly, so the record cannot be
 * mistaken for the output of an evaluation. `modelId` names the fixture judge
 * rather than borrowing a real model's name — that field is inside the verdict
 * hash, and a record that attributed a rule to `gpt-4o-mini` would be a false
 * attribution committed to by a hash.
 *
 * THE RULE, AND WHY IT IS THE RULE
 * --------------------------------
 * A deliverable carrying an instruction addressed to the evaluator is refused;
 * anything else is recorded as satisfying the criteria. That asymmetry is the
 * whole point. The sandbox submits two payloads and the honest one must pass
 * while the injection one must fail, or the screen demonstrates nothing. A rule
 * that approved everything would make the injection preset look successful, which
 * is the most misleading thing this route could do.
 *
 * What the rule does NOT do is evaluate work. It cannot, and the reasoning says
 * so rather than implying otherwise.
 *
 * THE HASHES ARE REAL
 * -------------------
 * The returned record is sealed by `sealRecord`, the same function the two
 * fixture records go through, so its three hashes are computed over its own
 * material by the module the browser runs. A reviewer who opens the returned
 * record in the verify panel gets a genuine three-way answer rather than a
 * decorative one.
 *
 * THE TWO VALIDATIONS THE SHIPPED ROUTE ENFORCES
 * ----------------------------------------------
 * `acceptanceCriteria` must be a non-empty array of non-empty strings, and
 * `deadline` must resolve to an instant strictly in the future. Both come back as
 * a 400 carrying the backend's error text plus a `field` hint, which is what
 * Requirement 11.7 asks the sandbox to render against the offending exhibit.
 *
 * ONE DELIBERATE DEVIATION: `dealId` MUST BE 32 BYTES OF NON-ZERO HEX HERE.
 * The shipped route accepts any non-empty string, because it judges without
 * settling. This route cannot, and the reason is structural rather than a policy
 * choice: `dealId` is echoed into the record, `isAuditableVerdict` checks it with
 * `isNonZeroHex32`, and `services/api.ts` guards the response with that same
 * guard. A slug would produce a well-formed-looking 200 that the client then
 * reported as `malformed` — a failure pointing at the wrong layer. Rejecting it
 * here names the input instead. Nothing in this interface is affected: the
 * sandbox's own proxy mints a bytes32 identifier server-side, and the settling
 * route requires one anyway.
 */

import { badRequest, json } from '@/app/api/mockApi';
import { isoInstantAt } from '@/fixtures/clock';
import { judgePrompt, modelResponse, sealRecord, type RawVerdict } from '@/fixtures/records';
import { normalizeDeadline } from '@/lib/canonicalize';
import { isAuditableVerdict, isJudgeRequest, isNonZeroHex32 } from '@/lib/guards';
import type { Hex32, JudgeRequest } from '@/types';

export const dynamic = 'force-dynamic';

/* ===========================================================================
 * §1  Who produced the record
 * ======================================================================== */

/**
 * The judge's identity, as recorded. Both fields are inside the verdict hash.
 *
 * Named for what actually ran. A reader comparing this against the two fixture
 * records — which carry a real model's identity, because they are snapshots of
 * records that model produced — can tell at a glance which is which.
 */
const FIXTURE_MODEL_ID = 'arbitra-fixture-judge';
const FIXTURE_MODEL_VERSION = 'deterministic-rule-1';

/**
 * The sentence every fixture verdict opens with.
 *
 * It is inside the hash, so it cannot be edited out of a stored record without
 * breaking the commitment — which is a small but real guarantee that a record
 * produced without a model cannot later be presented as one that had one.
 */
const NO_MODEL_NOTICE =
  'No language model was called. This deployment is serving fixture data from its own route handlers, so the decision below comes from a deterministic rule over the submitted text rather than from an evaluation of the work.';

/* ===========================================================================
 * §2  The rule
 * ======================================================================== */

/**
 * Instructions addressed to the evaluator, as they actually get written.
 *
 * Each pattern matches a directive rather than a topic, so a deliverable that
 * DISCUSSES prompt injection — a security write-up, say, which is a legitimate
 * deliverable — is not refused for describing the thing. `\b` boundaries and the
 * verb-first shapes are what keep that distinction.
 */
const OVERRIDE_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+|any\s+)?(?:previous|prior|earlier|above|preceding)\s+(?:instructions?|rules?|prompts?|criteria)\b/i,
  /\bdisregard\s+(?:all\s+|the\s+)?(?:previous|prior|earlier|above|preceding)\b/i,
  /\boverride\s+(?:the\s+|your\s+)?(?:rules?|instructions?|criteria|evaluation)\b/i,
  /\b(?:you\s+must|please)\s+approve\b/i,
  /\bapprove\s+(?:this|the)\s+(?:work|deliverable|submission|task)\b/i,
  /\breturn\s+(?:a\s+)?(?:pass|approved|approval)\b/i,
  /^\s*(?:system|assistant|developer)\s*:/im,
];

/** The first override attempt in the text, or `null`. */
function overrideAttempt(deliverable: string): string | null {
  for (const pattern of OVERRIDE_PATTERNS) {
    const match = pattern.exec(deliverable);
    if (match !== null) return match[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

/** The decision, and the reasoning that states how it was reached. */
function decide(
  deliverable: string,
  criteriaCount: number,
): { approved: boolean; reasoning: string } {
  const attempt = overrideAttempt(deliverable);
  const criteria = `${criteriaCount} acceptance criteri${criteriaCount === 1 ? 'on' : 'a'}`;

  if (attempt !== null) {
    return {
      approved: false,
      reasoning: `${NO_MODEL_NOTICE} The deliverable contains an instruction addressed to the evaluator rather than work product: "${attempt}". A deliverable is untrusted data, so an instruction inside one is not followed. Refused, and nothing in the submitted text is offered as evidence against the ${criteria}.`,
    };
  }

  return {
    approved: true,
    reasoning: `${NO_MODEL_NOTICE} The deliverable carries no instruction addressed to the evaluator, so it was treated as ordinary work product and recorded against the ${criteria}. This record commits to what was submitted; it is not a finding about whether the work is good.`,
  };
}

/* ===========================================================================
 * §3  Reading the request
 * ======================================================================== */

/** The shipped route's sentence, which this route extends rather than replaces. */
const INVALID_INPUT =
  'Invalid input. Expected dealId, acceptanceCriteria[], deliverable, and deadline.';

interface Rejection {
  readonly error: string;
  readonly field?: string;
}

type Validated =
  | {
      readonly ok: true;
      readonly request: JudgeRequest;
      /** Narrowed by `isNonZeroHex32`, so the record needs no cast to hold it. */
      readonly dealId: Hex32;
      /** Canonical ISO, already checked to be in the future. */
      readonly deadline: string;
    }
  | { readonly ok: false } & Rejection;

const reject = (detail: string, field?: string): Validated => ({
  ok: false,
  error: `${INVALID_INPUT} ${detail}`,
  field,
});

/**
 * The deadline as a canonical ISO instant, strictly after `nowMs`.
 *
 * `normalizeDeadline` is the same function the preimage builder applies, so the
 * string that goes into the record is the string that gets hashed. It throws on a
 * value that is not a real instant, and the throw is caught here rather than
 * escaping as a 500: an unparseable deadline is the sender's input, not this
 * deployment failing.
 */
function futureDeadline(value: string | number, nowMs: number): string | null {
  let iso: string;
  try {
    iso = normalizeDeadline(value);
  } catch {
    return null;
  }

  return Date.parse(iso) > nowMs ? iso : null;
}

/**
 * The body, checked field by field so the 400 can name the field at fault.
 *
 * `isJudgeRequest` alone would answer "no" without saying which member, and
 * Requirement 11.7 wants the offending exhibit accented rather than a generic
 * banner. So the members are checked in the order a reader would look at them and
 * the guard runs last as a backstop — it is the shape the rest of the handler is
 * typed against, and a hand-rolled check that drifted from it would be worse than
 * no check at all.
 */
function validate(body: unknown, nowMs: number): Validated {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return reject('The request body must be a JSON object.');
  }

  const input = body as Record<string, unknown>;
  const dealId = input.dealId;

  if (!isNonZeroHex32(dealId)) {
    return reject('dealId must be 32 bytes of non-zero hex.', 'dealId');
  }

  if (
    !Array.isArray(input.acceptanceCriteria) ||
    input.acceptanceCriteria.length === 0 ||
    !input.acceptanceCriteria.every((item) => typeof item === 'string' && item.trim() !== '')
  ) {
    return reject(
      'acceptanceCriteria must be a non-empty array of non-empty strings.',
      'acceptanceCriteria',
    );
  }

  if (typeof input.deliverable !== 'string' || input.deliverable.trim() === '') {
    return reject('deliverable must be a non-empty string.', 'deliverable');
  }

  if (typeof input.deadline !== 'string' && typeof input.deadline !== 'number') {
    return reject('deadline must be Unix seconds or an ISO 8601 instant.', 'deadline');
  }

  const deadline = futureDeadline(input.deadline, nowMs);
  if (deadline === null) {
    return reject('deadline must resolve to an instant strictly in the future.', 'deadline');
  }

  if (!isJudgeRequest(body)) {
    return reject('One or more optional members carry the wrong type.');
  }

  return { ok: true, request: body, dealId, deadline };
}

/* ===========================================================================
 * §4  The handler
 * ======================================================================== */

export async function POST(request: Request): Promise<Response> {
  const nowMs = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // An unparseable body is a 400 and not a 500: nothing failed on this side.
    return badRequest(`${INVALID_INPUT} The request body is not valid JSON.`);
  }

  const validated = validate(body, nowMs);
  if (!validated.ok) return badRequest(validated.error, validated.field);

  const { request: judged, dealId, deadline } = validated;
  const { approved, reasoning } = decide(judged.deliverable, judged.acceptanceCriteria.length);

  // The task statement the shipped route builds for its prompt, reproduced so the
  // prompt exhibit on the sandbox screen has the shape a real record's does.
  const task = [
    `Evaluate the deliverable for deal ${dealId}.`,
    `The deliverable must satisfy every acceptance criterion and be completed by ${deadline}.`,
    'The deadline is evaluation context; do not approve work submitted after it.',
  ].join(' ');

  const raw: RawVerdict = {
    dealId,
    // Spread rather than assigned, so an absent member stays ABSENT. An explicit
    // `undefined` would serialise away, and canonicalization drops the member
    // either way — but a key that vanishes between the record this route hashed
    // and the record a client reads is a difference worth not having.
    ...(judged.buyer === undefined ? {} : { buyer: judged.buyer }),
    ...(judged.seller === undefined ? {} : { seller: judged.seller }),
    ...(judged.taskCategory === undefined ? {} : { taskCategory: judged.taskCategory }),
    deadline,
    acceptanceCriteria: judged.acceptanceCriteria,
    deliverable: judged.deliverable,
    approved,
    reasoning,
    modelId: FIXTURE_MODEL_ID,
    modelVersion: FIXTURE_MODEL_VERSION,
    evaluationPrompt: judgePrompt(task, judged.acceptanceCriteria, judged.deliverable),
    rawResponse: modelResponse(approved, reasoning),
    // Outside the hash by construction: `timestamp` is not a member of the
    // seventeen-field preimage, which is what makes the hash reproducible.
    timestamp: isoInstantAt(nowMs),
  };

  return json(isAuditableVerdict, sealRecord(raw));
}
