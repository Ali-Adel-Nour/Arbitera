/**
 * =============================================================================
 * `StatBlock` — one label, one figure, one provenance line
 * =============================================================================
 *
 * The big-single-figure card, adopted from the dark dashboard idiom. Three things
 * about it are deliberately NOT adopted, and each one is where that idiom starts
 * fabricating.
 *
 * NO SPARKLINE, NO DELTA ARROW, NO COMPARISON TO LAST PERIOD. There is no last
 * period. Inventing one is precisely how a reference dashboard ends up
 * displaying a portfolio-scale figure it never measured, and Requirement 14.14
 * forbids placeholder, sample, and illustrative figures outright.
 *
 * AN ABSENT FIGURE IS A SENTENCE, NOT A DASH OR A ZERO. When the underlying data
 * does not exist the block says what would produce it (Requirement 16.2). A dash
 * reads as "nothing happened"; a zero reads as a measurement. Neither is true
 * when the answer is "no deals have settled yet in this cycle", which on a
 * 48-second fixture loop is the common case for part of every cycle.
 *
 * EVERY BLOCK CARRIES `rule/derived`, because every figure on the home screen is
 * computed by this interface rather than read from a shipped route. The border
 * says so without a label, which is the rule-token system doing its job.
 */

interface StatBlockProps {
  /** What the figure measures. */
  label: string;

  /**
   * The figure, already formatted, or `null` when there is nothing to show.
   * `null` rather than an empty string so the absent case cannot be reached by
   * accident from a formatter that returned early.
   */
  value: string | null;

  /**
   * How the figure was arrived at — the denominator, the window, the source.
   * Rendered whether or not the figure is present.
   */
  provenance: string;

  /** What would produce a figure. Shown in place of `value` when it is `null`. */
  emptyState: string;
}

export function StatBlock({ label, value, provenance, emptyState }: StatBlockProps) {
  return (
    <div className="bg-panel-1 rounded-[--radius-panel] border border-panel-edge p-6 md:p-7">
      <div className="rule-derived flex flex-col gap-2">
        <span className="text-caption text-muted uppercase">{label}</span>

        {value === null ? (
          <p className="text-body text-muted max-w-[36ch]">{emptyState}</p>
        ) : (
          <span className="text-display text-hi tabular-nums">{value}</span>
        )}

        <span className="text-meta text-muted">{provenance}</span>
      </div>
    </div>
  );
}
