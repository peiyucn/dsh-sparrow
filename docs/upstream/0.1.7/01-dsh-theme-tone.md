# 01 · dsh-theme-tone — **需重设计**（不退役）

## 1) 定位与结论

「明暗主题之下的色调层」：每轴一款「官方默认」+ 若干色调，色调驱动底色/左栏/抬升面，另含顶栏与输入框玻璃。
**结论：官方没有做色调，插件不退役；但实现方式要从「自铺静态样式表」改成官方 `ctx.theme` 的注册/覆盖 API（§3 有硬证据）。** 这是六份里改动最大、决策最多的一个。

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ❌ **API 已移除**：`settings.register(ns, schema)` 在 alpha.2 不存在（设置改为插件自导出 Cordis `Config`，命名空间 = profile entry id） | `packages/settings/settings/src/index.ts:266-367`（无 register）；rc.2 `:419`；`docs/subsystems/settings.zh.md:9,38-70`；我方 `src/host.ts:26` |
| client | ⚪ **按设计惰性停用**（不抛错、不拖垮宿主）：`settingsScope` 在 alpha.2 全树 0 命中，已改名 `configForms` | 真机：0.1.7-alpha.2 下无 `style[data-dsh-theme-tone]`、宿主正常启动；`ui-settings/src/client/config-form.ts:241-302` |

**官方新事实（决定重设计方向）**：

* 三方色调仍是官方扩展点：「第三方主题可通过 `ctx.theme` 注册别名 token 覆盖」（`ui-theme/README.zh.md:12`），且直言「第三方主题是扩展点，不是产品」（`:103`）。
* `ctx.theme.overrideTokens(source, tokens)` **本版完全没变**（签名/校验/层叠：`ui-theme/src/client/index.ts:309-318`、`:384-404`），且有 14 个受认可 token 白名单（`:131-146`）与 `exportInspectTokens()`（`:211`）。
* 官方强制覆盖值必须 `{light, dark}` 成对（裸字符串抛教学式错误 `:384-404`）—— 与 theme-tone「每轴一套」的口径一致。
* **官方分工（是分工，不是禁令）**：`docs/web-styling.zh.md:5` 写明该文档规定的是**浏览器客户端包**（仓库内功能包）的样式职责 —— 全局主题（`--dsw-*` 静态色阶、语义别名、明暗偏好、全局样式表）归 `ui-theme`（`:9,11`），功能包只许用语义别名、不得写颜色字面量、不得含主题选择器（`:17,18`）；第三方扩展点是 `ctx.theme`（`ui-theme/README.zh.md:12`）。theme-tone 的自铺静态表是在**手工复制主题层的职责**，所以换到 API 更合官方分工 —— 但这条文档对第三方插件不构成禁令。
* **一条我方当前会违反的明文规则**：半透明 `--dsw-specific-menu` 填充的高层级表面**必须在同一规则中**加 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（`docs/web-styling.zh.md:25`）；我方现在 opaque 覆盖该 token 且不配 filter，既破了这个配对、也吃掉官方菜单玻璃（详见 §3 第 6 条）。
* **官方没覆盖的两块**：① 色调预设/自定义 CSS（外观行硬编码 light/dark/system 三个 cube，`ui-theme/src/client/AppearanceRow.tsx:31-35`）；② 自绘背景与质感（官方新增玻璃只到菜单/停靠面板，**顶栏与输入框不在内**）。
* **官方对三方主题的立场：支持（别误读成「不推荐做」）**：
  * 产品文档明写「**第三方主题可通过 `ctx.theme` 注册别名 token 覆盖**」（`ui-theme/README.zh.md:12`）；README 另有独立小节「**注册主题**」（`:34-36`）：「覆盖层按注册顺序折入活动快照的 token 中。移除其中一个绝不会覆盖最后一个持久化的内置偏好。」
  * 公开 API 目录同样收录：`overrideTokens`「stacks partial token layers over the active theme without touching the registry」（`packages/extensions/cordis-client-runner/src/client/api-catalog.ts:264`）。
  * 已知限制只有两条（`:101-104`）：①「**第三方主题是扩展点，不是产品**」= 不校验一组覆盖是否完整、不进官方外观行、不跨 settings schema 持久化 —— 说的是**不做产品级配套**，不是不推荐做；②「**token 样式表是颜色值的唯一权威来源**」= 设计系统里缺的值不会为某个三方配色补上，只能用最接近的语义 token。
  * 与 `web-styling.zh.md` 的关系：那四条写给**仓库内功能包**（该文档 `:5` 限定受众），目的是官方功能包不各自为政，**不是**对第三方主题插件的禁令。
  * → **做主题插件被官方支持**；官方不补的配套（色调选择行、持久化、自绘背景/玻璃）由插件自己承担 —— 与本插件「需重设计、不退役」的判定一致。
