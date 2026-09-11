'use client';

/**
 * =============================================================================
 * `src/hooks/usePolling.ts` — the shared polling primitive
 * =============================================================================
 *
 * One `useEffect` and a self-rescheduling `setTimeout`. That is the whole
 * mechanism, and the rest of this file is the reasoning for why it is enough.
 *
 * WHY NOT `setInterval`
 * ---------------------
 * Rejected on correctness, not taste. An interval fires on a fixed schedule
 * whether or not the previous request has settled, so a 4-second response on a
 * 2.5-second cadence produces overlapping requests and out-of-order responses.
 * On a state-grouped docket that is not an abstract hazard: an older response
 * landing after a newer one moves a deal back to the group it just left, so a
 * reviewer watches a row flicker between `Submitted` and `ResolvedSuccess`.
 *
 * A self-rescheduling timeout cannot overlap by construction, because the next
 * timer is only armed in the `finally` of the request that precedes it. There is
 * no bookkeeping to get right and nothing to remember.
 *
 * WHY NOT SWR OR REACT QUERY
 * --------------------------
 * Rejected on footprint. There are three polled call sites, no cache shared
 * between routes, no mutations that must invalidate a read, no pagination, no
 * optimistic updates, and no revalidate-on-focus requirement. Against that, this
 * module is short enough to read in full — which matters more here than in a
 * typical application, because the entire claim of this interface is that you can
 * read what it does and check it. Taking a data-fetching dependency on a page
 * about auditability, to save forty lines, is the wrong trade.
 *
 * The MIGRATION TRIGGER is named so the decision stays revisitable rather than
 * becoming folklore: adopt SWR if two routes need to share a cache entry, or if
 * mutations are added that must invalidate reads. Either case is real work this
 * module would have to grow, and neither is true today.
 *
 * WHY NO BACKOFF
 * --------------
 * Also deliberate. A fixed cadence through failures means the docket recovers
 * within one tick of the backend coming back, which is the behaviour that matters
 * when something is restarted between demo runs. Backoff would trade that for
 * fewer requests against an origin that is already not answering — and the
 * failure is on screen the whole time, with its cause and its recovery, so a
 * tight retry is not hiding anything from the reader.
 *
 * NO COPY HERE
 * ------------
 * This hook produces error VALUES. `lib/errorCopy.ts` turns them into sentences.
 * Nothing in this file is user-facing text.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ABORTED, isAborted } from '@/services/api';
import { API_BASE } from '@/services/endpoints';
import type { ApiError, ApiResult } from '@/types';

/* ===========================================================================
 * §1  The contract
 * ======================================================================== */

/**
 * The cadence, in milliseconds.
 *
 * Requirements 9.2 and 10.6 both specify an interval between 2 and 3 seconds;
 * 2.5s sits in the middle of that window, so neither bound is a rounding error
 * away. One constant, so the docket and the activity feed cannot drift apart.
 */
export const POLL_INTERVAL_MS = 2_500;

/** What every polled region reads. */
export interface PollResult<T> {
  /**
   * The last successful payload, or `null` before the first one arrives.
   *
   * NEVER cleared by a later failure. See §2.
   */
  data: T | null;

  /** The last failure, cleared by the next success. */
  error: ApiError | null;

  /** Is a request outstanding right now? Drives the in-flight rule, not a spinner. */
  isFetching: boolean;

  /** When `data` last changed, as `Date.now()`. Untouched by a failure. */
  lastUpdatedAt: number | null;

  /**
   * Poll now rather than at the next tick.
   *
   * Aborts the in-flight request first, so a reader mashing the control cannot
   * stack requests, and restarts the cadence from this moment.
   */
  refetch: () => void;
}

/* ===========================================================================
 * §2  The transition, as a pure function
 *
 * Extracted from the hook for two reasons. It is the only place `data` is
 * assigned, so "a failure never clears prior data" is checkable by reading one
 * six-line function rather than auditing every branch of an effect. And it is
 * callable without a renderer, so Property 20 can drive it over generated
 * sequences of successes and failures without a DOM in the test process.
 * ======================================================================== */

/** Everything the hook holds, minus `refetch`, which is behaviour rather than state. */
export type PollState<T> = Omit<PollResult<T>, 'refetch'>;

/** Before the first request. `data` starts `null`; only a success ever changes that. */
export function initialPollState<T>(): PollState<T> {
  return { data: null, error: null, isFetching: false, lastUpdatedAt: null };
}

/**
 * Fold one settled result into the state.
 *
 * The success arm is the ONLY assignment to `data` in this module, and there is
 * no `setData(null)` anywhere in it — not in the failure arm, not on unmount, not
 * between polls. That is what Requirements 8.8 and 9.6 ask for, and it is why the
 * docket keeps its rows and the verify panel keeps its hashes while a request is
 * failing: the reader is told the update failed, not shown an empty screen that
 * looks like the records went away.
 *
 * `lastUpdatedAt` follows `data` rather than the request, because it answers "how
 * old is what I am reading" — a failed poll does not make the visible rows any
 * fresher, so advancing it on failure would be a false claim about the data.
 *
 * `error` is cleared on success, so a recovered poll removes the failure notice
 * without anything having to remember to.
 */
