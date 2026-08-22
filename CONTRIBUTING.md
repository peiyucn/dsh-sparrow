# 贡献指南

只记工具书里没有的实操；命令与规范见 package.json scripts 与 AGENTS.md。

## 开发环境

- DSH rc.8 源码 checkout：C:\Users\DJ028191\deepseek-harness
- Node 20+

## 本地验证（host half）

开发期用 --patch 直接加载本地 TS 源文件，无需构建：

    cd C:\Users\DJ028191\deepseek-harness
    pnpm dsh web --patch C:\Users\DJ028191\OneDrive\pyai\dsh-fim\dev.patch.yml

启动后终端打印 [dsh-fim] host loaded 即验证通过。

坑：验证前先停掉正在运行的 dsh（端口 3080 冲突）；dev.patch.yml 内是本机绝对路径，换机器要改。

## client half（M2 起）

- 构建方案：esbuild 单文件 bundle（开工时最终确定）；
- 热更：dsh checkout 内运行 pnpm run dev:web 监视重建 client bundle。

## 提交流程

1. 日常开发在 dev 分支，master 只接受发布合并；
2. 每个独立任务单独 commit（描述中文，类型前缀英文：feat: / fix: / refactor: / chore: / docs:）；
3. push 前必须 npm run verify 通过。

## Bug 报告

描述问题现象、复现步骤、DSH 版本（dsh --version），尽量附会话日志片段。