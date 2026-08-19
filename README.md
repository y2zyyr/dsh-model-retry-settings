# dsh-model-retry-settings

Configure the **maximum number of automatic model-request retries** directly from DSH Desktop.

[中文说明 (README.zh-CN.md)](README.zh-CN.md)

## Features

- **Native DSH Desktop Settings integration** — a preference row in **Settings → General**.
- **Global retry limit** — one value applies to every model provider that uses DSH's normal retry policy.
- **Values:** `0 / 1 / 2 / 3 / 5 / 10`
- **Default:** `2` (identical to DSH's built-in default — installing the plugin changes nothing until you configure it)
- **Persistent configuration** — survives closing/reopening Settings and app restarts.
- **Live configuration updates** — changes apply to the next failed model request without restarting.
- **Preserves DSH's existing behavior**: retryable-error classification, exponential backoff / jitter / provider Retry-After handling, request cancellation, and conversation retry rendering.
- **No DSH core patch required** — a pure plugin.

## Where the setting appears

```
DSH Desktop
→ Settings
→ General
→ Maximum model request retries   [ 2 ▼ ]
```

Chinese:

```
DSH Desktop
→ 设置
→ 通用设置
→ 模型请求最大重试次数   [ 2 ▼ ]
```

Installing the plugin **without changing the setting** preserves DSH's existing default behavior: **`2`**.

## Retry semantics

> The configured value is the number of **retries after** the initial model request. It does **not** count the initial request.

- `0` = initial request only (no automatic retry)
- `1` = initial request + up to 1 retry
- `2` = initial request + up to 2 retries
- `5` = initial request + up to 5 retries

Example: with `2`, a retryable failure is retried automatically up to 2 more times — **at most 3 model requests** in total. With `0`, automatic model-request retry is disabled.

## What it does NOT change

This plugin only changes the **maximum retry count** for model requests that DSH **already considers retryable**. It does **not** make every error retryable, and authentication/credential errors are never turned into retries.

Examples of error categories DSH already treats as retryable (when present): `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT`. These internal categories are not a stable public API and may change between DSH versions; what matters is that this plugin leaves that classification untouched.

Also untouched: model selection, agent presets, token accounting, context window, temperature/reasoning, provider authentication/keys, timeouts, rate-limit classification, session persistence, and tool-calling behavior.

## Installation

This package is published to the npm registry. Install it into your DSH web profile.

**Using the DSH CLI (verified):**

```bash
# Profile names: 'web', 'standard', 'code', 'desktop', ... (use your active profile)
dsh plugin --profile web add @y2zyyr/dsh-model-retry-settings
```

**Or with npm/pnpm directly** (equivalent to the above; add it to your profile's `dsh.profile.bundles` as well):

```bash
npm install @y2zyyr/dsh-model-retry-settings
# then add "@y2zyyr/dsh-model-retry-settings" to dsh.profile.bundles in the profile's package.json
```

After installation **restart DSH Desktop** so the new plugin bundle is loaded.

## Update / Uninstall

**Update** to a newer version:

```bash
dsh plugin --profile web update @y2zyyr/dsh-model-retry-settings
```

**Uninstall / disable:**

```bash
dsh plugin --profile web remove @y2zyyr/dsh-model-retry-settings
```

After the plugin is disabled or removed, DSH returns to its native retry behavior (the built-in default). If a `model-retry:` section remains in `~/.dsh/settings.yaml`, it is inert; you may delete it by hand if you wish. The plugin does not automatically clean up a previously saved value.

## Compatibility

Tested against **DeepSeek Harness / DSH Desktop** with:

- cordis `4.0.1`
- `@deepseek-ai/dsh-settings` / `dsh-settings-file` `^0.1.0-rc.6` (v1.0.1 widened the range so the DSH Desktop market verifier accepts the package)
- `@deepseek-ai/dsh-llm-retry` `0.1.0-rc.6`
- schemastery `3.18.1`

This plugin relies on DSH internal/RC interfaces (`agent/request-error` retry policy, the settings seam, and the `settings.general.item` slot) that could change across DSH releases. If you upgrade DSH and the setting stops working, verify the plugin version matches the DSH version.

## How it works

```
Settings row
→ plugin configuration (browser → host API)
→ normal retry policy maxRetries
→ native @deepseek-ai/dsh-llm-retry
→ native llm/retry event
→ native conversation retry indicator ("已重试模型请求 (n/max)")
```

The plugin hosts a small, browser-local API that reads/writes its own maxRetries value; the host writes it through the DSH settings seam, so it lands in `~/.dsh/settings.yaml`. A prepend listener on DSH's `agent/request-error` waterfall overrides only `retryPolicy.maxRetries` for `mode === "normal"` policies before the native retry engine runs.

### Security note

The current DSH version does not expose arbitrary plugin settings namespaces through its generic Settings API. This plugin therefore uses a narrowly scoped local host route for its own `maxRetries` setting. That route:

- exposes **only** the retry-limit value (and accepts only that value),
- validates the supported range (`0 ≤ maxRetries ≤ 10`, integer),
- is restricted to the local/trusted DSH browser context,
- does **not** provide arbitrary access to DSH settings.

## Development

```bash
npm install
npm run test        # unit + integration
npm run typecheck
npm run build       # src → lib/index.js (host) + lib/client.js (browser)
```

## License

MIT
