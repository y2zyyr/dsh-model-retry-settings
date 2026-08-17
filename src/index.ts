// src/index.ts
// Host half of dsh-model-retry-settings.
//
//   Settings wiring   : installSettingsSection() registers the `model-retry`
//                       namespace with the settings seam; changes reach this
//                       plugin live (scope.watch -> onChange) and persist to
//                       ~/.dsh/settings.yaml (dsh-settings-file).
//   Runtime hook      : a PREPEND listener on the `agent/request-error`
//                       waterfall replaces only `retryPolicy.maxRetries` for
//                       mode === "normal" policies, so dsh-llm-retry (a later
//                       waterfall listener) executes the configured count and
//                       emits llm/retry events carrying the same maxRetries —
//                       which is exactly what the conversation UI renders.
//
// Mutation boundary: retryableCodes, backoff, providerRetryAfterMs, failure
// code, signal, provider, turn, step, session are NEVER touched. Policies that
// are undefined or mode "always" pass through unchanged.
import { installSettingsSection } from '@deepseek-ai/dsh-settings';
import type { DshContext, RequestErrorNext, RequestErrorPayload, SettingsLike, WebServer } from './dsh.ts';
import { Config, DEFAULT_MAX_RETRIES, FIELD, SETTINGS_NS, normalizeMaxRetries, overrideRetryPolicyMaxRetries } from './settings.ts';

export const name = 'dsh-model-retry-settings';

/**
 * Required host services. Declaring `webServer` (and `settings`) makes Cordis
 * defer this plugin's `apply()` until those services are provided — otherwise
 * `apply()` would run before webServer is up and the config route would never
 * register (the observed Phase 2.3 live failure). This matches the proven
 * token-usage host-plugin pattern.
 */
export const inject = ['webServer', 'settings'];

// Re-export the pure configuration API so tests (and future consumers) use the
// same built artifact the runtime loads.
export { Config, FIELD, SETTINGS_NS, overrideRetryPolicyMaxRetries } from './settings.ts';
export { DEFAULT_MAX_RETRIES, MAX_MAX_RETRIES, MIN_MAX_RETRIES, RETRY_OPTIONS, normalizeMaxRetries } from './config.ts';

/** Loader-row config shape (optional; settings seam overrides it when mounted). */
export function entryBaseMaxRetries(config: unknown): number {
  const max = config !== null && typeof config === 'object' && 'maxRetries' in (config as Record<string, unknown>)
    ? (config as Record<string, unknown>).maxRetries
    : undefined;
  return normalizeMaxRetries(max);
}

/**
 * Browser-trust fence for the plugin's config route (mirrors the /api gateway
 * rule): only loopback browsers / trusted loopback authorities may reach it.
 */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
function isTrustedApiRequest(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const raw = request.headers['host'];
  const host = typeof raw === 'string' ? raw : undefined;
  if (host === undefined) return false;
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  if (!isLoopbackHostname(hostname)) return false;
  if (request.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = request.headers['origin'];
  if (origin === undefined) return true;
  try { return new URL(origin as string).host === host; } catch { return false; }
}
function writeJson(res: any, status: number, body: unknown): void {
  if (typeof res.statusCode === 'number') res.statusCode = status;
  if (typeof res.setHeader === 'function') res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}
async function readJsonBody(req: any): Promise<unknown> {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  if (body.length === 0) return {};
  try { return JSON.parse(body); } catch { return {}; }
}

/**
 * Register the plugin's browser-trust-fenced configuration route.
 *
 *   GET  /model-retry-settings/api -> { ok, value: maxRetries }
 *   POST /model-retry-settings/api { maxRetries } -> persists through
 *        ctx.settings.mutate (the settings seam), then Returns { ok, value }.
 *
 * Why a plugin-owned route instead of the settingsScope client RPC: the core
 * /api apiproxy serves only an allowlist of namespaces (model providers plus a
 * small explicit set) and refuses any other namespace with `settings-not-exposed`
 * even when registered; plugin self-exposure is deferred work in that package.
 * The host-side settings seam is NOT gated, so writing through `ctx.settings`
 * persists to the SAME `model-retry:` section of ~/.dsh/settings.yaml that the
 * runtime hook reads — satisfying the single-source (configured == persisted ==
 * runtime) invariant without any core change.
 */
function registerPluginApiRoute(ctx: DshContext, path: string, read: () => number): void {
  const webServer = (ctx as unknown as { webServer?: WebServer }).webServer;
  if (webServer === undefined || typeof webServer.register !== 'function') {
    ctx.logger?.warn?.('dsh-model-retry-settings: webServer unavailable; config route not registered');
    return;
  }
  const dispose = webServer.register({
    kind: 'prefix',
    path,
    handler: async (req: any, res: any) => {
      if (!isTrustedApiRequest(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } }); return; }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
      if (req.method === 'GET') {
        writeJson(res, 200, { ok: true, value: read() });
        return;
      }
      if (req.method !== 'POST' || pathname !== path) {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } });
        return;
      }
      try {
        const body = (await readJsonBody(req)) as { maxRetries?: unknown };
        const next = normalizeMaxRetries(body?.maxRetries);
        // Host-side settings write (un-gated seam) persists model-retry to settings.yaml.
        const settings = (ctx as unknown as { settings?: SettingsLike }).settings;
        if (settings !== void 0 && typeof settings.mutate === 'function') {
          await settings.mutate(SETTINGS_NS, [{ op: 'set', path: [FIELD], value: next }]);
        } else {
          ctx.logger?.warn?.('dsh-model-retry-settings: settings seam unavailable; cannot persist selection');
        }
        writeJson(res, 200, { ok: true, value: read() });
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: 'internal', message: String((e as Error)?.message ?? e) } });
      }
    },
  });
  // Keep the route alive until the plugin fiber unloads.
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => { const stop = dispose; return () => { try { stop?.(); } catch { /* noop */ } }; }, 'dsh-model-retry-settings: config route');
  }
}

export function apply(ctx: DshContext, config: unknown = {}): void {
  const base = { [FIELD]: entryBaseMaxRetries(config) };
  let effectiveMaxRetries = base[FIELD];
  let current: () => Record<string, unknown> = () => base;

  // Settings seam: live updated on change, persisted by the provider, removed
  // with this fiber (uninstall/disable restores the pre-plugin default path).
  installSettingsSection(ctx, SETTINGS_NS, Config, base, {
    setSource: (source) => {
      current = source as () => Record<string, unknown>;
    },
    onChange: () => {
      try {
        effectiveMaxRetries = normalizeMaxRetries(current()[FIELD]);
      } catch {
        effectiveMaxRetries = DEFAULT_MAX_RETRIES;
      }
    },
  });

  // Plugin-owned, browser-fenced configuration route (see doc above).
  registerPluginApiRoute(ctx, '/model-retry-settings/api', () => effectiveMaxRetries);

  // PREPEND (true) -> runs before dsh-llm-retry in the agent/request-error waterfall.
  ctx.on('agent/request-error', (payload: RequestErrorPayload, next: RequestErrorNext) => {
    const policy = payload?.retryPolicy;
    if (!policy || typeof policy !== 'object' || (policy as { mode?: unknown }).mode !== 'normal') {
      return next();
    }
    payload.retryPolicy = overrideRetryPolicyMaxRetries(policy, effectiveMaxRetries);
    return next();
  }, true);
}