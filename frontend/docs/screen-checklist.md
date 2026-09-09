# Per-screen design review checklist

Requirement 14.12: every screen is reviewed against Requirement 14 criteria 1–11 before its
work is considered complete. This file is that checklist.

Criterion 12 is the requirement to keep this checklist, so it is not a column. It is the
row-completion gate: a route's row is closed when all eleven cells are accounted for.

Each cell is one of two values.

- `auto` — a rule in `frontend/scripts/check-design.mjs` fails the build on violation. The
  cell names the rule id, so the reviewer trusts the build instead of eyeballing the screen.
  Read the rule's `why` line in the script for the exact patterns it matches.
- `manual` — no build rule decides it. The cell names what to look at.

The rule ids that exist are exactly: `glassmorphism`, `gradient`, `gradient-utility`,
`tracked-caps`, `arrow-glyph`, `middle-dot`, `hover-motion`, `bracket-font-size`,
`mono-confinement`, `motion-confinement`, `ruling-step-budget`, `ruling-surface-budget`.
`frontend/scripts/check-copy.mjs` is a separate gate over interface language and has no bearing
on the cells below. Its eight rule ids are listed in the `BANNED` table at the top of that
script; read them there rather than copying them here. `docs/**/*.md` is inside that gate's
scope and this file gets no exemption, so transcribing those ids into this one fails the build —
two of them match their own names.

Cell counts: **88 cells** across 8 routes × 11 criteria — **64 `auto`**, **24 `manual`**.
The 24 manual cells are criteria 4, 5, and 7 on every route.

## How to use this

A screen's work is not complete until its row is filled. Filling a row means walking all
eleven cells for that route: confirming the `auto` cells are green in the build output, and
looking at the three `manual` cells on the rendered screen.

A filled row has exactly two outcomes.

1. **Passes unchanged.** Nothing to commit. The review is recorded by the task closing.
2. **Produces a `style:` commit.** The body states what was revised and why the original
   treatment failed the criterion. One concern per commit, per Requirement 17.3 — a review
   that finds two unrelated problems lands two commits.

A green build is not a filled row. The eight automated columns are a floor, not the review.
Criterion 7 is the cell that decides whether the interface reads as a court record or as a
generic dashboard, and no grep reaches it.

## Which tasks consume this

| Task | Route(s) reviewed |
| --- | --- |
| 7.6 | `/agents`, `/agents/[agent]`, `/agents/[agent]/resolutions` |
| 11.5 | `/deals/[dealId]` |
| 13.5 | `/` |
| 14.3 | `/activity` |
| 15.8 | `/sandbox` |

`/trust-model` has no dedicated review task. Its row is filled by whichever task last touches
the route, because the row still has to close for Requirement 14.12 to hold.

## The matrix

Criteria, abbreviated by column: **1** two typefaces · **2** named type scale · **3** mono
confined to machine values · **4** rule tokens carry their documented meaning · **5** state
colour paired with a text label · **6** no glass, no neon-on-near-black, no decorative
gradient · **7** container treatment differentiated by content kind · **8** no tracked-out
capitals above headings · **9** no arrow glyphs on labels, no middle-dot metadata · **10** no
entrance animation, motion confined to the verdict moment · **11** no hover animation on rows.

Manual cells carry a short pointer here and a full sentence in the route's own section below.

| Route | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` docket | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` instance rules between entries, derived rules on the four figures | `manual` seven group headers chip their state in words | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` ledger rows, not a card per deal | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/deals/[dealId]` verdict record + verify | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` boundary rule twice at most, tampered rule only on the odd row | `manual` banner rule paired with the outcome sentence | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` exhibit, sunk transcript, and boxless hash strip stay distinct | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/agents` explorer list | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` derived rule on every figure, no rule on the search input | `manual` badge tier reads as a word | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` figures align down the list, rows are not boxed | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/agents/[agent]` detail | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` derived rule on three regions, none on deal history | `manual` each resolution outcome carries its label | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` three derived regions are not three identical panels | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/agents/[agent]/resolutions` drill-down | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` derived rule on the arithmetic, not on its protocol inputs | `manual` approved and failed are words, not a colour column | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` the arithmetic is a derivation, not a stat card | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/activity` MCP feed | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` no rule token between log lines at all | `manual` hiring decision and source label are text | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` one continuous well, no per-line container | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/sandbox` injection sandbox | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` each exhibit's left rule matches whether its text is hashed | `manual` pending and verdict states are stated in words | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` no outer card wrapping the two preset exhibits | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |
| `/trust-model` boundary statement | `auto` mono-confinement | `auto` bracket-font-size, ruling-step-budget | `auto` mono-confinement | `manual` boundary rule once, no other rule sub-dividing prose | `manual` confirm no state indicator was added | `auto` glassmorphism, gradient, gradient-utility, ruling-surface-budget | `manual` one prose column, not two comparison cards | `auto` tracked-caps | `auto` arrow-glyph, middle-dot | `auto` motion-confinement | `auto` hover-motion |

### Where the automated columns stop

The eight `auto` columns are honest about what they catch, which means being explicit about
what they do not.

- **Criterion 1** — `mono-confinement` bounds the monospace family to `MachineValue.tsx`. No
  rule greps for a *third* family arriving. If a route's diff adds a `next/font` import
  outside `src/app/fonts.ts`, that is a review finding, not a build failure.
- **Criterion 2** — `bracket-font-size` catches `text-[…]`, `leading-[…]`, and `tracking-[…]`
  literals, which is what makes the deliberate gap between the `screen` and `ruling` steps
  hold: there is no 34px or 40px step to pick, so an intermediate size has to be a literal,
  and the literal fails. A new step added to `src/app/globals.css` is not caught. Review the
  token layer's diff, not the component's.
- **Criterion 6** — glass and gradients are grepped. Neon-on-near-black is prevented
  structurally instead: `ruling-surface-budget` confines `ruling-ground` and `ruling-ink` to
  one file, so there is only one dark surface to put a saturated ink on. Nothing greps the
  inks used *inside* that file, so the verdict banner's own foregrounds are a review item on
  `/deals/[dealId]` and `/sandbox`.
- **Criteria 10 and 11** — `motion-confinement` and `hover-motion` bound where motion tokens
  may appear. They say nothing about whether the one permitted animation behaves correctly.
  See the residual note on the two routes that render `VerdictBanner`.

### Criteria 4 and 5 are marked `manual`, and why

`design.md` states that criteria 7 and 12 are the only fully-manual cells. On the evidence of
the script as it now stands, criteria 4 and 5 are also manual, and this checklist records that
rather than claiming coverage that does not exist.

- **Criterion 4** has no rule id. A grep can see that `rule-derived` is present; it cannot see
  whether the value it marks is actually computed by this interface. The partial backstops are
  real but narrow: the `gradient` pattern rule is excluded only in `globals.css`, so the
  three-part boundary rule cannot be reimplemented inline in a component, and `design.md`
  assigns meaning-correctness to component-level tests. Neither is a `check-design.mjs` rule
  id, so the cell is `manual`.
- **Criterion 5** has no rule id either. `StateChip` pairs colour with a label by
  construction, so the check is for state signalled *outside* that primitive — a coloured
  figure, a tinted row, a dot. That is a rendered-screen judgment.

### The seven rule tokens

`tasks.md` refers to five rule tokens. There are seven, and `design.md`'s token table is
authoritative:

`rule-hashed` · `rule-excluded` · `rule-derived` · `rule-boundary` · `rule-record` ·
`rule-instance` · `rule-tampered`

`design.md` writes them with a slash (`rule/hashed`) in its table; the same seven meanings.
Criterion 4 is filled against all seven, not five. The two distinctions that carry the most
information, and are therefore the two most worth checking on any route with a list:

- `rule-record` (hairline, within one record) versus `rule-instance` (full ink, between
  records). Getting this backwards turns a ledger into a table.
- `rule-boundary` is the only three-part rule and appears at most twice per screen. It is the
  trust model stated structurally. Used anywhere else it is decoration.

## Per-route manual cells

Each route's three manual cells, spelled out. The residual note, where present, is a review
item that the route's `auto` cells do not reach.

### `/` — courtroom docket

- **4** — Confirm `rule-instance` parts the `DocketEntry` rows and `rule-record` appears
  nowhere between them, that each of the four `StatsOverview` figures and the `Deliberating`
  group header carry `rule-derived`, and that the other six group headers carry no derived
  rule, because their state is on-chain.
- **5** — Walk all seven group headers and confirm each one's `StateChip` shows its label text
  next to the count, and that no entry signals its state through the amount's colour.
- **7** — Confirm the docket is a ledger: 48px three-track rows on `--paper` parted by
  `rule-instance`, with no radius, border box, or shadow around an individual deal, and
  `StatsOverview` rendering as one row of four figures rather than four boxes. This is the
  route most at risk of reading as a generic dashboard, and a card per deal is how it happens.

### `/deals/[dealId]` — verdict record and verify panel

- **4** — Confirm `rule-boundary` appears at most twice (before the on-chain track of the hash
  strip, and between the on-chain and off-chain sections), that the five preimage exhibits
  carry `rule-hashed` while the recorded-metadata exhibit and the backend's own flag carry
  `rule-excluded`, and that `rule-tampered` marks only a row whose comparison is not
  all-match.
- **5** — Confirm the banner's 6px top-edge state rule is accompanied by the outcome stated in
  words, and that every mismatched cell carries a "Mismatch" chip rather than relying on the
  tampered ink alone.
- **7** — Three container kinds share this screen and must stay visually distinct:
  `EvidenceExhibit` on `--paper-raised` with its label inside the top-left, machine
  transcripts dropped to `--paper-sunk` at the `record` step, and `HashStripRow` which is a
  grid with no box at all. If the hash strip has acquired a surrounding panel, it has become a
  card and the cell fails.
- **Residual (10)** — `motion-confinement` cannot check behaviour. Confirm the rule draw fires
  once per mount keyed to `dealId`, only on the absent-or-pending to settled transition and
  not on direct arrival at an already-settled record, and that under
  `prefers-reduced-motion: reduce` the rule renders at full width with the same state change.

### `/agents` — trust explorer list

- **4** — Confirm every figure in a row carries `rule-derived` through `DrillableMetric`, that
  the score column header's note carries it too, and that the search input carries no rule
  token, because it is a control and not a record field.
- **5** — Confirm the badge tier renders as a chip containing the tier word, and that the trust
  score is a labelled figure rather than a coloured bar or a red-to-green scale.
- **7** — `AgentRow` deliberately borrows docket geometry; confirm the borrowing is complete —
  `rule-instance` between rows and tabular figures aligning down the right-hand numeric block
  — rather than each agent being boxed separately.

### `/agents/[agent]` — agent detail

- **4** — Confirm the deal history list carries no `rule-derived`, because it is protocol data,
  and that dispute rate by category, recency-weighted reliability, and total USDC settled each
  do carry it.
- **5** — Confirm each resolution in the history shows its outcome label, not a coloured dot or
  a green row tint.
- **7** — Confirm the four regions differ by content kind: a resolution list in docket geometry
  for the protocol data, and a distinct treatment for the derived figures. Three identical
  bordered panels for the three derived regions fails this cell.

### `/agents/[agent]/resolutions` — metric drill-down

- **4** — Confirm the arithmetic block carries `rule-derived` while the resolution rows it sums
  do not, since those are protocol records, and that rows are parted by `rule-instance`.
