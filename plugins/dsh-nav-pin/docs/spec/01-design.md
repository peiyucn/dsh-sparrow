# 01 · 设计 — dsh-nav-pin

> 本文是 seam 查证 + 架构提案；「待查证」条目未确认，开工前需补查。

## DSH seam 查证结论（已 grep 源码确认，dsh 0.1.2-alpha.3，HEAD dd6322d604）

* **定位选择器**：对话滚动体公开 DOM 标记 `[data-conversation-scroll]`（`ui-conversation/src/client/skeleton/ConversationRoot.tsx`）；轮次导航 nav 的 aria-label = `轮次导航`（zh，`ui-chat/src/client/locale.ts:32`）/ `Turn navigation`（en，`:149`）。
* **唯一性**：滚动体内另一个 nav 是「会话层级」面包屑（`会话层级` / `Session hierarchy`，`ui-conversation/src/client/locales.ts:69/219`），标签不同不会误伤；模板 `nav[aria-label=…]` 只命中轮次导航。
* **结构**：`[data-conversation-scroll] 内 div.slot > nav[aria-label]`（slot 为 nav 的直接父元素，`TurnNavigator.tsx:147`）；slot `position: sticky; height: 0; pointer-events: none`，frame `position: absolute; width: 28px; pointer-events: auto`（`TurnNavigator.module.css`）。
* **特异性**：官方隐藏规则 `.slot` 为 (0,1,0)；插件覆盖规则（`[data-conversation-scroll]` 属性 + `:has()`）为 (0,2,2) 起，压得过，无需 `!important`。
* **`:has()` 先例**：官方样式已大量使用（如 `ConversationRoot.module.css:275`），浏览器支持无虞。
* **容器查询**：插件样式表里的 `@container (max-width: 700px)` 与官方一样解析到 ChatView `.scroll`（最近的 inline-size 容器），断点语义与官方同源。
* **渲染门槛**：官方 rail 在 `items.length < 2` 时不渲染（`TurnNavigator.tsx:129`，items 含已翻页的旧轮次标记）——单轮会话没有导航可显，插件不改变该门槛。
* **宽度轴（钳制用）**：`--dsh-chat-content-width` 定义在 ConversationRoot 根（`.root`，公开属性 `data-phase`）——`var(--dsh-chat-user-width, clamp(680px, calc(var(--dsh-conversation-column-width, 0px) * 0.64), 920px))`，用户拖宽经内联 `--dsh-chat-user-width` 整体替换；消费点：消息列 `.column`、拖拽条 `.widthHandle`（公开属性 `data-width-handle`，定位 `50% ± W/2 + 24px`、宽 `min(40px, (100% - W)/2 - 48px)`）、输入卡片（`--dsh-composer-card-max-width = W + 32px`，`InputBar.module.css:22/41` 消费）。官方拖宽上限 = 每侧 88px（`CONTENT_EDGE_BUDGET 176`），拖拽条 z-index 8 高于导航 z-index 6，拉到最宽时二者命中区重叠（owner 实测）。

## CSS 骨架（提案）

```css
/* 1) 全宽度压过官方 900px 隐藏规则（等效断点 700px） */
[data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"]),
[data-conversation-scroll] div:has(> nav[aria-label="轮次导航"]) {
  display: block;
}

/* 2) ≤700px：默认隐身（保留指针命中），hover / 键盘 focus 浮现为浮层 */
@container (max-width: 700px) {
  [data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"]) > nav,
  [data-conversation-scroll] div:has(> nav[aria-label="轮次导航"]) > nav {
    opacity: 0;
    transition: opacity 120ms ease-out, height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* 命中区：frame 自身（28px 轨道）+ ::before 向左扩 16px */
  [data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"]) > nav::before,
  [data-conversation-scroll] div:has(> nav[aria-label="轮次导航"]) > nav::before {
    content: '';
    position: absolute;
    inset: -8px 0 -8px 16px;
  }

  [data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"]) > nav:hover,
  [data-conversation-scroll] div:has(> nav[aria-label="轮次导航"]) > nav:hover,
  [data-conversation-scroll] div:has(> nav[aria-label="Turn navigation"]) > nav:focus-within,
  [data-conversation-scroll] div:has(> nav[aria-label="轮次导航"]) > nav:focus-within {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* 去掉 opacity transition */
}
```

实测结论（owner 拍板）：浮层不做面板框——只 opacity 淡入，无底色 / 边框 / 圆角 / 阴影，与官方宽屏轨道形态一致；高度过渡与官方 `.frame` 并列声明（复刻 `height 220ms`）。

```css
/* 3) 会话内容最大宽度钳制（每侧留白 88 → 160px） */
[data-phase] {
  --dsh-nav-pin-official-width: var(--dsh-chat-content-width);
}
[data-conversation-scroll],
[data-width-handle] {
  --dsh-chat-content-width: min(
    var(--dsh-nav-pin-official-width),
    max(640px, calc(var(--dsh-conversation-column-width) - 320px))
  );
}
[data-conversation-scroll] {
  --dsh-composer-card-max-width: calc(var(--dsh-chat-content-width) + 32px);
}
```

## seam 特例（写入插件 AGENTS.md）

* 只读依赖两个公开 DOM 标记（`[data-conversation-scroll]` + nav aria-label 两套文案）；官方改文案 / 结构需插件升级，AGENTS.md 记录所适配 dsh 版本。
* 宽度钳制依赖 `[data-phase]` / `[data-width-handle]` 公开属性；官方宽度值经 `[data-phase]` 上的 `--dsh-nav-pin-official-width` 捕获中转（自定义属性自引用会成环失效，不能直接 `min(var(--dsh-chat-content-width), …)`）；钳制地板为官方最小内容宽度 640px（窄列下默认内容 680→640，owner 拍板）；官方改宽度轴公式或消费点需插件升级。
* 样式表在 apply 内注入、`ctx.effect` 清理；卸载即恢复官方 900px 行为。

## 开放问题

1. ≤700px 的 hover 命中区：frame 自身 28px + `::before` 左扩 16px 是否够用（实测后调）。
2. 极端窄（对话列 <640px 时内容列已超宽）的退化行为按官方现状处理，不额外适配。
3. 官方后续若给轮次导航加 `data-*` 属性，选择器迁移到属性（更稳）。

## 适配版本基线

本机 dsh checkout：`C:\Users\DJ028191\.dsh-launcher-panel\source`（release/dsh-0.1.2-alpha.3）。开工时复核上述行号与标签文案。
