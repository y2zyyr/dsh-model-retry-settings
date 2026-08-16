// test/normalize.test.mjs
// Unit tests for the single configuration normalizer + constants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_RETRIES, MAX_MAX_RETRIES, MIN_MAX_RETRIES, RETRY_OPTIONS,
  normalizeMaxRetries,
} from '../lib/index.js';

test('constants match frozen product decisions', () => {
  assert.equal(DEFAULT_MAX_RETRIES, 2);
  assert.equal(MIN_MAX_RETRIES, 0);
  assert.equal(MAX_MAX_RETRIES, 10);
  assert.deepEqual(RETRY_OPTIONS, [0, 1, 2, 3, 5, 10]);
});

test('invalid values fall back to the default (2)', () => {
  assert.equal(normalizeMaxRetries(undefined), 2);
  assert.equal(normalizeMaxRetries(null), 2);
  assert.equal(normalizeMaxRetries('5'), 2);
  assert.equal(normalizeMaxRetries('abc'), 2);
  assert.equal(normalizeMaxRetries(NaN), 2);
  assert.equal(normalizeMaxRetries(Infinity), 2);
  assert.equal(normalizeMaxRetries(-Infinity), 2);
  assert.equal(normalizeMaxRetries(-1), 2);
  assert.equal(normalizeMaxRetries(11), 2);
  assert.equal(normalizeMaxRetries(999), 2);
  assert.equal(normalizeMaxRetries(1.5), 2);
  assert.equal(normalizeMaxRetries(2.0001), 2);
  assert.equal(normalizeMaxRetries({}), 2);
  assert.equal(normalizeMaxRetries([]), 2);
  assert.equal(normalizeMaxRetries(true), 2);
  assert.equal(normalizeMaxRetries(Symbol('x')), 2);
});

test('valid values pass through', () => {
  assert.equal(normalizeMaxRetries(0), 0);
  assert.equal(normalizeMaxRetries(1), 1);
  assert.equal(normalizeMaxRetries(2), 2);
  assert.equal(normalizeMaxRetries(3), 3);
  assert.equal(normalizeMaxRetries(5), 5);
  assert.equal(normalizeMaxRetries(10), 10);
});

test('boundary values are clamped back to the default', () => {
  assert.equal(normalizeMaxRetries(0 - 1e-9), 2);
  assert.equal(normalizeMaxRetries(10 + 1e-9), 2);
  assert.equal(normalizeMaxRetries(5.0), 5);
});

test('never produces unbounded or fractional values', () => {
  const samples = [undefined, -1, 999, NaN, Infinity, 'Infinity', 1.5, null, 11];
  for (const sample of samples) {
    const out = normalizeMaxRetries(sample);
    assert.ok(Number.isInteger(out), `integer for ${String(sample)}`);
    assert.ok(out >= 0 && out <= 10, `range for ${String(sample)}`);
  }
});
