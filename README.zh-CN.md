# dsh-sparrow 🐦

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**DeepSeek Harness（DSH）Web 插件小合集。**

每个插件独立发布、独立安装；某功能被官方原生支持后，对应插件从合集中退役。

## dsh-chat-suggest

聊天输入框续写联想。打字停顿片刻，在输入框上方以官方 @ 候选菜单同款悬浮卡给出「接下来可能写的文字」，Tab 采用、Esc 丢弃；补全由 DeepSeek FIM 补全（Beta）驱动，触发灵敏度三档可调（高 / 中 / 低），续写模型跟随主模型。

> 仅限 DeepSeek 系列主模型（其他主模型时自动隐藏），复用你在 dsh 中配置的 DeepSeek API key，不新增凭据。

![续写建议候选菜单](resources/dsh-chat-suggest.png)

文档：[dsh-chat-suggest README](plugins/dsh-chat-suggest/README.zh-CN.md)

```bash
dsh plugin --profile web add dsh-chat-suggest
```

## dsh-vision-access

纯文本主模型会话的图片视觉通道。主模型调用 `vision_read` 工具，host 直连官方视觉模型读图并回传结构化文字报告，主模型保持对话大脑；主模型本身原生看图时该工具自动隐藏。

> 仅限 DeepSeek 系列主模型（其他主模型时自动隐藏），复用你在 dsh 中配置的 DeepSeek API key，图片不出 DeepSeek 体系。

![模型选择器旁的眼睛图标](resources/dsh-vision-access.png)

文档：[dsh-vision-access README](plugins/dsh-vision-access/README.zh-CN.md)

```bash
dsh plugin --profile web add dsh-vision-access
```

## dsh-archive-session

归档会话管理。侧边栏「归档」入口：归档区备份 / 删除会话（备份 = 移出会话目录、可逆；删除不可逆），备份区支持单个 / 全部恢复与删除。

![归档面板](resources/dsh-archive-session.png)

文档：[dsh-archive-session README](plugins/dsh-archive-session/README.zh-CN.md)

```bash
dsh plugin --profile web add dsh-archive-session
```

## License

MIT
