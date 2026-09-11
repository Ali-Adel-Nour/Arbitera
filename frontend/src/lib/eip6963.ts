/**
 * =============================================================================
 * `src/lib/eip6963.ts` — finding the wallet without fighting over a global
 * =============================================================================
 *
 * `window.ethereum` IS NOT USED TO DISCOVER A WALLET, and that is the point of
 * this module. That global is a single slot, and every installed extension wants
 * it: with two wallets installed, whichever loaded last wins, and a user who
 * clicks "connect" gets whichever one that was rather than the one they meant.
 * The failure is silent and looks like the interface picking a wallet at random,
 * because that is exactly what it is doing.
 *
 * EIP-6963 replaces the scramble with an announcement. The page dispatches
 * `eip6963:requestProvider`; every wallet responds with an
 * `eip6963:announceProvider` event carrying its own provider object and enough
 * metadata to name it. The result is a LIST, so the interface can say which
 * wallets it found and let a person choose.
 *
 * THE PROTOCOL IS A CONVERSATION, NOT A QUERY. A wallet may announce before the
 * page asks, or after. So the listener is attached FIRST and the request is
 * dispatched second — reversing those two loses every wallet that answers
 * instantly. Wallets may also announce more than once, which is why `rdns` keys
 * the collection: it is the stable reverse-DNS identity in the spec, and
 * deduplicating on it keeps one entry per wallet however many times it speaks.
 *
 * NO `window.ethereum` FALLBACK, deliberately. A wallet too old to announce is a
 * wallet this interface cannot identify, and the honest response is to say no
 * conforming wallet was found rather than to reach for the contested global and
 * hope. That keeps the discovery story one story instead of two.
 *
 * TYPES ARE DECLARED HERE, NOT IMPORTED. The alternative is a dependency for
 * four interfaces, in a module whose whole job is to be readable.
 */

/** The provider's own description of itself. EIP-6963 §Info. */
export interface Eip6963ProviderInfo {
  /** Opaque per-page identity. Not stable across reloads; do not persist it. */
  uuid: string;
  /** Human name, e.g. `MetaMask`. Displayed. */
  name: string;
  /** Data-uri icon. Not rendered here — see the note in `WalletPicker`. */
  icon: string;
  /** Reverse-DNS identity, e.g. `io.metamask`. Stable. The deduplication key. */
  rdns: string;
}

/**
 * The subset of EIP-1193 this interface calls.
 *
 * Narrow on purpose: `request` and the two event methods are all that is used, so
 * a wider type would suggest capabilities this code does not exercise.
 */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

/** One announced wallet. */
export interface Eip6963Provider {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

const ANNOUNCE = 'eip6963:announceProvider';
const REQUEST = 'eip6963:requestProvider';

/** Is this event detail actually an announcement? */
function isAnnouncement(detail: unknown): detail is Eip6963Provider {
  if (typeof detail !== 'object' || detail === null) return false;

  const candidate = detail as { info?: unknown; provider?: unknown };
  const info = candidate.info;

  return (
    typeof info === 'object' &&
    info !== null &&
    typeof (info as Eip6963ProviderInfo).rdns === 'string' &&
    typeof (info as Eip6963ProviderInfo).name === 'string' &&
    typeof (info as Eip6963ProviderInfo).uuid === 'string' &&
    typeof candidate.provider === 'object' &&
    candidate.provider !== null &&
    typeof (candidate.provider as Eip1193Provider).request === 'function'
  );
}

/**
 * Listen for wallet announcements and report the list as it grows.
 *
 * Returns a teardown function. `onChange` is called with a fresh array each time
 * a NEW wallet announces — a repeat announcement from a wallet already in the map
 * does not fire it, so a wallet that announces on a timer does not cause a render
 * loop.
 *
 * Server-safe: with no `window` it reports nothing and returns a no-op teardown,
 * so a caller does not need to guard the environment before calling.
 */
export function discoverProviders(
  onChange: (providers: Eip6963Provider[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const found = new Map<string, Eip6963Provider>();

  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isAnnouncement(detail)) return;

    // Deduplicated on `rdns`, and an existing entry is NOT replaced: the first
    // announcement's provider object is the one any live subscription is already
    // attached to, and swapping it would silently orphan those listeners.
    if (found.has(detail.info.rdns)) return;

    found.set(detail.info.rdns, detail);
    onChange([...found.values()]);
  };

  // Listener first, request second. A wallet that answers synchronously is lost
  // if these are the other way round.
  window.addEventListener(ANNOUNCE, listener);
  window.dispatchEvent(new Event(REQUEST));

  return () => window.removeEventListener(ANNOUNCE, listener);
}
