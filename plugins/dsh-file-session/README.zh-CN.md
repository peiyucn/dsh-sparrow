# dsh-file-session

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

DeepSeek Files API 云端文件管理 —— DeepSeek Harness（DSH）Web 插件（dsh-sparrow 合集成员）。

DSH 贴图的大图会自动上传到 DeepSeek Files API（云端文件库），但官方没有管理界面。本插件在侧边栏加一个「云端文件」入口，列出你 API key 下的全部云端文件：游标翻页、上传 / 到期时间、大小，支持删除单条与一键复制 file_id。完全复用官方 `DeepSeekFilesClient`，不新增任何凭据。

## 安装

```bash
dsh plugin --profile web add @dsh-sparrow/dsh-file-session
```

适配 dsh ≥ 0.1.2-alpha.3（本机验证基线；更早版本未验证），并需要可用的 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> **不要**直接执行 `npm install @dsh-sparrow/dsh-file-session`：那只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上面的 `dsh plugin` 命令安装，并在安装后重启 DSH。

## 使用

* **入口**：侧边栏底部「云端文件」按钮
* **列表**：每页 20 条，底部「加载更多」翻页（官方 after 游标，最新在前）；行内展示文件名 / 大小 / 上传时间 / 到期时间（有则显）
* **配额**：列表顶部显示总数与网盘式配额进度条（已用存储 / 25 GiB 官方上限）
* **删除**：行内删除按钮二次确认；「DSH 自动上传」角标（`dsh-` 前缀）的文件有额外提示——删除后旧会话再次引用时官方会自动重新上传（可能稍慢）
* **复制 file_id**：行内按钮一键复制
* **错误提示**：鉴权失败 / 限流 / 服务端错误分类展示，可重试

## 限制

* 官方 Files API **没有批量删除端点**——不做「全部清理」，只能逐条删
* 官方**没有下载端点**——不能预览 / 下载文件内容
* 配额：单 key 最多 10000 个文件 / 25 GiB（官方限制）
* **文件来源**：云端文件只在 **DeepSeek 系列模型**路径下由 DSH 自动上传（上传发生在 llm-deepseek 适配器层）；使用其它模型时列表主要为你手动 / 外部工具上传的文件

## 卸载与残留

* 插件无任何本地持久化状态；卸载后云端文件原样保留，DSH 行为不受影响
