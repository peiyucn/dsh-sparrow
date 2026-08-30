# 03 · 建议展示改版 — @ 列表样式候选菜单

> 决策记录（2026-08-30，用户拍板）：真·框内渲染因插件边界无法实现；建议展示从「portal 幽灵文本」改为官方 @ 候选菜单同款悬浮卡。

## 背景与结论

* 输入框是 shell 私有 Lexical 编辑器，插件边界外拿不到编辑器实例（`ComposerKeyboard.editor` 源码标注 package-internal，永不跨插件边界）。往文档插真实文本会污染草稿/undo/发送序列化，往 contentEditable 塞裸 DOM 会被 Lexical reconcile 清掉——真·框内渲染需要官方新 seam，当前不可行（详查证见 `dsh-sparrow` 会话记录与 ui-conversation 源码）。
* 官方 @ 候选菜单 = 渲染进 `conversation.input.overlay` 槽的卡片（ui-input-trigger/MenuView）；shell 用 `.overlayAnchor`（`position:absolute; inset:0 0 auto; height:0`，钉在 composer 卡片上沿、与卡片同宽）承载，菜单自身 `position:absolute; bottom:calc(100%+4px); left:0; right:0`，高度经公开原语 `useAnchoredMaxHeight` 钳制——**零定位 JS、零 portal、零 caret 测量**，窄宽度兼容由「菜单钉满卡片宽 + 行内省略号」按构造保证。
* 决定：FIM 建议以同款菜单卡展示；`composer.dock` 组件退为纯数据面（拿草稿快照 → 请求 → 写共享 store），`conversation.input.overlay` 槽新注册菜单视图组件（overlay 槽无 InputZone 分享，靠共享 store 桥接，模式同开关 ↔ dock）。

## 交互契约

* 触发/作废状态机不变：停顿 ≥ `TRIGGER_PAUSE_MS`、IME 组合态压制、`draftRev` CAS 防陈旧、同一草稿单在飞请求、phase 非 plain 不展示；
* 展示：建议到达且开关开启且主模型支持 → 菜单卡出现在输入框上方：
  * 卡：官方 MenuDropdown 视觉 token（12px 圆角、`--dsw-specific-menu` 底、`--dsw-shadow-lv3`、内边距 4px；行 40px 高、10px 圆角、高亮 `--dsw-alias-interactive-bg-hover`）；**边框为开关 on 态同款紫色（`--dsw-alias-button-info-fill`）**，与官方 @ 列表做视觉区分（2026-08-30 用户要求）；
  * 行尾键位提示：官方 drillHint 同款（caption 色文字 + 圆角键盘帽）——「采用 Tab · 丢弃 Esc」右对齐（2026-08-30 用户要求）；
  * 建议长句：行内 **2 行 line-clamp**（超出省略），悬停 `title` 给全文；
  * 高度：`useAnchoredMaxHeight` 钳在 composer 上方可用空间；
* 采用：Tab（capture 监听，焦点保持在输入框）或 mousedown 点选（preventDefault 防焦点抢夺）→ `slash/input-insert-text` bail 事件追加草稿（span 取自共享快照的 draft/draftRev，CAS 判定）；Esc 丢弃；继续输入/发送/切会话清空；
* 开关（input.left）：火花图标 + 「Suggest/续写」标签，关闭态标签**删除线** + 灰字、开启态紫色；**窄行折叠为纯图标**——官方 PermissionSelect 同款匿名 `@container (max-width: 460px)` 规则（容器为 InputBar `.row`，查证见 InputBar.module.css:214 / PermissionSelect.module.css:68）（2026-08-30 用户要求）；
* 联想中指示：开关胶囊显示 busy；紫色旋转光环保留在 composer 卡片外圈（dock 组件渲染，portal 到 body）。

## @ 列表冲突规避（硬约束）

* 官方触发菜单（@/斜杠候选列表，InputTriggerService）打开期间，本菜单**必须完全隐藏，且 Tab 不得采用**（官方菜单的 Tab 是「下钻」键，键位冲突）；
* 检测：官方菜单打开时渲染带 `[data-trigger-menu]` 标记（ui-input-trigger/MenuView.tsx 查证）；本菜单组件渲染时检查该标记，并以 MutationObserver 观察 overlay 锚点子树（观察范围仅本组件所在锚点）实时增删；`[data-trigger-menu]` 存在 ⇒ 本菜单不渲染、采用键无效；
* 用户输入 `@`（或 `/`）打开官方列表期间，FIM 请求不中断（结果照常写 store），官方菜单关闭后建议按状态机恢复显示；
* 可选收紧（M3 再评估）：检测到触发菜单打开时挂起新请求。

## 验收标准

* [ ] 输入草稿停顿后，建议以官方同款菜单卡出现在输入框上方；Tab/点选采用追加草稿；Esc 丢弃；
* [ ] 输入 `@`（或 `/`）打开官方候选列表时，本菜单完全不出现；官方菜单关闭后恢复；
* [ ] 窄窗口（实机 ≥730px）下菜单不横向溢出、长建议 2 行截断；
* [ ] 幽灵文本 portal、文末 caret 测量、fallback 胶囊全部删除；`npm run verify` 全绿。
