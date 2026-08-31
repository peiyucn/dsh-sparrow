# 项目指令 — dsh-sparrow

## 项目概况

**dsh-sparrow**：DeepSeek Harness（DSH）Web 插件小合集——「麻雀虽小，五脏俱全」。

* 每个插件一个独立 npm 包、独立发布，统一挂在 npm 组织 **`@dsh-sparrow`** 下（`@dsh-sparrow/dsh-chat-suggest` 等，对齐官方 `@deepseek-ai/*` 惯例）；某功能被官方原生支持后对应插件从合集中退役
* 布局：
  * `plugins/dsh-chat-suggest` — 聊天输入框续写联想（DeepSeek FIM 补全 Beta 转发 + 官方 @ 列表同款候选菜单）
  * `plugins/dsh-vision-access` — 纯文本会话的图片视觉通道（官方 vision 模型读图，主模型保持大脑）
  * `plugins/dsh-archive-session` — 归档会话管理：备份 / 删除 / 恢复（轻量标题已随官方投影缓存退役）
* 各插件本地验证 = 进入插件目录 `npm run verify`（typecheck + node:test）；全量 = 仓库根 `npm run verify:all`
* 文档分工：插件 README 面向用户（**README.md 英文为 GitHub 默认 + README.zh-CN.md 简体中文**，顶部互链，写法对齐 dsh-launcher-panel）；`AGENTS.md` 面向开发 agent（seam 特例 / 架构约束 / 测试约定），开发细节不进 README
* 各插件专属约束见 `plugins/*/AGENTS.md`

***

## DSH 插件契约合规（硬约束）

* **入口契约**：插件模块 export `name` / `inject` / `apply`；`inject` 只声明硬依赖服务，缺失时插件不启动
* **生命周期**：一切副作用在 `apply` 内注册，并配 `ctx.effect` 清理（卸载/更新时自动执行）；不泄漏定时器/watcher/事件监听
* **组合行**：`cordis.patch.yml` 的 insert 结构按官方 bundle patch 规范——`id` 用**短名**（如 `dsh-chat-suggest`，稳定供后续 patch 定位）、`name` 用 **scoped 包名**（`@dsh-sparrow/dsh-chat-suggest`，loader 按包名解析模块；官方先例 `packages/bundle/sdk-app/tests/sdk-app.spec.ts`：`id: sdk-app-startup` + `name: '@deepseek-ai/dsh-sdk-app'`）
* **seam 纪律**：只用公开 seam（`ctx.llm` / `ctx.webServer` / `ctx.tools` / slots / provide 等正路 API）；确需包装 seam 时保持原签名与 `this` 语义、可逆恢复，并记录所适配的 dsh 版本
* **禁止**：monkey-patch 核心、硬编码 dsh 内部目录布局、绕过服务契约直接读内部文件（附件/会话数据一律走官方服务）。**特例机制**：官方无能力、需求明确且必须直碰内部文件的场景，须在对应插件 `AGENTS.md` 显式记录特例（允许的操作、边界、风险），并经项目 owner 认可——如 dsh-archive-session 的「备份 / 删除」特例。
* **查证原则**：引用 DSH 服务、事件、插槽、附件契约时，先 grep 源码（本机 checkout：`C:\Users\DJ028191\.dsh-launcher-panel\source`）或 cordis_inspect 查询确认，禁止凭记忆编造

***

## Git 规范

### Commit

