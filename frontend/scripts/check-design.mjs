#!/usr/bin/env node
/**
 * frontend/scripts/check-design.mjs — the forbidden visual pattern gate
 * (Requirement 14.6/14.8/14.9/14.10/14.11, Property 33).
 *
 * Two kinds of rule.
 *
 * PATTERN rules forbid a token outright: glassmorphism, decorative gradients,
 * tracked-out capitals, arrow glyphs on labels, middle-dot-joined metadata,
 * hover motion, and bracket-literal font sizes. Any hit fails.
 *
 * CONFINEMENT rules bound how many files may reference a token and, if any
 * does, which file that must be. These are UPPER BOUNDS, never equalities: a
 * count of zero passes. That framing is load-bearing. This gate is wired into
 * the build chain at task 2.3, but `MachineValue.tsx` does not exist until task
 * 6.1 and `VerdictBanner.tsx` not until task 10.2, so an equality rule would
 * fail every build from here through task 10.1 — including the first deployment
 * at task 8.2. Task 11.4 is where the counts are separately asserted to have
 * reached exactly one.
 *
 * `src/app/globals.css` is the sole token-declaration site and `src/app/fonts.ts`
 * the sole font-variable declaration site. Both are exempt from the confinement
 * and budget rules that would otherwise count their declarations as uses.
 * Declaration is not use — the tokens have to be born somewhere.
 *
 * The glyph rules (`arrow-glyph`, `middle-dot`) forbid a punctuation character,
 * and punctuation is the one thing prose and interface text have in common. Both
 * therefore scan a comment-stripped view of each file and both test for the
 * glyph in a *label* position rather than anywhere at all. Requirement 14.9
 * forbids "button labels ending in an arrow glyph", not the character; a doc
 * comment reading `Created → Funded` is a state transition, and rewording it to
 * satisfy a grep would make the source worse to read in exchange for nothing.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const SCOPE = ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.css'];

/** The sole token-declaration site. */
const TOKENS = 'src/app/globals.css';
/** The sole font-family-variable declaration site. */
const FONTS = 'src/app/fonts.ts';

/* -----------------------------------------------------------------------------
 * Pattern rules — any occurrence is a violation.
 * -------------------------------------------------------------------------- */
const PATTERNS = [
  {
    id: 'glassmorphism',
    res: [/backdrop-blur[\w-]*/g, /\bbg-(?:white|black|paper|ink)\/\d{1,3}\b/g, /bg-opacity/g],
    why: 'No frosted panels. Elevation is paper tone and rule weight. See R14.6.',
  },
  {
    id: 'gradient',
    // `gradient` in general, but the token-declaration site is exempt: the
    // three-part boundary rule (`rule-boundary`) is painted as a padding-box
    // linear-gradient because the application has no box shadow to use instead.
    // A decorative *utility* is still caught there — see `gradient-utility`.
    res: [/gradient/gi],
    exclude: [TOKENS],
    why: 'No gradient washes as decoration. See R14.6.',
  },
  {
    id: 'gradient-utility',
    // Applies everywhere, globals.css included, so the exemption above cannot
    // be used to smuggle a decorative gradient into the theme.
    res: [/\bbg-gradient[\w-]*/g, /\bbg-\[(?:linear|radial|conic)-gradient/g],
    why: 'No `bg-gradient-*` utility exists in this codebase. See R14.6.',
  },
  {
    id: 'tracked-caps',
    res: [
      /uppercase[^\n]{0,48}tracking-/g,
      /tracking-[^\n]{0,48}uppercase/g,
      /\btracking-(?:wide|wider|widest)\b/g,
    ],
    why: 'Labels are sentence case at the caption step, not tracked-out capitals. See R14.8.',
  },
  {
    id: 'arrow-glyph',
    // A *trailing* arrow, glyph or ASCII, is one at the end of a label: before
    // the closing quote of a string constant, before the JSX close tag, or at
    // end of line. `Created → Funded` — an arrow with prose after it — is a
    // transition, not a label, and is not what R14.9 forbids.
    res: [/[→↗»›][ \t]*(?=["'`<]|$)/gm, /->[ \t]*(?=["'`<]|$)/gm],
    source: 'code',
    why: 'Buttons say what they do. No arrow glyphs on labels. See R14.9.',
  },
  {
    id: 'middle-dot',
    res: [/["'`]\s+·\s+["'`]/g, /join\(\s*["'`][^"'`]*·[^"'`]*["'`]\s*\)/g],
    source: 'code',
    why: 'Metadata renders as a <dl>, never a middle-dot-joined string. See R14.10.',
  },
  {
    id: 'hover-motion',
    res: [/hover:scale/g, /hover:translate/g, /hover:shadow/g, /transition-transform/g],
    why: 'Rows change background at 0ms. No hover motion. See R14.11.',
  },
  {
    id: 'bracket-font-size',
    // A Tailwind arbitrary-value utility, so it only ever appears in a class
    // string: scoped to ts/tsx. Every size comes from one of the eight named
    // scale steps declared in globals.css.
    res: [/\btext-\[[^\]]*\]/g, /\bleading-\[[^\]]*\]/g, /\btracking-\[[^\]]*\]/g],
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
    res: [/font-mono/g, /--font-mono/g],
    max: 1,
    owner: 'MachineValue.tsx',
    exempt: [TOKENS, FONTS],
    why: 'The monospace family belongs to the machine-value primitive alone. See R14.3.',
  },
  {
    id: 'motion-confinement',
    res: [/\banimate-[\w[]/g, /\btransition-[\w[]/g, /@keyframes/g, /\banimation\s*:/g],
    // The focus ring's outline transition is the one exception: it is a
    // focus-visible affordance, not an entrance flourish.
    allow: /outline/i,
    max: 1,
    owner: 'VerdictBanner.tsx',
    exempt: [TOKENS],
    why: 'The application has one motion moment, and it belongs to the verdict banner. See R7.7.',
  },
  {
    id: 'ruling-step-budget',
    res: [/\btext-ruling\b/g],
    max: 1,
    owner: 'VerdictBanner.tsx',
    // globals.css declares `--text-ruling` as the eighth scale step. Without
    // this exemption the count reads 1 before VerdictBanner exists and 2 after,
    // which would trip the exactly-one assertion at task 11.4.
    exempt: [TOKENS],
    why: 'The display step is reserved for the one-word ruling. See R8.9.',
  },
  {
    id: 'ruling-surface-budget',
    res: [/\bruling-ground\b/g, /\bruling-ink\b/g],
    max: 1,
    owner: 'VerdictBanner.tsx',
    exempt: [TOKENS],
    why: 'The inverted surface is the verdict block and nowhere else. See R8.9.',
  },
];

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
      found.push({ rel, line, col, text: m[0].replace(/\s+/g, ' ').trim() });
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

    // Upper bound, not an equality. Zero referencing files is a pass.
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

    for (const [rel, found] of byFile) {
      if (path.basename(rel) !== rule.owner) {
        hits.push({
          ...found[0],
          id: rule.id,
          why: `${rule.why} Only ${rule.owner} may reference it.`,
        });
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
