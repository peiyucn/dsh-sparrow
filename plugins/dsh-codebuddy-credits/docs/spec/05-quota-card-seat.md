# 05 · 额度卡落点：0.1.5 面板 API 迁移评估（2026-09-10）

> 状态：**待 owner 决策**；建议 **A（保持现状）**。本文件是 0.1.5-rc.1 适配时对
> 「额度卡是否迁到官方新面板 API」的评估与决策记录，所有契约按 checkout tag
> `dsh-v0.1.5-rc.1` 逐条核验（行号即当时核验位置）。

## 问题

0.1.5 新增了 `rightbar` / `sidebar.panellist` / `sidebar.right.*` 等槽位与「面板」注册 API。
额度卡当前挂在 `conversation.session.header.utilities`（order -10），展开的面板走 portal +
`position: fixed` 几何对齐。要不要借新 API 换成官方 seat？

## 事实（官方 dsh-v0.1.5-rc.1）

1. **`rightbar` / `rightbar.session` 不是「塞一块面板」的落点**：两者都是 `kind: 'single'`，
   注册即**替换整个右侧栏**（契约 `client/ui-sidebar-right/src/client/contract/slots.ts:42`；
   官方占位者 `RightbarRoot`/`RightbarSeat` 在 `client/ui-sidebar-right/src/client/index.ts:149-168`；
   槽位目录把它标为替换已发布 UI 的高风险项，`client/ui-layout/src/client/index.ts:80`）。
2. **`sidebar.panellist` 是左栏的全局面板图标行**（`kind: 'list'`、`scope: 'root'`，
   `client/ui-sidebar/src/client/contract/slots.ts:32`），正文要注册进中央栏 `main` keyed slot
   （`client/ui-layout/src/client/AppFrame.tsx:40-43`）；root 作用域、非会话维度，官方包内无产品级注册者。
3. **真正承载正文的是 `sidebar.right.pane.tab`**（keyed/session，注册只要 `key` = 类型 id，
   `contract/slots.ts:50-55`），配套 `ctx.sidebarRightTabs.register`（`tab-registry.ts:87-128,242-249`）
   与 `ctx.sidebarRight.openTab(kind)`（`service.ts:158,257-260`，会顺带展开右栏）。
   官方第三方范例：`client/ui-sidebar-files/src/client/index.ts:45-57`、
   `client/ui-sidebar-documentpreview/src/client/index.ts:98-113`。
4. **官方自己也没有「常驻可见」的 seat**：同类面板 `ui-cordis` 的 CordisPanel 同样是
   `getBoundingClientRect + position: fixed` 定位（`client/extensions/ui-cordis/.../CordisPanel.tsx:117,128-140,442-489`）。
   也就是说：我们现在的做法与官方同类实现同款——**不是**私有 seam，不违反 seam 纪律；
   它只是"官方没提供"的能力的自建，而非"官方提供了却被绕过"。
5. 上述槽位**全部是 0.1.5 新增**（与 `dsh-v0.1.2-rc.1` 的 `*/contract/slots.ts` 键集合差集核验；
   0.1.2 里 `ui-sidebar-right` 整包不存在；`conversation` / `conversation.details.tool` 在 0.1.5 已移除）。

## 选项

### A（建议）保持现状
额度卡继续挂 `conversation.session.header.utilities`（order -10），展开面板继续 portal + fixed。

- 成本：0；行为不变，与官方同类实现一致。
- 代价：DOM 级几何对齐代码留着（`src/client/CodeBuddyCreditsIndicator.tsx` 的 fixed/portal/`[data-phase]` 观察等）。

### B 迁到 `sidebar.right.pane.tab`
头部入口保留，点击改为 `ctx.sidebarRight.openTab(kind)`，正文作为普通流 block 渲染在右栏 tab 内。

- 收益：删掉一大片 DOM/fixed/portal 逻辑（清单见下），DOM 更干净。
- 代价：**UX 变差**——额度卡不再是"不点也能看见"，必须展开右栏；多标签/分栏/全屏、窄屏自动收起
  （`SidebarRight.tsx:364,377-379`）都会影响可见性；切到全局面板时 `rightbar.session` 子树不渲染。

### C 混合
头部保持现状；只把"展开的大面板"挪进 tab，头部仍显示摘要（账号/额度进度）。

- 收益：可见性损失小；删掉部分 DOM 逻辑。
- 代价：两套渲染路径并存，维护面反而变大。

## 若选 B/C：必须处理的事项

1. **禁止注册 guide 条目**：`client/ui-sidebar-right/src/client/contract/seed.ts:26-33` 规定引导页
   条目恰好 1 个时其 kind 成为新 pane 的默认 tab；当前唯一条目是 `ui-sidebar-files/definition.tsx:35-40`
   （默认开 Files）。插件再注册 guide 条目会把全局默认改回内置 guide。
2. **能力门 + 降级**：旧宿主没有 `ctx.sidebarRightTabs` 时正文会静默不出现，必须并入
   `src/compat.ts` 的能力门并按本插件既有 fail-safe 策略处理，不能带病运行。
3. **不得在 `apply` 顶层调用 `openTab`**：服务无 mounted seat 时会故意抛错。
4. **删除清单**（`src/client/CodeBuddyCreditsIndicator.tsx`）：`panelStyle`(:142-158)、
   `PANEL_MAX_WIDTH`/`EDGE_GAP`(:160-163)、`useHeroRoot` 的 `[data-phase]` MutationObserver(:168-197)、
   `point`(:217-223)、`position()` 的 `getBoundingClientRect` + `[data-conversation-scroll]` 钳制(:294-306)、
   document 级 mousedown/scroll/resize(:323-347)、portal 面板(:464-662)、`CodeBuddyCreditsHeroAnchor`(:667-704)
   及 `src/client/index.ts:217-223` 的 hero 注册；样式改吃 `.paneBody`（`dockkit.module.css:478-488`）。

## 决策记录

| 日期 | 决定 | 备注 |
| :--- | :--- | :--- |
| 2026-09-10 | **待 owner 决策** | 评估完成，建议 A（保持现状） |
