# dsh-chat-fim

聊天输入框续写联想 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

打字停顿片刻，在输入框上方以**官方 @ 候选菜单同款悬浮卡**给出「接下来可能写的文字」建议，Tab / 点选采用即追加进草稿，Esc 丢弃；官方 @/斜杠候选菜单打开时本菜单自动隐藏让位。补全由 DeepSeek 官方 [FIM 补全（Beta）](https://api-docs.deepseek.com/zh-cn/guides/fim_completion) 接口生成：host 把最近对话历史转成「用户：/助手：」说话人文本，加上你正在输入的半句话发给模型续写。

**状态：🚧 M1+M2+M3 已实现（FIM 补全 + @ 列表样式候选菜单）** —— 适配 dsh ≥ 0.1.1-rc.2；设计文档见 [docs/spec/](docs/spec/)。

## 本地验证

```bash
npm run verify
```

## 关键行为

* host 路由 `POST /api/chat-fim/complete`；会话未命中即拒、凭据只经 `ctx.credentials` 实时解析；
* 补全走 FIM 接口：直接续写文本本身、没有角色语义，天然站在用户角度；`stop` 序列（`\n用户：` / `\n助手：`）防止模型续写下一位说话人；多建议 = 并行多次请求（FIM 无 `n` 参数），部分失败保留成功建议；
* 客户端数据面挂 `conversation.composer.dock`，停顿 400ms 后触发，IME 组合态压制，响应按 `draftRev` 防陈旧；建议经共享 store 交给 `conversation.input.overlay` 菜单视图渲染（官方 MenuDropdown 视觉 token + `useAnchoredMaxHeight` 钳高，零定位 JS）；
* 与官方触发菜单互斥：检测 `[data-trigger-menu]`（MutationObserver 观察 overlay 锚点），官方 @/斜杠列表打开期间本菜单不渲染、Tab 不采用；
* 开关胶囊：火花图标 + 「Suggest」（关闭态灰字）；窄窗口按官方 `@container` 阈值（460px）折叠为纯图标；菜单卡紫色边框（同开关 on 态）+ 行尾「采用 Tab · 丢弃 Esc」键位提示；
* 采用通过 scoped `slash/input-insert-text` bail 事件写入草稿，不碰 DOM / 输入框内部实现。

## 本机实测记录（2026-08-28，改名前 dsh-fim 名义）

* 使用临时 `DSH_HOME` 执行 `dsh plugin --profile web add <本目录>`，再启动 web profile；
* `POST /api/session.create` 创建 live session；
* `POST /api/fim/complete` 返回 DeepSeek 对话前缀续写真实建议（HTTP 200）；
* `GET /plugins/dsh-fim/client.js` 返回 200，bundle 为 `window.__ModuleLoader__.load(...)` 工厂格式；
* 浏览器端 dock 的点击交互仍需在页面里做一次人工确认。

> **改名说明**：插件名演进 `dsh-fim` → `dsh-prefix-completion` → `dsh-chat-fim`。第一个名字用的是 FIM 补全、旧名与实现不符；第二个名字改用对话前缀续写但「用户角度」靠提示词硬掰、实测不稳定；现名切回 FIM 补全（A/B 实测见下），路由为 `POST /api/chat-fim/complete`。旧名下的实测记录保留并标注当时名义，改名后需重新 `add` 并复测。

## 本机实测记录（2026-08-29，当时名 dsh-prefix-completion，dsh 0.1.2-alpha.1）

* 隔离冒烟：临时 `DSH_HOME` 下 `dsh plugin --profile web add` 装入三个 sparrow 插件（prefix-completion / vision-subagent / archive-session），再以当前 dsh 源码树 `--profile web --port 0` 启动，fail-loud 启动通过（三插件随 profile 装载成功）；
* `POST /api/prefix-completion/complete` 携带假 sessionId 返回插件自身 `UNKNOWN_SESSION` JSON——路由注册与会话门禁生效；
* 首页 boot 图包含 `dsh-prefix-completion` 与 `dsh-archive-session` 的 client bundle（combo 批次，HTTP 200，工厂以 `window.__ModuleLoader__.load({ id: ... })` 注入；vision-subagent 无 client half，按预期不出现）；
* 注意：0.1.2-alpha.1 起 client bundle 走 `/plugins/??<id>/client.js&rev=...` 组合 URL，rc.2 时代的 `/plugins/<id>/client.js` 裸路径不再直接可用（旧记录第 4 条按当时版本为准）；
* 真实 web profile 已用 `dsh plugin --profile web add` 装入三个插件（link: 指向合集源码目录），重启 web profile 后生效；输入框 dock 的点击交互仍需在页面里做一次人工确认。

### 用户角度续写实测（2026-08-29，真实凭据直连上游）

* 以插件同款消息构造（历史 + 用户角度引导 + 草稿 prefix）调用 `https://api.deepseek.com/beta/chat/completions`；
* 草稿「下一个迭代我想」返回建议「把 `format` 的逻辑抽成一个纯函数，方便补单元测试。你怎么看？」——用户口吻续写且反问助手，符合预期。

> 注：实现基于当前 dsh 版本（≥ 0.1.1-rc.2）的查证 seam 从零重做（seam 查证结论见 spec/01）。
