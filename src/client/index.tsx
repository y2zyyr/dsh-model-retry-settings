// src/client/index.tsx
// Client half of dsh-model-retry-settings.
//
// Registers one compact preference row into the official General settings
// section (`settings.general.item`, the same slot LanguageRow / AppearanceRow
// use). Persistence flows through the plugin's OWN browser-fenced host route
// (`/model-retry-settings/api`) instead of the per-namespace settingsScope
// RPC, because the core /api apiproxy does not expose the `model-retry`
// namespace to remote configuration clients (settings-not-exposed). The host
// route writes through the same settings seam, so the value still lands in the
// `model-retry:` section of ~/.dsh/settings.yaml that the runtime hook reads.
import { useCallback, useEffect, useState } from 'react';
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client';
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { DshContext } from '../dsh.ts';
import { DEFAULT_MAX_RETRIES, RETRY_OPTIONS, normalizeMaxRetries } from '../config.ts';
import { en, LOCALE_NS, zh } from '../locale.ts';

export const inject = ['slots', 'locale'];

const API_URL = '/model-retry-settings/api';

const STYLE_ID = 'dsh-model-retry-settings/row.css';
const CSS = `.dmrs-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:16px 0;display:flex}
.dmrs-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.dmrs-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dmrs-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dmrs-selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}
.dmrs-selector:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmrs-chevron{flex:none}`;

interface RowStoreSnapshot {
  maxRetries: number;
  options: readonly number[];
  revision: number;
}

/** Row state mirror (same defineStore pattern as the official Language row). */
const store = defineStore({
  init: (): RowStoreSnapshot => ({ maxRetries: DEFAULT_MAX_RETRIES, options: RETRY_OPTIONS, revision: -1 }),
  actions: {
    sync: (d: RowStoreSnapshot, maxRetries: number, revision: number) => {
      if (revision <= d.revision) return;
      d.maxRetries = maxRetries;
      d.options = RETRY_OPTIONS;
      d.revision = revision;
    },
  },
});

type Translate = (key: string) => string;

/** Fetch the current effective maxRetries from the plugin host route. */
async function fetchMaxRetries(signal?: AbortSignal): Promise<number | undefined> {
  try {
    const res = await fetch(API_URL, { method: 'GET', signal, cache: 'no-store' });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { ok?: boolean; value?: unknown };
    if (json?.ok !== true) return undefined;
    return normalizeMaxRetries(json.value);
  } catch {
    return undefined;
  }
}

/** Persist a selection through the plugin host route and echo the authoritative value. */
async function writeMaxRetries(value: number, signal?: AbortSignal): Promise<number | undefined> {
  try {
    const next = normalizeMaxRetries(value);
    const res = await fetch(API_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ maxRetries: next }), signal, cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { ok?: boolean; value?: unknown };
    if (json?.ok !== true) return undefined;
    return normalizeMaxRetries(json.value);
  } catch {
    return undefined;
  }
}

export function ModelRetryRow({
  t,
  useStore,
  setMaxRetries,
}: {
  t: Translate;
  useStore: <T>(selector: (s: RowStoreSnapshot) => T) => T;
  setMaxRetries: (value: number) => void;
}): JSX.Element {
  const maxRetries = useStore((s) => s.maxRetries);
  const options = useStore((s) => s.options);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('style[data-dmrs="1"]')) return;
    const tag = document.createElement('style');
    tag.dataset.dmrs = '1';
    tag.dataset.plugin = LOCALE_NS;
    tag.textContent = CSS;
    document.head.appendChild(tag);
  }, []);
  const onSelect = useCallback((id: string) => {
    setMaxRetries(Number(id));
    setOpen(false);
  }, [setMaxRetries]);
  return (
    <div className="dmrs-row" data-dsh-model-retry-settings="1">
      <div className="dmrs-rowText">
        <div className="dmrs-title">{t('title')}</div>
        <div className="dmrs-desc">{t('description')}</div>
      </div>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={options.map((o) => ({ id: String(o), label: String(o) }))}
        selectedId={String(maxRetries)}
        onSelect={onSelect}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className="dmrs-selector"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {String(maxRetries)}
            <IconChevronDownOutline14 className="dmrs-chevron" />
          </button>
        )}
      />
    </div>
  );
}

/** Client plugin body: dictionaries, plugin-config route, and the General row. */
export function apply(ctx: DshContext): void {
  ctx.effect(() => {
    ctx.locale.register(LOCALE_NS, { zh, en });
  }, 'dsh-model-retry-settings: dictionaries');
  const t = ctx.locale.bind(LOCALE_NS) as Translate;
  let bound: { sync: (maxRetries: number, revision: number) => void } | undefined;
  let revision = 0;
  const sync = (maxRetries: number) => {
    revision += 1;
    bound?.sync(maxRetries, revision);
  };
  let disposed = false;
  const refresh = async () => {
    if (disposed) return;
    const value = await fetchMaxRetries();
    if (disposed || value === undefined) return;
    sync(value);
  };
  // Initial load + refresh when the tab regains focus (the host value can change
  // externally via settings.yaml too).
  void refresh();
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    ctx.effect(() => () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    }, 'dsh-model-retry-settings: polling cleanup');
  }
  const injected = (actions: { sync: (maxRetries: number, revision: number) => void }) => {
    bound = actions;
    return {
      setMaxRetries: (value: number) => {
        const next = normalizeMaxRetries(value);
        sync(next); // optimistic immediate echo
        void writeMaxRetries(next).then((authoritative) => {
          if (authoritative !== undefined) sync(authoritative);
        });
      },
    };
  };
  ctx.slots.inject('settings.general.item', () => ctx.slots.register(
    {
      name: 'settings.general.item',
      id: 'model-retry',
      order: 15,
      store,
      locale: LOCALE_NS,
      inject: injected,
    },
    ModelRetryRow,
  ));
}
