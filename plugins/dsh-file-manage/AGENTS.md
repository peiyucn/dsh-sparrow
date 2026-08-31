# 项目指令 — dsh-file-manage（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：DeepSeek Files API 云端文件管理面板——侧边栏 footer 入口 + 弹窗列出本 API key 下全部云端文件（游标翻页、每页 20），支持单条删除与复制 file_id。复用官方 `@deepseek-ai/dsh-llm-deepseek` 导出的 `DeepSeekFilesClient`，不经手新凭据。无本地持久化（零 sidecar）、无配置项。

* 范围（owner 拍板 2026-09-01）：只做清单 / 单条删除 / 复制 file_id；不做全部清理（官方无批量删除端点，逐条循环调用成本不可控）、不做会话归属、不做面板上传、不做预览下载（官方无下载端点）、不给 agent 加工具。
* **官方删除安全性**：引用已删 file_id 的请求触发官方 adapter 失效重试（`adapter.ts` staleFile 分支：`providerRejectedFileId` → `invalidate` → 重试一次并重新上传）——删除安全，面板提示文案据此措辞。
* TypeScript 实现；host half 源码在 src/，client half 构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + client bundle + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块
* 一切副作用在 apply 内注册并配 ctx.effect 清理
* 凭据只经 ctx.credentials 解析，不落日志、不进浏览器
* 无本地持久化：卸载后 DSH 行为不受影响

## seam 特例（需项目 owner 认可，已定案）

* **复用官方客户端**：直接 import 官方导出 `DeepSeekFilesClient`（peer 依赖 `@deepseek-ai/dsh-llm-deepseek`）；官方改导出需插件升级。
* **只读官方 llm-deepseek 设置节**：`ctx.settings.describe()` 找 `ns === 'llm-deepseek'` 的已解析值（schema 默认 + 组合 base + 用户层），只取 `baseURL` / `apiKeyEnv` 两字段；官方改节名 / 字段需插件升级。
* **连接事实解析（与官方 adapter 同路径）**：baseURL 回退 `$DEEPSEEK_BASE_URL` → `https://api.deepseek.com`；key 经 `ctx.credentials.resolve(credentialRef(apiKeyEnv))`（apiKeyEnv 缺省 `DEEPSEEK_API_KEY`），chat-suggest 同款模式。
* **dsh- 前缀警示**：官方自动上传文件（`dsh-` 前缀文件名）删除时给更强确认文案；不读官方上传索引文件。
* **仍禁止**：monkey-patch 核心、绕过官方 client 直连 api.deepseek.com、写官方上传索引、动其它内部文件。

## 关键文件速查

    src/host.ts        — host half 入口（连接解析 + prefix 路由 list / 单条删除）
    src/files.ts       — 纯逻辑（分页归一化 / 行格式化 / 错误分类）
    src/client/index.ts — client half 入口（locale 字典 + API 封装 + sidebar slot 注册）
    src/client/FileManageDock.tsx — 云端文件面板（列表 / 翻页 / 删除确认 / 复制）
    test/files.test.mjs    — 纯逻辑单测
    test/structure.test.mjs — 结构测试（bundle 声明与组合行）
    cordis.patch.yml   — 组合补丁（npm 安装路径）
    dev.patch.yml      — 开发补丁（--patch 加载本地 TS，内含本机绝对路径）
    docs/spec/         — 设计文档

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 AAA 原则（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：分页归一化、大小 / 时间格式化、dsh- 判定、错误分类
