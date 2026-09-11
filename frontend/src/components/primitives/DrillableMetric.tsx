/**
 * =============================================================================
 * `DrillableMetric` — a reputation figure that opens the resolutions behind it
 * =============================================================================
 *
 * Requirement 6.5's real content is that a score you cannot open is an
 * assertion. The enforcement is a type: `href` is REQUIRED and there is no
 * variant of this component without a destination, so a developer who wants to
 * display a bare reputation figure has to either add a prop or bypass the
 * primitive — and the second is what code review is for.
 *
 * A route rather than a disclosure, because a URL is itself evidence. It can be
 * pasted into a bug report, linked from a README, and opened in a second tab
 * beside the number it explains. An in-place expander cannot be cited.
 *
 * EVERY FIGURE HERE CARRIES `rule/derived`, whose documented meaning is
 * "computed by this interface, not read from the protocol". That is the whole
 * reason the rule-token system survived the restyle: a reader can tell the
 * interface's own arithmetic from chain data by the border, without reading a
 * label. The violet dotted rule says provenance and nothing else — amber was
 * split off to mean only Deliberating.
 */

import Link from 'next/link';

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

interface DrillableMetricProps {
  /** What the figure measures. Rendered at the caption step, tracked caps. */
  label: string;

  /** The figure itself, already formatted. Tabular, so columns align. */
  value: string;

  /**
   * Where the arithmetic lives. REQUIRED and without a default — see the note
   * above. `lib/resolutionsHref.ts` is the only thing that produces one.
   */
  href: string;

  /**
   * The evidence in one phrase: "5 of 5 resolutions", "2 of 7 judgments". A rate
   * with no denominator is an assertion; a rate with one is evidence, and this
   * is where the denominator goes.
   */
  basis?: string;
}

export function DrillableMetric({ label, value, href, basis }: DrillableMetricProps) {
  return (
    <Link
      href={href}
      className={`rule-derived group flex flex-col gap-1 py-1 ${FOCUS}`}
    >
      <span className="text-caption text-muted uppercase">{label}</span>
      <span className="text-heading text-hi group-hover:text-accent-text tabular-nums transition-colors duration-100">
        {value}
      </span>
      {basis === undefined ? null : (
        <span className="text-meta text-muted">{basis}</span>
      )}
    </Link>
  );
}
