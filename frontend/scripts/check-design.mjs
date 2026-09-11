#!/usr/bin/env node
/**
 * frontend/scripts/check-design.mjs — the visual grammar gate
 * (Requirement 14, Properties 33 and 57–64).
 *
 * RETUNED FOR A DARK PALETTE. Requirement 14 was rewritten from a restrained
 * paper-and-ink court-record aesthetic to a dark dashboard aesthetic, so four
 * blanket prohibitions this script used to carry are gone: `glassmorphism`,
 * `gradient`, `gradient-utility`, and `tracked-caps` forbade things the
 * requirement now permits, and `arrow-glyph` forbade something it no longer
 * mentions. The arrow rule's MACHINERY is retained and reused — comment
 * stripping and label-position matching are what keep `middle-dot` accurate.
 *
 * What replaced them is bounded permission rather than prohibition: gradients
 * are capped at two named classes, tracked capitals are permitted only at the
 * caption step, and hover may change colour but not geometry. A cap is a rule a
 * reviewer can satisfy; a ban is one they work around.
 *
 * THREE KINDS OF RULE
 * -------------------
 * PATTERN rules forbid an occurrence: middle-dot metadata strings, hover
 * transforms and shadows, transitions over 200ms, raw gradients in components,
 * unpaired `uppercase`, tracking literals, and bracket-literal font sizes. Two
 * of them are conditional — `over` fires only above a duration threshold, and
 * `requiresOnLine` fires only when a required companion utility is absent.
 *
 * CONFINEMENT rules bound how many files may reference a token and, where it
 * matters, which files those must be.
 *
 * The CHROMA rule is the boldness budget, and it is computed rather than listed:
 * the script reads the token layer, converts every background token to OKLCH,
 * and confines each saturated one to a single file. See the block above
 * `CHROMA_THRESHOLD` for why contrast stopped working as the measure.
 *
 * EVERY BOUND IS AN UPPER BOUND, NEVER AN EQUALITY, and that framing is
 * load-bearing rather than stylistic. This gate runs in the build chain from the
 * commit that lands the token layer onward, but `VerdictBanner.tsx`,
 * `MachineValue.tsx`, `FieldSet.tsx`, and `Button.tsx` arrive later. A count of
 * zero has to pass, or every build fails until the last of them exists.
 *
 * `src/app/globals.css` is the sole token-declaration site and `src/app/fonts.ts`
 * the sole font-variable declaration site. Both are exempt from the confinement
 * and budget rules that would otherwise count their declarations as uses.
 * Declaration is not use — the tokens have to be born somewhere.
 *
 * `middle-dot` scans a COMMENT-STRIPPED view, because punctuation is the one
 * thing prose and interface text have in common: a doc comment reading
 * `Created → Funded` is a state transition, and rewording source to satisfy a
 * grep makes the source worse in exchange for nothing.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const SCOPE = ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.css'];

/** The sole token-declaration site. Declaration is not use, so it is exempt. */
const TOKENS = 'src/app/globals.css';
/** The sole font-family-variable declaration site. */
const FONTS = 'src/app/fonts.ts';
/** The one file permitted an entrance animation: the verdict landing. */
const MOTION_OWNER = 'src/components/primitives/VerdictBanner.tsx';

/* -----------------------------------------------------------------------------
 * Pattern rules — any occurrence is a violation.
 * -------------------------------------------------------------------------- */
