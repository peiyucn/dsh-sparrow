# dsh-vision-bridge

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

纯文本主模型会话的官方视觉通道——只用 DeepSeek 官方视觉模型，不引入任何第三方模型或凭据。DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

主模型本身看不到图片时，它会自动调用本插件提供的 `vision_read` 工具：host 直连官方视觉模型读图，把图片转成结构化文字报告（摘要 / OCR / 表格 / 版式），主模型保持对话大脑。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge
```

适配 dsh ≥ 0.1.2-alpha.4，并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-vision-bridge`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 使用

* **无需配置**：对话中贴图后，直接让主模型「看看这张图」即可，主模型会自动调用 `vision_read`
* **状态图标**：模型选择器旁的眼睛图标随当前模型能力**三态**变化——原生视觉模型（灰显）点击提示「该模型原生支持视觉」；DeepSeek 文本模型（蓝紫点亮）点击提示「可跨模型读图」（明示图片交给哪个视觉模型）；其它无视觉模型（灰显带斜线）点击提示「不支持看图」。切换模型时颜色与文案实时跟随，直观感知当前模型能力。
* 当前主模型本身原生看图（如 deepseek-v4-flash-vision-exp）或不是 DeepSeek 系列时，该工具自动隐藏——图片本来就直达主模型，经文字转述反而有损
* **凭据**：视觉模型调用复用你在 dsh 中配置的 DeepSeek API key，图片只发给 DeepSeek 官方视觉模型、不出 DeepSeek 体系；不新增凭据
* 同一张图 + 同一问题的报告在进程内缓存，重复询问秒回

## 截图

![模型选择器旁的眼睛图标](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-vision-bridge.png)

## 卸载与残留

* **零残留**：不写任何文件、不改 `.dsh` 内部结构；报告缓存只在进程内存中，进程退出即消失。
