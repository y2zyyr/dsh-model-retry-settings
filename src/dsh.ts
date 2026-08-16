// src/dsh.ts
// Local structural typings for the services the DSH runtime provides dynamically
// (declaration merging for these lives in core packages outside this project's
// type scope). Type-only; no runtime values.
import type { Context } from '@deepseek-ai/cordis';

export interface SettingsScopeSnapshot {
  status?: 'loading' | 'ready' | 'unavailable';
  value?: { maxRetries?: unknown };
  revision?: number;
  writable?: boolean;
}
export interface SettingsScopeController {
  getSnapshot(): SettingsScopeSnapshot;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<unknown>;
  unset(field: string): Promise<unknown>;
}
export interface SlotsService {
  inject(name: string, register: () => unknown): unknown;
  register(options: Record<string, unknown>, component: unknown): unknown;
}
export interface LocaleService {
  register(ns: string, dicts: { zh?: Record<string, string>; en?: Record<string, string> }): unknown;
  bind(ns: string): (key: string) => string;
}

/** Context extended with the DSH runtime service surface used by this plugin. */
export type DshContext = Context & {
  locale: LocaleService;
  settingsScope: { bind(spec: { namespace: string }): SettingsScopeController };
  slots: SlotsService;
  on(name: string, listener: (payload: RequestErrorPayload, next: RequestErrorNext) => unknown, prepend?: boolean): unknown;
  effect(callback: () => unknown, label?: string): unknown;
};

/** agent/request-error waterfall payload (authoritative: dsh-tool-cordis catalog). */
export interface RequestErrorPayload {
  turn: number;
  step: number;
  provider: string;
  failure: { code: string; message?: string };
  retryPolicy?: unknown;
  signal?: AbortSignal;
}
export type RequestErrorNext = () => Promise<unknown>;