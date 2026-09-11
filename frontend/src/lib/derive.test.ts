/**
 * Unit tests for `lib/derive.ts` — the specific numbers the interface copy and
 * the fixtures depend on.
 *
 * These are examples, not properties. Properties 23, 24, and 25 cover the
 * universal claims (bounded weighted mean, the volume bound, tier totality) in
 * their own files; what is checked here is that the two fixture agents land on
 * the exact scores the design's copy quotes, that the tier bands are contiguous
 * over 0–100, and that a settled total excludes expiries and stays exact.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BADGE_TIERS,
  badgeTier,
  disputeRateByCategory,
  recencyWeightedReliability,
  scoreCeiling,
  totalUsdcSettled,
  trustScore,
} from '@/lib/derive';
import type { EscrowDeal, EscrowState, JudgmentHistoryEntry, ReputationSummary } from '@/types';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function entry(approved: boolean, ageDays: number, taskCategory?: string): JudgmentHistoryEntry {
  return {
    dealId: `deal-${approved ? 'ok' : 'no'}-${ageDays}-${taskCategory ?? 'none'}`,
    approved,
    score: approved ? 100 : 0,
    verdictHash: '',
    timestamp: new Date(NOW - ageDays * 86_400_000).toISOString(),
    ...(taskCategory === undefined ? {} : { taskCategory }),
  };
}

function summary(history: JudgmentHistoryEntry[]): ReputationSummary {
  const successes = history.filter((h) => h.approved).length;
  return {
    agent: 'agent-under-test',
    totalJudged: history.length,
    successes,
    failures: history.length - successes,
    successRate: history.length === 0 ? 0 : successes / history.length,
    failureRate: history.length === 0 ? 0 : (history.length - successes) / history.length,
    recencyWeightedReliability: 0,
    byTaskCategory: {},
    history,
  };
}

function deal(state: EscrowState, amount: string): EscrowDeal {
  return {
    dealId: '0xdeal',
    buyer: '0xbuyer',
    seller: '0xseller',
    token: '0xtoken',
    amount,
    criteriaHash: '0xcriteria',
    deadline: '2026-01-01T00:00:00.000Z',
    state,
    deliverableHash: null,
    verdictReasoningHash: null,
  };
}

test('reliability is 0 for an empty history and 1 for an all-approved one', () => {
  assert.equal(recencyWeightedReliability([], NOW), 0);
  assert.equal(recencyWeightedReliability([entry(true, 0), entry(true, 90)], NOW), 1);
});

test('reliability weights a recent judgment above an old one', () => {
  const recentSuccess = recencyWeightedReliability([entry(true, 0), entry(false, 60)], NOW);
  const oldSuccess = recencyWeightedReliability([entry(true, 60), entry(false, 0)], NOW);

  assert.ok(recentSuccess > 0.5, `expected the recent success to dominate, got ${recentSuccess}`);
  assert.ok(oldSuccess < 0.5, `expected the recent failure to dominate, got ${oldSuccess}`);
});

test('agent-c at 5 of 5 scores 63 and reads as Established', () => {
  const history = [0, 0, 0, 0, 0].map(() => entry(true, 0));
  const score = trustScore(summary(history), NOW);

  assert.equal(score, 63); // round(100 * 5/8 * 1) = round(62.5)
  assert.equal(badgeTier(score, 5), 'Established');
});

test('agent-b at 1 of 4 scores 14 and reads as Unproven', () => {
  const history = [entry(true, 0), entry(false, 0), entry(false, 0), entry(false, 0)];
  const score = trustScore(summary(history), NOW);

  assert.equal(score, 14); // round(100 * 4/7 * 0.25) = round(14.2857)
  assert.equal(badgeTier(score, 4), 'Unproven');
});

test('the score ceiling is 100n / (n + 3)', () => {
  assert.deepEqual(
    [1, 4, 5, 10, 27, 57].map(scoreCeiling),
    [25, 57, 63, 77, 90, 95],
  );
});

test('perfect reliability cannot lift a low-volume agent past its ceiling', () => {
  const perfect = (n: number) => trustScore(summary(Array.from({ length: n }, () => entry(true, 0))), NOW);
  for (const n of [1, 4, 5, 10, 27]) assert.equal(perfect(n), scoreCeiling(n));
});

test('fewer than three judgments floors the tier regardless of score', () => {
  assert.equal(badgeTier(100, 0), 'Unproven');
  assert.equal(badgeTier(100, 2), 'Unproven');
  assert.equal(badgeTier(100, 3), 'Exemplary');
});

test('the tier bands cover 0-100 with no gaps or overlaps', () => {
  for (let score = 0; score <= 100; score += 1) {
    const matching = BADGE_TIERS.filter((t) => score >= t.min && score <= t.max);
    assert.equal(matching.length, 1, `score ${score} matched ${matching.length} bands`);
    assert.equal(badgeTier(score, 3), matching[0].tier);
  }
});

test('the settled total sums resolutions only, and excludes expiries', () => {
  const deals = [
    deal('ResolvedSuccess', '1500000'),
    deal('ResolvedRefund', '2500000'),
    deal('ExpiredRefund', '9000000'),
    deal('Funded', '4000000'),
    deal('Created', '1'),
  ];

  assert.equal(totalUsdcSettled(deals), 4_000_000n);
  assert.equal(totalUsdcSettled([]), 0n);
});

test('the settled total stays exact past 2^53', () => {
  const huge = '9007199254740993'; // 2^53 + 1, unrepresentable as a number
  assert.equal(totalUsdcSettled([deal('ResolvedSuccess', huge)]), 9_007_199_254_740_993n);
});

test('dispute rate carries its numerator and denominator, and buckets uncategorised', () => {
  const rates = disputeRateByCategory([
    entry(false, 0, 'data-analysis'),
    entry(false, 1, 'data-analysis'),
    entry(true, 2, 'data-analysis'),
    entry(true, 3),
  ]);

  assert.deepEqual(rates['data-analysis'], { rate: 2 / 3, numerator: 2, denominator: 3 });
  assert.deepEqual(rates.uncategorized, { rate: 0, numerator: 0, denominator: 1 });
  assert.deepEqual(Object.keys(rates), ['data-analysis', 'uncategorized']);
});
