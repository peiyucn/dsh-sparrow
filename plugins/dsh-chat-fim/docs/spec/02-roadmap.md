# 02 · 路线图 — dsh-chat-fim

> 零代码起点（旧版 dsh 的 v1 骨架已移除）；里程碑可独立验收，每完成一项单独 commit。

## M1 · host half（转发路由）

* [x] 脚手架：package.json / tsconfig / cordis.patch.yml / dev.patch.yml；tsconfig 类型路径指向当前 `@deepseek-ai/cordis` 实际位置
* [x] 路由实现：`webServer.register`（exact `/api/chat-fim/complete`）+ 会话校验（`sessions.get`，未命中即拒）+ 凭据（`credentials.resolve(credentialRef(...))`）
* [x] 转发 + 超时/取消 + 错误映射（纯函数）+ 配置（baseURL/model/maxTokens/apiKeyEnv）
* [x] 单测：请求校验 / 错误映射 / 请求体解析
* [x] `npm run verify` 全绿（`dev.patch.yml` 热更验证待做）
* [x] 切换 FIM 补全：`/completions` + 说话人文本 prompt + stop 序列 + 并行多建议（A/B 实测见 README）

## M2 · client half（dock 建议条）

* [x] esbuild 单文件 bundle（src/client/，构建产物不入库）
* [x] 触发/作废状态机（IME 组合态压制，draftRev 防陈旧）
* [x] dock UI 与键盘交互；采用追加草稿
* [ ] 热更验证（dsh checkout 内 dev:web）

## M3 · 打磨（可选）

* [ ] 多建议并发策略调优；触发阈值/maxTokens 进设置；请求合并/缓存

## 发布

* 独立 npm 包 `dsh-chat-fim`，按合集《发布》流程走 tag 或 `npm publish`；官方原生支持输入框续写联想后退役。
