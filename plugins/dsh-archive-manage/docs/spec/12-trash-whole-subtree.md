# 12 — 移入回收站 / 彻底删除：整棵子会话树一起走

> 定案 2026-09-12（owner 实测报 bug 后定位并修复）。官方契约对照本机 checkout（dsh-v0.1.5-rc.2）核实。

## 现象（owner 实测）

在归档面板里连续清理若干已归档会话时：把父会话移入回收站后，它的**孙会话**（子代理再派出的子代理）
没有随父走，直接掉出来浮到面板上，只能再逐个移入回收站——回收站里于是多出两个「孤零零的
subagent 条目」，与父会话的条目彼此失去关联。

实测现场（本机 `~/.dsh/.sessions-trash`）：

| 时间 | 操作 | 结果 |
|---|---|---|
| 02:12:22 | trash 祖父会话 `session-95fd23b7`（带子代理树） | sidecar 只记了两个**直接**子会话 `20ffb1a3` / `3d2191db` |
| 02:12:34 / 02:12:36 | 用户先后 trash 两个孙会话 `fee8d1f0` / `52afb238`（各成一条回收站条目） | 手动补齐，12–14 秒后 |

两个孙会话的 header 实测为 `origin: 'subagent'`、`parentSession: 20ffb1a3`（即**已入回收站的直接子会话**）
——即父子链深度为 2，不是插件以为的 1。

## 根因

`listSubagentTargets`（`src/host.ts`）只挑 `header.parentSession === 根会话 id` 的**直接子会话**：

```ts
if (String(header.parentSession) !== String(parentSessionId)) continue
```

而官方 header 的父子链是任意深度：`subagent` 工具可以再派子代理，header 有 `delegationDepth`
（`packages/core/session/src/types.ts:122`，`packages/subagent/subagent/src/child-agent.ts:50,154`），
深度 ≥2 的会话 `parentSession` 指向的是**中间层子会话**，不是根会话。于是：

- 根 + 直接子会话被搬进 `trashDir/subagents/`（sidecar 记录、还原也正常）；
- 深度 ≥2 的后代目录**留在磁盘上**。父已不在持久化清单里，这些会话随即：
  - 若仍在归档集 → 在归档面板以**孤儿根**浮到根级（父子对齐对孤儿不参与，永远补不回来）；
  - 否则 → 落进游离会话区。

旧注释（审计 B1，`2c4f001`）把「只搬直接子会话」当成既定前提，反过来把**归档集清理**收窄成
「根 + 直接子会话」，以保住那些留在盘上的后代不被误取消归档。前提本身错了：真正的修法是
**把整棵子树一起搬走/删掉**，后代不再留在盘上，归档集也就不需要留它们的标记。

`/delete` 走同一个 `listSubagentTargets`，同样只删直接子会话（历史提交 `4a943f7` / `a0652ac`
都在这个口径上打补丁）。

## 修法

一处收口：待处理集合从「直接子会话」改为「**全部后代**（任意深度）」。

- `archive.ts` 新增纯函数 `subagentDescendantIds(headers, rootId)` = `collectSubtreeIds(...)` 去掉根
  （BFS、父在子前、去重）；`collectSubtreeIds` 补 `seen` 守卫（父子链理论上无环，异常数据也不能让
  BFS 转不出来——调用方要动文件）。
- `host.ts`：`listSubagentTargets` 遍历全后代，逐个体检（格式门 / live 占用 / 后端能力），任一不合格
  整单拒绝（语义不变，只是范围变大）。trash 分支把全部后代搬进 `trashDir/subagents/<目录名>` 并在
  sidecar 记录 `originalPath`，delete 分支逐个 `rm`。
- 归档集清理（`archivedIdsToRemove`）语义随之上修为「根 + 实际被搬走/删掉的**全部后代**」；
  `removeArchivedIds` 注释与客户端摘行注释同步。
- 回收站目录仍是**扁平**布局（`subagents/<会话目录名>`），不按层级嵌套：每个后代都在 sidecar 里
  带自己的 `originalPath`，还原按路径逐个搬回，深度与还原顺序无关。

## 验收

- 单测：`collectSubtreeIds` 四层链逐层收全 + 成环终止；`subagentDescendantIds` 多层后代全返回、
  不含根、别的父下的子会话不入选；`archivedIdsToRemove` / `removeArchivedIds` 整棵子树出归档集；
  客户端 `dropArchivedIds` 摘整棵子树只留未命中的顶层节点；`archiveAlignmentForChildren` 多层树
  一次算全 + 无根成环不误对齐。