export function applyResult<T>(
  state: PollState<T>,
  result: ApiResult<T>,
  now: number,
): PollState<T> {
  if (result.ok) {
    return { data: result.data, error: null, isFetching: false, lastUpdatedAt: now };
  }

  // `data` and `lastUpdatedAt` carry over untouched.
  return { ...state, error: result.error, isFetching: false };
}

/** Mark a request outstanding, returning the same object when it already is. */
function markFetching<T>(state: PollState<T>): PollState<T> {
  return state.isFetching ? state : { ...state, isFetching: true };
}

/* ===========================================================================
 * §3  Calling a fetcher that is not supposed to throw
 * ======================================================================== */

/**
 * The fetcher shape, which is exactly what every function in `services/api.ts`
 * already is: identifiers first and an optional `AbortSignal` last.
 */
export type PollFetcher<T> = (signal: AbortSignal) => Promise<ApiResult<T>>;

/**
 * Await the fetcher, converting a rejection into a value.
 *
 * `services/api.ts` never throws, so on the shipped call sites this `catch` is
 * unreachable — it is here because the alternative to four lines is an unhandled
 * rejection that takes a screen down, and because a future fetcher composed by
 * hand may not hold the same discipline. An abort is reported as `ABORTED` so the
 * caller's identity check covers a thrown cancellation too.
 */
async function settle<T>(fetcher: PollFetcher<T>, signal: AbortSignal): Promise<ApiResult<T>> {
  try {
    return await fetcher(signal);
  } catch {
    return signal.aborted ? ABORTED : { ok: false, error: { kind: 'network', base: API_BASE } };
  }
}

/* ===========================================================================
 * §4  The hook
 * ======================================================================== */

/**
 * Poll `fetcher` every `intervalMs`, starting immediately on mount.
 *
 * FETCHER IDENTITY IS IGNORED ON PURPOSE. The newest fetcher is held in a ref and
 * read at the start of every request, so the loop does not restart when a caller
 * passes an inline lambda. The alternative — `fetcher` in the effect's dependency
 * list — turns one unmemoised call site into a request per render, which is a
 * silent performance failure that the type system cannot catch. The cost of the
 * ref is that a fetcher closing over a changing identifier picks the new one up
 * on the next tick rather than instantly; every polled call site here reads a
 * fixed collection route, so nothing pays it. A call site that cannot wait for a
 * tick wants a reset key, and this is where it would be added.
 *
 * ONE OUTSTANDING REQUEST, ALWAYS. Each run aborts whatever came before it and
 * claims a generation number. The `finally` arms the next timer only for the
 * newest generation, so a superseded run — one that `refetch` cancelled — winds
 * down without leaving a second timer behind. Two timers would not overlap two
 * requests, because each run aborts the previous one, but they would poll at
 * twice the stated cadence, which is the kind of drift nobody notices until the
 * request log is read.
 *
 * UNMOUNT LEAVES NOTHING RUNNING. The `cancelled` ref guards every `setState`,
 * `clearTimeout` drops the pending timer, and `abort()` cancels the in-flight
 * request. The abort is recognised through `isAborted` and returns before any
 * state is written, so unmounting mid-request is silent rather than being
 * recorded as a network failure the reader never caused.
 */
export function usePolling<T>(
  fetcher: PollFetcher<T>,
  intervalMs: number = POLL_INTERVAL_MS,
): PollResult<T> {
  const [state, setState] = useState<PollState<T>>(initialPollState<T>);

  const fetcherRef = useRef<PollFetcher<T>>(fetcher);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  /**
   * The current fetcher, synced after every render. Declared BEFORE the loop
   * effect so it is assigned before the first request on mount.
   */
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  /**
   * `refetch` reaches the loop through this ref rather than closing over it, so
   * the returned callback is stable across renders and is inert between unmount
   * and the next mount.
   */
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Reset rather than initialise: a remount (or a changed interval) reuses the
    // same refs, and a `cancelled` left `true` would silence the new loop.
    cancelled.current = false;

    /** Which run owns the schedule. Incremented by each start, checked in each `finally`. */
    let generation = 0;

    async function run(): Promise<void> {
      if (cancelled.current) return;

      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      inFlight.current?.abort();

      const mine = ++generation;
      const controller = new AbortController();
      inFlight.current = controller;
      setState(markFetching);

      try {
        const result = await settle(fetcherRef.current, controller.signal);

        // The two silent exits, and the only two. An abort is not an answer, so
        // it writes nothing at all — `isFetching` stays true because the run that
        // superseded this one has already set it.
        if (cancelled.current || isAborted(result)) return;

        setState((previous) => applyResult(previous, result, Date.now()));
      } finally {
        // Armed after success, after an HTTP error, and after a network failure
        // alike: nothing but unmount stops the loop (Requirement 9.7). A
        // superseded run does not schedule, because the run that replaced it
        // already owns the next tick.
        if (!cancelled.current && generation === mine) {
          timer.current = setTimeout(() => void run(), intervalMs);
        }
      }
    }

    runRef.current = () => void run();
    void run();

    return () => {
      cancelled.current = true;
      runRef.current = () => {};

      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [intervalMs]);

  const refetch = useCallback(() => runRef.current(), []);

  return { ...state, refetch };
}
