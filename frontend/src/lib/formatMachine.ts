/**
 * =============================================================================
 * `src/lib/formatMachine.ts` — how a machine value is shortened for display
 * =============================================================================
 *
 * Machine_Identity_Data is the one class of value in this interface a reader
 * compares character by character: hashes, addresses, deal identifiers,
 * transaction hashes. Two rules govern how it renders, and they pull in opposite
 * directions, which is why they are separated here.
 *
 * HEX TRUNCATES. A 66-character keccak digest in a table row destroys the row.
 * The head and tail are what a reader actually uses to tell two digests apart,
 * so both are kept and the middle is elided.
 *
 * PLAIN IDENTIFIERS DO NOT. `agent-b` is nine characters and every one of them
 * carries meaning; truncating it would lose information and gain nothing
 * (Requirement 7.5). The demo terminal names agents as slugs while the contract
 * names them as addresses, so both forms are live at once and the same component
 * has to handle both without being told which it has.
 *
 * THE COPY PAYLOAD IS ALWAYS THE FULL VALUE. Truncation is a display concern and
 * never touches what reaches the clipboard, because a partial hash pasted into a
 * bug report is worse than useless.
 */

/** A `0x`-prefixed hex string of any length. */
const HEX = /^0x[0-9a-fA-F]+$/;

/**
 * Above this length a hex value is shortened. Chosen so a 42-character address
 * still truncates but a 4-byte selector or a short block number does not: there
 * is nothing to gain from eliding the middle of a six-character value, and the
 * hex-encoded chain id is exactly that length.
 */
export const HEX_TRUNCATE_ABOVE = 20;

/** Characters kept from the head, after the `0x`. */
const HEAD = 6;
/** Characters kept from the tail. */
const TAIL = 4;

/** Is this value hex, and therefore a candidate for truncation? */
export const isHexValue = (value: string): boolean => HEX.test(value);

/**
 * The display form of a machine value.
 *
 * Returns the value unchanged unless it is hex AND long enough to be worth
 * shortening. The ellipsis is a single character rather than three periods so it
 * cannot be mistaken for part of a digest.
 */
export function truncateMachineValue(value: string): string {
  if (!isHexValue(value) || value.length <= HEX_TRUNCATE_ABOVE) return value;
  return `${value.slice(0, 2 + HEAD)}\u2026${value.slice(-TAIL)}`;
}

/** Did this value actually get shortened? Drives the title attribute. */
export const isTruncated = (value: string): boolean =>
  truncateMachineValue(value) !== value;
