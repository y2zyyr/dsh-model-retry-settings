// src/index.ts
import { installSettingsSection } from "@deepseek-ai/dsh-settings";

// src/settings.ts
import z from "@deepseek-ai/schemastery";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

// src/config.ts
var DEFAULT_MAX_RETRIES = 2;
var MIN_MAX_RETRIES = 0;
var MAX_MAX_RETRIES = 10;
var RETRY_OPTIONS = [0, 1, 2, 3, 5, 10];
function normalizeMaxRetries(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_MAX_RETRIES || value > MAX_MAX_RETRIES) {
    return DEFAULT_MAX_RETRIES;
  }
  return value;
}

// src/settings.ts
var SETTINGS_NS = settingsNamespace("model-retry");
var FIELD = "maxRetries";
var Config = z.object({
  maxRetries: z.number().step(1).min(MIN_MAX_RETRIES).max(MAX_MAX_RETRIES).default(DEFAULT_MAX_RETRIES)
});
function overrideRetryPolicyMaxRetries(policy, maxRetries) {
  if (!policy || typeof policy !== "object") return policy;
  const typed = policy;
  if (typed.mode !== "normal") return policy;
  return { ...typed, maxRetries };
}

// src/index.ts
var name = "dsh-model-retry-settings";
var inject = ["webServer", "settings"];
function entryBaseMaxRetries(config) {
  const max = config !== null && typeof config === "object" && "maxRetries" in config ? config.maxRetries : void 0;
  return normalizeMaxRetries(max);
}
function isLoopbackHostname(hostname) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4 && parts[0] === "127" && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}
function isTrustedApiRequest(request) {
  const raw = request.headers["host"];
  const host = typeof raw === "string" ? raw : void 0;
  if (host === void 0) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  if (!isLoopbackHostname(hostname)) return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers["origin"];
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function writeJson(res, status, body) {
  if (typeof res.statusCode === "number") res.statusCode = status;
  if (typeof res.setHeader === "function") res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) body += String(chunk);
  if (body.length === 0) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
function registerPluginApiRoute(ctx, path, read) {
  const webServer = ctx.webServer;
  if (webServer === void 0 || typeof webServer.register !== "function") {
    ctx.logger?.warn?.("dsh-model-retry-settings: webServer unavailable; config route not registered");
    return;
  }
  const dispose = webServer.register({
    kind: "prefix",
    path,
    handler: async (req, res) => {
      if (!isTrustedApiRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
      if (req.method === "GET") {
        writeJson(res, 200, { ok: true, value: read() });
        return;
      }
      if (req.method !== "POST" || pathname !== path) {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const next = normalizeMaxRetries(body?.maxRetries);
        const settings = ctx.settings;
        if (settings !== void 0 && typeof settings.mutate === "function") {
          await settings.mutate(SETTINGS_NS, [{ op: "set", path: [FIELD], value: next }]);
        } else {
          ctx.logger?.warn?.("dsh-model-retry-settings: settings seam unavailable; cannot persist selection");
        }
        writeJson(res, 200, { ok: true, value: read() });
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: "internal", message: String(e?.message ?? e) } });
      }
    }
  });
  if (typeof ctx.effect === "function") {
    ctx.effect(() => {
      const stop = dispose;
      return () => {
        try {
          stop?.();
        } catch {
        }
      };
    }, "dsh-model-retry-settings: config route");
  }
}
function apply(ctx, config = {}) {
  const base = { [FIELD]: entryBaseMaxRetries(config) };
  let effectiveMaxRetries = base[FIELD];
  let current = () => base;
  installSettingsSection(ctx, SETTINGS_NS, Config, base, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {
      try {
        effectiveMaxRetries = normalizeMaxRetries(current()[FIELD]);
      } catch {
        effectiveMaxRetries = DEFAULT_MAX_RETRIES;
      }
    }
  });
  registerPluginApiRoute(ctx, "/model-retry-settings/api", () => effectiveMaxRetries);
  ctx.on("agent/request-error", (payload, next) => {
    const policy = payload?.retryPolicy;
    if (!policy || typeof policy !== "object" || policy.mode !== "normal") {
      return next();
    }
    payload.retryPolicy = overrideRetryPolicyMaxRetries(policy, effectiveMaxRetries);
    return next();
  }, true);
}
export {
  Config,
  DEFAULT_MAX_RETRIES,
  FIELD,
  MAX_MAX_RETRIES,
  MIN_MAX_RETRIES,
  RETRY_OPTIONS,
  SETTINGS_NS,
  apply,
  entryBaseMaxRetries,
  inject,
  name,
  normalizeMaxRetries,
  overrideRetryPolicyMaxRetries
};
