# 🐦dsh-sparrow

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**同桌（Desk One）—— 和 harness 共用的一张办公桌。**

![Desk One 主视觉](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

`dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`

[Desk One 文档](plugins/dsh-desk-one/README.zh-CN.md) · [插件市场](https://dsh.pyai.site/)

Desk One 是这张桌子；下面三个工具随桌附送、单独安装。每个插件独立发布，某功能被 DSH 原生支持后对应插件即退役。上方版本徽章跟踪合集对齐版本线，与官方 dsh 同步。

## 桌上有什么

* **笔记批注** —— 把一个 DSH 工作区链接为笔记库，浏览其中的 Markdown / 文本文件，在专用批注会话里按精确行号批注。不做编辑器、不依赖 git，也没有新建笔记表单。
* **便签墙** —— 自由摆放的贴纸画布，支持就地编辑、拖动、改大小、换颜色、调层级和垃圾桶；**Smash!** 二次确认后清空整墙。
* **任务板** —— 待办 / 进行中 / 完成三泳道，支持颜色、按天截止、指针拖拽、一层分组与完成列存档。
* **日程聚合** —— 企业微信、iCloud、Outlook 个人日历与公开 ICS 订阅的只读镜像，带「开始 / 今日 / 近期」和月历 / 周历 / 列表。
* **会话管理** —— 共享的 agent 会话目录：按工作区分组、归档管理、回收站与父子嵌套。
* **和我说** —— 页头的 **「✦」同桌｜和我说** 分段按钮把当前 tab 的提示预填进输入框；不按发送就不会发出。

## 环境要求

* DSH 0.2.2-rc.3——本版构建与验证所对齐的**确切**官方版本线（[deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）；更新的版本线、尤其是预发布版本**不在承诺范围内**。插件遇到不支持的 DSH 时会自行停用（日志留一行说明），不会拖垮 DSH。
* Node.js 24.9 或更新，与 DSH 宿主要求一致。
* 可用的 `dsh` CLI 和 `pnpm`（`dsh plugin` 会把安装操作转发给 pnpm）。

## 安装

> 下面每个包都请用 `dsh plugin` 安装。直接 `npm install @dsh-sparrow/...` 只会把包下载到某个 `node_modules`，不会注册进 DSH 的 web profile；安装后请重启 DSH。

* `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one`
* 需要随桌工具时，只装下表中你想要的那几个。
* 打开面板后，可以在各 tab 头部把常用页面「固定到左栏」。

## 在 DSH 插件市场里安装

也可以从 DSH 的 **插件 → 发现** 里浏览安装（自定义插件市场是实验性功能：先在 **插件 → 实验性插件 → 更多** 打开「自定义插件市场」）。打开 <https://dsh.pyai.site/> 能看到索引地址与步骤，索引地址是：

```
https://dsh.pyai.site/market/index.json
```

「发现 → 添加索引源」粘贴上面的地址即可。市场会按你当前运行的 DSH 版本标出可用版本——本合集的每个插件只承诺版本线所标示的那一条线，所以卡片上显示的通常就是唯一可装的那个版本。

## 插件目录

| 插件 | 是什么 | 安装 |
| :--- | :--- | :--- |
| [dsh-desk-one](plugins/dsh-desk-one/README.zh-CN.md) | **同桌（Desk One）**——这张桌子：笔记批注、便签、任务、只读日程与会话管理，都在一个面板里。 | `dsh plugin --profile web add @dsh-sparrow/dsh-desk-one` |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.zh-CN.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-chat-fim&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-chat-fim) | ![续写联想建议卡](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-chat-fim.png "ratio:0.18")<br>输入框续写联想：停顿后浮现一张建议卡、Tab 采纳；DeepSeek FIM（Beta）驱动，触发灵敏度三档，续写模型跟随主模型。 | `dsh plugin --profile web add @dsh-sparrow/dsh-chat-fim` |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.zh-CN.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-codebuddy-credits&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-codebuddy-credits) | ![会话页额度入口与面板](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-codebuddy-credits.png "ratio:0.25")<br>公司 CodeBuddy 额度接成 DSH LLM provider：模型选择器里显示各模型的积分倍率、顶栏有额度面板、每轮显示消耗的积分。 | `dsh plugin --profile web add @dsh-sparrow/dsh-codebuddy-credits` |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.zh-CN.md) [![npm downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fapi.npmjs.org%2Fdownloads%2Fpoint%2F2015-01-01%3A2099-01-01%2F%40dsh-sparrow%2Fdsh-theme-tone&query=%24.downloads&label=downloads&color=ea7233)](https://www.npmjs.com/package/@dsh-sparrow/dsh-theme-tone) | ![深色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-dark.png "ratio:0.5") ![浅色主题](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-theme-tone-light.png "ratio:0.5")<br>在 DSH 内置的浅色与深色主题上各加几款色调皮肤（左深右浅），选了色调后还会一并优化对话区布局。 | `dsh plugin --profile web add @dsh-sparrow/dsh-theme-tone` |

## 已退役

退役插件会从源码树删除；npm 包保留已发布版本（不作 unpublish）：

* `dsh-nav-pin` 与 `dsh-vision-bridge`——2026-10-27 删除
* `dsh-file-manage`——2026-10-31 删除
* `dsh-archive-manage`——2026-11-15 退役

已安装的可用 `dsh plugin --profile web remove @dsh-sparrow/<插件名>` 卸载。

## License

MIT
