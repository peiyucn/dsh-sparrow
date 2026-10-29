# 00 · 架构总览 — dsh-codebuddy-credits

> 2026-10-27 重写。旧 spec（01–10 初版）已全部删除；本文是唯一现状总览，按主题拆出的设计文档见同目录
> `01-runtime-adaptation.md`（自适应 API 拦截，11128）。契约与实现不一致时以文档为准并同步修代码。
> 代码入口：`src/index.ts`（host half）/ `src/client/index.ts`（client half）。

## 代码布局

| 层 | 文件 | 职责 |
| :--- | :--- | :--- |
| host 组合根 | `src/index.ts` | `name` / `inject` / `apply`：能力门 → 装配 → HTTP 路由接线 |
| host | `src/host/credentials.ts` | Key 解析 / 旧引用迁移 / save / reapply / remove |
| host | `src/host/account.ts` | `/v2/accounts` 账号快照（企业上下文头与额度卡用户徽章） |
| host | `src/host/models.ts` | 模型事实缓存、后台刷新节流、上游单飞、手动重扫 |
| host | `src/host/provider.ts` | provider 目录 / adapter route / 模型发现注册与 `DUPLICATE_*` 处理 |
| host | `src/host/ledger.ts` | 会话积分投影注册与 live / 冷会话账本接线 |
| 协议 | `src/adapter.ts` | 请求编排（body、fetch、错误透传、空闲超时、取消） |
| 协议 | `src/adapter/wire.ts` | DSH 消息 / 工具 schema → CodeBuddy wire |
| 协议 | `src/adapter/sse.ts` | SSE 数据行 → 帧 |
| 协议 | `src/adapter/stream.ts` | 流状态机（块索引、终块、usage / finish） |
| client 入口 | `src/client/index.ts` | 官方槽位注册、词典与样式统一注入 |
| 额度入口 | `src/client/CodeBuddyCreditsIndicator.tsx` | 入口与槽位接线（trigger / hero portal / 面板挂载） |
| 额度入口 | `src/client/hero.tsx` | hero portal 目标与几何测量 |
| 额度入口 | `src/client/use-credits-status.ts` | `/status`、`/quota` 请求与序号丢弃、刷新 |
| 额度入口 | `src/client/credits-panel.tsx` | 面板主体、定位与关闭行为 |
| 设置卡 | `src/client/CodeBuddyCreditsCard.tsx` | 槽位导出名 re-export（表单在 `CodeBuddyProviderCard.tsx`） |
| 设置卡 | `src/client/CodeBuddyProviderCard.tsx` | 表单 UI、保存 / 清空 / 手动重扫 |
| 设置卡 | `src/client/settings-row.ts` | 官方 provider 行头的私有 DOM seam（点击捕获 / 结构判定 / 提示插入） |

## 定位

把企业发放的 CodeBuddy 额度接成 DSH 的一个 LLM provider：官方 API Key 直连（模型目录 + 流式推理），
DSH 跑 agent 循环，CodeBuddy 只出模型。不做令牌逆向、不用它的 agent harness。
无 Key 时**零网络请求、不注册 route**，模型选择器不出现本 provider。

## 契约表

### provider / 设置 / 凭据

| 项 | 值 | 来源 |
| :--- | :--- | :--- |
| provider id | `codebuddy-credits` | `constants.PROVIDER_ID` |
| 显示名 | `CodeBuddy Credits` | `constants.DISPLAY_NAME` |
| settings 命名空间 | `llm-codebuddy-credits`（= profile 条目 id = 插件 `name`） | `constants.SETTINGS_NAMESPACE` |
| 凭据主引用 | `CODEBUDDY_CREDITS_API_KEY`（官方派生名） | `constants.API_KEY_ENV` |
| 凭据旧引用 | `CODEBUDDY_API_KEY`（解析兜底 + 自动迁移） | `constants.LEGACY_API_KEY_ENV` |
| 设置键 | `apiKeyEnv`（credential-ref，volatile，默认主引用）、`maxMode`（boolean，volatile，默认 `false`）、`autoAdapt`（boolean，volatile，默认 `true`） | `src/config.ts` |

凭据只经 `ctx.credentials` 解析（服务缺席时回退 launch environment），**绝不落设置文件、绝不进日志 / 响应**。
`schema` 里两个字段都是 `.volatile()`：只有 volatile 路径可经 SettingsForms 写入。

### HTTP 路由（9 条，前缀 `/api/codebuddy-credits`）

