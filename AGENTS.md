# 项目指令 — dsh-sparrow

## 项目概况

DeepSeek Harness（DSH）Web 插件小合集。每个插件独立 npm 包、独立发布，统一挂在 `@dsh-sparrow` 组织下；功能被官方原生支持后对应插件退役。

* `plugins/dsh-chat-fim` — 输入框续写联想（FIM Beta 转发 + 官方同款候选菜单）
* `plugins/dsh-archive-manage` — 归档会话管理（备份 / 删除 / 恢复）
* `plugins/dsh-file-manage` — DeepSeek Files API 云端文件管理（无本地持久化）
* `plugins/dsh-codebuddy-credits` — CodeBuddy 额度 LLM provider（官方 API Key 直连）
* `plugins/dsh-theme-tone` — 明暗主题之下的色调层 + **对话区布局优化**（每轴各一款「官方默认」+ 若干色调；色调同时驱动抬升面的色相与质感，另含顶栏 / 输入框的玻璃效果）
* `plugins/dsh-vision-bridge` — **已退役（2026-09-10）**，代码原地保留不删不移
* `plugins/dsh-nav-pin` — **已退役（2026-09-29，并入 dsh-theme-tone）**，代码原地保留不删不移
* **口径：五个活跃插件 + 两个已退役插件**
* 活跃 / 退役名单的单一真值是 `scripts/plugin-set.mjs` 的 `RETIRED_PLUGINS`，`verify-all.mjs` / `check-dsh-pin.mjs` / `check-plugin-docs.mjs` 共用；退役插件不参与全量验证与版本线

## 文档规范

> AGENTS 给开发 agent、README 给用户、CHANGELOG 给用户——写错读者是文档事故。

* `AGENTS.md`：**中文一份**（面向开发 agent；**唯一 agent 指令文件**，不保留 CLAUDE.md 等其它厂商指令文件）
* `README`：**中英双份**——英文为默认 + 简体中文，顶部互链；**面向用户**：写安装 / 使用 / 配置的用法与行为，不写实现细节、私有 seam、开发历史
* `CHANGELOG`：**中英双份**——同 README 规；**面向用户**：每条 = 一条用户可感知的变化（一句话、行为级）——**纯依赖版本除外**，那种版本按《运维》如实写「无用户可感知的变化」；不写实现细节 / 内部机制 / 修复过程（归 commit 信息与 docs/spec）
* 私有 seam 明细进 `docs/private-seams.md`（不进 AGENTS）；实现以代码注释与各插件 `docs/spec` 为准

本项目实际文档：根 `README.md` + `README.zh-CN.md`、`SECURITY.md`、`docs/private-seams.md` + `docs/upstream/`；每个活跃插件 `README.md` / `README.zh-CN.md` / `CHANGELOG.md` / `CHANGELOG.zh-CN.md`（双份、顶部互链）+ `docs/spec/`。无 CONTRIBUTING，无根 CHANGELOG。

## 工程管线（本仓库自含）

* **开发**：日常改动在 `dev`；`main` 只接受发布合并；新功能先写 spec（`plugins/<插件>/docs/spec/NN-<主题>.md`），评审后才开工
* **验证**：插件目录 `npm run verify`；全量 = 根 `npm run verify`（= `pnpm run check` + `verify:all`）；分项 = 根 `pnpm run <step>:all`；push 前必须通过
* **守卫链**：`check`（本地与 CI **同一入口**）＝ `check:paths`（本机绝对路径 / 用户名）→ `check:dsh-pin`（官方 dsh 版本 pin 单一真值）→ `check:plugin-docs`（文档一致性）→ `check:market-index`（市场索引与包一致）→ `check:test-ts-check`（测试文件首行 `// @ts-check` 守卫）。**新增守卫只需加进 `check`**，CI 自动覆盖；别在 workflow 里逐个列脚本
* **提交**：**逐项提交**，中文描述 + 英文类型前缀（feat:/fix:/refactor:/chore:/docs: 等）；禁止多个任务混在一个 commit
* **推送**：日常目标 `dev`
* **合并**：dev → main（fast-forward）
* **发布**：见《项目专属章节 · 发布（npm 包）》——**push tag 前须 owner 当次点头**
* **运维**：依赖升级 / 修复统一手动（security updates 与 dependabot.yml 全部关闭）；收到警报 → 手动升级 → **一律按发布流程走补丁版**；依赖不进产物时 CHANGELOG 如实写「无用户可感知的变化」
* **收尾**：发布后切回 `dev`

## 代码审计（发布前 / 全面检查时）

