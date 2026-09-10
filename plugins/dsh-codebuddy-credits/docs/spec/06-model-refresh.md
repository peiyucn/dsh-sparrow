# 06 · 模型目录手动重新扫描（2026-09-10 提出；同日评审通过并实施）

> 需求由 owner 提出；本文件是开工前的 spec，评审通过后才动代码。所有官方契约均按 checkout
> `dsh-v0.1.5-rc.1` 逐条核验（行号即当时核验位置），核验记录见 `_poc/TEMP/recon-model-refresh.md`。

## 需求与硬约束

- **需求（2026-09-10 owner 收敛）**：CodeBuddy 的可用模型由**企业管理员动态调整**。**首次配置成功后
  就展示模型列表**（只读），并提供**刷新**按钮重新扫描；列表与官方「DeepSeek 配置模型」界面**只模仿布局**，
  **不做自定义 URL**、不做增删行、不做容量编辑——那些是官方自定义 provider 的能力，我们不需要。
- **硬约束（owner 明确）**：刷新**只作用于本 provider**（`codebuddy-credits`），**不得影响任何其他
  provider / 模型目录**（尤其 DeepSeek 官方那套）。
- **参考物**：官方「DeepSeek 配置模型」界面的交互与状态表现。

## 现状（已核）

| 环节 | 现状 |
| :--- | :--- |
| 发现契约实现 | `registerModelDiscovery(NS, …)`（`src/index.ts:344-349`）——只**返回候选**，不落事实 |
| 拉取 | `fetchCodeBuddyModels()`（`src/catalog.ts:265-292`）拉 `/v3/config`，带超时与 DISCOVERY_FAILED 分类 |
| 后台刷新 | `kickModelRefresh()`（`src/index.ts:267-275`）：**60s 冷却 + 单飞**；保存 Key 后触发 |
| 目录更新 | 事实有变化 → `registration.replace([PROVIDER])`（`:256-260`）→ 宿主重建目录 → 选择器实时更新 |
| 事实落地 | 内存事实 `facts`（**不落设置节**，见 spec 01） |

**缺口**：① 没有用户可见、可点击的「重新扫描」入口；② 扫描结果（模型清单/是否有变化）对用户不可见。

## 官方事实（决定设计的几条）

1. **官方 DeepSeek 模型行没有刷新入口**：`DeepSeekModelsEditor` 只有行编辑 / 容量 / 添加 / 重置
   （official `ui-settings-models/src/client/DeepSeekModelsEditor.tsx:151-364`）。所以「参考那个界面」只能参
   **它的布局与状态语言**，不是参它的功能。**可借的布局事实**：一个模型一行（`:26-30` 的行键模型），
   行内字段为 `CatalogField = id / name / contextWindow / maxTokens`（`:20`），容量收在**每行自己的**折叠里
   （`:23`、`:236-249`），数组级动作（添加 / 重置）在行外（`:147-162`），字段标签走
   `styles.modelField` / `modelFieldLabel`（`:243-244`）。**我们只取这个行布局，去掉全部编辑控件。**
2. **官方唯一的「获取可用模型」按钮在 pi-ai 布局**（`ModelListEditor.tsx:337-347`）：点击 →
   `operations.discoverModels(settingsNs, {provider, baseURL, api, apiKey})` → host
   `remote.llm.discoverModels` → 按 `settingsNs` 找注册回调（official `llm/llm/src/index.ts:587-617`）。
   语义是 **per-provider / per-草稿**：只回候选数组、**不写** settings/credentials、**不改**任何目录、不发事件。
3. **官方两处"全局刷新"不能用于我们**（列为禁止项）——
   `ModelCatalogDirectory.refresh()`（全 provider 重读）与子代理卡的 `refreshCatalog → remote.session.modelCatalog()`
   （host 侧对**每个** provider 调 `listModels + resolveModelInfo`，全局扇出）。
4. **我们现有链天然只动自己**（已给结论 + 证据）：registration 由 `registerAdapter([PROVIDER])` 创建
   （`src/index.ts:128`），`replace` 只动该 handle 的 owned 集合（official `llm/llm/src/index.ts:390,454-460`），
   随后是 **payload-free** 的 `llm/adapters-updated` 通知（:454-462）——只让客户端重读数据，不改任何
   provider 数据、不触发他人发现。唯一"全局面"就是这条通知，属官方标准做法、不可消除也不必消除。
5. **slot 能力边界**：官方组件不可 import（client 入口只导出 `apply/refreshIfLoaded` + 类型）；
   `settings.models.provider-card` 的 owner props 只有 `{provider, configured, keyConfigured}`——
   **不含模型列表、也不含刷新动作**，所以 UI 与刷新都得我们自己在卡里做。

## 方案对比

