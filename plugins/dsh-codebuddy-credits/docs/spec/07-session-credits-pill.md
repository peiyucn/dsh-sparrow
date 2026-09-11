# 07 · 会话积分改官方同款胶囊 + 可展开明细（2026-09-11）

> 需求由 owner 提出（「对话框下面那个当前对话积分消耗总结风格跑偏、放在整个界面里突兀」），
> 三选一方向由 owner 当次选定为**对齐官方做成第三颗同款胶囊 + 点击展开会话明细面板**。
> 官方契约按本机 checkout `dsh-v0.1.5-rc.2` 逐条核验（行号即核验位置）。

## 问题

旧实现（`39b0e49` → `cc6ffc1`）把一段**纯文字 + `|` 分隔符**追加进官方统计行：

```
{轮数} 轮 {步数} 步 · {tps} tok/s | CodeBuddy 积分 20.31 · 83 次调用
```

它在官方 **0.1.5-rc.2** 里必然突兀——官方那一版把统计行从「单行文字」整体换成了
**一排图标胶囊**（`StatsPills.tsx`，commit `3997f36999`「replace the stats strip with two
icon pills and click-open stat dialogs」，删除了旧的 StatsLine）。于是我们的纯文字段
挂在两颗胶囊旁边：字号/色彩/交互层级都不一样，且**不可点击**（官方两颗都能点开弹层）。

## 官方事实（决定设计）

1. 统计行 = `[data-composer-stats]` 的 flex 行，`gap: 12px`，行内继承 13/20 字号行高
   （`StatsPills.module.css:5-16`）；每颗胶囊 `.pill` = `inline-flex` + `gap 6px` +
   `padding 1px 8px` + `border-radius 24px` + `tertiary` 文案 + hover 提亮
   （`StatsPills.module.css:24-57`），图标 14px（`:41-45`）。
2. 两颗胶囊都**可点击展开弹层**，弹层皮肤走共享的 `stat-dialog.module.css`（menu 表面、
   r12、elevation-prominent、12/18 正文；标题行 + 细线 + 两列 `dl`）。
3. 挂载点仍是 `conversation.composer.dock`（`ui-conversation/.../InputBar.tsx:569-571`），
   官方 `StatsPills` 以 order 0 注册（`ui-chat/src/client/apply.ts:165-168`），我们在 order 1。
4. **`stat-dialog.ts` / `StatsPills.module.css` 不在插件 import 面内**（官方 client 入口只
   导出 `apply`），所以材质只能按配方复刻；但底层 primitive 是公开的——
   `useAnchoredPosition` / `useDismissOnOutsidePointer` 属 `dsh-client-ui-primitives`
   （已在插件的 devDependencies 与 bundle external 列表内）。
5. 官方每步重渲染会丢弃注入节点（既有事实，`cc6ffc1` 已记）：portal 目标必须每渲染重新解析。

## 方案

**把那段文字换成官方同款的第三颗胶囊**（品牌标 + 「积分 N · M 次调用」），portal 进官方行末尾：

- 尺寸/色彩/圆角/hover 全部照抄官方 `.pill` 配方（含窄屏省略号处理），随官方行字号缩放；
- 点击展开 `CreditDialog`（官方 `stat-dialog` 同皮）：标题「本会话积分消耗」+ 总值，
  两列明细 = 调用次数 / 每次调用（按模型聚合，复用 host `/session-usage` 已有的 `byModel`，
  **无 host 改动**）；
- 定位与关闭走官方同款公开 primitive（`side:'top'`、`gap 8`、`margin 12`）+ Esc。

**注入节点归 React 所有**：`createPortal` 把一枚 React `<button>` 挂进官方行——事件、
aria、开合状态都由 React 管；官方行丢节点后，on-render 的 effect 重新解析落点并重挂。
只 append 自有节点，不包装、不替换任何官方子节点（护栏与既有 seam 纪律一致）。

**顺手去掉三处重复**（本次引入共享件的直接收益）：

| 新文件 | 职责 |
| :--- | :--- |
| `client/CodeBuddyMark.tsx` | 品牌标（原 `CODEBUDDY_ICON` 字符串 → JSX；不再有 `dangerouslySetInnerHTML`） |
| `client/CreditDialog.tsx` | 积分弹层皮肤（本轮/本会话共用，官方 `stat-dialog` 同配方） |
| `client/statDialog.ts` | 触发件锚定座（`useCreditStatDialog`：定位 + 外点关闭 + Esc） |
| `client/boundedCache.ts` | 有界 Map（纯逻辑；原在 `CodeBuddyCreditsStats.tsx` 内） |

`boundedCache.ts` 独立出来的**直接原因**：`CodeBuddyCreditsStats.tsx` 现在 import 了
`ui-primitives`，而后者在 Node 单测环境缺 `clsx`——纯逻辑与 React 组件混在一个模块里会让
单测被迫拖入浏览器依赖。拆开后单测只 import 纯逻辑（`test/client-cache.test.mjs`）。

## 行为差异（诚实记录）

- 文案从「CodeBuddy 积分 N · M 次调用」缩短为「**积分 N · M 次调用**」：胶囊里品牌标已经
  承担了「哪家」的信息，重复写 CodeBuddy 会把胶囊撑得比官方两颗长得多（官方胶囊文案是
  「N 轮 M 步」「1.2M · 缓存命中 96%」这种量级）。英文同理（`Credits N · M calls`）。
- 该会话**没有** CodeBuddy 调用时依旧完全不注入（官方行保持原样），与本改动前一致。
- 弹层数据仍为进程内记账（重启 dsh 清零），与既有 README 口径一致。

## 涉及文件

- `src/client/CodeBuddyCreditsStats.tsx`：重写为 portal 胶囊 + 弹层
- `src/client/CodeBuddyTurnCredit.tsx`：改用共享件（行为不变）
- `src/client/{CodeBuddyMark,CreditDialog,statDialog,boundedCache}.ts(x)`：新增
- `src/client/format.ts`：`formatCredits` 提为导出（三处共用一份口径）
- `src/client/index.ts` + `slot-contract.d.ts`：locale 词条（`stats.sessionCreditsAria` /
  `stats.sessionCreditsTitle`）；`stats.sessionCredits` 文案调整
- `test/format.test.mjs`：补 `formatCredits` 用例
- `test/client-cache.test.mjs`：改 import 来源（纯逻辑模块）
- 根 `AGENTS.md`：私有 seam 特例概括同步（统计段 → 同款胶囊）

## 验证

- 插件 `npm run verify`（typecheck + build + bundle + 99 测试 + pack）全绿；
- **GUI 目视已确认（2026-09-11，owner 在真实浏览器截图复核）**：胶囊作为第三颗与官方
  两颗同排同材质（官方行的 12px gap 生效），弹层为官方 stat-dialog 同皮、锚在胶囊上方；
  数据自洽（`2.30 + 48.51 = 50.81`、`3 + 286 = 289`，与 host `/session-usage` 的
  `byModel` 聚合一致）。web profile 为 `link:` 直连本仓库，`lib/` 重建后刷新即生效。
- 过程中的一条弯路（记下来免得重蹈）：曾试图用 obscura 引擎做目视验证，页面能加载、
  cookie 认证与 WS 均正常，但应用不发任何数据请求、主入口 bundle 报 0B，侧栏停在
  「Loading workspaces…」，排查未收敛即由 owner 叫停。**结论：该 GUI 的目视验证走真实
  浏览器（owner 本机）即可，不必再投入 obscura 方向。**
