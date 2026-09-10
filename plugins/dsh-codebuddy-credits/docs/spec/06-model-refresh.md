# 06 · 模型目录手动重新扫描（2026-09-10 提出，**待评审**）

> 需求由 owner 提出；本文件是开工前的 spec，评审通过后才动代码。所有官方契约均按 checkout
> `dsh-v0.1.5-rc.1` 逐条核验（行号即当时核验位置），核验记录见 `_poc/TEMP/recon-model-refresh.md`。

## 需求与硬约束

- **需求**：CodeBuddy 的可用模型由**企业管理员动态调整**，用户需要能主动「重新扫描」并看到扫描结果，
  而不是只能等节流窗口或重开页面。
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
   （official `ui-settings-models/src/client/DeepSeekModelsEditor.tsx:151-364`）。所以"参考那个界面"只能参
   **它的交互与状态语言**，不是参它的功能。
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

**client（`settings.models.provider-card` 内）**
- 在现有卡里加一块「可用模型」区：**刷新按钮** + 上次扫描时间 + 结果。
- 文案**照抄官方** `settings.models` 的 `fetchModels`「获取可用模型」/ `fetching`「正在询问提供方…」/ `retry`「重试」
  （official `ui-settings-models/src/client/locales.ts:67-77,174-184`）——按仓库既有做法**同词抄进本插件词典**，
  不引官方组件（官方 client 入口不导出组件）。
- 状态：idle / scanning（按钮转圈 + disabled）/ ok（清单 + 「已是最新」或「已更新 N 个模型」）/ error（可见反馈 + 重试）。
- 模型清单**只读展示**（name + 积分系数，若服务端声明）；**不写任何设置节**、**不自动改选中的模型**。

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

## 开放问题（评审时请owner定）

1. **卡里是否列出模型清单**（我建议列：只读，name + 系数）？还是只给「已更新 N 个 / 已是最新」？
2. **是否保留"打开设置页自动扫一次"**？我建议保留（复用现有冷却），但把冷却从 60s 调到一个更适合"打开设置"的窗口（如 5 分钟），避免频繁开页面就发请求。
3. 刷新成功后是否需要把**账号/企业名**一起展示（响应已带 `account`，现在额度卡里有）？

## 测试与验证

- 纯逻辑：`refreshModels` 的响应组装、`sameFacts` 比较、错误映射 → 单测；
- 路由：未配 Key / 上游失败 / 成功无变化 / 成功有变化 四条路径（沿用 `host-route` 类测试）；
- 手动绕过冷却但复用单飞：并发两次请求只发一次上游；
- `pnpm run verify` 全绿 + `git diff --check` 干净。
