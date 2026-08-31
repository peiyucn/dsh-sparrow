# 项目指令 — dsh-chat-fim（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记 chat-fim 专属约束。

## 项目概况

DSH Web 插件：聊天输入框续写联想（DeepSeek FIM 补全 Beta 转发 + 官方 @ 列表同款候选菜单）。2026-08-29 从对话前缀续写切换为 FIM：实测提示词修视角不稳定（同构造两次采样一次用户口吻一次助手口吻），FIM 直接续写文本、无角色语义，天然站在用户角度。2026-08-30 建议展示从 portal 幽灵文本改为 `conversation.input.overlay` 候选菜单（真·框内渲染受插件边界所限不可行，见 docs/spec/03-menu.md）。单候选（suggestionCount 默认 1），Tab 键入、Esc 丢弃；开关挂输入框工具行（**默认关闭**，选择本地持久化），文案随 dsh 语言 zh/en 切换。

* 2026-08-30 两个实测修正：上游偶发以「助手：」开头复读说话人标记（续写变助手口吻）——host 侧 `stripSpeakerPrefix` 剥离后再下发；Tab 采纳后 dock 会立刻对新草稿再触发联想（建议马上复现）——菜单采纳前记 `markFimAdoption`，dock 对「旧草稿 + 建议文本」这次草稿变化跳过触发，bail 失败回滚标记。
* 2026-08-30 晚触发门控改**内容自适应通用规则**（`shouldTriggerFim` 无语言参数）：草稿含 CJK → 8 字符门槛；纯拉丁草稿 → 3 字符门槛 + 放行单词中间（英文停顿几乎总在词中）。尾随空格两种语境都放行（英文词后预测下一个词、中文空格分词续写）；句末标点、夹入英文半词是否触发随灵敏度伸缩（见下条）。不做 zh/en 硬切换，各语言体验一致。
* 2026-08-30 晚模型三档退役、引入**触发灵敏度三档**（高/中/低，= eager/standard/conservative）：flash 足够，▾ 弹层改为灵敏度选择（按钮内竖排三点指示：恒显 3 点、自下而上点亮 3/2/1 个、tooltip 随档位变化），参数表 `FIM_SENSITIVITIES`（停顿时长/最短草稿/夹入英文半词/词后空格/句末标点），持久化键 `dsh-chat-fim:sensitivity`；规则全量明示在 README 与 docs/spec/04-sensitivity.md。
* 2026-08-30 晚（续）两个上游退化护栏：历史含指令/元话语时 FIM 偶发**循环复读同一短语**（实测输入 Please 复读「请用中文回复。」×N 直到 max_tokens）或**转述历史原句**（实测输入 ple 复述聊天区刚发过的句子）——host 侧丢弃这两种候选：`hasDegenerateRepeat`（同一短语 ≥4 次循环、覆盖 ≥85% 文本即退化）+ `isHistoryEcho`（建议开头与近期历史 ≥10 字连续重叠即回声，历史窗口经 `recentHistoryTurns` 与 buildFimPrompt 同源）。

* TypeScript 实现；host half 源码在 src/，client half（M2 起）构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

***

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块
* client ↔ host 通信只走 ctx.webServer 自有路由（POST /api/chat-fim/complete）
* API key 只经 ctx.credentials 解析，绝不落明文、绝不进浏览器
* 一切副作用在 apply 内注册并配 ctx.effect 清理（DSH 插件生命周期要求）

***

## seam 特例（需项目 owner 认可，已定案）

* **候选菜单（2026-08-30 起）**：官方没有输入框内联建议 seam（`conversation.input.overlay` 是菜单弹层锚点、不带输入快照）。当前实现：数据面挂 `conversation.composer.dock`（读 InputZone 草稿快照，**只读**；写入仍走 `slash/input-insert-text` bail 事件，span CAS），菜单视图挂 `conversation.input.overlay`（官方 MenuDropdown 视觉 token，锚点由 shell 承载，零定位 JS）。**不修改编辑器内容**；官方提供 inline-suggestion seam 后迁移。
* **与官方触发菜单互斥**：对 `[data-trigger-menu]`（官方 @/斜杠触发菜单的公开 DOM 标记）做**只读存在性检测** + MutationObserver 观察 overlay 锚点子树；官方菜单打开期间本菜单不渲染、Tab 不采用。只读观察，不做任何写入。
* **旋转光环定位**：只读测量 `[data-composer-card]` 视口矩形（portal 到 body），300ms 周期自愈。

***

## 关键文件速查

    src/host.ts              — host half 入口（webServer 路由 + settings 分节）
    src/client/index.ts      — client half 入口（开关 / 数据面 dock / overlay 候选菜单）
    test/structure.test.mjs  — 结构测试（bundle 声明与组合行）
    cordis.patch.yml         — 组合补丁（npm 安装路径）
    dev.patch.yml            — 开发补丁（--patch 加载本地 TS，内含本机绝对路径）
    docs/spec/               — 设计文档

***

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 AAA 原则（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：触发条件、建议作废判定、错误映射等抽成纯函数并导出
