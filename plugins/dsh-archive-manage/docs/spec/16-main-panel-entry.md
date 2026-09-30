# 16 — 左栏入口改用官方「主面板」形态（`sidebar.panellist` + `main`）

> 提案 2026-09-30（owner：「官方**插件**/**自动化任务**这两个按钮，我感觉这是边栏位置的正确交互，
> 至少是官方引导的，点击后整个操作区域是对话区这块位置，所以是不是咱们的**归档管理**和
> **云端文件**也应该是这样？并且两个按钮位置是不是也应该放在**上面**而不是下面？」）。
>
> **状态：已实施（owner 2026-09-30 批准开工）** —— 仓库规矩「新功能先写 spec，评审后才开工」（AGENTS《工程管线 · 开发》）。
> 两个插件同批落地；实施结果与本文档的**决策点**对照见下方《实施记录》。
> 同批提案见 [`dsh-file-manage/docs/spec/03-main-panel-entry.md`](../../dsh-file-manage/docs/spec/03-main-panel-entry.md)。

## 一、现状 vs 官方（已查证）

| | 官方「插件」「自动化任务」 | 本插件现状 |
| :--- | :--- | :--- |
| 入口槽位 | `sidebar.panellist`（root list，渲染在品牌行之下、**会话列表之上 = 上面**） | `sidebar.footer.action`（渲染在 `footArea`、Settings 之上 = **下面**） |
| 点击后落点 | `ctx.layout.selectPanel(id)` → 内容渲染到**中央列（对话区位置）**的 `main` keyed 槽位 | 本插件自己的 `role='dialog'` 全屏遮罩弹窗，叠在页面上 |
| 身份 | 入口 id 与 `main` key **同一个** `MainPanelId` | — |

证据（本机 checkout `~/.dsh-launcher-panel/source`，tag `dsh-v0.2.0-rc.2`）：

* `ui-sidebar/src/client/SidebarRoot.tsx:280` `<nav className={css.panelList}>`（上面）；
  `:307` `renderSlot('sidebar.footer.action')` 在 `footArea`（下面）。
* `ui-sidebar/src/client/contract/slots.ts:35,38`：`sidebar.panellist` 是 list 槽，
  同一 id 寻址布局的 `main` keyed 槽。
* `ui-plugin-manager/src/client/index.ts:109-145`：`main` 注册（`key: PANEL_ID`）+
  `sidebar.panellist` 注册（`order: 0`，图标组件 `PluginsPanelIcon`）。
* `ui-schedule/src/client/index.ts:168-184`：同形，`order: 10`。
* `ui-layout/src/client/AppFrame.tsx:40-42`：`MainPanel` → `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })`。

⇒ owner 的判断成立：这是官方引导的形态，且**我们两个插件都是「全局功能」**，放 `footer.action`
（本意是「设置旁边的次要动作」）确实是错位。

## 二、为什么值得改

1. **落点对**：管理类页面占中央列，窗口够大时列表/树好用得多（归档树尤其明显）。
2. **分区对**：`panellist` = 与会话无关的全局面板；`footer.action` = 设置旁的次要动作。
3. **与官方共存不打架**：`plugins` = order 0、`schedules` = order 10，我们插 20/21（= 现在 footer 用的号）。

## 三、契约细节（实现前逐条核）

* 必须**同时**注册两处、共用同一个 id（`MainPanelId` 是 brand 字符串）：`main` keyed 槽 + `sidebar.panellist` list 槽。
* 需要 `ctx.layout.selectPanel`。⚠️ **不要**把 `layout` 写进 `inject` —— client half 的 entry 停在
  pending 即被 boot 审计判**致命**（宿主整页 Failed to load plugins）。按 theme-tone 既有做法用
  `ctx.inject(['layout'], cb)` 起**可选依赖 fork**：服务缺失就整条不注册（惰性停用），**不抛错**。
* type-only 声明宿主槽位：`@deepseek-ai/dsh-client-ui-layout/client`（`MainPanelId`）、
  `@deepseek-ai/dsh-client-ui-sidebar/client`（`sidebar.panellist`）；图标可用 `@deepseek-ai/dsh-client-ui-primitives`。
* devDependencies 补 `@deepseek-ai/dsh-client-ui-layout` / `-ui-sidebar`（`0.2.0-rc.2`，npm 上均已发布，已核）。
* 页面组件是**中央列正常流**，不再是 fixed 遮罩 ⇒ 现有 `role='dialog'` / `aria-modal` /
  「点遮罩关闭」/ Esc 关闭等交互要按页面重写（不再是模态语义）。

## 四、⚠️ 已知**不**被本改动解决的问题（必须让 owner 知道）

**Windows 桌面端左栏收起时，官方把 `panelList` 整个 `display: none`**：

```
SidebarRoot.module.css:82-86
:global([data-windows-titlebar]) .collapsed .panelList,
:global([data-windows-titlebar]) .collapsed .regionArea,
:global([data-windows-titlebar]) .collapsed .footArea { display: none }
```

⇒ 移到上面**并不能**修好此前记录的「桌面端收起左栏后归档/云文件点不到」：那一档**两种入口都不可达**
（现在被这条同时关掉的是 `panelList` 与 `footArea`）。要修得另议（本插件在收起态往 caption 行挂图标，
或请官方放开该规则）。

## 五、决策点（请 owner 拍板）

1. **是否保留弹窗**？改主面板后，「扫一眼就关」变成「切视图再切回」。
   建议两个插件都改；若你更想保留轻量弹窗，可只改归档。
2. **回对话的路径**：官方靠点左栏会话项（`ui-workspace/src/client/navigation.ts:372` `selectPanel(null)`）；
   官方 `PanelRow` 点**已选中**项仍是 `selectPanel(id)`（不回退）。
   是否额外做「点已选中的面板图标 = 回对话」？那要拦官方行点击（私有 seam）—— **建议不做**，沿用官方路径。
3. 归档的**树**在中央列是否需要新的布局尺寸（现按弹窗尺寸设计）。

## 六、验收（实施时）

* 两处注册 id 一致；`main` 未注册时点图标**不改变当前选中态**（官方 `selectPanel` 抛错并保留原选择）。
* `layout` 缺失时插件**静默不注册**（不抛错、宿主正常启动）—— 补惰性停用用例。
* 收起/展开左栏、切换会话、反复 enable/disable 插件后无残留、无重复项。
* **host half 与 HTTP 路由完全不动**（本次只改 client 入口与视图承载）。
* 复核 theme-tone 的 dialog / surface 锚点是否因此失去命中，并同步。

## 七、实施记录（2026-09-30）

按本文档落地；与上面《决策点》《验收》逐条对照：

| 项 | 落地 |
| :--- | :--- |
| 决策点 1（是否保留弹窗） | **两个插件都不保留**。owner 定案：「归档管理和云端文件可以改了，**不保留弹窗**，和官方行为保持一致，也不做返回对话。」 |
| 决策点 2（回对话的路径） | **不做**「点已选中的图标回对话」。官方 `PanelRow` 点已选中项仍是 `selectPanel(id)`，我们**没有**拦截官方行点击 —— 回对话沿用官方路径（点侧边栏会话项 / New Session）。 |
| 决策点 3（树的尺寸） | 树全部用**固定缩进 + flex 弹性标题**（`.dsh-archive-tree-children` 的 `margin-left` / `padding-left` 是定值，标题 `minWidth: 0` + 省略号），与容器宽度无关 ⇒ 中央列更宽不会破布局。内容列另加 `max-width: 960px`（官方入口型页面同款）。 |

实施细节：

* 两处注册共用同一个 `MainPanelId`（`archive-manage` / `file-manage`），
  order 沿用原 footer 号段（20 / 21，排在官方 `plugins`=0、`schedules`=10 之后）。
* `layout` **没有**进 `inject`：走 `ctx.inject(['layout'], cb)` 起的可选依赖 fork
  （`src/client/panel.ts` 的 `attachMainPanel`），服务缺席即整条不注册、不抛错。
  该模块零运行时依赖，故惰性停用接线有 `test/panel.test.mjs` 直接覆盖。
* 页面改为中央列的**正常流**：去掉 `position: fixed` 遮罩、`role='dialog'` / `aria-modal`、
  点遮罩关闭、焦点陷阱与关闭按钮；标题行自带 28px 顶内边距 + `data-window-drag`
  （macOS 下再让出 `--dsh-frame-top-clearance`），无遮罩后页面顶端就是窗口边缘。
* **二次确认框改用官方 `Modal` 原语**（原文写着「保留既有确认框」与「不得留 dialog」
  相互冲突 —— 指的都是**面板那层弹窗**；确认框属于「确认流程」，
  与官方 `ui-schedule` / `ui-plugin-manager` 在各自主页面里做确认的做法统一）。
  确认流程、文案与按钮语义**逐字未变**，只把自建遮罩 / `aria-modal` / 点遮罩关闭 /
  焦点陷阱换成了官方原语提供的那一套。
* `ctx.layout.panelInfo.subscribe(...)` **未使用**：本页的状态全是组件内 state，
  离开面板即随 keyed 槽卸载而复位（官方 plugin-manager 需要它是为了重置存在 store 里的 `view`）。

### ⚠️ 交给 owner / 另一路（不在本插件写域内）

1. **theme-tone 的 `DIALOG_ANCHOR`（`body [role='dialog']:not(:has(> img))`）
   从此不再命中这两个插件的页面** —— 它们不再是 dialog。后果：色调插件的
   颗粒 / 打光两张图层规则（`SURFACE_ANCHORS` + `isolation: isolate` 那条）对
   **归档页 / 云端文件页**失去命中，页面退回官方纯色面（颜色仍由 token 层给）。
   该文件归另一路（`plugins/dsh-theme-tone/**`），本插件不动它，留待其同步。
   **二次确认框不受影响**：它现在是官方 `Modal`，遮罩带官方 `_mask` 哈希类、
   卡片是 `role='dialog'` ⇒ 两条锚点照旧命中。
2. theme-tone `src/mask.ts` 头部注释里「本仓库 `dsh-archive-manage` / `dsh-file-manage`
   的遮罩是 `role="presentation"` + 内联 `backdrop-filter`」那句**已过期**
   （我们的确认框现在走官方 `Modal`）。同样不在本写域内。
3. **Windows 桌面端收起左栏时 `panelList` 整个 `display: none`**（本文档 §四）——
   本次改动**没有**修好这一点，仍是「收起态两种入口都不可达」。
