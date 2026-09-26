# 04 · dsh-chat-fim — **适配**（官方无 FIM 实现）

## 1) 定位与结论

输入框续写联想：FIM beta 转发 + 官方同款候选菜单 + Tab 接受。
**结论：官方全仓没有任何 FIM / 续写 / ghost text 实现（`ui-input-trigger` 只注册 `/` 与 `@`），插件不退役、需适配。本版还暴露一处真实缺陷：host half 自停用时 client half 仍在打接口（404 刷屏）。**

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ❌ 自停用（会话格式门只支持 v0/v3） | 真机启动日志：`当前 dsh 的会话格式为 v4，本插件仅支持 v0 / v3` |
| client | ❌ 两个 entry 抛 #130（图标改名） | 真机 console：`slot entry crashed in 'conversation.input.left'`；`src/client/ChatFimDock.tsx:6` 引用的 `IconSparkle16` / `IconChevronDownOutline14` 已不存在 |
| client（新暴露） | ⚠️ **假活**：数据面仍在请求 `/api/chat-fim/complete` → 连续 404 | 真机 console：6 次 `404 /api/chat-fim/complete?sessionId=…` |

**我方依赖面（已核实未变）**：`webServer` / `sessions` / `credentials`；`session.requestHeader()`（`packages/core/session/src/index.ts:786`）、`deriveMessages()`（`:842`）；事件 `slash/input-insert-text`（`packages/client/ui-conversation/src/client/contract/input.ts:156`）；三个槽位 `conversation.input.dock` / `.overlay` / `.left` 契约未变。

**官方能力变化**：`ui-input-trigger` 本版明显增强（generation 把关、`drill` 下钻、`matchSpace` / `matchEnter` 裁决、`subscribeLexicon`，`packages/client/ui-input-trigger/README.zh.md:32`）—— 我方「复用官方同款候选菜单」的接法要按新裁决链复核。

## 3) 改动清单

1. `src/compat.ts:21` `SUPPORTED_SESSION_FORMAT_VERSIONS = [0, 3]` → 加 `4`；按 v4 变更文档复核 `requestHeader()` / `deriveMessages()` 的读取面。
2. `src/client/ChatFimDock.tsx:6` 图标改名（`IconSparkle16` → `IconSparkleRegular`、`IconChevronDownOutline14` → `IconChevronDownOutlineRegular`），保持 `size`。
3. **新增：host 停用时 client 也要停**（共同面 §3 第 3 条）—— 数据面在发请求前先探测 host 能力（或复用 host 注册的路由存在性），不可用时不上报、不请求，避免 404 刷屏。
4. 依赖升线（共同面）。
5. 按新 `ui-input-trigger` 裁决链复核候选菜单接法（`[data-trigger-menu]` 互斥检测、菜单视觉 token）。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **菜单策略**：继续「官方同款候选菜单」（要跟官方裁决链演进，维护成本持续）vs 改用官方新能力（`drill` / lexicon）做更薄的实现、观感略变。你倾向哪个？
2. **404 刷屏的修法**：client 侧能力探测（一次探测 + 缓存）vs host 侧提供一个明确的「未启用」响应（404 → 204/`{available:false}`，语义更干净但要多一条路由）。我倾向后者（一次请求换长期安静）。
3. **FIM 契约**：官方 0.1.7 是否新增了可接的 completion / inline 面（我没找到，但本版新增包很多）—— 要不要我花一轮把 `packages/` 全量扫一遍确认（避免我们继续自建协议）。

## 5) 验收口径 / 未核实项

* 真机验收：开关胶囊出现且可点、候选菜单在 hero 与 active 两态都出、Tab 接受生效、**无 404**、无 #130。
* 未核实：新 `ui-input-trigger` 的裁决链细节（generation / matchSpace / matchEnter）与我方菜单互斥检测是否仍兼容 —— P0 真机阶段验。
