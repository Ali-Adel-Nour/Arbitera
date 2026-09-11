'use client';

/**
 * =============================================================================
 * `TrustExplorer` — the agent list, filtered in the browser
 * =============================================================================
 *
 * FILTERING IS CLIENT-SIDE OVER THE WHOLE LIST, and `types.ts` already commits to
 * that: the list is small, the input should feel instant, and a round trip per
 * keystroke would be worse in every way. It also means the filter cannot fail —
 * there is no request to lose.
 *
 * THE FILTER MATCHES IDENTIFIERS AND CATEGORIES, both forms of identifier
 * included. An agent is addressable as a slug and as an address, and a reviewer
 * who pasted an address should find the row that a slug also finds. Matching
 * categories as well is what makes "who has done data-analysis work" answerable
 * without a second control.
 *
 * "NO AGENTS" AND "NO MATCHES" ARE DIFFERENT SENTENCES, because they are different
 * facts: one is a statement about the deployment, the other about what was typed.
 * Collapsing them would tell a reviewer whose filter matched nothing that the
 * protocol has no agents.
 *
 * UNREADABLE ROWS ARE COUNTED OUT LOUD. `useAgents` drops a row whose reputation
 * could not be read rather than failing the screen, and this component reports how
 * many. Rows quietly vanishing from a trust surface is how a reader ends up
 * trusting a list that is incomplete.
 */

import { useMemo, useState } from 'react';

import { AGENTS } from '@/content/copy';
import { errorCopy } from '@/lib/errorCopy';
import { formatBasis } from '@/lib/format';
import { useAgents, type AgentSummaryRow } from '@/hooks/useAgents';
import { AgentRow } from '@/components/primitives/AgentRow';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ErrorState } from '@/components/primitives/ErrorState';
import { Panel } from '@/components/primitives/Panel';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Does this row match the filter?
 *
 * Case-insensitive substring over both identifier forms and every category. A
 * substring rather than a prefix, because `data-analysis` should be findable by
 * typing `analysis`, and an address is far more likely to be recognised by its
 * tail than by its head.
 */
function matches(row: AgentSummaryRow, needle: string): boolean {
  if (needle === '') return true;
  const q = needle.toLowerCase();

  return (
    row.agent.toLowerCase().includes(q) ||
    (row.address?.toLowerCase().includes(q) ?? false) ||
    row.taskCategories.some((category) => category.toLowerCase().includes(q))
  );
}

export function TrustExplorer() {
  const { rows, unreadable, error, isLoading, loadedAt, reload } = useAgents();
  const [filter, setFilter] = useState('');

  const visible = useMemo(
    () => rows.filter((row) => matches(row, filter)),
    [rows, filter],
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-5">
        <h1 className="text-display text-hi max-w-[24ch]">{AGENTS.heading}</h1>
        <p className="text-lede text-muted max-w-[62ch]">{AGENTS.lede}</p>
      </header>

      {error === null ? null : (
        <ErrorState
          cause={errorCopy(error).cause}
          recovery={errorCopy(error).recovery}
          onRetry={reload}
          retryLabel="Request the agent list again"
        />
      )}

      <section aria-labelledby="agents-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="agents-heading" className="text-heading text-hi">
            {AGENTS.listHeading}
          </h2>
          <p className="text-meta text-muted max-w-[68ch]">{AGENTS.listNote}</p>
        </div>

        {/* A visible label, not a placeholder standing in for one. A placeholder
            disappears the moment a reader types, so it cannot be the only thing
            naming the control. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="agent-filter" className="text-caption text-muted uppercase">
            {AGENTS.filterLabel}
          </label>
          <input
            id="agent-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={AGENTS.filterPlaceholder}
            className={`bg-well text-body text-primary placeholder:text-muted w-full max-w-[32rem] rounded-[--radius-control] border border-rule px-3.5 py-2.5 transition-colors duration-150 ${FOCUS}`}
          />
        </div>

        {unreadable === 0 ? null : (
          <p className="text-meta text-muted max-w-[68ch]">{AGENTS.unreadable(unreadable)}</p>
        )}

        <Panel title={AGENTS.listHeading} count={visible.length}>
          {isLoading && rows.length === 0 ? (
            <EmptyState condition={AGENTS.loading} />
          ) : rows.length === 0 ? (
            <EmptyState condition={AGENTS.empty} />
          ) : visible.length === 0 ? (
            // A filter that matched nothing. Not the same as an empty deployment.
            <EmptyState condition={AGENTS.noMatches} />
          ) : (
            visible.map((row) => (
              <AgentRow
                key={row.agent}
                agent={row.agent}
                score={row.score}
                tier={row.tier}
                reliability={row.reliability}
                basis={formatBasis(row.summary.successes, row.totalJudged, 'resolutions')}
              />
            ))
          )}
        </Panel>

        {loadedAt === null ? null : (
          <p className="text-meta text-muted">
            Computed {new Date(loadedAt).toISOString().slice(11, 19)} UTC
          </p>
        )}
      </section>
    </div>
  );
}
