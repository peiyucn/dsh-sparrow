# 项目指令 — dsh-sparrow

## 语言

* **始终用简体中文回复**

***

## 项目概况

**dsh-sparrow**：DeepSeek Harness（DSH）Web 插件小合集——「麻雀虽小，五脏俱全」。

* 每个插件一个独立 npm 包、独立发布；合集 README 提供索引，某功能被官方原生支持后对应插件从合集中退役
* 布局：
  * `plugins/dsh-chat-fim` — 聊天输入框续写联想（DeepSeek FIM 补全 Beta 转发 + dock 建议条）
  * `plugins/dsh-vision-access` — 纯文本会话的图片视觉通道（官方 vision 模型读图，主模型保持大脑）
  * `plugins/dsh-archive-session` — 归档会话管理：备份 / 删除 / 恢复（轻量标题已随官方投影缓存退役）
  * `packages/shared` — 插件共用的 seam 适配层与测试基建（有真实共用代码时再落地）
* 各插件本地验证 = 进入插件目录 `npm run verify`（typecheck + node:test）
* 各插件专属约束见 `plugins/*/AGENTS.md`

***

## DSH 插件契约合规（硬约束）

* **入口契约**：插件模块 export `name` / `inject` / `apply`；`inject` 只声明硬依赖服务，缺失时插件不启动
* **生命周期**：一切副作用在 `apply` 内注册，并配 `ctx.effect` 清理（卸载/更新时自动执行）；不泄漏定时器/watcher/事件监听
* **组合行**：`cordis.patch.yml` 的 insert 结构按官方 bundle patch 规范（id + name + 依赖）
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

* 日常开发一律在 `dev` 分支；`master` 只接受发布合并，不直接在上面开发

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

### 发布（按插件独立发布）

1. 确认改动已提交并推送 `dev`
2. 更新该插件 `package.json` 版本号，README / CHANGELOG 同步
3. 再次验证：进入插件目录 `npm run verify`
4. 合并 dev 到 master 并 push
5. 打 tag（`<插件名>-vX.Y.Z`）触发发布，或 `npm publish` / tarball 交付
6. 切回 dev 继续开发

***

## 需求

* 新功能设计文档放在对应插件目录下 `docs/spec/`，文件名 `NN-<主题>.md`
* **先写 spec 再开发**——明确需求范围、交互边界、验收标准；spec 经评审后才开工

***

## CI 自动化（规划）

* 仓库与远端尚未创建；创建后按插件维度配 GitHub Actions：`npm ci` + tsc 编译 + 测试 + 打包验证
