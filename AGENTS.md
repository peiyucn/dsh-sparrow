# 项目指令 — dsh-sparrow

## 项目概况

DeepSeek Harness（DSH）Web 插件小合集——「麻雀虽小，五脏俱全」。每个插件一个独立 npm 包、独立发布，统一挂在 `@dsh-sparrow` 组织下；功能被官方原生支持后对应插件退役。

* `plugins/dsh-chat-fim` — 输入框续写联想（FIM Beta 转发 + 官方同款候选菜单）
* `plugins/dsh-vision-bridge` — 纯文本会话的图片视觉通道
* `plugins/dsh-archive-manage` — 归档会话管理（备份/删除/恢复）
* `plugins/dsh-nav-pin` — 轮次导航窄屏不消失（纯样式注入）
* `plugins/dsh-file-manage` — DeepSeek Files API 云端文件管理（无本地持久化）
* `plugins/dsh-codebuddy-credits` — CodeBuddy 额度 LLM provider（官方 API Key 直连，纯模型推理）

* 验证：插件目录 `npm run verify`；全量 = 根 `npm run verify`；分项 = 根 `pnpm run <step>:all`
* 文档分工：AGENTS.md 是唯一 agent 指令文件（不保留 CLAUDE.md 等其它厂商指令文件）；插件 README 面向用户（中英双份、顶部互链，只写用法与行为，开发细节不进 README）；CHANGELOG 双份面向用户——每条一条用户可感知变化（一句话、行为级），不写实现细节/内部机制（归 commit 与 docs/spec）；插件私有 seam 特例只在根 AGENTS 记概括（见下文），实现细节以代码注释与 docs/spec 为准

## DSH 插件契约（硬约束）

* **入口契约**：模块 export `name`/`inject`/`apply`；`inject` 只声明硬依赖服务，缺失时插件不启动
* **生命周期**：一切副作用在 `apply` 内注册并配 `ctx.effect` 清理；不泄漏定时器/watcher/监听
* **组合行**：`cordis.patch.yml` insert 按官方 bundle patch 规范——`id` 用短名（稳定供后续 patch 定位），`name` 用 scoped 包名（loader 按包名解析）
* **seam 纪律（三档）**：
  1. **正路（默认）**：只用公开 seam（`ctx.llm`/`ctx.webServer`/`ctx.tools`/slots/provide 等）
  2. **包装（特例）**：公开 seam 不满足需求时包装它——保持原签名与 `this` 语义、可逆恢复，并记录适配的 dsh 版本
  3. **私有 seam 依赖（特例，2026-09-01 起）**：官方无公开能力、需求成立时，允许调用官方服务 private 方法/读写 private 状态。护栏：不替换/不包装/不覆写官方函数；优先复用官方自身写入路径（如 enqueueOperation + setState），不自造平行机制；启动时能力检查，surface 变化即 fail-fast 报「不支持的 dsh 版本」；owner 批准 + 在本文件「插件私有 seam 特例（概括）」小节记录
* **禁止**：monkey-patch 核心、硬编码 dsh 内部目录布局、绕过服务契约直读内部文件；确需直碰内部文件的特例须在本文件「插件私有 seam 特例（概括）」小节记录 + owner 认可
* **查证原则**：引用 DSH 服务/事件/插槽契约前，先 grep 官方源码（本机 checkout：`C:\Users\DJ028191\.dsh-launcher-panel\source`）确认，禁止凭记忆编造

## 插件私有 seam 特例（概括）

> dsh 迭代快，特例不写死细节：开发时以临场查证官方源码为准；新增/变更特例须 owner 认可，实现细节以代码注释与各插件 docs/spec 为准。

