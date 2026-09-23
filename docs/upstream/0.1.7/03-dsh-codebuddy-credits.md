# 03 · dsh-codebuddy-credits — **provider 半边建议退役/变薄**

## 1) 定位与结论

CodeBuddy 额度 LLM provider + 积分/额度面板（自建协议、模型选择器遮蔽、额度卡、每轮积分胶囊）。
**结论：官方「自定义模型 API」已是配置项（不是代码），若 CodeBuddy 属官方三种协议之一，provider 半边（adapter / 注册 / 凭据）可整块删掉，只留积分额度面板 —— 插件的价值从「接一个厂商」变成「CodeBuddy 特有额度可视化」。**

## 2) 现状（真机 + 源码双证）

| 半边 | 状态 | 证据 |
|---|---|---|
| host | ✅ 激活（LLM provider 契约成立） | 真机：无失败告警；`LlmAdapter` 唯一 abstract 仍是 `stream()`（`packages/llm/llm/src/index.ts:204,285`），`registerAdapter`（`:391`）、`registerConfigurableProviders`（`:485`）、`registerModelDiscovery`（`:559`）均在 |
| client | ❌ `conversation.input.model` entry 抛 #130（图标改名） | 真机 console：`slot entry crashed in 'conversation.input.model'`；`src/client/CodeBuddyModelSelect.tsx:22` 引用的 `IconCheckOutline16` / `IconChevronDownOutline14` / `IconChevronRightOutline14` / `IconWarningOutline16` 在 alpha.2 已不存在 |

**官方新事实**：

* 官方「自定义模型 API」支持 `openai-completions` / `openai-responses` / `anthropic-messages` 三种协议 + 「获取可用模型」探测（`docs/user/guide/providers.zh.md:21-33`）；该表单 ≤0.1.5 就有（`git show dsh-v0.1.5-rc.2:packages/client/ui-settings-models/src/client/CustomProviderCard.tsx` 存在）。
* 我方用到的槽位契约未变：`conversation.input.model`（`ui-conversation/src/client/apply.ts:390`）、`conversation.input.dock`（`:392`）、`conversation.chat.assistant-actions`（`ui-chat/src/client/contract/slots.ts:271`）、`conversation.session.header.utilities`（`ui-conversation/src/client/contract/slots.ts:162`）。
* client 侧服务 `modelDirectories`（`packages/client/ui-model-selection/src/client/service.ts:50`）仍在。

## 3) 改动清单

1. `src/client/CodeBuddyModelSelect.tsx:22` 四个图标改名（`…16`/`…14` → `…Regular`），保持 `size`；补结构测试。
2. 依赖升线（共同面）。
3. **若走官方 provider**：删除 `src/adapter.ts`（`CodeBuddyAdapter extends LlmAdapter`）、`registerAdapter` 注册、`CODEBUDDY_CREDITS_API_KEY` 凭据解析、`catalog.ts` 模型目录中属于「接厂商」的部分；保留 `web.ts` 状态路由、额度/积分面板、`credits-*` 逻辑。
4. 面板挂载点复核：新 UI 下 `conversation.session.header.utilities` 仍在，hero 态走 `conversation.input.dock`（现有双挂载策略是否仍需要）。
5. vendored `CodeBuddyModelSelect`（遮蔽官方 `ModelSelect`，priority -1）：若 provider 退役，这个遮蔽是否还需要（额度系数列的价值是否还在）。

## 4) 结论（owner 拍板）

> 待讨论，逐条记结论。

1. **CodeBuddy 协议归属**（决定能不能整块删）：需先核实 CodeBuddy 的端点与流式格式是否属官方三协议之一 —— 这一步我可以先做（读现有 `adapter.ts` + 试官方三种配置），不必你拍板。核实后：**属** → 删 provider 半边；**不属** → 保留自建 provider（那就只需升线 + typecheck + 复核新增默认成员 `imageRequestPricing` / `prepareCall` 是否冲突）。
2. **插件的长期定位**：若 provider 走官方配置，本插件的「安装即用」价值消失，只剩额度可视化 —— 你希望它继续作为独立插件维护，还是合并进某个更大的「额度/用量」插件？
3. **额度面板的形态**：继续「胶囊 + 弹层」（现形态）还是收进官方新的设置页/插件管理面板（0.1.7 新增 `ui-plugin-manager`，注册了配置页的插件会在那里出现）。
4. **模型选择器的遮蔽**：保留（额度系数右对齐列）还是去掉（官方选择器回归）—— 去掉可少维护一套 vendored 组件。

## 5) 验收口径 / 未核实项

* 真机验收：模型可选、额度数值正确、每轮积分胶囊不遮官方、无 #130。
* 未核实：CodeBuddy 实际协议（端点 / SSE 形状 / usage 字段）；官方新增默认成员（`packages/llm/llm/src/index.ts:232,273`）与我方自建协议是否冲突。
