# 06 — 转动环会话隔离 + 「转完圈没出卡片」可观测

> 状态：已实现（2026-09-09）。owner 实测反馈两点：① 经常联想不出东西；② 转动环在别的会话也显示。

## ② 转动环跨会话显示（已修）

两个模块级状态都不是会话隔离的：

1. `sharedBusy` 是**布尔**——「哪个会话在联想」的信息丢失。后台会话的在途请求把
   全局 busy 置真，任何会话的 dock 都据此渲染环。
2. 环的位置来自 `document.querySelector('[data-composer-card]')`——**全局取第一张卡**。
   多会话并存时可能取到别的会话的卡片，于是环被画到当前会话的输入框上。

**修法**：

- `sharedBusy` → `sharedBusySessionId: string | null`；`useSuggestBusy(sessionId?)`
  按会话取（省略 sessionId 时返回「任意会话在联想」，开关胶囊的提示文案仍用这个）；
  新增 `clearSuggestBusy(sessionId)`——**只在当前在联想的正是自己时才清**，
  避免后台会话迟到的结束回调清掉当前会话的环。
- dock 渲染一个隐藏锚点 `<span ref={anchorRef} style={{display:'none'}} aria-hidden />`，
  `composerCardRect(anchor)` 从 `anchor.closest('[data-phase]')`（官方公开 DOM 标记）
  取**本会话**的 `[data-composer-card]`；后台会话的卡片不可见时矩形为 0 → 不画环。

## ① 「经常联想不出东西」——先让它可测（诊断增强）

诊断计数原先只有 `requests / fulfilled / retries / shown / empty / filtered*`，
分不出「上游失败」和「客户端作废」。新增三项 + 耗时：

| 计数 | 含义 |
| :--- | :--- |
| `aborted` | 客户端断开（多为还在打字 / 切会话作废了这次联想） |
| `timeout` | 上游超时（`FIM_REQUEST_TIMEOUT` 到点） |
| `upstreamError` | 上游非 2xx / 传输错误 |
| `elapsedTotalMs` / `elapsedMaxMs` | 请求耗时合计 / 最慢一次（平均 = 合计 ÷ requests） |

`GET /api/chat-fim/complete?diagnostics=1` 直接看。本机实测（修复前）：
164 次请求仅 31 次上游成功、25 次出卡——**瓶颈在上游侧**，不在护栏（护栏过滤合计仅 9 次）。
先看新计数落在哪一栏，再决定调参还是别的处置；**不盲调**。

## 涉及文件

- `src/client/ChatFimDock.tsx`：busy 会话化、`clearSuggestBusy`、隐藏锚点、
  `composerCardRect(anchor)` 限定会话根。
- `src/host.ts`：诊断加 `aborted` / `timeout` / `upstreamError` 与耗时统计。

## 验证

- `npm run verify` 全绿（196 tests）。
- 诊断计数与耗时经 `?diagnostics=1` 复核。

## 风险

- `[data-phase]` 是官方公开 DOM 标记（codebuddy 插件已在用）；取不到时回退 `document`
  （退化为原行为，不会画错到更糟的位置）。
- 诊断只加计数、不改请求路径；`bySession` 仍按 `MAX_DIAGNOSTIC_SESSIONS` 有界。
