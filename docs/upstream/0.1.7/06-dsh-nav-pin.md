# 06 · dsh-nav-pin — **大概率零代码改动**

## 1) 定位与结论

纯 CSS 注入：官方「轮次导航」在窄对话列（≤900px）会消失，本插件让它 ≤700px 仍可 hover 浮现。
**结论：官方本版仍在窄列隐藏导航（无原生替代），插件不退役；真机上样式表已正常注入，aria-label 文案未变 —— 大概率只需补一条实机断言，不改代码。**

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ✅ 无功能、无依赖 | `src/host.ts` 空实现 |
| client | ✅ CSS 已注入 | 真机：`style[data-dsh-nav-pin]` 存在（2556 字节规则） |

**契约面**：

* 官方断点未变，仍隐藏导航（rc.2 与 alpha.2 的 `ui-chat/src/client/chat/TurnNavigator.module.css` 断点逐字一致）。
* aria-label 文案**未变**：`chat.turnNavigation.label` → zh「轮次导航」/ en「Turn navigation」（`packages/client/ui-chat/src/client/locale.ts:69,227`；发射点 `TurnNavigator.tsx:235-237`）。
* 我方选择器链 `[data-conversation-scroll] div:has(> nav[aria-label=…])` 结构上仍成立（`data-conversation-scroll` 锚点保留：`ui-conversation/.../ConversationContent.tsx:189`）。
* ⚠️ 官方本版把 `TurnNavigator` 重写了 371 行 —— DOM 层级需实机核对，不能只靠源码阅读。

## 3) 改动清单

1. 实机断言：`querySelectorAll('[data-conversation-scroll] div:has(> nav[aria-label="轮次导航"])')` 非空（多轮会话下）。
2. 行为级回归：窗口缩到 ≤700px 时导航默认隐身、hover 浮现；≥900px 与官方行为一致。
3. 依赖升线（共同面；本插件无官方运行时依赖，仅 devDependencies 与 bundle external 白名单）。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **是否顺手加固**：把选择器写成对 DOM 变化更钝的形态（例如不再依赖「nav 的直接父元素是 div」，改用 `[data-conversation-scroll] nav[aria-label=…]` 的祖先定位 + 更高特异性压制官方隐藏规则）。加固会牺牲一点精确性，收益是抗官方结构微调。
2. **退役触发条件**：官方若把窄列行为改成「不隐藏」或提供公开的显示开关，本插件即退役 —— 是否现在就把这条写进 spec/README（我建议写）。

## 5) 验收口径 / 未核实项

* 真机验收：多轮会话下 ≤700px hover 浮现、≥900px 无差异、无新增滚动条。
* 未核实：alpha.2 `TurnNavigator` 重写后的实际祖先链（需实机 `querySelectorAll` 断言，列在 P0-6）。
