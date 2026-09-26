# dsh-codebuddy-credits — 设计概览

## 目标

把企业发放的 CodeBuddy 额度接成 DSH 的 LLM provider：官方 API Key 直连
（模型目录 + 流式推理），DSH 跑 agent 循环，CodeBuddy 只出模型。不做令牌
逆向、不用它的 agent harness。

## 形态

- DSH provider 路由 `codebuddy-credits`，模型选择器显示名 `CodeBuddy Credits`
- 模型目录：**不预置**，完全依赖用户给 Key 的行为——保存 Key 时按该 Key 的
  账号权限拉 /v3/config（企业管理员配置的可用模型）并激活 provider；模型事实
  只存进程内（不落设置节），宿主重建模型目录时节流自动刷新（见 spec 01）
- 推理 `POST https://copilot.tencent.com/v2/chat/completions`（仅流式，OpenAI SSE 方言）
- 凭据：界面保存（DSH 凭据库）为主，`CODEBUDDY_API_KEY` 环境变量兼容
- 无 Key 时插件不发任何网络请求，模型选择器不出现本 provider

## 信息分级（总纲，2026-09-04 定）

积分/用量信息按四档各归其位，改动一律按档位归位：

| 档位 | 信息 | 位置 | 数据源 |
| :--- | :--- | :--- | :--- |
| 用户级 | 账号/企业、周期额度、重置时间、当前模型 | 会话头部额度卡（`conversation.session.header.utilities`，order -10 在官方 session log 下载按钮左边；原侧栏位置会遮挡官方连接状态提示，2026-09-05 迁移） | `/status` + `/quota` |
| 会话级 | 本会话累计积分 · 调用次数 | 输入框下方统计行（`conversation.composer.dock`，官方 StatsLine 同槽位 order 1） | `/session-usage` |
| 轮次级 | 该轮积分合计 + 每次调用明细 | 每轮「积分」胶囊（`conversation.chat.assistant-actions`，DOM 移到行尾时间前） | `/turn-usage`（按会话事件自带的 `turn`/`step` 重放，见 08） |
| 对话级 | token 消耗、缓存命中、耗时 | 官方每轮 Usage/时间统计（不改动） | 官方 token-meter（数据来自本适配器 usage 帧） |

## 架构（2026-09-03 重写：协议层自建，不依赖 pi-ai）

把 CodeBuddy 积分当成一个**非标准协议的推理 API** 来适配——OpenAI Chat Completions
的方言（仅流式、官方请求标识、专用模型目录、reasoning 帧、credits 计费），
每一条偏差都由自建适配器显式处理，不走通用协议层的假设：

- `src/adapter.ts`：自建 `CodeBuddyAdapter extends LlmAdapter`——请求构造、
  SSE 解析、块组装、usage/credit 提取、企业策略错误透传全部显式实现
- `registerConfigurableProviders` + `registerAdapter`（自建 adapter）+ `registerModelDiscovery` + 导出的 Cordis `Config`（0.1.7 起设置表单由它投影，命名空间 = profile 条目 id；自带设置界面的插件在 `ctx.inject(['settings'], …)` 子级里以 effect 注册 `configure({ auto: false }, ctx.fiber)` 关掉自动生成的配置页）
- 不 disable 内置插件，与内置 provider 路由共存；无 pi-ai 依赖（依赖净减 84 包）
- 参考插件（dsh-llm-codebuddy）用 PiAiAdapter + pi-ai 协议层：usage.credit 被
  pi-ai 丢弃、reasoning_effort 拼写未验证——方言漏水点即本插件自建的动机

## seam 特例（概括，详见根 AGENTS）

无私有 seam。协议层自建后，客户端身份标识（user-agent / x-product / x-ide-name / 企业上下文头）
直接在请求头里显式发送，不再有包装层。

## 请求形态规矩（2026-09-03 定；2026-09-18 两次修订）

> 官方未公开 API 服务（只有 CLI 是公开产品），我们的调用保持与官方 CLI 一致的**协议形态**，
> 但**身份如实自报**：用量后台能区分我们与官方 IDE/CLI 的消耗。不伪装、不隐藏。

- 认证：`X-API-Key: <用户 Key>`（所有接口）
- UA：`deepseekharness CLI/unknown CodeBuddy/<官方版本>`，三段各有用处：
  - **`CLI/` 记号**（服务端硬要求，2026-09-18 实测）：UA 里不出现 `CLI/` 时，
    `/v3/config` **返回 HTTP 200 + `code:0/msg:OK` 但静默省略 `data.models`**——
    没有错误、没有非 2xx，插件侧只表现为「模型目录为空」，用户选不到 CodeBuddy 模型。
    这是**静默降级**，排查成本极高（见下方事故记录）
  - **`CodeBuddy/<官方版本>` 段**：解析不出时 `/v3/config` 返回 400
    `check ua, get coding copilot version error`（如 `CodeBuddy-CLI/2.137.1`）
  - **`deepseekharness` 前缀**：本插件如实身份，放在最前
  - `/v2/chat/completions`、`/v2/accounts` 不校验 UA
- `X-Product: SaaS`（所有接口）
- **`X-IDE-Name: deepseek harness`**（所有接口）——企业用量明细的 `client` 字段取该头。
  2026-09-18 实测确认：`X-IDE-Name` 是唯一起作用的头（`X-IDE-Type`/`X-IDE-Version` 不参与），
  且取值不受白名单限制。未发送时该字段为空字符串，管理后台把这类消耗归入无标签桶。
  **该头与 UA 的 `CLI/` 约束互不影响**：实测 `CLI/unknown CodeBuddy/…` + `X-IDE-Name: deepseek harness`
  同时满足「返回 31 个模型」与「后台 client 记为 deepseek harness」。
