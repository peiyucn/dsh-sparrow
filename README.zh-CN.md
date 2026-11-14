# 🐦dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**同桌（Desk One）—— 和 harness 共用的一张办公桌。**

![Desk One 主视觉](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

`dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`

* **一张桌子，不是五个页面。** 便签、任务、日程、笔记审阅都在一个侧栏入口后面。
* **和 DSH 一起。** 顶栏「和我说」把一句人话变成预填提示——便签、任务、笔记都可以直接说。
* **AI 写、你审。** 把 DSH 工作区链接成笔记库：AI 在里面写，你在审阅会话里逐行批注。

[Desk One 文档](plugins/dsh-desk-one/README.zh-CN.md) · [插件市场](https://dsh.pyai.site/)

两种用法：自己点，或者直接对 DSH 说。顶栏「和我说」会把按当前页面预填好的提示放进对话；面板「…」菜单里还有「许个愿」，想要什么功能先说一句。

Desk One 是这张桌子；下面其余插件随桌附送、单独安装。

## 插件目录

| 插件 | 是什么 | 安装 |
| :--- | :--- | :--- |
| [dsh-desk-one](plugins/dsh-desk-one/README.zh-CN.md) | 同桌（Desk One）——便签、任务、只读日程，以及 AI 写、你审的笔记，都在一个面板里。 | `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one` |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.zh-CN.md) | 输入框续写联想：停顿后浮现建议卡、Tab 采纳，触发灵敏度三档可调。 | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.zh-CN.md) | 把 CodeBuddy 额度接成 DSH LLM provider：模型选择器显示倍率、顶栏额度面板、每轮积分。 | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.zh-CN.md) | 在官方明暗主题上加色调皮肤，并附带对话区布局优化。 | `dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone` |
| [dsh-archive-manage](plugins/dsh-archive-manage/README.zh-CN.md) | 归档会话管理：取消归档、移入回收站、彻底删除、还原，父会话与子会话整体操作。 | `dsh plugin --profile web add @dsh-sparrow/dsh-archive-manage` |

## 环境要求

* DSH 0.2.2-rc.3——本版构建与验证所对齐的**确切**官方版本线（[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）；更新的版本线、尤其是预发布版本**不在承诺范围内**。插件遇到不支持的 DSH 时会自行停用（日志留一行说明），不会拖垮 DSH。
* Node.js >= 22.19.0
* 可用的 `dsh` CLI 和 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）

## 安装

> 这些包虽然发布在 npm，但**不要**直接用 `npm install @dsh-sparrow/...` 安装：那只会把它们下载到某个 `node_modules`，不会注册进 DSH 的 web profile。请使用上表里的 `dsh plugin` 命令，让包安装到 `$DSH_HOME/profiles/web` 并激活 bundle 层；安装后请重启 DSH。

## 在 DSH 插件市场里安装

也可以从 DSH 的 **插件 → 发现** 里浏览安装（自定义插件市场是实验性功能：先在 **插件 → 实验性插件 → 更多** 打开「自定义插件市场」）。打开 <https://dsh.pyai.site/> 能看到索引地址与步骤，索引地址是：

```
https://dsh.pyai.site/market/index.json
```

「发现 → 添加索引源」粘贴上面的地址即可。市场会按你当前运行的 DSH 版本标出可用版本——本合集的每个插件只承诺版本线所标示的那一条线，所以卡片上显示的通常就是唯一可装的那个版本。

## 已退役

本仓库已无退役插件：`dsh-nav-pin` 与 `dsh-vision-bridge` 已于 2026-10-27 删除，`dsh-file-manage` 已于 2026-10-31 删除。`@dsh-sparrow/dsh-file-manage` 的 npm 历史版本保留（不作 unpublish），但不再维护；已安装的可用 `dsh plugin --profile web remove @dsh-sparrow/dsh-file-manage` 卸载。

## License

MIT