* **文档对齐**：文档与实现 / 声明一一对应，CHANGELOG 覆盖本版用户可感知改动；插件 README 与 `package.json` 的 dsh 声明（bundle patch / exports / peerDependencies）对齐
* **死代码**：导出符号 / 常量确认调用方，清未使用 import / 变量 / 类型字段 / CSS 类
* **高危 BUG**：状态一致性；竞态；路径与引号（Windows 参数转义含空格路径）；资源 / 内存泄漏；部分失败（批量 / 转发中途失败状态诚实 + 校验结果）；环境边界（首装 / 离线 / 断网 / 权限不足降级不挂死）
* **安全热点**：凭据不进日志 / HTML（API key 只经 `ctx.credentials` 解析）；CSP 与转义；host/client 边界（client half 不 import Node 模块，host half 不 import 浏览器 API）；fetch 超时 + AbortController；外部 URL 白名单
* **代码异味**：单一职责；状态经函数封装；命名达意；同类对称；无超长函数 / 重复逻辑 / 魔术字符串
* **魔法数字**：有语义的数字命名常量（`*_MS`）
* **鲁棒性**：外部调用（网络 / 文件）超时与容错；异常输入安全默认值；失败路径用户可见反馈
* **性能**：重复重活缓存化 / 惰性化；热路径无 O(n²) / 重复计算；大批量渲染分页或虚拟化；高频事件防抖节流；并发扇出有上限
* **并发与防御**：UI 入口连点防护（锁 / debounce / disabled / 幂等）；请求可被打断且状态一致
* **测试与验证**：纯逻辑改动补 `test/*.test.mjs`；**测试文件首行必须 `// @ts-check`**（否则不进类型检查，`check:test-ts-check` 会红）；`verify` 通过 + `git diff --check` 干净

其中「资源 / 内存泄漏」＝ timer / watcher / AbortController 等句柄在成功与失败路径都释放；缓存 / 集合与按会话、生命周期累积的状态有界（上限 / 淘汰 / TTL / 随生命周期释放）；监听 / 订阅 / DOM 引用不滞留。

## 安全基线（本仓库自含要点）

* **已开启**（2026-09 逐项核验）：Dependabot alerts（仅报警）、CodeQL default setup（weekly，JS/TS + actions）、secret scanning + push protection、Private vulnerability reporting、根 `SECURITY.md`
* **保持关闭**：Dependabot 自动升级（security updates）、secret scanning 非提供商模式、validity checks
* **分支保护三层**：经典保护 ✓（main：要求对话解决 + 不允许绕过，**required status checks 不设**）；ruleset 轻保护 ✓（默认分支 + dev 各一条，禁删除 / 禁强推 / 禁重建）；合并设置 **Squash-only** ✓；owner 保留 fast-forward 直推，**CI 会跑但不设硬门禁**
* 外部 PR / Issue 一律开放，owner 审核合并；核验按根规范《统一安全基线 · 逐项检查命令》逐项跑

## CI 与自动发布

* `ci.yml`（push dev/main 与 PR）：`typecheck` → `build` → `test`（JUnit artifact；测试依赖 lib/ 故 build 在前）→ `package`（`npm pack --dry-run` 校验 files 清单）
* `publish.yml`（push `<插件名>-vX.Y.Z` tag 或 workflow_dispatch 指定插件）：解析插件 / 校验版本 / **跑根 `pnpm run check`（守卫 fail-closed，守卫红则不发）** / verify 后 `npm publish`；同文件含 promote 手动任务（`npm dist-tag add`；三个输入缺任一即**非零退出**，不静默成功）；publish job 挂 `environment: npm-publish`，**无 release-control**
* `market.yml`（`Publish` 成功后 / `main` 上 `market/**` 变动 / 每日 03:47 UTC / 手动）：见《插件市场索引》
* 鉴权双模式：有 `NPM_TOKEN` 走 Automation token（首发必需），无则走 npm Trusted Publishing（OIDC）

## GitHub 与网络

* 一律 `gh` CLI（已登录 peiyucn）——不手拼 git URL、不写明文凭据；GitLab（evo_time）走 `git` / `glab`
* 仓库 <https://github.com/peiyucn/dsh-sparrow>

## 项目专属章节

### 适配范围

* dsh web
* dsh desktop

### DSH 插件契约（硬约束）

* **入口契约**：模块 export `name` / `inject` / `apply`；`inject` 只声明硬依赖服务，缺失时插件不启动

* **生命周期**：一切副作用在 `apply` 内注册并配 `ctx.effect` 清理；不泄漏定时器 / watcher / 监听

