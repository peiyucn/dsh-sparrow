# 01 · DSH / Cordis 插件机制

> 一手来源：上游仓库 docs/user/develop/basic/*、docs/cordis-tutorial/*、docs/subsystems/*、
> 本机安装的 `@deepseek-ai/dsh@0.1.0-rc.8（基线随 rc 演进，以本机 npx 安装产物为准）` 各包 README、`dsh-web-app/cordis.patch.yml`。
> 官方 quickstart（用户给的链接）是"使用 Web UI"页，其"开发插件"入口即 docs/user/develop/basic。

## 1. Cordis：最小插件运行时

- "一切皆插件"：工具、LLM 适配器、文件系统、agent loop、网页 UI 全是插件行。
- 插件模块导出：
  - `name`（id）、`inject`（硬依赖数组，依赖就绪才 apply）、`apply(ctx, config)`、可选 `Config`（schemastery schema）。
  - 三种形态：函数 / 对象 / 类（`Service` 子类，用于**对外提供服务**）。
- `ctx` 能力：`ctx.get(name)` 软依赖、`ctx.on(name, fn)` 事件、`ctx.effect(() => disposer)` 副作用清理、`ctx.logger`、定时器（须 `inject: ['timer']`）。
- 事件四种 dispatch 模式：`emit`（同步）/ `parallel` / `serial`（依次）/ `waterfall`（逐个改写参数，末参 `next`）。
- **卸载自动清理**：apply 里注册的一切随 fiber dispose——这是插件能安全热更新的基础。

## 2. 组合（composition）：能力 = 一行 cordis.yml

- 每行：`{ id, name(包名/路径), config, inject, disabled }`。
- 配置层叠（后层胜出，**整 config 替换**，不是深合并）：
  1. profile 的 `dsh.profile.bundles`（按序）→ 2. profile 自己的 `cordis.patch.yml` → 3. `$DSH_HOME/cordis.patch.yml` → 4. `--patch` 覆盖层。
- 验证：`dsh --dump-config`（不启动看合并结果）。

## 3. 两个平面：host 与 agent preset

- **Host 组合**：进程级单例——注册表（tools/systemPrompt/sessions/agents）、持久化、settings、credentials、沙箱、模型路由、subagent 注册表、web 服务器。
- **Agent preset**：每会话一份——该 agent 的工具插件、persona、压缩策略。Web 面把 agent 平面挪进 preset（`config/agent-presets/`，default: standard）。
- 规则：**有会话外消费者的服务不能进 preset**；preset 内自有的服务必须包 `isolate` realm，否则第二会话注册冲突、挂载被拒。
- 我们两个功能的插件都属于 **host 平面行**（功能二还要一个 dsh.client 行）。

## 4. 组合包（bundle）：可安装插件

- 结构：`package.json`（含 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`）+ `cordis.patch.yml` + 入口代码。
- 安装：`dsh plugin --profile <name> add <pkg|./dir|tarball|github:…>`（转发给 pnpm）。
- git 安装会跑 `prepare` 构建脚本（需用户 `allowBuilds` 授权）；npm 发布/tarball 免构建授权。
- 行内插件名用**包名**解析（Node 模块解析），`--patch` overlay 用绝对路径。

## 5. Web 面：client 插件半边

- 包在 `package.json` 声明 `dsh.client`（`platform: 'web'`、可选 `inject` 边、`immediately`），并在 `exports["./client"]` 导出浏览器 bundle。
- `dsh-client-modules` 的 Node 半扫描 Loader 行 → 组合 `window.__DSH_BOOT__` 图 → `/plugins/<id>/client.js` 提供 bundle → 经 index tap 注入。
- **激活时坏声明/缺 bundle 是 loud failure（AggregateError，整 fiber FAILED）**；稳态下只警告。
- 开发热更：`pnpm run dev:web` 监视重建 client bundle（dsh-client-hmr）。
- client 插件代码约束（动态插件同款）：无 import/JSX，UI 用 `React.createElement`，能力经 `ctx.get` 查询后使用。

## 6. client ↔ host 通信：四条通道（关键差异点）

| 通道 | 适用方 | 说明 |
|---|---|---|
| 官方 API 网关 `connection.api.<域>` | 内置能力 | RPC 面**构建期固定**（dsh-api-remotes 显式挂载）；第三方插件**不能**往里加方法 |
| Typert `@Remote` + 生成产物 | monorepo 内包 | 产物由 dsh-typert-generator 生成并在 dsh-api-remotes 构建期挂载（rc.8 的 fileReferences/list 即此）；第三方无此流水线，不可复制 |
| 动态插件 `harness.handle` / `host.call` | 仅动态插件 | `dsh-cordis-host-runner` 的 invoke 只路由"动态包"的浏览器半 |
| （rc.8 补充）业务包自挂 Remote | 官方包 | lib/typert.host.js + lib/typert.remote-client.js 为生成产物，且客户端挂载面在 dsh-api-remotes 内固定——第三方不可用 |
| **插件自有 HTTP 路由（`ctx.webServer`）** | ✅ 第三方插件 | `ctx.webServer.register({kind:'prefix'|'exact', path, handler})`，其他插件正是这样注册 /api 桥接等路由；client 半 fetch 同源路径 |

> 本项目数据通道 = 第 4 条；第 3 条的官方 Remote 变体见 research/03 §4。

## 7. 我们会用到的三个 seam

- **LLM seam（`ctx.llm`）**：`registerAdapter(providers, adapter)` 注册 provider 路由（独占）；`LlmAdapter.stream(options)` 产出统一 StreamChunk 流（block-start/text-delta/block-end/usage/finish）；`registerConfigurableProviders` + settings 分节 → 模型选择器可见。
- **工具 seam（`ctx.tools` / tools registry）**：注册模型可调用工具（schema + execute）。
- **设置/凭据 seam**：`installSettingsSection(ctx, ns, Config, …)` 免重启覆盖；`ctx.credentials` 管 API key（不落字面密钥）。

## 8. 一手材料清单（research/raw/）

`docs-dev-basic-*.zh.md`（第一个插件/工具/配置/打包安装）、`docs-dev-practice-llm-adapter.zh.md`、
`docs-cookbook-llm-adapter.zh.md`、`docs-cookbook-package.zh.md`（monorepo 内加包清单）、
`docs-subsys-client-modules.zh.md`、`docs-subsys-web-server.zh.md`、`docs-subsys-typert.zh.md`、
`docs-capability-seams.zh.md`、`src-ui-skill-client-index.ts`（@ source 范本）、
`src-input-trigger-types.ts`（source 契约）、`src-llm-deepseek-index.ts`（adapter 插件范本）、
`src-agent-loop-agent.ts`（agent/request waterfall）、`src-host-directory-picker.ts`。