* `dsh-chat-fim`：候选菜单挂 `conversation.input.dock`（只读草稿快照，写入走官方 `slash/input-insert-text` 事件）+ `conversation.input.overlay`（官方菜单视觉 token）；与官方触发菜单互斥（只读检测 `[data-trigger-menu]`）；host 直读 `session.snapshotEvents()` 取主路由（仅 dsh ≥ 0.1.2-alpha.4）
* `dsh-vision-bridge`：可逆包装 `ctx.llm.resolveModelInfo` 抹除文本路由的 image 门禁；`agent/request` 拦截按主模型能力屏蔽 `vision_read` 工具；图片字节只经官方 `ctx.attachments.readImage`；直读 `snapshotEvents()`；状态图标与模型座位共享官方 `ctx.modelDirectories` 目录 store，能力判定走无会话依赖的 `/api/vision-bridge/capability` 路由
* `dsh-archive-manage`：允许移动/删除会话日志目录（仅 jsonl 单会话目录，其余 `BACKEND_UNSUPPORTED`）；归档集变更走官方 WorkspaceRegistry 私有写通道（`enqueueOperation`/`requireState`/`setState`，启动能力检查缺方法即 fail-fast）；`sessionPersistence.list()` 双形状兼容（master 返回快照、旧版返回裸 header）；`sessionPersistence.locate` 为后端私有方法（alpha.5 发布后从公开契约降级，启动能力检查缺方法即 fail-fast）；live 会话拒绝处理；回收站目录写 sidecar 记账
* `dsh-file-manage`：直接 import 官方导出 `DeepSeekFilesClient`；只读官方 `llm-deepseek` 设置节取 `baseURL`/`apiKeyEnv`
* `dsh-nav-pin`：只读依赖官方 DOM 标记与 aria-label 文案；CSS 特异性压制官方窄屏隐藏规则；宽度轴经官方公开 data 属性钳制
* `dsh-codebuddy-credits`：无私有 seam——协议层自建（`CodeBuddyAdapter extends LlmAdapter`，不依赖 pi-ai）：请求构造、SSE 解析、usage.credit 提取、企业策略错误透传全部显式实现；官方请求标识（user-agent/x-product/企业上下文头）直接进请求头；`conversation.input.model` 槽位以 priority -1 遮蔽官方 ModelSelect（官方注册表语义：同 cell 最低 priority 渲染，非 monkey-patch）——vendored 选择器（MIT 署名，源码 ui-model-selection）只为积分系数右对齐列，启动能力检查缺 `modelDirectories`/`sessions` 服务即保留官方选择器；只读依赖官方 DOM 标记 `[data-composer-card]`（Toast 锚定）；捕获阶段点击拦截官方行头「编辑」按钮（按钮保留官方原位与样式，`stopPropagation` 阻断官方编辑器打开，行为改为展开本插件自建编辑器——官方编辑器对本命名空间只渲染占位提示）；首装 setup 占位编辑器以 CSS 隐藏（`:has(.ccb-card-root)` 锚点 + DOM 结构定位——官方类名是纯哈希、片段匹配无效）；凭据引用对齐官方派生名 `CODEBUDDY_CREDITS_API_KEY`（deriveKeyRef 口径，旧引用 `CODEBUDDY_API_KEY` 兼容迁移），使官方行头凭据圆点原生生效；每轮积分胶囊挂官方 `conversation.chat.assistant-actions` 槽位（公开 seam），DOM 级移动到该行动作行末尾时间之前（只移动本插件自有节点，不包装/替换官方组件）；轮次关联经 `agent/request` 载荷 signal 与适配器 options.signal 同实例（WeakMap，中断零残留）；会话积分统计段挂官方 `conversation.composer.dock` 槽位，DOM 级把自有分段追加到官方 StatsLine 行末尾（官方行每步重渲染清注入节点，组件以同 nodes 信号重建，无可见断档）；额度卡挂官方 `sidebar.footer.action` 槽位（公开 seam，owner 传 `wide`），宽栏以零占位锚点 + 绝对定位品牌 logo 与官方 Settings 同行右置、不重叠——经官方锚点契约的 `[data-slot="sidebar.settings"]` 可寻址 seam 以 CSS 收缩官方 Settings 按钮让出右侧空间（`body:has` 限定仅宽栏生效；rail 常规圆形图标行）

## 工程管线（本仓库自含）

* **开发**：日常改动在 `dev`；`main` 只接受发布合并
* **验证**：插件目录 `npm run verify`；全量 = 根 `npm run verify`；push 前对应插件 verify 必须通过
* **提交**：逐项提交，中文描述 + 英文类型前缀（feat:/fix:/refactor:/chore:/docs:）；不确定的事直接说"不确定"，禁止编造事实性信息
* **推送**：日常目标 `dev`；`git push/fetch` 需要代理 127.0.0.1:7897，`gh api` 直连
* **合并**：dev → main（fast-forward）
* **运维**：依赖升级统一手动（security updates 与 dependabot.yml 关闭）；收到警报 → 判断影响面（运行时/产物依赖才影响用户）→ 手动升级 → 影响用户的按发布流程发版

## 安全基线（本仓库自含要点）

