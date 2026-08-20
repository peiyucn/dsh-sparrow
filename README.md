# dsh-sparrow 🐦

**麻雀虽小,五脏俱全** —— DeepSeek Harness(DSH)插件小集合。

一只 DSH 大鲸鱼身边的小麻雀:把几个小而实用的 web 功能收进一个 bundle,一行安装。
某个功能被官方原生支持后,就从集合里**退役**(移除模块、发新版),保持"五脏"始终是官方没有的那几样。

## 模块状态

| 模块(器官) | 状态 | 说明 |
|---|---|---|
| 骨架 | ✅ 已建 | bundle + host 半 + 开发验证链(M0) |
| 归档会话管理 | 📋 计划(M1) | 侧边栏「归档」入口:查看 / 恢复被归档的会话(官方只有单向归档,无恢复入口) |
| FIM 输入补全 | ✍️ 计划(M2) | 输入框联想:DeepSeek FIM Beta 转发 + dock 建议条 |
| (更多) | 💡 随缘 | 有想法就往里加 |

## 研究底稿

| 文件 | 内容 |
|---|---|
| [research/00-summary.md](research/00-summary.md) | 一页速览 |
| [research/01-dsh-plugin-mechanism.md](research/01-dsh-plugin-mechanism.md) | DSH / Cordis 插件机制全景 |
| [research/02-fim-autocomplete.md](research/02-fim-autocomplete.md) | FIM 输入联想的契约与设计 |
| [research/03-at-mention-builtin-rc8.md](research/03-at-mention-builtin-rc8.md) | rc.8 官方 @引用 能力记录 |
| [research/04-architecture-decision.md](research/04-architecture-decision.md) | 架构决策 |
| [research/05-roadmap.md](research/05-roadmap.md) | 路线图 |
| [research/raw/](research/raw/) | 一手材料 |

## 开发

`sh
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run verify      # 两者都跑
`

**本地验证**(需要 dsh 源码 checkout):

`sh
cd C:UsersDJ028191deepseek-harness
pnpm dsh web --patch C:UsersDJ028191OneDrivepyaidsh-sparrowdev.patch.yml
`

启动后终端会打印 [dsh-sparrow] host loaded — 麻雀虽小,五脏俱全。

## 安装(发布后)

dsh plugin --profile web add dsh-sparrow

## License

MIT
