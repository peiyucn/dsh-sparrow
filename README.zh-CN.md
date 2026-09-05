# 🐦 dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**DeepSeek Harness（DSH）Web 插件小合集。**

每个插件独立发布、独立安装；某功能被官方原生支持后，对应插件从合集中退役。上方版本徽章跟踪合集对齐版本线（镜像官方 dsh），点击进入 npm org 页可看各包自己的版本。

## 安装

前置条件：可用的 `dsh` CLI 和 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

> 这些包虽然发布在 npm，但**不要**直接用 `npm install @dsh-sparrow/...` 安装：那只会把它们下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用下面的 `dsh plugin` 命令，让包安装到 `$DSH_HOME/profiles/web` 并激活 bundle 层；安装后请重启 DSH。

## 插件目录

| 插件 | 是什么 | 安装 |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.zh-CN.md) | 输入框续写联想：停顿后出官方同款候选卡、Tab 采纳；DeepSeek FIM（Beta）驱动，触发灵敏度三档，续写模型跟随主模型。 | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-vision-bridge](plugins/dsh-vision-bridge/README.zh-CN.md) | 纯文本主模型的视觉通道：`vision_read` 工具用官方 DeepSeek 视觉模型读图并回传结构化文字报告。 | `dsh plugin --profile web add @dsh-sparrow/dsh-vision-bridge` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.zh-CN.md) | 归档会话管理：取消归档 / 移入回收站 / 彻底删除 / 回收站还原，父会话与子会话整体操作。 | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |
| [dsh-nav-pin](plugins/dsh-nav-pin/README.zh-CN.md) | 轮次导航窄屏不消失——纯样式注入。 | `dsh plugin --profile web add @dsh-sparrow/dsh-nav-pin` |
| [dsh-file-manage](plugins/dsh-file-manage/README.zh-CN.md) | DeepSeek Files API 云端文件：游标翻页列表、配额条、单条删除、一键复制 file_id。 | `dsh plugin --profile web add @dsh-sparrow/dsh-file-manage` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.zh-CN.md) | 公司 CodeBuddy 额度接成 DSH LLM provider：选择器显示积分系数、头部额度面板、每轮积分胶囊。 | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |

## License

MIT
