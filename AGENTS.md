# 项目指令 — dsh-sparrow

## 语言

* **始终用简体中文回复**

***

## 项目概况

**dsh-sparrow**：DeepSeek Harness（DSH）Web 插件小合集——「麻雀虽小，五脏俱全」。

* 每个插件一个独立 npm 包、独立发布；合集提供索引与一行安装的组合说明
* 某功能被官方原生支持后，对应插件从合集中退役
* 布局：
  * `plugins/fim` — 聊天输入框 FIM 联想（host half + M2 client half）
  * `plugins/vision-subagent` — 纯文本会话的图片视觉子代理（计划中，先写 spec）
  * `packages/shared` — 插件共用的 seam 适配层与测试基建（有真实共用代码时再落地）
* 各插件本地验证 = 进入插件目录 `npm run verify`（typecheck + node:test）

***

## 开发基本规则

* **Git commit 规范**：描述用中文，类型前缀保留英文（feat:、fix:、refactor:、chore:、docs: 等）
* **逐项提交**：每完成一个独立任务单独 commit，禁止多个任务混在一个 commit
* **诚实原则**：不确定的事直接说"不确定"，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息
* **优雅原则**：禁止 hack 或补丁式写法，优先走官方 seam（llm / webServer / slots / provide 等正路 API）
* **自检原则**：代码移动/提取后必须搜索确认旧位置已删除，不留死代码或同名遮蔽
* **查证原则**：引用 DSH 服务、事件、插槽契约时，先以 cordis_inspect 查询或 grep 源码确认，禁止凭记忆编造

***

## 需求

* 新功能设计文档放在对应插件目录下 `docs/spec/`，文件名 `NN-<主题>.md`
* **先写 spec 再开发**——明确需求范围、交互边界、验收标准

***

## Git 规范

* 日常开发一律在 `dev` 分支；`master` 只接受发布合并，不直接在上面开发
* push 前必须先跑对应插件的 `npm run verify`，成功才允许推送
* 日常推送目标：`dev`

***

## 发布

* 每个插件独立发布：更新其 `package.json` 版本号 → README / CHANGELOG 同步 → `npm run verify` → `npm publish`（或 tarball 交付）

***

各插件的专属约束见对应 `plugins/*/AGENTS.md`。
