/**
 * Unit tests for `lib/errorCopy.ts` — the specific sentences the requirements
 * name, and the branches that vary.
 *
 * These are examples, not properties. Property 19 (totality over generated
 * errors, never throws) and Property 37 (pairwise-distinct contract messages)
 * carry the universal claims in their own files. What is checked here is the
 * copy a requirement quotes by name, and every arm whose output depends on the
 * error's payload: the interpolations, and each fallback taken when the payload
 * is absent.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { API_ERROR_COPY, CONTRACT_ERROR_COPY, REFUND_AVAILABILITY } from '@/content/copy';
import { CONTRACT_ERROR_NAMES, contractErrorCopy, errorCopy } from '@/lib/errorCopy';
import type { ApiError, ContractErrorName, MissingResource } from '@/types';

/** One representative of every member of the union. */
const ONE_OF_EACH: readonly ApiError[] = [
  { kind: 'network', base: 'https://backend.example' },
  { kind: 'bad-request', status: 400, message: 'acceptanceCriteria must not be empty' },
  { kind: 'unauthorized', status: 401, envVar: 'SOME_SERVER_ONLY_KEY' },
  { kind: 'not-found', status: 404, resource: 'deal', id: '0xdeal' },
  { kind: 'server', status: 500, message: 'internal' },
  { kind: 'upstream', status: 502, message: 'model provider refused' },
  { kind: 'unavailable', status: 503 },
  { kind: 'contract', name: 'InvalidState' },
  { kind: 'malformed', expected: 'isAuditableVerdict' },
];

test('every member of the union yields a non-empty cause and recovery', () => {
  for (const error of ONE_OF_EACH) {
    const { cause, recovery } = errorCopy(error);
    assert.ok(cause.trim().length > 0, `empty cause for ${error.kind}`);
    assert.ok(recovery.trim().length > 0, `empty recovery for ${error.kind}`);
  }
});

test('an unreachable base is named, and so is the setting to check', () => {
  const { cause, recovery } = errorCopy({ kind: 'network', base: 'https://backend.example' });
  assert.match(cause, /https:\/\/backend\.example/);
  // Requirement 16.4.
  assert.match(recovery, /NEXT_PUBLIC_API_BASE/);
});

test('a blank base names the deployment rather than leaving a gap', () => {
  const { cause } = errorCopy({ kind: 'network', base: '   ' });
  assert.equal(cause, API_ERROR_COPY.network.cause(''));
  assert.doesNotMatch(cause, /\bat\s{2,}/);
});

test('a 400 shows the backend text verbatim and names the field when it has one', () => {
  const withField = errorCopy({
    kind: 'bad-request',
    status: 400,
    message: 'deadline must be in the future',
    field: 'deadline',
  });
  assert.equal(withField.cause, 'deadline must be in the future');
  assert.match(withField.recovery, /deadline/);

  const withoutField = errorCopy({
    kind: 'bad-request',
    status: 400,
    message: 'deadline must be in the future',
  });
  assert.equal(withoutField.recovery, API_ERROR_COPY.badRequest.recovery);
});

test('a 400 with no text of its own still says something', () => {
  const { cause } = errorCopy({ kind: 'bad-request', status: 400, message: '' });
  assert.equal(cause, API_ERROR_COPY.badRequest.causeFallback);
});

test('a 401 says nothing settled and names the variable the producer supplied', () => {
  const { cause, recovery } = errorCopy({
    kind: 'unauthorized',
    status: 401,
    envVar: 'SOME_SERVER_ONLY_KEY',
  });
  assert.match(cause, /nothing was settled/);
  assert.match(recovery, /SOME_SERVER_ONLY_KEY/);
});

