# 品牌方案 — Desk One / dsh-sparrow

> 状态：草案（2026-11-15）；图标 / 一句话 / 小工具分区标题已定（§1、§5）。其余待评审后执行。
> 范围：静态品牌位（资产、DSH 官方位、GitHub、市场站、npm、文案）；运行时 UI 不在本方案内。
> 依据：DSH 官方约束取自本机 checkout（0.2.2-rc.3）源码；标「未实测」的项在实现后按 §8 复核。

## 0 身份

| 层 | 名字 | 出现在 |
| --- | --- | --- |
| 发行方 / 合集 | **dsh-sparrow** | GitHub 仓库、npm scope `@dsh-sparrow`、市场索引 title、`dsh.pyai.site` |
| 产品 | **Desk One（同桌）** | 面板、插件 README、市场首卡、包名 `@dsh-sparrow/dsh-desk-one` |
| 随桌小工具 | dsh-chat-fim / dsh-codebuddy-credits / dsh-theme-tone | 根 README 次区、市场后续卡片 |

- 不改仓库名、不改 npm scope；两者都是发行方身份，不是产品名。
- 三个小工具按「随桌附送的三件小工具（单独安装）」呈现——它们是独立安装的包，不作随包依赖。
- 归档插件退役后，仓库只剩 Desk One + 三件小工具。

## 1 资产清单

| ID | 资产 | 文件 | 规格 | 用途 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B1 | 标志（透明） | `resources/brand/desk-one-mark.svg` | 24 viewBox；品牌蓝 `#4176E6`、墨色两版 | README、市场、社交图 | 待制作 |
| B2 | 应用图标 | `plugins/dsh-desk-one/icon.svg` | 512×512，圆角 22%，方底反白 | 插件管理器、市场卡 | **已定 B（方底反白）**，已入包 |
| B3 | 社交预览 | `resources/dsh-desk-one-social.png` | 1280×640 | GitHub Social preview | **已制作（2026-11-15）**：纯品牌卡，无截图，中英同图 |
| B4 | README 首图 | `resources/dsh-desk-one-hero.png` | 1600×900 | 根 README、插件 README 第一屏 | **已用真图合成（2026-11-15）**，深色 |
| B5 | 截图 ×5 | —（不进仓库） | 1440×900 原始素材 | 只作 hero 合成素材，放 TEMP | **已拍（隔离 demo）**，在 `TEMP/brand/shots/` |
| B6 | 演示 GIF | `resources/dsh-desk-one-demo.gif` | ≤5 MB，可选 | README | 可选 |
| B7 | 徽章 | README 内联 | DSH 版本（静态）、License、CI；npm 版本与下载首发后加 | 根与插件 README | 待制作 |

> README 与市场详情只放一张 hero；五个功能的原始截图只作合成素材，不进仓库。

注意：`check:plugin-docs` 要求根 README 保留 `| Plugin |`（中文 `| 插件 |`）表格与 `## Retired`（`## 已退役`）段，重构时不能删。

### 1.2 图片规格与截图流程

图片不是一张大拼图，而是一组固定规格、可复现的资产：

| ID | 图 | 尺寸 | 用途 |
| --- | --- | --- | --- |
| M1 | hero 主视觉 | 1600×900（深色） | README 第一屏、市场落地页 |
| M2 | hero 素材 ×5 | 1440×900（原始） | 合成 M1 用，不进仓库 |
| M3 | 社交预览 | 1280×640 | GitHub Social preview（文字烘焙在图里） |

- M2 清单（hero 素材）：便签墙 / 任务板 / 日程 / 笔记批注（笔记页 + 批注视图）/ 对话里的「和我说」预填。
- 构图优先级（2026-11-15 定，已按真图调整）：笔记批注（主面板）→ 批注视图 → 任务板 → 日程聚合 → 便签墙（浮层）；会话管理保留在标签栏与左侧功能名，不单独占浮层。
- 图片语言（2026-11-15 定）：中英同图（不是两套）；功能名用「中文 English」并列：笔记批注 Annotations / 任务板 Task board / 日程聚合 Schedule / 便签墙 Notes wall / 会话管理 Sessions。
- 演示数据：便签、任务、日程、会话标题一律用示例内容；截图取自隔离 demo（`TEMP/desk-demo`），**不得出现真实工作区名、路径、日历事件、会话标题**。
- 拍摄：浏览器窗口 1440×900、缩放 100%；需要 2x 时用 200% 缩放截取后缩回 1440 宽。
- 主题：只出深色（2026-11-15 定），README 不用 `<picture>` 切换。
- 合成：由脚本完成（HTML → 无头 Edge 截图），圆角、留白、字号可复现；hero 与社交图都使用真实界面截图，中文来自界面本身与左侧功能名。
- 最终落 `resources/`，README 用绝对 raw URL 引用。

