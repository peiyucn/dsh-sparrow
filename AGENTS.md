# 项目指令 — dsh-sparrow

## 项目概况

DeepSeek Harness（DSH）Web 插件小合集——「麻雀虽小，五脏俱全」。每个插件一个独立 npm 包、独立发布，统一挂在 `@dsh-sparrow` 组织下；功能被官方原生支持后对应插件退役。

* `plugins/dsh-chat-fim` — 输入框续写联想（FIM Beta 转发 + 官方同款候选菜单）
* `plugins/dsh-vision-bridge` — **已退役（2026-09-10）**：原为纯文本会话的图片视觉通道；DeepSeek 主模型已原生多模态（`deepseek-flash`），插件退役，代码原地保留不删不移
* `plugins/dsh-archive-manage` — 归档会话管理（备份/删除/恢复）
* `plugins/dsh-nav-pin` — 轮次导航窄屏不消失（纯样式注入）
* `plugins/dsh-file-manage` — DeepSeek Files API 云端文件管理（无本地持久化）
* `plugins/dsh-codebuddy-credits` — CodeBuddy 额度 LLM provider（官方 API Key 直连，纯模型推理）
* **插件总数口径：五个活跃插件 + 一个已退役插件**（`dsh-vision-bridge` 于 2026-09-10 退役，代码原地保留）
* 验证：插件目录 `npm run verify`；全量 = 根 `npm run verify`（**已退役插件不参与**，名单见 `scripts/verify-all.mjs` 的 `RETIRED_PLUGINS`）；分项 = 根 `pnpm run <step>:all`

## 文档规范

> 三份文档各司其职、各有读者：AGENTS 给开发 agent、README 给用户、CHANGELOG 给用户——写错读者是文档事故。

* `AGENTS.md`：**中文一份**（面向开发 agent；**唯一 agent 指令文件**，不保留 CLAUDE.md 等其它厂商指令文件）
* 插件 `README`：面向用户（中英双份、顶部互链，只写用法与行为，开发细节不进 README）
* `CHANGELOG`：双份面向用户——每条一条用户可感知变化（一句话、行为级）——**纯依赖版本除外**，那种版本按《运维》如实写「无用户可感知的变化」；不写实现细节/内部机制（归 commit 与 docs/spec）
* 插件私有 seam 特例明细见 `docs/private-seams.md`（不进 AGENTS）；实现以代码注释与各插件 docs/spec 为准

## 工程管线（本仓库自含）

* **开发**：日常改动在 `dev`；`main` 只接受发布合并；新功能先写 spec（`plugins/<插件>/docs/spec/NN-<主题>.md`），评审后才开工
* **验证**：插件目录 `npm run verify`；全量 = 根 `npm run verify`；push 前对应插件 verify 必须通过
* **提交**：逐项提交，中文描述 + 英文类型前缀（feat:/fix:/refactor:/chore:/docs:）；不确定的事直接说"不确定"，禁止编造事实性信息
* **推送**：日常目标 `dev`
* **合并**：dev → main（fast-forward）
* **发布**：npm 发布流程见「项目专属章节 · 发布（npm 包）」——**push tag 前须 owner 当次点头**（硬门禁，见该节；总规范《发布（定版）》step5）
* **运维**：依赖升级统一手动（security updates 与 dependabot.yml 关闭）；收到警报 → 手动升级 → **一律按发布流程走补丁版**——影响面只决定「何时」发（runtime/产物依赖可尽快单独发，纯 devDependencies 可与下个版本合并发），不再决定「是否」发；依赖不进产物时 CHANGELOG 如实写「无用户可感知的变化」
* **收尾**：发布后切回 `dev`

## 代码审计（发布前 / 全面检查时，按要发布的插件逐项）