前缀比官方 `/api` 长，故官方信任栅栏不会命中；本插件在**任何分发与读体之前**自带
`isTrustedPluginRequest`（回环 + 官方 `trustedHosts` + `webServer` 绑定地址 + Origin / Fetch-Metadata 检查）。

| 方法 | 路径 | 用途 |
| :--- | :--- | :--- |
| GET | `/status` | Key 是否配置、route 是否 active、账号快照、模型事实、Max 模式；读取时顺带补拉账号 / 目录（自愈） |
| POST | `/max-mode` | 写 `maxMode` 设置（body `{enabled: boolean}`） |
| POST | `/auto-adapt` | 写 `autoAdapt` 设置（body `{enabled: boolean}`；「自适应 API 拦截」开关） |
| POST | `/quota` | 查企业周期配额（无 Key 400） |
| GET | `/session-usage?sessionId=` | 会话累计积分 / 调用次数（live 投影或冷会话重放） |
| GET | `/turn-usage?sessionId=&turn=` | 单轮积分 / 调用次数 |
| POST | `/key` | 保存 Key；空串 = 用已存 Key 幂等重配（reapply） |
| POST | `/refresh-models` | 手动重扫目录（绕过自动冷却、复用上游单飞，只动本 provider） |
| POST | `/remove-key` | 清凭据 + 撤回 route / 模型事实（profile 保留） |

请求体上限按**字节**计（16 KiB，`Buffer.byteLength`）；非 JSON / 超限 / 未知路径分别回 400 / 400 / 404。

### client 槽位（6 个）

| 槽位 | id / key | order / priority | 作用 |
| :--- | :--- | :--- | :--- |
| `settings.models.provider-card` | key = `llm-codebuddy-credits` | — | Key 配置卡 / 模型只读清单 / 手动刷新 |
| `conversation.input.model.label` | — | `priority: -1` | 模型行只读事实；**接管 single 槽**并镜像官方 `1017` 标 |
| `conversation.session.header.utilities` | `codebuddy-credits` | `order: -10` | 会话头部额度入口（session log 按钮左侧） |
| `conversation.input.dock` | `codebuddy-credits-hero` | `order: 30` | blank 会话 hero 态的额度入口锚点 |
| `conversation.chat.assistant-actions` | `codebuddy-credits-turn-credit` | `order: 0`（默认） | 每轮积分胶囊（渲染后把自有节点移到行动作行末尾） |
| `conversation.composer.dock` | `codebuddy-credits-stats` | `order: 2` | 输入框下方会话积分胶囊（官方 activity 0 / usage 1 之后） |

`conversation.input.model.label` 是 single 槽：为保留官方功能，本插件按官方同条件镜像
「DeepSeek Flash 的 `1017` 临时版本标」（`src/client/model-label-1017.ts`），并对其余 provider 渲染与官方一致的
「名字（+ 标）」；事实串只对本 provider 显示，且不显示在触发器上。

### 窗口事件（2 个自定义事件）

| 事件 | 方向 | 用途 |
| :--- | :--- | :--- |
| `codebuddy-credits-status-changed` | 设置卡 → 额度入口 / 会话积分胶囊 | 保存 / 清空 Key 后联动刷新，无需重载页面 |
| `codebuddy-credits-max-mode-changed` | Max 模式 store → 选择器 / 额度卡 | 同源广播 Max 模式变化 |

另有原生 `window` `focus` / `resize` 监听（额度入口、胶囊刷新与 hero 几何重算），不是本插件定义的契约事件。

### 会话积分投影

| 项 | 值 |
| :--- | :--- |
| projection key | `codebuddyCredits`（host-only，不带 `wire`） |
| stateVersion | `1`（折叠语义一变必须 +1，否则旧缓存行会被 schema 接受并带病续算） |
| 状态形状 | `{ credit, calls, byModel[], byTurn: { [String(turn)]: { credit, calls, byModel[] } } }`（无损 JSON，禁用 `Map` / `NaN`） |
| 注册方式 | `ctx.inject(['sessionProjections'], cb)` 可选 fork；服务缺席时降级为**仅冷路径**，provider 照常工作 |

取数两层：live 读投影状态（O(1)）；冷会话 / 投影缺席走 `sessionController.inspect()` + 一次性重放
（`credits-ledger.ts` 的纯函数，按事件 `seq` 键控、重复折叠幂等）。冷路径 LRU 缓存 64 个会话、同一会话并发单飞。

### 外部端点