## 2 DSH 官方品牌位

### 2.1 插件管理器图标（`package.json` 的 `icon`）

- 位置：插件包根，`"icon": "icon.svg"`。
- 约束：SVG / PNG / JPEG / WebP，≤256 KiB，必须落在包目录内（realpath 后）。
- 打包：加进 `files`，否则 npm 包里没有。
- 显示：插件管理器把图标转成 data URL 渲染（36–48 px 框）。

### 2.2 插件标题与描述（`locale/*.json`）

- `locale/en.json` 必需；其它语言文件同目录，文件名即语言 id（中文为 `zh`）。
- 结构：`{ "meta": { "title": "...", "description": "..." } }`，值必须是非空字符串。
- 回落：title 缺省用包名，description 缺省用 `package.json` 的 description。
- 暴露：`exports` 加 `"./locale/*.json": "./locale/*.json"`；`files` 加 `locale/*.json`。
- 已定值：`title` = `Desk One` / `同桌`；`description` = `A shared desk for you and your DSH harness: notes, tasks, a read-only calendar and AI-written notebook review in one panel.` / `和 DSH 共用的一张办公桌：便签、任务、只读日程，以及 AI 写、你审的笔记。`（§5.1 的一句话用于 README 首屏、市场卡与 GitHub description，不进插件管理器卡片）。

### 2.3 市场卡片（`market/index.json`）

- 字段：`title`（中英）、`description`（中英）、`icon`、`homepage`、`author`、`repository`。
- `icon`：data URL（base64 SVG/PNG/JPEG/WebP，解码后 ≤32 KiB）或 https / 同源 URL。**采用 data URL**，从 B2 源文件生成——这样不必改 Pages 产物（当前只发布 `index.json` 与 `landing.html`）。
- 生成：`scripts/market-index.mjs` 增加 Desk One 的视觉映射；`check-market-index` 补一条「Desk One 必须有 title 与 icon」。
- 注意：卡片要等首次发布后才出现（当前 registry 404）。

### 2.4 市场详情页

- 来源：插件 README（按索引里的 `repository` 目录读）。
- 图片：沿用仓库惯例的绝对 `raw.githubusercontent.com` URL（npm 包页与 GitHub 都需要绝对地址）。
- 可选：`locale/*.json` 的 `meta.detail` 指向专门文档；本期不做，避免第二份说明漂移。

## 3 GitHub

| 位置 | 内容 | 执行者 |
| --- | --- | --- |
| 仓库 description | `Desk One (同桌) — one desk for you and harness. Notes, tasks, read-only calendar and AI-written notebook review in one DSH panel; plus three small tools.` | agent（`gh api`，已上线） |
| Website | `https://dsh.pyai.site` | agent |
| Topics | `desk-one` `dsh` `dsh-plugin` `deepseek-harness` `notes` `tasks` `calendar` `plugin` | agent |
| Social preview | M3，1280×640 | **owner（网页上传）** |
| 根 README | Desk One 产品区 + 三件小工具表格 + 徽章 | agent |
| Issue 模板 | feature request（接「许个愿」）/ bug report | agent |
| 个人主页 pin | 置顶 dsh-sparrow | **owner** |

> `dsh-plugin` 是 DSH 官方推荐 topic，必须保留。2026-11-15 审计曾按本表旧列表覆盖 GitHub topics 时误删，已恢复；后续改 topics 必须把它带上。

## 4 市场站与 npm

- `market/landing.html`：Desk One 首卡（图标 + 首图 + 一句话 + 安装命令），三件小工具在下；页面 title 保持 `dsh-sparrow`。
- npm：`description` 换成英文一句话（市场卡英文描述取它）；`homepage` 设为 `https://dsh.pyai.site`；README 与插件 README 同一份。

## 5 文案

### 5.1 一句话

