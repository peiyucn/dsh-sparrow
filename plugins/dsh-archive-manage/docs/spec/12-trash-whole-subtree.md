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
| 02:12:36 | trash 两个孙会话 `52afb238` / `fee8d1f0`（各成一条回收站条目） | 用户手动补齐，14 秒后 |

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
- 路由级实测（临时脚本驱动真实 REST handler + 临时目录造**五层链** `p → c（子）→ gc（孙）→
  ggc（重孙）→ gggc（玄孙）`，`ggc` 另有一个兄弟、且 `ggc`/`gggc` 落在**另一个 project 目录**，
  另有无关会话 `unrelated → other-child`）：
  - trash：`subagentIds = ['c','gc','ggc','ggc2','gggc']`，回收站内 `subagents/{c,gc,ggc,ggc2,gggc}/`，
    两个 project 目录都只剩无关会话，归档集清空整棵子树，`api-session/removed` 发全六条；
  - delete：同上，全部目录删除，无关会话不动；
  - trash → restore：五个后代（含跨 project 的两个）全部回到各自**原路径**，回收站条目消失，
    父会话回归归档集；
  - 玄孙 live 占用：整单 409 `SESSION_LIVE`，一个目录都没动、回收站目录都没创建（不半搬）。
- `npm run verify` 全绿（166 tests）。

## 附带修：归档对齐也走整棵子树（同一次定位的姊妹缺口）

`archiveAlignmentForChildren`（官方菜单归档/取消归档父会话后的父子对齐）旧实现是**单趟只看一层**：

```ts
const parentArchived = archived.has(header.parentSession)   // 只看直接父
```

多层树上它一次只对齐一层，靠「这次写又触发一轮 `domain/changed`」迭代收敛——实测四层树需要
4 轮（`["p","c"] → ["p","c","gc"] → […,ggc,ggc2] → […,gggc]`）。正确性押在事件链上、面板惰性对齐
每打开一次也只推进一层。改为从顶层节点 BFS 逐层传播祖先归档态（每节点访问一次，O(n)）：
一趟即全子树（实测 pass 1 就到位），无根成环时无人可传播、不做任何对齐。

> 归档文件搬运本身不依赖这条对齐（trash/delete 直接按 header 父子链取全后代）；
> 这条只影响归档集标记与面板展示的一致性。

## 附带发现（同次验证暴露，另修）

`restoreTrashDir` 用 `rename(trashDir → 原路径)` 还原，回收站目录里的记账文件
`dsh-archive-manage.json` 会**跟着落回用户会话目录**（`subagents/` 子目录有清理，sidecar 没有）。
见 spec 13。

## 风险

- 深度变大后单次操作的文件数变多：一次 trash 现在可能搬 N 个目录（本机历史最大子树 18 个子会话）。
  路径长度与 rename 次数线性增长，但仍是一次请求内的串行 rename（本机毫秒级）；失败路径沿用原有
  「反向 rename 回滚 + 归档集清理」，回滚集合就是本次实际 `moved` 的目录，语义未变。
- 归档集清理范围变大：只在「目录确实被搬走/删掉」时摘（delete 分支仍只摘 `rm` 成功的那些），
  失败者保留标记、留在归档面板可重试（沿用审计 S7 口径）。