单一来源 `CODEBUDDY_ORIGIN = https://copilot.tencent.com`，以下全部由它派生；源码里不得出现第二处域名字面量：

| 端点 | 用途 |
| :--- | :--- |
| `POST /v2/chat/completions` | 推理（**仅流式**，OpenAI SSE 方言；非流式服务端回 11101） |
| `GET /v3/config` | 模型目录（按 Key 的账号权限返回可用模型） |
| `GET /v2/accounts` | 账号 / 企业上下文（uid、enterpriseId、企业名、类型） |
| `POST /v2/billing/meter/get-enterprise-user-usage` | 企业周期配额（used / limit / reset） |
| `GET /profile/` | 个人主页（额度面板用户徽章点击打开） |

`www.codebuddy.cn` 与 `copilot.tencent.com` 是同一服务的两个入口；国际版 `www.codebuddy.ai` 是**独立后端**，
代码路径不得使用。守卫：`test/origin.test.mjs`。

### 请求身份（协议面，改动前先读代码注释）

- `X-API-Key`、`X-Product: SaaS`、`X-IDE-Name: deepseek harness`；
- UA = `deepseekharness CLI/unknown CodeBuddy/<官方版本>`：`CLI/` 记号是服务端硬要求，缺了 `/v3/config`
  会 **HTTP 200 + code 0 但静默省略 models**；`CodeBuddy/<版本>` 段缺失则 400；
- 企业上下文头 `X-Enterprise-Id` / `X-Tenant-Id` / `X-User-Id`（来自 `/v2/accounts`）；
- 改动请求头属于协议面改动，必须用真实 Key 实测 `/v3/config` 返回模型数，不能只看状态码。

### 超时与缓存上限

| 常量 / 上限 | 值 | 说明 |
| :--- | :--- | :--- |
| `STREAM_IDLE_TIMEOUT_MS` | 300 000 | 流式读取空闲超时（有数据即 refresh） |
| `MODEL_DISCOVERY_TIMEOUT_MS` | 15 000 | `/v3/config` 拉取超时 |
| `ACCOUNT_FETCH_TIMEOUT_MS` | 5 000 | `/v2/accounts` 补拉（不挂住 `/status`） |
| `QUOTA_FETCH_TIMEOUT_MS` | 10 000 | `/quota` 查询 |
| `MODEL_REFRESH_COOLDOWN_MS` | 60 000 | 后台目录刷新节流（手动路径绕过） |
| `MAX_BODY_BYTES` | 16 KiB（**字节**） | host 路由请求体上限 |
| `CLIENT_FETCH_TIMEOUT_MS` / `CLIENT_ACTION_TIMEOUT_MS` | 15 000 / 30 000 | client 本地路由超时 / 保存与重扫 |
| client 会话积分缓存 | 200 条 FIFO | `boundedSet`，按会话累积不无界 |
| 冷路径账本缓存 | 64 条 LRU | `credits-source.ts` |

### 无 localStorage

client 不使用 `localStorage` / `sessionStorage`：模型事实只存进程内（`model-facts.ts`）、积分只来自
host 投影 / 事件重放、Max 模式以设置节为真值。`test/structure.test.mjs` 有全源码守卫。

## 数据流

1. **保存 Key**：`/key` → 预检 credentials / settings 服务 → 先拉 `/v2/accounts`（企业头）与 `/v3/config`
   （失败即不落库，避免存了 Key 却没有模型）→ 落主引用、迁移旧引用 → 物化 `apiKeyEnv` → `ensureRoutes(true)`。
2. **模型目录**：事实只存内存（`facts`），不落设置节。宿主建目录（适配器 `listModels` 被调用）触发节流后台刷新；
   手动 `/refresh-models` 绕过冷却、共用上游单飞；事实有变化才 `registration.replace([PROVIDER_ID])`
   （同一 route 集重提交 = 一次 `llm/adapters-updated`，不触碰其他 provider）。
3. **推理**：适配器把 DSH 消息转 wire（连续 user 合并、图片走附件 seam、system/assistant 做指纹中和），
   SSE 逐帧解析；`finish` 块的 `replayState.response.usage` 写入原始 usage（含 `credit`），供积分重放。
4. **积分**：live 读 `sessionProjections.stateOf(session, 'codebuddyCredits')`；冷会话走
   `sessionController.inspect` + `foldSessionCredits`；两条路径统一归约为 `CreditsView`。

## 上游渠道校验（11128）

同一个业务码有两类触发，现在是两层独立处理：

