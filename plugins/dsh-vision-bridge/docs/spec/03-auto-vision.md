# 03 · 自动看图（auto-vision）— dsh-vision-bridge

> 状态：草案，待 owner 评审。
> seam 结论均来自本机 dsh checkout（0.1.2-rc.1，a66e4702）源码查证，file:line 见各表。

## 背景与动机

现状：贴图后，主模型上下文里的图片被平台替换为被动占位文本
`[image omitted because this model accepts text only; attachment sha256:…]`（llm core 生成，
不含任何行动指令）；「看图」完全依赖主模型自觉调用 `vision_read` 工具。

**2026-09-03 实录失败**：主模型在贴图后直接声称「看不到图」、未调用工具，经用户一句提醒才纠正。
依赖模型自觉 = 不稳定。本 spec 把「看图」从模型行为升级为管道保证：请求组装时自动读图、
自动把报告注入系统提示，模型无需调用任何东西。

## 已查证的契约事实（动工前不用再查）

| 事实 | 证据 |
|---|---|
| `agent/request` waterfall **不能改消息**——官方原话 "Model-visible content must use logged channels; this waterfall cannot mutate messages." | packages/extensions/tool-cordis/src/api-catalog.ts:2952 |
| 占位文本生成于请求准备层（`textOnlyImageText`），插件不可达 | packages/llm/llm/src/content.ts:73-76、203 |
| **正路**：`system-prompt/assemble` waterfall——官方给模型可见内容的扩展渠道（"Expert waterfall over the assembled sections, contexts, tools, and variables"） | packages/extensions/tool-cordis/src/api-catalog.ts:3270-3274 |
| `ctx.systemPrompt` 服务：可在调用上下文作用域注册有序 prompt 段落 | api-catalog:2311 |
| `system-prompt/change` 事件 | api-catalog:3278 |

## 设计

### 管线（三段式不变，新增「自动档」）

```
贴图 → [1 放行]（不变）
     → [2a 自动] system-prompt/assemble 瀑布：主模型为 deepseek 文本路由且会话有新图
           → 复用 vision_read 读图链（readImage → prepareCall → 流 → 结构化报告，attachmentId 缓存）
           → 报告作为 prompt section 注入本次组装
     → [2b 手动] vision_read 工具（保留：追问、自定义 question、缓存未命中的补刀）
     → [3 回传]（不变）
```

### 触发与门控（与工具屏蔽同门）

* 仅在 `system-prompt/assemble` 瀑布里注入；注入内容 = 纯文本段落，明确标注来源：
  `[vision_read 自动描述] 会话中的图片内容如下（attachmentId=sha256:…）` + `renderVisionReport(report)`；
* 门控（与 `vision_read` 工具一致）：
  - 主模型路由非 deepseek-official → **不注入**（图片描述不流向第三方 provider）；
  - 主模型原生视觉（`inputModalities` 含 image）→ **不注入**（图片直达主模型，转文字有损）；
* 新图判定：遍历 agent 会话事件里的 image block，attachmentId 不在缓存中的才读图；
  报告按 attachmentId 缓存（复用 `VisionCache`）→ 第二次起零读图成本；
* 预算：单次组装最多 N 张新图（默认 3）、总超时预算（默认 15s）；vision 调用失败**静默跳过**——
  不阻塞请求，模型仍可走 `vision_read` 手动档拿到明确错误；
* 配置开关 `autoDescribe`（默认 true），cordis.patch.yml 可关。

### 与手动档的关系

* `vision_read` 工具保留——自动档给基线描述；模型对特定图有追问时仍用工具（自定义 question）；
* 注入段落里带 attachmentId，模型可据此调用工具追问。

## 原生视觉主模型的一致性（deepseek-v4-flash-vision-exp）

DS 系列模型现状（rc.1 catalog 查证）：**原生视觉主模型只有 `deepseek-v4-flash-vision-exp`**
（`inputModalities: ['text','image']` + 图像预算；packages/llm/llm-deepseek/src/index.ts:106-112），
`deepseek-v4-flash` / `deepseek-v4-pro` 均为纯文本。视觉读取器默认模型恰是同一款
vision-exp（src/vision.ts:7）——报告口径与「视觉主模型」的感知能力同源。

贴图后的两条路径体验矩阵：

| 环节 | 文本主模型（v4-flash / v4-pro） | 原生视觉主模型（v4-flash-vision-exp） |
|---|---|---|
| 图片入口 | 平台占位文本 → 自动档注入结构化报告（M3）/ 工具手动档 | 图片字节直达主模型（平台不占位） |
| 工具 | vision_read 可见 | 隐藏（2026-08-30 决策：像素直达 > 转文字报告，转文字有损） |
| 信息形态 | 结构化报告（summary / OCR / tables / layout） | 主模型自己的像素理解（自由文本） |

一致性决策（M3 随行）：

1. **「贴图即自动获得内容」两条路径对齐**：文本主模型 → 注入报告；视觉主模型 → 图片直达
   （自动档不注入，避免有损转文字）。形式差异（像素 vs 结构化报告）是模型能力固有差异，保持；
2. **工具可见性维持 2026-08-30 决策**：视觉主模型隐藏 vision_read。可选增强（评审定、v1 不做）：
   视觉主模型也保留工具、作为表格/OCR 精确提取通道（默认仍隐藏，配置可开）；
3. **报告可见性**：自动档注入的报告默认只在系统提示里、用户不可见——与手动档（报告块可见）不一致。
   建议：v1 最小实现 = 仅注入（可见性并入 M2「报告面板可见」），或 v1 顺带输出一行可见提示（评审定）；
4. **待实测**：主模型为 vision-exp 时图片走官方图像预算/offload 链路，插件零介入——
   确认门禁包装不影响视觉路由（`shouldClearInputModalities` 对含 image 的路由返回 false，已覆盖）。

## 风险与待实测项（开工时验证）

1. `system-prompt/assemble` 的触发频率与组装缓存语义（每请求重建 vs 缓存）——决定注入成本；
   实测瀑布里异步 vision 调用（≈2.2s/图）对首请求延迟的实际影响；
2. `AssembleContext` 里拿 agent / 主模型 / 会话事件的途径（开工查证，能力检查失败即跳过注入）；
3. 与 profile 其他 prompt section 的顺序与去重（同图不重复注入）；
4. 子代理会话是否注入——v1 暂定「同门控、只注入其自身会话中的图」，实测后定；
5. 幻觉防护：报告明确标注来源，避免模型把描述当用户原文转述。

## 验收

* 文本主模型会话贴图 → 下一轮请求上下文自动带报告，模型不调工具即可复述图片内容；
* 原生视觉主模型 / 非 deepseek 主模型会话 → 不注入；
* 重复贴同一图 → 第二次零读图成本（缓存命中）；
* 视觉调用失败 → 请求不被阻塞，手动档仍可报错；
* 单测：门控判定、新图判定、注入段落渲染；verify 全绿。