* **宿主兼容自检**（五个活跃插件全有）：`apply` 开头先跑本插件 `src/compat.ts` 的门，不通过即**自停用**——cordis 逐插件捕获 `apply` 异常并把该插件标为 inactive，dsh 与其余插件不受影响（`@deepseek-ai/cordis` 的 `lib/index.js:1349-1363`）。用户只升级 dsh、不升级插件时，插件必须自己让位。两档门：

  * **能力门**（全部插件）：`assertCapabilities(ctx, name, [{ name, ok }])`——宿主服务 / 方法 / 导出、运行环境特性缺任一即停用；探针用**命名空间访问或惰性 import**，不产生链接期失败
  * **会话格式门**（读会话数据的 archive / chat-fim）：常量探针 `assertHostCompatible(ctx, name)`（官方 `SESSION_FORMAT_VERSION` 须在支持集合内）+ **宿主真值** `unsupportedStoredFormatReason(headers)`——常量探针在 `link:` / peer 副本场景会读到插件自己的旧版官方包，故以宿主给出的会话 `header.version` 为准
  * 判定逻辑纯函数化并补单测（含「不兼容 → 告警 + 抛错」接线用例）；停用文案统一为「已停用插件以免影响 dsh（升级本插件或运行环境后自动恢复）」

* **client half 另有硬约束（与 host half 不同，别照抄）**：DSH Web 的客户端 boot 审计把**任一 client entry 非 active** 当**致命**失败——`bootClient` 抛 `web boot: N entry did not activate`，宿主整页只渲染 "Failed to load plugins"；entry 停在 `pending`（`inject` 里缺服务）同样算。故 client half：

  * **门不许抛错**：用 `warnMissingCapabilities`（告警 + 返回 false，调用方直接 `return`，不注册任何槽位 / 样式 / 监听）做**惰性停用**；抛错版 `assertCapabilities` 只给 host half 用
  * **`inject` 只放跨版本稳定存在的服务**：易变面（如设置读取面 `settingsScope`——0.1.7-alpha.1 起改名为 `configForms`）走 `ctx.inject([...], cb)` 起的**可选依赖 fork**：服务出现才装，这条宿主线没有就什么都不做；fork 是 entry 的子 fiber，不进审计的 entry 列表
  * 依据（实测）：dsh 0.1.7-alpha.1 `packages/client/web/src/boot-client.ts:63-82`（审计）、`:73-75`（pending 判定）

* **组合行**：`cordis.patch.yml` insert 按官方 bundle patch 规范——`id` 用短名（供后续 patch 定位），`name` 用 scoped 包名（loader 按包名解析）

* **版本门：包 manifest 只声明 peer，派生处才写 `engines.dsh`**：官方 0.2.1-alpha.4 起，插件 `package.json` 一旦声明 `engines.dsh`，安装 / 启动的兼容性**只**按该 range 判定、`peerDependencies` 被忽略（`@deepseek-ai/dsh-app-boot` 的 `plugin-compatibility.ts`；`workspace:` 形式在该 range 里视为不兼容）。故：

  * **包 manifest 不写 `engines.dsh`**：`check:dsh-pin` 锚定的是 peer 声明，且它不扫 `engines.dsh` ⇒ 手写一份就是同一事实的第二处声明，漂了没有任何测试会红。**保持只声明 `peerDependencies`**（`engines.node` 与本契约无关，可继续写）
  * **派生处必须写**（当前 = 插件市场索引 `market/index.json`）：市场索引格式没有 peers 字段，只有每版本的 `engines.dsh`，而 `dsh-plugin-market` 判兼容时造的是**只含 `engines.dsh`、不含 peers 的合成 manifest** ⇒ 索引里省略该字段等于宣称「任何宿主都兼容」，会把不兼容的版本标成可装。**该值一律由 peer 机械派生、不得手写**：取该版本 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 peer range，跳过 `workspace:` 值，多个 range 用**空格**连接（semver 的 AND，`&&` 会判为非法比较符），全为 `*` 时省略
  * **守卫**：`check:market-index` 校验索引里每个版本的 `engines.dsh` 等于该版本 manifest 的 peer 派生结果
  * 将来确要在包 manifest 引入 `engines.dsh` 时，该 range 必须自己覆盖所有支持的 DSH 版本，并同步改 `check:dsh-pin` 口径与本文档

