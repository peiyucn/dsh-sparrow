# 00 · 现状总览 — dsh-chat-fim

> 本文是**唯一**现状文档（2026-10-27 重写）：旧 `01-design` … `07-support-unknown-retry` 已删除。
> 只记录当前实现、契约与已知偏离，不保留提案、路线图与实施过程。

## 功能清单

* **开关**（`conversation.input.left`）：工具行左侧「✦ FIM」胶囊，点击开 / 关。默认**关闭**，只认本地显式存过的开启；
  右侧「三点 + ▾」是灵敏度触发区，点它只开合选档弹层、不切换开关；窄行（容器 ≤460px）折叠为纯图标。
* **三档灵敏度**（高 / 中 / 低）：停顿阈值、最短草稿、夹入英文半词、词后空格、句末标点五项一起伸缩；
  选档持久化，非法值回退「中」。
* **候选菜单**（`conversation.input.overlay`）：官方 `MenuSurface` 材质的悬浮卡，锚点由 shell 承载（零定位 JS）；
  建议 2 行截断、行尾 Tab / Esc 键位提示、底部品牌行 + token / 模型 / 温度。
* **联想中转动环**：`busy` 时在**本会话** composer 卡片外圈画一圈旋转紫光，portal 到 `document.body`。
* **支持性状态机**：主模型是否 DeepSeek 系列未知时进入 `checking ⇄ retrying`，未定论前不显示任何 UI；
  「判不了」不与「判为不支持」混同，补查预算耗尽才 fail-open。
* **模型门**：主模型非 deepseek-official 时开关 / 菜单整体隐藏（像没装插件）；补全模型跟随主模型。
* **信任栅栏**：自有 exact 路由不经过官方 `/api` 栅栏，故整条路由先过 Host / Origin / `sec-fetch-site` 门。
* **GET 诊断**：`?diagnostics=1` 返回进程内计数（无用户内容），用于「转完圈没出卡片」定位。

## host 契约

| 路由 | 方法 | 请求 | 响应 |
| :--- | :--- | :--- | :--- |
| `/api/chat-fim/complete` | GET | `sessionId` | `200 { supported: boolean }` |
| `/api/chat-fim/complete` | GET | `diagnostics=1` | `200` 诊断计数（见下） |
| `/api/chat-fim/complete` | POST | `{ sessionId, prompt }` | `200 { suggestions, model, temperature, usage { promptTokens, completionTokens } }` |
| 同上 | 其它方法 | — | `405 BAD_BODY` |

**错误码**（响应体恒为 `{ error: { code, message } }`）：

| 状态 | code | 触发条件 |
| ---: | :--- | :--- |
| 403 | `FORBIDDEN` | 信任栅栏不通过（非本机同源） |
| 404 | `UNKNOWN_SESSION` | `sessions.get` 未命中（会话不在本进程内存里 / 未激活） |
| 405 | `BAD_BODY` | 非 GET / POST |
| 400 | `BAD_BODY` | 请求体超上限、非 JSON、字段形状不对 |
| 400 | `INVALID_PROMPT` | prompt 为空或超 `maxPromptChars` |
| 500 | `INVALID_CONFIG` | `apiKeyEnv` 不是合法凭据引用 |
| 401 | `MISSING_CREDENTIAL` | 凭据解析为 `undefined` |
| 403 | `MODEL_UNSUPPORTED` | 主模型非 deepseek-official |
| 501 | `UNSUPPORTED_HOST_FORMAT` | 宿主会话 `header.version` 不在支持集合内 |
| 501 | `UNSUPPORTED_HOST` | 会话实例缺 `requestHeader` / `deriveMessages` |
| 502 | `MISSING_CREDENTIAL` / `RATE_LIMITED` / `TIMEOUT`* / `UPSTREAM_ERROR` | 上游非 2xx 或非法 JSON（状态码统一 502，code 保留上游语义） |
| 504 | `TIMEOUT` | 全部上游请求超时、无任何可用候选 |

\* 上游 408 / 504 映射出的 `TIMEOUT` 走 502；只有「本次请求被判为超时且无候选」才走 504。

