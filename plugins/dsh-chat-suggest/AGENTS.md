# 项目指令 — dsh-chat-suggest（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记 chat-suggest 专属约束。

## 项目概况

DSH Web 插件：聊天输入框续写联想（DeepSeek FIM 补全 Beta 转发 + 官方 @ 列表同款候选菜单）。2026-08-29 曾从无 prefix 的提示词方案切换为 FIM（实测提示词修视角不稳定：同构造两次采样一次用户口吻一次助手口吻）；2026-08-30 深夜实测短拉丁草稿 plea 在 FIM 转写体下被模型以「助手：」口吻回复，遂切到对话前缀续写（prefix: true）；2026-08-31 三方案直连 A/B 发现该用法与官方语义冲突（用户拍板「方式错了」，见下条），切回 FIM。2026-08-30 建议展示从 portal 幽灵文本改为 `conversation.input.overlay` 候选菜单（真·框内渲染受插件边界所限不可行，见 docs/spec/03-menu.md）。单候选（suggestionCount 默认 1），Tab 键入、Esc 丢弃；开关挂输入框工具行（**默认关闭**，选择本地持久化），文案随 dsh 语言 zh/en 切换。

* 2026-08-30 两个实测修正：上游偶发以「助手：」开头复读说话人标记（续写变助手口吻）——此前 strip 后下发，后改 `cleanSuggestion`：按说话人标记截断 + 以标记开头视为角色切换整条丢弃；Tab 采纳后 dock 会立刻对新草稿再触发联想（建议马上复现）——菜单采纳前记 `markSuggestAdoption`（2026-08-31 起采纳后改为继续触发以支持 Tab 链式续写，见下），bail 失败回滚标记。
* 2026-08-30 晚触发门控改**内容自适应通用规则**（`shouldTriggerSuggest` 无语言参数）：草稿含 CJK → 8 字符门槛；纯拉丁草稿 → 6 字符门槛（完整单词才触发；**半词建议按用户拍板去掉**——plea×4 实测全错为 es、ple→as，模型字母级补全不可靠）+ 放行单词中间（英文停顿几乎总在词中）。尾随空格两种语境都放行（英文词后预测下一个词、中文空格分词续写）；句末标点、夹入英文半词是否触发随灵敏度伸缩（见下条）。不做 zh/en 硬切换，各语言体验一致。2026-08-31 调档记录：先拍板**三档整体调钝**（CJK 高 6/中 10/低 14；拉丁高 4/中 6/低 10），切回 FIM 后回调 2 字（CJK 高 4/中 8/低 12；拉丁高 2/中 4/低 8），再拍板**去掉半词建议**（拉丁中 4→6）——即当前值。
* 2026-08-30 晚模型三档退役、引入**触发灵敏度三档**（高/中/低，= eager/standard/conservative）：flash 足够，▾ 弹层改为灵敏度选择（按钮内竖排三点指示：恒显 3 点、自下而上点亮 3/2/1 个、tooltip 随档位变化；2026-09-01 三点与 ▾ 合并为分割线右侧的独立灵敏度触发区——整区可点只开菜单、不切换开关，三点缩至 4px 方点），参数表 `TRIGGER_SENSITIVITIES`（停顿时长/最短草稿/夹入英文半词/词后空格/句末标点），持久化键 `dsh-chat-suggest:sensitivity`；规则全量明示在 README 与 docs/spec/04-sensitivity.md。2026-08-31 用户先拍板暂切 pro 实测，同日再拍板**模型跟随主模型**（客户端 `suggestModelMode: 'auto'`——用户选什么模型 suggest 就用什么模型；host 每次请求按会话事件现读主路由，vision/未知回退配置默认）。
* 2026-08-30 晚（续）两个上游退化护栏：历史含指令/元话语时 FIM 偶发**循环复读同一短语**（实测输入 Please 复读「请用中文回复。」×N 直到 max_tokens）或**转述历史原句**（实测输入 ple 复述聊天区刚发过的句子）——host 侧丢弃这两种候选：`hasDegenerateRepeat`（同一短语 ≥4 次循环、覆盖 ≥85% 文本即退化）+ 回声双模式：`startsWithHistoryEcho`（建议**开头 10 字前缀**出现在近期用户消息 = 整段复读用户原话）与 `isHistoryEcho`（建议任一 **15 字窗口**出现在助手消息 = 转述讨论内容；窗口匹配覆盖改写后复读）。阈值经过 2026-08-31 两轮实测修正：10 字窗口全比对（用户+助手）导致正常会话频繁空建议（诊断 filteredEcho 占满）——用户改前缀锚定、助手放宽到 15。历史窗口经 `recentHistoryTurns` 与 buildFimPrompt 同源。候选全被过滤时：**升温度 0.5 重试一次**（比 0.3 易跳出复读循环、比 0.7 噪声小——0.7 实测相关性弱，2026-08-31 用户拍板调低），仍无候选且上游正常即静默返回空建议（客户端不显示错误），只有上游请求全部失败才报 502。host 带**进程级诊断计数**（GET 路由 `?diagnostics=1`：全局 + `bySession` 按会话分组；键为 requests/fulfilled/retries/shown/empty/filteredSpeaker/filteredRepeat/filteredEcho/filteredLanguage）——「转完圈没出卡片」时先查它再调参。
* 2026-08-30 深夜上游切回**对话前缀续写（prefix: true）**（官方 `/beta/chat/completions`，文档 api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion）：直连 A/B 实测——FIM `/completions` 聊天转写体（原格式）plea → 「助手：看起来你的消息好像没发完整…」（与新会话截图一致）；草稿不加说话人 → 元问答体；顶部指令 → 仍助手回复；纯草稿无历史 → 词典体；**前缀接口 + 原生历史 + 前缀消息「用户：草稿」→ plea → ase（补成 please）、CJK → 「可行性很高，咱们可以再细化…」**。实现 `buildPrefixMessages`：最近历史按原生 user/assistant 角色进 messages + 最后一条 assistant 消息（`prefix: true`）以「用户：草稿」开头；stop 序列照发但实测时灵时不灵，`cleanSuggestion` 客户端按标记截断兜底。
* 2026-08-31 **切回 FIM 补全**（用户拍板「方式错了」）：三方案直连 A/B（正常上下文、4 草稿 ×2 采样）——A-FIM 转写体 d1-d3 **6/6 干净用户口吻**（d1「单项的校验上」、d2「可行吗？」、d3「 fix it」），d4 口吻对但**补词错**（plea → es fix it：plea+es=pleaes 非 please——2026-08-31 用户指出，模型字母级精度不可靠，补测 plea ×4 全为 es、ple → as）；B-伪前缀（「用户：」塞进 assistant 消息）约半数漂移成助手口吻/复读；C-官方语义前缀（system 指令 + 裸草稿）半对半漂。根因：官方 prefix 语义是「续写 assistant 自己的消息」，塞「用户：」进去是与机制对抗，结构性角色漂移。FIM 时代的 plea 失败复现于**无实质历史的寒暄上下文**（哈喽啊），正常上下文 FIM 稳定（完整单词后的续写可靠），角色漂移/复读由 `cleanSuggestion` + 护栏兜底。实现：`buildFimPrompt`（说话人转写体）+ `/completions`；前缀接口代码已删（git 历史可查）。
* 2026-08-31 续写语言**跟随草稿内容**（`detectDraftLanguage`：草稿含 CJK → zh 标签，否则 en 标签）：实测界面语言 en + 草稿 please 时历史以中文为主，模型续出中文——语言框架必须与草稿一致；客户端不再传 locale 字段。同日再加**语言一致性护栏** `isLanguageConsistent`：草稿纯拉丁时建议不得含 CJK（实测 please 后跟空格，模型续出全新中文句、回声护栏拦不住），反向不拦（中文草稿常夹英文术语）；诊断计数 filteredLanguage。
* 2026-08-31 建议**单句截断** + **Tab 链式续写**（用户拍板「续写不要太长，一直续就高档一直 Tab」）：`truncateFirstSentence`（中文 。！？ 直接截、英文 .!? 须后随空白且前 ≥8 字防缩写误截）在护栏之后截出第一句；dock 采纳后不再跳过触发——FIM 转写体下续写从新草稿尾部出发，「建议马上复现」的旧风险由单句截断 + 退化护栏兜底（若复发可只在高档放开链式）。采纳文本以句末标点结尾时中/低档门控自然抑制链式触发，高档（句末标点也触发）可一直 Tab。
* 2026-08-31「有锚再抛」触发收紧（直连 A/B 实测驱动）：中档**夹入英文半词由放行改回抑制**（实测 transf 半词补全质量差——prefix 接口下补成 transfigure 且漂移，该门控与接口无关）、拉丁最短草稿中 3→6 / 低 5→8（半词信号太弱；同日稍后再整体调钝，见上条）。「根据上下文猜用户下一句」超出两个官方 Beta 接口的能力定位——FIM 转写体是实测最优的借用（见 2026-08-31 切回条目），插件仍以官方原生支持续写为退役条件。

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

* **候选菜单（2026-08-30 起）**：官方没有输入框内联建议 seam（`conversation.input.overlay` 是菜单弹层锚点、不带输入快照）。当前实现：数据面挂 `conversation.input.dock`（读 InputZone 草稿快照，**只读**；写入仍走 `slash/input-insert-text` bail 事件，span CAS），菜单视图挂 `conversation.input.overlay`（官方 MenuDropdown 视觉 token，锚点由 shell 承载，零定位 JS）。**不修改编辑器内容**；官方提供 inline-suggestion seam 后迁移。2026-08-31 数据面自 `conversation.composer.dock` 迁至 `conversation.input.dock`：composer.dock 在 hero 状态（新会话页）不被 shell 渲染，导致新会话第一条草稿 0 联想；input.dock 在 hero/active 两种状态都渲染（查证与决策见 docs/spec/03-menu.md）。
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
