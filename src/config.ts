// src/config.ts
// Pure, dependency-free configuration constants and the single normalizer.
// Imported by BOTH the host half (src/settings.ts -> src/index.ts) and the
// client row (src/client/index.tsx) so every surface applies the SAME rule.
// No imports by design: the browser bundle must not pull host-only packages.

/** DSH's existing default (dsh-llm DEFAULT_MAX_RETRIES = 2). */
export const DEFAULT_MAX_RETRIES = 2;
export const MIN_MAX_RETRIES = 0;
export const MAX_MAX_RETRIES = 10;
export const RETRY_OPTIONS = [0, 1, 2, 3, 5, 10] as const;
export type RetryOption = (typeof RETRY_OPTIONS)[number];

/**
 * Normalize any raw value into a valid retry count.
 * Valid = integer within [0, 10]. Everything else (NaN, Infinity, -1, 11,
 * 1.5, "5", null, undefined, objects) falls back to DEFAULT_MAX_RETRIES.
 */
export function normalizeMaxRetries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_MAX_RETRIES || value > MAX_MAX_RETRIES) {
    return DEFAULT_MAX_RETRIES;
  }
  return value;
}
