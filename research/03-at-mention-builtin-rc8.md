# 03 · rc.8 官方 @引用能力记录（功能二：终止自研）

> 用户确认：DSH 升到 rc.8 后，官方已内置 @ 选文件夹/文件/会话。
> 本页记录官方实现细节（证据：rc8 安装产物 + 包 README，存档于 raw/rc8-*.md），并对照我们原方案说明为何不自建。

## 1. 官方四件套

| 包 | 行 id | 职责 |
|---|---|---|
| dsh-file-reference | — | 文件引用发现 seam：ctx.fileReferences.list(agent, query, signal)；@path / @"path with spaces" 语法；activeAtToken()（词边界识别）、formatFileMention()（目录补 /）、FILE_REFERENCE_PROMPT 指引 |
| dsh-file-reference-local | file-reference-local | 本地文件系统实现（候选按 agent 会话 cwd 界定） |
| dsh-client-ui-reference | ui-reference | 统一 @file+@session source（注册进 ctx.inputTriggers）；文件排在会话前、分组标题；调用 ctx.remote.fileReferences.list |
| dsh-session-reference | session-reference | 会话候选（按 session id/cwd/最新标题的元数据搜索）；agent/pre-step 校验 mention 并捕获上下文 |

## 2. 行为细节（与我们原方案的对照）

| 需求点 | 官方 rc.8 实现 | 我们原方案（已作废） |
|---|---|---|
| 候选菜单 | 复用 input-trigger 流水线，@ 后分组候选 | 自定义 @file source（同一条路，官方做了） |
| 文件引用 | 原子行内引用（文件图标+业务色文件名） | 计划 ReferenceInsert + codec 序列化为路径 |
| 文件夹引用 | 可编辑纯文本 + 尾部 /，菜单保持活跃可继续进入下一层 | 计划目录候选 + 路径引用 |
| 带空格路径 | @"path with spaces"，显式引号保留 | 计划 codec 处理 |
| 会话引用 | @[label](dsh-session:...) 原子引用，pre-step 校验并注入模型上下文 | 未覆盖（超出原计划） |
| 选择即读内容？ | 否，仅路径文本；模型需自行调 read | 同 |
| 失败降级 | 任一候选域失败静默降级 | 计划静默降级 |

## 3. 结论

- **功能二终止自研**：官方覆盖全部目标且多出会话引用；自建只会与官方 source 撞名、撞注册（(trigger,name) 唯一）。
- 残余可选需求（若将来有）：文件内容注入、候选排序/书签、跨命名空间搜索——出现真实需求再评估，不作为本项目范围。
- 底稿保留原调研一手材料（input-trigger 契约、ui-skill 范本）作背景知识：raw/src-input-trigger-types.ts、raw/src-ui-skill-client-index.ts。

## 4. 附带收获：rc.8 的 Remote 机制（对 02 的选型影响）

- 官方业务包现在自带 lib/typert.host.js（生成产物，typert-loader 经 ./typert 导出注册）与 lib/typert.remote-client.js。
- 客户端 dsh-api-remotes 仍**构建期显式挂载**（rc8 产物中新增 fileReferencesRemote 导入）——能力集合固定，第三方无法插入。
- 故本项目数据通道维持结论：ctx.webServer 自有路由（见 02 第 4 节）。
