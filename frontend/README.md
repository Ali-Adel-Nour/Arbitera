# Arbitra Frontend

The evidence surface for the Arbitra escrow and arbitration protocol. Agents
create and settle deals over MCP; this application renders the record and lets a
visitor recompute the hashes in their own browser.

## Commands

Run from anywhere in the monorepo:

```sh
npm install --workspace=@arbiter/frontend
npm run dev       --workspace=@arbiter/frontend   # development server
npm run typecheck --workspace=@arbiter/frontend   # tsc --noEmit
npm run test      --workspace=@arbiter/frontend   # node:test via tsx
```

Node 22 or newer is required (`engines.node >= 22`).

`npm run build` is not defined yet. It arrives with the copy and design gates it
has to run, so that the first `build` script in this workspace is the gated one
rather than a bare `next build` that a later commit has to remember to wrap.

## Environment

| Variable | Required | Effect when unset |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE` | no | Requests resolve relative to this deployment, so the bundled fixture route handlers serve every screen |
| `NEXT_PUBLIC_ESCROW_ADDRESS` | no | Settlement references render as copyable hashes with a note that the contract is not deployed, instead of explorer links |
| `NEXT_PUBLIC_EXPLORER_TX_BASE` | no | Defaults to `https://sepolia.etherscan.io/tx/` |
| `ARBITRA_INTERNAL_KEY` | no | Server-only. Sandbox settlement requests return 401 without it. Never `NEXT_PUBLIC_`-prefixed |

## Version pinning

Every dependency is pinned to an exact version, not a caret range, so that a
teammate's install and CI's install produce the same tree. Two choices are worth
recording:

- **Next 16.3.4, not the 15.x line.** Next 15 pins `postcss@8.4.31`, which
  carries a high-severity advisory with no patched release inside 15.x;
  `npm audit` on this workspace reports it. Next 16 pins `postcss@8.5.23` and the
  same audit comes back clean. Next 16 needs Node 20.9+, which the `>=22`
  engine already exceeds.
- **TypeScript 5.9.3, not 7.x.** TypeScript 7 is the native compiler rewrite.
  Next's editor plugin and its generated `.next/types` are validated against the
  5.x checker, and a toolchain commit is the wrong place to absorb a compiler
  rewrite. Revisit once Next declares support.

## Deliberate deviations

Recorded here so a reviewer comparing this workspace against the root README and
the spec finds the reasoning rather than an inconsistency.

**The package name stays `@arbiter/frontend`.** The root README calls it
`@arbitra/frontend`. Renaming it would mean editing the root `package.json`
workspace scripts and every teammate's `--workspace=` invocation, for no
user-visible gain, and would land a cross-workspace rename inside a frontend
commit. The root README's spelling is the outlier; this manifest matches the
other four workspaces' `@arbiter/*` scope.

**Source lives under `src/`.** So `src/app/`, `src/components/`, `src/lib/`
rather than a top-level `app/`. Next.js supports both natively. `src/` keeps the
application code separable from the workspace's config and gate scripts, which
matters here because `scripts/check-copy.mjs` and `scripts/check-design.mjs`
scan a source corpus and need that corpus to have a boundary. It also preserves
the shape of the structure sketch teammates were handed. The `@/*` path alias in
`tsconfig.json` resolves to `./src/*`, so imports do not carry the prefix.

**Tailwind v4, so `tailwind.config.ts` is nearly empty.** v4 moved the token
layer into CSS: the type scale, colours, and rule tokens are declared in a
`@theme` block in `src/app/globals.css`, and template discovery is automatic.
The config file is retained because the design's directory layout names it, but
it is not loaded unless `globals.css` declares a `@config` directive, which it
does not. Read `globals.css` to find the tokens. `postcss.config.mjs` is the one
config file the design's layout does not list; Tailwind v4 needs it to register
its single PostCSS plugin.

**`next-env.d.ts` is git-ignored.** Next regenerates it on every `dev` and
`build`, so tracking it would produce a diff on every run. It is still listed in
`tsconfig.json`'s `include`, so a local checkout picks up Next's ambient types
once anything has been run. `typecheck` does not depend on it: no module in this
workspace imports a static asset, which is the only thing those ambient types
provide.