* **两个天花板**：三方主题 id 不跨内置 settings schema、**无法持久化**（`ui-theme/src/client/index.ts:232-240`，README 明说「仍是进程内扩展」`README.zh.md:36`）；注册的主题**不会出现在官方外观行**。

## 3) 改动清单

**host half**：`src/host.ts` 改导出 Cordis `Config`（schemastery），命名空间语义从「自注册命名空间」变成 profile entry id；`src/compat.ts:69`、`host.ts:4` 的相关说明同步。

**client half（8 条，逐条落点）**：

1. `src/client/index.ts:16` 类型 `SettingsScope` → `ConfigForm`。
2. `index.ts:154` `ctx.inject(['settingsScope'], …)` → 等 `'configForms'`；**跨版本起两个 fork**（rc.2 线只有 `settingsScope`，0.1.7+ 只有 `configForms`），两者都**不能**进模块级 `inject`（否则 entry 永久 pending → 宿主整页失败，`boot-client.ts:79-81` 已确证）。
3. `index.ts:249-251` `ctx.settingsScope.bind({namespace})` → `ctx.configForms.get<T>(entryId)`（`config-form.ts:293-302`）。差异：按 entryId **缓存共享**；**无 `decode` 钩子**（需自行校验 snapshot）；生命周期归 provider。
4. `index.ts:482` `scope.set()` 现在返回 `Promise<boolean>`（`config-form-types.ts:58,68,76`；memory 模式恒 `false`）—— 可借 `false` 补「写入失败」的用户可见反馈。
5. 注释/文档同步：`index.ts:231` 引用的 `settings-scope.ts:71` 已不存在；`index.ts:140-152` 关于 `settingsScope` 的说明要改。
6. **`--dsw-specific-menu` 前提失效**：`tones.ts:284,320` 假设该 token = `var(--dsw-alias-bg-layer-3)`；官方已改成半透明玻璃色 + `backdrop-filter: var(--dsw-menu-backdrop-filter)`（`packages/client/web/src/base.css:44`）—— 我方不透明覆盖会**盖掉官方新玻璃**，`tones.ts` / `surface.ts:10-25` 的推理要按新事实重写。
7. `--dsw-static-deepseek-400` 值变（`rgb(103,158,254)` → `rgb(122,170,255)`）：直接影响小，但按官方字面量比对同族色的地方要同步。
8. `[data-sidebar-right-float-host]` 锚点已删（alpha.2 全树 0 命中；rc.2 在 `ui-sidebar-right/.../SidebarRight.tsx:333`）—— 玻璃/缝挡板引用它的规则要换锚点。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **静态样式表 → `overrideTokens` 的边界**：建议「颜色类全迁 token 覆盖；背景层（渐变/颗粒）与需要结构性选择器的玻璃保留静态表」。要不要更激进（连玻璃也尽量 token 化，接受能力缩水）？
2. **玻璃去留**：官方本版给菜单加了玻璃（`--dsw-menu-backdrop-filter`），但**顶栏与输入框仍没有**。我方的顶栏/输入框玻璃是否继续保留（这是全插件唯一「刻意改官方默认」的地方）？若保留，是否要与官方菜单玻璃对齐材质。
3. **`--dsw-specific-menu` 冲突怎么处理**：跟随官方玻璃（放弃对该 token 的不透明覆盖，弹层观感回官方）vs 继续覆盖（主题一致性优先，但吃掉官方新玻璃）。
4. **设置行与持久化**：继续挂 `settings.general.item`（槽位仍在、kind/scope 未变），但命名空间改为 entry id；三方主题 id 不能持久化这件事维持现状（自建行 + 自有持久化）还是借 `whileServed` 之类新能力简化。
5. **退役条件更新**：现 spec 写「官方提供色调/自定义 CSS 后退役」。官方本版已把**玻璃**做进菜单 —— 要不要把退役条件改得更精确（例如「官方外观行支持色调或自定义 CSS」才算）。

## 5) 验收口径 / 未核实项

* 8 款色调逐一真机核：底色 + 光晕 + 抬升面；**官方默认档与停用插件逐像素一致**；设置行出现且位置在「外观」正下方；点选即时生效；重启后保留（rc.2 线）。
* 两条线都要跑（本次改动最重，必须双 fork 都验）。
* 未核实：`html[data-platform='darwin']` 下 `--dsw-specific-menu` 的最终生效值（`base.css:48,52` 覆盖为 .94）—— 需一次 `getComputedStyle` 取样，决定第 3 条的改法。
