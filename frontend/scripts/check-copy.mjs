#!/usr/bin/env node
/**
 * frontend/scripts/check-copy.mjs — the banned-phrase gate (Requirement 13.6).
 *
 * Enforces the trust-model copy discipline. Arbitra does not claim that the
 * inference is verified, does not extend the contract's trust boundary to the
 * model, does not assert a subgraph deployment, does not praise its own
 * accessibility, does not hardcode an escrow address, reads
 * ARBITRA_INTERNAL_KEY from exactly one module, never names the contract's
 * settlement entry points anywhere under `src/`, and writes the target chain's
 * identifier in exactly one module.
 *
 * Note the wording of the paragraph above. It is deliberately phrased to pass
 * its own rules, because this file is inside its own scope.
 *
 * ARC AS A NETWORK NAME IS NOT BANNED, AND MUST NOT BE.
 * An earlier revision of this gate carried an `arc-network` rule that failed
 * the build on `arc network|chain|testnet|mainnet`, because the target chain
 * was then Sepolia and Arc could only appear as a wrong network name. That
 * targeting has inverted. Requirement 12.5 now requires the interface to name
 * Arc Testnet in its chain copy, so the rule fired on mandated text, and
 * Requirement 13.7 requires the banned set to exclude Arc used as a network
 * name. The rule is gone rather than narrowed: every phrasing it could still
 * have caught is a phrasing the interface is now required to use.
 *
 * Scope is the `frontend/` workspace only. The spec documents under
 * `.kiro/specs/` legitimately contain every banned phrase — they are what
 * define the prohibitions — so scanning them would make the gate unusable.
 *
 * Output is `path:line:col  [rule-id]  matched text  — why`, one line per hit,
 * then a count, then a non-zero exit.
 *
 * ---------------------------------------------------------------------------
 * SELF-EXEMPTION
 *
 * `scripts/**\/*.mjs` is inside the scope, and this file is a script, so the
 * rule table below matches itself. At least two patterns genuinely fire on
 * their own source: the reverse-word-order rule matches its own rule id, and
 * `hardcoded-escrow` matches any example address written into a comment.
 *
 * The fix is a marked region rather than a file-level exemption. Only the lines
 * strictly between `check-copy:table-start` and `check-copy:table-end`, and
 * only in THIS file, are skipped; the markers are not honoured in any other
 * file. Everything else here — comments, helpers, output strings — is scanned
 * normally, and a banned phrase in a future `scripts/*.mjs` still fails the
 * build. Skipped lines are replaced with empty lines rather than removed, so
 * reported line numbers stay true to the file on disk.
 *
 * ---------------------------------------------------------------------------
 * RULE KINDS, AND WHY THE THIRD ONE IS NOT THE SECOND ONE
 *
 * Three kinds, and the difference between the last two is the whole reason this
 * section exists. Read it before adding a rule that has both a file predicate
 * and a number in it.
 *
 *   (default)   A phrase that must never appear. `scope` narrows where the rule
 *               looks; `exclude` removes paths from it. Any match fails.
 *
 *   'count'     A budget OVER A SCOPE. `scope` decides which files are looked
 *               at at all, and matches in those files are totalled against
 *               `max`. Files outside `scope` are not examined and contribute
 *               nothing. `internal-key-reads` is this: it counts occurrences
 *               inside `src/` and ignores the rest of the workspace entirely.
 *
 *   'confined'  A budget INSIDE ONE FILE, and a prohibition everywhere else.
 *               This reads the OPPOSITE WAY ROUND from 'count' and does not use
 *               `scope` at all. `confine` names the one place the token is
 *               allowed to live. A match in a file that `confine` does not
 *               accept is reported unconditionally, whatever the totals are; a
 *               match in the confined file counts against `max`, per distinct
 *               literal. `chain-literals` is this.
 *
 * Writing `chain-literals` in the shape of 'count' — `scope: [/^src\/lib\/
 * chain\.ts$/]` with a `max` — would be VACUOUS. It would examine only the file
 * the literals are supposed to be in, count them there, and never look at the
 * files the rule exists to police. The chain id could be typed into every
 * component in the tree and the gate would report zero violations. The two
 * kinds are spelled out separately in `main` for exactly this reason.
 * ------------------------------------------------------------------------ */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SELF = 'scripts/check-copy.mjs';
const TABLE_START = 'check-copy:table-start';
const TABLE_END = 'check-copy:table-end';

