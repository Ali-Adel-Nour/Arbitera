/**
 * =============================================================================
 * `src/lib/env.ts` — the single `NEXT_PUBLIC_*` read site
 * =============================================================================
 *
 * Every public environment variable this interface consumes is read here and
 * nowhere else. One module, one table, one place to look when a deployment
 * behaves differently from a laptop.
 *
 * WHY ONE SITE
 * ------------
 * The variables in this table are the whole configuration surface of the
 * deployment: they decide whether screens read fixtures or a live backend,
 * whether a settlement reference is a link or a copyable hash, and whether a
 * wallet can be asked to add the chain at all. Scattered reads make that surface
 * un-enumerable — a reviewer cannot answer "what does this deployment depend on"
 * without grepping, and a missing variable shows up as a screen behaving oddly
 * rather than as a named absence. Collected here, the table below IS the answer,
 * and `frontend/README.md` documents the same set.
 *
 * WHAT ABSENCE MEANS, PER VARIABLE
 * --------------------------------
 * Nothing here supplies a default value, and that is the load-bearing decision.
 * Each reader reports absence honestly and its consumer decides what absence
 * means, because the answers genuinely differ:
 *
 *   - `apiBase` absent means the empty string in `services/endpoints.ts`, which
 *     makes every path resolve relative to this origin and land on the bundled
 *     route handlers. Absence is the fixture mode, not a failure.
 *   - `arcRpcUrl` absent means the wallet add-chain payload carries no endpoint,
 *     so the wallet refuses it. That is correct: a guessed host would register a
 *     chain whose every call fails.
 *   - `explorerTxBase` absent means settlement references degrade to copyable
 *     hashes. A guessed explorer host persists in a wallet after the demo ends
 *     and attaches a confident link to nothing.
 *
 * WHY GETTERS, AND WHY THE MEMBER ACCESS IS SPELLED OUT
 * ----------------------------------------------------
 * Next.js substitutes `NEXT_PUBLIC_`-prefixed variables into client JavaScript
 * at build time, and it does so by recognising the STATIC member access form.
 * `process.env.NEXT_PUBLIC_API_BASE` is substituted; `process.env[name]` is not,
 * and would read as `undefined` in a browser. So every read below writes the
 * name out in full, and no reader is generated from a list of names.
 *
 * Each entry is an accessor rather than a plain property so the read happens
 * when it is asked for rather than when this module is first imported. That
 * keeps `lib/chain.ts`'s call-time semantics intact — it was written against
 * nullary readers for exactly this reason — and removes any import-order
 * assumption about when the environment is populated.
 *
 * NO SERVER-ONLY VARIABLE APPEARS HERE. The settlement secret is read in
 * `lib/serverEnv.ts` behind `import 'server-only'`, and this module is in the
 * client's import graph — a server-only value read here would be a value the
 * browser could hold.
 *
 * That variable is deliberately NOT NAMED in this comment. `check-copy.mjs`
 * permits its identifier at exactly one site under `src/`, and that budget belongs
 * to the module that reads the value rather than to prose describing it. Naming it
 * here would spend the allowance and leave the real reader unable to write down
 * what it reads.
 *
 * PURITY
 * ------
 * No React, no fetch, no clock. The only input is the ambient environment, and
 * the only output is a string or `null`.
 */

/**
 * A present, non-blank value, or `null`. WHITESPACE IS ABSENCE.
 *
 * A variable set to `" "` in a dashboard is a variable someone meant to clear,
 * and treating it as present produces the worst version of every consumer:
 * an RPC array holding a blank string, an explorer prefix that yields a link to
 * this origin. `services/endpoints.ts` applies the same rule to `apiBase` in its
 * own `normaliseBase`, where blank has to collapse to the empty string rather
 * than to `null`.
 */
const trimmedOrNull = (raw: string | undefined): string | null => {
  const value = raw?.trim();
  return value ? value : null;
};

/**
 * The public environment, as read by this interface.
 *
 * | Accessor         | Variable                       | Absent means                          |
 * | ---------------- | ------------------------------ | ------------------------------------- |
 * | `apiBase`        | `NEXT_PUBLIC_API_BASE`         | same-origin: the bundled mock routes   |
 * | `apiBaseAll`     | `NEXT_PUBLIC_API_BASE_ALL`     | only shipped routes go to the backend  |
 * | `arcRpcUrl`      | `NEXT_PUBLIC_ARC_RPC_URL`      | no endpoint offered to the wallet      |
 * | `explorerTxBase` | `NEXT_PUBLIC_EXPLORER_TX_BASE` | settlement references degrade to hashes |
 */
export const env = {
  /**
   * `NEXT_PUBLIC_API_BASE` — the backend origin, RAW AND UNTRIMMED.
   *
   * Deliberately not passed through `trimmedOrNull`: `normaliseBase` in
   * `services/endpoints.ts` is the one function that decides what a base URL
   * means, including that a blank one is the empty string, and it is the
   * function the base-resolution property test exercises. Trimming here would
   * put half of that decision in a second place.
   */
  get apiBase(): string | undefined {
    return process.env.NEXT_PUBLIC_API_BASE;
  },

  /**
   * `NEXT_PUBLIC_API_BASE_ALL` — set to `1` to send every non-pinned endpoint to
   * the backend, including the routes it has not shipped yet.
   *
   * Raw string, compared in `services/endpoints.ts`. The comparison lives with
   * the routing decision it drives rather than being pre-digested to a boolean
   * here, where the value `1` would lose its meaning.
   */
  get apiBaseAll(): string | undefined {
    return process.env.NEXT_PUBLIC_API_BASE_ALL;
  },

  /** `NEXT_PUBLIC_ARC_RPC_URL` — the JSON-RPC endpoint offered to the wallet. */
  get arcRpcUrl(): string | null {
    return trimmedOrNull(process.env.NEXT_PUBLIC_ARC_RPC_URL);
  },

  /** `NEXT_PUBLIC_EXPLORER_TX_BASE` — a transaction-page prefix, e.g. `…/tx/`. */
  get explorerTxBase(): string | null {
    return trimmedOrNull(process.env.NEXT_PUBLIC_EXPLORER_TX_BASE);
  },
} as const;
