# 02 — UI 契约：配置页对齐、视觉判定、额度卡、系数置右

> 基线：00-overview.md 的宪法——官方 Key、无 Key 零网络、模型列表由 Key 驱动、
> 请求形状对齐官方 CLI。

## 配置卡形态（避免双卡）

行头「编辑」会展开官方编辑器，对本插件命名空间官方只能渲染占位提示——与本卡
同时出现即形成双卡，故 Key 已配置时本卡折叠成一行状态（账号信息 + 「更换 Key」
按钮），点按钮才展开输入区；未配置时直接显示输入区。账号信息缺失（启动补拉失败
/ 网络抖动）时状态接口补拉 /v2/accounts；卡片无数据时不渲染「— · —」占位。

## 界面契约

1. **配置卡布局**：与官方 ui-settings-models ProviderEditor 的 deepseek 布局同款——
   标题行（显示名 + 路由 id）→「API Key」标签 + 密码输入（placeholder 随配置状态
   切换）→ 账号一行 → 取消/应用 footer；视觉 token 与官方同源（`--dsw-alias-*`）。
   本卡不设自有保存/移除胶囊按钮（行头的官方 编辑/移除 按钮保留）。
   账号类型（企业/个人）只在配置页。
2. **视觉标记判定**：`supportsImages === true` 才标视觉。
3. **logo**：lobehub/lobe-icons 的 codebuddy-text.svg（viewBox 58×24，fill=currentColor，
   随主题着色）。
4. **额度面板**：加进度条（已用/额度占比 + 百分比）；已用/剩余分行展示；
   token 走官方 theme 别名。
5. **主题跟随 DSH 深浅色**：全部颜色用官方 `--dsw-alias-*` / `--dsw-elevation-*`
   token——未定义的 `--dsw-text-*` 等裸名会永远停在浅色字面量，故必须走别名。
6. **模型行展示名**：只保留「名 + 系数」，视觉不进名字；能力仍走 inputModalities
   声明，卡片继续显示原生视觉行。
7. **effort 展示**：档位名映射为可读展示名（Off/Minimal/Low/Medium/High/Extra high/
   Max，未知 id 原样）；defaultEffort 的声明形状见「服务端载荷事实」。
8. **重置时间展示**：面板把 `YYYY-MM-DD 00:00:00` 折叠为日期；非零点整原样展示。
9. **系数置右（真右对齐）**：`conversation.input.model` 槽位以 priority -1 遮蔽官方
   ModelSelect（官方注册表语义：同 cell 最低 priority 渲染；MIT 许可，vendored 组件
   头部署名）。vendored 选择器与官方唯一差异 = 模型行拆成「模型名 | 系数」两列
   （两空格锚点）。能力检查失败（缺 modelDirectories/sessions 服务）即保留官方
   选择器。行为/材质/键盘导航/Toast 锚定全部对齐官方源码。

## 服务端载荷事实

* CLI 允许 7 个模型：hy4-preview、hy3、hy3-x、glm-5.3-flash、
  minimax-m3-pay、deepseek-v4-pro、deepseek-v4-flash。
* **视觉**：`supportsImages` 就是权威声明——CodeBuddy app
  里 deepseek-v4-pro/flash 明确支持图片输入。官方 DSH 目录里的文本/视觉拆分
  （视觉是独立 flash-vision-exp 变体）不适用于 CodeBuddy 自己托管的模型。
  实测 `disabledMultimodal` 只是冗余标注（true 只在 supportsImages=false 上、
  false 只在 true 上），故直接以 supportsImages 为准。
* **reasoning 两种形态**：可选档位（supportedEfforts 数组 +
  canDisableThinking + defaultEffort，如 glm-5.3-flash/hy4-preview）与
  固定档位（effort 单字符串，如 deepseek-v4-pro=high、
  minimax-m3-pay=medium）。固定档位 → 只声明这一档且不可关，并作为
  defaultEffort；可选档位 → supportedEfforts + off（canDisableThinking
  ≠ false 时）+ defaultEffort。resolveModel 随之声明 defaultEffort。
* **账号**：/v2/accounts 实测 type 为 ultimate（企业）/personal（个人）；
  enterprise 为兼容的旧形状。

## 已知限制与取舍

* 视觉判定以服务端 `supportsImages` 为准；若服务端对全部模型都返回 true
  （平台级图像能力，而非模型原生视觉），需要另找判定字段——当前没有更细的
  可信字段。
* 本插件的 settings 命名空间不在官方 editor 的 deepseek/pi-ai 白名单里
  （官方按 adapter 家族硬编码），点行头「编辑」只会看到官方 advancedHint
  占位——Key 的输入以本卡为准，官方 editor 无法为本插件生成字段。
* 遮蔽官方 ModelSelect 依赖 modelDirectories / sessions 服务，缺服务即回退
  官方选择器。
* 探测 Key：用完即弃并轮换。

## 涉及文件

- `src/catalog.ts`：displayName 不含 👁 视觉标记；`effortName`。
- `src/adapter.ts`：resolveModel 档位名用 `effortName`。
- `src/client/CodeBuddyCreditsCard.tsx`：DeepSeek 编辑器同款布局。
- `src/client/CodeBuddyCreditsIndicator.tsx`：文字 logo + 进度条 +
  token 主题化 + 重置日期折叠。
- `src/client/CodeBuddyModelSelect.tsx`：vendored 选择器（遮蔽官方 ModelSelect）。
- `src/client/index.ts`：注册遮蔽（priority -1）+ 词典更新。
- `src/client/slot-contract.d.ts`：`conversation.input.model` 声明 +
  词典键。
- `package.json`：devDeps 含 `@deepseek-ai/dsh-client-ui-primitives`。
