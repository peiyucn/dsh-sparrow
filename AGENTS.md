# 项目指令 — dsh-sparrow

## 项目概况

DeepSeek Harness（DSH）Web 插件小合集。每个插件独立 npm 包、独立发布，统一挂在 `@dsh-sparrow` 组织下；功能被官方原生支持后退役。

* `plugins/dsh-chat-fim` — 输入框续写联想（FIM Beta 转发 + 官方同款候选菜单）
* `plugins/dsh-archive-manage` — 归档会话管理（备份 / 删除 / 恢复）
* `plugins/dsh-file-manage` — DeepSeek Files API 云端文件管理（无本地持久化）
* `plugins/dsh-codebuddy-credits` — CodeBuddy 额度 LLM provider（官方 API Key 直连）
* `plugins/dsh-theme-tone` — 明暗主题之下的色调层 + 对话区布局优化
* `plugins/dsh-vision-bridge` — **已退役（2026-09-10）**，代码原地保留
* `plugins/dsh-nav-pin` — **已退役（2026-09-29，并入 dsh-theme-tone）**，代码原地保留
* **口径：五个活跃插件 + 两个已退役插件**

## 文档规范

> AGENTS 给开发 agent、README 给用户、CHANGELOG 给用户——写错读者是文档事故。

* `AGENTS.md`：中文一份；唯一 agent 指令文件
* 插件 `README` / `CHANGELOG`：中英双份、顶部互链；**面向用户**——只写用法与行为
* `CHANGELOG` 每条 = 一条用户可感知的变化；纯依赖版本写「无用户可感知的变化」；不写实现细节
* 私有 seam 明细进 `docs/private-seams.md`；实现以代码注释与各插件 `docs/spec` 为准

## 工程管线

* **验证**：插件目录 `npm run verify`；全量根 `npm run verify`（= `pnpm run check` + `verify:all`）。`check` 是守卫链（本地与 CI 同一入口）：`check:paths` / `check:dsh-pin` / `check:plugin-docs` / `check:market-index`——**新增守卫只加进 `check`**，CI 自动覆盖
* **名单**：活跃 / 退役的单一真值是 `scripts/plugin-set.mjs` 的 `RETIRED_PLUGINS`；退役插件不参与全量验证与版本线
* **开发**：改动在 `dev`；`main` 只接受发布合并；新功能先写 spec（`plugins/<插件>/docs/spec/NN-<主题>.md`）再开工
* **提交**：逐项提交，中文描述 + 英文类型前缀（feat: / fix: / refactor: / chore: / docs:）
* **合并**：`dev` → `main`（fast-forward），日常推送目标 `dev`
* **发布**：见《发布（npm 包）》——**push tag 前须 owner 当次点头**
* **运维**：依赖升级统一手动（security updates 与 dependabot.yml 关闭）；收到警报按发布流程走补丁版
* **收尾**：发布后切回 `dev`

## 代码审计（发布前 / 全量检查时逐项）

* **文档对齐**：README 与 `package.json` 的 dsh 声明（bundle patch / exports / peerDependencies）一一对应
* **死代码**：导出符号确认调用方；清未使用 import / 变量 / 类型字段 / CSS 类
* **高危 BUG**：状态一致性；竞态；路径与引号；资源泄漏（句柄成败路径都释放）；部分失败状态诚实；首装 / 离线 / 权限不足降级不挂死
* **安全热点**：API key 只经 `ctx.credentials`，不进日志 / 面板 HTML；CSP 与转义；host/client 边界不越界；fetch 带超时 + AbortController；外部 URL 白名单
* **代码异味**：单一职责；命名达意；无超长函数 / 重复逻辑 / 魔术字符串（语义数字用 `*_MS` 常量）
* **鲁棒性**：外部调用有超时；异常输入返回安全默认值；失败路径用户可见
* **性能**：重活缓存化；热路径无 O(n²)；大批量渲染分页；高频事件防抖；并发有上限
* **并发**：UI 入口防连点（锁 / disabled / 幂等）；请求可打断且状态一致
* **测试**：纯逻辑改动补 `test/*.test.mjs`；verify 通过 + `git diff --check` 干净

## 安全基线

* 已开启：Dependabot alerts、CodeQL default setup（weekly）、secret scanning + push protection、Private vulnerability reporting、根 `SECURITY.md`
* 分支保护：经典保护 ✓（main：要求对话解决 + 不允许绕过）；ruleset 轻保护 ✓（默认分支 + dev）；合并 **Squash-only** ✓；owner 保留 fast-forward 直推
* 外部 PR / Issue 开放，owner 审核合并；核验按根规范《统一安全基线 · 逐项检查命令》逐项跑

## CI 与自动发布

