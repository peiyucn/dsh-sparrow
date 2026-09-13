# 15 — 子会话树默认收起 + 锁定来源可见

> 定案 2026-09-13（owner 提「有 subagent 的会话展示上应该默认收起」后逐条确认：归档区 + 回收站区
> 一起改、父行补「子会话未释放」标记）。

## 现象：默认展开不是选的，是漏配的

`ArchiveDock.tsx` 跟踪 `collapsedIds` / `collapsedTrashIds`，初值是**空集**，而渲染处读
`collapsedIds.has(id)`（`:937`、`:1096`）——空集 ⇒ `has` 恒假 ⇒ 凡带子会话的父行一律展开。
「展开」并非被选中的默认值，只是折叠集合没预置任何键的副产物。

三个后果：

1. **行角色错位**：父行是唯一带操作的层级（`renderArchivedRow` 只在 `depth === 0` 渲染取消归档 /
   移入回收站 / 彻底删除；`renderTrashChildRow` 子行一个按钮都没有）。面板默认视图停在子行，
   而子行是只读装饰。
2. **扫描密度**：一个派了 10 个子代理的会话会把后面所有顶层会话顶下去，同级父行不再对齐——
   而这块面板最常做的事就是扫一眼找某个会话。
3. **和分页预算打架**：spec 09 的 100 行窗口算的是**可见行**（`countVisibleRows`，`:1286-1291`），
   展开的子行吃掉窗口预算 → 顶层列表被截断、更早冒出「加载更多」。

信息并没有丢：父行本来就带「{n} 个子会话」徽标（`tree.childCount`），点 ▸ 即展开。

## 定案

1. **默认收起**，归档区与回收站区一起改（两区交互语义一直是「与归档树同款」，spec 14 与代码注释）。
2. **状态反转**：跟踪 `expandedIds` / `expandedTrashIds`（空集 = 全部收起），而不是把所有 key 灌进
   `collapsedIds`——默认由数据结构表达，不留「忘了预置」的坑。
3. **记忆范围不扩**：手动展开的状态在刷新与面板重开内保持（现状 `collapsedIds` 也不随 `refresh()`
   复位）；**不落 localStorage**——面板定位是快速扫一眼，跨 dsh 重启记忆的收益不足，且会引入一份
   需要失效策略的持久状态。
4. **分页预算随之受益**：首屏 100 行留给顶层会话，子行只在用户展开时占预算。
5. **锁定来源可见**（默认收起带出的必补项）：未释放分组按**整棵子树**判定（`subtreeLive`），
   但行内状态文案只看该行自己 → 「父冷、子会话 live」时父行一个标记都没有，只有按钮变灰 +
   悬停提示（`state.unreleasedActionHint`）。收起后这就是「点不动、又不说为什么」。
   故行事实行补一条：自身不 live / 不 running、但有后代 live 时显示「子会话未释放」
   （任意深度都适用；孙会话 live 时中间层同样提示）。

## 实现

| 文件 | 改动 |
| :--- | :--- |
| `src/client/archivedTree.ts` | `subtreeLive()` 从组件内联下沉为纯函数（模块定位即「归档树纯逻辑」，node:test 可直接导入）；新增 `descendantLive()`（锁定是否来自后代）；新增 `isCollapsed()`（默认收起判据，取代散落的 `collapsedIds.has()`） |
| `src/client/ArchiveDock.tsx` | `collapsedIds` → `expandedIds`、`collapsedTrashIds` → `expandedTrashIds`；两处 `countVisibleRows` 谓词改走 `isCollapsed`；行事实行补「子会话未释放」 |
| `src/client/index.ts` + `locale.d.ts` | 新增 `state.subagentUnreleased`（zh / en） |
| `src/client/paging.ts` | 不动（折叠判据由调用方传入） |

`subtreeLive` / `descendantLive` 虽由 host 载荷驱动，但判定本身是纯树逻辑；下沉后能覆盖
「自身 live ≠ 后代 live」这类容易写反的分支。

## 验收

- 单测：`subtreeLive`（自身 live / 直接子 live / 孙 live / 全冷）、`descendantLive`（自身 live
  不算后代 live、后代 live 命中、全冷不命中）、`isCollapsed`（空集即收起、显式展开即不收起）。
- GUI 实测（真实 dsh + 本机归档数据）：打开面板 → 带子会话的父行默认 ▸ 收起、只见计数徽标；
  点开显示缩进子行；关闭面板再打开，之前点开的仍展开；回收站区同款；父冷子 live 的行显示
  「子会话未释放」。
- `npm run verify` 全绿 + `git diff --check` 干净。

## 已知边界 / 代价

- 想「看某会话派了哪些子代理」多一次点击。判断是划算的：那一屏是管理列表，不是浏览视图。
- 只有客户端 half 改动 → **刷新页面即生效**（host half 未动，不需要重启 dsh）。
- 本版之前用户手动点开过的状态不跨页面刷新保留——与现状一致，不是本版引入的回归。
