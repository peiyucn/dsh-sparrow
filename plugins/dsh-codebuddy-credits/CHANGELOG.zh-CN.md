# 更新日志

所有用户可感知的改动都记录在此。
See [English](./CHANGELOG.md).

## 0.1.0-alpha.1

- 首发：CodeBuddy 额度接入 DSH，作为 LLM provider
- 仅官方 API Key 认证（`CODEBUDDY_API_KEY` 环境变量或 DSH 凭据库）
- 内置模型目录 + CodeBuddy 目录发现（设置 → 模型 → 获取可用模型）
- 仅流式推理，带官方请求标识头
- 按模型的思考档位（off/minimal/low/medium/high/xhigh/max）
