/**
 * =============================================================================
 * `src/lib/chain.ts` — the ONLY module in which the chain literals appear
 * =============================================================================
 *
 * Two jobs, and they are separate on purpose.
 *
 *   1. Describe the target chain to a wallet, in the shape EIP-3085's
 *      `wallet_addEthereumChain` demands.
 *   2. Describe the ERC-20 amount scale every escrow figure is denominated in.
 *
 * Those two descriptions disagree about `decimals`, and that disagreement is
 * the entire reason this file is written the way it is. See §2.
 *
 * WHY THE LITERALS LIVE HERE AND NOWHERE ELSE
 * -------------------------------------------
 * The decimal chain id and its hexadecimal form each appear exactly once in the
 * source tree, in this file. Copy that names the network interpolates
 * `ARC_TESTNET.name` and `ARC_TESTNET.chainId` rather than typing the digits, so
 * retargeting the chain is one file rather than a grep across the interface.
 * `scripts/check-copy.mjs` enforces that with its `chain-literals` rule, which
 * is only enforceable while this file stays the sole occurrence site.
 *
 * NO HOST IS HARDCODED
 * --------------------
 * The RPC endpoint and the explorer host are not confirmed, so neither is
 * written down. Both come from environment variables, and both readers return
 * nothing rather than a guess when the variable is absent. A guessed RPC url
 * fails visibly; a guessed explorer host is worse, because a wallet keeps it
 * after the demo ends and attaches a dead link to every later transaction.
 */

/* ===========================================================================
 * §1  Environment reads
 *
 * These are the only two `process.env` reads in this module, and they are
 * deliberately shaped as nullary readers rather than module-level constants.
 *
 * `lib/env.ts` (task 4.6) becomes the single `NEXT_PUBLIC_*` read site for the
 * workspace; that module does not exist yet. When it lands, the two bodies
 * below become `env.arcRpcUrl` and `env.explorerTxBase` and nothing else in
 * this file moves — which is why they are functions now. Reading at call time
 * rather than at module load also keeps the module free of import-order
 * assumptions about when the environment is populated.
 *
 * The member access has to stay statically spelled out (`process.env.NAME`,
 * never `process.env[name]`) because that literal form is what the bundler
 * substitutes at build time for a `NEXT_PUBLIC_` variable.
 * ======================================================================== */

/** A present, non-blank environment value, or `null`. Whitespace is absence. */
const trimmedOrNull = (raw: string | undefined): string | null => {
  const value = raw?.trim();
  return value ? value : null;
};

/** `NEXT_PUBLIC_ARC_RPC_URL` — the JSON-RPC endpoint offered to the wallet. */
const arcRpcUrl = (): string | null => trimmedOrNull(process.env.NEXT_PUBLIC_ARC_RPC_URL);

/** `NEXT_PUBLIC_EXPLORER_TX_BASE` — a transaction-page prefix, e.g. `…/tx/`. */
const explorerTxBase = (): string | null => trimmedOrNull(process.env.NEXT_PUBLIC_EXPLORER_TX_BASE);

/** Drops the absent entries, so an unset variable contributes no array member. */
const compact = (values: readonly (string | null)[]): string[] =>
  values.filter((value): value is string => value !== null);

/* ===========================================================================
 * §2  The chain description, and the two decimals
 * ======================================================================== */

/**
 * Arc Testnet, as a wallet needs it described.
 *
 * Gas on this chain is denominated in USDC as the native token, not ETH
 * (Requirement 12.7). Any copy telling a reader to acquire gas names USDC.
 */
export const ARC_TESTNET = {
  chainId: 5042002,

  /**
   * The same identifier in hexadecimal, mixed case exactly as Requirement 12.5
   * states it. Used ONLY as the argument to `wallet_switchEthereumChain` and
   * `wallet_addEthereumChain`. Never compared against a provider's answer as a
   * string — see `isOnArc`.
   */
  chainIdHex: '0x4CEF52',

  name: 'Arc Testnet',

  /**
   * DECIMALS, PART ONE OF TWO. DO NOT MERGE WITH `USDC_DECIMALS`.
   *
   * `decimals: 18` is the value declared to the wallet in
   * `wallet_addEthereumChain`, and it is here for that payload and nothing
   * else. EIP-3085 implementations validate a native currency at 18 and reject
   * any other value, so declaring the 6 that USDC-as-a-token actually uses
   * fails the registration outright.
   *
   * This is NOT the ERC-20 token scale. Every escrow amount uses
   * `USDC_DECIMALS`. Collapsing the two into one constant would scale an amount
   * by 10^12, and a buyer would be asked to sign an approval a trillion times
   * larger than the figure on screen — a difference no confirmation dialog
   * makes obvious.
   *
   * The native-token decimal behaviour on Arc is unconfirmed. 18 appears in
   * exactly this one place, so if it turns out to be wrong there is one line to
   * change and no amount arithmetic is touched.
   */
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
} as const;

