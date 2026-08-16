// test/override.test.mjs
// Unit tests for the ONLY policy mutation: overrideRetryPolicyMaxRetries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overrideRetryPolicyMaxRetries } from '../lib/index.js';

// IMPORTANT: the RESOLVED policy shape dsh-llm returns from resolveRetryPolicy
// has the backoff fields FLATTENED at the policy root (initialDelayMs /
// maxDelayMs / jitterRatio) — there is no nested `backoff` object on the
// payload at runtime. Tests must use the real resolved shape.
const RETRYABLE = ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'];
const BASE_POLICY = Object.freeze({
  mode: 'normal',
  maxRetries: 2,
  retryableCodes: RETRYABLE,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  jitterRatio: 0.1,
});

test('normal policy: maxRetries replaced, everything else exactly preserved', () => {
  const out = overrideRetryPolicyMaxRetries(BASE_POLICY, 5);
  assert.ok(out !== BASE_POLICY, 'returns a NEW object (original immutable)');
  assert.equal(out.mode, 'normal');
  assert.equal(out.maxRetries, 5);
  assert.deepEqual(out.retryableCodes, RETRYABLE, 'retryableCodes preserved exactly');
  assert.equal(out.initialDelayMs, 500, 'backoff initialDelayMs preserved exactly');
  assert.equal(out.maxDelayMs, 10000, 'backoff maxDelayMs preserved exactly');
  assert.equal(out.jitterRatio, 0.1, 'backoff jitterRatio preserved exactly');
  assert.ok(Object.isFrozen(BASE_POLICY), 'original policy still frozen');
  assert.equal(BASE_POLICY.maxRetries, 2, 'original policy untouched');
});

test('original object identity is preserved for undefined / non-object', () => {
  assert.equal(overrideRetryPolicyMaxRetries(undefined, 5), undefined);
  assert.equal(overrideRetryPolicyMaxRetries(null, 5), null);
  assert.equal(overrideRetryPolicyMaxRetries(42, 5), 42);
  assert.equal(overrideRetryPolicyMaxRetries('normal', 5), 'normal');
});

test('always-mode policy passes through unchanged (same reference, no maxRetries inserted)', () => {
  const always = Object.freeze({ mode: 'always', initialDelayMs: 500, maxDelayMs: 10000, jitterRatio: 0.1 });
  const out = overrideRetryPolicyMaxRetries(always, 0);
  assert.equal(out, always, 'same reference');
  assert.equal(out.mode, 'always');
  assert.ok(!('maxRetries' in out), 'never inserts maxRetries into always policies');
});

test('maxRetries=0 override keeps everything else intact', () => {
  const out = overrideRetryPolicyMaxRetries(BASE_POLICY, 0);
  assert.equal(out.maxRetries, 0);
  assert.deepEqual(out.retryableCodes, RETRYABLE);
  assert.equal(out.initialDelayMs, 500);
  assert.equal(out.maxDelayMs, 10000);
  assert.equal(out.jitterRatio, 0.1);
});

test('extra unknown fields are preserved (spread semantics)', () => {
  const withExtra = { ...BASE_POLICY, retryId: 'abc', annotation: { note: 1 } };
  const out = overrideRetryPolicyMaxRetries(withExtra, 3);
  assert.equal(out.maxRetries, 3);
  assert.equal(out.retryId, 'abc');
  assert.deepEqual(out.annotation, { note: 1 });
});