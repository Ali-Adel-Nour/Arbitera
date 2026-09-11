/**
 * =============================================================================
 * `src/lib/errorCopy.ts` — every failure, mapped onto two sentences
 * =============================================================================
 *
 * One function is the whole interface of this module: give it an `ApiError` and
 * it returns a cause and a recovery. `ErrorState` renders that pair and knows
 * nothing about which failure produced it.
 *
 * WHY THIS IS A MAPPING AND NOT A SET OF STRINGS
 * ---------------------------------------------
 * The sentences live in `content/copy.ts`; what lives here is the typing that
 * connects them to the union. That split is deliberate and it is doing two jobs.
 *
 * The copy gate (`scripts/check-copy.mjs`) can only be exact if a reviewer-facing
 * sentence has one findable home. Sentences declared inline next to the code that
 * produces the error turn that gate into a fuzzy grep over the whole tree.
 *
 * And totality becomes a compiler property rather than a review property.
 * `ApiError` is CLOSED, `errorCopy` returns a non-optional
 * `{ cause, recovery }`, and the switch below ends in a `never` assignment. Add a
 * member to the union and this file stops compiling — which is the only way
 * Requirement 16.3 stays true as the union grows. The failure mode being designed
 * out is specific and it is bad: an error panel that renders with nothing in it,
 * in front of the one reviewer whose confidence the whole submission depends on.
 *
 * WHAT A RECOVERY LINE IS FOR
 * ---------------------------
 * It is an action, or it is an honest statement that there is no action. Several
 * of the failures here cannot be recovered from by the reader at all — a relayed
 * `Unauthorized`, a passed deadline, a drifted response shape — and each of those
 * says so plainly. "Try again" on a failure a retry cannot fix is worse than
 * silence: it costs the reader an attempt and it teaches them that this panel is
 * not worth reading, which then costs them the messages that were useful.
 *
 * PURITY
 * ------
 * No React, no fetch, no environment reads, no clock. Two imports, both of them
 * data: the copy tables and the types. Every input arrives on the error value.
 * This is a function from a discriminated union to a pair of strings, which is
 * why it is testable in a bare Node process and why Property 19 can hold it to
 * "never throws" over generated input.
 */

import { API_ERROR_COPY, CONTRACT_ERROR_COPY } from '@/content/copy';

import type { ApiError, ContractErrorName, EscrowState } from '@/types';

/* ===========================================================================
 * §1  The pair
 * ======================================================================== */

/**
 * What every failure resolves to. Both members are required and neither is
 * nullable, so there is no shape of this value that renders as a blank panel.
 *
 * `lib/wallet/errorCopy.ts` returns this same pair over `WalletError`, and the
 * two unions stay separate rather than merging into one: an `ApiError` is
 * answered by checking a URL or a server variable, a `WalletError` by unlocking a
 * wallet or funding an address. One component renders both because it accepts the
 * pair rather than the union.
 */
export interface ErrorCopy {
  /** What broke. Names the layer, and the identifier or value where there is one. */
  cause: string;
  /** What to do, or a plain statement that there is nothing to do. */
  recovery: string;
}

/* ===========================================================================
 * §2  The ten contract errors
 * ======================================================================== */

/**
 * The ten names, as a tuple.
 *
 * The copy table's `satisfies Record<ContractErrorName, …>` already makes the
 * messages total over the union — this is the runtime companion, for the two
 * callers that need to enumerate rather than look up: the selector map in
 * `lib/contracts/revert.ts`, which builds `keccak256("Name()")` for each of these
 * and must not drift from the messages, and the distinctness test.
 *
 * Derived from the copy table's own keys rather than written out a second time,
 * so the tuple cannot fall out of step with the messages it indexes. The
 * annotation pins the element type to the union, so a name removed from
 * `ContractErrorName` fails here too.
 */
export const CONTRACT_ERROR_NAMES: readonly ContractErrorName[] = Object.keys(
  CONTRACT_ERROR_COPY,
) as ContractErrorName[];

/**
 * The six on-chain states, at runtime.
 *
 * Needed for one job only: reading two state names out of a relayed
 * `InvalidState` detail. The `satisfies` clause makes a misspelling a compile
 * error, and the unused type alias below makes an OMISSION one —
 * `_NoStateUnlisted` resolves to `never` while every member of `EscrowState`
 * appears in the tuple, and to the missing member otherwise, which then fails its
 * own `extends never` constraint.
 *
 * `lib/deriveState.ts` will want this list too. When it lands, this declaration
 * moves there and this module imports it; it is local for now rather than
 * speculatively placed in a module that does not exist.
 */
const ESCROW_STATE_NAMES = [
  'Created',
  'Funded',
  'Submitted',
  'ResolvedSuccess',
  'ResolvedRefund',
  'ExpiredRefund',
] as const satisfies readonly EscrowState[];

type _NoStateUnlisted<
  T extends never = Exclude<EscrowState, (typeof ESCROW_STATE_NAMES)[number]>,
> = T;

/**
 * Read the current and required states out of a relayed detail string.
 *
 * The relay format is not ours. The backend forwards whatever its revert handling
 * produced, and that has been seen as `current=Funded; required=Submitted`, as
 * `Funded -> Submitted`, and as an ordinary sentence. So the scan keys on the
 * CLOSED SET OF STATE NAMES rather than on punctuation: the first two distinct
 * names it finds, in the order they appear, are the current and the required
 * state.
 *
 * A detail that yields fewer than two names yields nothing, and the caller falls
 * back to the sentence's first clause. Splicing an unrecognised string into the
 * message would be the wrong trade — a sentence with a fragment of someone's log
 * line in the middle of it reads as a defect in the interface, and it tells the
 * reader no more than the shorter sentence does.
 */
