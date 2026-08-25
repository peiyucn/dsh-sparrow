# 02 · 路线图 —— dsh-archive-session

> 规划中；实际里程碑以评审后为准。

## M1 · 查证与定案

* 补查：`workspace` 有无公开 unarchive / 列归档方法；`ui-workspace` 工具栏 slot（搜索 / 排序 / 添加工作区间加按钮）；`sessionReferenceResolver` / `sessionQuery` 可装饰性（或装配层替换）。
* 定案：路线 A 用哪个 seam；备份夹路径与命名。

## M2 · 按定案实现（路线 A + 归档查看 + 备份 / 删除）

* 工作区工具栏入口按钮 + 弹窗（列出轻归档会话 + archived / running / current 状态），状态一致、可打断。
* 路线 A：会话侧缓存 / 轻量标题；纯逻辑单测；`npm run verify`。
* 备份 / 删除共用清理链：停会话 → flush → 移动（备份）/ `rm`（删除）→ 清理记账（`workspaceDomainSpec` + `ctx.storageDomain`）→ 同步帧；备份二次确认、删除强确认；备份可移回；清理链纯逻辑与状态机补单测。
* 文档：seam 特例写入插件 AGENTS.md；备份夹位置与恢复方法写明。

## M3 · 验证与发布

* 对要发布的插件执行《代码审计》；README / package.json 对齐；打 tag 发布（流程见根 AGENTS.md）。
