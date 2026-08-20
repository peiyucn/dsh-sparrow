# 模块:一键压缩(compact button)

## 需求

dsh 上下文面板(右下角 ContextMeter 环)只展示用量,没有主动压缩按钮;用户只能输入 /compact 命令。
目标:一键触发上下文压缩。

## 调研结论(rc.8)

### 1. 挂在上下文面板内部 —— 不可行

- ContextMeter 硬编码在 InputBar(`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`,720 行),弹出面板是组件内部 state;
- 无任何 slot,第三方插件插不进去;
- 要在面板里加按钮只能给上游提 PR(给 ContextMeter 面板加 action slot),属于上游贡献。

### 2. 一键压缩 —— 可行,官方 ui-plan 已有模板

- 官方 `command-compact` 注册了 /compact 命令,底层是 `ctx.compaction.compactNow(agent, signal, commandId)`;
- 官方 `ui-plan` 示范了程序化执行命令的公开模式:

```ts
// client 插件注入 remote.commands,拿到 sessionId 后:
const result = await ctx.remote.commands.execute(sessionId, '/compact', [])
// result = { ok, value, error };成功 value 含 'Compacted N history items (~X tokens)'
```

- 零 host 代码,client 单半即可完成。

## Spec 雏形

- 挂载点:`conversation.input.dock`(与 FIM 建议条同一插槽,可共存);
- 触发:按钮点击 → execute('/compact') → 结果行显示成功/错误;
- 状态:压缩进行中显示 busy(compactNow 的 busy 错误码可直接映射为禁用态);
- 错误面:沿用命令结果文案(英语,官方错误策略不本地化)。

## 上游 PR 候选(可选)

若官方未来给 ContextMeter 面板加 action slot,可把按钮迁回面板内,并记录上游 PR。