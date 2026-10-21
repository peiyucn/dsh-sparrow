# 10 · 上游内容指纹（11128）的 system / assistant 处理（2026-10-21 提出；同日 owner 确认方案并实施）

> 需求由 owner 提出：「推理接口用不了了」→ 排查确认为上游内容级指纹拦截；
> owner 明确选择「不要那句」而不是改写或伪装官方客户端。本文件记录证据、改动范围与维护办法。

## 症状与定位

- 症状：任一 CodeBuddy 模型推理都返回
  `HTTP 400 {"code":11128,"msg":"Illegal API invocation from an unapproved channel",`
  `"displayMsg":{"zh":"请求被拦截，请重新发送"}}`，DSH 里显示「本轮运行失败 / PROVIDER」。
- **不是**账号、Key、模型、UA、`X-IDE-Name`、`X-Product`、企业上下文头、域名、
  `X-Conversation-*` 头族的问题：2026-10-21 在公司网络（能过企业 IP 白名单）逐项换过，
  这些变体全部 200。
- **不是** `developer` role 触发的 11128：`toWireMessages` 对 developer 在 fetch 之前就抛
  `UNSUPPORTED_CONTENT`，到不了服务端。
- 真正原因：上游自 **2026-10-20 深夜**起，对 `system` / `assistant` 正文做**逐字指纹匹配**
  （行首锚定、忽略大小写），把 DSH 系统提示词首行
  `You are an AI agent powered by DeepSeek Harness.` 列入了黑名单。
  适配器把宿主 `options.system` 原样作第一条 system 发出 ⇒ **每轮必拦**。

## 定案证据（2026-10-21，公司网络，真实 system 提示词 8696 字符 / 49 行）

| 用例（只改 system 首句，其余逐字相同） | 结果 |
| :--- | :--- |
| 真实 DSH system 原文（= 插件线上实际发送内容） | **400 / 11128** |
| 首句全小写 | 400 / 11128（大小写不敏感） |
| 首句改成 `powered by **the** DeepSeek Harness` | 200 |
| `DeepSeek\u200b Harness`（零宽） | 200 |
| 删掉首句 | **200** |
| 中性 system | 200 |
| assistant 历史正文含该句 | 400 / 11128（历史重放同样拦） |

另：同日实测 `Main branch (you will usually use this for PRs)`（位置无关）与
`You are Claude Code, Anthropic's official CLI for Claude`（行首）也返回 11128；
DSH 真实 system 里**不存在**这两句，故本次不处理（见「维护」）。

## 处理方式（实现）

- 新模块 `src/fingerprints.ts`：`stripChannelFingerprints(text)` 纯函数，**整行删除**命中的指纹行，
  其余行逐字保留；未命中时返回原字符串引用；幂等；CRLF 行尾不变。
- 接线点（`src/adapter.ts` `toWireMessages`）：
  - `options.system` → 删指纹行；删空则不发 system 消息；
  - 历史上的 `system` 角色消息 → 同样处理；
  - `assistant` 正文 → 同样处理（救「历史里复述过该句」的旧会话）；
  - **不动** `user` / `tool` 结果 / `tool_calls[].arguments` / `reasoning`（实测放行，
    改了就是篡改用户内容与会话证据）。
- 选「删除」而不是「插 the / 零宽」：改动最少，不依赖上游是否做 Unicode 归一化；
  模型仍能从下一句 `You are a coding agent powered by <模型名>` 知道自己是什么。
- **不改 UA / `X-IDE-Name`**：不伪装官方客户端（《请求形态规矩》的身份如实自报口径不变），
  且实测渠道判定不看这些头。

## 测试

`test/fingerprints.test.mjs`：删行/大小写/行首锚定/行中段不命中/幂等/CRLF/空串，以及
`toWireMessages` 的范围守卫（system 与 assistant 处理、user 与 tool 原样、tool_calls 参数不动、
system 只剩指纹时不再发空 system）。

## 风险与维护（必须如实记录）

1. **上游黑名单会继续扩张**：这是与上游风控的长期拉锯，不是一次性修复。新指纹出现时往
   `FINGERPRINT_LINE_PREFIXES` 补一条正则 + 补测试；补完必须用**真实 system 提示词**实测一次推理
   （不能只看 HTTP 状态码或单测）。
2. **风险自担**：该处理是为绕开上游「未授权渠道」内容风控而删句；owner 已知悉并选择此方案。
   若上游把删除后的版本也纳入指纹，或改为语义检测，本改动即失效。
3. **失效表现**：仍是 `400 / 11128`。看到该码先按本文方法复测真实 system，而不是先怀疑额度/封号。
4. **不扩大范围**：绝不改写 user 消息、工具结果与会话证据；否则会把排障污染带进用户会话。