test('each 404 resource gets its own sentence, and the judgment one is Requirement 16.7', () => {
  const resources: readonly MissingResource[] = ['deal', 'judgment', 'preimage', 'agent'];
  const causes = resources.map(
    (resource) => errorCopy({ kind: 'not-found', status: 404, resource, id: '0xdeal7' }).cause,
  );

  assert.equal(new Set(causes).size, resources.length);

  const judgment = errorCopy({
    kind: 'not-found',
    status: 404,
    resource: 'judgment',
    id: '0xdeal7',
  }).cause;
  assert.match(judgment, /No judgment record exists for deal 0xdeal7\./);
});

test('the 500 recovery sends the reader away from the browser', () => {
  const { recovery } = errorCopy({ kind: 'server', status: 500, message: 'internal' });
  assert.match(recovery, /the interface cannot see them/);
});

test('a retry delay is a phrase, and an absent one is not invented', () => {
  const phraseFor = (retryAfterMs?: number) =>
    errorCopy({ kind: 'unavailable', status: 503, retryAfterMs }).recovery;

  assert.match(phraseFor(2_500), /Retry in 3 seconds\./);
  assert.match(phraseFor(1_000), /Retry in 1 second\./);
  assert.match(phraseFor(200), /Retry in 1 second\./);
  assert.match(phraseFor(), /Retry in a few seconds\./);
  assert.match(phraseFor(Number.NaN), /Retry in a few seconds\./);
});

test('a malformed response names the expected shape and the file that settles it', () => {
  const { cause, recovery } = errorCopy({ kind: 'malformed', expected: 'isReputationSummary' });
  assert.match(cause, /isReputationSummary/);
  assert.match(recovery, /types\.ts is the contract\./);
});

test('all ten contract errors are listed, and each message is distinct and non-empty', () => {
  assert.equal(CONTRACT_ERROR_NAMES.length, 10);

  const messages = CONTRACT_ERROR_NAMES.map((name) => contractErrorCopy(name));
  for (const message of messages) assert.ok(message.trim().length > 0);
  assert.equal(new Set(messages).size, 10);
});

test('no contract message restates its own identifier', () => {
  for (const name of CONTRACT_ERROR_NAMES) {
    assert.doesNotMatch(contractErrorCopy(name), new RegExp(name));
  }
});

test('every contract error carries a recovery, and the relayed name selects it', () => {
  for (const name of CONTRACT_ERROR_NAMES) {
    const { cause, recovery } = errorCopy({ kind: 'contract', name });
    assert.equal(cause, contractErrorCopy(name));
    assert.equal(recovery, CONTRACT_ERROR_COPY[name].recovery);
  }
});

test('InvalidState interpolates both states when the detail carries them', () => {
  const relayFormats = [
    'current=Funded; required=Submitted',
    'Funded -> Submitted',
    'the deal is Funded and this call requires Submitted',
  ];

  for (const detail of relayFormats) {
    assert.equal(
      contractErrorCopy('InvalidState', detail),
      CONTRACT_ERROR_COPY.InvalidState.message('Funded', 'Submitted'),
      detail,
    );
  }
});

test('InvalidState falls back to its first clause when the detail names fewer than two states', () => {
  const short = CONTRACT_ERROR_COPY.InvalidState.messageWithoutStates;

  assert.equal(contractErrorCopy('InvalidState'), short);
  assert.equal(contractErrorCopy('InvalidState', ''), short);
  assert.equal(contractErrorCopy('InvalidState', 'reverted without data'), short);
  assert.equal(contractErrorCopy('InvalidState', 'state=Funded'), short);
});

test('the refund sentence names both cases (Requirement 16.6)', () => {
  assert.match(REFUND_AVAILABILITY, /misses the deadline without submitting/);
  assert.match(REFUND_AVAILABILITY, /grace period/);
});

test('the contract copy table is keyed by the union and nothing else', () => {
  const keys = Object.keys(CONTRACT_ERROR_COPY) as ContractErrorName[];
  assert.deepEqual([...keys].sort(), [...CONTRACT_ERROR_NAMES].sort());
});
