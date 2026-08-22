# 项目指令 — dsh-fim

## 语言

* **始终用简体中文回复**

***

## 项目概况

DSH（DeepSeek Harness）Web 插件：聊天输入框 FIM 联想（DeepSeek FIM Beta 转发 + dock 建议条）。

* TypeScript 实现；host half源码在 src/，client half（M2 起）构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs
* 主要模块：src/host.ts（host half入口）；M2 起 src/client/（browser half）

***

## 需求

* 新功能设计文档放在 docs/spec/，文件名 NN-<主题>.md
* 先写 spec 再开发——明确需求范围、交互边界、验收标准

***

## 开发

### 基本规则

* **Git commit 规范**：commit 描述用**中文**，类型前缀保留英文（feat:、fix:、refactor:、chore:、docs: 等）。例：feat: 新增 FIM 转发路由、fix: 修复建议作废判定
* **逐项提交**：每完成一个独立任务**必须**单独 git commit，禁止多个任务混在一个 commit 中
* **诚实原则**：不确定的事直接说"不确定"，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息
* **优雅原则**：禁止 hack 或补丁式写法，优先走官方 seam（llm / webServer / slots / provide 通道等正路 API）
* **自检原则**：代码移动/提取后**必须**搜索确认旧位置已删除，不得留有死代码或同名遮蔽
* **查证原则**：引用 DSH 服务、事件、插槽契约时，先以 cordis_inspect 查询或 grep 源码确认，禁止凭记忆编造

### 架构约束

* host half不 import 浏览器 API；client half不 import Node 模块
* client ↔ host 通信只走 ctx.webServer 自有路由（POST /api/fim/complete）
* API key 只经 ctx.credentials 解析，绝不落明文、绝不进浏览器
* 一切副作用在 apply 内注册并配 ctx.effect 清理（DSH 插件生命周期要求）

### 关键文件速查

    src/host.ts              — host half入口（webServer 路由 + settings 分节）
    src/client/index.ts      — client half入口（dock 建议条，M2）
    test/structure.test.mjs  — 结构测试（bundle 声明与组合行）
    cordis.patch.yml         — 组合补丁（npm 安装路径）
    dev.patch.yml            — 开发补丁（--patch 加载本地 TS）
    docs/spec/               — 设计文档
    CONTRIBUTING.md          — 贡献指南（开发环境 / 本地验证 / 提交流程）

***

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 **AAA 原则**（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：触发条件、建议作废判定、错误映射等抽成纯函数并导出

***

## Git 规范

### 分支

* 日常开发一律在 dev 分支（仓库默认分支）
* master 只接受发布合并，不直接在上面开发

### Push

* push 前**必须**先跑 npm run verify，成功才允许推送
* 日常推送目标：dev

### 发布

* 更新 package.json 版本号 → README / CHANGELOG 同步 → npm run verify → npm publish（或 tarball 交付）