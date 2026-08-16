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
import type { DshContext, RequestErrorNext, RequestErrorPayload } from './dsh.ts';
import { installSettingsSection } from '@deepseek-ai/dsh-settings';
import { Config, DEFAULT_MAX_RETRIES, FIELD, SETTINGS_NS, normalizeMaxRetries, overrideRetryPolicyMaxRetries } from './settings.ts';

export const name = 'dsh-model-retry-settings';

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