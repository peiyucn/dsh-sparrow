# dsh-sparrow 🐦

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**DeepSeek Harness（DSH）Web 插件小合集。**

每个插件独立发布、独立安装；某功能被官方原生支持后，对应插件从合集中退役。

## 安装

前置条件：可用的 `dsh` CLI 和 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> 这些包虽然发布在 npm，但**不要**直接用 `npm install @dsh-sparrow/...` 安装：那只会把它们下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用下面的 `dsh plugin` 命令，让包安装到 `$DSH_HOME/profiles/web` 并激活 bundle 层；安装后请重启 DSH。

## dsh-chat-fim

聊天输入框续写联想。打字停顿片刻，在输入框上方以官方 @ 候选菜单同款悬浮卡给出「接下来可能写的文字」，Tab 采用、Esc 丢弃；补全由 DeepSeek FIM 补全（Beta）驱动，触发灵敏度三档可调（高 / 中 / 低），续写模型跟随主模型。

> 仅限 DeepSeek 系列主模型（其他主模型时自动隐藏），复用你在 dsh 中配置的 DeepSeek API key，不新增凭据。

![续写建议候选菜单](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-dsh-chat-fim.png)

文档：[dsh-chat-fim README](plugins/dsh-chat-fim/README.zh-CN.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim
```

## dsh-vision-bridge

纯文本主模型会话的官方视觉通道——只用 DeepSeek 官方视觉模型，不引入任何第三方模型或凭据。主模型调用 `vision_read` 工具，host 直连官方视觉模型读图并回传结构化文字报告，主模型保持对话大脑；主模型本身原生看图时该工具自动隐藏。

> 仅限 DeepSeek 系列主模型（其他主模型时自动隐藏），复用你在 dsh 中配置的 DeepSeek API key，图片不出 DeepSeek 体系。

![模型选择器旁的眼睛图标](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-dsh-vision-bridge.png)

文档：[dsh-vision-bridge README](plugins/dsh-vision-bridge/README.zh-CN.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge
```

## dsh-archive-manage

归档会话管理。侧边栏「归档」入口：归档会话可取消归档（回到会话列表）、移入回收站（移出会话目录、可逆）或彻底删除；回收站支持单个 / 全部还原与彻底删除。

![归档面板](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-dsh-archive-manage.png)

文档：[dsh-archive-manage README](plugins/dsh-archive-manage/README.zh-CN.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage
```

## dsh-nav-pin

轮次导航窄屏不消失。官方「轮次导航」在对话列窄于 900px 时会整体隐藏；本插件把断点提到 700px，700px 以下默认隐身、鼠标移到右侧轨道即淡入浮现为浮层（无框无底色，与宽屏形态一致），并把会话内容最大宽度钳到每侧 120px 留白（640px 官方最小宽度地板），右侧拖拽条不再挤占导航。

> 纯样式注入：无开关、无按钮、无设置、无持久化状态；卸载即恢复官方行为。

![轮次导航 hover 浮层](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-dsh-nav-pin.png)

文档：[dsh-nav-pin README](plugins/dsh-nav-pin/README.zh-CN.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin
```

## dsh-file-manage

DeepSeek Files API 云端文件管理。侧边栏「云端文件」入口列出你 API key 下的全部云端文件：游标翻页、大小 / 上传 / 到期时间、单条删除与一键复制 file_id。复用官方 DeepSeekFilesClient，不新增凭据。

> 官方无批量删除端点（不做「全部清理」）、无下载端点（不预览内容）；配额 10000 个 / 25 GiB 为官方限制。

![云端文件面板](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-dsh-file-manage.png)

文档：[dsh-file-manage README](plugins/dsh-file-manage/README.zh-CN.md)

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-file-manage
```

## License

MIT
