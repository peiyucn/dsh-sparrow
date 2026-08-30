# 04 · 续写模型三档可选 + 建议框用量展示

> 决策记录（2026-08-30，用户拍板）：补全模型从「固定 pro」演进到「跟随主模型」后，用户提出让用户自选三档——pro / flash / 自动，并在建议菜单右下角展示本次续写的 token 数与实际使用模型。

## 模型选择

* 三档语义（纯函数 `resolveFimModel(mode, main, configured)`）：
  * `pro` → 恒用 `deepseek-v4-pro`；
  * `flash` → 恒用 `deepseek-v4-flash`（快且省，输出单价为 pro 的 1/3，短续写够用）；
  * `auto`（默认）→ 跟随主模型：官方 pro/flash 用之；vision 或未知主模型回退配置默认 `model`（pro）；
* 选择是**客户端偏好**（localStorage `dsh-chat-fim:modelMode`，非法值回退 auto），随请求以 `fimModelMode` 字段传给 host（`normalizeFimModelMode` 解析）；
* host 响应回传 `{ suggestions, model, temperature, usage: { promptTokens, completionTokens } }`——模型 id 由 host 解析（auto 时客户端不知道实际模型），temperature 为实际采样值，usage 从 FIM 上游 `usage` 字段提取（`extractUsage`，缺失回退 0），跨并行请求求和。

## 建议菜单展示

* **选择器在开关胶囊内**（2026-08-30 用户要求）：胶囊采用官方下拉按钮同款 UI（PermissionSelect trigger——**无边框、透明底、悬停亮底**，省空间），右侧内置 ▾ 箭头（点击只开菜单、不切换开关，stopPropagation；**打开时箭头旋转 180°**）；弹层锚定胶囊右下，下方空间不足时自动向上弹出（估算高度 112px + 8px 边距判定），点外部 / Esc 关闭，**滚动与缩放时跟随重定位**（官方下拉行为，不关闭——2026-08-30 修复：生成中的会话流式输出带动聊天区滚动，旧逻辑「滚动即关闭」会误关弹层）；
* **选项写全名不做翻译**（2026-08-30 用户要求）：`auto` / `deepseek-v4-flash` / `deepseek-v4-pro`，选中项打勾，写 localStorage 并作用于下一次请求；
* 菜单卡底部右下角展示「{tokens} tok · {model} · T{temperature}」（tokens = prompt + completion，千分位；温度暴露隐藏的采样信息，2026-08-30 用户要求）；
* 文案 zh/en 随 dsh 语言；选择器与用量行沿用菜单的 caption 字号。

## 验收标准

* [ ] 三档切换立即影响下一次请求使用的模型；auto 跟随主模型（pro/flash）、vision 回退 pro；
* [ ] 菜单右下角显示 token 数与实际模型名；切换选项后选择器状态同步；
* [ ] 旧行为不回归：非 deepseek 主模型整体隐藏、温度 0.3、形态门控、@ 触发菜单互斥均不变；
* [ ] `npm run verify` 全绿（新增纯函数全部有单测）。
