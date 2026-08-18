window.__ModuleLoader__.load({
	id: "dsh-model-retry-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/client/index.tsx
  var import_react = __require("react");
  var import_client = __require("@deepseek-ai/dsh-client-runtime/client");
  var import_dsh_client_ui_primitives = __require("@deepseek-ai/dsh-client-ui-primitives");

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

  // src/locale.ts
  var LOCALE_NS = "dsh-model-retry-settings";
  var zh = {
    "title": "\u6A21\u578B\u8BF7\u6C42\u6700\u5927\u91CD\u8BD5\u6B21\u6570",
    "description": "\u6A21\u578B\u8BF7\u6C42\u56E0\u53EF\u91CD\u8BD5\u9519\u8BEF\u5931\u8D25\u65F6\uFF0C\u6700\u591A\u81EA\u52A8\u91CD\u65B0\u8BF7\u6C42\u7684\u6B21\u6570\u30020 \u8868\u793A\u5173\u95ED\u81EA\u52A8\u91CD\u8BD5\u3002"
  };
  var en = {
    "title": "Maximum model request retries",
    "description": "Maximum number of automatic retries after a retryable model request failure. Set to 0 to disable automatic retries."
  };

  // src/client/index.tsx
  var import_jsx_runtime = __require("react/jsx-runtime");
  var inject = ["slots", "locale"];
  var API_URL = "/model-retry-settings/api";
  var CSS = `.dmrs-row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:16px 0;display:flex}
.dmrs-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.dmrs-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.dmrs-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dmrs-selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}
.dmrs-selector:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dmrs-chevron{flex:none}`;
  var store = (0, import_client.defineStore)({
    init: () => ({ maxRetries: DEFAULT_MAX_RETRIES, options: RETRY_OPTIONS, revision: -1 }),
    actions: {
      sync: (d, maxRetries, revision) => {
        if (revision <= d.revision) return;
        d.maxRetries = maxRetries;
        d.options = RETRY_OPTIONS;
        d.revision = revision;
      }
    }
  });
  async function fetchMaxRetries(signal) {
    try {
      const res = await fetch(API_URL, { method: "GET", signal, cache: "no-store" });
      if (!res.ok) return void 0;
      const json = await res.json();
      if (json?.ok !== true) return void 0;
      return normalizeMaxRetries(json.value);
    } catch {
      return void 0;
    }
  }
  async function writeMaxRetries(value, signal) {
    try {
      const next = normalizeMaxRetries(value);
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maxRetries: next }),
        signal,
        cache: "no-store"
      });
      if (!res.ok) return void 0;
      const json = await res.json();
      if (json?.ok !== true) return void 0;
      return normalizeMaxRetries(json.value);
    } catch {
      return void 0;
    }
  }
  function ModelRetryRow({
    t,
    useStore,
    setMaxRetries
  }) {
    const maxRetries = useStore((s) => s.maxRetries);
    const options = useStore((s) => s.options);
    const [open, setOpen] = (0, import_react.useState)(false);
    (0, import_react.useEffect)(() => {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-dmrs="1"]')) return;
      const tag = document.createElement("style");
      tag.dataset.dmrs = "1";
      tag.dataset.plugin = LOCALE_NS;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }, []);
    const onSelect = (0, import_react.useCallback)((id) => {
      setMaxRetries(Number(id));
      setOpen(false);
    }, [setMaxRetries]);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dmrs-row", "data-dsh-model-retry-settings": "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dmrs-rowText", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dmrs-title", children: t("title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dmrs-desc", children: t("description") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Menu,
        {
          open,
          onClose: () => setOpen(false),
          items: options.map((o) => ({ id: String(o), label: String(o) })),
          selectedId: String(maxRetries),
          onSelect,
          align: "end",
          portal: true,
          anchor: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: "dmrs-selector",
              "aria-haspopup": "menu",
              "aria-expanded": open,
              onClick: () => setOpen((v) => !v),
              children: [
                String(maxRetries),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronDownOutline14, { className: "dmrs-chevron" })
              ]
            }
          )
        }
      )
    ] });
  }
  function apply(ctx) {
    ctx.effect(() => {
      ctx.locale.register(LOCALE_NS, { zh, en });
    }, "dsh-model-retry-settings: dictionaries");
    const t = ctx.locale.bind(LOCALE_NS);
    let bound;
    let revision = 0;
    const sync = (maxRetries) => {
      revision += 1;
      bound?.sync(maxRetries, revision);
    };
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      const value = await fetchMaxRetries();
      if (disposed || value === void 0) return;
      sync(value);
    };
    void refresh();
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      const onVisible = () => {
        if (!document.hidden) void refresh();
      };
      document.addEventListener("visibilitychange", onVisible);
      const timer = setInterval(() => {
        if (!document.hidden) void refresh();
      }, 3e3);
      ctx.effect(() => () => {
        disposed = true;
        document.removeEventListener("visibilitychange", onVisible);
        clearInterval(timer);
      }, "dsh-model-retry-settings: polling cleanup");
    }
    const injected = (actions) => {
      bound = actions;
      void refresh();
      return {
        setMaxRetries: (value) => {
          const next = normalizeMaxRetries(value);
          sync(next);
          void writeMaxRetries(next).then((authoritative) => {
            if (authoritative !== void 0) sync(authoritative);
          });
        }
      };
    };
    ctx.slots.inject("settings.general.item", () => ctx.slots.register(
      {
        name: "settings.general.item",
        id: "model-retry",
        order: 15,
        store,
        locale: LOCALE_NS,
        inject: injected
      },
      ModelRetryRow
    ));
  }

  // src/client/_entry.js
  self.__dsh_model_retry_settings_entry__ = { apply, inject };
})();

		var entry = self.__dsh_model_retry_settings_entry__;
		module.exports.apply = entry && entry.apply;
		module.exports.inject = entry && entry.inject;
		return module.exports;
	}
});