* 已开启：Dependabot alerts（仅报警）、CodeQL default setup、secret scanning + push protection、Private vulnerability reporting、根 `SECURITY.md`；检查命令 `gh api repos/peiyucn/dsh-sparrow --jq .security_and_analysis`
* 分支保护：main 禁强推/删/重建、Squash-only、owner 保留 fast-forward 直推；dev rulesets 轻保护（禁强推+禁删+禁重建）；**CI 会跑但不设硬门禁**——合并外部 PR 前 owner 自己确认 CI 绿
* 外部 PR / Issue 一律开放、不设交互限制，owner 审核合并（Squash-only），不想收的直接关闭

## 代码审计（发布前 / 全面检查时，按要发布的插件逐项）

* **文档对齐**：插件 README 与 package.json 的 dsh 声明（bundle patch/exports/peerDependencies）一一对应；路径/配置项/行为描述与实现一致；CHANGELOG 当前版本条目覆盖本版全部用户可感知改动
* **死代码**：grep 导出符号/常量确认调用方；清未使用 import/变量/类型字段/CSS 类
* **高危 BUG**：状态一致性（散落布尔标志互相覆盖；异步动作由显式状态驱动，动作开始瞬间即置状态）；竞态（请求/取消/作废并发不撞车，定时器动作结束后清理）；路径与引号（Windows 参数转义含空格路径）；资源泄漏（timer/watcher/AbortController finally 释放）；部分失败（批量/转发中途失败状态诚实 + 校验结果）；环境边界（首装/离线/断网/权限不足/vision 缺失降级不挂死）
* **安全热点**：API key 只经 `ctx.credentials` 解析，不写日志、不进浏览器/面板 HTML；Webview CSP + 动态注入转义；client half 不 import Node 模块，host half 不 import 浏览器 API；fetch 带超时 + AbortController；外部 URL 白名单内
* **代码异味**：单一职责；状态经函数封装；命名达意；同类结构对称；无超长函数/重复逻辑/魔术字符串
* **魔法数字**：有语义数字（超时/轮询/阈值/步长/缓存时长）命名常量（`*_MS`）
* **鲁棒性**：外部调用（网络/文件）有超时或 best-effort 错误处理；解析/格式化对异常输入返回安全默认值；失败路径用户可见反馈
* **并发与防御**：UI 入口连点防护（锁/debounce/disabled/幂等）；请求可被打断且状态一致
* **测试与验证**：纯逻辑改动补 `test/*.test.mjs`；对应插件 `npm run verify` 通过 + `git diff --check` 干净

## 发布（npm 包）

> npm 发布**永久**：同版本不可覆盖、整体 unpublish 锁包名 24 小时；发布前把版本/描述/CHANGELOG/tag 说明核对到位。

