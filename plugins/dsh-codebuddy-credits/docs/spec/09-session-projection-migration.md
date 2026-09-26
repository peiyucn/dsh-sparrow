# 09 · 积分迁到官方会话投影（不再读被废弃的同步历史）（2026-09-26）

> 需求由 owner 提出：「codebuddy 会话读：`Session.snapshotEvents()` 被官方标了
> `@deprecated`（rc 线必办），属设计级改动，建议单开任务。**这个得弄啊**」
> —— 本文件就是那个单开任务的落地记录。

## 问题

`08-credits-ledger-replay.md` 把积分做成了「自己 fold 会话事件」，live 路径读
`ctx.sessions.get(id).snapshotEvents()`。官方自 0.1.7 起把这一族接口标为废弃：

```ts
// packages/core/session/src/index.ts:628-669
/**
 * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
 * See the [Agent Note](.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
 */
eventAt(seq) / snapshotEvents(from, to) / ownEvents()
```

设计记录的原话：**「Existing logic may remain unmigrated for now, but new calls are
prohibited」**，并给出替代方向：

> Design durable event fields and Session projections together so each domain can
> reconstruct the state its consumers need. **After resume, ordinary logic reads the
> projection or processes the delivered current event instead of looking back through
> historical events.**

本插件的 live 账本路径属于**新调用**（该路径 2026-09-21 才写），继续留着不合规；
官方生产代码里的既有调用是带逐行 lint waiver 的（例：
`session-controller/src/commands.ts:561` 的 `oxlint-disable-next-line typescript/no-deprecated
-- Existing Session history read; migration deferred.`），我们没有那个豁免资格。

## 官方契约（逐条核验，决定实现形状）

官方 checkout：`~/.dsh-launcher-panel/source`
（`session-projection/src/index.ts`，0.1.7-rc.2）。

