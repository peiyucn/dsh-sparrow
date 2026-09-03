# 01 — UI 重构：模型列表展示、配置页极简、聊天头部额度卡

> 状态：已实现（2026-09）。基线：00-overview.md 的宪法不变——官方 Key、无 Key 零网络、
> 模型列表完全由 Key 驱动、请求形状对齐官方 CLI。

## 需求（owner 五点）

1. 模型列表展示模型的原生视觉能力。
2. 模型配置页不自建 UI——对齐 DeepSeek 的交互；删掉模型列表功能；
   每次打开选择器自动刷新模型列表。
3. 企业/个人账号信息只在配置页展示；聊天框右上角放一个小卡片（CodeBuddy
   logo 图标），展开显示账号信息、额度余额、重置周期。
4. 小卡片同时展示当前选中模型的有用信息。
5. 积分系数在模型列表右侧对齐；`x0.00` 显示 `free`。

## 设计决策

### 展示名承载系数与视觉标记（1、5）

官方模型选择器（`ui-model-selection` 的 `ModelSelect.tsx`）只渲染
`model.name`，没有描述列、没有能力徽章位。因此系数与视觉标记都附加进
展示名：

- 格式：`原始名 + 两个空格 + 标签`，标签以 ` · ` 分隔：
  `GLM-5.3  x0.79 · 👁`、`Hy3  free · 👁`、`GLM-5.3  x0.79`。
- `creditLabel`：`x0.79 credits` → `x0.79`；数值为 0（含 `x0.00`）→ `free`；
  服务端未声明系数时无系数标签。
- `👁` 标记只在 `supportsImages === true` 时出现。
- 「右侧对齐」不可行（选择器无列布局，名称是单一 span），空格分隔是 owner
  接受的兜底。
- 除名字外，`inputModalities` 也进入 `listModels`/`resolveModel` 的真实能力
  声明（text-only 是显式负能力，image 模型声明 `['text','image']`）——这同时
  修正了此前 `PreparedLlmCall.inputModalities` 缺省导致视觉路由可能被
  门禁的问题。

### 模型列表功能删除 + 自动刷新（2）

- 设置节 `providers.<provider>.models` 字段删除：模型列表不再落设置文件，
  完全由 Key 授权下的 `/v3/config` 决定（模型事实只存进程内）。
- 配置页卡片对齐 DeepSeek 极简交互：Key 输入 + 保存/移除 + 账号一行。
  配额行、刷新按钮、模型数量、激活状态全部移出（配额进聊天头部卡）。
- 自动刷新走公开 seam：适配器 `listModels` 被宿主调用的时刻 = 宿主重建模型
  目录（模型选择器建目录、`llm/adapters-updated`、`settings/document-updated`、
  `credentials/reference-updated`）。插件在该时刻做节流后台刷新
  （`MODEL_REFRESH_COOLDOWN_MS = 60_000`，`MODEL_DISCOVERY_TIMEOUT_MS = 15_000`），
  成功且事实有变化时以 `registration.replace([PROVIDER])`（同一 route 集重提交）
  触发一次 `llm/adapters-updated`，打开中的选择器实时拿到新列表；
  `sameFacts` 比较挡住节流窗口内的回环。失败保持现状，下次建目录再试。
- 已知限制（诚实记录）：官方目录在 `ready` 后缓存，选择器每次打开不产生
  插件可感知的事件（无公开 seam）。因此「每次打开」实现为：目录重建时
  节流刷新 + 有变化即时推送。若未来官方暴露选择器打开事件，改用该 seam。

### 账号信息与额度卡（3、4）

- 配置页（`settings.models.provider-card`）：账号信息一行
  （企业名 + 企业/个人类型）。
- 聊天头部（`conversation.session.header.actions`，kind=list，scope=session）：
  CodeBuddy logo（lobehub/lobe-icons 的 `codebuddy-color.svg`，来源
  https://lobehub.com/icons/codebuddy）按钮，点击展开面板：账号（企业名）、
  本期已用/额度/剩余、重置时间；配额查询失败原样透传。
- 当前模型读**真实的会话选中模型**（不近似）：优先官方
  `ctx.modelDirectories.directoryFor(sessionId)` 的共享目录 store（与模型
  选择器同一 store，含目录默认兜底）；组合缺该服务（旧版 dsh）时退回
  `useProjection('modelSelection')` 投影。只在选中 provider 为
  `codebuddy-credits` 时展示模型区：展示名（含系数/视觉）、上下文窗口、
  原生视觉、思考档位。
- 状态接口 `/api/codebuddy-credits/status` 的 `models` 从 id 数组升级为
  事实视图（id/name/vision/contextWindow/maxTokens/efforts）。
- 解释（owner 原话「企业/个人账号信息只在配置页展示」+「展开显示账号信息」）：
  卡片内只显示企业名（轻量上下文），账号类型（企业/个人）只在配置页。

## 涉及文件

- `src/catalog.ts`：`CodeBuddyModelProfile`/`codeBuddyModel`/`resolveModels`/
  `discoveredToProfile` 删除；新增 `creditLabel`/`displayName`/`factsFromEntries`；
  `fetchCodeBuddyModels` 带超时。
- `src/adapter.ts`：`onCatalogRead` 回调；`listModels`/`resolveModel` 显式
  `inputModalities`。
- `src/index.ts`：内存模型事实；`kickModelRefresh`/`refreshFactsInBackground`；
  saveKey 先验证目录再落凭据；removeKey 清事实。
- `src/config.ts`：schema 只剩 `apiKeyEnv`。
- `src/web.ts`：状态接口升级；删除 `/refresh-models`、`/quota` 路由。
- `src/client/CodeBuddyCreditsCard.tsx`：极简配置卡。
- `src/client/CodeBuddyCreditsIndicator.tsx`（新）：聊天头部额度卡。
- `src/client/index.ts`：注册两个槽位。

## 待公司网络验证（不受本次影响）

- `reasoning_effort` 线拼写实测；
- 端到端推理（UA 链、credit 全路径）。