/**
 * DECIMALS, PART TWO OF TWO. The ERC-20 amount scale, deliberately separate.
 *
 * This is the only decimals value the amount helpers ever see: `parseUnits` and
 * `formatUnits` for every escrow figure read it, and they must never read
 * `ARC_TESTNET.nativeCurrency.decimals`. Read the note on that field before
 * being tempted to unify them; the two numbers describe different things that
 * happen to share a name.
 */
export const USDC_DECIMALS = 6;

/* ===========================================================================
 * §3  Literal agreement
 * ======================================================================== */

/**
 * The two forms of the chain id are written out independently above, so a typo
 * in either one is possible and would be invisible: the wallet would be asked
 * to switch to one chain while every comparison tested for another. Checking
 * the agreement at module load turns that into an immediate, loud failure at
 * the first import instead of a chain mismatch reported on the correct chain.
 *
 * `Number` on a `0x`-prefixed string is exact well past this magnitude, so the
 * comparison is a real check rather than a float coincidence.
 */
if (Number(ARC_TESTNET.chainIdHex) !== ARC_TESTNET.chainId) {
  throw new Error(
    `lib/chain.ts: chainIdHex ${ARC_TESTNET.chainIdHex} does not denote chainId ${ARC_TESTNET.chainId}`,
  );
}

/* ===========================================================================
 * §4  Chain identity comparison
 * ======================================================================== */

/**
 * Is this chain identifier the target chain?
 *
 * NUMERIC COMPARISON, NEVER STRING COMPARISON. Providers report the chain in
 * whatever form they please: lower-case hexadecimal, upper-case hexadecimal,
 * and occasionally a decimal number. All three denote the same chain, and a
 * string equality test against `chainIdHex` returns false for two of them — so
 * the interface would tell a user on the right chain to switch networks, and
 * the switch would appear to do nothing.
 *
 * `Number` handles every form: it parses a `0x` prefix in either letter case
 * and passes a number through unchanged. A value it cannot read becomes `NaN`,
 * which compares false, so an unparseable answer reads as "not on this chain"
 * rather than throwing inside a render.
 *
 * The wallet layer's state-level predicate is a thin wrapper over this: a
 * connected session on this chain id. The numeric normalisation belongs here,
 * with the constant it compares against.
 */
export const isOnArc = (chainId: string | number | null | undefined): boolean =>
  chainId !== null && chainId !== undefined && Number(chainId) === ARC_TESTNET.chainId;

/* ===========================================================================
 * §5  The `wallet_addEthereumChain` url arrays
 * ======================================================================== */

/**
 * The RPC endpoints offered to the wallet, from `NEXT_PUBLIC_ARC_RPC_URL`.
 *
 * Empty when the variable is unset. A wallet rejects an add-chain payload with
 * no usable endpoint, which is the correct outcome: the deployment was not
 * configured, and inventing a host would produce a registered chain whose every
 * call fails.
 */
export const rpcUrls = (): string[] => compact([arcRpcUrl()]);

/**
 * The explorer origin, derived from the transaction-page prefix.
 *
 * `wallet_addEthereumChain` wants a browsable base, not a `/tx/` prefix, so the
 * origin is taken from the configured value: `https://example/tx/` yields
 * `https://example`. A value that is not a parseable absolute url yields
 * nothing rather than a half-formed host.
 */
const explorerOrigin = (): string | null => {
  const base = explorerTxBase();
  if (base === null) return null;

  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
};

/**
 * The explorer bases offered to the wallet. EMPTY WHEN UNCONFIGURED, and the
 * caller omits the `blockExplorerUrls` key entirely in that case rather than
 * sending `[]` or a plausible-looking host.
 *
 * The exact explorer host for this chain is not confirmed. Registering a wrong
 * one is worse than registering none: it persists in the user's wallet after
 * the demo ends, and every transaction on the chain from then on carries a
 * confident link to nothing.
 */
export const blockExplorerUrls = (): string[] => compact([explorerOrigin()]);
