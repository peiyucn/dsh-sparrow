# 07 — 支持性查询的「判不了」与冷启动常显修复

> 状态：已实现（2026-09-17）。owner 反馈：**启动 dsh 时，不管当前选的是哪个模型，
> 开关都会出现；刷新一下才按所选模型是否为 DeepSeek 系列决定显隐。**

## 现象与根因

「刷新一下才对」是这条 BUG 的指纹：刷新后会话已被宿主激活，**首发查询就能拿到定论**；
而冷启动时客户端先于宿主激活会话发起查询。

链路（逐环核过官方 0.1.5-rc.2 源码）：

1. 开关/数据面挂 `conversation.input.dock`、`conversation.input.left`，会话一选中即挂载；
2. dock 的 checking effect 立刻 `GET /api/chat-fim/complete?sessionId=…` 查「主模型是否支持」；
3. host（`src/host.ts` GET 分支）用 `ctx.sessions.get(sessionId)` 取会话——**只覆盖当前
   进程内存里的 live 会话**（`core/session/src/index.ts:1170`）。此时会话还只是磁盘上的
   历史，尚未被 promote 成 live → 走 `UNKNOWN_SESSION` 404（"请刷新页面后重试"）；
4. 旧客户端 `isSupported` 把**任何非 2xx**都当「支持」（fail-open）→ `checked(true)`。

于是支持态与所选模型无关地钉在「显示」，直到整页刷新。**「宿主现在判不了」被当成了
「宿主判定支持」**——这是根因。

## 修法

「判不了」独立成相，并与「判为不支持」严格分开：

* **client 查询面**（`src/client/index.ts`）：`isSupported → checkSupport`，三态返回
  `boolean | null`。`null` = 判不了（404/非 2xx、fetch 抛错或超时、响应不是 JSON），
  `false` 只在宿主明确给出 `supported: false` 时出现。
* **状态机**（`src/client/fim-support-machine.ts`）：新增 `retrying` 相与 `unknown` /
  `retry-tick` 事件。`unknown` **不再是定案**——留出有界补查预算，会话激活后补查即拿定论；
  预算耗尽（`FIM_SUPPORT_UNKNOWN_RETRIES` = 5，退避 500/1000/2000/4000/8000ms，合计 15.5s）
  才落 `failed` 并 fail-open 显示——不因探测不可靠而永久隐藏功能。
* **未定论前不显示**：`context-changed` 时 `shown` 取 `initialFimSupportState.shown`（= `false`）。
  显示只是「已有定论」，不是「猜测兜底」；与 vision-bridge 能力机同口径。
* **补查定时器**（`ChatFimDock.tsx`）：`retrying` 相排一个 `setTimeout`，按 `attempts` 退避；
  随相位/地址重排，卸载与上下文切换都由清理函数撤销，不滞留。

## 为什么不是别的修法

* **不改成 host 等待会话激活**：那要在自有路由里触发官方 promote/seam，越权且更脆；
  客户端有界补查只用公开 seam。
* **不把 404 直接当「不支持」**：会话可能只是还没激活——那会把功能在正常情况下也藏掉
  （dsh 的 404 文案本身就叫用户刷新，即「现状未定」而非「不支持」）。
* **不无限重试**：定时器必须随判定收敛（有界）；耗尽后 fail-open，宁可显示也不永久藏功能。

## 验证

* 单测（`test/fim-support-machine.test.mjs`）：unknown→retrying→补查定论追平、预算耗尽落
  failed 且终态不重开、换上下文清零预算、旧地址/阶段不符事件作废、不退避出 NaN。
* 回归用例（真机 Playwright，两阶段 mock 支持路由）：首发 404 + 后续 `supported:false`
  → 开关全程不出现（旧实现为常显）；首发 404 + 后续 `supported:true` → 补查后出现；
  直接 `supported:true` → 出现。三条均实测通过。
* `npm run verify` 全绿（204 tests）。

## 涉及文件

* `src/client/fim-support-machine.ts`：`retrying` 相、`unknown`/`retry-tick`、补查退避常量、初始不显示。
* `src/client/index.ts`：`checkSupport` 三态（判不了 ≠ 不支持）。
* `src/client/ChatFimDock.tsx`：checking 分发 unknown、retrying 补查定时器、注入面改名。
* `test/fim-support-machine.test.mjs`：改契约 + 补回归。

## 风险

* **补查窗口内不显示**（≤15.5s）：真判不了时用户最坏晚 15.5s 才看到开关；
  正常路径下补查在毫秒~百毫秒级完成（会话激活即定论），实际不可感知。
* **`shown` 初值由 true 改 false**：首帧不再显示开关。这是有意的——首帧本就没有答案。
