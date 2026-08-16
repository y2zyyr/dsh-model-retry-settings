# dsh-model-retry-settings

让 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的**模型请求最大重试次数**可以在 **设置 → 通用设置** 中直接配置，并且让 Harness runtime **真正遵守**该配置。

这是一个纯插件实现：**不修改 core、不 patch 对话 UI、不做 DOM 注入**。

## 插件用途

- 在 **DSH Desktop → 设置 → 通用设置** 中新增一行：

  > **模型请求最大重试次数** — `[ 2 ▼ ]`（候选值 0 / 1 / 2 / 3 / 5 / 10）

  > 模型请求因可重试错误失败时，最多自动重新请求的次数。0 表示关闭自动重试。

- 配置持久化到 `~/.dsh/settings.yaml`：

  ```yaml
  model-retry:
    maxRetries: 5
  ```

- Harness runtime **实际执行**该次数：插件在 `dsh-llm-retry` 处理模型请求失败之前，覆写每个 `normal` retry policy 的 `maxRetries`。对话中的状态行会自动显示 **已重试模型请求 (1/5)、(2/5)…**，无需修改任何 UI。

## 设置位置

DSH Desktop → **设置** → **通用设置** → **模型请求最大重试次数**

## 默认值与选项

| 属性 | 值 |
| --- | --- |
| 默认值 | `2`（与 DSH 内置默认完全一致，安装后行为不变） |
| 可选值 | `0 / 1 / 2 / 3 / 5 / 10` |
| `0` 的含义 | 关闭自动重试（可重试错误失败后不再重试） |
| 运行时校验 | 整数，`0 ≤ maxRetries ≤ 10` |
| 非法值 | 一律回退为 `2`（禁止无限重试、禁止负数） |

## 重要：重试次数的定义

**“最大重试次数”不包含首次请求。**

- 设置 `2` = 首次请求失败后**最多再自动重试 2 次** = **最多 3 次**模型请求。
- 设置 `0` = 不自动重试。
- 对话中显示的 `已重试模型请求 (retry/maxRetries)` 分母与 runtime 实际执行的值是**同一个值**：配置 == runtime == 显示。

## 安装方法

遵循 DSH web profile 的标准 bundle 安装方式（与 `dsh-token-usage-sidebar` 相同）：

```bash
# 1. 获取代码后安装依赖并构建
pnpm install && pnpm run build

# 2. 编辑 ~/.dsh/profiles/web/package.json（增量追加，不要覆盖已有条目）：
#    "dependencies":        { "dsh-model-retry-settings": "link:<本仓库绝对路径>" }
#    "dsh.profile.bundles":  [ ..., "dsh-model-retry-settings" ]

# 3. 安装 profile 依赖并重启 DSH
cd ~/.dsh/profiles/web && pnpm install
# 重启 DSH Desktop / web profile 后生效
```

也可以通过 DSH GUI 的插件管理器安装（需配置对应的包来源）。

## 卸载方法

在插件管理中禁用/移除本插件即可：插件的设置注册与 listener 随插件 fiber 一起释放，retry 行为恢复 DSH 内置默认（2）。`settings.yaml` 中残留的 `model-retry:` 段不生效，可手动删除。

## 本插件不改变的内容（不变式）

- 可重试错误分类（EMPTY_RESPONSE / RATE_LIMIT / SERVER / TIMEOUT / TRANSPORT）不变；401/403/凭证错误不会被重试。
- 退避策略（指数退避 + jitter、优先遵循 provider 的 Retry-After）不变。
- 取消语义（等待重试期间点击停止 / 取消）立即生效，不受重试次数影响。
- 没有 retry policy 的 provider、以及 `mode: "always"` 的 policy 原样放行。
- 修改配置后**下一次请求立即生效**，无需重启。

## 架构

- **宿主端**（`src/index.ts`）：通过 `installSettingsSection`（`@deepseek-ai/dsh-settings`）注册 `model-retry` 命名空间；在 `agent/request-error` waterfall 上注册 **prepend** listener，对 `mode === "normal"` 的 policy 仅替换 `retryPolicy.maxRetries`。`dsh-llm-retry`（下一个 waterfall listener）按此计数执行并发出携带该值的 `llm/retry` 事件 —— 对话 UI 的分母就来自这里。
- **客户端**（`src/client/index.tsx`）：向官方 `settings.general.item` slot（语言/外观行所在位置）注册一行偏好设置，通过 `settingsScope` 服务读写（宿主 RPC → `settings.yaml`）。
- **校验**（`src/config.ts`）：唯一 normalizer，宿主 / 客户端 / 测试共用；非法值一律回退默认。
- **持久化**：`dsh-settings-file` 写入 `~/.dsh/settings.yaml`（原子写、保留注释、热重载、重启安全）。

## 开发

```bash
pnpm install
pnpm run build    # src/ → lib/index.js（宿主）+ lib/client.js（浏览器）
pnpm test         # node --test test/*.test.mjs：单元 + 集成（真实 cordis / llm-retry）
pnpm run typecheck
```

测试使用真实的 Cordis Context 与真实的 `@deepseek-ai/dsh-llm-retry`，通过真实的 `agent/request-error` waterfall 驱动合成失败——**不发起真实 provider 请求、不消耗 token**。

## 许可证

MIT
