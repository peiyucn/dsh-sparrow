# 04 · 触发灵敏度三档（模型跟随主模型）

> 决策记录（2026-08-30 晚，用户拍板）：模型三档切换退役——续写场景 flash 足够（快且省，输出单价为 pro 的 1/3），改由「触发灵敏度」三档承载个性化。用户习惯不同：有人要更敏锐、有人要更钝化，自己调。
> 2026-08-31 用户先拍板暂切 pro 实测对比，同日再拍板**模型跟随主模型**：用户选什么模型，suggest 就用什么模型——符合用户预期。

## 模型跟随主模型

* 客户端请求 `suggestModelMode: 'auto'` → host `resolveSuggestModel` 按会话事件现读主路由：主模型为 deepseek-official 的 v4-pro/v4-flash 时跟随；vision-exp / 未知 / 非官方回退配置默认 `model`（deepseek-v4-pro）；
* 切换主模型后下一次联想请求立即生效（每次请求现读，无缓存）；客户端不提供模型选择 UI；
* 建议菜单右下角仍展示实际模型与温度（跟随结果实时可见）。

## 灵敏度三档（高 / 中 / 低）

* 纯逻辑在 `suggest.ts`：`TRIGGER_SENSITIVITIES`（参数表）+ `normalizeTriggerSensitivity`（非法回退 standard）+ `shouldTriggerSuggest(draft, sensitivity)`；
* 三档规则（写进 README 明示，用户可见）：

| 档位 | 停顿 | 最短草稿 | 夹入英文半词 | 词后空格 | 句末标点 |
|---|---|---|---|---|---|
| eager（高） | 250ms | CJK 4 / Latin 2 | 放行 | 放行 | 放行 |
| standard（中，默认） | 400ms | CJK 8 / Latin 6 | 抑制 | 放行 | 抑制 |
| conservative（低） | 800ms | CJK 12 / Latin 8 | 抑制 | 抑制 | 抑制 |

* 不随灵敏度变化的部分：IME 组合态一律不触发；非 DeepSeek 主模型整体隐藏。（Tab 采纳后的草稿变化**会**重新触发——链式续写，2026-08-31 变更：采纳文本以句末标点结尾时中/低档仍由门控抑制，高档可一直 Tab。）

## UI

* 开关胶囊（`conversation.input.left`）内置：右侧为**灵敏度触发区**（与开关主体邻接，无分割线：**竖排三点指示** + ▾，恒显 3 个 3px 方点、自下而上点亮 3/2/1 个 = 高/中/低，点亮用 currentColor、未点亮用 30% 透明度混色淡色占位）；**点击整区只开合选档弹层、不切换开关**（区域整高且经负 margin 铺满按钮右缘——按钮右侧 padding 与标签左侧 gap 都计入命中区，右缘缝隙点击不再落回开关；Enter/Space 键盘可触发；不做单独悬停底色，避免与按钮主体悬停底色叠加成嵌套椭圆）；**▾ 弹层**选档（选项行 = 档位名 + 规则摘要，官方 MenuDropdown 同款 token，点外部/Esc 关闭、滚动跟随重定位）；
* **按钮 tooltip 随档位变化**（`sensitivity.hint`：联想敏锐度：{高/中/低}）；
* 选择持久化在 localStorage `dsh-chat-fim:sensitivity`（非法回退 standard）；旧 `dsh-chat-fim:modelMode` 键不再读写（无害残留）。

## 验收标准

* [ ] 三档切换立即影响停顿时长与形态门控（纯函数有单测：eager 4 字触发/半词/句末放行、conservative 空格抑制与 12 字门槛）；
* [ ] 按钮内竖排三点随档位点亮 3/2/1 个（恒显 3 点），tooltip 文案随档位变化；请求模型恒为 flash；
* [ ] 旧行为不回归：中/低档句末标点不触发、IME 抑制、非 deepseek 主模型隐藏、@ 触发菜单互斥、温度 0.3；
* [ ] `npm run verify` 全绿。