**超时与限额**（均可经 patch 覆盖，括号内为默认值）：

* 上游请求超时 `requestTimeoutMs` 30s（客户端断开也 abort，两路共用同一个 `AbortController`）；
* 请求体 `maxBodyBytes` 64KB（逐块累计与 JSON 解析前各判一次）；prompt `maxPromptChars` 32768 字符；
* `maxTokens` 96、`suggestionCount` 1–4（>4 加载期即失败）、`temperature` 0–2（非法即失败）；
* 上游响应正文读取上限 64KB；历史窗口 12 条 / 6000 字符；
* 诊断表 `bySession` 上限 256 个会话（超限淘汰最早写入的）。

**回声窗口**：建议（归一化去空白标点后）与历史的比对阈值 —— 用户消息按**开头 10 字前缀**、
助手消息按**15 字整窗**（10 字整窗会误杀正常措辞复用）。

**补全模型**：`resolveSuggestModel` 跟随主模型（`deepseek-official` 且 id 属于
`deepseek-flash` / `deepseek-v4-pro` / `deepseek-v4-flash`），vision / 未知 / 非官方 provider 回退配置 `model`。
多个建议用并行请求 + 温度错开（步长 0.4，封顶 2）实现；候选全被护栏过滤时按 0.5 重试一次。

**诊断计数**（进程内、不持久化、不含任何用户内容）：`requests` / `fulfilled` / `retries` / `shown` / `empty` /
`filteredSpeaker` / `filteredRepeat` / `filteredEcho` / `filteredLanguage` / `aborted` / `timeout` /
`upstreamError`，外加 `bySession`（键为会话 id，值同形）与 `elapsedTotalMs` / `elapsedMaxMs`。

## client 契约

**槽位**（三处 id 不同、order 相同，均声明 `locale: 'chat-fim'`）：

| 槽位 | id | order | 作用 |
| :--- | :--- | ---: | :--- |
| `conversation.input.left` | `chat-fim-switch` | 30 | 开关胶囊 + 灵敏度选档 |
| `conversation.input.dock` | `chat-fim` | 30 | 数据面：读草稿快照 → 请求 → 写共享 store；渲染环 |
| `conversation.input.overlay` | `chat-fim-menu` | 30 | 候选菜单视图 |

数据面不用 `conversation.composer.dock`：shell 在新会话页（hero）不渲染它，新会话第一条草稿会永远没有联想。

**能力门**：入口先跑 `warnMissingCapabilities` 探测 `slots.inject` / `slots.register` / `locale.register` /
`locale.bind` / `sessions.scope`；缺任一即告警并直接 `return`，**不注册任何槽位 / 样式 / 监听、也不抛错** ——
客户端 boot 审计把任一非 active entry 当致命失败（抛错会让整页只渲染 "Failed to load plugins"）。

**localStorage**（只这两个键，无用户内容）：`dsh-chat-fim:enabled`（存 `'1'` 才算开启）、
`dsh-chat-fim:sensitivity`（`eager` / `standard` / `conservative`，非法回退 `standard`）。

**缓存与上限**：无结果缓存 —— 每次触发都发一次请求；模块级共享状态共 5 个（开关 / 联想中会话 / 错误 /
支持态 / 建议），不按会话累积；目录 store 适配器的未决订阅表随监听器卸载清空；在飞请求同一草稿至多一个，
草稿修订号变化即作废（`draftRev` CAS）。

**三档参数**：

| 档位 | `pauseMs` | 最短草稿（CJK / Latin） | 夹入英文半词 | 词后空格 | 句末标点 |
| :--- | ---: | :--- | :--- | :--- | :--- |
| `eager`（高） | 250 | 4 / 2 | 放行 | 放行 | 放行 |
| `standard`（中） | 400 | 8 / 6 | 抑制 | 放行 | 抑制 |
| `conservative`（低） | 800 | 12 / 8 | 抑制 | 抑制 | 抑制 |

句末字符集 `。！？.!?;；`；所有语言同一套规则（按草稿内容自适应，不做界面语言切换）；IME 组合态一律不触发。

