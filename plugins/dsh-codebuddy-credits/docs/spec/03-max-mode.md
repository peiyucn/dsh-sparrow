# 03 · Max 模式（推理档位锁）

> 状态：待评审。前置：00-overview（架构）、01-ui-redesign（额度卡/选择器）。

## 背景与实测依据（2026-09-07）

CodeBuddy 客户端把「Max 模式」做成模型列表顶部的全局开关，而不是各模型的
档位。扒接口与实测结论：

- `/v3/config` 中只有 `glm-5.3-flash` 在 `reasoning.supportedEfforts` 声明
  `"max"`；其余 reasoning 模型均为固定档位形态（`effort:"high"/"medium"`），
  目录里无 max；config 无全局 maxMode 字段
- **服务端宽容接受未声明的 max**：`deepseek-v4-flash`（声明 high）发
  `reasoning_effort:"max"` → 200 正常流式，prompt_tokens 89→102（思考预算
  变化证实参数真实生效）；`hy4-preview`（canDisableThinking:false +
  supportedEfforts:["high"]）发 max → 200，reasoning_tokens=64 打满
  max_tokens 上限（max 档思考预算显著大于 high），credit=0
- 结论：Max 是**请求侧覆盖参数**，不是模型声明档位。客户端形态 = 全局
  开关，打开后对能挂的模型一律发 max

## 语义定义：档位锁

Max 模式**不是新增档位**，是对整个推理档位面板的锁定态：

- 目录保持诚实：不改 `declaredEfforts` 的映射，不给模型编造 max 档
- 锁是请求层 + UI 层的覆盖：锁定期所有 reasoning 模型请求强制发
  `reasoning_effort:"max"`；选择器档位面板呈现锁定态
- **用户的逐模型档位偏好保留不覆盖**：锁只是暂时忽略，解锁后原样恢复
  （不出现「锁一次 max 把所有档位记忆洗成 max」）

## 状态机

```
maxMode = off（默认）
  → 一切照旧：每模型按其声明档位 + 用户记忆的档位偏好发请求

maxMode = on
  → 请求层：所有 supportsReasoning 模型强制 reasoning_effort="max"
    （无白名单、无豁免——hy4-preview 实测接受 max，见上）
  → 非 reasoning 模型：天然不受影响（本来就不发该参数）
  → 选择器档位面板：Max 置顶高亮为当前生效档，其余档位（含 Off）全部
    置灰不可选；面板内提示「已被 Max 模式锁定，在额度卡关闭后可调」
  → 逐模型档位记忆：忽略但不清除
```

## UI 落点

- **开关位置**：额度卡**面板内**、模型卡上方，先一条分割线，再一行
  「Max 模式」标签 + 档位开关（switch）；会话头部胶囊本身不放开关
- **状态持久化**：设置节 `llm-codebuddy-credits.maxMode: boolean`
  （默认 false）；host（adapter 请求构造）与 client（选择器面板、额度卡
  面板）同源读取
- **头部联动**：maxMode 开时，头部额度卡的当前模型行可附加 `Max` 小标记
  （可选增强，非首版必需——首版只保证面板与选择器两处的锁定呈现一致）

## 实现改动点（定位级）

1. `src/config.ts`：设置节 schema 加 `maxMode`（boolean，默认 false）
2. `src/adapter.ts`：请求构造处——`maxMode` 开且模型 reasoning 时，
   `reasoning_effort` 强制 `"max"`（覆盖 options.reasoningEffort）；
   模型事实需要推理能力位（facts 里已有 `reasoning` 字段）
3. `src/catalog.ts`：不改 declaredEfforts 映射；effortName 已有 'max' →
   'Max'（选择器锁定态展示复用）
4. client 选择器档位面板：读 maxMode → 锁定态渲染（Max 置顶、其余置灰、
   锁定提示文案）；锁定期间不写入逐模型档位记忆
5. 额度卡面板：分割线 + 「Max 模式」开关行（中英文案）
6. 单测：adapter 请求构造的锁定覆盖逻辑（maxMode × reasoning 矩阵）；
   设置节 schema 默认值

## 不做

- 不做白名单/豁免清单（服务端宽容已实测，hy4-preview 接受 max）
- 不给非 reasoning 模型任何处理
- 不改模型目录的档位声明（max 不进 supportedEfforts）
- 不在头部胶囊上放开关（开关只活在额度卡面板里）
- 不清除/迁移用户的逐模型档位记忆

## 验收

- 开 maxMode → 各 reasoning 模型（v4-flash / glm-5.3-flash / hy4-preview）
  请求体均为 `reasoning_effort:"max"`；选择器档位面板锁定呈现；关后恢复
  各自原档位偏好
- 非 reasoning 模型（hunyuan-chat）请求体无 reasoning_effort
- `npm run verify` 全绿
