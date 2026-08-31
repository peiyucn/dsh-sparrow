# 04 · 触发灵敏度三档（模型固定 flash）

> 决策记录（2026-08-30 晚，用户拍板）：模型三档切换退役——续写场景 flash 足够（快且省，输出单价为 pro 的 1/3），改由「触发灵敏度」三档承载个性化。用户习惯不同：有人要更敏锐、有人要更钝化，自己调。

## 模型固定

* 客户端请求固定 `fimModelMode: 'flash'` → host `resolveFimModel` 恒解析为 `deepseek-v4-flash`；
* host 侧 `pro/auto` 分支保留（兼容直接 API 调用方），客户端不再提供模型选择 UI；
* 建议菜单右下角仍展示实际模型与温度（现在恒为 flash）。

## 灵敏度三档（高 / 中 / 低）

* 纯逻辑在 `chat-fim.ts`：`FIM_SENSITIVITIES`（参数表）+ `normalizeFimSensitivity`（非法回退 standard）+ `shouldTriggerFim(draft, sensitivity)`；
* 三档规则（写进 README 明示，用户可见）：

| 档位 | 停顿 | 最短草稿 | 夹入英文半词 | 词后空格 | 句末标点 |
|---|---|---|---|---|---|
| eager（高） | 250ms | CJK 4 / Latin 2 | 放行 | 放行 | 放行 |
| standard（中，默认） | 400ms | CJK 8 / Latin 3 | 放行 | 放行 | 抑制 |
| conservative（低） | 800ms | CJK 12 / Latin 5 | 抑制 | 抑制 | 抑制 |

* 不随灵敏度变化的部分：IME 组合态一律不触发；Tab 采纳导致的草稿变化不触发；非 DeepSeek 主模型整体隐藏。

## UI

* 开关胶囊（`conversation.input.left`）内置：**小方块指示**（高/中/低 = 3/2/1 个 4px 方块，currentColor）+ **▾ 弹层**选档（选项行 = 档位名 + 规则摘要，官方 MenuDropdown 同款 token，点外部/Esc 关闭、滚动跟随重定位）；
* **按钮 tooltip 随档位变化**（`sensitivity.hint`：联想敏锐度：{高/中/低}）；
* 选择持久化在 localStorage `dsh-chat-fim:sensitivity`（非法回退 standard）；旧 `dsh-chat-fim:modelMode` 键不再读写（无害残留）。

## 验收标准

* [ ] 三档切换立即影响停顿时长与形态门控（纯函数有单测：eager 4 字触发/半词/句末放行、conservative 空格抑制与 12 字门槛）；
* [ ] 按钮内 3/2/1 方块随档位变化，tooltip 文案随档位变化；请求模型恒为 flash；
* [ ] 旧行为不回归：中/低档句末标点不触发、IME 抑制、非 deepseek 主模型隐藏、@ 触发菜单互斥、温度 0.3；
* [ ] `npm run verify` 全绿。