- 企业上下文头：`X-Enterprise-Id`、`X-Tenant-Id`、`X-User-Id`（值来自 /v2/accounts：enterpriseId/enterpriseId/uid；拿到后所有接口都带）
- 无 Key 时**任何接口都不发请求**（零网络行为）；配 Key 后才按需调用

**修订理由（第一次）**：旧口径要求 UA 伪装成官方 CLI（`CLI/unknown CodeBuddy/<版本>`），
使服务端「视角与官方客户端无异」。该伪装对 `client` 字段其实无效（伪装期间我们仍落入空桶），
却让部门用量统计无法区分 DSH 与官方客户端的消耗。owner 决定改为如实标识。

**修订理由（第二次，2026-09-18 当日事故）**：第一次修订把 UA 改成 `deepseekharness CodeBuddy/<版本>`，
**丢掉了 `CLI/` 记号**，导致 `/v3/config` 静默不再返回模型列表——provider 正常注册、
`/status` 正常返回 200、137 个单测全绿，但 `models: []`，用户选不到 CodeBuddy 模型。
根因是「服务端对不认识的 UA 静默降级」这一未记录的约束。修法：把 `CLI/` 记号加回，
保留 `deepseekharness` 前缀（诚实）与 `X-IDE-Name`（后台可见），三者共存已验证。
**教训**：改动请求头属于**协议面改动**，必须对 `/v3/config` 实测返回模型数，不能只看 HTTP 状态码。

## 域名（单一来源）

全插件只保留一个域名常量 `CODEBUDDY_ORIGIN = https://copilot.tencent.com`，
`BASE_URL` / `CONFIG_URL` / `ACCOUNTS_URL` / `QUOTA_URL` / `PROFILE_URL` 全部由它派生；
源码里不得出现第二处域名字面量。

### 两个入口：`copilot.tencent.com` 与 `www.codebuddy.cn`

**同一套服务**，可互换，实测依据三条：

1. **应用层**：13 个用例（成功 / 404 / 401 / 400 / 坏 JSON / 缺字段 / GET 打推理）
   归一化后**深度相等**，连错误文案都一字不差；流式响应的帧结构、`usage` 字段集合
   （含 `credit`）逐项相同。
2. **网络层**：公共 DNS 下两域名解析到**同一组 CDN 节点**，该组节点对两个 SNI 均能完成
   TLS 握手并返回各自域名的证书。
3. **账本**：以付费模型双向验证——从任一域名发起的消耗，另一域名读配额均可见，
   且两边读数恒等（共享同一份账）。

取 `copilot.tencent.com`：**官方 CLI 与开放平台文档使用的就是它**，且为国际通用入口；
`www.codebuddy.cn` 是国内区域名。本插件面向所有用户，故不钉区域名。

**排查提示**：两入口功能一致，**故障排查不要直接归因于域名**。若某网络下本域名
「配置接口全挂」（模型目录为空、配额超时），先分层定位
（DNS 解析 / TCP 连通 / TLS 握手 / 应用层响应）——常见成因是该网络的 DNS 把它解析到了
外部不可达的节点（TCP 可建连但 TLS 握手超时），而非服务下线或 Key 失效；
此时换用另一入口可继续验证。

### 国际版 `www.codebuddy.ai` **不是**别名

独立后端（不同 CDN 节点、31 vs 21 个模型、`/v2/accounts` 返回
`401 {"message":"not_found"}`、错误体格式也不同）。README 中作为国际版入口提及，
**代码路径不得使用**。

守卫：`test/origin.test.mjs` 钉住「端点常量均由 `CODEBUDDY_ORIGIN` 派生」+
「代码行不得出现区域性别名」+「README 登录入口与 `PROFILE_URL` 同源」+「不得使用 `codebuddy.ai`」。

## 接口事实（2026-09-02 实测）

- 非流式返回 11101（不支持），只发流式；SSE delta 分离 content 与 reasoning_content
- usage 含 reasoning_tokens / cache 字段 / credit（积分消耗）
- hy 系列当前免费、minimax-m3-pay 付费（政策可变）；用量记录连 prompt 文本进入企业用量控制台

### 已实测接口清单（API Key 直连）

| 接口 | 方法 | 用途 |
|---|---|---|
| `www.codebuddy.cn/v3/config` | GET | 模型目录 + credits 系数 + 精确思考档位 |
| `www.codebuddy.cn/v2/accounts` | GET | 账号/企业信息（uid、enterpriseId、企业名、类型） |
| `www.codebuddy.cn/v2/chat/completions` | POST | 推理（仅流式）+ usage.credit |
| `www.codebuddy.cn/v2/billing/meter/get-enterprise-user-usage` | POST | 配额：credit（本期已消耗）、limitNum（周期额度）、cycleStartTime/cycleEndTime、cycleResetTime。**仅 X-API-Key 即可**（实测四种头组合同结果） |
| `www.codebuddy.cn/v2/billing/meter/get-user-resource` | POST | 个人资源（企业账号下返回空 Accounts，暂不用） |
| `www.codebuddy.cn/profile/` | GET | 个人主页（积分弹层用户徽章点击打开；与 README 登录入口同址） |

> 上表域名均与 `CODEBUDDY_ORIGIN` 同源；`copilot.tencent.com` 是同一服务的等价入口（见《域名收敛》）。

### 明确不做的

- 浏览器登录态 / 令牌逆向（全部登录态接口）
- 余额/配额之外的控制台功能
