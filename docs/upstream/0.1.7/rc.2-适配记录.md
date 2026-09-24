# dsh-sparrow × dsh 0.1.7-rc.2 适配记录

> 分支 `dsh-0.1.7`｜适配对象：官方 checkout tag `dsh-v0.1.7-rc.2`（`787b746b80`）
> 上一轮（rc.1）的完整报告见 [`适配完成报告.md`](适配完成报告.md)；本文件只记 **rc.1 → rc.2 的增量**。
> 触发：owner 升级到 rc.2 后报「几乎所有插件又挂了」（六个活跃插件在启动时被版本门整批跳过）。

---

## 1. 一句话结论

**rc.2 让六个插件全部启动失败的直接原因是版本门**（peer 依赖是**精确版本** `0.1.7-rc.1`，运行时是 `0.1.7-rc.2`，官方 `evaluatePluginCompatibility` 用 `semver.satisfies` 精确比对 → 全部判为不兼容并 skip）。
升线到 rc.2 之后，**只有 file-manage 有一处真破坏**（官方 `DeepSeekFilesClient` 构造签名 `apiKey` → `headers`），其余五个插件 typecheck / 测试零改动即可用；
theme-tone 另有一处**必须跟着 rc.2 新材质架构走**的绘制层（官方新的 `MenuSurface` 把材质画进了 `z-index: -1` 的子元素）。

---

## 2. 根因：精确版本 peer 被 rc.2 判为不兼容

用户实例的启动日志（`dsh-launcher-panel\logs\server.log`）逐条写明了 skip 原因：

```
dsh: skipping profile bundle "@dsh-sparrow/dsh-theme-tone": Error: Plugin
  @dsh-sparrow/dsh-theme-tone@0.1.5-rc.2 is incompatible with dsh 0.1.7-rc.2:
  peerDependencies {"@deepseek-ai/dsh-settings":"0.1.7-rc.1"}. …
```

官方判定代码（`packages/boot/app-boot/src/plugin-compatibility.ts:71-79`）：

```ts
const requirement = ['workspace:^','workspace:~','workspace:*'].includes(range) ? runtimeVersion : range
if (requirement.trim() === '' || !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })) {
  peers[name] = range
}
```

即：**peer 写什么就按什么判**。我们上一轮按仓库既定口径（AGENTS《发布 · 版本线镜像官方 dsh》「只承诺版本号所标示的那一条线」）写的是**精确** `0.1.7-rc.1`，
所以 rc.2 一上线，六个插件里的五个（nav-pin 没有 dsh peer，不受影响）就被整批跳过 —— 这是**设计如此**的 fail-safe，不是 rc.2 的 bug。
**口径不变**：本次仍写精确 `0.1.7-rc.2`；日后每次 dsh 升 rc 都是同一件「正式适配任务」。

---

## 3. 依赖升线（仓库级）

| 面 | 动作 |
| :--- | :--- |
| `plugins/*/package.json` | 官方包 peer + dev 依赖 `0.1.7-rc.1` → `0.1.7-rc.2`（archive-manage 21 处、chat-fim 14、codebuddy 22、file-manage 15、theme-tone 9） |
| `pnpm-workspace.yaml` | `overrides` 闭包按 `dsh-v0.1.7-rc.2` 的 manifests **重算**：官方 dsh 包 83 → 83（同名同集，只换版本号）+ cordis `4.0.4`；`minimumReleaseAgeExclude` 逐条放行 rc.2 的 83 个包 + 7 个非 dsh 官方包 |
| `pnpm-lock.yaml` | 重算；**零 `0.1.7-rc.1` 残留**（验收口径） |
| 6 插件 × 中英 README | 环境要求版本线 → `0.1.7-rc.2` |

闭包重算方法（与上一轮同法，`_poc/TEMP/compute-closure.mjs` 改版本号即可）：从六个活跃插件的 `dependencies`/`peerDependencies`/`devDependencies` 出发，
按 checkout 里每份 manifest 的 `dependencies` + `peerDependencies` 边做传递闭包（含 `apps/`、`vendor/`），**已退役的 vision-bridge 不参与**。

---

## 4. rc.2 真正影响我们的契约变化

### 4.1 `DeepSeekFilesClient` 构造签名 `apiKey` → `headers`（**真破坏**，唯一一处）