* `ci.yml`（push dev/main 与 PR）：`typecheck` → `build` → `test`（JUnit artifact；测试依赖 lib/ 故 build 在前）→ `package`（`npm pack --dry-run` 校验 files）
* `publish.yml`（tag `<插件名>-vX.Y.Z` 或 workflow_dispatch）：解析插件 / 校验版本 / **跑根 `pnpm run check`（守卫红则不发）** / verify → `npm publish`；同文件含 promote（`npm dist-tag add`，三输入缺一即非零退出）；挂 `environment: npm-publish`
* `market.yml`：见《插件市场索引》，索引无需手工重生成
* 鉴权双模式：有 `NPM_TOKEN` 走 Automation token（首发必需），无则走 npm Trusted Publishing（OIDC）

## GitHub 与网络

* 一律 `gh` CLI（已登录 peiyucn）；仓库 <https://github.com/peiyucn/dsh-sparrow>

## 项目专属章节

### 适配范围

* dsh web
* dsh desktop

### DSH 插件契约（硬约束）

* **入口**：模块 export `name` / `inject` / `apply`；`inject` 只声明硬依赖服务
* **生命周期**：副作用都在 `apply` 内注册并配 `ctx.effect` 清理，不泄漏定时器 / watcher / 监听
* **宿主兼容自检**（活跃插件全有）：`apply` 开头跑 `src/compat.ts` 的门，不通过即**自停用**（cordis 逐插件捕获 `apply` 异常，宿主与其余插件不受影响）。两档：
  * **能力门**：`assertCapabilities(ctx, name, [{ name, ok }])`，探针用命名空间访问或惰性 import，不产生链接期失败
  * **会话格式门**（读会话数据的 archive / chat-fim）：`assertHostCompatible`（常量探针）+ `unsupportedStoredFormatReason(headers)`（**以宿主给出的 header.version 为准**——常量探针在 `link:` 场景会读到插件自己的旧版官方包）
  * 判定纯函数化并补单测（含「不兼容 → 告警 + 抛错」接线用例）
* **client half 与 host half 不同，别照抄**：客户端 boot 审计把任一 client entry 非 active 当**致命**失败（整页只渲染 "Failed to load plugins"），且 entry 停在 `pending` 同样算。故：
  * **门不许抛错**：用 `warnMissingCapabilities`（告警 + 返回 false，调用方直接 `return`）做惰性停用；抛错版只给 host half
  * **`inject` 只放跨版本稳定存在的服务**：易变面（如设置读取面 `settingsScope` → 0.1.7-alpha.1 起改名为 `configForms`）走 `ctx.inject([...], cb)` 起的可选依赖 fork——服务出现才装，fork 不进审计的 entry 列表
* **组合行**：`cordis.patch.yml` insert 的 `id` 用短名（供后续 patch 定位）、`name` 用 scoped 包名（loader 按包名解析）
* **版本门**：官方 0.2.1-alpha.4 起，包 `package.json` 一旦声明 `engines.dsh`，兼容性**只**按该 range 判定、`peerDependencies` 被忽略（`workspace:` 值视为不兼容）。故：
  * **包 manifest 只写 `peerDependencies`，不写 `engines.dsh`**——`check:dsh-pin` 锚定 peer 且不扫 `engines.dsh`，手写一份就是同一事实的第二处声明，漂了没有测试会红（`engines.node` 无关，可写）
  * **派生处必须写、且必须由 peer 机械派生（不得手写）**：当前派生处是 `market/index.json`（格式无 peers 字段，而 `dsh-plugin-market` 判兼容时用的是只含 `engines.dsh` 的合成 manifest ⇒ 省略等于宣称「任何宿主都兼容」）。规则：取该版本 `@deepseek-ai/dsh*` peer range，跳过 `workspace:`，多 range 用**空格**连接（`&&` 不是 semver 语法），全 `*` 时省略
  * 将来确要在 manifest 引入 `engines.dsh`：range 必须覆盖所有支持版本，并同步改 `check:dsh-pin` 口径与本文档
* **seam 三档**：① 只用公开 seam（`ctx.llm` / `ctx.webServer` / `ctx.tools` / slots / provide）；② 公开 seam 不够时**包装**它——保持原签名与 `this` 语义、可逆恢复、记录适配版本；③ 允许依赖私有 seam——但不替换 / 不包装 / 不覆写官方函数，优先复用官方写入路径（如 `enqueueOperation` + `setState`），启动时能力检查、surface 变化即 fail-fast，**须 owner 批准并记入 `docs/private-seams.md`**
* **禁止**：monkey-patch 核心、硬编码 dsh 内部目录布局、绕过服务契约直读内部文件（特例须记 `docs/private-seams.md` + owner 认可）
* **查证原则**：引用 DSH 契约前先 grep 官方源码（本机 `~/.dsh-launcher-panel/source`，可用 `DSH_SOURCE` 覆盖），禁止凭记忆编造
* **不许写本机绝对路径 / 用户名**：文档、注释、测试夹具、脚本一律 `~/…` 或占位名；`check:paths` 会把这条钉死

### 插件私有 seam 特例

> 逐插件明细见 [`docs/private-seams.md`](docs/private-seams.md)。

### 插件市场索引（market/）