function statesFromDetail(detail: string): { current: EscrowState; required: EscrowState } | null {
  const found: EscrowState[] = [];

  for (const match of detail.matchAll(/[A-Za-z]+/g)) {
    const name = ESCROW_STATE_NAMES.find((state) => state === match[0]);
    if (name !== undefined && !found.includes(name)) found.push(name);
    if (found.length === 2) return { current: found[0], required: found[1] };
  }

  return null;
}

/**
 * The message for one contract error. (Requirement 16.5)
 *
 * Pairwise distinct across all ten, non-empty for all ten, and none of them
 * restates its own name. `InvalidState` is the only one that varies with
 * `detail`, and both of its forms are distinct from the other nine.
 */
export function contractErrorCopy(name: ContractErrorName, detail?: string): string {
  if (name === 'InvalidState') {
    const states = detail === undefined ? null : statesFromDetail(detail);
    return states === null
      ? CONTRACT_ERROR_COPY.InvalidState.messageWithoutStates
      : CONTRACT_ERROR_COPY.InvalidState.message(states.current, states.required);
  }

  return CONTRACT_ERROR_COPY[name].message;
}

/* ===========================================================================
 * §3  Small formatters, kept local
 * ======================================================================== */

/** A present, non-blank string. Whitespace is absence, as it is in `lib/chain.ts`. */
const filled = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * A retry delay as a phrase.
 *
 * Rounds to whole seconds and floors at one, so a 200ms delay reads as "1 second"
 * rather than introducing milliseconds as a second unit in a sentence a reader is
 * meant to act on. An absent, zero, negative, or non-finite value gets the
 * unspecified phrase — no figure is invented for a header the backend did not
 * send.
 */
function retryDelayPhrase(retryAfterMs: number | undefined): string {
  const { seconds, unspecifiedDelay } = API_ERROR_COPY.unavailable;
  if (retryAfterMs === undefined || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
    return unspecifiedDelay;
  }
  return seconds(Math.max(1, Math.round(retryAfterMs / 1000)));
}

/* ===========================================================================
 * §4  The mapping
 * ======================================================================== */

/**
 * Cause and recovery for any failure. TOTAL over `ApiError`.
 * (Requirements 16.3, 16.4, 16.7, 11.6)
 *
 * The `default` arm is not a fallback and must never be given a body that
 * returns a value. Its job is to fail to compile: `error` is narrowed to `never`
 * there while the switch covers the union, and to the unhandled member the moment
 * one is added. The throw is unreachable and exists only so the arm has a
 * terminating statement — if it ever runs, the value did not come from `types.ts`.
 *
 * Three arms deserve a note.
 *
 * `bad-request` shows the BACKEND'S OWN TEXT as the cause (Requirement 11.6).
 * It knows what it rejected; this module does not, and paraphrasing would put a
 * guess between the reader and the answer. The recovery names the offending field
 * when the response identified one.
 *
 * `unauthorized` takes the variable name from the error rather than writing it
 * down. The copy gate allows that name in exactly one module under `src/` — the
 * one that reads it — so the sentence interpolates what the producer supplies.
 *
 * `not-found` selects its sentence by resource, so the reader is told which
 * lookup failed. The judgment case is Requirement 16.7 and states that no
 * judgment record exists for the requested deal identifier.
 */
export function errorCopy(error: ApiError): ErrorCopy {
  switch (error.kind) {
    case 'network': {
      const { cause, recovery } = API_ERROR_COPY.network;
      return { cause: cause(filled(error.base) ?? ''), recovery };
    }

    case 'bad-request': {
      const { causeFallback, recovery, recoveryWithField } = API_ERROR_COPY.badRequest;
      const field = filled(error.field);
      return {
        cause: filled(error.message) ?? causeFallback,
        recovery: field === null ? recovery : recoveryWithField(field),
      };
    }

    case 'unauthorized': {
      const { cause, recovery } = API_ERROR_COPY.unauthorized;
      return { cause, recovery: recovery(error.envVar) };
    }

    case 'not-found': {
      const { cause, recovery } = API_ERROR_COPY.notFound;
      return { cause: cause[error.resource](error.id), recovery };
    }

    case 'server':
      return { ...API_ERROR_COPY.server };

    case 'upstream':
      return { ...API_ERROR_COPY.upstream };

    case 'unavailable': {
      const { cause, recovery } = API_ERROR_COPY.unavailable;
      return { cause, recovery: recovery(retryDelayPhrase(error.retryAfterMs)) };
    }

    case 'contract':
      return {
        cause: contractErrorCopy(error.name, error.detail),
        recovery: CONTRACT_ERROR_COPY[error.name].recovery,
      };

    case 'malformed': {
      const { cause, recovery } = API_ERROR_COPY.malformed;
      return { cause: cause(filled(error.expected) ?? 'declared in types.ts'), recovery };
    }

    default: {
      const unhandled: never = error;
      throw new Error(`errorCopy: unhandled ApiError ${JSON.stringify(unhandled)}`);
    }
  }
}
