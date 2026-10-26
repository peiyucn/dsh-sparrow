# 00 · 架构总览 — dsh-theme-tone

> 2026-10-27 重写。旧 spec（00–13，约 1.3 万行）已全部删除：它们记录的是被删掉的机制（相位测量、锚点扫描、
> 抬升面光层、扫光带、遮罩恢复……），继续保留只会误导。本文是新的唯一事实来源。

## 功能（只有四件事）

1. **颜色**：通过官方 `ctx.theme.overrideTokens` 覆盖 alias token（`{light, dark}` 成对），给整个界面重新着色。
2. **地面光**：插件自有的 `position: fixed` 装饰层（`.dsh-theme-tone`），三道光（顶 / 底 / 左），
   位置与方向按色调固定。
3. **对话区顶栏玻璃**：顶栏浮层化（`position: absolute` + 滚动区 `padding-top: 76px` + 滚动条 track 下推
   + 拖拽条上沿裁到 76px），玻璃放在顶栏的 `::before`（`z-index: -1`），模糊复用官方
   `var(--dsw-menu-backdrop-filter)`，填充 = `bg-base` × 70% 半透明。
4. **输入框玻璃**：座位撤掉官方 36px 实色渐隐（`background: none`），卡片 `background` 透明、
   玻璃放卡片 `::before`（`border-radius: inherit`）；座位底部再用 `::after` 重画一小段地面（44px、
   视口对齐、上缘 mask 过渡）挡住卡片下方滚过的正文 —— **纯 CSS、零测量、零 fixed**。
5. **右栏顶栏玻璃**：官方右栏顶部两条 38px 带（合计 76px）所在的 `[data-dockkit-pane]`，背景改为
   「顶部 76px 透明 → 以下 `bg-base`」，透明段用 `::before` 做同样的模糊 + 70% 填充。

「官方默认」档：整张玻璃表不命中、地面层隐藏、token 不覆盖 ⇒ 与没装插件一致。

## 代码布局

| 文件 | 职责 |
| :--- | :--- |
| `src/tones.ts` | 调色板数据 + `tokenOverrides()`（颜色，唯一的颜色事实来源） |
| `src/backdrop.ts` | 地面光层 CSS、渲染计划、设置行色卡预览、CSS 特性门 |
| `src/glass.ts` | 三块玻璃的 CSS（唯一一处 `backdrop-filter`，全部放在 `::before` 上） |
| `src/constants.ts` | 选择器锚点 / z-index / 标记属性 / 设置命名空间 |
| `src/compat.ts` | 能力门（缺失即惰性停用，不抛错） |
| `src/host.ts` + `src/settings-schema.ts` | host half：配置 schema、关掉自动配置页 |
| `src/client/index.ts` | 注入样式与地面层、写 token、设置行、写入与结算 |
| `src/client/{ThemeToneRow,styles,store,pending,known-settings,locales}` | 设置行 UI 与持久化辅助 |

**没有**：MutationObserver / ResizeObserver / rAF 循环 / `getComputedStyle` 探测 / 锚点扫描 / 相位变量 / 私有类名。
client half 只在「安装、设置变化、主题变化、用户点选」时跑一次，其余时间零 JS 活动。

## 硬约束（守卫里钉住）

1. 所有玻璃规则带 `body:not([data-dsh-theme-tone-plain])` 门。
2. 不得出现 `background-attachment: fixed`，不得手写 `blur()` 数值（统一 `var(--dsw-menu-backdrop-filter)`）。
3. `backdrop-filter` 只允许出现在 `::before` 上（不挂 header / 卡片 / 面板本体，避免 backdrop root
   与 fixed 包含块影响官方弹层）。
4. 不改官方容器的 `position` / `overflow` / `transform` / `contain`（pane 的 `position: relative` 是
   已知例外，见「已知偏离」）。
5. 颜色只走 `ctx.theme` token 通道；玻璃与地面光必须写 CSS（官方无对应 token）。
6. 官方默认牌面（菜单 / 弹窗 / 挂靠卡）材质由官方自己负责，插件不重画、不覆盖。

## 已知偏离（明示取舍，不当成「和官方一致」）

* 顶栏浮层化是**布局改动**（官方注释写明顶栏在流内）。这是顶栏玻璃的前提；静止几何保持 76px 不变量。
* 输入框常驻 blur：官方自己只在菜单 / 浮层这类短生命周期表面用 blur（长期面全部不透明）。本插件按 owner
  要求保留常驻玻璃；性能口径见下。
* 右栏 `[data-dockkit-pane]` 加了 `position: relative`（原本 static）作为 `::before` 的包含块；不改其尺寸。
* 官方 rc.3 的挂靠卡（Queue/Todo/Goal）本身是半透明 + blur；插件不碰它们（token 染色会顺带跟随）。

## 验证

* `npm run verify`：typecheck → build → test → package。
* 单测覆盖：三块玻璃的 CSS 契约（含「无 fixed / 无手写 blur / 全部带门」）、地面光层三道光与层序、
  token 计划与官方默认档、client half 无逐帧探测。
* 真机验收（无头 + owner 复看）：三条玻璃面的 `backdrop-filter` 计算值、顶栏浮层化后 y=76 不变量、
  输入框下方遮罩与地面连续、右栏 76px 让位。
