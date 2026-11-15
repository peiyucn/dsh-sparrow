# 🐦dsh-sparrow

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

## 使用

### 笔记批注

* 在面板顶栏选择已注册工作区。未链接首页直接列出已注册工作区；不提供选择文件夹或取消链接，也没有新建笔记。
* 页面顶部一行是官方搜索框（左侧，占满剩余宽度）和固定 340px 的白色 **浏览工作区文件，点击 ✦ 开始批注** 按钮（右侧）。四档视图、计数与翻页在列表表头；每页 20 条紧凑单行。
* 点开一篇即进入或复用该笔记的批注会话：精确行号、MD / 代码视图、就地批注输入框、**提交批注**与**本轮改动**两枚 split 按钮，以及按会话的本轮基线。官方预览头部对任一工作区内的 Markdown / 文本文件也出现同款 ghost ✦ 按钮。
* 不做编辑器、不依赖 git：批注由用户在界面里完成，面向 agent 的笔记工具只有只读的 `desk_page_list` 检索。

### 便签墙

* 点标题行的 **便签** 或双击墙面空白处新建贴纸；就地输入，失焦即保存，内容清空的贴纸会移除。
* 墙面是固定宽度、纵向无限画布。按住正文拖动、拖右下角改大小、换颜色、点哪张哪张到最上层；位置、尺寸与层级都按便签保存。
* 贴纸上的小垃圾桶把它丢进垃圾桶；垃圾桶视图可恢复或永久删除。墙上限 100 张、垃圾桶 200 张，垃圾桶一次加载 10 行。
* **Smash!** 二次确认后把整墙贴纸移进垃圾桶；点其它地方或按 Esc 取消。垃圾桶装不下时会被拦下。

### 任务板

* 固定三泳道：待办 / 进行中 / 完成。点列头 **＋** 或双击泳道空白处新建；可设颜色与按天截止日期。只有 **完成** 列的卡片和分组能存档。
* 按住卡片任意位置拖动：副本跟手、泳道高亮、蓝色插入线标出落点；无效落点飞回原处。
* 一层分组可为空、就地改名、拖六点手柄排序。按住分组头拖动整块（含卡片）；完成列分组存档时卡片一起存档。
* 排序可切手动 / 创建时间 / 截止日期。卡片上的 **@** 可关联会话，chip 显示实时状态与预览；关联不会覆盖卡片标题或描述。

### 日程聚合

* 上排是 **开始**（笔记批注 / 便签 / 任务三枚窄高白色按钮）、**今日** 和 **近期**；下方是月历（默认、周一起始）、周历（ISO 周序号、0–24 小时时间轴）和列表。
* 点事件在鼠标附近弹卡片；外部事件只读，可复制或跳回原客户端。顶栏 **日历设置** 管理来源、日历与手动同步。
* 面板打开时同步、之后每 15 分钟一次。同步失败时 **日历设置** 出现红色感叹号，对应来源卡显示具体错误；日历页本身不显示错误。

### 会话管理

* 活跃会话按工作区分组；归档、游离与回收站分区共用同一套行布局。父子会话嵌套显示，操作挂在父行。
* 归档 / 取消归档走官方 API，不动文件；有进行中活动的会话会被拒绝，需先停止生成。移入回收站、还原与彻底删除在归档 / 回收站分区里做；删除普通会话要逐字输入标题，父会话会带上子会话。
* 每行有复制名称与复制 ID 按钮，结果在按钮上反馈。每个分区每次加载 30 条；宿主缺少会话服务时该 tab 降级，不会拖垮同桌。

### 和我说与许个愿

* **「✦」同桌｜和我说** 分段按钮把当前 tab 的提示预填进输入框并聚焦，不自动发送；没有工作区时沿用官方提示。
* tab 行末尾 **…** 菜单里的 **许个愿** 把功能想法预填成 GitHub issue 草稿请求；先给你看标题和正文，不会自动发布。

## 数据与隐私

* 便签、任务、日程镜像、批注记录与会话索引行都保存在 profile 级 `desk_one` DSH 存储域；日程只是只读镜像，不会回写。
* 日程凭据（同步密码 / OAuth refresh token / 订阅链接）只保存在官方凭据库（`ctx.credentials`）；记录里只留引用名，不写日志、HTML 或导出文件。
* 面板只调用插件自己的 host 路由 `/api/desk-one`（会话在 `/api/desk-one/sessions/*`，日程在 `/api/desk-one/schedule/*`，批注在 `/api/desk-one/notebook/*`）；客户端不直接接触存储。
* Agent 工具（`desk_note_*`、`desk_task_*`、`desk_group_*`、`desk_schedule_*`、`desk_page_list`）读写同一套对象；随包注册 `desk-one` 操作指南 skill（默认开启、`/` 里可用），讲对象选择、list → revision → update 流程和当前工作区边界。会话索引只存外键元数据、不复制对话内容；会话关联只存不透明 id。

## 已知限制

* 日程是**只读**聚合：不支持本地新建事件、写回外部日历或把自己日历发布 / 导出为 iCalendar 订阅源；订阅外部公开 ICS 已支持。
* 日程来源受各自服务约束：企业微信重新获取同步密码会作废旧密码；iCloud App 专用密码在改 Apple 主密码后失效；Outlook 令牌失效后需要重新授权。
* 任务拖拽目前只支持指针操作，暂不支持键盘排序。
* 会话关联目前只做展示与跳转：会话开始 / 结束时不会自动推进卡片状态。
* Agent 工具创建的便签只有自动摆放的坐标，拖一次之后坐标才归你；窗口变小时保存的坐标会临时夹在可见区内，空间恢复后回到原位。
* 专注、跨对象搜索以及更丰富的任务字段（优先级、估算、标签）按仓库 spec 排期；笔记批注按设计不提供编辑器与新建笔记。

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

退役插件会从源码树删除；npm 包保留已发布版本（不作 unpublish）：

* `dsh-nav-pin` 与 `dsh-vision-bridge`——2026-10-27 删除
* `dsh-file-manage`——2026-10-31 删除
* `dsh-archive-manage`——2026-11-15 退役

## License

MIT
