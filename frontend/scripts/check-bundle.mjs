#!/usr/bin/env node
/**
 * frontend/scripts/check-bundle.mjs — asserts the internal key is absent from
 * the client bundle (Requirement 11.5).
 *
 * Runs AFTER `next build`, because it inspects the actual emitted artefact
 * rather than reasoning about the framework's inlining rule. Every file under
 * `.next/static/` is scanned for two things:
 *
 *   1. the identifier `ARBITRA_INTERNAL_KEY`, always — its presence in a client
 *      chunk means a `NEXT_PUBLIC_` alias or a client-side read crept in;
 *   2. the literal value, when the variable is set in the build environment.
 *
 * Any hit exits non-zero. The value itself is never echoed, only its location.
 *
 * When the variable is unset the scan still runs for the identifier, and the
 * report says plainly that the value check was skipped, so a green run cannot be
 * mistaken for a full one. Task 15.7 is where the build is run with the variable
 * set so that both halves execute.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATIC_DIR = path.join(ROOT, '.next', 'static');

const IDENTIFIER = 'ARBITRA_INTERNAL_KEY';
/** Shorter values are too likely to collide with minified output to be a signal. */
const MIN_VALUE_LENGTH = 8;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Byte offset -> 1-based line and column, over latin1-decoded bytes. */
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

function occurrences(text, needle) {
  const found = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return found;
    found.push(positionOf(text, at));
    from = at + needle.length;
  }
}

function main() {
  if (!fs.existsSync(STATIC_DIR)) {
    console.log(
      `check-bundle: nothing scanned — ${path.relative(ROOT, STATIC_DIR)} does not exist.\n` +
        'check-bundle: run `next build` first. This check is part of the `build` script and runs there automatically.',
    );
    return;
  }

  const value = process.env[IDENTIFIER];
  const scanValue = typeof value === 'string' && value.length >= MIN_VALUE_LENGTH;

  const files = walk(STATIC_DIR).sort();
  const hits = [];

  for (const full of files) {
    // latin1 so arbitrary bytes decode without loss and byte offsets stay
    // aligned with character offsets. Source maps and fonts are scanned too.
    const text = fs.readFileSync(full, 'latin1');
    const rel = path.relative(ROOT, full).split(path.sep).join('/');

    for (const at of occurrences(text, IDENTIFIER)) {
      hits.push({ rel, ...at, what: 'identifier', detail: IDENTIFIER });
    }
    if (scanValue) {
      for (const at of occurrences(text, value)) {
        // The value is deliberately not printed.
        hits.push({ rel, ...at, what: 'literal value', detail: `<${IDENTIFIER} value, ${value.length} chars>` });
      }
    }
  }

  for (const hit of hits) {
    console.error(`${hit.rel}:${hit.line}:${hit.col}  [internal-key-in-bundle]  ${hit.detail}  — the ${hit.what} of the server-only internal key reached a client chunk. See R11.5.`);
  }

  if (hits.length > 0) {
    console.error(`\ncheck-bundle: ${hits.length} violation${hits.length === 1 ? '' : 's'} in ${files.length} emitted files.`);
    process.exit(1);
  }

  console.log(
    `check-bundle: 0 violations in ${files.length} emitted files under .next/static/. ` +
      (scanValue
        ? 'Identifier and literal value both scanned.'
        : `Identifier scanned; ${IDENTIFIER} is unset in this environment, so the literal-value scan was skipped.`),
  );
}

main();