- 路由级实测（临时脚本驱动真实 REST handler + 临时目录造树，逐维度打卡）：

  | 维度 | 用例 | 实测结果 |
  |---|---|---|
  | 深度 | 五层链 `p → c（子）→ gc（孙）→ ggc（重孙）→ gggc（玄孙）` | trash/delete `subagentIds = ['c','gc','ggc','ggc2','gggc']`，全部搬走/删除 |
  | 宽度（姊妹） | `ggc` 的姊妹 `ggc2` | 同为后代，一起走；回收站 `subagents/` 下逐个目录 |
  | 跨 project | `ggc`/`gggc` 在另一个 project 目录（cwd 不同） | 按各自 header 的 `locate` 取目录，两个 project 都清空；restore 各回**原路径** |
  | 越界（移中间节点） | trash 中间节点 `c1`（父 `p`、姊妹 `c2` 都在） | 只带 `['g1','g2']`；`p`、`c2` 目录与归档标记**原地不动**，`removed` 只发三条 |
  | 越界（删姊妹） | delete `c2` | 只删 `c2`；`p` 与 `c1` 整棵树不动 |
  | 孤儿根 | 父不在清单的子会话 `o`（自带孩子 `og`） | 走同一条链路，`og` 一起走；别的树不动 |
  | 拒绝 | 玄孙 live 占用 | 整单 409 `SESSION_LIVE`；一个目录没动、回收站目录都没创建（不半搬） |
  | 幽灵目录 | 某个后代目录已不在盘上 | 该条跳过并告警，其余照搬完成（见下节），不再整单回滚 |
  | 归档对齐 | 官方菜单只归档父 `p` | 一趟到全子树（pass 1 全含），pass 2 零写 |

- trash → restore 全链：五个后代（含跨 project 的两个）全部回到各自原路径，回收站条目消失，
  父会话回归归档集，会话目录里不留记账文件（spec 13）。
- `npm run verify` 全绿（167 tests；发布前审计独立复核 166 → 补可达环断言后 167）。

## 附带修：后代会话目录缺失不再整单回滚（与 delete 的 ENOENT 口径对齐）

trash 分支对每个后代 `rename` 时，旧代码把整个循环包在一个 try 里：任一目录不在盘上
（陈旧 header 缓存 / 手工删过）就 `ENOENT` → 整单回滚 + 500，于是**这棵会话树永远移不进回收站**
（只能走「彻底删除」，而那是不可逆的）。delete 分支早前已按审计 F2 把 ENOENT 视为「已消失」
（`a0652ac`），trash 与它不对称。

现改为逐条 try：`ENOENT` → 告警 + 跳过该条（磁盘上本就没有东西可搬），其余错误照旧整单回滚。
被跳过的会话**仍留在响应 `subagentIds` 与归档集清理清单**里——磁盘上已无此会话，标记不该留
（启动的幽灵 id 清扫也会兜底）。实测：手工删掉重孙 `ggc` 目录后 trash 返回 200，
`c/gc/ggc2/gggc` 正常进回收站，`ggc` 只出现一条告警。

## 附带修：归档对齐也走整棵子树（同一次定位的姊妹缺口）

`archiveAlignmentForChildren`（官方菜单归档/取消归档父会话后的父子对齐）旧实现是**单趟只看一层**：

```ts
const parentArchived = archived.has(header.parentSession)   // 只看直接父
```

多层树上它一次只对齐一层，靠「这次写又触发一轮 `domain/changed`」迭代收敛——实测四层树需要
4 轮（`["p","c"] → ["p","c","gc"] → […,ggc,ggc2] → […,gggc]`）。正确性押在事件链上、面板惰性对齐
每打开一次也只推进一层。改为从顶层节点 BFS 逐层传播祖先归档态（id 唯一时每节点访问一次，O(n)）：
一趟即全子树（实测 pass 1 就到位），无根成环时无人可传播、不做任何对齐。

**发布前审计 S1（已修）**：BFS 版漏了 `seen` 守卫，而 `id` 唯一这个前提并不由本函数保证——畸形数据里
同一 id 出现两条 header 就能造出**从根可达**的环（一条挂在链尾指回祖先），队列无界增长 =
在 `domain/changed` 监听与 `/list` 路由里**同步挂死**（审计实测 15s 未返回）。同批给
`collectSubtreeIds` 补守卫时漏了这一处，现已补上并加了「可达环」回归断言（原有的「无根 2-环」
用例不可达、挂不住这个 bug）。可达性：受支持版本线的官方 jsonl 后端**主动拒绝**重复 id
（`session-persistence-jsonl/src/index.ts` `listArtifacts()` 抛 duplicate），故线上不可达；
非 jsonl / 将来后端口径未知，守卫仍按「不能挂死」处理。

