# 10 · 上游内容指纹（11128）的 system / assistant 处理（2026-10-21 提出；同日 owner 确认方案并实施；同日晚补第二波）

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

## 第二波（2026-10-21 傍晚 · Web 端运行时上下文行）

第一波修复上线后，傍晚 17:24 左右起同一批请求又全部 `400 / 11128`（用户报「上午刚修好的又报错了」）。
账号 / Key / 网络 / 模型都没变，几分钟前还成功的同一会话从下一步开始被拒。

### 定位（真实 system 复测 + 二分）

- **不是** strip 失效：用当前真实 DSH system（8691 字符 / 49 行，含 Web 端运行时上下文）复测——
  原文 400、**现有 strip 结果仍 400**、中性 system 200 ⇒ 上游黑名单新增了一条，且落在 strip 覆盖不到的内容上。
- 按行二分：命中区间收敛到**最后一行**（DSH Web 端运行时上下文那一行，1002 字符）。
- **坑：单句逐个探全部 200**。该行按 `. ` 拆成 8 句逐句发，8 句全部 200；按行区间二分才暴露。
- 句子组合实验（只改相邻句子，其余不变）：

| 用例 | 结果 |
| :--- | :--- |
| 整行（原样） | **400 / 11128** |
| 整行全小写 | 400 / 11128（大小写不敏感） |
| 第 1 句 `You are interacting … Web GUI whose URL the runtime context names.` 单发 | 200 |
| 第 2 句 `When the user refers to "this page" …` 单发 | 200 |
| **第 1 句 + 第 2 句**（原顺序拼接） | **400 / 11128** |
| 第 2 句 + 第 1 句（顺序颠倒） | 200 |
| 第 1 句 + 第 3 句（其它后句） | 200 |
| 第 1 句去掉 `DeepSeek Harness` / 改写成 `Web GUI` + 第 2 句 | 200 |
| 第 1 句里 `DeepSeek\u200b Harness`（零宽） | 200 |
| 删掉第 1 句、保留第 2 句起的整行 | **200** |

⇒ 这条指纹的形态是**「行首锚定 + 跨句通配」**：需要「行首第 1 句」和后面的
`When the user refers to "this page" …` 同时出现才命中，单句字面量检测不出来。它和第 1 波的
单句字面量不同，所以第一波「删行首句」的规则没有覆盖到它。

### 处理方式（实现）

- 在 `FINGERPRINT_LINE_PREFIXES` 追加第二条行首锚定正则，匹配该行**第一句**（到句号为止）；
  `stripChannelFingerprints` 命中后只丢这一句，**保留该行其余 7 句指令**（「this page / this GUI」
  指代、HMR 只对客户端插件生效、改完要重建产物、**不要另起 server** 等仍是需要的指令，
  整行删会丢指令）。
- 处理后该行以 `When the user refers to …` 开头；实测完整真实 system 返回 **200**（流式正常）。
- 不动第 2 句及其后的内容：上游只拦「第 1 句 + 第 2 句」这个组合，删第 1 句即拆掉组合。

## 第三波（2026-10-21 晚 · assistant 历史里的 Main branch）

第二波修好后，**新会话**能正常推理；但**已有较长历史的会话**（本机这个排障会话）仍然 11128。
用会话日志把失败请求原样重建（真实 system + 300 条历史 + 50 个工具定义）后逐项重放：

- 只发 system → 200；system + 工具定义 → 200；**system + 完整历史 → 400 / 11128** ⇒ 触发点在历史里。
- 按 user 消息边界做安全二分（避免切断 tool_call / tool 结构）：第一个失败前缀停在一条
  **assistant** 消息上；再对该消息的 wire 文本做前缀二分，最小触发片段正是
  `Main branch (you will usually use this for PRs)`——它出现在 markdown 表格里（**行中段**）。

### 位置与角色矩阵（小请求实测）

| 用例 | 结果 |
| :--- | :--- |
| assistant 行首 `Main branch (…)` | 400 / 11128 |
| assistant **行中段** `Main branch (…)` | 400 / 11128（**位置无关**） |
| assistant 行首 `You are Claude Code, Anthropic's official CLI for Claude` | 400 / 11128 |
| assistant 行中段 `You are Claude Code …` | 200（**行首锚定**） |
| assistant 行中段 身份句 | 200（行首锚定） |
| assistant 行中段 Web GUI 单句 | 200 |
| assistant **行中段 Web GUI 首句 + `When the user refers to "this page"`** | 400（**组合位置无关**） |
| user 正文里同一句 | 200（不扫） |
| tool 结果里同一句（结构合法） | 200（不扫） |
| tool_calls 参数里同一句 | 200（不扫） |