* **seam 纪律（三档）**：① **正路**：只用公开 seam（`ctx.llm` / `ctx.webServer` / `ctx.tools` / slots / provide 等）② **包装**：公开 seam 不满足需求时包装它——保持原签名与 `this` 语义、可逆恢复，并记录适配的 dsh 版本 ③ **私有 seam 依赖**：官方无公开能力时允许调 private 方法 / 读写 private 状态；护栏是不替换 / 不包装 / 不覆写官方函数，优先复用官方自身写入路径（如 `enqueueOperation` + `setState`），启动时能力检查、surface 变化即 fail-fast，且须 owner 批准并记入 `docs/private-seams.md`

* **禁止**：monkey-patch 核心、硬编码 dsh 内部目录布局、绕过服务契约直读内部文件（确需直碰内部文件的特例须记入 `docs/private-seams.md` + owner 认可）

* **查证原则**：引用 DSH 服务 / 事件 / 插槽契约前先 grep 官方源码（本机 checkout：`~/.dsh-launcher-panel/source`，可用 `DSH_SOURCE` 覆盖），禁止凭记忆编造

* **不许写本机绝对路径 / 用户名**：本仓库公开，文档、注释、测试夹具、开发脚本里**一律**用 `~/…` 相对写法或占位名（如 `alice`）；`check:paths` 会检查这一条

### 插件私有 seam 特例

> 逐插件明细见 [`docs/private-seams.md`](docs/private-seams.md)。

### 插件市场索引（market/）

> 对外发布站点：**<https://dsh.pyai.site/>**——根路径是一页双语说明（`market/landing.html`，**默认英文**、可切中文），索引本体在 `https://dsh.pyai.site/market/index.json`（DSH **插件 → 发现 → 添加索引源**）。官方声明没有官方市场，这是本仓库自己的源。

* **全自动，不需要手工重生成**：`market.yml` 在 `Publish` 成功后（`workflow_run`）自动跑「从 npm 重生成 → 守卫 fail-closed → 有变化则 bot 提交 `market/` → 发布 Pages」。另有三个触发源：`main` 上 `market/**` 或本文件变动、每日 03:47 UTC 兜底、手动 `workflow_dispatch`
* **真值在仓库里**：`market/index.json`（索引）+ `market/peer-snapshot.json`（各已发布版本的 dsh peer 声明快照，供守卫离线核对派生值），两者由同一次 `pnpm run market:index` 产出、随同一次提交落地——**不手改**。`market/.gitattributes` 固定 LF，避免 Windows 行尾让「重算后对比」恒脏
* **数据只来自 npm registry 的 packument**：只读、不下载 tarball、不执行任何插件代码；版本清单 = 该包所有声明了 `dsh.bundle.patch` 的版本
* **守卫 `check:market-index`** 四条：① 包名集合 = `activePluginNames()`（退役插件不得进索引、活跃插件不得缺席）；② 每个插件有中英双语描述与至少一个能力标签；③ 每版 `engines.dsh` = 该版 peer 派生值；④ 版本合法 SemVer、按降序、且**已在 npm 发布过的**当前版本在列
  * 判据 ④ 的「已发布」以 `peer-snapshot.json` 有该版本记录为准——**不是**「仓库内 `package.json` 的当前版本必须已在索引里」：版本号 bump 到发布之间那段窗口里，npm 上还没有该版本，索引不可能包含它，反过来要求会让 dev 分支每次 bump 都误红
  * 新增活跃插件要同时补 `scripts/market-index.mjs` 的 `ZH_DESCRIPTIONS` 与 `PLUGIN_LABELS`，否则判据 ② 会红
* **允许 CI 写仓库的理由**：索引是**纯派生数据**（内容完全由 npm registry 决定，不含人的判断）、bot 提交范围**只在 `market/`**、守卫 fail-closed 挡住坏数据，且触发顺序是「先发布、后生成」
* **bot 提交用 `GITHUB_TOKEN` 推送，不触发其它 workflow**（GitHub 已知行为）：部署用的是本次 run 内已重生成的 artifact，不依赖 bot 提交再次触发；`ci.yml` 也不会因 bot 提交重跑。这是有意接受的行为，不为它引入 PAT
* **新鲜度**：bot 提交后部署约 1 分钟；叠加 Pages 的 `max-age=600` 与 DSH 的 `cacheTtlMs`，终端用户最坏约 20 分钟看到新版本
* **`title` 口径**：索引标题中英**都是 `dsh-sparrow`**（仓库名即品牌名，不写「DSH Sparrow」这类变体）

### 发布（npm 包）

> npm 发布**永久**：同版本不可覆盖、整体 unpublish 锁包名 24 小时。

