# dsh-codebuddy-credits — 设计概览

## 目标

把企业发放的 CodeBuddy 额度接成 DSH 的 LLM provider：官方 API Key 直连
（模型目录 + 流式推理），DSH 跑 agent 循环，CodeBuddy 只出模型。不做令牌
逆向、不用它的 agent harness。

## 形态

- DSH provider 路由 `codebuddy-credits`，模型选择器显示名 `CodeBuddy Credits`
- 模型目录：**不预置**，完全依赖用户给 Key 的行为——保存 Key 时按该 Key 的
  账号权限拉 /v3/config（企业管理员配置的可用模型），写入设置节并激活 provider
- 推理 `POST https://copilot.tencent.com/v2/chat/completions`（仅流式，OpenAI SSE 方言）
- 凭据：界面保存（DSH 凭据库）为主，`CODEBUDDY_API_KEY` 环境变量兼容
- 无 Key 时插件不发任何网络请求，模型选择器不出现本 provider

## 架构

对齐官方 llm-deepseek / llm-pi-ai 正路：

- `registerConfigurableProviders` + `registerAdapter`（PiAiAdapter）+ `registerModelDiscovery`（自实现 /v3/config 解析）+ `settings.installSection`
- provider 构建 `createProvider`（pi-ai openai-completions.lazy 工厂）
- 不 disable 内置插件，与内置 provider 路由共存

## seam 特例（概括，详见根 AGENTS）

1. provider `stream`/`streamSimple` 包装注入官方 CLI `user-agent`（attribution 保留名，profile.headers 覆盖不了；CodeBuddy 服务端校验官方请求标识）
2. 自建 pi-ai 认证桥接（官方 credentialStoreFrom/authContextFrom 未导出）

## 接口事实（2026-09-02 实测）

- 非流式返回 11101（不支持），只发流式；SSE delta 分离 content 与 reasoning_content
- usage 含 reasoning_tokens / cache 字段 / credit（积分消耗）
- hy 系列当前免费、minimax-m3-pay 付费（政策可变）；用量记录连 prompt 文本进入企业用量控制台
