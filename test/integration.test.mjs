// test/integration.test.mjs
// End-to-end semantic tests of the composed pipeline WITHOUT any real provider:
//
//   real @deepseek-ai/cordis Context
//   + this plugin's PREPEND agent/request-error listener (real built lib)
//   + real @deepseek-ai/dsh-llm-retry recover() (same 0.1.0-rc.6 the Desktop ships)
// driven through the real ctx.events.waterfall("agent/request-error", payload, next)
// exactly as dsh-agent-loop does. The agent is a fake (in-memory session events),
// failures are synthetic codes; no provider request, no tokens, no money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { apply as applyRetry } from '@deepseek-ai/dsh-llm-retry';
import { apply as applyPlugin } from '../lib/index.js';

const TINY_BACKOFF = Object.freeze({ initialDelayMs: 1, maxDelayMs: 4, jitterRatio: 0 });

function makeAgent(events) {
  return {
    session: {
      events,
      append(type, data) {
        const seq = events.length + 1;
        events.push({ type, seq, data });
        return { seq };
      },
    },
  };
}

// RESOLVED policy shape (backoff fields flattened at root — mirrors
// resolveRetryPolicy output, which is what the runtime payload carries).
function policyWith(overrides = {}) {
  return {
    mode: 'normal',
    maxRetries: 7, // deliberately DIFFERENT from what the plugin should apply
    retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
    initialDelayMs: TINY_BACKOFF.initialDelayMs,
    maxDelayMs: TINY_BACKOFF.maxDelayMs,
    jitterRatio: TINY_BACKOFF.jitterRatio,
    ...overrides,
  };
}

/** Small helper so early awaits in tests have settled. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Simulate the agent step loop over a failure/success outcome list.
 * outcomes: array of booleans; true = this attempt FAILED (retryable SERVER),
 * false = success. Returns attempts, retry decisions, and folded session events.
 */
async function drive({ pluginConfig, policy, outcomes, signal, provider = 'fixture', turn = 1, step = 1 }) {
  const ctx = new Context();
  applyPlugin(ctx, pluginConfig);
  applyRetry(ctx, {}, { random: () => 0.5 });
  await tick();
  const events = [];
  const agent = makeAgent(events);
  const aborter = new AbortController();
  const actualSignal = signal ?? aborter.signal;
  let attempts = 0;
  let exhausted = false;
  for (const failed of outcomes) {
    attempts += 1;
    if (!failed) break;
    const action = await ctx.events.waterfall('agent/request-error', {
      agent,
      turn,
      step,
      provider,
      failure: { code: 'SERVER' },
      retryPolicy: policy,
      signal: actualSignal,
    }, () => Promise.resolve(undefined));
    if (action?.kind !== 'retry') { exhausted = true; break; }
  }
  return { attempts, exhausted, events, ctx, agent };
}

const retriesOf = (events) => events.filter((e) => e.type === 'llm/retry');
const startedOf = (events) => events.filter((e) => e.type === 'llm/retry-started');

test('retry = 0: initial failure is terminal, zero automatic retries', async () => {
  const { attempts, exhausted, events } = await drive({
    pluginConfig: { maxRetries: 0 },
    policy: policyWith(),
    outcomes: [true, true, true],
  });
  assert.equal(attempts, 1, 'exactly one request');
  assert.equal(exhausted, true);
  assert.equal(retriesOf(events).length, 0, 'no llm/retry events');
  assert.equal(startedOf(events).length, 0);
});

test('retry = 1: initial + 1 retry = 2 requests, 1 retry event', async () => {
  const { attempts, exhausted, events } = await drive({
    pluginConfig: { maxRetries: 1 },
    policy: policyWith(),
    outcomes: [true, true, true],
  });
  assert.equal(attempts, 2, 'initial + retry#1');
  assert.equal(exhausted, true);
  const rs = retriesOf(events);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].data.retry, 1);
  assert.equal(rs[0].data.maxRetries, 1, 'event carries the CONFIGURED count');
});

test('retry = 2: initial + 2 retries = 3 requests, 2 retry events (off-by-one check)', async () => {
  const { attempts, exhausted, events } = await drive({
    pluginConfig: { maxRetries: 2 },
    policy: policyWith(),
    outcomes: [true, true, true, true],
  });
  assert.equal(attempts, 3, 'initial + retry#1 + retry#2 = 3 total requests');
  assert.equal(exhausted, true);
  const rs = retriesOf(events);
  assert.equal(rs.length, 2);
  assert.deepEqual(rs.map((e) => e.data.retry), [1, 2]);
  assert.ok(rs.every((e) => e.data.maxRetries === 2), 'denominator stays 2');
});

test('retry = 5: exactly 5 retries, initial + 5 = 6 requests, no off-by-one', async () => {
  const { attempts, exhausted, events } = await drive({
    pluginConfig: { maxRetries: 5 },
    policy: policyWith(),
    outcomes: [true, true, true, true, true, true, true],
  });
  assert.equal(attempts, 6, 'initial + 5 retries');
  assert.equal(exhausted, true);
  const rs = retriesOf(events);
  assert.equal(rs.length, 5);
  assert.deepEqual(rs.map((e) => e.data.retry), [1, 2, 3, 4, 5]);
  assert.ok(rs.every((e) => e.data.maxRetries === 5));
});

test('success before exhaustion: no further retries after success', async () => {
  const { attempts, events } = await drive({
    pluginConfig: { maxRetries: 5 },
    policy: policyWith(),
    outcomes: [true, true, false],
  });
  assert.equal(attempts, 3, 'fail, fail, success');
  assert.equal(retriesOf(events).length, 2, 'exactly two retry events');
  assert.deepEqual(retriesOf(events).map((e) => e.data.retry), [1, 2]);
  await tick();
  assert.equal(retriesOf(events).length, 2, 'no retry#3 after success');
});

test('non-retryable failure is NOT retried even with maxRetries=10 (classification unchanged)', async () => {
  const ctx = new Context();
  applyPlugin(ctx, { maxRetries: 10 });
  applyRetry(ctx, {}, { random: () => 0.5 });
  await tick();
  const events = [];
  const agent = makeAgent(events);
  let attempts = 0;
  const action = await ctx.events.waterfall('agent/request-error', {
    agent, turn: 1, step: 1, provider: 'fixture',
    failure: { code: 'INVALID_CREDENTIAL' }, // NOT in default retryableCodes
    retryPolicy: policyWith(),
    signal: new AbortController().signal,
  }, () => Promise.resolve(undefined));
  attempts += 1;
  assert.equal(action?.kind, undefined, 'no retry action');
  assert.equal(attempts, 1);
  assert.equal(retriesOf(events).length, 0);
});

test('backoff fields preserved through the override (delays come from the ORIGINAL policy)', async () => {
  // Prove the backoff the retry engine waits on is the injected policy's
  // backoff — i.e. the plugin did not substitute its own timing.
  const ctx = new Context();
  applyPlugin(ctx, { maxRetries: 2 });
  applyRetry(ctx, {}, { random: () => 0.5 });
  await tick();
  const events = [];
  const agent = makeAgent(events);
  const policy = policyWith();
  const action = await ctx.events.waterfall('agent/request-error', {
    agent, turn: 1, step: 1, provider: 'fixture',
    failure: { code: 'SERVER' },
    retryPolicy: policy,
    signal: new AbortController().signal,
  }, () => Promise.resolve(undefined));
  assert.equal(action?.kind, 'retry');
  const [ev] = retriesOf(events);
  assert.equal(ev.data.retry, 1);
  assert.equal(ev.data.maxRetries, 2);
  // delayMs is computed by dsh-llm-retry.localDelay from the (preserved) policy:
  // initialDelayMs=1 * 2^0 * jitter(var 1.0..1.0 due to 0.5?) — just assert it is
  // finite and bounded by the original maxDelayMs.
  assert.ok(Number.isFinite(ev.data.delayMs) && ev.data.delayMs >= 1 && ev.data.delayMs <= 4, 'delay from preserved backoff');
});

test('cancellation: aborting during the retry wait cancels the pending retry (no retry-started)', async () => {
  const ctx = new Context();
  applyPlugin(ctx, { maxRetries: 10 }); // even a huge budget must not block cancel
  applyRetry(ctx, {}, { random: () => 0.5 });
  await tick();
  const events = [];
  const agent = makeAgent(events);
  const controller = new AbortController();
  const slowPolicy = policyWith({ initialDelayMs: 200, maxDelayMs: 200, jitterRatio: 0 });
  const promise = ctx.events.waterfall('agent/request-error', {
    agent, turn: 1, step: 1, provider: 'fixture',
    failure: { code: 'SERVER' },
    retryPolicy: slowPolicy,
    signal: controller.signal,
  }, () => Promise.resolve(undefined));
  // llm/retry is appended synchronously when the retry is scheduled.
  await tick();
  assert.equal(retriesOf(events).length, 1, 'retry scheduled');
  controller.abort(); // user stops the turn during the wait
  const action = await promise;
  assert.equal(action?.kind, undefined, 'no retry action after abort');
  assert.equal(startedOf(events).length, 0, 'retry never started');
  assert.equal(retriesOf(events).length, 1, 'no further retries scheduled');
});

test('live config change 2 -> 5 takes effect on the NEXT request-error without restart', async () => {
  const ctx = new Context();

  // Minimal in-memory settings provider so installSettingsSection + scope.watch
  // behave exactly like the real seam (register/get/watch/update/replace).
  const section = { maxRetries: 2 };
  const scopes = new Map();
  const fakeSettings = {
    register(ns, schema, opts) {
      const watchers = new Set();
      const resolve = () => schema({ ...opts.base, ...section });
      const scope = {
        get: () => resolve(),
        watch: (cb) => { watchers.add(cb); return () => watchers.delete(cb); },
        update: async (patch) => {
          Object.assign(section, patch);
          for (const cb of [...watchers]) cb();
        },
        replace: async (next) => {
          for (const key of Object.keys(section)) delete section[key];
          Object.assign(section, next);
          for (const cb of [...watchers]) cb();
        },
      };
      scopes.set(ns, scope);
      return scope;
    },
    update: async (ns, patch) => {
      await scopes.get(ns).update(patch);
    },
  };
  ctx.provide('settings', fakeSettings);

  applyPlugin(ctx, {}); // loader config empty; settings seam owns the value
  applyRetry(ctx, {}, { random: () => 0.5 });
  await tick();

  const runFailure = async (turn) => {
    const events = [];
    const agent = makeAgent(events);
    const action = await ctx.events.waterfall('agent/request-error', {
      agent, turn, step: 1, provider: 'fixture',
      failure: { code: 'SERVER' },
      retryPolicy: policyWith(),
      signal: new AbortController().signal,
    }, () => Promise.resolve(undefined));
    assert.equal(action?.kind, 'retry');
    return events;
  };

  const before = await runFailure(1);
  assert.equal(retriesOf(before)[0].data.maxRetries, 2, 'uses current 2');

  // settings section externally changed 2 -> 5 (as the GUI write path does)
  await fakeSettings.update('model-retry', { maxRetries: 5 });
  await tick();

  const after = await runFailure(2);
  assert.equal(retriesOf(after)[0].data.maxRetries, 5, 'next request-error uses 5 without restart');
});

test('undefined retryPolicy passes through untouched (plugin never creates a policy)', async () => {
  const ctx = new Context();
  applyPlugin(ctx, { maxRetries: 5 });
  await tick();
  let seenPayload = null;
  ctx.on('agent/request-error', (payload, nextInner) => {
    seenPayload = payload;
    return nextInner();
  });
  const events = [];
  const agent = makeAgent(events);
  const payload = { agent, turn: 1, step: 1, provider: 'fixture', failure: { code: 'SERVER' }, retryPolicy: undefined, signal: new AbortController().signal };
  const action = await ctx.events.waterfall('agent/request-error', payload, () => Promise.resolve(undefined));
  assert.equal(action, undefined);
  assert.equal(payload.retryPolicy, undefined, 'payload.retryPolicy remains undefined');
  assert.equal(seenPayload.retryPolicy, undefined);
});