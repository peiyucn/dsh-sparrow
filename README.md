# dsh-sparrow 🐦

**DeepSeek Harness（DSH）Web 插件小合集。**

每个插件独立发布、独立安装；某功能被官方原生支持后，对应插件从合集中退役。

> 三个插件尚未发布到 npm：当前请用本地目录安装（`dsh plugin --profile web add <本仓库路径>/plugins/<插件名>`），发布后换成包名即可。

## dsh-chat-fim

聊天输入框续写联想。打字停顿片刻，在输入框上方以官方 @ 候选菜单同款悬浮卡给出「接下来可能写的文字」，Tab 采用、Esc 丢弃；补全由 DeepSeek FIM 补全（Beta）驱动，续写模型三档可选（auto / pro / flash）。

```bash
dsh plugin --profile web add dsh-chat-fim
```

## dsh-vision-access

纯文本主模型会话的图片视觉通道。主模型调用 `vision_read` 工具，host 直连官方视觉模型读图并回传结构化文字报告，主模型保持对话大脑；主模型本身原生看图时该工具自动隐藏。

```bash
dsh plugin --profile web add dsh-vision-access
```

## dsh-archive-session

归档会话管理。侧边栏「归档」入口：归档区备份 / 删除会话（备份 = 移出会话目录、可逆；删除不可逆），备份区支持单个 / 全部恢复与删除。

```bash
dsh plugin --profile web add dsh-archive-session
```

## 开发

* 各插件独立开发与验证：`cd plugins/<插件名> && npm run verify`；全量 `npm run verify:all`
* 新功能先写 spec（对应插件目录下 `docs/spec/NN-<主题>.md`）再开发
* 规范见 [AGENTS.md](AGENTS.md)（合集通用）与各插件目录下的 `AGENTS.md`（专属约束）

## License

MIT
