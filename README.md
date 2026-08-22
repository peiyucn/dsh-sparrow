# dsh-fim

聊天输入框 FIM 联想 —— DeepSeek Harness（DSH）Web 插件。

打字停顿片刻，给出「接下来可能写的文字」建议，点击采用即追加进草稿。
补全由 DeepSeek 官方 [FIM Beta](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) 接口生成。

## 安装

    dsh plugin --profile web add dsh-fim

## 配置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| baseURL | https://api.deepseek.com/beta | FIM 端点 |
| model | deepseek-v4-pro | 补全模型 |
| maxTokens | 128 | 单条建议输出上限 |
| apiKeyEnv | DEEPSEEK_API_KEY | 凭据引用，密钥存 DSH 凭据管理 |

## 数据说明

- 建议基于输入框当前草稿生成，草稿会发送到所配置的 FIM 端点；
- 未点击「采用」的文本不会进入会话；
- API key 只在 host half 使用，不进浏览器页面。

## 文档

- 设计：[docs/spec/](docs/spec/)
- 贡献：[CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT