# dsh-codebuddy-credits — 设计概览

## 目标

把企业发放的 CodeBuddy 额度接成 DSH 的 LLM provider：官方 API Key 直连
（模型目录 + 流式推理），DSH 跑 agent 循环，CodeBuddy 只出模型。不做令牌
逆向、不用它的 agent harness。

## 形态

- DSH provider 路由 `codebuddy-credits`，模型选择器显示名 `CodeBuddy Credits`
- 模型目录：**不预置**，完全依赖用户给 Key 的行为——保存 Key 时按该 Key 的
  账号权限拉 /v3/config（企业管理员配置的可用模型）并激活 provider；模型事实
  只存进程内（不落设置节），宿主重建模型目录时节流自动刷新（见 spec 01）
- 推理 `POST https://copilot.tencent.com/v2/chat/completions`（仅流式，OpenAI SSE 方言）
- 凭据：界面保存（DSH 凭据库）为主，`CODEBUDDY_API_KEY` 环境变量兼容
- 无 Key 时插件不发任何网络请求，模型选择器不出现本 provider

## 信息分级（总纲，2026-09-04 定）

积分/用量信息按四档各归其位，改动一律按档位归位：

| 档位 | 信息 | 位置 | 数据源 |
| :--- | :--- | :--- | :--- |
| 用户级 | 账号/企业、周期额度、重置时间、当前模型 | 侧栏额度卡（`sidebar.footer.action`，与 Settings 同行右置） | `/status` + `/quota` |
| 会话级 | 本会话累计积分 · 调用次数 | 输入框下方统计行（`conversation.composer.dock`，官方 StatsLine 同槽位 order 1） | `/session-usage` |
| 轮次级 | 该轮积分合计 + 每次调用明细 | 每轮「积分」胶囊（`conversation.chat.assistant-actions`，DOM 移到行尾时间前） | `/turn-usage`（agent/request signal 关联轮次） |
| 对话级 | token 消耗、缓存命中、耗时 | 官方每轮 Usage/时间统计（不改动） | 官方 token-meter（数据来自本适配器 usage 帧） |

## 架构（2026-09-03 重写：协议层自建，不依赖 pi-ai）

把 CodeBuddy 积分当成一个**非标准协议的推理 API** 来适配——OpenAI Chat Completions
的方言（仅流式、官方请求标识、专用模型目录、reasoning 帧、credits 计费），
每一条偏差都由自建适配器显式处理，不走通用协议层的假设：

- `src/adapter.ts`：自建 `CodeBuddyAdapter extends LlmAdapter`——请求构造、
  SSE 解析、块组装、usage/credit 提取、企业策略错误透传全部显式实现
- `registerConfigurableProviders` + `registerAdapter`（自建 adapter）+ `registerModelDiscovery` + `settings.installSection`
- 不 disable 内置插件，与内置 provider 路由共存；无 pi-ai 依赖（依赖净减 84 包）
- 参考插件（dsh-llm-codebuddy）用 PiAiAdapter + pi-ai 协议层：usage.credit 被
  pi-ai 丢弃、reasoning_effort 拼写未验证——方言漏水点即本插件自建的动机

## seam 特例（概括，详见根 AGENTS）

无私有 seam。协议层自建后，官方请求标识（user-agent / x-product / 企业上下文头）
直接在请求头里显式发送，不再有包装层。

## 请求形态规矩（2026-09-03 定，owner 拍板）

> 官方未公开 API 服务（只有 CLI 是公开产品），我们的调用**保持与官方 CLI 一致的行为**：
> 不管哪个接口，统一带上完整请求形态，服务端视角与官方客户端无异。这是安全边界，不是装饰。

- 认证：`X-API-Key: <用户 Key>`（所有接口）
- UA：官方 CLI 标识 `CLI/unknown CodeBuddy/<版本>`（跟随官方 CLI 版本同步，勿用浏览器 UA）
- `X-Product: SaaS`（所有接口）
- 企业上下文头：`X-Enterprise-Id`、`X-Tenant-Id`、`X-User-Id`（值来自 /v2/accounts：enterpriseId/enterpriseId/uid；拿到后所有接口都带）
- 无 Key 时**任何接口都不发请求**（零网络行为）；配 Key 后才按需调用

## 接口事实（2026-09-02 实测）

- 非流式返回 11101（不支持），只发流式；SSE delta 分离 content 与 reasoning_content
- usage 含 reasoning_tokens / cache 字段 / credit（积分消耗）
- hy 系列当前免费、minimax-m3-pay 付费（政策可变）；用量记录连 prompt 文本进入企业用量控制台

### 已实测接口清单（API Key 直连）

| 接口 | 方法 | 用途 |
|---|---|---|
| `copilot.tencent.com/v3/config` | GET | 模型目录 + credits 系数 + 精确思考档位 |
| `copilot.tencent.com/v2/accounts` | GET | 账号/企业信息（uid、enterpriseId、企业名、类型） |
| `copilot.tencent.com/v2/chat/completions` | POST | 推理（仅流式）+ usage.credit |
| `www.codebuddy.cn/v2/billing/meter/get-enterprise-user-usage` | POST | 配额：credit（本期已消耗）、limitNum（周期额度）、cycleStartTime/cycleEndTime、cycleResetTime。**仅 X-API-Key 即可**（实测四种头组合同结果） |
| `www.codebuddy.cn/v2/billing/meter/get-user-resource` | POST | 个人资源（企业账号下返回空 Accounts，暂不用） |

### 明确不做的

- 浏览器登录态 / 令牌逆向（全部登录态接口）
- 余额/配额之外的控制台功能
