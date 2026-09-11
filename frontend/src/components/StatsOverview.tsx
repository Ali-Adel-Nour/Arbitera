/**
 * =============================================================================
 * `StatsOverview` — four figures, each computed here and each drillable by proof
 * =============================================================================
 *
 * The stats row the dark dashboard idiom opens with. Three things about that idiom
 * are refused, and each refusal is the same refusal: do not display a number you
 * cannot account for.
 *
 * NO FIGURE COMES FROM OUTSIDE THE DEALS PAYLOAD. Every one of the four is
 * computed in the browser from the array the docket is already showing, so a
 * reader can check any of them by counting the rows below. That is why there is no
 * "agents indexed" block here even though the reference layout has a fourth
 * figure: it would need a second route, and a figure a reader cannot reconcile
 * against what is on screen with it is exactly the kind of unverifiable number
 * this screen is arguing against.
 *
 * NO DELTAS AND NO SPARKLINES. There is no previous period to compare against.
 * Inventing one is how a reference dashboard ends up showing "+12% this week" for
 * a deployment that has been up for four minutes.
 *
 * ZERO IS NOT THE SAME AS NOTHING, which is the whole reason `StatBlock` takes
 * `value: string | null`. A settled total of zero when nothing has settled is a
 * measurement that was never taken, and `0.000000 USDC` reads as one that was. So
 * the count blocks pass `null` at zero and let the sentence do the talking, and
 * the value blocks pass `null` when their contributing set is empty rather than
 * when their sum happens to be zero — a funded deal of zero would be a real
 * measurement, and the guard should not swallow it.
 */

import { STATS } from '@/content/copy';
import { totalUsdcSettled, settledDeals } from '@/lib/derive';
import { formatUsdc } from '@/lib/format';
import { StatBlock } from '@/components/primitives/StatBlock';
import type { EscrowDeal } from '@/types';

/** The two states in which the contract is holding funds. */
const HOLDING: EscrowDeal['state'][] = ['Funded', 'Submitted'];

/** Sum of escrowed amounts, in base units. `bigint` throughout — see `format.ts`. */
function escrowedTotal(deals: EscrowDeal[]): bigint {
  return deals
    .filter((deal) => HOLDING.includes(deal.state))
    .reduce((sum, deal) => {
      try {
        return sum + BigInt(deal.amount);
      } catch {
        // A malformed amount is dropped from the sum rather than throwing. The
        // shape guards make this unreachable; the fallback keeps one bad row from
        // blanking the whole stats row.
        return sum;
      }
    }, 0n);
}

export function StatsOverview({ deals }: { deals: EscrowDeal[] }) {
  const settled = settledDeals(deals);
  const holding = deals.filter((deal) => HOLDING.includes(deal.state));

  return (
    <section aria-labelledby="stats-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="stats-heading" className="text-caption text-muted uppercase">
          {STATS.heading}
        </h2>
        <p className="text-meta text-muted max-w-[68ch]">{STATS.note}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatBlock
          label={STATS.settledCount.label}
          value={settled.length === 0 ? null : String(settled.length)}
          provenance={STATS.settledCount.provenance}
          emptyState={STATS.settledCount.empty}
        />

        <StatBlock
          label={STATS.settledValue.label}
          // Gated on the contributing SET being empty, not on the sum being zero.
          value={settled.length === 0 ? null : formatUsdc(totalUsdcSettled(deals).toString())}
          provenance={STATS.settledValue.provenance}
          emptyState={STATS.settledValue.empty}
        />

        <StatBlock
          label={STATS.inEscrow.label}
          value={holding.length === 0 ? null : formatUsdc(escrowedTotal(deals).toString())}
          provenance={STATS.inEscrow.provenance}
          emptyState={STATS.inEscrow.empty}
        />

        <StatBlock
          label={STATS.onDocket.label}
          value={deals.length === 0 ? null : String(deals.length)}
          provenance={STATS.onDocket.provenance}
          emptyState={STATS.onDocket.empty}
        />
      </div>
    </section>
  );
}
