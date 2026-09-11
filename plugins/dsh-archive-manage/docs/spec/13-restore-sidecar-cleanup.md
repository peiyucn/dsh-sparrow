# 13 — 还原会话后不留回收站记账文件

> 定案 2026-09-12（验证 spec 12 时在路由级实测暴露）。纯本地文件卫生问题，不涉官方契约。

## 现象

`restoreTrashDir` 用 `rename(trashDir → sidecar.originalPath)` 把回收站条目搬回原位——但回收站目录里
除了会话日志与 `subagents/`，还有插件的记账文件 `dsh-archive-manage.json`（`TRASH_SIDECAR`）。
`subagents/` 子目录有清理，sidecar 没有，于是**还原后它会跟着落回用户的会话目录**：

```
~/.dsh/sessions/<project>/<session-id>/
  session.v3.jsonl.zstd
  dsh-archive-manage.json      ← 插件记账文件（标题 / 原工作区 id / 子会话原路径），不该留在这里
```

实测（临时目录造树 `p → c → gc`，trash 后 restore）：还原成功，`p`、`c`、`gc` 各回原处，
但 `p/dsh-archive-manage.json` 留在会话目录里。

本机当前 `~/.dsh/sessions/**` 没有该残留（owner 尚未在实测环境里做过还原），故无存量数据要清。

## 影响

- 用户数据目录被插件记账文件污染：官方会话日志导出/打包按目录取文件时会把它捎带出去，
  而它里面写着会话标题与原工作区记账 id（`workspaceIds`）——本插件的内部记账不该进用户导出物。
- 功能上无害：官方持久化只认 `session.v3.jsonl.zstd`，多一个 json 不影响读写；再次归档时
  新 sidecar 会覆盖它。故按「卫生问题」而非数据风险修。

## 修法

`rename` 成功后**立刻**删掉落进会话目录的 `TRASH_SIDECAR`（best-effort，失败只 `logger.warn`）。

两个顺序要点：

1. **必须在 `rename` 成功之后删**——若先删 sidecar 再 rename 失败，回收站条目会退化成
   「无 sidecar 的旧格式条目」（只可列出/删除、不可还原），把可恢复的会话变成不可恢复。
2. **必须排在 subagent 移回循环之前**（2026-09-12 发布前审计 S2）：subagent 移回失败会直接
   `throw`，清理原本放在链路末尾就永远不会执行，于是这条失败路径照样把 sidecar 留在会话目录里
   ——正是本节要消灭的污染。此刻条目已被 rename 走，提前删不会退化成旧格式条目。

**已知且有意保留**：subagent 移回失败时，`<会话目录>/subagents/` 与其中未移回的子会话目录会留在
原地（不清理）——那是那些会话**仅存的一份数据**，宁可在用户数据目录里留一个可见的 subagents/
子目录，也不能为了目录干净把它删掉。错误文案已明确「请勿重复还原」，配合面板可看到该会话已还原。

## 验收

- 路由级实测（spec 12 同一个临时脚本）：trash → restore 后会话目录内容为
  `session.v3.jsonl.zstd`（+ 各后代目录），无 `dsh-archive-manage.json`；回收站条目消失；
  父会话回归归档集。
- 失败路径实测（临时脚本故意让某条 subagent 移回失败）：返回 500「父会话已还原，但 subagent
  会话目录移回失败」，会话目录里**没有** sidecar（`subagents/` 按上节有意保留）。
- `npm run verify` 全绿。
