# Changelog

## 0.1.0-alpha.1（2026-08-31 · 预发布）

- 包名由 `@dsh-sparrow/dsh-archive-session` 更名为 `@dsh-sparrow/dsh-archive-manage`（2026-09-01 改定，路由 / locale namespace / sidecar 文件名等内部标识同步对齐；旧名从未发布，无迁移成本）
- 首个预发布版本，先走 `next` 通道验证；功能同计划中的 `0.1.0` 首发


## 0.1.0（2026-08-31 · 正式发布）

- 迁移至 npm 组织作用域 `@dsh-sparrow`，以 0.1.0 作为首个正式发布版本
- 修复 `scripts/bundle-client.mjs` 的 `__ModuleLoader__.load` 注册 id 使用 scoped 包名，避免 dsh 客户端加载失败
- `npm run verify` 增加 client bundle 注册 id 与 package name 一致性校验
- 侧边栏底部「归档」入口，弹窗分「归档区 / 备份区」两个区块
- 归档区：备份（移出磁盘、可逆）或删除（不可逆，需输入完整会话标题强确认）；本次 dsh 运行中打开过的未释放会话分组置灰，下次启动后可操作
- 备份区：单个 / 全部恢复、单个 / 全部删除；备份位置在面板顶部明示、点击复制
- 备份目录写 sidecar（原路径 / 工作区归属），恢复按它移回；无记录的旧格式目录仅列出 / 删除
- 备份 / 删除连带处理父会话的全部 subagent 会话（备份时随父目录一并移入备份，恢复时一并移回；孤儿 subagent 由启动清扫清理）
- 备份后即时从 @ 列表移除：同步官方 workspace 域记账、失效投影缓存行、补发 `api-session/removed` 事件
- README 定位：官方归档标记不过滤 @ 候选（三层链路源码查证），文件级备份才是让会话离开 @ 的可逆手段
