/**
 * =============================================================================
 * `VerdictBanner` — the one loud thing in the entire interface
 * =============================================================================
 *
 * This file holds THREE budgets that no other file may spend, and each one is
 * enforced by `scripts/check-design.mjs` rather than by convention:
 *
 *   `bg-ruling-ground`  the only background token whose OKLCH chroma clears
 *                       0.08. `boldness-chroma` maps that token to this
 *                       filename; using it anywhere else fails the build.
 *   `text-ruling`       the top type step. `ruling-step-budget` allows it in at
 *                       most one file.
 *   animation           `motion-duration` names this file MOTION_OWNER, so it is
 *                       the only place a duration over 200ms or an `animate-`
 *                       class may appear.
 *
 * WHY HERE AND NOWHERE ELSE. A judged deal has exactly one irreversible fact —
 * the money moved this way and not the other way. If every panel could go loud,
 * that fact would compete with chrome. Concentrating all three budgets in one
 * component means the loudest thing on any screen is always the verdict, and the
 * gates make that structural instead of aspirational.
 *
 * THE GRADIENT IS NOT HERE, ON PURPOSE. The two-file gradient cap is already
 * spent on the home hero and the nav rule. A gradient stretched across "PASS"
 * would be decoration applied to the single most consequential word on the
 * screen, and this component's boldness budget is already fully committed.
 *
 * PASS AND FAIL ARE DISTINGUISHED BY THE WORD FIRST. Requirement 14.5 — the
 * outcome is spelled out at the ruling step; the ink shifts underneath it. A
 * reader who cannot separate the two inks reads the word and loses nothing.
 */

import { formatUsdc } from '@/lib/format';
import type { VerdictOutcome } from '@/types';

interface VerdictBannerProps {
  /** `PASS` or `FAIL`, exactly as the protocol spells it. */
  outcome: VerdictOutcome;

  /** Who is paid, in words: "Seller paid" / "Buyer refunded". */
  settlement: string;

  /** The amount that moved, in USDC base units. */
  amount: string;

  /**
   * True on first paint after a verdict lands during polling, so the banner can
   * announce itself once. Default `false`: a record opened directly is not new,
   * and animating on every navigation would make the motion meaningless.
   */
  isFresh?: boolean;
}

export function VerdictBanner({
  outcome,
  settlement,
  amount,
  isFresh = false,
}: VerdictBannerProps) {
  const pass = outcome === 'PASS';

  return (
    <section
      // `polite`, not `assertive`. The verdict is consequential but it is not an
      // interruption, and `assertive` cuts off whatever a screen reader is
      // mid-sentence on.
      aria-live="polite"
      className={[
        'bg-ruling-ground rounded-[--radius-panel] px-6 py-8 md:px-10 md:py-12',
        // The one animation in the application. Gated to a single fade so it
        // reads as "this just arrived" rather than as an entrance; and
        // `motion-reduce:animate-none` because a reader who asked for less
        // motion still needs the verdict, just not the fade.
        isFresh ? 'animate-in fade-in duration-500 motion-reduce:animate-none' : '',
      ].join(' ')}
    >
      <h2 className="text-caption text-muted uppercase">Verdict</h2>

      <p
        className={`text-ruling ruling-stretch pt-2 ${
          pass ? 'text-state-paid' : 'text-state-refunded'
        }`}
      >
        {outcome}
      </p>

      {/* The consequence, in words and then in figures. A reader should not have
          to know that PASS implies the seller is paid — that inference is the
          protocol's, and stating it is cheaper than assuming it. */}
      <dl className="flex flex-col gap-1 pt-4">
        <dt className="text-caption text-muted uppercase">Settlement</dt>
        <dd className="text-lede text-hi">{settlement}</dd>
        <dd className="text-record text-primary tabular-nums">{formatUsdc(amount)}</dd>
      </dl>
    </section>
  );
}
