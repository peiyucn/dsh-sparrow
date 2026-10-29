# dsh-codebuddy-credits

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

把**公司发的 CodeBuddy 额度**接成 DeepSeek Harness（DSH）的 LLM provider——
企业发放的 WorkBuddy/CodeBuddy 积分，在 DSH 里直接用。只用 API Key：
CodeBuddy 提供积分对应的模型推理，工具、权限与上下文都由 DSH 负责。

插件在 DSH 模型选择器里加一个 `CodeBuddy Credits` provider。

## 为什么做这个

公司发的 CodeBuddy 积分只能在 CodeBuddy 生态里花。如果你习惯用 DSH 当 agent
宿主，这个插件把积分花在你想要的地方——用 API Key，不借用浏览器登录态、
不装 CodeBuddy CLI。

## 环境要求

- DSH 0.2.1-rc.4（本版构建与验证所对齐的确切官方版本线；更新的版本线、尤其是预发布版本不在承诺范围内）
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

## 配置（界面内完成）

打开 **设置 → 模型**，在 **CodeBuddy Credits** 行上直接粘贴 Key 并保存：

- 保存 Key 时，插件用这把 Key 加载可用的模型（按该 Key 的账号权限返回，
  例如企业管理员配置的那批）并启用 provider。清单只存进程内、按需
  刷新，不写入设置文件；
- 配置成功后，卡片同时列出这把 Key 可用的模型（只读：模型名 + `x0.00 · 1M`
  只读事实），并提供「获取可用模型」按钮——管理员调整清单后可手动刷新；
  刷新只作用于本 provider；
- 之后**官方**模型选择器里即可选择这些模型（按 provider 分组）。本插件不改
  模型选择器；积分系数与上下文长度在设置卡片与会话头部面板里查看；
- 本插件接管模型行标签的渲染，才能在本 provider 的模型行显示只读的系数 /
  上下文信息。该标签槽同一时刻只有一个贡献者，所以插件同时**镜像官方给
  DeepSeek Flash 的 `1017` 版本标**，并让其他 provider 的标签保持官方样式；
  官方再次改动选择器时，标签可能先退化为纯模型名，等插件更新。
- 未配置 Key 时，插件不发起任何网络请求，模型选择器也不出现本 provider；
- 移除 Key 后 provider 随即停用。

Key 只存入 DSH 凭据库，不进 settings.yaml。环境变量
`CODEBUDDY_CREDITS_API_KEY` 在启动时同样生效；旧拼写 `CODEBUDDY_API_KEY`
仍可识别并自动迁移。界面保存是推荐方式。

## 积分可见性

配置 Key 后，插件在对话界面里展示 CodeBuddy 用量：

- **会话头部入口**（会话列右上角、Session log 按钮左侧，对话页与新会话
  首页均显示）：展开面板显示账号/企业、当期额度（已用 / 额度 / 剩余、进度条、
  重置日期），以及当前选中 CodeBuddy 模型的积分系数、上下文长度、描述与
  可用功能；对话区变窄时这个入口会自动收成**只有图标、没有文字**的版本；
- **会话积分**：显示在输入框下方的统计行里，含本会话累计积分与调用
  次数，点开显示调用次数与按模型聚合的每次调用明细；
- **每轮积分**：单轮消耗的积分（在该轮操作行末尾），点开显示调用次数
  与按模型聚合的每次调用明细；
- **Max 模式**：额度面板里的开关会把本 provider 的所有推理模型强制锁到
  `max` 档位，开启期间覆盖逐模型档位偏好；不影响其它 provider 的模型，
  关闭后恢复原来的逐模型选择。

会话与单轮统计取自会话自身的历史记录，**重启 DSH 后不清零**，重新打开
旧会话也仍准确；额度面板始终读服务端最新数字。

## 截图

![会话页额度入口与面板](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png)

![设置 → 模型页的 CodeBuddy Credits 配置卡](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits-settings.png)

## 如实说明

- 推理端点就是官方 CodeBuddy CLI 用的那套。Key 是官方签发、认证方式是官方
  IAM 文档明示的，但**对话接口本身没有公开的稳定性承诺**——本插件是第三方
  适配器，不是官方产品。
- 接口**只支持流式**，非流式请求会被拒绝。
- 模型计费跟随账号：企业计划下 hy 系列目前免费、minimax-m3-pay 收费，政策
  随时可能变。
- 通过 Key 发起的请求会进入账号用量记录（企业用量控制台连提示词文本都可见）。
- 上游会对 **system / assistant 正文**做内容拦截（报「未授权渠道」），命中对象包括
  若干标记句与 `@` 路径引用措辞。为让对话继续可用，插件在**发送给上游的副本**里
  给这些标记插入不可见字符：可见文字与本机会话历史都不变，代码块逐字保留；
  `user` 消息、工具结果与工具调用参数一律不改。
- 上游校验变化时插件会自动降级重试（设置卡「自动适配上游风控」，默认开）。这会带来
  **额外消耗，需要你知道**：每次触发最多再发 3 个请求，直到某一级降级生效。这些请求
  在生成前就被网关拒绝（不产出回答），但会进入账号的请求日志（企业用量控制台连提示词
  文本都可见）；变化后的第一次回复也会因多出的往返而变慢。适配状态只存进程内存，
  重启后可能再次触发。全部降级均失败时请求报错，需升级插件；关闭开关即回到单次请求。

## License

[MIT](./LICENSE)

## 更新日志

[CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)
