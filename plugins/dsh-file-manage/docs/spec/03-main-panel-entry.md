# 03 — 左栏入口改用官方「主面板」形态（`sidebar.panellist` + `main`）

> 提案 2026-09-30。**完整论证、官方源码证据、决策点与验收见**
> [`dsh-archive-manage/docs/spec/16-main-panel-entry.md`](../../dsh-archive-manage/docs/spec/16-main-panel-entry.md)
> —— 两个插件同批、同一形态，不各写一套。
>
> **状态：已实施（owner 2026-09-30 批准开工）**（仓库规矩：新功能先写 spec，评审后才开工）。
> 实施结果与共享 spec《决策点》的对照见那边新增的《实施记录》。

## 本插件部分（结论）

* 现状：`sidebar.footer.action` 注册 `FileManageDock`（左栏**底部**、Settings 上方），
  点击打开本插件自建的 `role='dialog'` 全屏遮罩弹窗。
* 改为：`sidebar.panellist`（**上面**，order 21）+ `main` keyed 槽（同一 `MainPanelId`），
  页面在**中央列**渲染。
* 视图从「模态弹窗」改写为「页面」：去掉遮罩、`aria-modal`、「点遮罩关闭」与焦点陷阱；
  也不再拦 Esc（页面语义下 Esc 不关页面，回对话走官方那条路）。
* `inject` **不加** `layout`；用 `ctx.inject(['layout'], cb)` 起可选依赖 fork，缺失即整条不注册（惰性停用、不抛错）。
* host half 与 Files API 路由**完全不动**；`deleteApi` 等注入面照旧。
* 详见共享 spec 的《契约细节》《已知不解决的问题》《决策点》《验收》与《实施记录》各节。

## 本插件实施记录（2026-09-30）

* 新组件：`src/client/CloudFilesPage.tsx`（页面）、`src/client/CloudFilesPanelIcon.tsx`（左栏图标）、
  `src/client/panel.ts`（与 archive 同形的可选依赖 fork 装配）；旧 `FileManageDock.tsx` 已删除。
* 删除确认改用**官方 `Modal` 原语**（与官方 `ui-schedule` / `ui-plugin-manager` 的做法一致）：
  确认流程与文案逐字未变，只把自建遮罩 / `aria-modal` / 点遮罩关闭换成了官方那一套。
* 首屏 ready 门的**初值**改为 loading（挂载即打开 ⇒ 不再有「点击处理器里同批置位」这一步）；
  `test/structure.test.mjs` 的那条首帧守卫已按新形状改写。
* theme-tone 的 `DIALOG_ANCHOR` 从此**不再命中本页面**（不再是 dialog）——后果与归属见共享 spec
  《实施记录 → 交给 owner / 另一路》第 1 条。
  ⚠️ **2026-10-03 复核：那条「后果」推断不成立、已结清** —— 锚点确实不再命中，
  但本页自己是**透明**的（`background-color: rgba(0,0,0,0)`），而 theme-tone 的
  `position: fixed` 地面层在其后铺满视口 ⇒ 质感与打光**照旧在**（真机像素实测：
  与对话区地面的亮度 / 颗粒 / 暖度三项同值）。详见
  [共享 spec 第 1 条](../../dsh-archive-manage/docs/spec/16-main-panel-entry.md) 与
  [`docs/upstream/audit-2026-10-03.md`](../../../../docs/upstream/audit-2026-10-03.md) §3。