| 方案 | 中文 | 英文 |
| --- | --- | --- |
| A（延续现句） | 和 harness 共用的一张办公桌。 | One desk for you and harness. |
| B（列产物） | 便签、任务、日程、批注，一张桌子。 | Notes, tasks, schedule and annotations — one desk. |
| C（说协作） | 你写，它算；一张桌子上一起干。 | You write, harness works — at one desk. |

**已定：A。** 使用处：根 README 第一屏、插件 README、市场卡中文描述、GitHub description。

### 5.2 三个卖点

1. 一张桌子，不是五个页面：一个侧栏入口，标签页切换。
2. 和 DSH 一起：顶栏「和我说」把一句人话变成预填提示，便签、任务、笔记都能直接说。
3. AI 写、你批注：工作区文件 + 专用批注会话，逐行批注，改动对基线。

### 5.3 三件小工具的分区标题

**已定：** `随桌附送的三件小工具（单独安装）` / "Three more tools along with the desk (installed separately)"

### 5.4 市场卡标题

- en：`Desk One`
- zh：`同桌`

### 5.5 npm description（英文一句）

`Desk One — a shared desk for you and your DSH harness: notes, tasks, a read-only calendar and annotations on workspace files in one panel.`

## 6 执行顺序

1. phase 5 GUI 验收（截图前提）。
2. 资产：B1、B2（已入包）、B4（hero 合成）；M2 五张素材；B3 依赖 M2。
3. 包内元数据：`icon` / `locale` / `exports` / `files` → `verify`。
4. 市场生成器 + `landing.html` + 守卫 → `verify`。
5. README（根 / 插件中英）+ issue 模板。
6. GitHub 设置（agent）+ social preview / pin（owner）。
7. 首发 → 补 npm 徽章 → 复核市场卡。

## 7 风险与待定

- ~~B2 在 36 px 下的可读性~~：2026-11-15 对比图后选定 B。
- `locale/*.json` 与 `exports` 改动对现有构建的影响：已实测（2026-11-15 四插件 `verify` 全绿，打包含 `locale/*.json` 与 `exports`）。
- 市场卡与详情页要等首发后才能看真实效果。
- Social preview 只能网页上传。
- npm 徽章首发前不可用。
- 根 README 重构受 `check:plugin-docs` 约束（保留插件表格与退役段）。

## 8 发布前检查清单

- [ ] B1–B4 落地，README 全部引用可达（B1 待制作；B3/B4 已完成）
- [ ] `package.json` 的 `icon` / `files` / `exports` / `locale` 齐全，`npm pack --dry-run` 含这些文件
- [ ] 插件管理器显示 Desk One 图标与中英标题（GUI 复验）
- [ ] 市场索引含 Desk One 的 title / icon / homepage，守卫绿
- [ ] `landing.html` 有 Desk One 首卡
- [ ] GitHub description / topics / website / social preview / pin
- [ ] 根 README 与插件 README 中英同步，`check:plugin-docs` 绿
- [ ] `verify` + 根 `check` 全绿

## 9 进度（2026-11-15）

- 已落地：图标（B）+ `locale` 中英显示元数据 + 包内 `exports` / `files`；市场索引的 title / icon / homepage 与守卫；`landing.html` 首位卡；根 README 首屏；GitHub description / topics / website；issue 表单。
- 真图（2026-11-15）：`resources/dsh-desk-one-hero.png` 用隔离 demo 的五张 1440×900 截图合成并同名替换；`resources/dsh-desk-one-social.png` 改为纯品牌卡（1280×640，无截图），中英同图。
- 构图（2026-11-15 定，真图版）：hero 一张图内含大面板 + 四张浮层，README 只放这一张。
- 构图细节（2026-11-15 定）：主面板 = 笔记批注页；浮层 = 批注视图 / 任务板 / 日程 / 便签墙；会话管理保留在标签栏与左侧功能名；只出深色。
- 截图素材：`TEMP/brand/shots/`（隔离 demo，1440×900，合成用，不入库）；合成脚本 `TEMP/brand/hero-real.html`、`TEMP/brand/social-card-v4.html`。
- 待做：B1 透明标志仍未落到 `resources/brand/`；首发后补 npm 徽章并复核市场卡。
- 只能 owner 做：GitHub Social preview 上传、个人主页 pin。