// check-copy:table-start — the rule table. Skipped when scanning this file only.
const BANNED = [
  {
    id: 'verified-inference',
    re: /verified\s+inference/gi,
    why: 'Arbitra does not perform verified inference. See R13.2.',
  },
  {
    id: 'trustless-ai',
    re: /trust-?less\s+(ai|artificial\s+intelligence|arbitration|judge|judging|judgment|verdict|evaluation)/gi,
    why: 'The contract is the trustless boundary; the model is not. See R13.3.',
  },
  {
    id: 'ai-trustless',
    re: /\b(ai|model|judge|llm)\b[^.\n]{0,48}\btrust-?less\b/gi,
    why: 'Same claim in reverse word order. See R13.3.',
  },
  {
    id: 'live-subgraph',
    re: /(live|deployed)\s+subgraph|subgraph\s+is\s+(live|deployed|serving)/gi,
    why: 'No subgraph deployment is asserted. See R10.4.',
  },
  {
    id: 'self-praise',
    re: /(fully|completely)\s+(accessible|responsive)|works\s+on\s+every\s+(device|screen)/gi,
    why: 'The interface does not announce its own accessibility. See R15.6.',
  },
  {
    id: 'hardcoded-escrow',
    re: /0x[0-9a-fA-F]{40}\b/g,
    exclude: [/^src\/fixtures\//],
    why: 'No hardcoded escrow address. Read NEXT_PUBLIC_ESCROW_ADDRESS. See R12.6.',
  },
  {
    id: 'no-resolve-escrow',
    re: /\bresolveEscrow\b|\bclaimExpiredRefund\b/g,
    scope: [/^src\//],
    why: 'The frontend never settles. Settlement is the oracle\'s. See R20.7.',
  },
  {
    id: 'internal-key-reads',
    kind: 'count',
    re: /ARBITRA_INTERNAL_KEY/g,
    max: 1,
    scope: [/^src\//],
    why: 'The internal key may be read in exactly one module. See R11.5.',
  },
  {
    id: 'chain-literals',
    kind: 'confined',
    re: /\b5042002\b|\b0x4CEF52\b/gi,
    confine: /^src\/lib\/chain\.ts$/,
    max: 2,
    why: 'The chain id belongs to lib/chain.ts alone. See R12.5, R12.7.',
  },
];
// check-copy:table-end

/** Every path the gate reads. Braces are expanded by hand: `fs.globSync`
 *  pattern support is not something to bet a build gate on. */
const SCOPE = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.css',
  'scripts/**/*.mjs',
  'docs/**/*.md',
  'README.md',
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

/** Reads a file, blanking this script's own rule-table region. See the header. */
function readScannable(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (rel !== SELF) return raw;

  const lines = raw.split('\n');
  let inTable = false;
  return lines
    .map((line) => {
      if (line.includes(TABLE_START)) {
        inTable = true;
        return line;
      }
      if (line.includes(TABLE_END)) {
        inTable = false;
        return line;
      }
      return inTable ? '' : line;
    })
    .join('\n');
}

/** Byte offset -> 1-based line and column. */
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

function matchesIn(rule, rel, text) {
  const found = [];
  const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') {
      re.lastIndex += 1;
      continue;
    }
    const { line, col } = positionOf(text, m.index);
    found.push({ rel, line, col, text: m[0].replace(/\s+/g, ' ').trim() });
  }
  return found;
}

function inScope(rule, rel) {
  if (rule.scope && !rule.scope.some((p) => p.test(rel))) return false;
  if (rule.exclude && rule.exclude.some((p) => p.test(rel))) return false;
  return true;
}

function main() {
  const files = collectFiles();
  const contents = new Map(files.map((rel) => [rel, readScannable(rel)]));
  const hits = [];

  for (const rule of BANNED) {
    const found = [];
    for (const rel of files) {
      if (!inScope(rule, rel)) continue;
      found.push(...matchesIn(rule, rel, contents.get(rel)));
    }

    if (rule.kind === 'count') {
      // A budget OVER A SCOPE: `scope` already filtered the files, and what
      // survived is totalled. Over budget, every occurrence is reported,
      // because the reviewer has to choose which one survives and cannot do
      // that from a total.
      if (found.length > rule.max) {
        for (const hit of found) {
          hits.push({ ...hit, id: rule.id, why: `${rule.why} Found ${found.length}, max ${rule.max}.` });
        }
      }
      continue;
    }

    if (rule.kind === 'confined') {
      // A budget INSIDE ONE FILE, and a prohibition everywhere else. The scope
      // test is inverted relative to 'count' above, and deliberately written out
      // rather than reusing that branch: see RULE KINDS in the header. `found`
      // here spans EVERY file in scan scope, because a confined rule declares no
      // `scope` — the point is to look outside `confine`, not inside it.
      const outside = found.filter((hit) => !rule.confine.test(hit.rel));
      const inside = found.filter((hit) => rule.confine.test(hit.rel));

      // Outside the confined file: unconditional. No total makes this allowed.
      for (const hit of outside) {
        hits.push({ ...hit, id: rule.id, why: `${rule.why} Permitted only in the confined module.` });
      }

      // Inside it: `max` per distinct literal, so one token going over budget
      // does not hide behind another token's headroom. Grouped case-folded,
      // because the pattern is case-insensitive and the hexadecimal form is the
      // same literal in either letter case.
      const byLiteral = new Map();
      for (const hit of inside) {
        const key = hit.text.toLowerCase();
        if (!byLiteral.has(key)) byLiteral.set(key, []);
        byLiteral.get(key).push(hit);
      }
      for (const [, group] of byLiteral) {
        if (group.length <= rule.max) continue;
        for (const hit of group) {
          hits.push({ ...hit, id: rule.id, why: `${rule.why} Found ${group.length}, max ${rule.max}.` });
        }
      }
      continue;
    }

    for (const hit of found) hits.push({ ...hit, id: rule.id, why: rule.why });
  }

  hits.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line || a.col - b.col);

  for (const hit of hits) {
    console.error(`${hit.rel}:${hit.line}:${hit.col}  [${hit.id}]  ${hit.text}  — ${hit.why}`);
  }

  if (hits.length > 0) {
    console.error(`\ncheck-copy: ${hits.length} violation${hits.length === 1 ? '' : 's'} in ${files.length} files.`);
    process.exit(1);
  }

  console.log(`check-copy: 0 violations in ${files.length} files.`);
}

main();
