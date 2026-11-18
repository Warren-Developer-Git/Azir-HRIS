import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampSkeletonCount,
  getSkeletonBarWidth,
} from './skeleton-utils.ts';

describe('clampSkeletonCount', () => {
  it('returns valid finite integers within bounds', () => {
    assert.equal(clampSkeletonCount(6), 6);
    assert.equal(clampSkeletonCount(1), 1);
    assert.equal(clampSkeletonCount(12), 12);
    assert.equal(clampSkeletonCount(4.9), 4);
  });

  it('clamps numbers outside min/max bounds', () => {
    assert.equal(clampSkeletonCount(0), 1);
    assert.equal(clampSkeletonCount(-5), 1);
    assert.equal(clampSkeletonCount(99), 12);
    assert.equal(clampSkeletonCount(2, 5, 3, 8), 3);
    assert.equal(clampSkeletonCount(20, 5, 3, 8), 8);
  });

  it('falls back safely for non-number or non-finite inputs', () => {
    assert.equal(clampSkeletonCount(undefined), 5);
    assert.equal(clampSkeletonCount(null, 4), 4);
    assert.equal(clampSkeletonCount(Number.NaN, 7), 7);
    assert.equal(clampSkeletonCount(Number.POSITIVE_INFINITY, 3), 3);
    assert.equal(clampSkeletonCount('6', 5), 5);
  });
});

describe('getSkeletonBarWidth', () => {
  it('cycles deterministically across default width classes', () => {
    const first = getSkeletonBarWidth(0);
    const second = getSkeletonBarWidth(1);
    assert.ok(first.startsWith('w-'));
    assert.ok(second.startsWith('w-'));
    assert.notEqual(first, second);
    assert.equal(getSkeletonBarWidth(0), getSkeletonBarWidth(5));
  });

  it('supports custom width patterns and falls back on empty pattern', () => {
    const custom = ['w-16', 'w-48'] as const;
    assert.equal(getSkeletonBarWidth(0, custom), 'w-16');
    assert.equal(getSkeletonBarWidth(1, custom), 'w-48');
    assert.equal(getSkeletonBarWidth(2, custom), 'w-16');
    assert.ok(getSkeletonBarWidth(0, []).startsWith('w-'));
  });

  it('handles negative or non-finite indices without throwing', () => {
    assert.ok(getSkeletonBarWidth(-1).startsWith('w-'));
    assert.ok(getSkeletonBarWidth(Number.NaN).startsWith('w-'));
  });
});