* **文档对齐**：插件 README 与 package.json 的 dsh 声明（bundle patch/exports/peerDependencies）一一对应；路径/配置项/行为描述与实现一致；CHANGELOG 当前版本条目覆盖本版全部用户可感知改动
* **死代码**：grep 导出符号/常量确认调用方；清未使用 import/变量/类型字段/CSS 类
* **高危 BUG**：状态一致性（散落布尔标志互相覆盖；异步动作由显式状态驱动，动作开始瞬间即置状态）；竞态（请求/取消/作废并发不撞车，定时器动作结束后清理）；路径与引号（Windows 参数转义含空格路径）；资源/内存泄漏（timer/watcher/AbortController finally 释放；缓存/集合与按会话累积的状态有界——上限/淘汰/TTL/随生命周期释放；监听/订阅/DOM 引用不滞留）；部分失败（批量/转发中途失败状态诚实 + 校验结果）；环境边界（首装/离线/断网/权限不足/vision 缺失降级不挂死）
* **安全热点**：API key 只经 `ctx.credentials` 解析，不写日志、不进浏览器/面板 HTML；Webview CSP + 动态注入转义；client half 不 import Node 模块，host half 不 import 浏览器 API；fetch 带超时 + AbortController；外部 URL 白名单内
* **代码异味**：单一职责；状态经函数封装；命名达意；同类结构对称；无超长函数/重复逻辑/魔术字符串
* **魔法数字**：有语义数字（超时/轮询/阈值/步长/缓存时长）命名常量（`*_MS`）
* **鲁棒性**：外部调用（网络/文件）有超时或 best-effort 错误处理；解析/格式化对异常输入返回安全默认值；失败路径用户可见反馈
* **性能**：重复重活缓存化/惰性化（全量扫描、文件读取不随打开次数反复）；热路径无 O(n²)/重复计算；大批量渲染分页或虚拟化；高频事件防抖节流；并发扇出有上限
* **并发与防御**：UI 入口连点防护（锁/debounce/disabled/幂等）；请求可被打断且状态一致
* **测试与验证**：纯逻辑改动补 `test/*.test.mjs`；对应插件 `npm run verify` 通过 + `git diff --check` 干净

## 安全基线（本仓库自含要点）

* 已开启（2026-09 逐项核验）：Dependabot alerts（仅报警）、CodeQL default setup（weekly，JS/TS + actions）、secret scanning + push protection、Private vulnerability reporting、根 `SECURITY.md`
* 分支保护三层（2026-09 逐项核验）：经典保护 ✓（main：要求对话解决 + 不允许绕过）；ruleset 轻保护 ✓（默认分支 + dev 各一条）；合并设置 **Squash-only** ✓；owner 保留 fast-forward 直推，**CI 会跑但不设硬门禁**
* 外部 PR / Issue 一律开放，owner 审核合并（Squash-only），不想收的直接关闭；核验按根规范《统一安全基线 · 逐项检查命令》逐项跑

## CI 与自动发布

* `ci.yml`：push dev/main 与 PR → `typecheck` → `build` → `test`（JUnit artifact；测试依赖 lib/ 故 build 在前）→ `package`（npm pack --dry-run 校验 files 清单）
* `publish.yml`：push `<插件名>-vX.Y.Z` tag 或 workflow_dispatch 指定插件；解析插件/校验版本/verify 后 npm publish（alpha/beta 预发布发 next、rc 与纯数字稳定版发 latest）；同文件含 promote 手动任务（workflow_dispatch 填 plugin/version/tag → `npm dist-tag add` 移动通道，deprecate 仍归 owner 本机）；publish job 挂 `environment: npm-publish`（Deployments 留发布记录）；**无 release-control**（通道变更一律发新版本号；deprecate 由 owner 本机手动执行）
* 鉴权双模式：有 `NPM_TOKEN` 走 Automation token（首发必需——trusted publisher 需包已存在）；无则走 npm Trusted Publishing（OIDC）

## GitHub 与网络

* GitHub 操作一律走 `gh` CLI（已登录 peiyucn）
* 仓库：<https://github.com/peiyucn/dsh-sparrow>

## 项目专属章节

### DSH 插件契约（硬约束）

* **入口契约**：模块 export `name`/`inject`/`apply`；`inject` 只声明硬依赖服务，缺失时插件不启动

* **生命周期**：一切副作用在 `apply` 内注册并配 `ctx.effect` 清理；不泄漏定时器/watcher/监听