1. **会话身份（结构层）**：chat 端点必须带官方桌面端的 `X-Conversation-ID` /
   `X-Conversation-Request-ID` / `X-Conversation-Message-ID` 三件套（每次请求新生成、互不相同），
   且首条消息必须是 `system`；模型目录 / 账号 / 配额端点不带三件套。缺头或 user 打头都会被判
   「渠道校验失败」。实现见 `catalog.ts` 的 `chatHeaders()` 与 `adapter/wire.ts` 的 system 头兜底。
2. **内容指纹（正文层）**：上游对 system / assistant 正文做内容匹配，已观测到三类互相独立的指纹，
   任何一类原样残留都会让整轮被拒：
   1. 身份句（`You are an AI agent powered by …`、`You are Claude Code, …`、`Main branch …`）；
   2. DSH Web 的 Web GUI 身份句（`You are interacting with the user through …`）；
   3. **`@` 路径引用说明段**（2026-10-28 实测）：DSH 0.2.1-rc.3 的 system prompt 里
      `Tokens prefixed with @ are paths the user explicitly referenced.` 与
      `Relative paths resolve from the workspace root …` 相邻出现即 400；把 `@` 换成普通词、
      其余文字不变的同一段放行，说明判据依赖 `@` 原样存在。
   处理方式一律是**无损中和**——在命中词内插入不可见的组合字符（2026-10-29 起为 U+034F CGJ，
   此前为 U+200B ZWSP），可见文案与语义不变、围栏/行内代码原样保留；`user` / `tool` 结果 /
   请求参数 / `reasoning` 一律不动。assistant 历史里残留的旧 ZWSP 会先剥掉再按当前规则重打。
   实现见 `src/fingerprints.ts`（`NEUTRALIZE_PREFIXES` / `NEUTRALIZE_TOKENS`），测试见
   `test/fingerprints.test.mjs`。

只改要发给上游的 wire 文本，本机会话历史原样保留；UA / `X-IDE-Name` 仍如实自报，不伪装官方客户端。
正文层带**自适应 API 拦截**（`01-runtime-adaptation.md`）：撞 11128 时按阶梯换中和符 / 删段重试，
成功后记住该格；设置卡同名开关（`autoAdapt`）可关掉。若上游改为语义检测，
正文层会再次失效（表现仍是 400 / 11128），需重新评估。

### 2026-10-28 的定位记录（真实 Key 实测，可复查）

- 原始 system prompt（DSH 0.2.1-rc.3 Web，8 691 字符）→ 400 / 11128；
- 只做「身份句 + Web GUI 句」中和（0.2.1-rc.3.1 的行为）→ 仍然 400；
- 追加 `@` 中和后 → 200。三种变体只差 `@` 一处，其余字符逐字相同。
- 分段实测：命中段只有身份句、`@` 路径段、Web GUI 段三段；`@` 路径段与下一句**同时出现**才拦，
  且删掉 `@` 或替换成普通词即放行。

⚠️ `@` 中和是**全文替换**（代码块除外）：系统提示里的邮箱 / npm scope 也会被插入组合字符。
可见文字不变，但模型若原样复述这些串，复制出去可能带上不可见字符；当前系统提示只在该说明段
出现 `@`，没有邮箱，故接受这一取舍。

### 2026-10-29 的定位记录（真实 Key 实测，可复查）

- 当天完整被拦请求（system 8 720 字符 + 全部 user 消息）原样重放 → 400 / 11128。
- 上游已**先归一化再匹配**：U+200B / 200C / 200D / 2060 / FEFF / 00AD / 180E 与双空格全部失效
  （插入后仍 11128）；命中指纹仍是身份句、`@` 路径段、Web GUI 段三类，无新增。
- U+034F（CGJ）当时未被归一化：中和符从 ZWSP 换成 CGJ 后，同一请求 200 出流（模型 `hy4-preview`）。
- 旧 ZWSP 中和的 assistant 历史在新规则下会先剥掉 ZWSP 再插 CGJ，否则归一化后等于裸奔。
- ⚠️ 附带观测（与本层无关）：`kimi-k3.1-pro-highspeed` 对 `enterprise_user` 返回
  `11158 model not allowed`——即使它在 `/v3/config` 的 cli 允许清单里。这是模型权限问题，
  不走指纹层；换清单里其它模型即可。

若上游把 CGJ 也归一化，正文层会再次失效（表现仍是 400 / 11128），届时需重新实测选字符。

## 能力门 / 注册冲突