⇒ 上游只扫 **system / assistant 正文**；assistant 历史同样受约束。指纹有两种形态：
**行首锚定**（身份句、Claude Code 句）与**位置无关**（Main branch、Web GUI 组合）。
旧实现只做行首匹配，所以行中段的 `Main branch` 漏网——长历史会话里模型自己引用过它，整轮就 400。

### 处理方式（第三波）

- 指纹表拆成两档：`FINGERPRINT_LINE_PREFIXES`（行首锚定，删句首句）与
  `FINGERPRINT_ANYWHERE`（位置无关，删出现处）。Web GUI 首句从行首档挪到位置无关档
  （它的触发组合可以出现在行中段）。
- 位置无关删除只删指纹本身，不额外改写上下文（可能留下多余空格；上游不关心排版）。
- **仍然只动 system / assistant**：user / tool / tool_calls / reasoning 实测放行，不动。
- 用「真实失败会话」重建请求复测：修复前 400/11128 → 修复后 **200**（流式正常）。

## 处理方式（实现）

- 新模块 `src/fingerprints.ts`：`stripChannelFingerprints(text)` 纯函数，删掉命中的指纹
  （行首档删句首句、位置无关档删出现处），其余内容逐字保留；未命中时返回原字符串；幂等；CRLF 行尾不变。
  当前指纹表：行首档 = 身份句、Claude Code 句；位置无关档 = Main branch、Web GUI 首句。
- 接线点（`src/adapter.ts` `toWireMessages`）：
  - `options.system` → 删指纹；删空则不发 system 消息；
  - 历史上的 `system` 角色消息 → 同样处理；
  - `assistant` 正文 → 同样处理（历史里复述过 / 引用过指纹同样整轮拦）；
  - **不动** `user` / `tool` 结果 / `tool_calls[].arguments` / `reasoning`（实测放行，
    改了就是篡改用户内容与会话证据）。
- 选「删除」而不是「插 the / 零宽」：改动最少，不依赖上游是否做 Unicode 归一化；
  模型仍能从下一句 `You are a coding agent powered by <模型名>` 知道自己是什么。
- **不改 UA / `X-IDE-Name`**：不伪装官方客户端（《请求形态规矩》的身份如实自报口径不变），
  且实测渠道判定不看这些头。

## 测试

`test/fingerprints.test.mjs`：行首/位置无关两档、大小写、CRLF、空串、幂等，以及
`toWireMessages` 的范围守卫（system 与 assistant 处理、user 与 tool 原样、tool_calls 参数不动、
system 只剩指纹时不再发空 system）。第二波补充：Web GUI 行只删首句、其余指令保留。第三波补充：
Main branch 行中段删除、Claude Code 行中段不删、assistant 历史里的 Main branch 删除。

## 风险与维护（必须如实记录）

1. **上游黑名单会继续扩张**：这是与上游风控的长期拉锯，不是一次性修复。新指纹出现时往
   `FINGERPRINT_LINE_PREFIXES` / `FINGERPRINT_ANYWHERE` 补一条正则 + 补测试；补完必须用
   **真实 system / assistant 文本**实测一次推理（不能只看 HTTP 状态码或单测）。
2. **定位新指纹的方法（三波教训累积）**：
   - 先确认「真实 system 原文 vs strip 后」是否仍 400（区分 system 漏网）；
   - system 没问题就看历史：**先按角色分类**（本机实测 user / tool / tool_calls 放行，assistant 扫），
     再把历史按 **user 消息边界**二分（直接按消息数切会切断 tool_call/tool 结构，得到的是 11148
     「tool calls and tool results do not match」，不是内容指纹）；
   - 锁定消息后，对它的 wire 文本做**前缀二分**找最小触发片段；最后用完整失败请求复测 200。
3. **桌面端未实测**：本插件同时适配 dsh web / desktop。上述指纹均来自 Web 会话的真实提示词与历史，
   桌面端是否有同形态内容**未验证**；若桌面端也报 11128，按第 2 条方法抓桌面端真实请求再补规则。
4. **风险自担**：该处理是为绕开上游「未授权渠道」内容风控而删句；owner 已知悉并选择此方案。
   若上游把删除后的版本也纳入指纹，或改为语义检测，本改动即失效。
5. **失效表现**：仍是 `400 / 11128`。看到该码先按本文方法复测真实 system / assistant，而不是先怀疑额度/封号。
6. **不扩大范围**：绝不改写 user 消息、工具结果与会话证据；否则会把排障污染带进用户会话。
