# dsh-model-retry-settings

直接在 DSH Desktop 设置中配置模型请求失败后的最大自动重试次数。

[English (README.md)](README.md)

## 功能

- **原生 DSH Desktop 设置集成** — 在 **设置 → 通用设置** 中新增偏好行。
- **全局重试上限** — 一个值应用于所有使用 DSH normal 重试策略的模型 provider。
- **可选值：** `0 / 1 / 2 / 3 / 5 / 10`
- **默认值：** `2`（与 DSH 内置默认完全一致——安装插件后不修改设置，行为不变）
- **持久化配置** — 关闭/重开设置、重启应用后都保留。
- **配置即时生效** — 修改后下一次失败的模型请求立即生效，无需重启。
- **保留 DSH 现有行为**：可重试错误分类、指数退避 / 抖动 / provider Retry-After、请求取消、对话重试指示。
- **无需修改 DSH 核心** — 纯插件实现。

## 设置位置

```
DSH Desktop
→ Settings
→ General
→ Maximum model request retries   [ 2 ▼ ]
```

中文：

```
DSH Desktop
→ 设置
→ 通用设置
→ 模型请求最大重试次数   [ 2 ▼ ]
```

安装插件后**如果不修改设置**，会保持 DSH 现有默认行为：**`2`**。

## 重试次数定义

> 这里配置的“重试次数”**不包含首次模型请求**。

- `0` = 只进行首次请求，不自动重试
- `1` = 首次请求失败后最多再重试 1 次
- `2` = 首次请求失败后最多再重试 2 次
- `5` = 首次请求失败后最多再重试 5 次

例如设置为 `2`：可重试失败后最多自动重试 2 次，**合计最多 3 次模型请求**。设置为 `0` 则关闭自动重试。

## 本插件不改变什么

本插件只改变 DSH **已经判定为可重试** 的模型请求的**最大重试次数**。它不会把任意错误变为可重试，也不会把认证/凭证类错误变成可重试错误。

DSH 现已在重试的典型错误类别（如有）：`EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`。这些内部类别不是稳定的公开 API，可能随 DSH 版本变化；重要的是本插件不改变这个分类。

同样不改动：模型选择、Agent 预设、Token 用量统计、上下文窗口、temperature/推理设置、provider 认证与密钥、超时、限流分类、会话持久化、工具调用行为。

## 安装方法

本包已发布到 npm registry，安装到你的 DSH web profile。

**使用 DSH CLI（已验证）：**

```bash
# profile 名称：'web'、'standard'、'code'、'desktop'...（请使用你实际使用的 profile）
dsh plugin --profile web add @y2zyyr/dsh-model-retry-settings
```

**或直接用 npm/pnpm（与上面等价，并需同时加入 profile 的 dsh.profile.bundles）：**

```bash
npm install @y2zyyr/dsh-model-retry-settings
# 然后在 profile 的 package.json 中把 "@y2zyyr/dsh-model-retry-settings" 加入 dsh.profile.bundles
```

安装后请**重启 DSH Desktop**，让新的插件 bundle 被加载。

## 更新 / 卸载

**更新到新版本：**

```bash
dsh plugin --profile web update @y2zyyr/dsh-model-retry-settings
```

**卸载 / 禁用：**

```bash
dsh plugin --profile web remove @y2zyyr/dsh-model-retry-settings
```

禁用或移除插件后，DSH 恢复原生重试行为（内置默认值）。若 `~/.dsh/settings.yaml` 中残留 `model-retry:` 段，它不会生效，可自行删除。插件不会自动清理之前保存的值。

## 兼容性

已针对 **DeepSeek Harness / DSH Desktop** 测试：

- cordis `4.0.1`
- `@deepseek-ai/dsh-settings` / `dsh-settings-file` `0.1.0-rc.6`
- `@deepseek-ai/dsh-llm-retry` `0.1.0-rc.6`
- schemastery `3.18.1`

本插件依赖 DSH 的内部/RC 接口（`agent/request-error` 重试策略、settings seam、`settings.general.item` slot），这些接口可能随 DSH 版本变化。升级 DSH 后若设置失效，请核对插件版本与 DSH 版本是否匹配。

## 工作原理

```
设置行
→ 插件配置（浏览器 → 本地宿主接口）
→ normal 重试策略 maxRetries
→ 原生 @deepseek-ai/dsh-llm-retry
→ 原生 llm/retry 事件
→ 原生对话重试指示（"已重试模型请求 (n/max)"）
```

插件提供一个狭小的浏览器本地接口来读/写它自己的 maxRetries；宿主端通过 DSH settings seam 写入，落盘到 `~/.dsh/settings.yaml`。同时在 DSH 的 `agent/request-error` waterfall 上注册 prepend 监听，仅在 `mode === "normal"` 时覆写 `retryPolicy.maxRetries`，随后由原生重试引擎执行。

### 安全说明

当前 DSH 版本不会通过通用 Settings API 暴露任意插件 settings 命名空间。因此本插件为自己的 `maxRetries` 设置使用一个范围受限的本地宿主路由。该路由：

- 仅暴露重试上限这一个值（也只接受这一个值），
- 校验支持的范围（`0 ≤ maxRetries ≤ 10`，整数），
- 限制在本地/受信任的 DSH 浏览器上下文内，
- 不提供对 DSH 设置的任意访问。

## 开发

```bash
npm install
npm run test        # 单元 + 集成测试
npm run typecheck
npm run build       # src → lib/index.js（宿主）+ lib/client.js（浏览器）
```

## 许可证

MIT