* **宿主兼容自检（硬约束，五个活跃插件全有；已退役的 dsh-vision-bridge 代码原地保留）**：`apply` 开头先跑本插件 `src/compat.ts` 的门，不通过即**抛错自停用**——cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响（已查证 cordis `lib/index.js:1350-1362`）。**用户只升级 dsh、不升级插件时，插件必须自己让位**（根 AGENTS《扩展与宿主兼容（fail-safe）》）。两档门：
  1. **能力门**（全部插件）：`assertCapabilities(ctx, name, [{ name, ok }])`——宿主服务/方法/导出、以及运行环境特性（如 nav-pin 依赖的 `:has()` 与 container query）缺任一即停用；探针用**命名空间访问或惰性 import**（导出消失/改名只得到 `undefined` → 判不支持，不产生链接期失败）。
  2. **会话格式门**（读会话数据的两个插件：archive / chat-fim）：常量探针 `assertHostCompatible(ctx, name)`（官方 `SESSION_FORMAT_VERSION` 须在支持集合内）+ **宿主真值** `unsupportedStoredFormatReason(headers)`——常量探针在 `link:`/peer 副本场景会读到插件自己的旧版官方包，故以宿主给出的会话 `header.version` 为准（archive 在移动/删除前逐 header 校验，chat-fim 在读取前校验）。
  判定逻辑纯函数化并补单测（含「不兼容 → 告警 + 抛错」接线用例）；停用文案统一为「已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）」

* **组合行**：`cordis.patch.yml` insert 按官方 bundle patch 规范——`id` 用短名（稳定供后续 patch 定位），`name` 用 scoped 包名（loader 按包名解析）

* **seam 纪律（三档）**：

  1. **正路（默认）**：只用公开 seam（`ctx.llm`/`ctx.webServer`/`ctx.tools`/slots/provide 等）
  2. **包装（特例）**：公开 seam 不满足需求时包装它——保持原签名与 `this` 语义、可逆恢复，并记录适配的 dsh 版本
  3. **私有 seam 依赖（特例）**：官方无公开能力、需求成立时，允许调用官方服务 private 方法/读写 private 状态。护栏：不替换/不包装/不覆写官方函数；优先复用官方自身写入路径（如 enqueueOperation + setState），不自造平行机制；启动时能力检查，surface 变化即 fail-fast 报「不支持的 dsh 版本」；owner 批准 + 在本文件「插件私有 seam 特例（概括）」小节记录

* **禁止**：monkey-patch 核心、硬编码 dsh 内部目录布局、绕过服务契约直读内部文件；确需直碰内部文件的特例须在本文件「插件私有 seam 特例（概括）」小节记录 + owner 认可

* **查证原则**：引用 DSH 服务/事件/插槽契约前，先 grep 官方源码（本机 checkout：`C:\Users\DJ028191\.dsh-launcher-panel\source`）确认，禁止凭记忆编造

### 插件私有 seam 特例

> 逐插件明细见 [`docs/private-seams.md`](docs/private-seams.md)——dsh 迭代快，开发时以临场查证官方源码为准；新增 / 变更特例须 owner 认可，实现以代码注释与各插件 docs/spec 为准。

### 发布（npm 包）

> npm 发布**永久**：同版本不可覆盖、整体 unpublish 锁包名 24 小时；发布前把版本/描述/CHANGELOG/tag 说明核对到位。

