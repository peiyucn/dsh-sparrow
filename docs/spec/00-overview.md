# 00 · 插件概览

## 定位

dsh-fim 给 DeepSeek Harness Web 的聊天输入框加「FIM 联想」：用户打字停顿片刻，插件给出接下来可能写的文字建议，点击采用即追加进草稿。

## 形态

一个 npm 组合包（bundle），双面：

- host half（Node）：转发 DeepSeek FIM Beta 请求；
- client half（浏览器）：输入框建议条 UI。

## 架构

    +--------------------+   fetch    +----------------------------+   +--------------+
    | conversation.input | ---------> | ctx.webServer 路由         | ->| DeepSeek FIM |
    | .dock 建议条        | <--------- | /api/fim/complete          | <-| Beta /beta   |
    | 点击采用 setDraft   |   {text}   | credentials seam 取 key    |   +--------------+
    +--------------------+            +----------------------------+

## 关键设计决定

| 决定 | 结论 |
|---|---|
| 建议呈现 | conversation.input.dock 单行建议条（输入框内 ghost text 是私有能力，不可用） |
| 采用方式 | 点击按钮 → inputActions.setDraft（Tab 键不可拦截） |
| 数据通道 | 插件自有 HTTP 路由（官方 API 网关 RPC 面不开放给第三方） |
| 补全接口 | DeepSeek FIM Beta（completions.create，prompt = 已输入文本） |
| 密钥 | DSH credentials seam，不落明文、不进浏览器 |

## 文档索引

- 详细设计：docs/spec/01-design.md
- 路线图：docs/spec/02-roadmap.md