# dsh-model-retry-settings

Make the **model-request retry limit** of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) user-configurable from **Settings → General (通用设置)**, and have the runtime actually honor it.

A pure plugin: **no core changes, no conversation-UI patches, no DOM hacks.**

## What it does

- Adds one preference row to **DSH Desktop → Settings → General**:

  > **Maximum model request retries** — `[ 2 ▼ ]` (options 0 / 1 / 2 / 3 / 5 / 10)

  > Maximum number of automatic retries after a retryable model request failure. Set to 0 to disable automatic retries.

- The configured value is persisted to `~/.dsh/settings.yaml`:

  ```yaml
  model-retry:
    maxRetries: 5
  ```

- The Harness runtime **actually executes** that count: the plugin overrides the
  `maxRetries` of every `normal` retry policy before `dsh-llm-retry` handles a
  failed model request. The existing conversation status row then shows e.g.
  **已重试模型请求 (1/5), (2/5), …** automatically — no UI changes.

## Why it exists

DSH's built-in default is 2 retries (initial request + 2 extra attempts). That
number was previously only changeable by editing per-provider configuration
sections by hand. This plugin exposes it as a first-class, validated setting.

## Installation

The plugin follows the standard DSH web-profile bundle mechanism (same as
`dsh-token-usage-sidebar`):

```bash
# 1. clone / place the repo, then
pnpm install && pnpm run build

# 2. add to ~/.dsh/profiles/web/package.json:
#    "dependencies":        { "dsh-model-retry-settings": "link:<absolute path to this repo>" }
#    "dsh.profile.bundles":  [ ..., "dsh-model-retry-settings" ]

# 3. install the profile dependency and restart DSH
cd ~/.dsh/profiles/web && pnpm install
# restart DSH Desktop / the web profile
```

You can also install it through the DSH GUI plugin manager if a package source is
configured for it. Both paths register the bundle + loader patch from
`cordis.patch.yml`.

## Configuration

**Settings location:** DSH Desktop → Settings → General (通用设置) → *Maximum model request retries* (`模型请求最大重试次数`).

| Property | Value |
| --- | --- |
| Default | `2` (identical to DSH's built-in default — install changes nothing) |
| Options | `0 / 1 / 2 / 3 / 5 / 10` |
| `0` | disables automatic retries |
| Range enforced | integer `0 ≤ maxRetries ≤ 10` |
| Invalid values | fall back to `2` (never unbounded, never negative) |

### Retry semantics

**`maxRetries` counts retries AFTER the initial request.**

- Setting `2` ⇔ *after the first request fails, retry automatically at most 2 more times* ⇔ at most **3** model requests in total.
- Setting `0` ⇔ no automatic retry — a retryable failure is terminal.
- The counter you see in the conversation (`已重试模型请求 (retry/maxRetries)`) uses the same value the runtime executed — configured == runtime == displayed.

### What the plugin does NOT change (invariants)

- **Retryable error classification** (EMPTY_RESPONSE / RATE_LIMIT / SERVER / TIMEOUT / TRANSPORT) is untouched; 401/403/credential errors are never retried.
- **Backoff** (exponential + jitter, provider `Retry-After` priority) is untouched.
- **Cancellation** (Stop / Cancel during a pending retry wait) still cancels immediately.
- Providers with no retry policy, or with `mode: "always"`, are passed through unchanged.
- Changes apply to the **next** failed request — no restart needed after changing the value.

## Architecture

- **Host** (`src/index.ts`): registers the `model-retry` settings namespace via
  `installSettingsSection` (`@deepseek-ai/dsh-settings`) and installs a
  **prepend** listener on the `agent/request-error` waterfall that replaces only
  `retryPolicy.maxRetries` for `mode === "normal"`. `dsh-llm-retry` (the next
  waterfall listener) then executes that count and emits `llm/retry` events
  carrying it — which is exactly what the conversation UI renders as the
  denominator.
- **Client** (`src/client/index.tsx`): registers one row into the official
  `settings.general.item` slot (the same slot as the Language / Appearance
  rows), reading/writing through the `settingsScope` service (host RPC →
  `settings.yaml`).
- **Validation** (`src/config.ts`): one normalizer shared by host, client, and
  tests; invalid values always fall back to the default.
- **Persistence**: `dsh-settings-file` writes `~/.dsh/settings.yaml` (atomic,
  comment-preserving, hot-reloaded, restart-safe).

## Uninstall behavior

Removing/disabling the plugin removes its settings registration and its
listener with the plugin fiber. The retry path returns exactly to DSH's built-in
behavior (default 2). A leftover `model-retry:` section in
`settings.yaml` is inert and can be deleted by hand.

## Compatibility

- Verified against DSH Desktop's shipped runtime (cordis 4.0.1, dsh-llm-retry
  0.1.0-rc.6, dsh-settings 0.1.0-rc.6, schemastery 3.18.1).
- zh-CN and en locales.
- Light and dark themes (only `--dsw-alias-*` design tokens used).

## Development

```bash
pnpm install
pnpm run build    # src/ -> lib/index.js (host) + lib/client.js (browser)
pnpm test         # node --test test/*.test.mjs — unit + integration (real cordis/llm-retry)
pnpm run typecheck
```

Tests drive the real Cordis context and the real `@deepseek-ai/dsh-llm-retry`
plugin through the real `agent/request-error` waterfall with synthetic
failures — no real provider requests, no tokens consumed.

## License

MIT
