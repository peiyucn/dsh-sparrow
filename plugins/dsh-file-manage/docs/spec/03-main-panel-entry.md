# 03 — 左栏入口改用官方「主面板」形态（`sidebar.panellist` + `main`）

> 提案 2026-09-30。**完整论证、官方源码证据、决策点与验收见**
> [`dsh-archive-manage/docs/spec/16-main-panel-entry.md`](../../dsh-archive-manage/docs/spec/16-main-panel-entry.md)
> —— 两个插件同批、同一形态，不各写一套。
>
> **状态：待 owner 确认后开工**（仓库规矩：新功能先写 spec，评审后才开工）。

## 本插件部分（结论）

* 现状：`sidebar.footer.action` 注册 `FileManageDock`（左栏**底部**、Settings 上方），
  点击打开本插件自建的 `role='dialog'` 全屏遮罩弹窗（`FileManageDock.tsx:274-277`）。
* 改为：`sidebar.panellist`（**上面**，order 21）+ `main` keyed 槽（同一 `MainPanelId`），
  页面在**中央列**渲染。
* 视图从「模态弹窗」改写为「页面」：去掉遮罩、`aria-modal`、「点遮罩关闭」与焦点陷阱；
  Esc 是否仍关闭该页面需在实施时确认（页面语义下通常不拦 Esc）。
* `inject` **不加** `layout`；用 `ctx.inject(['layout'], cb)` 起可选依赖 fork，缺失即整条不注册（惰性停用、不抛错）。
* host half 与 Files API 路由**完全不动**；`deleteApi` 等注入面照旧。
* 详见共享 spec 的《契约细节》《已知不解决的问题》《决策点》《验收》四节。