* **范围**：发布前对比 `npm view <包名> version`、插件 package.json version、自上次 tag 的 git log——有改动的插件走完整发布流程，没改动的不动；各插件独立版本号、独立 tag（`<插件名>-vX.Y.Z`）
* **元数据**：name 必须 `@dsh-sparrow/<插件名>`；description 英文；`repository` 必填（npm `--provenance` 校验）；`files` 清单齐备；README/CHANGELOG 中英双份顶部互链；CHANGELOG 条目按发布顺序从上到下、稳定版覆盖 alpha 全部用户可感知改动、只记真实发布过的版本（发布前的改名等内部历史记 docs/spec）；插件截图统一放仓库根 `resources/dsh-<插件名>.png`（单一来源）；README 一律用**绝对 URL**引用（`https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-<插件名>.png`，GitHub 与 npm 页双端可用，URL 绑定 main 分支）；**图片不打包进 npm 包**（插件 `files` 不含 resources）
* **版本策略**：**版本线镜像官方 dsh**——官方什么版本、我们同形版本（alpha 对 alpha、rc 对 rc，稳定版也带 rc 标记）：版本号即 dsh 兼容目标，用户一眼可辨、无需解释；**兼容承诺的边界**：只覆盖版本号所标示的**那一条**官方版本线，**不构成对更高版本线（尤其官方 alpha）的兼容承诺**——README 环境要求一律写「确切版本线」（如 `DSH 0.1.5-rc.2`），**禁止写 `>=`**（那会把没验证过的 alpha 一并承诺进去）；不兼容时插件自停用（见「DSH 插件契约 · 宿主兼容自检」），这是承诺边界的兜底而非扩大承诺；**官方未发新版时的自发版**：同一官方基线上的自家迭代用预发布尾段递增（`0.1.2-rc.1.1`、`0.1.2-rc.1.2`…；alpha 基线则 `0.1.3-alpha.1.1`…）——前段仍是 dsh 兼容目标，末段是自家序号，semver 排序天然正确（`0.1.2-rc.1 < 0.1.2-rc.1.1 < 0.1.2-rc.2`），publish.yml 的 tag glob 与通道判定（含 alpha/beta → next、否则 latest）对四段号天然兼容；**各插件版本线各自独立、不强对齐**：哪个插件有改动发哪个，其余不动；**根 package.json `version` = 合集整体版本（`rc.N` / `alpha.N`），与插件的自发版尾段无关**——README 版本徽章 `github/package-json/v` 的源，只在**整体升级**（全部插件齐发、对齐官方新版本线）时才动，单个插件的自发版一律不碰（否则一个插件升级会让徽章暗示整个合集都升级了）；**发布通道**：alpha/beta 预发布发 next，rc 与纯数字稳定版发 latest（稳定版带 rc 标记）；next 上的版本经 owner 本地 web profile 验证后，可用 publish.yml 的 promote 手动任务把**同一版本号**移上 latest（只移 dist-tag、不重发包）；owner 的 web profile 固定 `link:` 直连本仓库插件目录（开发改动即时生效，日常不切 registry；`dsh plugin --profile web add <包名>@next` 供外部用户/换机安装）；**profile 级 cordis.patch.yml 保持 `[]`**——插件经 package.json `dsh.profile.bundles` 装载（`dsh plugin add` 会写 bundles），各插件 bundle 自带 cordis.patch.yml 自动生效；往 profile 级 patch 写 insert 会与 bundle 层重复 → `duplicate loader entry id` 启动失败（实踩过）；npm 首发的 latest 指向该版本且不可移除 dist-tag（平台硬性行为）；坏版本 deprecate（不 unpublish）；版本线由 owner 决定；已发布版本元数据错误只能升补丁版修正并诚实记录
* **官方版本跟随**：**不硬跟每个官方预发布**——官方 alpha 迭代快、维护只有 owner + agent 两人，无条件追更会拖垮节奏；**每次官方进展一事一议**（跟不跟、跟到什么程度由 owner 定）；通道上 `latest` 保持相对稳定（对外用户拿到的是验证过的稳定线），alpha 线可先行发 `next`；**rc 线内对齐官方最新**（本次 rc.1 尚未发布即被 rc.2 取代，直接对齐 rc.2；已发布过的旧 rc 不回头重发）；版本级影响预判记 `docs/upstream/`（当前：`0.1.5-rc.1-migration-notes.md`——含 Session format V3、插件 Agent/Inbox/面板 API 变更与逐插件核验结论，0.1.5-rc.1 适配已落地；rc.2 为纯 UI 版本、无插件面变更，版本线已随 rc.2 对齐）；**dsh 升级 = 正式适配任务**（先看官方 release note 与社区迁移地图 → 影响清单 → bump 依赖 → typecheck → 修 → verify → 发新版），launcher 的 Update dsh 不随手点、checkout 不随手 pull；升级前确认各插件的宿主兼容自检已就位——不兼容的插件会自停用，不会拖垮 dsh（见「DSH 插件契约 · 宿主兼容自检」）
* **发布确认（硬门禁，owner 当次点头）**：`git tag` / `npm publish` 等**不可逆的对外发布动作**，执行前必须由 owner **当次明确确认**——「之前批准了整条发布流程」「评审时说按你建议走」「继续」一律**不构成**发布许可；agent 做完审计 / 定版 / verify / 合并后**停在 push tag 之前**，一句话报出「要发哪个插件、版本号、目标通道（next / latest）、影响范围」等 owner 回话，未回话即视为未批准（总规范《发布（定版）》step5）
* **流程**：改动 push dev + 插件 verify → 版本号 + CHANGELOG 双份 → 再 verify + `git diff --check` → 合并 dev→main（fast-forward）并 push → `git tag -a <插件名>-vX.Y.Z -F <说明文件>`（必须 -a；说明用 `node scripts/tag-notes.mjs <插件名> <版本号>` 生成——拼接两份 CHANGELOG 当前版本条目，英文在上、中文在下，GitHub tag 页完整展示；Windows 先输出到文件再 `-F`）→ **逐个** push tag 触发发布（一次推 >3 个 tag 不生成事件，见「tag 兜底」；解析插件、校验 tag==package.json version、verify、`npm publish --access public --provenance --tag next|latest`）→ `gh run watch` 盯 success + `npm view` 复核版本与 dist-tag → 切回 dev。**版本号编辑只动该插件自己的 package.json**（见「版本策略」：根 package.json `version` 是合集整体版本，单个插件自发版不动它；整体齐发时才含根版本同步；根 README 环境要求的 DSH 版本行同步）
* **tag 兜底（根因已查证）**：GitHub 的 push 事件**一次推送超过三个 tag 时不生成事件**（官方文档：`Events will not be created for tags when more than three tags are pushed at once`；`create` 事件同限，`actions/runner#3644` 至今未修）——多包齐发一次推全部 tag = 全部不触发，**与 main 是否刚更新无关**（本仓库实测：09-05 五包、09-09 六包齐发均无 tag run、全靠 dispatch 兜底；唯一自动触发的 Publish run 是单推一个 tag 的 codebuddy 0.1.2-rc.1.1）。**做法**：tag **逐个推**（或每批 ≤3 个），推完 30 秒内查对应 Publish run，没有就 `gh workflow run publish.yml -f plugin=<插件名>` 手动派发（发布内容与 tag 触发完全一致；本仓库不建 GitHub Release，版本说明看 tag 页与 CHANGELOG）。版本不匹配的 tag 会触发 run 但在版本校验步骤失败退出，零误发风险（已用测试 tag 验证，测毕已删）
* **红线**：已发布版本/tag 不可覆盖、不可挪动，同版本重发 E403；错误只能发新版本 + deprecate 坏版本；tag 版本必须等于 package.json version；`secrets` 不能出现在 step 的 `if`（经 job 级 env 中转）；`--provenance` 要求各插件 package.json 声明 repository
* **发布后收尾（OIDC 配置，每个包各配一次）**：包 Settings → Access → Trusted Publishing → Add Trusted Publisher → GitHub Actions，填四项——Organization `peiyucn`、Repository `dsh-sparrow`、Workflow `publish.yml`（**只填文件名**）、Environment `npm-publish`（**必须**与 publish job 的 environment 一致，不填/填错 OIDC 校验失败）；Allowed actions 勾 `Allow npm publish`（不勾 stage publish）。配置完成后删 `NPM_TOKEN` secret，并在 npmjs Access Tokens 页 revoke 旧 token（聊天贴过的一律视为已暴露）——后续发布零密钥。**新包首发例外**：包尚不存在时 OIDC 无法预配——首发走 Automation token（临时放 `npm-publish` 环境 secret，发完即配 OIDC 并删 token），或由 owner 本机首发后立即补配
