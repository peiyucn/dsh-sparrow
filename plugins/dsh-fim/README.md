# dsh-fim

聊天输入框 FIM 联想 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

打字停顿片刻，给出「接下来可能写的文字」建议，点击采用即追加进草稿；补全由 DeepSeek 官方 [FIM Beta](https://api-docs.deepseek.com/zh-cn/guides/fim_completion/) 接口生成。

**状态：🚧 M1（host 转发路由）+ M2（dock 建议条）已实现** —— 适配 dsh ≥ 0.1.1-rc.2；设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## 关键行为

* host 路由 `POST /api/fim/complete`；会话未命中即拒、凭据只经 `ctx.credentials` 实时解析；
* 客户端 dock 在停顿 400ms 后触发，IME 组合态压制，响应按 `draftRev` 防陈旧；
* 采用通过 scoped `slash/input-insert-text` bail 事件写入草稿，不碰 DOM / 输入框内部实现。

> 注：实现基于当前 dsh 版本（≥ 0.1.1-rc.2）的查证 seam 从零重做（seam 查证结论见 spec/01）。
