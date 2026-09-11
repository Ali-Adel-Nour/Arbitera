/**
 * =============================================================================
 * `src/lib/persisted.ts` — the type that makes "persist before you sign" a rule
 * =============================================================================
 *
 * THE HAZARD THIS EXISTS TO PREVENT. The escrow stores a HASH of the criteria and
 * a HASH of the deliverable. It does not store the text. So if a transaction lands
 * on chain and the text behind those hashes was never written down anywhere, the
 * deal is permanently unauditable: the commitment exists and the preimage does
 * not. Nobody can ever verify it, including the person who signed it. That is not
 * a recoverable mistake — the money moves against a hash whose meaning is gone.
 *
 * The ordering rule is therefore: PERSIST THE TEXT, THEN SIGN.
 *
 * WHY A BRANDED TYPE RATHER THAN A COMMENT. A comment saying "call the persist
 * step first" is advice. A type that the signing function demands, and that only
 * the persist step can produce, is a rule the compiler enforces: there is no way
 * to reach the signature without holding evidence that the text was stored,
 * because the evidence IS the argument.
 *
 * The brand is a unique symbol, so it cannot be forged by writing an object
 * literal — a caller cannot satisfy the type by asserting the shape. The only
 * producer is `markPersisted`, and it is deliberately the only export that
 * returns one.
 *
 * WHAT THIS DOES NOT CLAIM. It proves the persist call RETURNED, not that the
 * bytes are durable forever. A backend that accepted the record and lost it later
 * defeats this, and no type can prevent that. What the brand removes is the
 * ordering mistake, which is the one failure mode reachable from this codebase.
 */

declare const persisted: unique symbol;

/**
 * Text that has been written down somewhere durable, and may therefore be hashed
 * into a transaction.
 *
 * Generic over the payload so the same guarantee covers criteria (a string array)
 * and a deliverable (a string) without two brands to keep in step.
 */
export type Persisted<T> = T & { readonly [persisted]: true };

/** Criteria that were stored before their hash reached a signature. */
export type PersistedCriteria = Persisted<readonly string[]>;

/** A deliverable that was stored before its hash reached a signature. */
export type PersistedDeliverable = Persisted<string>;

/**
 * Brand a value as persisted. THE ONLY PRODUCER.
 *
 * Call this with the value the persist step returned — not with the value that
 * was sent to it. Those are usually equal and the difference matters: if the
 * store normalised, truncated, or re-encoded the text, the stored bytes are the
 * ones a later recomputation will hash, so the stored bytes are the ones that
 * must be committed to. Branding the sent value would hash text nobody kept.
 */
export function markPersisted<T>(stored: T): Persisted<T> {
  return stored as Persisted<T>;
}
