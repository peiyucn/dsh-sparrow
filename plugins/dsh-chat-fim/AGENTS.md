# 项目指令 — dsh-chat-fim（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记 chat-fim 专属约束。

## 项目概况

DSH Web 插件：聊天输入框续写联想（DeepSeek FIM 补全 Beta 转发 + dock 建议条）。2026-08-29 从对话前缀续写切换为 FIM：实测提示词修视角不稳定（同构造两次采样一次用户口吻一次助手口吻），FIM 直接续写文本、无角色语义，天然站在用户角度。

* TypeScript 实现；host half 源码在 src/，client half（M2 起）构建产物不入库（.gitignore）
* 本地验证 = npm run verify（typecheck + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

***

## 架构约束

* host half 不 import 浏览器 API；client half 不 import Node 模块
* client ↔ host 通信只走 ctx.webServer 自有路由（POST /api/chat-fim/complete）
* API key 只经 ctx.credentials 解析，绝不落明文、绝不进浏览器
* 一切副作用在 apply 内注册并配 ctx.effect 清理（DSH 插件生命周期要求）

***

## 关键文件速查

    src/host.ts              — host half 入口（webServer 路由 + settings 分节）
    src/client/index.ts      — client half 入口（dock 建议条，M2）
    test/structure.test.mjs  — 结构测试（bundle 声明与组合行）
    cordis.patch.yml         — 组合补丁（npm 安装路径）
    dev.patch.yml            — 开发补丁（--patch 加载本地 TS，内含本机绝对路径）
    docs/spec/               — 设计文档

***

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 AAA 原则（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：触发条件、建议作废判定、错误映射等抽成纯函数并导出
