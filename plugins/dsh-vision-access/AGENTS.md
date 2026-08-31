# 项目指令 — dsh-vision-access（dsh-sparrow 合集成员）

合集级通用规则见根目录 AGENTS.md；本文件只记本插件专属约束与 seam 特例。

## 项目概况

DSH Web 插件：纯文本主模型会话的图片视觉通道 —— 主模型调用 `vision_read` 工具，host 直连官方视觉模型（默认 deepseek-v4-flash-vision-exp）读图并回传结构化文字报告，主模型保持对话大脑。host + 轻量 client half（模型选择器旁的眼睛图标，按模型能力三态——原生视觉灰显 / DeepSeek 文本点亮 / 其它无视觉带斜线，点击弹对应说明；无持久状态）。

* 2026-08-30 起不再走子代理：实测 subagents 单次读图 46.3s，直连 `ctx.llm` 2.2s。
* 工具按 agent 条件隐藏：主模型非 DeepSeek 系列、或主模型本身原生看图时，该 agent 看不到 `vision_read`（像没有这个工具）。
* 报告按「attachmentId + question」进程内 LRU 缓存（`visionCacheKey` 含 question，防止同图不同问题命中陈旧报告）；只有思考无正文时抛明确错误，不把思考当报告（maxTokens 8192 + `visionReasoningEffort: low`）。

* TypeScript 实现；host half 源码在 src/，client half 只有状态图标（client bundle 不入库，.gitignore）
* 本地验证 = npm run verify（typecheck + client bundle + node:test）
* 测试：Node 内置 test runner，用例在 test/*.test.mjs

***

## 架构约束

* host half 不 import 浏览器 API；不写任何文件、不改 `.dsh` 内部结构（零残留）
* API 凭据：视觉模型调用走 `ctx.llm` 正路 seam，插件自己不经手 key
* 一切副作用在 apply 内注册并配 ctx.effect 清理（包装恢复 / 工具注销 / agent 限制解除）

***

## seam 特例（需项目 owner 认可，已定案）

* **门禁放行（可逆包装 `ctx.llm.resolveModelInfo`）**：仅对配置的文本路由抹除「显式不含 image」的 `inputModalities`（放行贴图门禁），保持原签名与 `this` 语义，卸载时恢复原函数；记录所适配 dsh 版本（≥ 0.1.1-rc.2）。
* **按 agent 隐藏工具**：`agent/request` 拦截后，主模型非 deepseek-official 或原生视觉模型时用 `agent.ctx.tools.restrict({ deny: ['vision_read'] })` 对该 agent 屏蔽（Map 记 disposer，转回可解除）；工具执行时再做一次防御二次检查（会话事件里最近 request/header 解析主模型 + `resolveModelInfo` 能力判断）。
* **附件反查**：只从会话事件里归一化 + 唯一前缀匹配图片引用（占位符截断哈希可直接传），图片字节经官方 `ctx.attachments.readImage` 校验；不读内部文件路径。
* **仍禁止**：monkey-patch 核心、直读附件存储、向第三方发送图片。

## 关键文件速查

    src/host.ts   — host half 入口（resolveModelInfo 包装 + agent/request 屏蔽 + vision_read 工具 + 状态路由）
    src/vision.ts — 纯逻辑（缓存键 / 报告解析 / JSON 提取 / 附件引用匹配 / 能力判断）
    src/index.ts  — 入口契约 re-export
    src/client/index.ts — client half 入口（locale + conversation.input.right 图标槽位）
    src/client/VisionStatusIcon.tsx — 眼睛图标 + 说明弹窗（三态：原生视觉灰显 / DeepSeek 文本点亮 / 其它无视觉带斜线；点击按状态弹对应文案）
    test/vision.test.mjs — 纯逻辑单测

***

## 测试

* 测试文件命名：<模块名>.test.mjs，与被测模块同名
* 结构遵循 AAA 原则（Arrange / Act / Assert），describe → it 两层
* it 描述格式：「输入条件 应该 期望结果」（中文）
* 纯逻辑必须可单测：缓存键、报告解析、JSON 提取、附件引用匹配、能力判断、输出解析（reasoning-only 抛错）等抽成纯函数并导出
