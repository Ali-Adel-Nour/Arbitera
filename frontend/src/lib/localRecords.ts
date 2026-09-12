/**
 * =============================================================================
 * `src/lib/localRecords.ts` — the interim preimage store, and what it is not
 * =============================================================================
 *
 * The escrow commits to a HASH of the criteria and a HASH of the deliverable. The
 * text has to be kept somewhere or the commitment is meaningless. This module is
 * where the write path keeps it, and the honest description of what that buys is
 * the whole reason the file has this comment.
 *
 * WHAT THIS IS: `localStorage`, on the machine that signed the transaction.
 *
 * WHAT IT GUARANTEES: the person who created the deal can recompute the hash they
 * committed to, on that browser, and see that it matches. The ordering rule holds —
 * text is stored before a signature is requested — so the local record and the
 * on-chain commitment cannot disagree about what was agreed.
 *
 * WHAT IT DOES NOT GUARANTEE, and this must not be overstated anywhere in the
 * interface: it is not third-party auditable, it does not survive clearing site
 * data, and it is not visible to the counterparty. A deal whose preimage exists
 * only here is verifiable BY ITS AUTHOR, not by a reviewer. That is strictly better
 * than a commitment to text nobody kept, and strictly worse than a stored record.
 *
 * WHAT WOULD REPLACE IT: a backend route that accepts a preimage and returns it by
 * deal identifier — the write-side counterpart of `GET /api/verify/:dealId`, which
 * already exists on the read side. When that lands, `persistCriteria` and
 * `persistDeliverable` change their bodies, `markPersisted` still brands whatever
 * the store returned, and no component changes. The branded type was designed for
 * exactly this substitution.
 *
 * THE VALUE BRANDED IS THE VALUE READ BACK, not the value passed in. If the store
 * ever normalises text, the stored bytes are what a later recomputation will hash,
 * so those are the bytes that must be committed to. Reading back is one line and it
 * removes a whole class of silent divergence.
 */

import { markPersisted, type PersistedCriteria, type PersistedDeliverable } from '@/lib/persisted';
import { resolve, ENDPOINTS } from '@/services/endpoints';

/** Namespaced so this cannot collide with anything else on the origin. */
const KEY_PREFIX = 'arbitra:preimage:';

const criteriaKey = (dealId: string): string => `${KEY_PREFIX}criteria:${dealId.toLowerCase()}`;
const deliverableKey = (dealId: string): string =>
  `${KEY_PREFIX}deliverable:${dealId.toLowerCase()}`;

/** Storage may be unavailable — private mode, or a blocked origin. */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Store criteria and return them branded, or `null` if they could not be stored.
 *
 * `null` is the important case: it means the signature MUST NOT be requested,
 * because the text would be committed to and lost. The caller cannot proceed by
 * accident — without a `PersistedCriteria` there is no way to call the builder.
 */
export function persistCriteria(
  dealId: string,
  criteria: readonly string[],
): PersistedCriteria | null {
  const store = storage();
  if (store === null) return null;

  try {
    store.setItem(criteriaKey(dealId), JSON.stringify(criteria));

    // Read back, and brand what came back. See the header note.
    const raw = store.getItem(criteriaKey(dealId));
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      return null;
    }

    const branded = markPersisted(parsed as readonly string[]);
    
    // Non-blocking sync to backend
    fetch(resolve(ENDPOINTS.preimage), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, criteria })
    }).catch((e) => console.error('Failed to sync criteria preimage to backend', e));

    return branded;
  } catch {
    // A quota failure or a serialisation failure both mean the text is not stored.
    return null;
  }
}

/** Store a deliverable and return it branded, or `null` if it could not be stored. */
export function persistDeliverable(
  dealId: string,
  deliverable: string,
): PersistedDeliverable | null {
  const store = storage();
  if (store === null) return null;

  try {
    store.setItem(deliverableKey(dealId), deliverable);

    const raw = store.getItem(deliverableKey(dealId));
    if (raw === null) return null;
    
    const branded = markPersisted(raw);
    
    // Non-blocking sync to backend
    fetch(resolve(ENDPOINTS.preimage), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, deliverable })
    }).catch((e) => console.error('Failed to sync deliverable preimage to backend', e));
    
    return branded;
  } catch {
    return null;
  }
}
