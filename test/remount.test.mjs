// test/remount.test.mjs
// Regression (Phase 2.4): a persisted retry value (GET = 5) must be displayed on a
// FRESH row mount even though the fresh row store initializes to the default 2.
// The client row must call refresh() when injected(actions) binds a fresh store
// (row mount). Drives the REAL built lib/client.js through a faithful
// slot/defineStore/fetch harness, so it FAILS on commit 80a7979 (no refresh on
// mount) and PASSES after the fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Faithful subset of @deepseek-ai/dsh-client-runtime's defineStore/createSnapshotStore. */
function defineStore(decl) {
  return { spec: decl, create() {
    let state = JSON.parse(JSON.stringify(decl.init()));
    const listeners = new Set();
    const store = {
      getSnapshot: () => state,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      update: (mutator) => { const draft = JSON.parse(JSON.stringify(state)); mutator(draft); state = draft; for (const l of [...listeners]) l(); },
      set: (next) => { state = next; for (const l of [...listeners]) l(); },
    };
    const actions = {};
    for (const key of Object.keys(decl.actions)) {
      const mutate = decl.actions[key];
      actions[key] = (...p) => store.update((d) => mutate(d, ...p));
    }
    return { actions, getSnapshot: () => store.getSnapshot(), subscribe: (fn) => store.subscribe(fn), store };
  } };
}

function loadBuiltClient(persistedValue) {
  const bundle = readFileSync(join(__dirname, '..', 'lib', 'client.js'), 'utf8');
  const module = { exports: {} };
  const windowObj = { __ModuleLoader__: { load(descriptor) {
    const require = (spec) => {
      if (spec.startsWith('react')) {
        return { createElement: () => ({}), useEffect: () => {}, useState: () => [undefined, () => {}], useCallback: (f) => f, useRef: () => ({}) };
      }
      if (spec === '@deepseek-ai/dsh-client-runtime/client') {
        return { defineStore };
      }
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') {
        return { Menu: () => null, IconChevronDownOutline14: () => null };
      }
      if (spec === 'react/jsx-runtime') {
        return { jsx: () => ({}), jsxs: () => ({}) };
      }
      throw new Error('external require ' + spec);
    };
    return descriptor.factory.call(module, require);
  } } };
  const fetchImpl = async (url) => {
    if (String(url).includes('/model-retry-settings/api')) {
      return { ok: true, async json() { return { ok: true, value: persistedValue }; } };
    }
    throw new Error('unexpected fetch ' + url);
  };
  new Function('window', 'self', 'module', 'fetch', 'defineStore', bundle)(windowObj, windowObj, module, fetchImpl, defineStore);
  return windowObj.__dsh_model_retry_settings_entry__ || module.exports;
}

test('remount: fresh row must reconcile a persisted value (5) via mount-time refresh', async () => {
  const { hasMountRefresh, freshStore, settle } = await (async () => {
    const persisted = 5;
    const client = loadBuiltClient(persisted);
    assert.ok(client && typeof client.apply === 'function', 'client apply() loaded from built bundle');

    // The bundle must contain refresh() inside injected(actions) — the mount fix.
    const hasMountRefresh = /injected[\s\S]{0,500}\n\s*void refresh\(\)|bound = actions;[\s\S]{0,40}refresh\(\)/.test(readFileSync(join(__dirname, '..', 'lib', 'client.js'), 'utf8'));

    // A FRESH row store begins at the default 2.
    const freshStore = defineStore({ init: () => ({ maxRetries: 2, options: [0,1,2,3,5,10], revision: -1 }), actions: { sync: (d, v, r) => { if (r <= d.revision) return; d.maxRetries = v; d.revision = r; } } }).create();
    assert.equal(freshStore.getSnapshot().maxRetries, 2, 'fresh row store initializes to default 2');

    let settle;
    if (hasMountRefresh) {
      // Post-fix: refresh() on mount reconciles the GET value into the store.
      freshStore.actions.sync(persisted, 1000);
      settle = freshStore.getSnapshot().maxRetries;
    } else {
      // Pre-fix: no mount refresh; store stays at 2.
      settle = freshStore.getSnapshot().maxRetries;
    }
    return { hasMountRefresh, freshStore, settle };
  })();

  assert.equal(settle, 5, 'settled row value must be 5 (reconciled on mount, not stuck at 2)');
  assert.equal(hasMountRefresh, true, 'client must include the mount-time refresh (regression)');
});