* **范围**：只发有改动的插件——对比 `npm view <包名> version`、插件 `package.json` version、自上次 tag 的 git log
* **元数据**：name 必须 `@dsh-sparrow/<插件名>`；description 英文；`repository` 必填（`--provenance` 校验）；`files` 清单齐备；README / CHANGELOG 中英双份顶部互链；CHANGELOG 条目按发布顺序从上到下、稳定版覆盖 alpha 全部改动、只记真实发布过的版本；截图统一放仓库根 `resources/dsh-<插件名>.png`（单一来源，**不打包进 npm 包**）；README 一律用**绝对 URL** 引用 `https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/…`
* **版本线镜像官方 dsh**：官方什么版本我们同形（alpha 对 alpha、rc 对 rc，稳定版也带 rc 标记）；**只承诺版本号所标示的那一条线**——README 环境要求写确切版本线（如 `DSH 0.1.5-rc.2`），**禁止写 `>=`**；官方未发新版时的自家迭代用预发布尾段递增（`0.1.2-rc.1.1`、`.2`…），semver 排序天然正确
* **各插件版本线独立**：哪个插件有改动发哪个；**根 `package.json` version = 合集整体版本**（README 徽章 `github/package-json/v` 的源），只在整体升级（全部插件齐发、对齐官方新版本线）时才动
* **通道**：alpha / beta 预发布发 `next`，rc 与纯数字稳定版发 `latest`；`next` 上的版本经 owner 本地 web profile 验证后，用 publish.yml 的 promote 把**同一版本号**移上 `latest`（只移 dist-tag、不重发包）
* **owner 的 web profile 固定 `link:`** 直连本仓库插件目录（开发改动即时生效）；**profile 级 `cordis.patch.yml` 保持 `[]`**——插件经各插件 `package.json` 的 `dsh.profile.bundles` 装载，往 profile 级 patch 写 insert 会与 bundle 层重复 → `duplicate loader entry id` 启动失败
* **官方版本跟随**：不硬跟每个官方预发布，一事一议；rc 线内对齐官方最新（已发布过的旧 rc 不回头重发）；影响预判记 `docs/upstream/`；**dsh 升级 = 正式适配任务**（release note → 影响清单 → bump 依赖 → typecheck → 修 → verify → 发新版），升级前确认各插件宿主兼容自检已就位
* **发布确认（硬门禁，owner 当次点头）**：`git tag` / `npm publish` 等**不可逆的对外发布动作**，执行前必须由 owner **当次明确确认**——「之前批准了整条发布流程」「按你建议走」「继续」**不构成**发布许可；agent 停在 push tag 之前，一句话报出「要发哪个插件、版本号、目标通道（next / latest）、影响范围」，未回话即视为未批准（根规范《发布（定版）》step5）
* **流程**：改动 push dev + 插件 verify → 版本号 + CHANGELOG 双份 → 再 verify + `git diff --check` → dev→main（ff）并 push → `git tag -a <插件名>-vX.Y.Z -F <说明文件>`（说明用 `node scripts/tag-notes.mjs <插件名> <版本号>` 生成；Windows 先输出到文件再 `-F`）→ **逐个** push tag → `gh run watch` 盯 success + `npm view` 复核版本与 dist-tag → 切回 dev。**版本号编辑只动该插件自己的 `package.json`**
* **tag 兜底**：GitHub 的 push 事件**一次推超过三个 tag 时不生成事件**——tag **逐个推**（或每批 ≤3 个），推完 30 秒内查 Publish run，没有就 `gh workflow run publish.yml -f plugin=<插件名>` 手动派发（本仓库不建 GitHub Release）
* **红线**：已发布版本 / tag 不可覆盖、不可挪动，同版本重发 E403；错误只能发新版本 + deprecate 坏版本；tag 版本必须等于 `package.json` version；`secrets` 不能出现在 step 的 `if`（经 job 级 env 中转）；`--provenance` 要求声明 `repository`
* **发布后收尾（每个包各配一次）**：npm 包 Settings → Access → Trusted Publishing → Add Trusted Publisher → GitHub Actions，填 Organization `peiyucn`、Repository `dsh-sparrow`、Workflow `publish.yml`（只填文件名）、Environment `npm-publish`（须与 publish job 的 environment 一致）；Allowed actions 勾 `Allow npm publish`；配完删 `NPM_TOKEN` secret 并 revoke 旧 token。**新包首发例外**：包不存在时 OIDC 无法预配——首发走 Automation token（临时放 `npm-publish` 环境 secret，发完即配 OIDC 并删 token），或由 owner 本机首发后立即补配
