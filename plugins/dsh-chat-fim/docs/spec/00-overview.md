# 00 · 插件概览 — dsh-chat-fim

> dsh-sparrow 合集成员。本文是需求范围与验收边界；详细设计见 01-design.md，路线图见 02-roadmap.md。

## 定位

给 DeepSeek Harness Web 的**聊天输入框**加「续写联想」：用户打字停顿片刻，插件给出「接下来可能写的文字」建议；点击采用即追加进草稿。补全由 DeepSeek 官方 [FIM 补全（Beta）](https://api-docs.deepseek.com/zh-cn/guides/fim_completion) 接口生成：host 把最近对话历史转成「用户：/助手：」说话人文本、草稿作为最后一个用户说话人的开头，纯文本续写天然站在用户角度——2026-08-31 三方案直连 A/B（FIM 转写体 / 「用户：」伪前缀 / 官方语义前缀）8/8 样本 FIM 全胜（见 AGENTS.md）；曾短暂使用对话前缀续写（`prefix: true`），因「续写 assistant 自己的消息」的官方语义与「续写用户的话」冲突（结构性角色漂移）而弃用。

## 需求范围（做什么 / 不做什么）

**做**：

* host half：注册自有路由 `POST /api/chat-fim/complete`，把（会话、最近对话历史转说话人文本、草稿）转发到 DeepSeek FIM 补全（Beta），返回候选建议；
* client half（M2）：输入框旁的 dock 建议条——触发、展示、作废、采用；
* 触发/作废/采用的交互规则与错误降级。

**不做**：

* 不做通用代码补全引擎（只做聊天输入框，模型与提示词交给官方接口）；
* 不接管会话、不替换会话模型、不动 dsh 内部文件布局；
* 不缓存/不落 API key（凭据只经 `ctx.credentials` 解析）；
* 不把草稿内容写入日志（用户输入视为敏感）。

## 验收标准

### M1 · host half（转发路由）

* `POST /api/chat-fim/complete` 返回结构化的候选建议；非法请求按错误码拒绝（见 01 错误映射表）；
* 上游超时/断连可取消，不悬挂、不泄漏 AbortController；
* 配置（baseURL / model / maxTokens / apiKeyEnv）从插件设置分节读取，无明文 key；
* `npm run verify` 全绿，纯逻辑（请求校验、错误映射）有单测。

### M2 · client half（dock 建议条）

* 停顿触发建议条；继续输入/光标移动/发送/采纳后旧建议作废；
* 中文输入法组合态（composition）期间不触发、不闪断；
* 点击/键盘采用后文本追加进草稿，行为可预期；
* 客户端不接触 API key，所有请求经 host 路由。

## 退役条件

官方在输入框原生支持续写联想后，本插件从合集中退役。
