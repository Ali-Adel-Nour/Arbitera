/**
 * =============================================================================
 * `src/lib/resolutionsHref.ts` — the sole producer of a drill-down destination
 * =============================================================================
 *
 * `DrillableMetric` requires an `href` and has no default (Requirement 6.5: a
 * score you cannot open is an assertion). This module is the only thing that
 * builds one, which buys two properties worth having.
 *
 * ONE PLACE TO CHANGE WHEN THE ROUTE MOVES. Fifteen template literals scattered
 * across the trust explorer would leave a dead link on the fifteenth.
 *
 * ENCODING HAPPENS EXACTLY ONCE. An agent identifier is either a slug or a
 * 42-character address, and both forms are live at the same time. `encodeURI-
 * Component` at every call site is one forgotten call away from a broken URL, and
 * one duplicated call away from `%2520`.
 *
 * The `metric` fragment is what makes a drill-down land on the arithmetic the
 * reader clicked rather than at the top of a long list.
 */

/** The figures a reader can drill into. Closed so a typo does not become a 404. */
export type DrillableMetricKey =
  | 'trust-score'
  | 'reliability'
  | 'success-rate'
  | 'settled'
  | 'category';

/**
 * The resolutions list for one agent, anchored at the named metric.
 *
 * `agent` is passed in whichever form the record carries — slug or address — and
 * is not normalised, because the shipped reputation route echoes back the form it
 * was asked about and a normalised link would ask about a different key.
 */
export function resolutionsHref(agent: string, metric?: DrillableMetricKey): string {
  const base = `/agents/${encodeURIComponent(agent)}/resolutions`;
  return metric === undefined ? base : `${base}#${metric}`;
}

/** An agent's detail screen. Same encoding argument. */
export function agentHref(agent: string): string {
  return `/agents/${encodeURIComponent(agent)}`;
}