### P1（**推荐**）自建 host 路由 + 卡片按钮
按钮 → `POST /api/codebuddy-credits/refresh-models`（沿用 `web.ts` 现有 prefix 与 localOnly 栅栏）→ host
「重拉 `/v3/config` → 落 facts → `registration.replace([PROVIDER])`」→ 返回 `{ok, changed, models, account}`。

- **只碰自己**：全程在插件自己的路由与自己的 registration handle 内，不依赖任何宿主新能力 → **无能力门需求，旧宿主同样安全**（符合 fail-safe 硬约束）。
- 手动路径**绕过 60s 冷却**（否则点了没反应被静默吞），但**复用同一单飞** `refreshInFlight` 防并发。
- 用户拿到 `models` 与 `changed`，可以就地展示清单并提示"无变化"。
- 代价：多一条自有路由 + 卡片里加一块 UI（`docs/spec/01-ui-redesign.md:82` 记载早期曾有过 `/refresh-models`，后删除；本次按新需求重建，语义更明确）。

### P2（备选，可后合并）走官方 `remote.llm.discoverModels`
卡片直调 `ctx.remote.llm.discoverModels('llm-codebuddy-credits', {provider:'codebuddy-credits'})`，
并把 `registerModelDiscovery` 回调**改造成「落事实 + replace」**（现在只回候选）。

- 好处：走官方正路、UI 语义与官方 pi-ai 布局一致。
- 代价/坑：返回值**只有** `id/name/contextWindow/maxTokens`（official `llm/llm/src/types.ts:289-298`），
  积分系数等事实必须由**回调内部**用完整 entry 落，不能拿返回值重建；必须**惰性接线 + 能力门**
  （不可把 `remote.llm` 写进硬 `inject`，缺服务＝整插件不启动）。
- 结论：可作为 P1 的**后续合并项**——两条路共用同一段 host 逻辑，届时只换触发面。

### P3（**否决**）复用官方模型页的刷新入口
我们命名空间在官方走 unknown 布局（`ProviderEditor.tsx:490-492,504-507` 只渲染 advancedHint 且提交禁用），
且 pi-ai 的"获取可用模型"语义是**把候选写进设置 `models` 数组**，与「目录不落设置节」的既定设计冲突
（spec 01:36-39）。

## 选定设计（P1）

**host**
- 新路由 `POST /api/codebuddy-credits/refresh-models`（沿用现有 prefix 与 localOnly；与 `/status`、`/quota` 同族）。
- 逻辑：`resolveApiKey()` → `fetchCodeBuddyModels()` → `sameFacts` 比较 → 落 `facts` →
  有变化才 `registration.replace([PROVIDER])` → 响应 `{ ok: true, changed, count, models: [{id,name,credits?}], account }`。
- **单飞**：与后台刷新共用 `refreshInFlight`；并发请求合并到同一次落定（不排队、不重复拉上游）。
- **绕过冷却**：手动路径不受 `MODEL_REFRESH_COOLDOWN_MS` 限制（该冷却只约束自动路径）。
- 失败：沿用 `fetchCodeBuddyModels` 的错误分类，映射为 `{ ok:false, error:{code,message} }`；
  未配 Key → 400 且文案明确（前端也会禁用按钮，双保险）。

**client（就是我们那张卡内新增一块）**

> 「卡片」= 设置 → 模型 里 **CodeBuddy Credits 那一行的配置卡**：现在渲染的是 `<div class="ccb-card-root">`
> （`src/client/CodeBuddyCreditsCard.tsx:338-395`），内容是 Key 输入框 + 保存 / 清空按钮。本次在它**之下**
> 加一块「可用模型」区，不新增别的落点。

- **出现时机**：**首次配置成功后**（有 Key 且至少一次发现成功）就渲染列表；未配置 Key 时列表不出现
  （只保留现有 Key 输入区）。
- **布局**：照官方 DeepSeek 编辑器的行布局——**一个模型一行**，左侧模型名、右侧只读事实（积分系数；
  有容量事实也同排展示），**无编辑控件、无添加 / 删除行、无折叠**。
- **刷新**：一个刷新按钮；点击调 P1 的 host 路由。（设计稿里的「上次刷新时间」**未实现**，见实施记录。）
- 文案**照抄官方** `settings.models` 的 `fetchModels`「获取可用模型」/ `fetching`「正在询问提供方…」/ `retry`「重试」
  （official `ui-settings-models/src/client/locales.ts:67-77,174-184`）——按仓库既有做法**同词抄进本插件词典**，
  不引官方组件（官方 client 入口不导出组件）。
- 按钮措辞用官方的「获取可用模型 → 正在询问提供方…」，不自造「扫描」。
- 状态：idle / scanning（按钮转圈 + disabled）/ ok（列表 + 「已是最新」或「已更新 N 个模型」）/ error（可见反馈 + 重试）。
- 列表**只读**；**不写任何设置节**、**不自动改选中的模型**、**不提供自定义 URL**（Key 决定一切）。