```diff
 interface FilesApiOptions {
   baseURL: string
-  apiKey: string
-  /** Use the DSH account header; omitted for ordinary API keys. */
-  accountCredential?: boolean
+  /** Provider-resolved authentication headers for this endpoint. */
+  headers: Readonly<Record<string, string>>
   fetch?: typeof fetch
 }
```

`packages/llm/llm-deepseek/src/files-api.ts:139-149`（rc.2）：构造只存 `headers`，请求时 `Object.entries(this.authHeaders)` ——
传旧参数 `apiKey` 时 `authHeaders` 是 `undefined`，**每次 list / delete 都在运行期抛错**，而**导出符号一个没少**，能力门（只查存在性）抓不到。

落点（`plugins/dsh-file-manage`）：

* `src/files.ts`：新增 `API_KEY_HEADER` / `authHeaders(apiKey)`；新增 `probeFilesClientShape(Client)` —— 用官方 client 自己的 request 路径跑一次**无网络**往返（fetch 由探针注入、端点是 RFC 2606 的 `.invalid`、带 2s 超时兜底），断言 key 头真的被发出去。
* `src/host.ts`：`DeepSeekSurface` 的构造面改成 `{ baseURL, headers, fetch? }`；三处构造点改为 `headers: authHeaders(connection.apiKey)`；`deepSeekSurface()` 里加**形状门**——探针不过就抛 `UNSUPPORTED_HOST`（宿主半边按既有约定自停用，文案「升级本插件后自动恢复」）。
* `test/base-url.test.mjs`：stub fetch 除 URL 外**同时钉住认证头**（`x-api-key` / `anthropic-version` / `anthropic-beta`），并补形状门的正反用例（rc.2 官方 client → true；只认 `apiKey` 的旧签名 → false）。

> 「只钉 URL」正是本轮三连红没被更早发现的原因：URL 归一化没变，**变的是参数名**。

### 4.2 官方新材质层：`MenuSurface` 把填充 + 模糊画进 `z-index:-1` 的**子元素**

rc.2 新增共享菜单原语 `packages/client/ui-primitives/src/MenuSurface.tsx` + `MenuSurface.module.css`：

```css
.surface { isolation: isolate }           /* 自己成层叠上下文 */
.material { position: absolute; inset: 0; z-index: -1;   /* ← 官方材质是**子元素** */
            background: var(--dsw-menu-surface-fill);
            backdrop-filter: var(--dsw-menu-backdrop-filter) }
```

绘制顺序（元素自身背景 → **负 z-index 子层** → 块级 → 行内 → …）意味着：
**我们画在元素 `background-image` 上的颗粒与光，会被官方这层材质整个盖住**。
我们的修法（本轮 WIP 定稿）是把同一串图层**再画一份到 `::before`**（`::before` 默认是行内级、`position: static`，绘制在「负 z-index 子层」**之后**）——
`plugins/dsh-theme-tone/src/surface.ts`：`SURFACE_ANCHORS` 与 `COMPOSER_CARD_ANCHORS` 各补一条 `…::before { background-image: … !important }`，**两层都留**（材质画在元素自己身上的那些面只有前一条生效）。

**真机 A/B 像素证据**（隔离实例 3098，官方 `[data-menu-material="translucent"]`「完全权限」菜单，145×110）：

| 状态 | computed style | 与「无 ::before 层」的像素差 |
| :--- | :--- | :--- |
| 元素 | `background-image` = 我方颗粒 SVG；`backdrop-filter: none` | — |
| `::before` | `background-image` = 我方颗粒 SVG；`position: static`；`z-index: auto` | 剥掉 `::before` 规则后：**mean abs diff 12.663 / px，最大通道差 181，92.48% 像素变化（>6）** |
| 子元素 `._material_*` | `position: absolute; z-index: -1; background: rgba(67,69,74,.45); backdrop-filter: blur(40px) saturate(1.5)` | 官方材质，画在我们元素级图层**之上** |

⇒ 那条 `::before` 不是冗余，**是 rc.2 下质感可见的唯一通道**。

### 4.3 菜单填充 token 改名（对 Windows 无影响）

