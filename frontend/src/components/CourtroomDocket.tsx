'use client';

/**
 * =============================================================================
 * `CourtroomDocket` — the deals, grouped by state, polled
 * =============================================================================
 *
 * SEVEN GROUPS, ALWAYS. `lib/group.ts` guarantees the array; this component
 * renders every entry of it without filtering. An empty group is a statement
 * about the protocol, and hiding it would also make the page jump as the fixture
 * cycle advances — groups appearing and disappearing move every row below them,
 * and a reader loses their place mid-read.
 *
 * A FAILED POLL NEVER EMPTIES THE SCREEN. `usePolling` keeps the last successful
 * payload through a failure, so the error panel appears ABOVE the rows rather
 * than in place of them. That is Requirement 9.6 and it is also the honest
 * rendering: the records did not go away, the update did not arrive. Which is why
 * the error is rendered alongside the groups here and not in an early return.
 *
 * NO SPINNER ON A POLL. A 2.5-second cadence with a spinner per tick is a screen
 * that flashes forever. The in-flight state is carried by one quiet line under the
 * heading, so a reader who wants to know whether the data is live can find out
 * without the page pulsing at them.
 *
 * "NOTHING LOADED YET" AND "NOTHING EXISTS" ARE DIFFERENT FACTS, and
 * `isInitialLoad` separates them. Before the first poll settles the groups render
 * their loading line; afterwards they render their per-state empty sentence. A
 * group claiming "no deal is in this state" before any request has returned would
 * be asserting something it does not know.
 */

import { DOCKET } from '@/content/copy';
import { errorCopy } from '@/lib/errorCopy';
import { isDerivedState } from '@/lib/deriveState';
import { STATE_DISPLAY } from '@/lib/stateDisplay';
import { useEscrows } from '@/hooks/useEscrows';
import { DocketEntry } from '@/components/primitives/DocketEntry';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ErrorState } from '@/components/primitives/ErrorState';
import { Panel } from '@/components/primitives/Panel';
import { StatsOverview } from '@/components/StatsOverview';
import type { DisplayState } from '@/types';

export function CourtroomDocket() {
  const { deals, groups, error, isFetching, lastUpdatedAt, refetch, isInitialLoad } =
    useEscrows();

  return (
    <div className="flex flex-col gap-10">
      <StatsOverview deals={deals} />

      <section aria-labelledby="docket-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="docket-heading" className="text-heading text-hi">
            {DOCKET.heading}
          </h2>
          <p className="text-meta text-muted max-w-[68ch]">{DOCKET.note}</p>
          <p className="text-meta text-muted max-w-[68ch]">{DOCKET.groupsNote}</p>

          {/* The liveness line. `polite` so it does not interrupt, and it reports
              freshness rather than activity: "how old is what I am reading" is the
              question a reader actually has. */}
          <p aria-live="polite" className="text-meta text-muted">
            {isFetching && isInitialLoad
              ? DOCKET.loading
              : lastUpdatedAt === null
                ? DOCKET.loading
                : `Updated ${new Date(lastUpdatedAt).toISOString().slice(11, 19)} UTC`}
          </p>
        </div>

        {/* Above the rows, never instead of them. */}
        {error === null ? null : (
          <ErrorState
            cause={errorCopy(error).cause}
            recovery={errorCopy(error).recovery}
            onRetry={refetch}
            retryLabel="Request the docket again"
          />
        )}

        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const derived = isDerivedState(group.state);

            return (
              <Panel
                key={group.state}
                title={STATE_DISPLAY[group.state].label}
                count={group.deals.length}
                note={derived ? DOCKET.derivedGroupNote : undefined}
              >
                {group.deals.length > 0 ? (
                  group.deals.map((deal) => (
                    <DocketEntry key={deal.dealId} deal={deal} state={group.state} />
                  ))
                ) : (
                  <EmptyState
                    condition={
                      isInitialLoad ? DOCKET.loading : DOCKET.empty[group.state as DisplayState]
                    }
                  />
                )}
              </Panel>
            );
          })}
        </div>
      </section>
    </div>
  );
}
