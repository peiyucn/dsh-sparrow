# dsh-prefix-completion

聊天输入框续写联想 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

打字停顿片刻，给出「接下来可能写的文字」建议，点击采用即追加进草稿；补全由 DeepSeek 官方 [对话前缀续写（Beta）](https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion/) 接口生成：host 把最近对话历史和你正在输入的半句话作为 assistant prefix 发给模型。

**状态：🚧 M1+M2 已实现（对话前缀续写版）** —— 适配 dsh ≥ 0.1.1-rc.2；设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## 关键行为

* host 路由 `POST /api/prefix-completion/complete`；会话未命中即拒、凭据只经 `ctx.credentials` 实时解析；
* 客户端 dock 在停顿 400ms 后触发，IME 组合态压制，响应按 `draftRev` 防陈旧；
* 采用通过 scoped `slash/input-insert-text` bail 事件写入草稿，不碰 DOM / 输入框内部实现。

## 本机实测记录（2026-08-28，改名前 dsh-fim 名义）

* 使用临时 `DSH_HOME` 执行 `dsh plugin --profile web add <本目录>`，再启动 web profile；
* `POST /api/session.create` 创建 live session；
* `POST /api/fim/complete` 返回 DeepSeek 对话前缀续写真实建议（HTTP 200）；
* `GET /plugins/dsh-fim/client.js` 返回 200，bundle 为 `window.__ModuleLoader__.load(...)` 工厂格式；
* 浏览器端 dock 的点击交互仍需在页面里做一次人工确认。

> **改名说明**：插件由 `dsh-fim` 更名 `dsh-prefix-completion`——实际实现走 DeepSeek [对话前缀续写（Beta）](https://api-docs.deepseek.com/zh-cn/guides/chat_prefix_completion/)，并非 FIM 补全，旧名与实现不符。路由同步改为 `POST /api/prefix-completion/complete`，bundle id 同步变更；上表实测是旧名下做的，改名后需重新 `add` 并复测。

> 注：实现基于当前 dsh 版本（≥ 0.1.1-rc.2）的查证 seam 从零重做（seam 查证结论见 spec/01）。