- **5** — Confirm each row's approved or failed outcome is a word, and that a dispute rate's
  failures and denominator are legible without reading colour.
- **7** — Confirm the arithmetic reads as a labelled derivation showing its inputs and product,
  not as a stat card, and that the resolution list keeps docket geometry so a reader
  recognises it from the detail view.

### `/activity` — MCP activity feed

- **4** — Confirm no rule token appears between log lines at all: the well's continuity is the
  point, and a `rule-record` between lines would claim a field boundary that does not exist.
  The source label is a `caption`-step chip, not a rule.
- **5** — Confirm the hiring decision is stated as a word and the source label renders `graph`
  or `backend` as text inside its chip.
- **7** — Confirm one continuous `--paper-sunk` well with no separators and no per-line
  container, a fixed 72px timestamp column, and a 2ch hanging indent on wrapped lines. If each
  line has grown its own bordered row, the feed now reads as a table of cards instead of a
  console transcript.

### `/sandbox` — injection sandbox

- **4** — Confirm each preset exhibit's left-edge rule matches whether that text actually
  enters the hashed preimage, and that the returned reasoning beneath the banner carries no
  hashed rule, since it is not part of what was hashed.
- **5** — Confirm the pending control states "Judging…" in its label rather than signalling
  through colour or a spinner alone, and that the returned verdict states its outcome in words.
- **7** — Confirm the two presets are `EvidenceExhibit`s showing their payload verbatim, with
  the `VerdictBanner` beneath as the only dark block, and that no outer card wraps the presets
  and competes with the exhibit treatment.
- **Residual (10)** — This route renders `VerdictBanner`, so `motion-confinement` permits a hit
  here through the same owning file. Confirm the banner appears in place beneath the payload it
  judged, and that submitting the second preset does not replay the first banner's motion.

### `/trust-model` — the boundary statement

- **4** — Confirm the page opens with `rule-boundary` and uses it once, and that no other rule
  token sub-divides the prose. This is the one page whose entire argument is the boundary, so a
  second decorative rule dilutes it.
- **5** — There is no state indicator on this route. Confirm none was added.
- **7** — Confirm one prose column at the `body` step, max 68ch, opened by the boundary rule.
  The contract-enforced list and the trusted-infrastructure list must not become two
  side-by-side comparison cards; the boundary between them is the rule, not a gutter.

## Generic dashboard smell test

Questions a grep cannot answer. Ask them on the rendered screen at 1440px, then at 375px. Any
"yes" is a finding, and a finding is a `style:` commit whose body says what was revised.

- Does every container look the same regardless of what it holds? If a reader cannot tell an
  exhibit from a docket row from a log line with the text blurred out, criterion 7 has failed
  no matter what the build says.
- Does any border decorate rather than encode one of the seven rule meanings? Point at each
  rule on the screen and say its meaning out loud. A rule you cannot name is decoration.
- Is there a second dark surface competing with the ruling block? The verdict banner is the
  highest-contrast surface in the application by measurement, at 18.6:1. A dark header, a dark
  footer, or an inverted stat strip anywhere else spends the contrast the ruling needs.
- Does any state read as colour-only at a glance? Squint until the labels are unreadable. If
  you can still tell the states apart but a reader with a colour vision deficiency could not,
  the colour is carrying information the text should carry.
- Is there a size between the `screen` and `ruling` steps creeping in? The gap from 28px to
  52px is load-bearing. A heading that looks like it is reaching for the ruling step is
  reaching for it.
- Is there a shadow anywhere? There are none in the application. A shadow implies a floating
  object, and a record does not float.
- Does anything move that is not the verdict rule drawing? Including hover. Rows change
  background at 0ms, which is a state change, not an animation.
- Does a rounded corner appear on anything that is not a chip or a button? Radius is 0
  everywhere else, and 2px on those two.
- Does the screen top out at the `screen` step on `--paper`, if it is not the verdict record?
  A display-scale heading on the docket makes the ruling just another big word.
