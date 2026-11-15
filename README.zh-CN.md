# ✨ Desk One

**dsh-sparrow** 是一个 DeepSeek Harness（DSH）插件合集，其中 **Desk One（同桌）** 是核心插件。

[![Version](https://img.shields.io/github/package-json/v/peiyucn/dsh-sparrow?color=007ec6)](https://www.npmjs.com/org/dsh-sparrow) [![CI](https://img.shields.io/github/actions/workflow/status/peiyucn/dsh-sparrow/ci.yml?branch=main&label=ci)](https://github.com/peiyucn/dsh-sparrow/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/peiyucn/dsh-sparrow)](https://github.com/peiyucn/dsh-sparrow/blob/main/LICENSE)

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/dsh-sparrow)

**同桌（Desk One）—— 和 harness 共用的一张办公桌。**

![Desk One 主视觉](https://raw.githubusercontent.com/peiyucn/dsh-sparrow/main/resources/dsh-desk-one-hero.png)

[Desk One 文档](plugins/dsh-desk-one/README.zh-CN.md) · [插件市场](https://dsh.pyai.site/)

**同桌（Desk One）** 是 DSH Web 里与 harness 共用的办公桌：一个左侧栏入口、一块面板、一套统一对象模型。笔记批注、便签、任务、日程与 agent 会话收在同一处，日程只是你所连接日历的只读镜像。页头是一枚 **「✦」同桌｜和我说** 分段按钮，把当前 tab 的预填提示送进对话；tab 行末尾的 **…** 菜单里还有 **许个愿**，把想法整理成 GitHub issue 草稿。

## 它是什么

* **一张桌子，不是五个页面。** 所有功能收在一个 **同桌** 侧栏入口里，在面板内切 tab；每个 tab 也可以「固定到左栏」变成自己的快捷入口。
* **笔记批注——AI 主写、人批注。** 把一个已注册的 DSH 工作区链接为笔记库，浏览其中的 Markdown / 文本文件，点开一篇进入专用批注会话：精确行号、按会话的本轮基线。不做编辑器、不依赖 git，也没有新建笔记表单。
* **便签墙——一面墙，不是一张表单。** 自由摆放的贴纸画布，支持就地编辑、拖动、改大小、换颜色、调层级和垃圾桶；**Smash!** 二次确认后把整墙清进垃圾桶。
* **任务板——固定三泳道。** 待办 / 进行中 / 完成，支持颜色、按天截止、指针拖拽、一层分组与完成列存档；卡片可用 **@** 关联 DSH 会话。
* **日程聚合——只读镜像。** 企业微信、iCloud 与 Outlook 个人（Microsoft Graph）日历，以及公开 ICS 订阅，汇总成「开始 / 今日 / 近期」+ 月历 / 周历 / 列表。
* **会话管理——共享目录。** 活跃会话按工作区分组，另有归档 / 游离 / 回收站分区，可还原或彻底删除。

## 环境要求

* 要求 DSH 0.2.2-rc.3，与本仓库其它插件钉的版本线一致。
* Node.js 24.9 或更新，与 DSH 宿主要求一致。
* 便签、任务板与会话管理不需要联网或账号配置；**日程聚合**需要先在面板里连接至少一个来源（企业微信 CalDAV 同步密码、iCloud App 专用密码，或 Outlook 个人账号的 Microsoft 登录），公开 ICS 订阅也在同一设置页添加。

## 安装

* 打开 **插件 → 添加插件**，输入 `@dsh-sparrow/dsh-desk-one`，按安装 / 启用流程操作。
* 或先在 **插件 → 实验性插件** 开启 **自定义插件索引**，再打开 **插件 → 发现**，添加索引源 `https://dsh.pyai.site/market/index.json`，搜索 **同桌** 并从卡片安装。
* 安装后重启 DSH；只刷新浏览器不够，客户端 bundle 由宿主启动时读入。

## 与 harness 一起

同桌是为「你」和 harness 两边一起用设计的。面板写入的同一套对象，也通过随包 skill 和 **19 个 agent 工具** 暴露给 harness：你可以直接在对话里说，和 harness 一起操作同一张桌子。

* **`desk-one` skill**（默认开启，`/` 里也能找到）教 agent 什么时候用便签、任务、分组、日程查询或笔记页，以及 `list → revision → update` 流程；同时守住笔记边界：`desk_page_list` 只检索面板当前链接的工作区，不写文件。
* **19 个工具与面板共用同一套存储和 revision 校验。** 便签、任务、分组的编辑都带 revision 校验，agent 和面板不会静默互相覆盖；版本落后会直接报冲突。

| 分组 | 工具 | harness 能做什么 |
| :--- | :--- | :--- |
| 便签（4） | `desk_note_add` · `desk_note_list` · `desk_note_update` · `desk_note_delete` | 新建、列出、编辑（含置顶 / 垃圾桶）与删除。 |
| 任务（5） | `desk_task_add` · `desk_task_list` · `desk_task_update` · `desk_task_complete` · `desk_task_archive` | 新建、列出、编辑、完成与存档；只有完成列能存档。 |
| 分组（6） | `desk_group_add` · `desk_group_list` · `desk_group_update` · `desk_group_move` · `desk_group_archive` · `desk_group_delete` | 一层任务分组，含整组跨列移动。 |
| 日程（3） | `desk_schedule_list` · `desk_schedule_sync` · `desk_schedule_connections` | 读取镜像、触发同步、查看连接状态；外部日历始终只读。 |
| 笔记（1） | `desk_page_list` | 只读检索当前链接的笔记库。 |

这就是「与 harness 一起」的部分：**你对着同一张桌子说话**——让它加一张卡、整理便签墙、汇总本周，或找出你正在批注的那篇笔记——你们操作的是同一套对象。

## 数据与隐私

* 便签、任务、日程镜像、批注记录与会话索引行都保存在 profile 级 `desk_one` DSH 存储域；日程只是只读镜像，不会回写。
* 日程凭据（同步密码 / OAuth refresh token / 订阅链接）只保存在官方凭据库（`ctx.credentials`）；记录里只留引用名，不写日志、HTML 或导出文件。
* 面板只调用插件自己的 host 路由 `/api/desk-one`（会话在 `/api/desk-one/sessions/*`，日程在 `/api/desk-one/schedule/*`，批注在 `/api/desk-one/notebook/*`）；客户端不直接接触存储。
* 会话索引只存外键元数据、不复制对话内容；会话关联只存不透明 id。

## 已知限制

* 日程是**只读**聚合：不支持本地新建事件、写回外部日历或把自己日历发布 / 导出为 iCalendar 订阅源；订阅外部公开 ICS 已支持。
* 日程来源受各自服务约束：企业微信重新获取同步密码会作废旧密码；iCloud App 专用密码在改 Apple 主密码后失效；Outlook 令牌失效后需要重新授权。
* 任务拖拽只支持指针操作，不支持键盘排序。
* 会话关联目前只做展示与跳转：会话开始 / 结束时不会自动推进卡片状态。
* Agent 工具创建的便签只有自动摆放的坐标，拖一次之后坐标才归你；窗口变小时保存的坐标会临时夹在可见区内，空间恢复后回到原位。
* 笔记批注按设计不提供编辑器与新建笔记，只负责浏览与逐行批注。

## 开发

* 单插件检查：在本目录跑 `npm run verify`（类型检查、构建、测试、打包检查）。
* 仓库级检查：在仓库根跑 `pnpm run verify`。

## 同桌之外

同桌就是上面这一页。下面三个工具是独立插件，需要哪个就按同样的方式在插件管理器里搜索包名安装。

| 插件 | 包名 | 是什么 |
| :--- | :--- | :--- |
| [dsh-chat-fim](plugins/dsh-chat-fim/README.zh-CN.md) | `@dsh-sparrow/dsh-chat-fim` | DeepSeek FIM（Beta）输入框续写联想；停顿出卡，Tab 采纳。 |
| [dsh-codebuddy-credits](plugins/dsh-codebuddy-credits/README.zh-CN.md) | `@dsh-sparrow/dsh-codebuddy-credits` | 把公司 CodeBuddy 额度接成 DSH LLM provider，显示额度与每轮积分。 |
| [dsh-theme-tone](plugins/dsh-theme-tone/README.zh-CN.md) | `@dsh-sparrow/dsh-theme-tone` | 在 DSH 明暗主题上加色调皮肤，并优化对话区布局。 |

## 已退役

退役插件会从源码树删除，也不再维护：

* `dsh-nav-pin` 与 `dsh-vision-bridge`——2026-10-27 删除
* `dsh-file-manage`——2026-10-31 删除
* `dsh-archive-manage`——2026-11-15 退役

## License

MIT
