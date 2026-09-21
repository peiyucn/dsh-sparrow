# 08 · 积分记账改为会话事件重放（重启不再清零）（2026-09-18）

> 需求由 owner 提出：「codebuddy 积分在同一个会话里 dsh 重启后就没了，再对话是重新开始计算，
> 所以完全失真了」——同时指出对照事实：**官方两颗胶囊（轮/步、token）重启能维持**。
> 官方契约按本机 checkout `dsh-v0.1.5-rc.2` 逐条核验。

## 问题

`index.ts` 把用量记在**进程内数组**里：

```ts
const usageLog: TaggedUsage[] = []          // apply() 内，重启即空
if (usageLog.length > 1000) usageLog.splice(0, usageLog.length - 1000)
```

`/session-usage`、`/turn-usage` 都从这个数组聚合（`web.ts` 的 `turnUsageOf`）。
重启 dsh 后数组清空，同一会话继续对话 → 胶囊从 0 重新累计。这不是显示问题，
而是**数据源选错**：同一会话的历史消耗明明还在，只是没人去读。

三个后果：
1. 重启后积分失真（owner 报的主症状）；
2. `usageLog` 上限 1000 条，长会话静默丢弃最老记录（同一症状的另一形态）；
3. `requestTurns` 用 `WeakMap<AbortSignal, {turn}>` 关联轮次——请求结束后信号可被回收，
   关联本身是脆的。

## 官方事实（决定设计）

1. 官方统计（轮/步、token）走 **session projection**：`ctx.sessionProjections.register(def)`
   注册一个纯 fold，框架在 `session/event` 上 eager drive 每个已注册单元，
   并按会话持久化 checkpoint（`session-projection/src/index.ts:183-220`；
   `token-meter/src/usage-projection.ts` 是官方实例）。
   —— 这就是「官方胶囊重启能维持」的机制。
2. **credit 已经在会话事件里持久化了**（2026-09-18 实测，解压真实会话文件 839 个
   zstd 帧 / 1447 事件）：`adapter.ts` 在 finish 块写入
   `replayState: { response: { model, usage: frame.usage } }`，而 `frame.usage` 是
   CodeBuddy 原始 usage 帧，**含 credit**（DSH 的 `TokenUsage` 没有该字段，故只有这一份）。
3. credit 在事件里的**精确路径**（实测归一化统计，262/262 条 `assistant/message` 命中）：
   - `data.message.source.replayState.response.usage.credit`
   - `data.stream[].chunk.replayState.response.usage.credit`

   同一条数据两处出现。取 `data.message.source.*`：每条事件恰一份、无数组展开。
4. `data.message.source` 同时带 `kind` / `provider` / `model`，可**精确判别是否本 provider**
   （实测该会话 262 条全为 `provider: 'codebuddy-credits'`）——不必靠 sessionId 猜。
5. 无重复计风险：实测同一 `turn/step` 未出现「值不同的重复事件」（重试迹象）0 例。
   但官方 `token-meter` 对 `llm/retry-started` 有专门的替换语义（`usage-projection.ts:123-127`），
   本设计按 (turn, step) **last-wins 记账**对齐该语义，而非无脑累加。
6. 冷会话（重启后未激活）可读：`ctx.sessionController.inspect(sessionId)` 返回
   「持久化 header + 完整事件前缀」，且**不激活 Agent**（`session-controller/src/index.ts:201-214`，
   底层 `inspectApiSession` → `ctx.sessionQuery.observeSession`）。
   但 `session-controller` / `session-query` 只随 **web-app bundle** 加载
   （`packages/bundle/web-app/package.json`），`bundle/base` 没有。

## 方案

**用「会话事件重放」替换进程内数组**，分两层取数：

| 会话状态 | 取数来源 | 说明 |
| :--- | :--- | :--- |
| live（`ctx.sessions.get(id)` 有） | `session.snapshotEvents()` | 同步、零 IO；流式期间每步调用也便宜 |
| cold（重启后未激活） | `ctx.sessionController.inspect(id)`（软获取） | 读持久化前缀；服务缺失则降级为「仅 live」 |

fold 逻辑做成**纯函数**（`foldSessionCredits(events)`），与取数来源解耦，便于单测。
由于客户端在流式期间会按 debounce 反复拉取（`CodeBuddyCreditsStats.tsx:85-90`），
live 路径必须避免每次全量重折：按会话缓存 `(seq → 聚合结果)`，只 fold 新增事件。

**保留 `usageLog` 作为兜底/对照**：fold 依赖 `replayState` 形状，若上游未来改动该形状，
重放会退化为 0 而进程内记账仍正确。两者取**较大值**，并在 fold 明显劣于内存记账时
维持原行为（不因一次上游改动让功能整体失效）。

**轮次关联改用事件里的 `data.turn`**：不再需要 `requestTurns` 那个 WeakMap
（`assistant/message` 自带 `turn`/`step`），顺带去掉 `abort` 后关联丢失的问题。

