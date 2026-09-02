# dsh-codebuddy-credits

[English](./README.md)

把**公司发的 CodeBuddy 额度**接成 DeepSeek Harness（DSH）的 LLM provider——
企业发放的 WorkBuddy/CodeBuddy 积分，在 DSH 里直接用。官方 API Key 直连，
只用模型推理，**不用它的 agent harness，不做令牌/登录态逆向**。

插件在 DSH 模型选择器里注册一个 `codebuddy-credits` provider。DSH 自己跑
agent 循环（工具、权限、上下文），CodeBuddy 只负责推理，额度记在 CodeBuddy
账号上。

## 为什么做这个

公司发的 CodeBuddy 积分只能在 CodeBuddy 生态里花。如果你习惯用 DSH 当 agent
宿主，这个插件把积分花在你想要的地方——走官方 API Key 机制，不借用浏览器
登录态、不装 CodeBuddy CLI。

## 环境要求

- DSH >= 0.1.2-alpha.4
- Node.js >= 22.19.0

## 安装

```powershell
dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits@latest
```

装完重启 DSH。headless 场景用 `--profile headless` 再装一次。

## 获取 API Key

1. 登录 CodeBuddy 平台：<https://copilot.tencent.com/profile/>（企业控制台：
   API 管理 → 访问密钥；国际版 <https://www.codebuddy.ai/profile/keys>）。
2. 创建密钥。企业密钥按账号签发，模型可用范围跟随账号权限。

## 配置

插件默认从环境变量 `CODEBUDDY_API_KEY` 解析密钥，也可以存在 DSH 凭据服务里：

- **设置 → 模型 → codebuddy-credits**：apiKeyEnv 是凭据引用字段——把 Key 粘贴
  进去即存入 DSH 凭据库（不会写进 settings.yaml），或者留空并在启动环境里
  导出 `CODEBUDDY_API_KEY`。

插件自带模型目录（hy4-preview、hy3、hy3-x、glm-5.3-flash、minimax-m3-pay、
deepseek-v4-flash）。想同步账号真实可用模型：**设置 → 模型 → codebuddy-credits
→ 获取可用模型**，插件会用你的 Key 查 CodeBuddy 目录并把结果供你采纳。

## 如实说明

- 推理端点就是官方 CodeBuddy CLI 用的那套。Key 是官方签发、认证方式是官方
  IAM 文档明示的，但**对话接口本身没有公开的稳定性承诺**——本插件是第三方
  适配器，不是官方产品。
- 接口**只支持流式**，非流式请求会被拒绝。
- 模型计费跟随账号：企业计划下 hy 系列目前免费、minimax-m3-pay 收费，政策
  随时可能变。
- 通过 Key 发起的请求会进入账号用量记录（企业用量控制台连提示词文本都可见）。

## 与同类项目的区别

- [dsh-llm-codebuddy](https://github.com/Axiaohungry/dsh-llm-codebuddy)：
  令牌逆向 + API Key 双模式；本插件刻意只保留官方 API Key 一路。
- 官方 CodeBuddy Agent SDK / HTTP API：agent 级集成（CodeBuddy 自己跑循环）；
  本插件形态相反——DSH 跑循环。

## License

[MIT](./LICENSE)

## 更新日志

[CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)