**@ 菜单互斥**：官方触发菜单打开时渲染 `[data-trigger-menu]`；本菜单据此整体不渲染、Tab 不采用
（Tab 归官方下钻），并以 `MutationObserver` 观察 overlay 锚点子树实时刷新。官方列表打开期间请求不中断，
结果照常写 store，列表关闭后按状态机恢复显示。

**支持性查询**：`checkSupport` 三态 —— `true` / `false` 为宿主定论，`null` 为「现在判不了」
（404、非 2xx、fetch 抛错或 5s 超时、响应不是 JSON）。`null` 交给状态机补查（500/1000/2000/4000/8000ms，
共 5 次、合计 15.5s），耗尽才落 `failed` 并 fail-open 显示。

**采用**：Tab（焦点须在 composer 卡内）或 mousedown 点选 → `slash/input-insert-text` bail，span 取 detect 坐标
（`detectEnd`：chip 在 detect 平面只占 1 字符）；Esc 丢弃；卡外 pointerdown 丢弃。

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/constants.ts` | 包名 / locale 命名空间 / 路由 / 槽位与 order / 本地键 / 超时 / 上限 / z-index / 回声窗口 / 补查退避 |
| `src/compat.ts` | 两档能力门（host 抛错 / client 只告警）、惰性探针、会话格式判定与停用文案（不 import 官方包，client 也能用） |
| `src/session-format.ts` | host 专用：官方 `SESSION_FORMAT_VERSION` 的常量探针（官方包带 Node 依赖，不能进 client 图） |
| `src/host.ts` | 组合根（<100 行）：能力门 → `normalizeConfig` → 注册 exact 路由；不含 handler 内部逻辑 |
| `src/host/http.ts` | host 收发：`sendJson` / `sendError`、请求体读取与 `parseCompleteBody`（`Buffer`，host-only）、`readBoundedText`、`requestSignal`、`abortedOutcome` |
| `src/host/routes.ts` | 信任栅栏 → 方法分发 → GET 支持 / 诊断查询、POST 校验与各道门 → 上游编排 → 200 / 502 / 504 出口 |
| `src/host/upstream.ts` | 上游单次请求、并行温度扇出、候选护栏清洗（说话人 / 语言 / 复读 / 回声 / 单句）、升温度重试 |
| `src/host/diagnostics.ts` | 进程级诊断计数、按会话有界表（FIFO 淘汰）与耗时记账 |
| `src/host/session.ts` | 会话取用、宿主真值格式门、会话实例能力探测、当前主模型解析 |
| `src/config.ts` | 配置默认值与归一化（纯逻辑，加载期拒绝非法值） |
| `src/prompt.ts` | 说话人文本与停止序列、历史窗口、候选清洗与单句截断 |
| `src/guards.ts` | 请求体形状校验、复读 / 回声 / 语言一致性护栏 |
| `src/upstream.ts` | 错误码与映射、候选 / usage 解析、主路由与补全模型解析（纯逻辑） |
| `src/trigger.ts` | 三档灵敏度参数、草稿形态门控、草稿末端坐标换算 |
| `src/format.ts` | token 数等展示格式化 |
| `src/suggest.ts` | 纯逻辑 facade：按原路径 re-export 上述纯模块的公开符号（`parseCompleteBody` 不在其中） |
| `src/trust.ts` | Host / Origin / `sec-fetch-site` 信任栅栏（复用官方 trustedHosts 与绑定地址） |
| `src/index.ts` | host 包 API 的静态 re-export |
| `src/client/index.ts` | client 安装：能力门 → 样式（effect 清理）→ locale → 三槽注册；`checkSupport` / `requestComplete` / `adopt` |
| `src/client/capabilities.ts` | client half 必需能力表（纯逻辑，供门与单测） |
| `src/client/contracts.ts` | 三个组件的注入面与共享数据类型（`ChatFimDockInjected`、各 props、`SuggestionRecord`） |
| `src/client/ChatFimDock.tsx` | 数据面组件（<250 行）：草稿快照 → 触发 → 请求 → 写 store；隐藏锚点与环的 DOM 挂载 |
| `src/client/ChatFimSwitch.tsx` | 工具行开关胶囊 + 灵敏度三档弹层（官方 `MenuSurface`） |
| `src/client/ChatFimMenu.tsx` | 候选菜单视图：Tab / mousedown 采用、Esc 丢弃、与官方触发菜单互斥 |
| `src/client/store.ts` | 模块级共享 store（开关 / 忙碌会话 / 错误 / 支持态 / 建议 / 灵敏度）与采纳标记、localStorage 读写 |
| `src/client/ring.ts` | composer 卡片矩形测量（`composerCardRect` / `useRingRect` / 300ms 节拍） |
| `src/client/styles.ts` | 类名表 + `buildChatFimCss()` + 注入口（HMR 命中旧标签则刷新内容） |
| `src/client/fim-support-machine.ts` | 支持状态机纯 reducer 与补查退避 |
| `src/client/geometry.ts` | 矩形 / 锚点数值比较（高频测量去重） |
| `src/client/parse.ts` | 响应 JSON 解析的安全默认值 |
| `src/client/lazy-directory-store.ts` | 目录 store 惰性订阅与订阅迁移 |

host half 不 import 浏览器 API，client half 不 import Node 模块（`parseCompleteBody` 的 `Buffer` 依赖留在 host 侧）。

## 已知偏离

* **环的层级依赖官方遮罩**：`z-index: 900` 必须低于官方遮罩（1000）才能随背景一起虚化；官方改遮罩层级时环会浮在弹窗之上。
* **依赖三个官方 DOM 标记**：`[data-phase]`（会话根）、`[data-composer-card]`（卡片矩形与焦点判定）、
  `[data-trigger-menu]`（官方 @/斜杠菜单）。失效降级：`data-phase` 缺失 ⇒ 退回全局首张卡片（可能画到别的会话）；
  `data-composer-card` 缺失 ⇒ 无矩形、不画环；`data-trigger-menu` 改名 ⇒ 本菜单不再让位，Tab 与官方下钻冲突。
* **环是 300ms 轮询测量**：不订阅官方布局事件，靠周期测量 + resize/scroll（capture）自愈；矩形不变时不写状态。
* **未知支持 fail-open ≤15.5s**：host 判不了时（冷启动会话未激活等）按有界补查，耗尽后显示；
  非 DeepSeek 模型在这段窗口里可能短暂看到开关。
* **无设置 UI**：配置只经 `cordis.patch.yml`（`baseURL` / `model` / `apiKeyEnv` / `maxTokens` /
  `requestTimeoutMs` / `maxBodyBytes` / `maxPromptChars` / `suggestionCount` / `temperature`），界面里没有设置项。
* **诊断只在进程内**：重启清零，不落盘；`bySession` 按 FIFO 淘汰，不含对话内容。

## 测试地图

| 文件 | 覆盖 |
| :--- | :--- |
| `test/route.test.mjs` | 真跑 handler：信任栅栏 403、请求校验、各错误码、超时 504、护栏过滤、诊断计数 |
| `test/host.test.mjs` | 诊断 `bySession` 上限与 FIFO 淘汰 |
| `test/suggest.test.mjs` | 配置归一化、prompt 构造、说话人清洗、复读 / 回声 / 语言 / 单句截断、模型解析、灵敏度门控、`detectEnd` |
| `test/trust.test.mjs` | 栅栏纯判定 + 接线 |
| `test/compat.test.mjs` | 两档能力门、惰性探针、会话格式门、client 门接线（缺任一能力只告警不注册） |
| `test/fim-support-machine.test.mjs` | 状态机迁移、补查预算、旧地址作废、不退避出 NaN |
| `test/menu-styles.test.mjs` | `buildChatFimCss()` 的花括号平衡与菜单 / 开关 / 弹层几何 |
| `test/structure.test.mjs` | 包清单与 patch、样式不得回流组件、能力门与 effect 接线、spec 只剩本文 |
| `test/geometry.test.mjs` / `test/parse.test.mjs` / `test/lazy-directory-store.test.mjs` | 小件纯逻辑 |

验证：插件目录 `npm run verify`（typecheck → build + client bundle → 测试侧 typecheck → `node:test` → `npm pack --dry-run`）。
