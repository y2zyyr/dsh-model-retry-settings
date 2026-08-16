// src/settings.ts
// Host-side configuration model built on the shared pure config.
//   Config             : schemastery schema for the `model-retry` namespace
//                        (persisted to ~/.dsh/settings.yaml by dsh-settings-file).
//   overrideRetryPolicyMaxRetries : the ONLY policy mutation helper; the host
//                        runtime hook calls it after validating retryPolicy shape.
// Constants + normalizeMaxRetries live in ./config.ts (shared with the client).
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { DEFAULT_MAX_RETRIES, MAX_MAX_RETRIES, MIN_MAX_RETRIES } from './config.ts';
export { DEFAULT_MAX_RETRIES, MAX_MAX_RETRIES, MIN_MAX_RETRIES, RETRY_OPTIONS, normalizeMaxRetries } from './config.ts';

/** Settings namespace of this plugin (lowercase kebab-case, per dsh-settings). */
export const SETTINGS_NS = settingsNamespace('model-retry');

/** Field name inside the namespace section. */
export const FIELD = 'maxRetries';

/**
 * The settings-namespace schema. Registered with the settings seam so the
 * resolved value always carries a valid integer; the runtime hook still
 * re-normalizes defensively (defense in depth, same rule as ./config.ts).
 */
export const Config = z.object({
  maxRetries: z.number().step(1).min(MIN_MAX_RETRIES).max(MAX_MAX_RETRIES).default(DEFAULT_MAX_RETRIES),
});

/** Minimal structural view of a provider retry policy (dsh-llm ResolvedRetryPolicy). */
export interface RetryPolicyLike {
  mode: string;
  maxRetries?: number;
  retryableCodes?: readonly string[];
  backoff?: { initialDelayMs?: number; maxDelayMs?: number; jitterRatio?: number };
  [key: string]: unknown;
}

/**
 * The ONLY retry-policy mutation.
 *
 * - undefined / non-object        -> returned unchanged (never create a policy).
 * - mode !== "normal" ("always")  -> returned unchanged (never convert modes).
 * - mode === "normal"             -> a NEW object spread from the original with
 *                                    only maxRetries replaced. The original
 *                                    (Object.freeze'd by resolveRetryPolicy) is
 *                                    never mutated; retryableCodes and backoff
 *                                    are preserved exactly.
 */
export function overrideRetryPolicyMaxRetries(policy: unknown, maxRetries: number): unknown {
  if (!policy || typeof policy !== 'object') return policy;
  const typed = policy as RetryPolicyLike;
  if (typed.mode !== 'normal') return policy;
  return { ...typed, maxRetries };
}