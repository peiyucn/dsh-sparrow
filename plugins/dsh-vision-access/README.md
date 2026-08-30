# dsh-vision-access

纯文本主模型会话的图片视觉通道 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。
An image-vision channel for text-only main models — a DeepSeek Harness (DSH) Web plugin (part of the dsh-sparrow collection).

主模型本身看不到图片时，它会自动调用本插件提供的 `vision_read` 工具：host 直连官方视觉模型读图，把图片转成结构化文字报告（摘要 / OCR / 表格 / 版式），主模型保持对话大脑。
When the main model cannot see images, it automatically calls the provided `vision_read` tool: the host reads the image with the official vision model and returns a structured text report (summary / OCR / tables / layout) — the main model stays the brain of the conversation.

## 安装 / Install

```bash
dsh plugin --profile web add dsh-vision-access
```

适配 dsh ≥ 0.1.1-rc.2。 · Requires dsh ≥ 0.1.1-rc.2.

## 使用 / Usage

* **无需配置 / Zero config**：对话中贴图后，直接让主模型「看看这张图」即可，主模型会自动调用 `vision_read`
  * Paste an image and just ask the main model to "look at it" — it calls `vision_read` on its own
* **状态图标 / Status icon**：当前会话可跨模型读图（DeepSeek 文本模型）时，输入框工具行会显示一个点亮的图片小图标，悬停有说明；模型不可用时不显示
  * When cross-model image reading is available for the current session (a DeepSeek text model), a lit image glyph appears in the input tool row with a hover hint; it disappears otherwise
* 当前主模型本身原生看图（如 deepseek-v4-flash-vision-exp）或不是 DeepSeek 系列时，该工具自动隐藏——图片本来就直达主模型，经文字转述反而有损
  * The tool hides itself when the main model sees images natively (e.g. deepseek-v4-flash-vision-exp) or is not a DeepSeek model — the image already reaches the model directly, so a text transcription would only degrade it
* **凭据 / Credentials**：视觉模型调用复用你在 dsh 中配置的 DeepSeek API key，图片只发给 DeepSeek 官方视觉模型、不出 DeepSeek 体系；不新增凭据
  * Vision calls reuse the DeepSeek API key configured in dsh; images only go to DeepSeek's official vision model and never leave the DeepSeek ecosystem — no extra credentials
* 同一张图 + 同一问题的报告在进程内缓存，重复询问秒回
  * Reports are cached in-process per image + question, so repeated asks answer instantly

## 截图 / Screenshots

![工具行点亮图标（可跨模型读图）/ Lit status icon in the tool row](docs/images/status-icon.png)

## 卸载与残留 / Uninstall & Residue

* **零残留 / Zero residue**：不写任何文件、不改 `.dsh` 内部结构；报告缓存只在进程内存中，进程退出即消失。
  * Writes no files and never touches the `.dsh` internals; the report cache lives only in process memory and vanishes on exit.
