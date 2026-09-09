#!/usr/bin/env node
/**
 * frontend/scripts/check-copy.mjs — the banned-phrase gate (Requirement 13.6).
 *
 * Enforces the trust-model copy discipline. Arbitra does not claim that the
 * inference is verified, does not extend the contract's trust boundary to the
 * model, does not assert a subgraph deployment or a network other than Sepolia,
 * does not praise its own accessibility, does not hardcode an escrow address,
 * and reads ARBITRA_INTERNAL_KEY from exactly one module.
 *
 * Note the wording of the paragraph above. It is deliberately phrased to pass
 * its own rules, because this file is inside its own scope.
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
    id: 'arc-network',
    re: /\barc\s+(network|chain|testnet|mainnet)\b/gi,
    why: 'Sepolia only. See R12.5.',
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
    id: 'internal-key-reads',
    kind: 'count',
    re: /ARBITRA_INTERNAL_KEY/g,
    max: 1,
    scope: [/^src\//],
    why: 'The internal key may be read in exactly one module. See R11.5.',
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
      // A count rule permits up to `max` occurrences. Over budget, every
      // occurrence is reported, because the reviewer has to choose which one
      // survives and cannot do that from a total.
      if (found.length > rule.max) {
        for (const hit of found) {
          hits.push({ ...hit, id: rule.id, why: `${rule.why} Found ${found.length}, max ${rule.max}.` });
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
