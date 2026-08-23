# 02 · 路线图 — dsh-fim

> 零代码起点（旧版 dsh 的 v1 骨架已移除）；里程碑可独立验收，每完成一项单独 commit。

## M1 · host half（转发路由）

* [ ] 脚手架：package.json / tsconfig / cordis.patch.yml / dev.patch.yml；tsconfig 类型路径指向当前 `@deepseek-ai/cordis` 实际位置
* [ ] 路由实现：`webServer.register`（prefix `/api/fim`）+ 会话校验（`sessions.get`，未命中即拒）+ 凭据（`credentials.resolve(credentialRef(...))`）
* [ ] 转发 + 超时/取消 + 错误映射（纯函数）+ 设置分节（baseURL/model/maxTokens/apiKeyEnv）
* [ ] 单测：请求校验 / 错误映射 / 请求体解析
* [ ] `dev.patch.yml` 本地验证通过，`npm run verify` 全绿

## M2 · client half（dock 建议条）

* [ ] esbuild 单文件 bundle（src/client/，构建产物不入库）
* [ ] 触发/作废状态机（IME 组合态压制，纯函数 + 单测）
* [ ] dock UI 与键盘交互；采用追加草稿；防陈旧响应
* [ ] 热更验证（dsh checkout 内 dev:web）

## M3 · 打磨（可选）

* [ ] 多建议并发策略调优；触发阈值/maxTokens 进设置；请求合并/缓存

## 发布

* 独立 npm 包 `dsh-fim`，按合集《发布》流程走 tag 或 `npm publish`；官方原生支持输入框 FIM 联想后退役。
