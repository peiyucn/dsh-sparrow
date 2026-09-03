# 02 — 反馈轮修复：配置页对齐、视觉误判、额度卡美化、系数置右

> 状态：已实现（2026-09）。承接 spec 01 的 owner 九点反馈。

## 反馈与处置

1. **配置页与 DeepSeek 官方区别很大** → 配置卡重做为官方
   ui-settings-models ProviderEditor 的 deepseek 布局同款：标题行（显示名 +
   路由 id）→「API Key」标签 + 密码输入（placeholder 随配置状态切换）→
   账号一行 → 取消/应用 footer；视觉 token 与官方同源（`--dsw-alias-*`）。
   移除自己的保存/移除胶囊按钮（行头的官方 编辑/移除 按钮保留）。
   已知限制：本插件的 settings 命名空间不在官方 editor 的 deepseek/pi-ai
   白名单里（官方按 adapter 家族硬编码），点行头「编辑」只会看到官方
   advancedHint 占位——Key 的输入以本卡为准，官方 editor 无法为本插件
   生成字段。账号类型（企业/个人）只在配置页。
2. **所有模型都有视觉能力** → 待真实载荷复核：本地实现为
   `supportsImages === true` 才标视觉。若服务端对全部模型都返回 true
   （平台级图像能力，而非模型原生视觉），需换判定字段（见「待确认」）。
3. **logo 换成带字样的长方形** → 换 lobehub/lobe-icons 的
   codebuddy-text.svg（viewBox 58×24，fill=currentColor，随主题着色）。
4. **额度 UI 太粗糙** → 面板加进度条（已用/额度占比 + 百分比），
   已用/剩余分行展示，token 走官方 theme 别名。
5. **主题跟随 DSH 深浅色** → 全部颜色改用官方 `--dsw-alias-*` /
   `--dsw-elevation-*` token（官方 CSS 注释明示：未定义的
   `--dsw-text-*` 等裸名会永远停在浅色字面量——此前正是这个坑）。
6. **列表里不必有小眼睛** → 展示名只保留「名 + 系数」，视觉不进名字；
   能力仍走 inputModalities 声明，卡片继续显示原生视觉行。
7. **effort 信息不对劲** → 档位名映射为可读展示名（Off/Minimal/Low/
   Medium/High/Extra high/Max，未知 id 原样）；defaultEffort 是否应设置
   待真实载荷复核（见「待确认」）。
8. **重置时间不必带时分秒** → 面板把 `YYYY-MM-DD 00:00:00` 折叠为
   日期；非零点整原样展示。
9. **系数没有置右** → 真右对齐：`conversation.input.model` 槽位以
   priority -1 遮蔽官方 ModelSelect（官方注册表语义：同 cell 最低
   priority 渲染；MIT 许可，vendored 组件头部署名）。vendored 选择器
   与官方唯一差异 = 模型行拆成「模型名 | 系数」两列（两空格锚点）。
   能力检查失败（缺 modelDirectories/sessions 服务）即保留官方选择器。
   行为/材质/键盘导航/Toast 锚定全部对齐官方源码。

## 真实载荷复核结论（新探测 Key，2026-09）

* CLI 允许 7 个模型：hy4-preview、hy3、hy3-x、glm-5.3-flash、
  minimax-m3-pay、deepseek-v4-pro、deepseek-v4-flash。
* **视觉**：supportsImages 对 deepseek-v4-pro/flash 也返回 true（服务端
  平台口径），但它们是纯文本（官方 DSH 目录里视觉是单独的
  flash-vision-exp 变体）。修正判定 = supportsImages 且
  （disabledMultimodal === false 或 描述/名字含 多模态/multimodal/vision）：
  结果 glm-5.3-flash/minimax-m3（描述声明原生多模态）与 hy3/hy3-x/hy4
  （disabledMultimodal=false）为视觉，deepseek pro/flash 为纯文本。
* **reasoning 两种实测形态**：可选档位（supportedEfforts 数组 +
  canDisableThinking + defaultEffort，如 glm-5.3-flash/hy4-preview）与
  固定档位（effort 单字符串，如 deepseek-v4-pro=high、
  minimax-m3-pay=medium）。固定档位 → 只声明这一档且不可关，并作为
  defaultEffort；可选档位 → supportedEfforts + off（canDisableThinking
  ≠ false 时）+ defaultEffort。resolveModel 随之声明 defaultEffort。
* **账号**：/v2/accounts 实测 type 为 ultimate（企业）/personal（个人），
  文案映射已修正（enterprise 兼容旧形状）。
* 探测 Key 用完即弃（建议再次轮换）。

## 涉及文件

- `src/catalog.ts`：displayName 去 👁；新增 effortName。
- `src/adapter.ts`：resolveModel 档位名用 effortName。
- `src/client/CodeBuddyCreditsCard.tsx`：DeepSeek 编辑器同款布局。
- `src/client/CodeBuddyCreditsIndicator.tsx`：文字 logo + 进度条 +
  token 主题化 + 重置日期折叠。
- `src/client/CodeBuddyModelSelect.tsx`（新）：vendored 选择器（遮蔽）。
- `src/client/index.ts`：注册遮蔽（priority -1）+ 词典更新。
- `src/client/slot-contract.d.ts`：conversation.input.model 声明 +
  词典键更新。
- `package.json`：devDeps 增 `@deepseek-ai/dsh-client-ui-primitives`。