const PATTERNS = [
  {
    id: 'middle-dot',
    // Kept, and the reference this palette borrows from would fail it hardest.
    // A middle-dot strip is one string, so nothing in it is individually
    // labelled, addressable, or copyable, and a reader cannot tell which
    // fragment is protocol data and which is the interface's own arithmetic.
    // Metadata renders as labelled pairs instead. See R14.11.
    res: [/["'`]\s+·\s+["'`]/g, /join\(\s*["'`][^"'`]*·[^"'`]*["'`]\s*\)/g],
    source: 'code',
    why: 'Metadata renders as a <dl> of labelled pairs, never a middle-dot string. See R14.11.',
  },
  {
    id: 'hover-motion',
    // RETUNED. Hover *transitions* are now permitted — the motion table allows
    // a 120ms background step on a row. Hover TRANSFORMS and SHADOWS are not,
    // and there are no shadows anywhere: elevation is surface tone plus border,
    // because a shadow implies a floating object and a record does not float.
    res: [
      /hover:scale/g,
      /hover:translate/g,
      /hover:rotate/g,
      /hover:shadow/g,
      /transition-transform/g,
      /transition-shadow/g,
      /\bshadow-(?!none\b)[\w[]/g,
    ],
    exclude: [TOKENS],
    why: 'Hover may change colour, never geometry. No shadows at all. See R14.12.',
  },
  {
    id: 'motion-duration',
    // An interactive transition completes within 200ms (R14.12). The one
    // entrance moment — the verdict rule sweeping across the banner at 320ms —
    // lives in the allow-listed file below, which is also the only place
    // `animate-` or `@keyframes` may appear.
    res: [
      /\bduration-\[(\d{3,})ms\]/g,
      /\bduration-(\d{3,})\b/g,
      /transition-duration:\s*(\d{3,})ms/g,
      /\banimate-[\w[]/g,
      /@keyframes/g,
    ],
    // A focus ring must not fade in — a focus indicator that animates is one
    // that is briefly absent — so an outline transition is exempt.
    allow: /outline/i,
    exclude: [TOKENS, MOTION_OWNER],
    over: 200,
    why: 'Interactive transitions finish within 200ms; the one entrance moment lives in VerdictBanner. See R14.12.',
  },
  {
    id: 'gradient-cap',
    // Gradients are now PERMITTED but capped: at most one gradient-treated
    // heading phrase and one gradient rail across the application, declared as
    // the two classes in globals.css and never information-bearing (R14.9).
    // A raw gradient in a component bypasses the cap, so it fails here.
    res: [/\b(?:linear|radial|conic)-gradient\s*\(/g, /\bbg-gradient[\w-]*/g],
    exclude: [TOKENS],
    why: 'Gradients live in the two capped classes in globals.css, not in components. See R14.9.',
  },
  {
    id: 'caption-caps',
    // The positive inversion of the old `tracked-caps` prohibition. Tracked
    // capitals are how this palette gets its density, so they are permitted —
    // but only at the caption step, which bundles the size with the tracking.
    // An `uppercase` utility must therefore sit alongside `text-caption`, and a
    // bare `tracking-` literal in a component means someone is rolling their
    // own label size. See R14.10.
    res: [/\buppercase\b/g],
    requiresOnLine: /\btext-caption\b/,
    include: [/\.tsx?$/],
    why: 'Tracked capitals are the caption step only. Pair `uppercase` with `text-caption`. See R14.10.',
  },
  {
    id: 'tracking-literal',
    res: [/\btracking-(?:tighter|tight|normal|wide|wider|widest)\b/g, /\btracking-\[[^\]]*\]/g],
    include: [/\.tsx?$/],
    why: 'Tracking belongs to the type scale, not to a component. See R14.2, R14.10.',
  },
  {
    id: 'bracket-font-size',
    // A Tailwind arbitrary-value utility, so it only ever appears in a class
    // string: scoped to ts/tsx. Every size comes from one of the nine named
    // scale steps declared in globals.css.
    res: [/\btext-\[[^\]]*\]/g, /\bleading-\[[^\]]*\]/g],
    include: [/\.tsx?$/],
    why: 'Every text size comes from a named scale step, not a literal. See R14.2.',
  },
];

/* -----------------------------------------------------------------------------
 * Confinement rules — at most `max` files may reference the token, and if any
 * does, its basename must be `owner`. Zero passes.
 * -------------------------------------------------------------------------- */
const CONFINEMENTS = [
  {
    id: 'mono-confinement',
    // Monospace marks a value you can compare byte for byte. The reference this
    // palette borrows from puts mono on nav labels, section headings, and pill
    // text, which destroys that signal: if the chrome is mono, a hash in mono is
    // no longer marked as anything. So the allow-list is two files.
    //
    // `FieldSet` earns its place rather than bending the rule — a 42-character
    // address typed into a form field IS machine-identity data, and an `<input>`
    // cannot render through `MachineValue`. See R14.3.
    res: [/font-mono/g, /--font-mono/g],
    max: 2,
    owners: ['MachineValue.tsx', 'FieldSet.tsx'],
    exempt: [TOKENS, FONTS],
    why: 'Monospace is machine-identity data only. Labels, headings, nav and pills take the grotesk. See R14.3.',
  },
  {
    id: 'gradient-class-cap',
    // The two permitted gradients, each referenced by at most one component.
    // `gradient-heading` goes on the home hero; `gradient-rail` on the nav
    // divider. Deliberately NOT on the lifecycle rail, where a gradient would
    // read as progress and so would carry information by gradient alone.
    res: [/\bgradient-heading\b/g, /\bgradient-rail\b/g],
    max: 2,
    owners: null, // any file may own one, but no more than two files in total
    exempt: [TOKENS],
    why: 'One gradient heading and one gradient rail across the application. See R14.9.',
  },
  {
    id: 'ruling-step-budget',
    res: [/\btext-ruling\b/g],
    max: 1,
    owners: ['VerdictBanner.tsx'],
    // globals.css declares `--text-ruling` as the ninth scale step. Without this
    // exemption the count reads 1 before VerdictBanner exists and 2 after.
    exempt: [TOKENS],
    why: 'The display step is reserved for the one-word ruling. See R8.9, R14.13.',
  },
];

/* -----------------------------------------------------------------------------
 * The boldness budget, measured by chroma rather than by contrast.
 *
 * On the previous light palette the measure was "the highest contrast pairing in
 * the application", and the inverted near-black verdict block genuinely was it.
 * THAT MEASURE INVERTS ON DARK AND STOPS DISCRIMINATING: `--ruling-ink` on
 * `--ruling-ground` is 14.15:1 while `--text-hi` on `--base` is 17.77:1, so the
 * ordinary page ground beats the ruling block. Contrast is no longer the axis.
 *
 * The axis that does discriminate is SATURATION AT REGION SCALE. Every surface
 * in this application is a near-neutral except one. So: compute the OKLCH chroma
 * of every background token declared in `globals.css`, take those above the
 * threshold, and confine each to a single file.
 *
 * The per-token allow-list is what keeps the rule honest. `--accent` is MORE
 * saturated than `--ruling-ground`, so a rule phrased as "the most saturated
 * background wins" would be satisfied by a button. Region scale versus control
 * scale is the real distinction: the banner is a full-bleed region, the accent
 * is a control fill. See R14.13.
 * -------------------------------------------------------------------------- */
const CHROMA_THRESHOLD = 0.08;

/** Which file may own each high-chroma background token. */
const CHROMA_OWNERS = {
  'ruling-ground': 'VerdictBanner.tsx',
  accent: 'Button.tsx',
};

/** sRGB hex to OKLCH chroma. Enough of the transform to rank saturation. */
function chromaOf(hex) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return 0;
  const srgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  // sRGB to linear
  const lin = srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = lin;
  // Linear sRGB to LMS, per Björn Ottosson's OKLab matrices
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.sqrt(a * a + bb * bb);
}

/**
 * Background tokens declared in the token layer, with their chroma.
 * Returns `[{ name, hex, chroma }]` for those above the threshold.
 */
function saturatedBackgroundTokens(tokenSource) {
  const found = [];
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g;
  let match;
  while ((match = re.exec(tokenSource)) !== null) {
    const [, name, hex] = match;
    // Text and border tokens are foregrounds; the budget is about surfaces.
    if (/^(?:text|border|font|radius)/.test(name)) continue;
    const chroma = chromaOf(hex);
    if (chroma >= CHROMA_THRESHOLD) found.push({ name, hex, chroma });
  }
  return found;
}

function collectFiles() {
  const seen = new Set();
  for (const pattern of SCOPE) {
    for (const hit of fs.globSync(pattern, { cwd: ROOT })) {
      const rel = hit.split(path.sep).join('/');
      if (fs.statSync(path.join(ROOT, rel)).isFile()) seen.add(rel);
    }
  }
  return [...seen].sort();
}

/**
 * Blank out comments, preserving every other byte and every newline, so a rule
 * scanning the result reports the same line and column as it would against the
 * original file. Comment bodies become spaces rather than disappearing.
 *
 * String and template literals are walked through, not stripped: a label lives
 * in one, and a `//` inside one is not a comment. Regex literals are recognised
 * so that a pattern containing `/*` or `//` cannot open a phantom comment; the
 * usual heuristic applies — a `/` is a regex start only where an expression may
 * begin, which is after an operator, an opening bracket, or a comma.
 *
 * CSS gets block comments only. `//` opens nothing in CSS, and treating it as a
 * comment would eat the rest of any line holding a `https://` URL.
 */
function stripComments(text, rel) {
  const css = rel.endsWith('.css');
  const out = text.split('');
  const blank = (from, to) => {
    for (let i = from; i < to && i < text.length; i += 1) {
      if (text[i] !== '\n') out[i] = ' ';
    }
  };
  // The last non-space character seen at the top level, for the regex heuristic.
  let prev = '';
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (!css && c === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      const stop = nl === -1 ? text.length : nl;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === c) break;
        // An unterminated single-quoted string is far likelier to be an
        // apostrophe in JSX text than a real literal, so stop at the newline.
        if (c !== '`' && text[i] === '\n') break;
        i += 1;
      }
      i += 1;
      prev = c;
      continue;
    }

    if (!css && c === '/' && (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev))) {
      // A regex literal. Walk to its unescaped closing slash, minding classes.
      let inClass = false;
      i += 1;
      while (i < text.length && text[i] !== '\n') {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
        else if (text[i] === '/' && !inClass) break;
        i += 1;
      }
      i += 1;
      prev = '/';
      continue;
    }

    if (!/\s/.test(c)) prev = c;
    i += 1;
  }

  return out.join('');
}

