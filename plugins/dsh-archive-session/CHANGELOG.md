# Changelog

## 0.1.2-alpha.1（2026-08-31 · 修复客户端 bundle 注册 id）

- 修复 `scripts/bundle-client.mjs` 的 `__ModuleLoader__.load` 注册 id 未随 scoped 包名更新，导致 dsh 0.1.2 启动报 `loaded without registering "@dsh-sparrow/dsh-archive-session"` 的问题
- 根 `scripts/verify.mjs` 增加校验：client bundle 注册 id 必须等于 `package.json` 的 `name`

## 1.0.0（2026-08-31 · 正式首发）

- 迁移至 npm 组织作用域 `@dsh-sparrow` 正式发布 1.0.0（此前无作用域的 0.1.x 为试验发布线，已废弃并从 npm / GitHub 清理）
- 侧边栏底部「归档」入口，弹窗分「归档区 / 备份区」两个区块
- 归档区：备份（移出磁盘、可逆）或删除（不可逆，需输入完整会话标题强确认）；本次 dsh 运行中打开过的未释放会话分组置灰，下次启动后可操作
- 备份区：单个 / 全部恢复、单个 / 全部删除；备份位置在面板顶部明示、点击复制
- 备份目录写 sidecar（原路径 / 工作区归属），恢复按它移回；无记录的旧格式目录仅列出 / 删除
- 备份后即时从 @ 列表移除：同步官方 workspace 域记账、失效投影缓存行、补发 `api-session/removed` 事件
