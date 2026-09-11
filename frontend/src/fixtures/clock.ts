/**
 * =============================================================================
 * `src/fixtures/clock.ts` — the fixture clock, and the one decision in it
 * =============================================================================
 *
 * Fixture deal state is a pure function of ABSOLUTE wall-clock time, modulo a
 * fixed cycle. Nothing here reads a module-load time, a build-time constant, or
 * a request-scoped value, and that is the whole point of the module.
 *
 * WHY NOT A MODULE-LOAD EPOCH
 * ---------------------------
 * The obvious implementation is:
 *
 *     const EPOCH_MS = Date.now();          // rejected
 *     const elapsed  = Date.now() - EPOCH_MS;
 *
 * In `next dev` that works: one Node process, one epoch, stable across a full
 * page reload because the epoch lives on the server rather than in the page.
 * The target is not `next dev`. The Mock_API route handlers run server-side on
 * a platform where each invocation may land on a different serverless instance,
 * each with its own module-load time. Two polls 2.5 seconds apart could hit
 * instances whose epochs differ by minutes, and the docket would show a deal
 * moving BACKWARDS through the state machine — `ResolvedSuccess` back to
 * `Funded`. On stage that reads as a bug in the protocol rather than a bug in
 * the fixtures, which is the most expensive kind of defect this interface can
 * ship.
 *
 * `Date.now() % CYCLE_MS` has none of that. It is identical on every process,
 * every instance, and after every cold start, because it depends on nothing but
 * the clock the whole fleet already agrees on.
 *
 * WHAT FOLLOWS FROM IT, STATED PLAINLY
 * ------------------------------------
 * - Across a page reload: state is unchanged, because it never depended on when
 *   the page loaded. Reloading mid-deliberation lands back in deliberation.
 * - Across the server/client boundary: the client never computes fixture state.
 *   Route handlers own this clock; components render whatever states the
 *   response carried. A laptop clock seconds out of step has no visible effect,
 *   because there is no client-side recomputation to disagree with.
 * - The trade-off: the timeline LOOPS every 48 seconds, so a resolved deal
 *   returns to `Funded`. That is disclosed in the docket's own footer copy
 *   rather than hidden. A monotonic alternative — baking a seed at build time —
 *   was rejected because it goes stale: a deployment made two days before a
 *   review would show every deal expired.
 *
 * A build-time seed and a module-load epoch are the two ways to get this wrong,
 * and neither is reachable from here: this module has no imports at all.
 */

/**
 * One full demo loop.
 *
 * 48 seconds is chosen against the 2.5-second poll interval: it is long enough
 * that a presenter can narrate one deal's progression without it looping
 * mid-sentence, and short enough that a reviewer arriving at any moment sees
 * the docket change within a few polls rather than reading a static list.
 */
export const CYCLE_MS = 48_000;

/**
 * Timeline granularity: eight steps per cycle.
 *
 * Every fixture step boundary is a multiple of this, and no two consecutive
 * steps in a timeline are closer together than this. That gap is what satisfies
 * Requirement 4.4 with margin: the requirement asks that two polls more than
 * 3 seconds apart CAN return different state groupings, and a 6-second minimum
 * gap means a pair of samples 3 seconds apart can straddle a boundary rather
 * than being guaranteed to miss every one of them.
 */
export const STEP_MS = 6_000;

/** Steps per cycle. Derived, not typed twice. */
export const STEPS_PER_CYCLE = CYCLE_MS / STEP_MS;

/**
 * The largest instant a `Date` can hold, either side of the epoch.
 *
 * `new Date(x).toISOString()` throws a `RangeError` beyond this, and the one
 * place this module formats an instant is inside a snapshot a route handler is
 * serialising. A throw there would take out a whole response, so the bound is
 * respected rather than trusted.
 */
const MAX_TIME_MS = 8.64e15;

/**
 * Position within the current cycle, in `[0, CYCLE_MS)`.
 *
 * Identical on every process, every instance, forever — that is the property
 * the whole Fixture_Engine rests on, and the reason `nowMs` is a parameter with
 * a default rather than a `Date.now()` call in the body: a caller can pass any
 * instant and assert the result, which is what makes the engine testable.
 *
 * TWO DEVIATIONS FROM A BARE `nowMs % CYCLE_MS`, BOTH NARROWING THE OUTPUT
 * RATHER THAN CHANGING IT. For every real timestamp this function is exactly
 * that expression; the handling below only covers inputs a test generator can
 * produce and a clock cannot:
 *
 *   EUCLIDEAN, NOT TRUNCATED, REMAINDER. JavaScript's `%` keeps the sign of the
 *   dividend, so a pre-epoch instant would yield a NEGATIVE position, every
 *   timeline lookup would fall back to its first step, and a deal would report
 *   `Created` for a whole range of inputs. Adding `CYCLE_MS` before the second
 *   remainder keeps the result in range for any sign.
 *
 *   NON-FINITE INPUT COLLAPSES TO ZERO. `NaN % n` is `NaN`, which compares
 *   false against every step boundary and would silently produce the same
 *   first-step fallback. Position zero is the honest answer to a nonsense
 *   instant: it is the start of the cycle, not a state chosen to look plausible.
 */
export function cyclePosition(nowMs: number = Date.now()): number {
  const ms = Number.isFinite(nowMs) ? Math.floor(nowMs) : 0;
  return ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
}

/**
 * An ISO instant for a millisecond value, clamped to what a `Date` can hold.
 *
 * Used for the derived `judgeRequestedAt`, which is computed as an offset from
 * `nowMs` and therefore inherits whatever the caller passed. Clamping rather
 * than throwing keeps `snapshotAt` total: a route handler always gets a
 * serialisable deal, and the guards in `lib/guards.ts` always get a well-formed
 * ISO string with an explicit zone.
 */
export function isoInstantAt(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.min(Math.max(ms, -MAX_TIME_MS), MAX_TIME_MS) : 0;
  return new Date(safe).toISOString();
}