* commit 描述用**中文**，类型前缀保留英文：`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等
* **逐项提交**：每完成一个独立任务**必须**单独 commit，禁止多个任务混在一个 commit
* **诚实原则**：不确定的事直接说"不确定"，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息

### 分支

* 日常开发一律在 `dev` 分支；`main` 只接受发布合并，不直接在上面开发

### Push

* push 前**必须**先跑对应插件的 `npm run verify`，成功才允许推送；日常推送目标 `dev`
* 网络：`git push/fetch` 需要代理（127.0.0.1:7897）；`gh api` 可直连 api.github.com（不需代理）

### 发布前全面检查

发布前（或用户要求全面检查时）对**要发布的插件**执行下方《代码审计》全部条目；发布流程按《发布》执行。

### 代码审计（按插件逐项执行）

#### 文档对齐

* 插件 README 与 package.json 的 dsh 声明（bundle patch / exports / peerDependencies）一一对应
* 文件路径、配置项、行为描述与当前实现一致；CHANGELOG 当前版本条目覆盖本版本全部用户可感知改动

#### 死代码

* grep 每个导出符号与常量，确认有调用方；删除未使用的 import/导出/变量/类型字段/CSS 类

#### BUG 排查（高危类别）

* **状态一致性**：散落布尔标志互相覆盖是主要 bug 来源；异步动作由显式状态驱动而非乐观置灰；动作开始瞬间即置状态
* **竞态**：请求/取消/作废并发不撞车；中断后残留标志不影响下一次操作；轮询/定时器在动作结束后清理
* **路径与引号**：Windows 下 cmd/PowerShell/execFile 的参数转义（含空格路径）；附件/缓存路径不硬编码 dsh 内部布局
* **资源泄漏**：定时器、watcher、AbortController、子进程句柄在成功与失败路径都释放（finally）
* **部分失败**：批量/转发中途失败时状态诚实反映，并校验结果
* **环境边界**：首次安装、离线、断网、权限不足、vision 模型缺失时的降级行为不挂死、有提示

#### 代码异味

* 模块/函数单一职责；可变状态经函数封装，不散落裸全局
* 命名表达意图；同类代码结构对称；无超长函数、重复逻辑、魔术字符串

#### 安全热点

* **凭据**：API key 只经 `ctx.credentials` 解析，不写日志、不进浏览器、不进面板 HTML；日志过滤敏感字段
* **Webview/客户端**：CSP 已设置；动态注入内容转义；client half 不 import Node 模块，host half 不 import 浏览器 API
* **网络**：fetch 带超时 + AbortController；打开的外部 URL 是白名单内的

#### 魔法数字

* 有语义的数字（超时/轮询/阈值/步长/缓存时长）一律命名常量（`*_MS` 等）

#### 鲁棒性

* 外部调用（网络/文件）有超时或 best-effort 错误处理，失败不挂死、不崩
* 解析/格式化函数对异常输入返回安全默认值、不抛；失败路径给用户可见反馈，不静默

#### 并发与防御

* 每个 UI 入口连点有防护（锁/debounce/disabled/幂等）；请求可被用户打断且状态一致

#### 测试

* 纯逻辑改动补 `test/*.test.mjs` 用例（尤其回归点）；新增可测纯函数需 export

#### 验证

* 对应插件的 `npm run verify` 通过；`git diff --check` 无空白错误

### 发布（npm 包，GitHub + npm 全套流程）

> npm 发布与 VS Code 插件发布不同：**发布即永久**——同版本不可覆盖、整体 unpublish 会锁包名 24 小时。发布前必须把版本、描述、CHANGELOG、tag 说明全部核对到位。

#### 发布范围

* 每次发布先**检查全部三个插件**（dsh-chat-suggest / dsh-vision-access / dsh-archive-session）的版本状态：对比 `npm view <包名> version` 与 `plugins/<插件>/package.json` 的 version、以及自上次 tag 以来的 git log
* **只要有修改更新的插件，就走完整发布流程**（GitHub tag + npm publish）；没有改动的插件不动
* 各插件独立版本号、独立发布、独立 tag（`<插件名>-vX.Y.Z`）

#### 元数据规范（「介绍内容」）

* `package.json`：
  * `name` 必须为 **`@dsh-sparrow/<插件名>`**（组织作用域，对齐官方 `@deepseek-ai/*` 惯例）
  * `description` 必须**英文**（npm 搜索页与包页首行显示它）
  * `repository` 必填（`git+https://github.com/peiyucn/dsh-sparrow.git` + `directory` 指到插件目录）——npm `--provenance` 校验 repository.url 与来源仓库匹配，缺失直接 E422
  * `files` 清单齐备：`lib/**/*.js`、`lib/types/**/*.d.ts`、`cordis.patch.yml`、`docs/images/**`、`README.md`、`README.zh-CN.md`、`CHANGELOG.md`
* README：README.md 英文为 GitHub / npm 默认 + README.zh-CN.md 中文，顶部互链
* 截图放 `plugins/<插件>/docs/images/`（与 README 引用一致）；同一张主截图也放仓库根 `resources/dsh-<插件>.png` 供总 README 使用

#### 版本策略

* semver：修复升 patch（0.0.x）、功能升 minor（0.x.0）、破坏性升 major（x.0.0）
* **三个插件版本线保持一致**：一个插件升版本（如元数据修正）时，其余插件同步升同号版本对齐；对齐类发版在 CHANGELOG 诚实记录「版本对齐合集 X.Y.Z（功能与上版一致）」
* **npm 同版本不可覆盖已发布内容**——已发布版本的元数据错误（描述 / README）只能升补丁版修正，并在 CHANGELOG 诚实记录（如「描述改英文，功能与上版一致」）
* **新版本一律先发 `next`（alpha 预发布）**：版本号用 `X.Y.Z-alpha.N`；工作流按版本是否含 `-` 自动选 `next` / `latest`。owner 通过 `next` 通道安装验证并确认后，再用 `npm dist-tag add <包名>@<版本> latest` 转正；转正后 deprecate 被替代的坏版本（优先 deprecate，不 unpublish）
* **禁止**对已发布包 `npm unpublish` 整个包（锁包名 24 小时）；仅「发布后几分钟内 + 零安装 + owner 确认」才考虑撤销单版本重发

#### 发布流程（按插件逐个走）

1. 改动提交并推送 `dev`；对应插件 `npm run verify` 通过
2. 更新该插件 `package.json` version；CHANGELOG 新增版本条目（覆盖本版全部用户可感知改动）；README 如有变化同步
3. 再次 `npm run verify` + `git diff --check`
4. 合并 dev → main（fast-forward）并 push
5. 打 **annotated tag**：`git tag -a <插件名>-vX.Y.Z -m "<一句话中文发布说明>"`（轻量 tag 在 GitHub tag 页显示的是 commit message，必须 `-a` 带说明）
6. push tag → 自动触发 Publish 工作流（解析插件目录与 npm dist-tag：版本含 `-` 发 `next`，正式版发 `latest`；校验 tag 版本 == package.json version、verify 后 `npm publish --access public --provenance --tag <next|latest>`）
7. `gh run watch` 盯到 success；`npm view <包名> version dist-tags` 复核版本与 dist-tag
8. **预发布待验证**：`next` 已指向新版本且 `latest` 未变；owner 通过 `next` 通道安装验证，未确认前不得动 `latest`
9. **转正**：owner 确认后 `npm dist-tag add <包名>@<版本> latest`，然后 `npm deprecate <被替代的坏版本> "..."`（不 unpublish）
10. `gh release create <tag> --notes "<本版 CHANGELOG 要点>"` 补 GitHub Release 说明（推荐；已发布 tag 补说明用同命令，**不要重推 tag**）
11. 切回 `dev` 继续开发

#### 发布红线

* 已发布版本 / tag 不可覆盖、不可挪动；同版本重复发布会 E403。错误只能发新版本修正，并 deprecate 被替代的坏版本（不 unpublish）
* tag 一律 annotated；push 前 `npm run verify` + `git diff --check` 必须通过，tag 版本必须等于 `package.json` version
* GitHub Actions：`secrets` 不能出现在 step 的 `if`，必须经 job 级 `env` 中转；`--provenance` 要求各插件 `package.json` 声明 `repository`（均已固化在 workflow 与元数据规范，勿回退）

#### 发布后收尾

* npm 包页配置 **Trusted Publishing（OIDC）**：Settings → Access → Trusted publishers，owner `peiyucn` + repo `dsh-sparrow` + workflow 路径 `.github/workflows/publish.yml`
* OIDC 配好并验证后：撤销用过的 token（聊天里贴过的 token 一律视为已暴露）、删除仓库 `NPM_TOKEN` secret——后续发布零密钥

***

## 需求

* 新功能设计文档放在对应插件目录下 `docs/spec/`，文件名 `NN-<主题>.md`
* **先写 spec 再开发**——明确需求范围、交互边界、验收标准；spec 经评审后才开工

***

## CI 与自动发布

* `.github/workflows/ci.yml`：push dev/main 与 PR 时跑 `pnpm install --frozen-lockfile` + `npm run verify:all`
* `.github/workflows/publish.yml`：push `<插件名>-vX.Y.Z` tag 触发，或 workflow_dispatch 指定插件；从 tag 解析插件名、校验 tag 版本与 `package.json` version 一致，跑该插件 verify 后 `npm publish --access public --provenance`；dist-tag 自动选择：版本含 `-` → `next`，正式版 → `latest`
* `.github/workflows/npm-release-control.yml`：workflow_dispatch 执行 `promote`（`dist-tag add ... latest`）或 `deprecate`；需要 `NPM_TOKEN`
* 工作流实现细节（勿回退）：`NPM_TOKEN` 经 job 级 `env` 中转再进 step 的 `if`（`secrets` 上下文不允许出现在 `if` 里，直接写会让整条工作流 0s 解析失败）；`--provenance` 要求各插件 package.json 声明 `repository` 字段
* 发布鉴权**双模式**：有 `NPM_TOKEN` secret 走 Automation token；无 secret 走 npm Trusted Publishing（OIDC）。包尚不存在（无法预配 OIDC）时必须有 `NPM_TOKEN`；长期方向是无 token 的 OIDC