`--dsw-specific-menu` 不再直接是 rgba，而是 `var(--dsw-menu-surface-fill)`（浅 `rgba(248,249,250,.58)` / 深 `rgba(67,69,74,.45)`），
且 `html[data-platform='darwin'] body` 上另给近不透明值（macOS 原生 vibrancy 无法 backdrop-blur）。
我们所有弹层都用**官方成对写法**（`background: var(--dsw-specific-menu)` + `backdrop-filter: var(--dsw-menu-backdrop-filter)`），
在 Windows（本机即 `data-platform` ≠ darwin）上语义不变 ⇒ **零改动**。

### 4.4 其余 rc.2 变更（核对过，不影响我们）

| 变更 | 核对结论 |
| :--- | :--- |
| `SESSION_FORMAT_VERSION` | rc.2 仍为 **4**（`packages/core/session/src/types.ts:89`）⇒ archive / chat-fim 的格式门集合 `[0,3,4]` 不变 |
| 官方 `llm-deepseek` 内部重构（`resolveAuth` / `discoverModels` / `listModels` / `MESSAGES_TOOL_CHANGES_BETA`） | 全是官方 adapter 内部面；codebuddy-credits 只用 `@deepseek-ai/dsh-llm` 的公开接口，typecheck 全绿 |
| 新圆角 token `--dsw-radius-*`、`--dsw-mask-blur: none`、新增 `focus.css` / `onboarding.css` | 我们没声明过这些面，不受影响 |
| 官方新增 `[data-menu-material]` 稳定属性 | 现有锚点（`role='menu'` 等）实测已命中同一元素（见上表），本轮不为此改锚点表（避免动 `SURFACE_ANCHORS` 的既有验收口径）；记为后续可选加固点 |

---

## 5. 验证证据

**① 官方版本门（用装机的 rc.2 `dsh-app-boot` 实跑，不是复述）**

```
$ node _poc/TEMP/gate-check.mjs        # require 官方 dsh-app-boot@0.1.7-rc.2 的 evaluatePluginCompatibility
runtime = 0.1.7-rc.2
dsh-archive-manage ok / dsh-chat-fim ok / dsh-codebuddy-credits ok
dsh-file-manage ok / dsh-nav-pin ok / dsh-theme-tone ok      → 全部放行
```

**② 隔离实例真机（独立 `DSH_HOME` + 独立 profile junction，端口 3098，未触碰 owner 的 3080 实例）**

* 启动日志**零** `skipping profile bundle`；
* 页面 `plugins/??…` 里六个插件全在（`@dsh-sparrow/dsh-*`），且**无** `Failed to load plugins`；
* Edge 实测：`[data-composer-card]` 已挂载、body 内联 style 40 个 `--*` 变量（overrideTokens 生效）、`--dsh-theme-tone-grain-alpha` 在、
  theme-tone 样式表 49,146 字符 / 19 条 `::before` 规则、侧栏出现「归档」「云端文件」、输入区出现 FIM；
* console 只有一条 Chromium 的 password-field 提示，**零 error**；
* 官方菜单实物（截图 + computed style）见 §4.2 表。

**③ 全仓 `npm run verify` = 891 通过 / 0 失败**

| 插件 | 测试数 | 结果 |
| :--- | ---: | :--- |
| dsh-archive-manage | 188 | 全绿 |
| dsh-chat-fim | 202 | 全绿 |
| dsh-codebuddy-credits | 160 | 全绿 |
| dsh-file-manage | 65（新增形状门正反用例 + 认证头断言） | 全绿 |
| dsh-nav-pin | 37 | 全绿 |
| dsh-theme-tone | 239 | 全绿 |
| **合计** | **891** | exit 0 |

---

## 6. 未做 / 待 owner

* **发布动作（版本号 + CHANGELOG + tag/npm publish）未做**：仓库 AGENTS《发布（npm 包）》要求 tag / npm publish 前 owner 当次点头；本轮只把代码适配到 rc.2。
* owner 的 web profile 里六个插件处于**停用**状态（不在 `dsh.profile.bundles` 里）——修好后需在 dsh 插件面板重新启用；**namespace 与配置无需改**。
* codebuddy 分组模型标题的 sticky 修复（`position: sticky` 从标题挪到 `<section>`）本轮随同提交，但其真机交互复验（滚动分组菜单）**未完成**；rc.1 阶段的最小复现已证明「section 粘住后不会被下一个 section 顶出容器」。
* 主题轴/色调状态、官方 `ModelSelect` 分类标题等 rc.1 遗留项见上一轮报告 §6，rc.2 未新增问题。
