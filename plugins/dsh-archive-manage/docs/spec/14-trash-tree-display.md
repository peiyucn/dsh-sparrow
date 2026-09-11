# 14 — 回收站区按父子层级展示（>2 层的树）

> 定案 2026-09-12（owner 实测报「回收站里好像显示不了 >2 的树」后定位并修复）。

## 现象

spec 12 修好「整棵子树一起进回收站」后，owner 用一棵 `根 → 子 → 孙 → 重孙 → 玄孙` 的树实测：
条目里**所有后代都进去了**（sidecar 记了 7 条、回收站 `subagents/` 下 7 个目录，数据完好），
但回收站区只画得出**两层**——父条目一行 + 全部后代平铺成同级子行，层级信息看不见。

## 根因：记账就只有一个扁平清单

sidecar v2 的子会话条目形状是 `{ sessionId, title, originalPath, workspaceIds }`（`ArchiveSubagentSidecar`）
——**没有父指针**。回收站目录是扁平的 `subagents/<目录名>/`，`trashItemView` 也就只能给出扁平数组；
客户端 `renderTrashRow` 自然只能画一层缩进。深度 ≥2 的后代在这一层里是「父与兄弟都认不出来」的平铺行。

即：**数据没错、还原也没错**（还原只依赖每条的 `originalPath`），缺的是记账里的父子关系。

## 修法

1. **记账补父指针**：`ArchiveSubagentSidecar` 增加可选 `parentSessionId`，trash 时按每个子会话自己的
   `header.parentSession` 落盘（深度 ≥2 的后代父是中间层子会话，正是要区分的那一层）。
   - **sidecar 版本仍为 2**：不 bump 版本是刻意的——老版本插件读到 version 3 会把整条判成非法
     （`parseTrashSidecar` 只认 1/2）→ 条目退化成「只能删、不能还原」，降级体验会碎掉；
     可选字段则双向兼容（旧插件忽略未知字段，新插件缺字段时回落平铺）。
   - 解析侧：`parentSessionId` 只服务展示，形状不对（非字符串/空白）**只丢该字段**，
     不让一个展示字段把整条判成不可还原（还原只依赖 `originalPath`）。
2. **视图透出**：`TrashItemView.subagents` 带上 `parentSessionId?`。
3. **客户端建树**：新增零依赖纯函数 `trashSubagentTree()`（`src/client/archivedTree.ts`，
   host half 不参与）——扁平清单 + 父指针 → 嵌套节点。健壮性：重复 id 只收一次；父不在条目内、
   或父子链成环（畸形数据）的条目**按顶层挂**（不丢行，也不让渲染转不出来；上溯带 `seen` 守卫）。
4. **渲染复用归档区**：`renderTrashChildRow` 递归渲染，复用 `.dsh-archive-tree-children` /
   `.dsh-archive-tree-node` 同一套容器类——缩进与连接线由 CSS 逐层叠加，任意深度自动正确；
   每层仍受 spec 09 的分页预算（`trashRowsRendered < trashLimit`）约束，不会因为树深了就把行数漏算。

## 验收

- 单测（+9，共 176）：四层链逐层嵌套；姊妹挂同一父下且保序；**旧 sidecar（无父指针）全部平铺**；
  父不在条目内按顶层挂；重复 id 只收一次；父子里成环时按顶层挂且终止；空清单返回空数组；
  `parseTrashSidecar` 透出/丢弃畸形 `parentSessionId`；`trashItemView` 逐条透出层级字段。
- 落盘实测（真实 dsh + 本机 `~/.dsh` 造的 `根→子→孙→重孙→玄孙` 树）：
  - trash 后 sidecar 每条都带 `parentSessionId`（深度 ≥2 的指向中间层，不是根）；
  - `/trash` 视图逐条透出该字段；
  - 面板回收站区展开后按 `根 ▸ 子 ▸ 孙 ▸ 重孙 ▸ 玄孙` 缩进，姊妹行同级。
- `npm run verify` 全绿。

## 已知边界

- **旧条目仍是平铺**：本版之前落盘的回收站条目没有父指针，展示回落平铺（数据与还原不受影响）。
  重新移入回收站即按新口径记账。
- 本修复含 host 侧记账变更 → **需要重启 dsh 生效**（host half 启动时加载）。