## 与官方机制的关系（诚实记录）

**不注册 session projection**，而是自己 fold 事件。理由：

- projection 的价值在于「框架驱动 + 客户端 push + checkpoint 持久化」；本插件的取数面
  是**自有 HTTP 路由 + 客户端拉取**（既有架构），引入 projection 需要额外的 wire 层与
  客户端订阅改造，收益不匹配。
- projection 的 `stateSchema`（zod）+ `stateVersion` 带来版本迁移负担；而重放是纯读，
  上游改了形状我们改 fold 即可，不影响会话文件本身。
- 代价：冷会话首次读取要走一次持久化 IO（后续按会话缓存）。

若后续要接官方 projection 的 push 面，fold 纯函数可直接复用为 `apply`。

## 涉及文件

- `src/credits-ledger.ts`（新）：`foldSessionCredits` 纯函数 + 视图聚合
- `src/credits-source.ts`（新）：`createLedgerResolver`——live/冷两条取数与缓存、冷读单飞
  （抽成可注入依赖的小件，**为的是让「重启后冷会话」这条路径能被单测覆盖**，
  而不是只能靠人工重启验证）
- `src/index.ts`：`/session-usage`、`/turn-usage` 改读 resolver；移除 `usageLog`、
  `requestTurns`（WeakMap）与 `onUsage` 回调（记账已由事件重放承担）
- `src/web.ts`：`turnUsageOf` / `UsageEntryLike` 删除（死代码）；两个 shared 方法转 async
- `test/credits-ledger.test.mjs`（新）：fold 纯逻辑（重试替换、跨 turn、非本 provider、
  无 usage 帧、有 usage 缺 credit、增量折叠、纯函数性、游标不回退）
- `test/credits-source.test.mjs`（新）：live/冷取数、缓存命中和 LRU、冷读单飞、失败降级
- `test/web.test.mjs`：原 `turnUsageOf` 契约测试改为 `sessionViewOf`/`turnViewOf`（同一组口径）
- `package.json`：新增 `@deepseek-ai/dsh-session` 依赖（`SessionId` / `SessionEvent` 类型）
- `README` / `README.zh-CN`：**改写**「重启清零」口径（该限制已消失）
- `docs/spec/07-session-credits-pill.md`：标注第 69 行的限制已修复

## 正确性与验证

- 插件 `npm run verify`：**148 测试全绿**（typecheck + build + client bundle + pack）。
- **重放正确性**：对真实会话（1447 事件 / 262 条 `assistant/message`）用 `foldSessionCredits`
  重放，与独立脚本（直接遍历 JSON 提取 credit）的结果**逐轮完全一致**
  （turn 1~9：11.04 / 2.73 / 2.74 / 4.11 / 7.19 / 5.67 / 3.99 / 9.73 / 4.23）。
- **两条路径取值一致**：`live`（内存日志）与 `cold`（`sessionController.inspect` 读持久化前缀）
  在真机上结果相同——对 **5 个重启后从未打开过的旧会话**，`/session-usage` 与独立解压磁盘事件
  重放的结果**逐个精确吻合（差异 0.00 / 0）**，其中包含一个跨越重启、
  `948.21 credit / 2841 次调用` 的旧会话；活跃会话同样逐轮吻合。
  **「重启清零」已消除。**

## 实现约束（改动本机制时必须守住）

1. **`ctx.sessions` 必须在宿主侧 `inject` 中声明**。cordis 服务须经 inject 绑定到本插件 fiber
   （`cordis/lib/index.js:672-694`），否则访问即抛 `cannot get property "sessions" without inject`。
   该失败**只在请求进来时才暴露**：插件照常启动、provider 照常注册、单测全绿。
   守卫：`inject-contract.test.mjs`——静态扫描源码里的 `ctx.<服务>` 访问，
   要求它们都在 `inject` 中声明或属 cordis 内建。
2. **UA 必须含 `CLI/` 记号**，否则 `/v3/config` 静默不返回模型列表
   （成因见 `00-overview.md` 的《请求形态规矩》）。守卫：`request-identity.test.mjs`。

## 已知限制与取舍

1. **cold 路径依赖 web-app 专属服务**（`sessionController`）。非 web profile 下
   `ctx.get` 返回 undefined，自动降级为「仅 live 会话准确」——不报错、不影响启动。
   本插件 `dsh.client.platform = web`，实际运行面就是 web-app bundle。
2. **dsh 版本号无法上报到 CodeBuddy 后台**：`X-IDE-Type` / `X-IDE-Version` 均不出现在官方
   dashboard 的 `clientName` / `clientVersion` 维度。`X-IDE-Name` 只影响**用量明细**的
   `client` 字段——即用量明细**能**看到标识，而官方 dashboard 的「客户端分布」图表
   **看不到**（该维度来自 IDE 插件自身遥测，不读请求头）。
