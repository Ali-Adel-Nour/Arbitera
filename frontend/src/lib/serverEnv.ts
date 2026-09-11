import 'server-only';

/**
 * =============================================================================
 * `src/lib/serverEnv.ts` — the only module that reads the settlement secret
 * =============================================================================
 *
 * `import 'server-only'` IS THE LOAD-BEARING LINE, and it is first in the file on
 * purpose. It makes any import of this module from a client component a BUILD
 * ERROR rather than a runtime surprise: the wrong import fails `next build`, so a
 * secret cannot reach a browser bundle by way of someone adding an import in a
 * hurry. That is a stronger guarantee than a naming convention or a comment.
 *
 * THREE LAYERS GUARD THE SAME SECRET, deliberately, because each catches a
 * different mistake:
 *
 *   1. `server-only` — a client component importing this file does not compile.
 *   2. `check-copy.mjs` `internal-key-reads` — the variable name may appear at
 *      most ONCE anywhere under `src/`, and this is that once. A second read site
 *      fails the gate even if it is also server-side, because two readers is how
 *      a value ends up with two different fallback behaviours.
 *   3. `check-bundle.mjs` — scans every emitted chunk under `.next/static/` for
 *      the identifier always, and for the literal value when it is set at build
 *      time. This is the backstop that does not care what the source says.
 *
 * Layer 2 is why `lib/env.ts` no longer names this variable even in prose: the
 * budget is one occurrence, and it belongs to the module that actually reads the
 * value rather than to a comment describing it. That is the same reasoning
 * `content/copy.ts` applies to the 401 recovery sentence.
 *
 * NO `NEXT_PUBLIC_` PREFIX, EVER. A `NEXT_PUBLIC_` alias of this value would be
 * substituted into client JavaScript at build time and layer 3 would catch it —
 * but the right place to not make that mistake is here, where the name is written.
 *
 * ABSENCE IS A STATE, NOT A FAILURE. A deployment without this key can judge but
 * cannot settle, which is a perfectly reasonable way to run the demo — every
 * read-only screen works, and the sandbox's judge-only path works. So this
 * returns `null` and the route handler turns that into a 401 whose body names the
 * variable to set. Throwing at import time would take down screens that have
 * nothing to do with settlement.
 */

/**
 * The variable's NAME, written exactly once in this codebase.
 *
 * Exported because the 401 the proxy returns has to tell a reviewer which variable
 * to set — a 401 saying "unauthorized" and nothing else sends someone reading
 * source for ten minutes. Naming it in the response body is the whole point, and
 * naming it from here means the gate's one-occurrence budget covers both the read
 * and the message.
 *
 * WHY DYNAMIC ACCESS IS CORRECT HERE AND WRONG IN `lib/env.ts`. That module spells
 * out `process.env.NEXT_PUBLIC_…` in full because Next.js substitutes public
 * variables into client bundles by recognising the static member access form, and
 * `process.env[name]` would read as `undefined` in a browser. This value is never
 * substituted into anything — it is read in a Node process at request time, where
 * a computed key works exactly as it looks. The two modules differ because the two
 * situations differ, not by oversight.
 */
export const INTERNAL_KEY_VARIABLE = 'ARBITRA_INTERNAL_KEY';

/**
 * The internal key the backend requires on a settling request, or `null`.
 *
 * A getter rather than a constant so the read happens when asked rather than when
 * this module is first imported — matching `lib/env.ts`, and removing any
 * import-order assumption about when the environment is populated.
 *
 * WHITESPACE IS ABSENCE, the same rule `lib/env.ts` applies. A key set to `" "`
 * is a key someone meant to clear, and forwarding a blank authorization header is
 * worse than sending none: the backend would reject it as malformed rather than
 * as missing, and the error a reviewer sees would name the wrong problem.
 */
export const serverEnv = {
  get internalKey(): string | null {
    const value = process.env[INTERNAL_KEY_VARIABLE]?.trim();
    return value ? value : null;
  },
} as const;