> 归档文件搬运本身不依赖这条对齐（trash/delete 直接按 header 父子链取全后代）；
> 这条只影响归档集标记与面板展示的一致性。

## 附带修：后代会话目录缺失不再整单回滚（与 delete 的 ENOENT 口径对齐）

trash 分支对每个后代 `rename` 时，旧代码把整个循环包在一个 try 里：任一目录不在盘上
（陈旧 header 缓存 / 手工删过）就 `ENOENT` → 整单回滚 + 500，于是**这棵会话树永远移不进回收站**
（只能走「彻底删除」，而那是不可逆的）。delete 分支早前已按审计 F2 把 ENOENT 视为「已消失」
（`a0652ac`），trash 与它不对称。

现改为逐条 try：`ENOENT` → 告警 + 跳过该条（磁盘上本就没有东西可搬），其余错误照旧整单回滚。
被跳过的会话**仍留在响应 `subagentIds` 与归档集清理清单**里——磁盘上已无此会话，标记不该留
（启动的幽灵 id 清扫也会兜底）。实测：手工删掉重孙 `ggc` 目录后 trash 返回 200，
`c/gc/ggc2/gggc` 正常进回收站，`ggc` 只出现一条告警。

**根会话的 ENOENT 口径（有意不对称，审计 S4）**：后代宽容、根从严——

| 场景 | 后代目录缺失 | 根目录缺失 |
|---|---|---|
| trash | 跳过该条，其余照搬（200） | **拒绝**：404「会话目录不在磁盘上……没有可移入回收站的内容」（不伪造条目） |
| delete | `rm force:true`，视为已删除并摘标记 | `rm force:true`，视为已删除并摘标记（`a0652ac` 同一条道理） |

trash 的根为什么不也「跳过」：回收站条目的可还原性建立在「目录里有会话日志」上；只有 sidecar 的
空条目还原后会在用户数据目录里造出一个空会话目录，比直接报错更糟。delete 侧的宽容则让幽灵会话
（盘上已无、归档标记还在）在面板里可被清掉，不必等下次启动的幽灵 id 清扫。

## 附带发现（同次验证暴露，另修）

`restoreTrashDir` 用 `rename(trashDir → 原路径)` 还原，回收站目录里的记账文件
`dsh-archive-manage.json` 会**跟着落回用户会话目录**（`subagents/` 子目录有清理，sidecar 没有）。
见 spec 13。

## 风险与已知项

- 深度变大后单次操作的文件数变多：一次 trash 现在可能搬 N 个目录（本机回收站 sidecar 里记录过的
  最大子会话清单为 18 条——`session-889f769c`、`session-a5db9699`；旧口径只记直接子会话，故真实
  后代数只会更多）。路径长度与 rename 次数线性增长，但仍是一次请求内的串行 rename（本机毫秒级）；
  失败路径沿用原有「反向 rename 回滚 + 归档集清理」，回滚集合就是本次实际 `moved` 的目录，语义未变。
- 归档集清理范围变大：只在「目录确实被搬走/删掉」时摘（delete 分支仍只摘 `rm` 成功的那些），
  失败者保留标记、留在归档面板可重试（沿用审计 S7 口径）。
- **测试覆盖缺口（审计 S3，列为技术债）**：本批的两条「静默降级」路径——trash 跳过 ENOENT 的后代、
  还原后清理 sidecar——目前只有路由级临时脚本（未入库）作为证据，`test/*.test.mjs` 全是纯逻辑层用例，
  下次回归 `verify` 拦不住这两条。收口方向：把 trash 循环 / `restoreTrashDir` 里可纯化的部分抽成
  注入 fs 的纯逻辑（照 `archivedTree.ts` / `paging.ts` 先例），或补 temp-dir 级路由测试
  （官方依赖都在 devDependencies 里，成本不高）。
- **既有设计，本批只是放大了触发面**（审计 nit 10/11）：① `rollbackMoves` 某条回滚失败时只 warn，
  未回滚的子会话目录会嵌在还原后的 `<父会话目录>/subagents/` 里；② trash 在「父目录已 rename、
  sidecar 未写」之间存在崩溃窗口（无两阶段提交），进程被杀会留下一个不可还原的旧格式条目。
- **畸形输入类**（重复 id 的 header）：`collectSubtreeIds` / `archiveAlignmentForChildren` 已由 `seen`
  守卫保证终止；但 `buildSessionTree` 在同一输入下仍会栈溢出（RangeError，审计复现）——该畸形输入类
  官方 jsonl 后端本就拒绝（`listArtifacts()` 抛 duplicate），故按「不挂死即可」处理，未一并加固。
