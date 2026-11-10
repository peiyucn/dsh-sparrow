# 08 · 能力包（Capability Pack）— 随插件分发的 skill 与工具

> 状态（2026-11-10）：**设计稿，待评审**；评审通过后与 `07-notebook.md` 一起开工。
> 关联：`07-notebook.md`（笔记功能本体）、`06-session-index.md`（外键层）、
> `01-object-model.md`（统一对象与工具面）。

## 1. 定位

Desk One 不只是一个面板，而是**面板 + 数据 + 能力包**：

- **面板**：人看的界面（便签 / 任务 / 日程 / 笔记 / 会话）；
- **数据**：`nodes` / `edges` 统一对象；
- **能力包**：安装插件即可用的 **skill（指令）** 与 **tool（动作）**，让 AI 知道怎么读写同一批对象。

这样「AI 与统一对象的交互层」不需要另建一套机制——**就是插件自带的 skill + tool**。

## 2. 随包内容

| 项 | 类型 | 作用 | 是否强制 |
| :--- | :--- | :--- | :--- |
| `note2md` | skill | 笔记本初始化、OneNote 导入、模板 / 命名 / frontmatter 约定、AGENTS.md 清单 | **预制、非强制** |
| `desk-notes` | skill（新增） | 笔记库契约、批注锚点语义、收到批注后的处理流程 | 随笔记功能 |
| `desk_note_*` 工具 | tool | 批注读写、frontmatter 语义检索（见第 3 节） | 随笔记功能 |
| 既有 `desk_note_*` / `desk_task_*` / `desk_group_*` / `desk_schedule_*` | tool | 便签 / 任务 / 分组 / 日程（已实现） | 已有 |

**`note2md` 是预制技能、非强制**：随插件安装即可用，用户完全可以不用——自己手写 md、用别的 skill、
或直接让 AI 写，产物都能被索引。它只是「开箱即用的初始化 / 导入能力」。

## 3. 工具面（只做官方没有的）

| 工具 | 作用 | 不重复的理由 |
| :--- | :--- | :--- |
| `desk_note_annotation_list` | 列批注（按文件 / 状态 / 时间） | 官方没有批注概念 |
| `desk_note_annotation_reply` | AI 回复批注线程 | 同上 |
| `desk_note_annotation_answered` | 标「已处理，待人确认」（**不能 resolved**） | 人保留最终确认权 |
| `desk_note_search` | 按 frontmatter（type / date / tag）检索笔记库 | 官方 fs 搜索不懂 frontmatter 语义 |

**明确不做**：

- `desk_note_read / write / edit`——agent 已有官方文件工具（`read` / `write` / `edit` / `grep`），
  再包一层就是重复且容易漂移（先例：已删除的 `desk_session_search` / `desk_session_get`）；
- `desk_session_search` / `desk_session_get`——官方会话工具已覆盖；
- 笔记正文的编辑能力——写入一律走官方文件工具 + skill 流程。

**AI 改笔记正文的路径**：官方文件工具直接改 md（沙箱按工作区授权，见 `07` 第 2 节）。

## 4. 与官方的边界（防重复清单）

| 官方能力 | 我们怎么做 |
| :--- | :--- |
| 文件读写（`read` / `write` / `edit` / `grep`） | 直接用，不包 |
| 会话搜索（`session_search` / `session_trace`） | 直接用；Desk One 只做「任务 ↔ 会话」图查询 |
| 文件浏览（右侧栏 files / documentpreview） | 复用；笔记只做语义视图与批注层 |
| 代码 diff 评审（forge 的 `ReviewThread` / `insertQuote`） | **抄链路不抄代码**：同样用 `SessionInput.insertQuote`，但对象是 md 文档、且批注持久化 |
| `documentPreviews.register` | 不自造渲染器；正文用公开 `MarkdownText` |

## 5. 打包与加载

- skill 内容随 npm 包分发（`files` 清单需包含 `skills/**`），运行时通过
  `ctx.skills.register()` / `registerProvider()` 注册。
- **包内资源路径不得写死绝对路径**（仓库公开，`check:paths` 会红）；相对路径由
  `resourceBase` 交给模型解析（官方 `renderSkillContent` 会注入 base directory）。
- `note2md` 的 `templates/` 与三个 `.ps1` 一并随包（导入链路依赖它们）。
- **同名冲突**：`~/.dsh/skills/` 可能已有用户自装的 `note2md`。按 registry 优先级
  runtime 会压过 user 层；合体后建议只留插件这一份真值，并在 README 说明。
- **host `inject` 需要 `skills`**；缺失时按既有能力门口径降级（不拖垮 boot）。

## 6. 降级

- skill 注册失败 / 宿主无 `skills` 服务 → 面板与工具照常，只是 AI 没有指令引导；
- 工具注册失败 → 记日志并跳过，不影响 REST 路由与 UI；
- 宿主版本不兼容 → 沿用既有 `compat.ts` 能力门，插件自停用。

## 7. 验收

- 安装插件后，模型能在 `<available_skills>` 看到 `note2md` 与 `desk-notes`；
- `desk_note_annotation_*` / `desk_note_search` 可被发现并调用；
- 移除插件后 skill / 工具随之消失（fiber 生命周期清理）；
- 包内无绝对路径；`files` 清单包含全部随包资源；
- `npm run verify` 与根 `pnpm run check` 全绿。

## 8. 探针结论（2026-11-10）

| # | 问题 | 结论 | 落地方式 |
| :--- | :--- | :--- | :--- |
| 1 | 插件随 npm 包带 skill 资源 | ⚠️ 未实测（仅查证可行） | `ctx.skills.register()` 接受任意 skill 定义；包内资源经 `files` 清单携带，运行时用包内相对路径读取。**开工第一步做一次真实安装验证** |
| 2 | host 半 `ctx.skills` 可用性 | ✅ 服务存在 | `SkillRegistry` 由 `@deepseek-ai/dsh-skill` 提供，`ctx.skills.register` / `registerProvider` 为公开方法；host 半可 `inject: ['skills']`（缺失时按能力门降级） |
| 3 | 同名覆盖行为 | ✅ 已确认 | registry 按层取最近：project > runtime > user（`skill/src/index.ts` 注释与实现）。插件注册的 runtime skill 会压过 `~/.dsh/skills/` 的用户自装版本；用户删插件后回落到自己的 |
| 4 | `.ps1` 随包后的执行路径 | ⚠️ 需实装验证 | skill 内容里的 `<skill_dir>` 相对路径由 `resourceBase` 注入；`note2md` 现有三段脚本均按 `<skill_dir>/tools/...` 引用，随包后 base 指向包内目录即可，开工时实测 |

**结论**：能力包的机制性风险已排除（服务存在、语义明确）；剩两项是"打包细节"，放在开工第一步实测，不影响 spec 落地。
