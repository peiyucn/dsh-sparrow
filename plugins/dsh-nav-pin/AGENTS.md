# 项目指令 — dsh-nav-pin（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：让官方「轮次导航」（TurnNavigator，对话右侧跳转轮次的刻度条）在窄对话列不消失——官方 900px 断点提到 700px；≤700px 默认隐身，hover 右侧轨道（或键盘 focus 进入）淡入浮现（仅 opacity，无框无底色，与官方宽屏轨道形态一致）。纯客户端样式注入：无 host 功能、无 slots、无 locale、无按钮、无设置、无持久化状态（owner 拍板 2026-09-01）。另含会话内容最大宽度钳制：拖宽上限从每侧 88px 收紧到 160px，右侧拖拽条不再挤占导航命中区。

* **官方渲染门槛**：轮次导航在 `items.length < 2` 时不渲染（`ui-chat/src/client/chat/TurnNavigator.tsx:129`，items 含已翻页的旧轮次标记）——单轮会话没有导航可显，插件不改变该门槛。
* TypeScript 实现；host half 源码在 src/，client half 构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + client bundle + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块
* 一切副作用在 apply 内注册并配 ctx.effect 清理（样式注入 / 移除；卸载即恢复官方行为）
* 样式表按 data 属性去重（`style[data-dsh-nav-pin]`），HMR / 重载不叠加
* 纯 CSS 实现：不注入 JS 交互逻辑、不改官方 DOM 结构

## seam 特例（需项目 owner 认可，已定案）

* **只读依赖官方 DOM 标记与文案**：`[data-conversation-scroll]`（公开标记，ui-conversation ConversationRoot）+ 轮次导航 nav 的 aria-label 两套文案（`Turn navigation` / `轮次导航`，`ui-chat/src/client/locale.ts:32/149`）；官方改文案需插件升级。已确认滚动体内另一 nav（会话层级面包屑，`会话层级` / `Session hierarchy`）标签不同不会误伤。
* **特异性压制官方隐藏规则**：官方 `@container (max-width: 900px) { .slot { display: none } }`（`TurnNavigator.module.css:215`）特异性 (0,1,0)；插件规则 (0,2,3)，无需 !important。
* **transition 复刻**：≤700px 的 opacity 过渡与官方 `.frame` 的 `height 220ms` 过渡并列声明（覆盖 transition 简写会吃掉官方的高度动画）；官方改时长仅影响动画观感，不破坏功能。
* **浮层不做面板框**（owner 实测拍板）：≤700px 只做 opacity 淡入，不加载底色 / 边框 / 圆角 / 阴影——轨道自身无视觉容器，与官方宽屏形态一致；命中区仍由 frame 28px + ::before 扩展承担。
* **不可见命中区边界**：≤700px 时命中区约 44px 宽（28px 轨道 + 左扩 16px），覆盖右缘 gutter；极端窄（对话列 <640px，内容列已超宽）可能叠到内容右缘——接受该退化，按官方现状处理。
* **宽度轴钳制**：依赖公开属性 `[data-phase]`（ConversationRoot 根）与 `[data-width-handle]`（拖拽条）；官方宽度值先捕获到 `[data-phase]` 上的 `--dsh-nav-pin-official-width`（自定义属性自引用会成环失效，不可直接 `min(var(--dsh-chat-content-width), …)`），再在滚动体 / 拖拽条上以 min() 钳到「对话列 − 2×160px」（680px 地板）；输入卡片宽度公式（官方 `--dsh-composer-card-max-width` = 内容宽 + 32px，`InputBar.module.css:22/41` 消费）在滚动体上同步重算。官方改宽度轴公式 / 消费点需插件升级。
* **仍禁止**：monkey-patch 核心、改官方 DOM 结构、注入 JS 交互逻辑。

## 关键文件速查

    src/host.ts        — host half 入口（空实现，宿主侧无功能）
    src/nav-pin.ts     — 纯逻辑（标签常量 / 选择器生成 / CSS 生成）
    src/client/index.ts — client half 入口（样式注入 + ctx.effect 清理）
    src/index.ts       — 入口契约 re-export
    test/nav-pin.test.mjs    — 纯逻辑单测
    test/structure.test.mjs  — 结构测试（bundle 声明与组合行）
    cordis.patch.yml   — 组合补丁（npm 安装路径）
    dev.patch.yml      — 开发补丁（--patch 加载本地 TS，内含本机绝对路径）
    docs/spec/         — 设计文档

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 AAA 原则（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：CSS 生成（双标签覆盖 / 断点 / hover / focus / reduced-motion / 高度过渡复刻）
