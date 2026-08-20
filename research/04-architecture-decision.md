# 04 · 架构决策：为什么最终是一个插件

## 决策演进

| 阶段 | 范围 | 结论 |
|---|---|---|
| rc.7 调研 | 前缀续写 + @文件引用 | 两个功能拆两个插件（拆包原则） |
| 需求澄清 | 功能一实为「输入联想」 | 改 FIM API，插件形态变为双面（client 建议条 + host 转发） |
| rc.8 发布 | 官方内置 @文件/文件夹/会话 | 功能二终止自研 |
| **现在** | **只剩 FIM 联想** | **一个插件：dsh-fim（双面包）** |

## 最终形态

- **一个 npm 包 dsh-fim**：
  - host 半：apply 注册 FIM 转发路由 + settings 分节（行 id fim）；
  - client 半：dsh.client 声明 + ./client bundle，dock 建议条（行 id ui-fim）。
- 一张 cordis.patch.yml 两条行，用户可分别 disabled。

## 保留的准则（将来拆包时用）

拆包当且仅当出现：独立生命周期（如 Beta 端点 vs 通用能力）、不同受众、或失败域隔离需求。已记录候选：若做「回复前缀续写」→ 新包 dsh-prefix-completion（host-only）。