| 契约 | 原文位置 | 对我们的约束 |
| :--- | :--- | :--- |
| 单元是**纯同步** fold | `:41-47`「All functions MUST be synchronous (an async unit would tear the carriers' consistency cut)」 | `init` / `apply` 不得 async |
| **`state` 必须是 plain JSON** | `:45-46`「`state` MUST be plain JSON (the persisted-cache precondition)」 | 不能用 `Map` / `undefined` / 非有限数 |
| **无兴趣须返回同一引用** | `:65-70`「A unit uninterested in an event MUST return the same state reference — an unchanged reference (`Object.is`) produces zero downstream work」 | 非本 provider 的事件原样返回 |
| 注册是 fiber effect | `:226-232`「The registration is an effect on the calling context's fiber」 | 随 fiber 释放，不需手工反注册 |
| **可选贡献方** | `README.md:32`「Contributors may preserve optional registration through `ctx.inject(['sessionProjections'], ...)`」 | 走可选 fork，不进硬 `inject` |
| `stateVersion` 冲突即拒绝 | `:279-281` | 折叠语义一变必须 bump，否则官方抛错 |
| 缓存落盘做**无损 JSON** 校验 | `session-projection-cache/src/index.ts:389-394` 调 `snapshotJsonValue`，失败**抛 TypeError** | 状态里出现 `Map` / `NaN` 会让**整条**记录写盘失败 |
| host-only 单元（不带 `wire`） | `:241-252` | 积分只给自己的 HTTP 路由读，不需要给客户端投影表加键 |

> **`ctx.inject()` 是异步的**（`cordis/lib/index.js:1600-1606`）：
> `inject(inject, callback) { return this.plugin({ inject, apply: callback }) }`，
> 而 `plugin()` 新建 Fiber 后交由容器调度 —— **fork 回调不在调用点同步执行**。
> 我写验证脚本时正因为没 `await` 而误判「fork 没触发」（见「正确性与验证」）。

**关键安全事实**（`restore()` / `restoreFloor()`）：

- `restoreFloor(checkpoint)` 对**没有缓存行**的 key 返回 `0`
  （`:425-435`：`row.ver === stateVersion ? row.seq + 1 : 0`）——即**新注册的单元
  会让旧会话整段重折，而不是读不出来**。这条是我们敢新增 key 的前提。
- `restore()` 在 `baseSeq > 0` 且行不可用时会**抛错**（`:514-519`），但那要求调用方
  自己用 `restoreFloor()` 锚定；官方调用点都照此办理，且外层 fail-soft。
- `viewCheckpoint()` 对损坏行**静默跳过**（`:459-465`），不会带病续算。

## 方案

新增 `src/credits-projection.ts`：一个 **host-only** 投影单元，`key: 'codebuddyCredits'`。

```
state = { credit, calls, byModel[], byTurn: { [String(turn)]: { credit, calls, byModel[] } } }
```

`byTurn` 用**字符串键的普通对象**而非 `Map`——这正是「state 必须是无损 JSON」那条的落点
（官方缓存会 `snapshotJsonValue()` 校验后落盘）。有单测专门钉这一条。

取数路径变成：

| 会话状态 | 取数来源 | 说明 |
| :--- | :--- | :--- |
| live（投影已注册） | `ctx.sessionProjections.stateOf(session, 'codebuddyCredits')` | 同步读状态；**不读会话历史** |
| live（投影服务缺席） | 降级到冷路径 | 可选 fork，服务没有就什么都不注册 |
| cold（重启后未激活） | `ctx.sessionController.inspect(id)` + `foldSessionCredits()` | 官方**公开的异步读面**，不在废弃之列 |

两条路径统一归约成 `CreditsView`（`credits-ledger.ts`），上层 HTTP 路由对来源无感。

**注册走可选 fork**：`ctx.inject(['sessionProjections'], cb)`（不是硬 `inject`）——
积分是展示面，服务缺席时不该把用户的推理 provider 一起停掉（根规范《扩展与宿主兼容》）。

### 迁移顺带消掉的两个负担

1. **不再需要按 `seq` 键控的去重表**。旧实现的幂等靠「条目按事件 seq 键控、重复折叠
   命中同键覆盖同值」；投影由注册表按水位逐事件驱动，每条事件只喂一次，**天然幂等**。
   `foldSessionCredits()` 的 seq 键控仍保留——它服务的是冷路径那种「同一批事件被反复
   全量折叠」的场景。
2. **不再每次读都全量重折**。旧实现每次请求把整段历史折一遍（O(事件数)），客户端在
   流式期间按去抖拉取时是实打实的重复开销（真实会话 19,000 事件的量级）；现在是 O(1) 读状态。

## 涉及文件

- `src/credits-projection.ts`（新）：投影单元 + `viewOfCreditsState()`
- `src/credits-ledger.ts`：新增 `CreditsView` 接口与 `viewOfLedger()`（两条路径的统一读面）
- `src/credits-source.ts`：`live` 契约从「同步读 + 增量折叠」改为「同步读投影状态」；
  冷路径缓存/单飞保留
- `src/index.ts`：注册投影单元（可选 fork）；`sessionUsage` / `turnUsage` 改读 `CreditsView`；
  删掉 `session.snapshotEvents()` 调用
- `src/compat.ts`：更新「为什么没有会话格式硬门」的说明（废弃读接口那条消失）
- `package.json`：新增 `zod` 运行时依赖 + `@deepseek-ai/dsh-session-projection`（peer + dev）
- `test/credits-projection.test.mjs`（新）：单元契约 + 无损 JSON + schema 拒绝坏行 + 引用语义
- `test/credits-source.test.mjs`：live 契约改写；两条降级守卫改为「投影服务缺失 / 取状态抛错」
- `test/inject-contract.test.mjs`：识别**可选 fork** 的服务名；新增两条守卫——
  ① `sessionProjections` 必须留在可选 fork（不得进硬 inject）、
  ② **全源码扫描**禁止再出现 `.snapshotEvents(` / `.eventAt(` / `.ownEvents(`

## 正确性与验证

- 插件 `npm run verify`：**182 测试全绿**（typecheck + build + client bundle + pack）；
  六插件全量 `verify-all`：**914 通过 / 0 失败**。
- **真实注册表集成**（临时脚本 `_poc/TEMP/verify-registry-real.mjs`，用官方真包
  `SessionProjectionRegistry` + 真 `SessionStore` + 真 `Session`，非 mock）：10 项全过——
  注册被接受、`stateVersion` 冲突被官方拒绝、**真实事件驱动后 `stateOf()` == 冷路径重折**、
  重复读幂等、`checkpoint()` 产出可落盘 row、**`restore()` 用「缓存行 + 尾部事件」续算 == 全量驱动**、
  `restoreFloor()` 对新单元退回 0（旧会话不会读不出来）、版本不符/损坏行被作废、
  每会话 cell 独立、disposer 生效。
- **真实会话逐字段比对**（`_poc/TEMP/verify-real-sessions.mjs`）：17 个真实会话 /
  **33,617 事件** / 3,451 次调用 / 1,111.12 积分——投影单元逐事件驱动与旧的
  `foldSessionCredits()` **逐字段一致**（会话合计、调用次数、按模型、每一轮）；
  投影状态**最大 3.2 KB**（最多 26 轮），落盘代价可接受。
- **真机三路一致**（`_poc/TEMP/compare-live-offline.mjs`，对运行中的 3080 实例）：
  10 个**空闲**会话上 `live 端点 == 离线重放 == 投影单元逐事件驱动`，**逐位一致**
  （含 `639.69/1969`、`328.51/945` 这类长会话）。

  ⚠️ 这一步第一版**做错了**并被我自己的数据抓到：我挑了当轮对话自己的会话，
  它正在写入（先量到 1961，几秒后 live 已是 1965），live 水位与离线解压水位天然对不上，
  差 3 笔。**结论：跨进程对照必须挑 mtime 连续两次不变的空闲会话**，
  脚本现在会先验证空闲再比对。

  ⚠️ **另一条更该记的诚实说明**：上面这次真机对照跑的是**进程启动于 08:04 的旧实例**，
  而本轮的 build 产出在 10:35 —— 也就是说它验证的是**数字口径等价**（旧 live 实现 vs
  离线重放，两者都是 `foldSessionCredits`），**不是**新接线已经在跑。
  新接线由下面两条补上（都不需要重启那个实例）。

- **真实 `apply()` 端到端接线**（`_poc/TEMP/verify-apply-wiring.mjs`）：把插件**真实的
  `apply()`** 跑在真 cordis 容器上（真 `SessionStore` + 真 `SessionProjectionRegistry`，
  只给 `llm` / `attachments` / `webServer` 打最小桩），验证：`apply()` 不抛、
  **可选 fork 真的把投影单元注册上了**（`stateOf` 有值）、投影状态与离线重折逐字段一致、
  容器能干净停止。
  **为什么非跑不可**：前面的集成测试都是我手工调 `registry.register()`，而插件实际走
  `ctx.inject(['sessionProjections'], cb)` —— fork 若不触发，投影永远不注册，
  `live()` 会**静默降级**成冷路径（数字看着还对，迁移却白做了，而且没有任何报错）。
- **fork 触发语义 + 版本核对**（`_poc/TEMP/verify-fork-and-version.mjs`）：
  ① `ctx.inject()` 返回 **fiber、不是同步执行**（`cordis/lib/index.js:1600-1606`：
  `inject(inject, callback) { return this.plugin({ inject, apply: callback }) }`，
  `plugin()` 新建 Fiber 后由容器调度）—— 我第一版脚本就是因为没 await 而误判「fork 没触发」；
  ② `ctx.get('sessionProjections')` 软获取成功、注册表缺席时静默返回 `undefined`
  （降级路径成立）；③ 集成测试加载的官方投影是 **0.1.7-rc.2**，与运行中的 dsh 版本线一致
  （安装树里另有一个 rc.1 的旧 base bundle 副本，别被它误导）。

### ⛔ 一条**尚未完成**的验证：运行中的 3080 实例还没跑迁移后的代码

`dsh web` 是 08:04 启动的，而本轮 build 产出在 10:37（host half 不走 HMR，
`link:` 只是让**新进程**能读到新代码）。这件事**不能靠猜**，用了一个决定性判别器：

> 只有迁移后的代码会往官方投影缓存里写 `codebuddyCredits` 这个 key。

查 `~/.dsh/storages/session_projcache/sessions/*.json`
（`_poc/TEMP/check-projcache-keys.mjs`，注意 rows 在 `record.rows` 下）：

| 事实 | 值 |
| :--- | :--- |
| 缓存文件数 | 17 |
| 各文件都有的 key | 24 个（title / tokenUsage / sessionStats / … / imageLimits） |
| **含 `codebuddyCredits` 的文件** | **0** |
| 最新一次缓存写盘 | **10:40:28**（晚于 build 的 10:37） |

即：10:40 仍在写盘的进程里**没有**本单元 → **运行中的实例执行的是迁移前的代码**。
所以「真机三路一致」验证的是**数字口径等价**，不是新接线在跑。

**结论（诚实记账）**：迁移的正确性由三层独立证据支撑 ——
真实注册表集成（真包 + 真 Session + 真事件驱动）、真实 `apply()` 在真 cordis 容器上
的接线（fork 确实注册）、33,617 条真实事件逐字段等价；而**「owner 当前那个 3080 进程
里跑的就是新代码」这一条，要等下次重启 dsh 才能确认**。
重启后最快的确认方式：重跑 `_poc/TEMP/check-projcache-keys.mjs`，
`含 codebuddyCredits 的文件数` 应 > 0。

## 已知限制与取舍

1. **host-only 单元仍会被官方投影缓存 checkpoint**（这是它「所有单元一视同仁」的设计）。
   代价是每次落盘多带一段本单元状态（实测最大 3.2 KB / 26 轮）。没有关掉的办法，
   除非不注册——那就回到不合规的同步读。
2. **`zod` 成为运行时依赖**。官方 `stateSchema` 契约类型是 `ZodType<S>`，且投影缓存回读
   时真的会 `parse()`，所以这里不能省。`zod` 由官方 `session-projection` 自己依赖
   （`zod: ^4.4.3`），版本与之对齐。
3. **折叠语义一变必须 bump `stateVersion`**：不然旧缓存行会被 `stateSchema.parse` 接受
   并带病续算（官方按 `ver` 判可用，不比对字段）。已在代码注释里写明。
4. **`pnpm-lock.yaml` 有一次 peer 图重解析**（+107/−61 行）：新增
   `@deepseek-ai/dsh-session-projection` 这条 peer 边会带动官方包的 peer 组合重算。
   已逐行核对：**没有任何包的真实版本发生变化**（只增了依赖边与新的组合键）。