* **范围**：发布前对比 `npm view <包名> version`、插件 package.json version、自上次 tag 的 git log——有改动的插件走完整发布流程，没改动的不动；各插件独立版本号、独立 tag（`<插件名>-vX.Y.Z`）
* **元数据**：name 必须 `@dsh-sparrow/<插件名>`；description 英文；`repository` 必填（npm `--provenance` 校验）；`files` 清单齐备；README/CHANGELOG 中英双份顶部互链；CHANGELOG 条目按发布顺序从上到下、稳定版覆盖 alpha 全部用户可感知改动、只记真实发布过的版本（发布前的改名等内部历史记 docs/spec）；插件截图统一放仓库根 `resources/dsh-<插件名>.png`（单一来源）；README 一律用**绝对 URL**引用（`https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-<插件名>.png`，GitHub 与 npm 页双端可用，URL 绑定 main 分支）；**图片不打包进 npm 包**（插件 `files` 不含 resources）
* **版本策略**：**版本线镜像官方 dsh（2026-09-03 定）**——官方什么版本、我们同形版本（alpha 对 alpha、rc 对 rc，稳定版也带 rc 标记）：版本号即 dsh 兼容目标，用户一眼可辨、无需解释；官方同一版本内的多次发布用 rc/补丁位递增（届时按需细化）；各插件版本线保持一致（对齐类发版 CHANGELOG 记「版本对齐合集」）；**官方 0.1.2-rc.1 落地前：新版本（含 alpha）一律直发 latest**，owner 经本地 web profile 验证；0.1.2-rc.1 落地后恢复双通道——先发 next（`X.Y.Z-alpha.N`）、owner 验证后发同号稳定版自动上 latest；owner 的 web profile 固定 `link:` 直连本仓库插件目录（开发改动即时生效，日常不切 registry；`dsh plugin --profile web add <包名>@next` 供外部用户/换机安装）；**profile 级 cordis.patch.yml 保持 `[]`**——插件经 package.json `dsh.profile.bundles` 装载（`dsh plugin add` 会写 bundles），各插件 bundle 自带 cordis.patch.yml 自动生效；往 profile 级 patch 写 insert 会与 bundle 层重复 → `duplicate loader entry id` 启动失败（2026-09-02 实踩）；npm 首发的 latest 指向该版本且不可移除 dist-tag（平台硬性行为）；坏版本 deprecate（不 unpublish）；版本线由 owner 决定；已发布版本元数据错误只能升补丁版修正并诚实记录
* **官方版本跟随（2026-09-02 定）**：日常跟随官方 alpha 线（dev 即 alpha 轨；0.1.2-rc.1 前发布直发 latest，0.1.2-rc.1 后 alpha 走 next）；**不回头适配 rc.2**（官方已断代弃线）；官方 0.1.2-rc.1 / 稳定版落地后做一次对齐 sprint——届时 main 对齐 rc 走 latest、dev 继续 alpha 走 next，版本线随之镜像官方 rc（稳定版带 rc 标记）；**dsh 升级 = 正式适配任务**（先看官方 release note 与社区迁移地图 → 影响清单 → bump 依赖 → typecheck → 修 → verify → 发新版），launcher 的 Update dsh 不随手点、checkout 不随手 pull
* **流程**：改动 push dev + 插件 verify → 版本号 + CHANGELOG 双份 → 再 verify + `git diff --check` → 合并 dev→main（fast-forward）并 push → `git tag -a <插件名>-vX.Y.Z -F <说明文件>`（必须 -a；说明用 `node scripts/tag-notes.mjs <插件名> <版本号>` 生成——拼接两份 CHANGELOG 当前版本条目，英文在上、中文在下，GitHub tag 页完整展示；Windows 先输出到文件再 `-F`）→ push tag 自动发布（解析插件、校验 tag==package.json version、verify、`npm publish --access public --provenance --tag next|latest`）→ `gh run watch` 盯 success + `npm view` 复核版本与 dist-tag → 切回 dev
* **tag 兜底**：push tag 后 30 秒内无对应 Publish run，改 `gh workflow run publish.yml -f plugin=<插件名>` 手动派发（发布内容与 tag 触发完全一致；本仓库不建 GitHub Release，版本说明看 tag 页与 CHANGELOG）
* **红线**：已发布版本/tag 不可覆盖、不可挪动，同版本重发 E403；错误只能发新版本 + deprecate 坏版本；tag 版本必须等于 package.json version；`secrets` 不能出现在 step 的 `if`（经 job 级 env 中转）；`--provenance` 要求各插件 package.json 声明 repository
* **发布后收尾（OIDC 配置，五个包各配一次）**：包 Settings → Access → Trusted Publishing → Add Trusted Publisher → GitHub Actions，填四项——Organization `peiyucn`、Repository `dsh-sparrow`、Workflow `publish.yml`（**只填文件名**）、Environment `npm-publish`（**必须**与 publish job 的 environment 一致，不填/填错 OIDC 校验失败）；Allowed actions 勾 `Allow npm publish`（不勾 stage publish）。配置完成后删 `NPM_TOKEN` secret，并在 npmjs Access Tokens 页 revoke 旧 token（聊天贴过的一律视为已暴露）——后续发布零密钥

## 需求

* 新功能先写 spec（`plugins/<插件>/docs/spec/NN-<主题>.md`），评审后才开工

## CI 与自动发布

* `ci.yml`：push dev/main 与 PR → `typecheck` → `build` → `test`（JUnit artifact；测试依赖 lib/ 故 build 在前）→ `package`（npm pack --dry-run 校验 files 清单）
* `publish.yml`：push `<插件名>-vX.Y.Z` tag 或 workflow_dispatch 指定插件；解析插件/校验版本/verify 后 npm publish（0.1.2-rc.1 前一律 latest；0.1.2-rc.1 后版本含 `-` 发 next、正式版发 latest）；publish job 挂 `environment: npm-publish`（Deployments 留发布记录）；**无 release-control**（通道变更一律发新版本号；deprecate 由 owner 本机手动执行）
* 鉴权双模式：有 `NPM_TOKEN` 走 Automation token（首发必需——trusted publisher 需包已存在）；无则走 npm Trusted Publishing（OIDC）
