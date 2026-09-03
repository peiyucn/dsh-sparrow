# 03 · 自动看图（auto-vision）— dsh-vision-bridge

> 状态：草案，待 owner 评审。
> seam 结论均来自本机 dsh checkout（0.1.2-rc.1，a66e4702）源码查证。

## 目标（一句话）

**贴图后主模型稳定拿到图片内容——不依赖模型自觉调用工具。**

## 背景

2026-09-03 实录：贴图后主模型声称「看不到图」、未调用 `vision_read`，经用户提醒才纠正。
平台把图片替换成被动占位文本（不含任何行动指令），「看图」全靠模型自觉——不稳定。

## 已查证的契约事实（动工前不用再查）

| 事实 | 证据 |
|---|---|
| `agent/request` **不能改消息**（官方："this waterfall cannot mutate messages"） | packages/extensions/tool-cordis/src/api-catalog.ts:2952 |
| 占位文本生成于请求准备层（`textOnlyImageText`），插件不可达 | packages/llm/llm/src/content.ts:73-76、203 |
| **正路**：`system-prompt/assemble` 瀑布——官方给模型可见内容的扩展渠道 | packages/extensions/tool-cordis/src/api-catalog.ts:3270-3274 |
| `ctx.systemPrompt` 服务可注册有序 prompt 段落 | api-catalog:2311 |
| 官方多图准备即并行（`Promise.all` over `readImageRequest`），全部图进同一次推理请求（默认上限 600 张/请求） | packages/llm/llm-deepseek/src/adapter.ts:219-228、request-pricing.ts:22 |

## 边界（硬约束）

**对现有功能零改动**：`resolveModelInfo` 门禁包装、`vision_read` 工具（定义/执行/按 agent 屏蔽）、
报告缓存、状态路由（/vision/status）全部保持原样。本特性只在 `system-prompt/assemble` 里**新增**
一段注入；任何失败路径静默跳过，绝不阻塞请求。

## 方案

在 `system-prompt/assemble` 瀑布里：**主模型是 deepseek 文本路由 && 会话里有新图** → 复用现有
`vision_read` 读图链（`readImage` → 直连 vision 模型 ≈2.2s → 结构化报告）→ 报告作为 prompt
段落注入本次组装。模型无需调用任何工具，报告已在上下文里。

* 门控（与工具屏蔽同门）：非 deepseek 主模型不注入；**原生视觉主模型不注入**（图片直达主模型，
  本来就能看，注入反而有损）；未识别路由不注入；
* 新图判定：会话事件里的 image block，attachmentId 不在缓存中的才读图；报告按 attachmentId 缓存，
  重复贴图零成本；
* 预算：**本条消息的新图全部并行读取**（读图是独立调用，并行后延迟 ≈ 单张），单次组装总超时 15s；
  超时/失败的单张跳过并在注入段落注明「有 N 张图未读到」，下一轮组装自动补（缓存只记成功项）；
  `vision_read` 手动档仍在，可对任意单张重试并拿明确错误；
* **恒开、不加配置开关**（评审决定：关掉后模型仍会经工具看图，开关无用户可感知意义，徒增配置面）；
* `vision_read` 工具保留：自动档给基线，模型对特定图有追问时仍可调用（注入段落里带 attachmentId）。

## 验收

* 文本主模型会话贴图 → 下一轮请求自动带报告，模型不调工具即可复述图片内容；
* 原生视觉主模型 / 非 deepseek 主模型 → 不注入；
* 重复贴同一图 → 第二次零读图成本；
* 读图失败 → 请求不被阻塞；
* 单测：门控判定、新图判定、注入段落渲染；verify 全绿。