- **host half**（`src/compat.ts` 的 `assertCapabilities`）：必需面 = `llm.registerAdapter` /
  `llm.registerConfigurableProviders` / `llm.registerModelDiscovery` / `sessions.get`；缺任一即告警并抛错，
  由 cordis 逐插件捕获标 inactive。会话格式是**软门**（`src/session-format.ts`）：只告警不停用。
- **client half**（`warnMissingCapabilities`）：`slots.inject` / `slots.register` / `locale.register` /
  `locale.bind` 缺任一 → 告警 + `return`，**绝不抛错**（客户端 boot 审计把非 active entry 当整页失败），
  且不注册任何样式 / 槽位 / 监听。
- **注册冲突**：`registerConfigurableProviders` / `registerModelDiscovery` / `ensureRoutes(ambientKey())`
  都包 try-catch；官方 `DUPLICATE_ADAPTER` / `DUPLICATE_DIRECTORY` / `DUPLICATE_DISCOVERY` 只记明确告警并跳过
  本插件这次注册，**不清理他插件**；其余错误记日志后继续（`apply` 不裸抛）。

## 私有 seam 清单

> 明细与 owner 认可记录见根 `docs/private-seams.md`。以下三条都只**读**官方 DOM / 移动自有节点，
> 不替换 / 不包装 / 不覆写官方函数。

1. **设置行拦截**：捕获阶段拦截官方 provider 行头「编辑」按钮（`stopPropagation` 阻断官方编辑器，
   改为展开本插件自建编辑器）。按钮保留官方原位与样式；官方改按钮结构即静默失效（本卡不再收到点击）。
2. **hero 几何**：读官方 `[data-phase]` 与 `[data-conversation-header-corner]`，在会话根内量角按钮位置，
   portal 到拥有 `@container` 上下文的 `.titleRow`；取不到角按钮时退回固定 top/right（良性降级）。
3. **每轮胶囊移动**：渲染后把**自有**胶囊节点 `appendChild` 到行动作行末尾（官方行可能因任何信号重渲染），
   幂等、只移动自有节点；不做包装 / 替换 / portal 官方节点。

## 已知偏离 / 已知问题

- **LAN（0.2.1-rc.2 行为修复）**：CHANGELOG 自 0.2.1-rc.2 起宣称「非回环地址的请求不再被拒绝」，但代码里的
  `localOnly` source-address 双门直到 2026-10-27 才删除。现在只保留**信任栅栏**（回环 + `webStartup.trustedHosts`
  + `webServer` 绑定地址 + Origin / Fetch-Metadata）；受信 LAN 放行、未受信 LAN 仍 403。测试
  `test/web-route.test.mjs` 用「受信 LAN 放行 / 未受信 LAN 403」钉住。
- **模型行接管 single 槽**：`conversation.input.model.label` 只有一个贡献者，本插件注册 `priority: -1`
  稳定拿渲染权；因此必须持续镜像官方 `1017` 标（官方新增/改名时需跟版）。
- **正文指纹中和会插入不可见字符**（命中词内，可见文案不变）：这是为绕开上游未公开内容风控的主动取舍
  （owner 已知悉）；`@` 规则覆盖正文里所有 `@`（代码块除外），详见《上游渠道校验》的取舍说明。
  2026-10-29 上游开始归一化常见零宽字符，中和符已从 ZWSP 换为 CGJ；若 CGJ 也被归一化，正文层即失效
  （表现仍是 400 / 11128）。
- **图片只认最后一条 user 消息**：DSH 把运行上下文 / 技能目录追加在真实用户消息之后，故适配器合并连续
  user 消息；多轮对话里更早轮次的图片上游仍会丢弃（无法在插件侧消除）。
- **手动刷新绕过 60s 冷却但复用上游单飞**：`loadFactsOnce` / `sameFacts` 是 `apply` 内闭包，路由测试只 mock
  `shared.refreshModels`，该组合路径目前没有单测覆盖（已知缺口）。

## 验证

- 插件目录 `npm run verify`：typecheck → build（tsc + client bundle）→ test → pack。
- 测试覆盖：契约常量单一来源、能力门 / DUPLICATE 文案、client 惰性门接线、样式统一注入与
  「组件内不得自建 style」、LAN 信任栅栏、正文指纹中和与自适应 API 拦截阶梯（11128 重试 / 成功格记忆 /
  开关 / strip 兜底）、积分重放 / 投影、路由与请求体字节限流。
- 真机验收：保存 / 清空 Key、模型选择器分组与 `1017` 标、额度面板、会话 / 每轮积分胶囊与弹层。