function positionOf(text, index) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart + 1 };
}

/** The whole line a match sits on, used to test `allow`. */
function lineTextAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end);
}

function matchesIn(res, rel, text, allow) {
  const found = [];
  for (const source of res) {
    const re = new RegExp(source.source, source.flags.includes('g') ? source.flags : `${source.flags}g`);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') {
        re.lastIndex += 1;
        continue;
      }
      if (allow && allow.test(lineTextAt(text, m.index))) continue;
      const { line, col } = positionOf(text, m.index);
      found.push({ rel, line, col, index: m.index, text: m[0].replace(/\s+/g, ' ').trim() });
    }
  }
  return found;
}

function main() {
  const files = collectFiles();
  const contents = new Map(files.map((rel) => [rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]));
  /** The same files with comments blanked out, for rules declaring `source: 'code'`. */
  const code = new Map([...contents].map(([rel, text]) => [rel, stripComments(text, rel)]));
  const viewFor = (rule, rel) => (rule.source === 'code' ? code : contents).get(rel);
  const hits = [];

  for (const rule of PATTERNS) {
    for (const rel of files) {
      if (rule.exclude?.includes(rel)) continue;
      if (rule.include && !rule.include.some((p) => p.test(rel))) continue;

      for (const hit of matchesIn(rule.res, rel, viewFor(rule, rel), rule.allow)) {
        // A duration rule only fires above its threshold. `duration-150` is
        // fine; `duration-500` is not. The captured group carries the number.
        if (rule.over !== undefined) {
          const ms = Number((hit.text.match(/(\d{3,})/) ?? [])[1]);
          if (Number.isFinite(ms) && ms <= rule.over) continue;
        }

        // A co-occurrence rule fires only when the required companion is
        // ABSENT from the same line. `uppercase` alongside `text-caption` is
        // the permitted treatment; `uppercase` alone is someone rolling their
        // own label size.
        if (rule.requiresOnLine !== undefined) {
          const line = lineTextAt(viewFor(rule, rel), hit.index ?? 0);
          if (rule.requiresOnLine.test(line)) continue;
        }

        hits.push({ ...hit, id: rule.id, why: rule.why });
      }
    }
  }

  for (const rule of CONFINEMENTS) {
    const byFile = new Map();
    for (const rel of files) {
      if (rule.exempt?.includes(rel)) continue;
      const found = matchesIn(rule.res, rel, viewFor(rule, rel), rule.allow);
      if (found.length > 0) byFile.set(rel, found);
    }

    const referencing = [...byFile.keys()];

    // UPPER BOUND, NEVER AN EQUALITY. Zero referencing files is a pass, which is
    // what keeps the build green between the commit that lands the token layer
    // and the commit that lands the component owning the token.
    if (referencing.length > rule.max) {
      for (const [rel, found] of byFile) {
        hits.push({
          ...found[0],
          id: rule.id,
          why: `${rule.why} Referenced by ${referencing.length} files, at most ${rule.max} allowed: ${referencing.join(', ')}.`,
        });
        void rel;
      }
      continue;
    }

    // `owners: null` means the count is the whole constraint and any file may
    // hold one. Otherwise the referencing file has to be a named owner.
    if (rule.owners === null || rule.owners === undefined) continue;

    for (const [rel, found] of byFile) {
      if (!rule.owners.includes(path.basename(rel))) {
        hits.push({
          ...found[0],
          id: rule.id,
          why: `${rule.why} Only ${rule.owners.join(' or ')} may reference it.`,
        });
      }
    }
  }

  // The boldness budget: each saturated background token confined to one file.
  const tokenSource = contents.get(TOKENS) ?? '';
  for (const token of saturatedBackgroundTokens(tokenSource)) {
    const owner = CHROMA_OWNERS[token.name];
    const pattern = new RegExp(`\\bbg-${token.name.replace(/[-]/g, '-')}\\b`, 'g');
    const byFile = new Map();

    for (const rel of files) {
      if (rel === TOKENS) continue;
      const found = matchesIn([pattern], rel, viewFor({}, rel));
      if (found.length > 0) byFile.set(rel, found);
    }

    const referencing = [...byFile.keys()];
    const detail = `chroma ${token.chroma.toFixed(3)} at or above ${CHROMA_THRESHOLD}`;

    if (referencing.length > 1) {
      for (const [, found] of byFile) {
        hits.push({
          ...found[0],
          id: 'boldness-chroma',
          why: `A saturated surface belongs to one region (${detail}). Referenced by ${referencing.length} files: ${referencing.join(', ')}. See R14.13.`,
        });
      }
      continue;
    }

    if (owner !== undefined) {
      for (const [rel, found] of byFile) {
        if (path.basename(rel) !== owner) {
          hits.push({
            ...found[0],
            id: 'boldness-chroma',
            why: `\`--${token.name}\` (${detail}) belongs to ${owner} alone. See R14.13.`,
          });
        }
      }
    }
  }

  hits.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line || a.col - b.col);

  for (const hit of hits) {
    console.error(`${hit.rel}:${hit.line}:${hit.col}  [${hit.id}]  ${hit.text}  — ${hit.why}`);
  }

  if (hits.length > 0) {
    console.error(`\ncheck-design: ${hits.length} violation${hits.length === 1 ? '' : 's'} in ${files.length} files.`);
    process.exit(1);
  }

  console.log(`check-design: 0 violations in ${files.length} files.`);
}

main();
