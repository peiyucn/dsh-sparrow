# dsh-sparrow 🐦

**麻雀虽小，五脏俱全** —— DeepSeek Harness（DSH）Web 插件小合集。

每个插件独立发布、独立安装（`dsh plugin --profile web add <包名>`）；某功能被官方原生支持后，对应插件从合集中退役。

## 插件

| 插件 | 状态 | 说明 | 文档 |
|---|---|---|---|
| [dsh-fim](plugins/fim/) | 📋 spec 评审中 | 聊天输入框 FIM 联想（DeepSeek FIM Beta 转发 + dock 建议条） | [README](plugins/fim/README.md) · [spec](plugins/fim/docs/spec/) |
| dsh-vision-subagent | 📋 spec 评审中 | 纯文本主模型会话的图片视觉子代理（官方 vision 模型读图，主模型保持大脑） | [README](plugins/vision-subagent/README.md) · [spec](plugins/vision-subagent/docs/spec/) |

## 共享

* [packages/shared](packages/shared/) —— 插件共用的 seam 适配层与测试基建（规划中）

## 开发

* 各插件独立目录开发与验证（如 `cd plugins/fim && npm run verify`）；
* 新功能先写 spec（对应插件目录下 `docs/spec/NN-<主题>.md`）再开发；
* 详细规范见 [AGENTS.md](AGENTS.md) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT
