# 项目指令 — dsh-chat-suggest（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记 chat-suggest 专属约束。

## 项目概况

DSH Web 插件：聊天输入框续写联想（DeepSeek 对话前缀续写 Beta 转发 + 官方 @ 列表同款候选菜单）。2026-08-29 曾从无 prefix 的提示词方案切换为 FIM（实测提示词修视角不稳定：同构造两次采样一次用户口吻一次助手口吻）；2026-08-30 深夜实测发现 FIM 纯文本续写无角色约束——短拉丁草稿在聊天转写体里被模型以「助手：」口吻回复（新会话 plea 必现），遂切回官方**对话前缀续写（prefix: true）**。2026-08-30 建议展示从 portal 幽灵文本改为 `conversation.input.overlay` 候选菜单（真·框内渲染受插件边界所限不可行，见 docs/spec/03-menu.md）。单候选（suggestionCount 默认 1），Tab 键入、Esc 丢弃；开关挂输入框工具行（**默认关闭**，选择本地持久化），文案随 dsh 语言 zh/en 切换。

* 2026-08-30 两个实测修正：上游偶发以「助手：」开头复读说话人标记（续写变助手口吻）——此前 strip 后下发，后改 `cleanSuggestion`：按说话人标记截断 + 以标记开头视为角色切换整条丢弃；Tab 采纳后 dock 会立刻对新草稿再触发联想（建议马上复现）——菜单采纳前记 `markSuggestAdoption`（2026-08-31 起采纳后改为继续触发以支持 Tab 链式续写，见下），bail 失败回滚标记。
* 2026-08-30 晚触发门控改**内容自适应通用规则**（`shouldTriggerSuggest` 无语言参数）：草稿含 CJK → 10 字符门槛；纯拉丁草稿 → 6 字符门槛（≈一个完整单词；2026-08-31 实测半词/短片段信号太弱、模型漂移，由 3 提到 4 再提到 6）+ 放行单词中间（英文停顿几乎总在词中）。尾随空格两种语境都放行（英文词后预测下一个词、中文空格分词续写）；句末标点、夹入英文半词是否触发随灵敏度伸缩（见下条）。不做 zh/en 硬切换，各语言体验一致。2026-08-31 用户拍板**三档整体调钝**（宁缺毋滥）：CJK 高 4→6、中 8→10、低 12→14；拉丁高 2→4、低 8→10，中保持 6（please 恰好 6 字符是实测好案例）。
* 2026-08-30 晚模型三档退役、引入**触发灵敏度三档**（高/中/低，= eager/standard/conservative）：flash 足够，▾ 弹层改为灵敏度选择（按钮内竖排三点指示：恒显 3 点、自下而上点亮 3/2/1 个、tooltip 随档位变化），参数表 `TRIGGER_SENSITIVITIES`（停顿时长/最短草稿/夹入英文半词/词后空格/句末标点），持久化键 `dsh-chat-suggest:sensitivity`；规则全量明示在 README 与 docs/spec/04-sensitivity.md。
* 2026-08-30 晚（续）两个上游退化护栏：历史含指令/元话语时 FIM 偶发**循环复读同一短语**（实测输入 Please 复读「请用中文回复。」×N 直到 max_tokens）或**转述历史原句**（实测输入 ple 复述聊天区刚发过的句子）——host 侧丢弃这两种候选：`hasDegenerateRepeat`（同一短语 ≥4 次循环、覆盖 ≥85% 文本即退化）+ `isHistoryEcho`（建议任一 ≥10 字窗口与近期**用户**消息重叠、或 ≥15 字窗口与**助手**消息重叠即回声，窗口匹配覆盖改写后复读——助手阈值 15 是 2026-08-31 实测定稿：10 字全比对误杀正常措辞复用导致频繁空建议，转述插件讨论内容（cleanSuggestion 等 15 字片段）仍拦得住；历史窗口经 `recentHistoryTurns` 与 buildPrefixMessages 同源）。候选全被过滤时：**升温度 0.5 重试一次**（比 0.3 易跳出复读循环、比 0.7 噪声小——0.7 实测相关性弱，2026-08-31 用户拍板调低），仍无候选且上游正常即静默返回空建议（客户端不显示错误），只有上游请求全部失败才报 502。host 带**进程级诊断计数**（GET 路由 `?diagnostics=1`：requests/fulfilled/retries/shown/empty/filteredSpeaker/filteredRepeat/filteredEcho）——「转完圈没出卡片」时先查它再调参。
* 2026-08-30 深夜上游切回**对话前缀续写（prefix: true）**（官方 `/beta/chat/completions`，文档 api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion）：直连 A/B 实测——FIM `/completions` 聊天转写体（原格式）plea → 「助手：看起来你的消息好像没发完整…」（与新会话截图一致）；草稿不加说话人 → 元问答体；顶部指令 → 仍助手回复；纯草稿无历史 → 词典体；**前缀接口 + 原生历史 + 前缀消息「用户：草稿」→ plea → ase（补成 please）、CJK → 「可行性很高，咱们可以再细化…」**。实现 `buildPrefixMessages`：最近历史按原生 user/assistant 角色进 messages + 最后一条 assistant 消息（`prefix: true`）以「用户：草稿」开头；stop 序列照发但实测时灵时不灵，`cleanSuggestion` 客户端按标记截断兜底。
* 2026-08-31 建议**单句截断** + **Tab 链式续写**（用户拍板「续写不要太长，一直续就高档一直 Tab」）：`truncateFirstSentence`（中文 。！？ 直接截、英文 .!? 须后随空白且前 ≥8 字防缩写误截）在护栏之后截出第一句；dock 采纳后不再跳过触发——前缀机制从草稿尾部续写、不复现旧建议（FIM 时代「建议马上复现」随上游切换失效）。采纳文本以句末标点结尾时中/低档门控自然抑制链式触发，高档（句末标点也触发）可一直 Tab。
* 2026-08-31「有锚再抛」触发收紧（直连 A/B 实测驱动）：中档**夹入英文半词由放行改回抑制**（前缀接口能机械补词但常补错词、后续漂移，如 transf→igure）、拉丁最短草稿中 3→6 / 低 5→8（半词信号太弱；同日稍后再整体调钝，见上条）。「根据上下文猜用户下一句」超出两个官方 Beta 接口的能力定位——前缀续写是唯一正确的借用（见 2026-08-30 深夜条目），插件仍以官方原生支持续写为退役条件。

* TypeScript 实现；host half 源码在 src/，client half（M2 起）构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

***

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块
* client ↔ host 通信只走 ctx.webServer 自有路由（POST /api/chat-suggest/complete）
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
