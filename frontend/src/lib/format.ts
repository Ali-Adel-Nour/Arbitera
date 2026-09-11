/**
 * =============================================================================
 * `src/lib/format.ts` — display formatting, at the edge and nowhere else
 * =============================================================================
 *
 * Amounts live as base-unit integers everywhere in this application: strings
 * across the API seam, `bigint` in arithmetic. This module is the one place they
 * become something a person reads, and the conversion happens ONCE, here.
 *
 * NO FLOATING POINT TOUCHES AN AMOUNT. `Number('0.1') * 1e6` is
 * `100000.00000000001`, and a settlement total rounded on a surface whose entire
 * argument is auditability would be indefensible. So the decimal is assembled by
 * string surgery on the `bigint`, not by division.
 */

import { USDC_DECIMALS } from '@/lib/chain';

/**
 * A USDC base-unit amount as a decimal string with its unit.
 *
 * All six decimal places are shown rather than trimmed. On a record surface the
 * exact figure is the point: `250.000000` and `250.000001` are different deals,
 * and a display that hides the difference invites a reader to assume it away.
 *
 * A malformed amount returns a marker rather than throwing. This is a formatter
 * called during render, and the shape guards at the network boundary are what
 * make a malformed value unreachable in the first place — a throw here would
 * take down a whole screen over one bad row.
 */
export function formatUsdc(baseUnits: string): string {
  let value: bigint;
  try {
    value = BigInt(baseUnits);
  } catch {
    return '— USDC';
  }

  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(USDC_DECIMALS + 1, '0');
  const whole = digits.slice(0, -USDC_DECIMALS);
  const fraction = digits.slice(-USDC_DECIMALS);

  // Thousands separators on the whole part only, so a large settled total stays
  // scannable without touching the fractional precision.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${negative ? '-' : ''}${grouped}.${fraction} USDC`;
}

/** The same value with no unit, for a column that carries the unit in its header. */
export function formatUsdcBare(baseUnits: string): string {
  return formatUsdc(baseUnits).replace(' USDC', '');
}

/**
 * A deadline as an absolute UTC instant.
 *
 * Absolute rather than relative, and UTC rather than local. "in 3 hours" is
 * friendlier and wrong for this surface: a deadline is a term of an agreement,
 * two readers in different zones must be able to compare notes, and a relative
 * label silently re-renders as the page sits open. The `Z` is kept so the zone is
 * never in question.
 *
 * Accepts both forms the protocol uses — the chain's Unix-seconds integer and the
 * backend's ISO string.
 */
export function deadlineLabel(deadline: string | number): string {
  const date = typeof deadline === 'number' ? new Date(deadline * 1000) : new Date(deadline);
  if (Number.isNaN(date.getTime())) return 'Deadline unreadable';

  const iso = date.toISOString();
  return `Deadline ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** An ISO instant as a compact UTC stamp, for a log line's timestamp column. */
export function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toISOString().slice(11, 19);
}

/** An ISO instant as a date and time, for recorded metadata. */
export function instantLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not recorded';

  const text = date.toISOString();
  return `${text.slice(0, 10)} ${text.slice(11, 19)} UTC`;
}

/**
 * A [0, 1] rate as a percentage.
 *
 * One decimal place, because the fixtures produce figures like 0.2468 that read
 * as 24.7% and would be misleading at 25%: the trust score depends on that
 * distinction and a reader comparing the two should see it.
 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

/** `2 of 7` — a rate's evidence, which travels with it everywhere. */
export function formatBasis(numerator: number, denominator: number, noun: string): string {
  return `${numerator} of ${denominator} ${noun}`;
}
