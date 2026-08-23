# 02 · 路线图 — dsh-fim

> 里程碑可独立验收；每完成一项单独 commit。

## M1 · host half（进行中）

* [x] v1 骨架：webServer 路由 + 会话校验 + 凭据解析 + FIM 转发 + 超时/取消
* [ ] 修 typecheck：tsconfig 类型路径指向当前 `@deepseek-ai/cordis` 实际位置
* [ ] 配置化：DEFAULTS → 设置分节（baseURL / model / maxTokens / apiKeyEnv）
* [ ] 错误映射表 + 响应协议定稿
* [ ] 单测：请求校验 / 错误映射 / 请求体解析
* [ ] `dev.patch.yml` 本地验证通过，`npm run verify` 全绿

## M2 · client half（dost 建议条）

* [ ] esbuild 单文件 bundle 方案落地（src/client/，构建产物不入库）
* [ ] 触发/作废状态机（含 IME 组合态压制，纯函数 + 单测）
* [ ] dock 建议条 UI 与键盘交互
* [ ] 采用追加草稿、防陈旧响应
* [ ] 热更验证（dsh checkout 内 `pnpm run dev:web`）

## M3 · 打磨（可选）

* [ ] 多建议并发策略调优（同草稿单在飞请求）
* [ ] 触发停顿阈值与 maxTokens 进设置
* [ ] 性能：请求合并 / 结果缓存

## 发布

* 独立 npm 包 `dsh-fim`，按合集《发布》流程走 tag 或 `npm publish`；
* 官方原生支持输入框 FIM 联想后退役。