**明确不做**
- 不 emit `llm/adapters-updated`（由 `registration.replace` 自然产生）。
- 不碰任何非 `codebuddy-credits` 的 provider / 设置节 / 凭据。
- 不在刷新后自动切换用户当前选中的模型（选择器对未知 id 已有兜底：`CodeBuddyModelSelect.tsx:293-294`）。

## 禁止项（越界即回退评审）

- 用 `remote.session.modelCatalog()` 或任何"全局重读目录"当作刷新实现。
- 自行 emit `llm/adapters-updated`。
- 对非 `PROVIDER` 注册 / `replace`，或探测他人的命名空间。
- 读写他人的设置节 / 凭据。
- 触碰官方客户端内部对象（`ModelCatalogDirectory`、官方 store、`refreshIfLoaded` 都拿不到）。
- 加定时器反复重读全局目录。

## 风险与对策

| 风险 | 对策 |
| :--- | :--- |
| 连点 / 自动与手动并发 | 共用单飞；UI 侧 scanning 期间 disabled |
| 手动点被冷却静默吞掉 | 手动路径绕过冷却（冷却只约束自动路径） |
| 刷新发生在推理中 | 目录成员资格是 advisory，未知 id 有兜底（official `llm/llm/src/types.ts:300-301` + 我们 `adapter.ts:308-317`）→ 安全 |
| 刷新后已选模型不在新清单 | **不自动改选**；选择器已有兜底显示 |
| Key 未配置 / 401 / 离线 | 未配 Key：按钮禁用 + 400；401 目前**无法区分**「Key 失效 / 无 CLI 权限」（未实测响应体）→ 文案给通用指引 |
| 旧宿主缺能力 | P1 不依赖宿主新能力 → 无需能力门；若将来并入 P2，必须惰性接线 + 能力门 |

## 开放问题（评审时请 owner 定）

1. **打开设置页是否要自动扫一次**？现状自动路径只有「保存 Key 后」与「宿主建目录被动刷新」（60s 冷却）。
   我建议**不新增**「打开即扫」——列表在首次配置成功后就有，之后靠手动刷新，最省请求也最可预期。
2. 刷新成功后是否一并显示**账号 / 企业名**？倾向**不做**：额度卡里已有，卡里再放一份属信息重复。
3. 401 文案：目前**无法区分**「Key 失效」与「无 CLI 权限」（响应体未实测），是否接受一句通用指引
   （如「请在 CodeBuddy 侧确认该 Key 具备 CLI 模型权限」）？

## 实施记录（2026-09-10）

- host：`POST /api/codebuddy-credits/refresh-models`（`src/web.ts`，沿用 prefix + localOnly；未配 Key → 400）；
  逻辑在 `src/index.ts` 的 `refreshModelsManually()`：**绕过 60s 冷却**、与自动路径**共用上游单飞**
  （新增 `loadFactsOnce()`，两条路径都走它），落 facts 后有变化才 `registration.replace([PROVIDER])`。
- client：卡里新增只读清单 + 「获取可用模型」按钮（`CodeBuddyCreditsCard.tsx`）；新增纯逻辑
  `src/client/format.ts`（容量短串，口径对齐官方编辑器）并补单测 `test/format.test.mjs`；
  词典中英各加 7 键、`slot-contract.d.ts` 的 `LocaleNamespaceMap` 同步。
- 按评审结论落定：**不新增**「打开设置即扫」（列表在首次配置成功后就有，之后手动刷新）；
  不在卡里重复展示账号/企业名；401 文案用通用指引（未实测响应体，无法区分 Key 失效与无 CLI 权限）。
- **未实现**：刷新按钮旁的「上次刷新时间」（设计稿有、实现省略；刷新结果改用状态行
  「已是最新 / 已更新 N 个模型」反馈）。
- **路由级测试已补**（0a70f9d，2026-09-10）：`test/web-route.test.mjs` 用最小 mock ctx 走真实
  `installCodeBuddyWeb`，覆盖成功有变化 / 成功无变化 / 未配 Key 400 / 非回环 403 / 上游失败 400 五条路径。

## 测试与验证

- 纯逻辑：`format.ts`（容量短串 / 只读事实串）、`catalog.ts`（事实映射 / SSE 解析 / 请求构造）
  等有单测（`test/format.test.mjs`、`test/catalog.test.mjs`）；
- 路由：**已覆盖**（`test/web-route.test.mjs`，5 条路径：成功有变化 / 成功无变化 / 未配 Key 400 /
  非回环 403 / 上游失败 400）；
- **未覆盖**：手动绕过冷却但复用单飞——`loadFactsOnce` 与 `sameFacts` 是 `apply` 内闭包，路由测试
  只 mock 了 `shared.refreshModels`（第四轮审计 S2，留作后续欠账）；
- 插件 `npm run verify` 全绿 + 根 `pnpm run verify:all` 全绿 + `git diff --check` 干净。
