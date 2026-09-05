# 09 — 归档面板性能：header 缓存 + 投影缓存优先 + 分页与防抖

> 状态：已实现（2026-09-05，owner 评审通过后落地）。所有官方契约结论均对照
> checkout a66e470204（dsh-v0.1.2-rc.1）源码核实，行号见正文。

## 目标

归档会话数量大（数百到数千）时，归档面板打开从「几十秒级」降到「百毫秒级」；
稳态打开**零磁盘扫描**。这是 0.1.2-rc.1 首发前的最后一项功能。

## 现状成本模型（已核实）

一次面板打开，客户端并发 `/list` `/strays` `/trash` `/trash-dir` 四个请求：

1. **全量目录扫描 × O(K)**：`sessionPersistence.list()` 的实现是 readdir 全部
   项目目录 → readdir 全部会话目录 → 逐会话读文件头一行（官方注释
   「listing scales with session count, not log size」，jsonl 后端
   `index.ts:525`）。`/list` 与 `/strays` 各调一次 `storedHeaderFacts`；
   更糟的是 `sessionQuery.readTitleSnapshots` 的 `projectMany` **每次调用都
   重新 `listPersisted`**（corpus.ts:168 核实）——`/strays` 每个游离会话一次
   全量扫描、`/list` 标题一次 projectMany 内又全量。K = 会话数，一次打开
   = O(K) 次全量目录扫描。

2. **冷会话全日志折叠 × O(M+K)**：`readTitleSnapshots`/`readTitle` 对冷会话
   整份 jsonl 读入并折叠（session-query projectMany → load，无缓存检查、
   无大小门）。M 个归档 + K 个游离 = M+K 次全日志读，这是「堪忧」的大头。

3. **subagent 标签第三档**：未种子冷会话逐个 `observeSession` 折叠，串行、
   单个上限 15s（租约释放已在审计修复），N 个最坏 N×15s。

4. **客户端**：`dsh-archive-sessions-changed` 事件无防抖，每个会话释放事件
   触发一次四请求全量刷新；树无分页，超大树一次性进 DOM。

已确认不慢的路径（无需改）：`sessionFacts`（轮次/token/最近活跃）与
`readStrayBlankness` 已直读 projcache 内存表（`host.ts:236/522`）。

## 设计

### 1. host 进程级 header 缓存（单飞 + 写穿失效 + TTL 兜底）

`storedHeaderFacts` 之上加一层进程级缓存：`Map<sessionId, header>` + sizes。
冷启动或失效后第一次读取做一次 `list()` 填充；此后 `/list`、`/strays`、
`/archive`、`/trash`、`/delete`、启动清扫全部从内存取 headers。

- **按 id 缓存的安全依据（已核实）**：jsonl header 一经 `materialize`
  原子写入（temp-write + fsync + publish），此后 `appendBatch` 只追加事件、
  从不回写 header 行（jsonl 后端 `index.ts:446-457/548+`）；fork/改名产生
  新 id 或新事件，不回写旧 header。需要处理的只有**成员增减**。
- **失效（写穿）**：插件自己的写操作（归档/取消/回收站/还原/删除）成功后
  立即失效；官方事件 `api-session/added`（新会话物化）、`api-session/removed`、
  `domain/changed`（官方菜单归档）失效；TTL 30s 兜底（防没有事件的边界路径）。
- **单飞**：并发请求共享同一 promise；一次失效后至多重扫一次，绝不并发多扫。
- 正确性：最坏情况 = 缓存过期那一次多扫一遍盘，**不返回错误数据，只会慢一次**。

### 2. 标题/子标签投影缓存优先，折叠只兜底

- **主标题**：改三档——冷会话先经官方
  `sessionProjectionCache.cachedSnapshot(header, 0, keys)` 读标题投影
  （官方 @ 列表同款，list.ts:335 口径；本插件 subagent 标签已有同款调用
  先例 host.ts:369）；命中直接用；未命中（冷 + 未种子 + 缓存缺失）才回落
  `readTitleSnapshots`，回落限**有界并发（4 路）+ 整体预算超时**，失败保
  现有 fallback（会话 id）。实现时核对 title 单元的 key/val 形状（查证原则）。
- **subagent 标签**：现有三档（缓存优先 + 折叠兜底）不动，只把第三档并入
  同一个有界并发预算。
- 附带收益：`/strays` 里「每游离会话一次全量扫描」随 header 缓存 + 缓存
  命中一起消失；折叠总数从 M+K 降到「真正缺失缓存的少数」。

### 3. 客户端分页 + 防抖

- `dsh-archive-sessions-changed` 刷新加 **300ms 防抖**（保留现有 refresh
  代际守卫）。
- **窗口渲染**：树拍平成线性行（pre-order，携带 depth / 折叠态），按窗口
  渲染——每页 100 行 + 「加载更多」；归档树与回收站区同款。不做虚拟列表
  （可变行高 + 树结构，复杂度不值当）。host 返回形状不变（缓存后构建树
  已是内存操作），分页纯客户端。

### 4. 残余地板（诚实记录）

- 进程启动后第一次打开（或缓存失效后第一次）= 1 次全量 `list()`——官方
  @ 会话列表同款地板，绕不过；从「每次打开」降为「偶尔一次」。
- 冷未种子会话的标题折叠兜底仍可能慢，但限并发 + 预算超时 + 缓存命中后
  不再发生。
- 纠错：rc.1 官方源码**没有** `MAX_ARTIFACT_SIZE` 常量（2026-09-05 核实；
  此前讨论中提过，不成立，不据此设计）。

## 涉及文件

- `src/host.ts`：header 缓存层（单飞/失效/TTL）、`/list` `/strays` 及写路由
  改走缓存、标题三档与有界折叠预算。
- `src/archive.ts`：树拍平纯函数（供测试）。
- `src/client/ArchiveDock.tsx`：防抖 + 窗口渲染。
- 测试：header 缓存失效矩阵（写操作/三事件/TTL）、拍平函数、折叠预算的
  纯逻辑部分。

## 验证

- `npm run verify` 全绿 + `git diff --check`。
- owner 在真实大归档 profile 下开关面板实测（一次打开含失效后的首开）。

## 风险与后续

- 缓存一致性靠「header 不可变 + 三重失效」；如官方改 header 回写语义，
  需重验（0.1.3 会话生命周期重构时一并做，见 `docs/upstream/0.1.3-migration-notes.md`）。
- 客户端拍平/窗口渲染保持树折叠交互与「加载更多」语义，不动现有操作按钮
  与确认流程。