> 站点 **<https://dsh.pyai.site/>**（双语说明页，默认英文）；索引本体 `https://dsh.pyai.site/market/index.json`，在 DSH **插件 → 发现 → 添加索引源** 填它。官方无官方市场，这是本仓库自己的源。

* **全自动，不用手工重生成**：`market.yml` 在 `Publish` 成功后（以及 `main` 上 `market/**` 变动、每日 03:47 UTC、手动）跑「从 npm 重生成 → 守卫 → 有变化则 bot 提交 `market/` → 发布 Pages」
* **仓库里那份是真值**：`market/index.json`（索引）+ `market/peer-snapshot.json`（各已发布版本的 dsh peer 快照，供守卫离线核对派生值），都由 `pnpm run market:index` 产出——**不手改**。`market/.gitattributes` 固定 LF，避免行尾让 diff 恒脏
* **数据只来自 npm packument**：只读、不下载 tarball、不执行插件代码；版本清单 = 声明了 `dsh.bundle.patch` 的版本
* **`check:market-index` 四条**：① 包名集合 = 活跃插件；② 每插件有中英双语描述 + 至少一个能力标签；③ 每版 `engines.dsh` = 该版 peer 派生值；④ 版本合法 SemVer、降序、且**已发布过的**当前版本在列（以 `peer-snapshot.json` 有记录为「已发布」——bump 到发布之间的窗口不能误红）
  * 新增活跃插件要补 `scripts/market-index.mjs` 的 `ZH_DESCRIPTIONS` 与 `PLUGIN_LABELS`，否则判据 ② 红
  * 改了生成器输入（描述 / 标签）时才需本地跑 `pnpm run market:index` 并一起提交
* **bot 提交用 `GITHUB_TOKEN` 推送，不触发其它 workflow**：部署用本次 run 内的 artifact；`ci.yml` 不会因 bot 提交重跑。有意如此，不为此引入 PAT
* 索引标题中英**都是 `dsh-sparrow`**（不写变体）；落地页 `market/landing.html` 默认英文、可切中文，改它推 `main` 即自动部署

### 发布（npm 包）

> npm 发布**永久**：同版本不可覆盖、整体 unpublish 锁包名 24 小时。

* **范围**：只发有改动的插件
* **元数据**：name 必须 `@dsh-sparrow/<插件名>`；description 英文；`repository` 必填（`--provenance` 要求）；`files` 清单齐备；截图统一放仓库根 `resources/dsh-<插件名>.png`（**不打包**）；README 用绝对 URL 引用 `https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/…`
* **版本线镜像官方 dsh**：alpha 对 alpha、rc 对 rc；只承诺版本号标示的那一条线——环境要求写确切版本（如 `DSH 0.1.5-rc.2`），**禁止写 `>=`**；自家迭代用预发布尾段递增（`0.1.2-rc.1.1`）
* **各插件版本线独立**：根 `package.json` version = 合集整体版本，只在整体升级时动
* **通道**：alpha / beta 发 `next`，rc 与稳定版发 `latest`；`next` 经 owner 验证后用 promote 移 dist-tag（不重发包）
* **owner 的 web profile 固定 `link:`** 直连本仓库插件目录；**profile 级 `cordis.patch.yml` 保持 `[]`**——往 Profile 级 patch 写 insert 会与 bundle 层重复 → `duplicate loader entry id`
* **官方版本跟随**：一事一议、rc 线内对齐最新；影响预判记 `docs/upstream/`；**dsh 升级 = 正式适配任务**（release note → 影响清单 → bump → typecheck → 修 → verify → 发新版）
* **发布确认（硬门禁）**：`git tag` / `npm publish` 前须 owner **当次明确确认**——「之前批准过流程」「按你建议走」「继续」**不构成**许可；agent 停在 push tag 之前报出「插件 / 版本号 / 通道 / 影响范围」
* **流程**：改动 push dev + verify → 版本号 + CHANGELOG 双份 → 再 verify + `git diff --check` → dev→main（ff）并 push → `git tag -a <插件名>-vX.Y.Z -F <说明文件>`（说明用 `node scripts/tag-notes.mjs`；Windows 先输出到文件再 `-F`）→ **逐个** push tag → `gh run watch` + `npm view` 复核 → 切回 dev。版本号只动该插件自己的 `package.json`
* **tag 兜底**：一次推超过 3 个 tag 不生成 push 事件——逐个推，30 秒内没 run 就 `gh workflow run publish.yml -f plugin=<插件名>`
* **红线**：已发布版本 / tag 不可覆盖、不可挪动（重发 E403），错误只能发新版本 + deprecate；tag 版本必须等于 `package.json` version；`secrets` 不能出现在 step 的 `if`（经 job 级 env 中转）
* **发布后收尾（每包各配一次）**：npm 包 Settings → Trusted Publishing → Add Trusted Publisher，填 `peiyucn` / `dsh-sparrow` / `publish.yml` / `npm-publish`，勾 `Allow npm publish`，配完删 `NPM_TOKEN` 并 revoke。**首发例外**：包不存在时 OIDC 无法预配，先用 Automation token 发一次再补配
