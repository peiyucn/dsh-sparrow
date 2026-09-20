/**
 * 色调表（纯数据，无宿主依赖 —— 客户端 bundle 会内联本模块，故此处
 * 绝不 import schemastery / Node 模块；schema 见同目录 settings-schema.ts）。
 *
 * 一条色调 = 底色 + 左栏填充 + 本色 + 顶部/底部径向染色 + 颗粒开关。
 * `available: false` 的是**留位色**：有键、有提案值，但设置行不渲染；
 * 上线一款 = 填实色值 + 把 available 翻成 true，结构不动。
 *
 * 只有「官方默认」（两轴都有）与「蓝紫」（深色轴，= pyai.site 现款）已落地。
 */

import {
  BOTTOM_VARIABLE,
  GRAIN_TILE_VARIABLE,
  LEFT_VARIABLE,
  PANEL_VARIABLE,
  POPUP_GRAIN_DATA_URI,
  TOP_STOP_VARIABLE,
  TOP_VARIABLE,
} from './constants.js'

/**
 * **顶光收束点**（按轴取值，缘由见 `constants.ts` 的 `TOP_STOP_VARIABLE`）。
 *
 * ## 两轴**同一个值**（`62%`，2026-09-18 owner 定案）
 *
 * owner：「浅色的我想的是**依然是官方的底色配置**，然后**打光用主色**，
 * **打光的方向位置和深色的金光一样**。而不是现在整体都是主色的感觉。」
 *
 * 所以浅色轴不再有自己的一套几何 —— **方向 / 位置 / 收束点一律照深色轴那束金**
 * （`62%`），两轴严格镜像：近黑底 + 金光源 / 近白底 + 主色光源。
 *
 * ## 历史：浅色轴曾单独取 `100%`
 *
 * 那时浅色轴的三层光 alpha 是 `.48 / .54 / .38`（比深色重一个量级），
 * 同样收在 `62%` 会让那条「到此为止」的硬边明显 6 倍，且边外是一大片**没有渐变的死区**
 * （实测顶光在 y ≈ 145px 就没，屏高 18%~84% 全平）。owner 当时反馈
 * 「浅色模式上下主色向中间渐变整体比较愣」→ 推到 `100%` 把色量摊开。
 *
 * **现在不需要那个补丁了**：alpha 已降到 `.16`（与深色 `.09` 同量级），
 * `.09` 的淡光本来就看不见边 —— 浅色轴跟着用 `62%` 即可（见下方 alpha 表）。
 */
const TOP_STOP_BY_SCHEME: Readonly<Record<ColorScheme, string>> = Object.freeze({
  light: '62%',
  dark: '62%',
})

/** 明暗轴。 */
export type ColorScheme = 'light' | 'dark'

/**
 * 浅色轴可选色调 id（插入顺序 = 设置行渲染顺序）。
 *
 * **顺序与深色轴逐位对应**（owner：「蓝色的在最前面，有点泛红那个在中间，最后是绿的，
 * **和深色正好对应**」）：
 *
 * | 位 | 深色轴 | 浅色轴 |
 * | :--- | :--- | :--- |
 * | 1 | `violet` 深空（蓝紫） | `blue` 霜蓝 |
 * | 2 | `crimson` 余烬（红） | `sakura` 樱花（粉 —— 两轴这一位都是**暖色**） |
 * | 3 | `forest` 幽林（绿） | `green` 苔青 |
 *
 * ⚠️ 第 2 位原来叫 `gray`（素白），2026-09-18 因「看不出是什么颜色」改成樱花粉并改名。
 * 插件当时**尚未发布**（npm 无此包），故 id 改名无兼容负担。
 */
export const LIGHT_TONE_IDS = ['official', 'blue', 'sakura', 'green'] as const

/** 深色轴可选色调 id（插入顺序 = 设置行渲染顺序）。 */
export const DARK_TONE_IDS = ['official', 'violet', 'crimson', 'forest'] as const

/** 浅色轴色调 id。 */
export type LightToneId = typeof LIGHT_TONE_IDS[number]

/** 深色轴色调 id。 */
export type DarkToneId = typeof DARK_TONE_IDS[number]

/** 任一条色调 id。 */
export type ToneId = LightToneId | DarkToneId

/** 一条色调的取值。 */
export interface ToneSpec {
  /** 是否可在设置行里选中。false = 留位（色值未调好，不暴露给用户）。 */
  available: boolean
  /** 应用底色，落到 `--dsw-alias-bg-base`。 */
  base: string
  /** 左栏（及标题行）填充，落到 `--dsw-specific-sidebar-fill`。 */
  sidebarFill: string
  /**
   * 该色调的**本色** —— `'R, G, B'` 通道值（不透明）。**一处定义、两处派生**：
   * 底部辉光 `rgba(tint, DEPTH_ALPHA)` 与抬升面（浮层）染色 `color-mix(tint P%, 官方中性 rung)`。
   * `''` = 没有本色（「官方默认」）：底部不画，浮层直通官方 rung。
   */
  tint: string
  /** 顶部径向染色色值；`''` = 不画（背景层隐藏）。 */
  top: string
  /** 底部径向染色色值（由 {@link ToneSpec.tint} 派生）；`''` = 不画。 */
  bottom: string
  /**
   * **左侧金色过渡**（额外一层，可选）：锚在视口左上角的暖色洗染，让左边栏也吃到金色，
   * 并在左栏与对话列的接缝一带形成金色渐变。`''` = 不画（默认）。
   * 依赖 `top` / `bottom` 已给（见 `backdropPlan`）。
   */
  left: string
  /** 是否叠颗粒星尘。 */
  grain: boolean
}

/**
 * 底部辉光（纵深）的**共享 alpha**：两轴各一档，全部色调共用。
 *
 * 做成共享常量而不是逐款写死，是因为「三款同步、规则无例外」本身是 owner 定的规则
 * （深色轴从 `.08` 两次上调到 `.18` 时都是三款同动）；本色与浓度的分离让「改浓度」
 * 变成改一个数字，不可能漏掉某一款。
 *
 * ## 浅色轴从 `.18` 提到 `.54` —— 目的是**与色调卡逐像素对齐**
 *
 * owner 的规则：「色卡上底部的渐变，在对话区和左边栏都看不出来」→「**得和色卡看起来一样**」。
 * 色卡就是承诺，实况必须兑现它。根因是一处**不对称**：
 *
 * 色卡为了让渐变在 135×83 的小卡上读得出来，把**各款自己的纵深层**放大了
 * {@link PREVIEW_ALPHA_SCALE}（×3）；但那个放大**只作用在卡面**，实况一直用的是原始 alpha。
 * 深色轴看不出问题，是因为近黑底到纯黑的**余量大**（底 `#0a0a10`），同样的 α 叠上去
 * Δ亮度 +9~12，本来就显；浅色底到纯白只剩个位数余量，`α .18` 只换来 Δ亮度 −6~9，
 * 相对变化被余量压死 → **卡上有、实况没有**。
 *
 * 取 `.54` 不是新的口味值，而是**把卡面等效 alpha 还原到实况**：
 * 卡面旧值 `0.18 × 3 = 0.54`，现在 `0.54 × 1 = 0.54` —— **卡面渲染结果逐字节不变**，
 * 只有实况追上来了（两轴的底部几何几乎等价：卡面底部 falloff `.7183` / 实况 `.7193`，
 * 覆盖高度 33% / 29%）。
 *
 * 深色轴**一个字没动**（`.18` + 卡面 ×3）：它本来就没有这个不对称。
 *
 * ## ⚠️ 2026-09-18：浅色轴 `0.48 → 0.30`（结构改动，与 {@link LIGHT_GLOW_ALPHA} 同一次）
 *
 * owner 先要「蓝绿再浅一点点」，随即给出**结构性的口径**：
 * 「浅色的我想的是**依然是官方的底色配置**，然后**打光用主色**，
 * **打光的方向位置和深色的金光一样**。而不是现在整体都是主色的感觉。」
 *
 * 于是浅色轴从「本色染过的近白底 + 三层强主色光」改成
 * **「官方中性底 + 一束主色光」** —— 与深色轴（近黑底 + 一束金光）严格镜像。
 * 底色不再染色 ⇒ 三款的底色**完全相同**，色调**只由打光表达**（语义更干净）。
 *
 * ## 为什么不是逐字照抄深色的 `.18`（而是 `.30`）
 *
 * **物理约束：白底对浅色主色的余量只有深色底对金的一半。**
 * 深色底 `#0a0a10` → 金 `232,162,74` 的 R 通道差 **222**；
 * 白底 `#fff` → 霜蓝 `145,215,235` 的 R 通道差只有 **110**。
 * 所以「视觉等重」需要约 **1.8 倍** alpha。实测（定向通道差，已排除颗粒干扰）：
 *
 * | 档 | 顶光主色 | 底光主色 |
 * | :--- | ---: | ---: |
 * | 逐字照抄深色 `.09/.11/.18` | 1.49 | 5.87 |
 * | **一档 `.16/.19/.30`（本值）** | **2.39** | **9.95** |
 * | 二档 `.24/.28/.42` | 3.44 | 14.04 |
 * | （旧结构：本色近白底 + 强光，作对照） | 21.15 | 20.27 |
 *
 * 旧结构那 21.15 就是 owner 说的「整体都是主色」—— 收束点 `100%` 把主色一路摊到中段。
 *
 * ## 色卡对齐关系：**要重算**
 *
 * 这一档不再是「把色卡等效 alpha 还原到实况」（那个推导基于旧的近白底结构，已作废）。
 * 现在两个轴都是「自己的 alpha + 卡面倍数」，浅色 `×1` 仍成立 ⇒ **实况与卡面依旧逐像素相等**
 * （`test/backdrop.test.mjs` 的守卫照旧绿），只是那个值本身换了。
 */
export const DEPTH_ALPHA: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.30, dark: 0.18 })

/**
 * **抬升面（浮层）面板**的染色比例 —— 从 {@link SURFACE_TINT} **拆出来**的专用档。
 *
 * ## 为什么要拆（2026-09-18）
 *
 * 旧结构里三者共用 `.14`：面板填充、交互态面（hover / 按下）、滚动条。
 * 但浅色轴结构改动后（**官方底色 + 主色打光**，地面变回 `#fff`），
 * **面板与地面不再同源**：地面无色，面板却还带 14% 本色 —— owner 指出「其他元素也得跟着适配」。
 *
 * 面板降到 `.07` 而**交互态 / 滚动条不动**，理由是它们的处境不同：
 *
 * | 用谁 | 比例 | 为什么 |
 * | :--- | :--- | :--- |
 * | **面板填充**（本常量） | **`.07`** | 它要与**无色的地面**并列出现 —— 太艳就「地面无色的、浮层有色的」两张皮 |
 * | 交互态面 / 滚动条（{@link SURFACE_TINT}） | `.14` | 它们**永远出现在已染色的面板之内**，是「面板上的面」，与地面不同屏并列，保持原浓度即可 |
 *
 * ## 浅色轴收到 `0`（2026-09-20）—— 染色会撞掉官方面
 *
 * 浅色轴原先取 `.07`，实测值 `#f9fdfa`（green）**恰好落在官方面色 `#f9fafb` 上**
 * （`--dsw-alias-markdown-code-block` / `--dsw-static-neutral-bluish-50`，二者只差 1–3 阶）。
 * 后果是**任何用官方面色当背景的元素都不再可辨**：Trajectory 视图的画布取
 * `--dsw-alias-bg-layer-1`（`dsh-client-ui-trajectory` 的 `qBU-ya_root` / `Y0dWHa_split`），
 * 官方面是 `#fff`、代码块是 `#f9fafb`，差 6 阶 → 灰底读得出来；
 * 我们把它染成 `#f9fdfa` → 差 1–3 阶 → **代码块的底色被吃掉**。
 *
 * ## 为什么浅色轴应当是 `0`
 *
 * 浅色定的口径是「**官方底色配置 + 打光用主色**」——底色保持官方原值，色调由**打光层**
 * （背景层 + 抬升面的颗粒 / 顶光 / 底光）承担。既然打光已经给了色调，
 * 再往**面**上染色就是重复叠色，且必然改动官方底色 —— 与口径相悖。
 * 收到 `0` 后浅色轴的抬升面与官方**逐字符相同**，分层改由描边与阴影承担（与官方浅轴同法）。
 *
 * 深色轴**不动**（`.14`）：它的地面是本色染过的近黑、面板本就同源，没有这个冲突。
 */
export const PANEL_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0, dark: 0.14 })

/**
 * 交互态面 / 滚动条的染色比例：两轴各一档，全部色调共用。
 *
 * **浅色轴从 `.05` 上调到 `.14`（与深色轴同档）**，理由是「三款分不清」：
 * 弹层 / 菜单 / 卡片是界面里**数量最多、面积最大的不透明面**，
 * 而背景中间那一大条（约 55% 屏高）只有底色、拉不开差别。
 * 实测弹层三款两两差：`.05` → `3.9 / 3.3 / 3.0`（低于肉眼阈约 8）；`.14` → `11.0 / 9.3 / 8.3`。
 *
 * **代价（已知、可接受）**：浅轴的 rung 比近白底暗，往它混本色会让浮层**比内容底更暗**
 * （实测 gray Δ−28 / blue Δ−43 / green Δ−41，`.05` 时是 −19/−23/−19）。
 * 浅底上「任何染色都只会变暗」是物理必然（除非完全不染），浮层仍靠**阴影 + 描边**读成抬升，
 * 所以这里选「分得清」而不是「绝对不暗」。
 *
 * ⚠️ **面板填充已拆到 {@link PANEL_TINT}**（2026-09-18），本常量现在只管
 * **交互态面与滚动条** —— 它们都出现在已染色的面板之内，故保持原浓度。
 */
export const SURFACE_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.14, dark: 0.14 })

/** 官方抬升面阶梯的档位名（浮层用的那几个 rung）。 */
export type SurfaceRung = 'layer1' | 'layer2' | 'layer3' | 'tip'

/**
 * **官方自己的绑定**（`design-platform.css:158-160/168/246`、`:251-253/261/339`）。
 *
 * 「默认」这一轴必须**逐条回给官方** —— 不能把 {@link SURFACE_RUNGS} 里我们选的档发出去，
 * 否则官方默认下的 `layer-3` 会从官方的 `800` 被改成我们的 `875`，那一刻「完全不介入」就破了。
 * 这张表就是那条硬约束在 token 层的落点（有测试逐条比对）。
 */
export const OFFICIAL_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-60',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-850',
    layer3: '--dsw-static-neutral-bluish-800',
    tip: '--dsw-static-neutral-bluish-800',
  }),
})

/**
 * 抬升面 rung 表 —— **两轴各自收敛成一档**（仅在有色调时生效）。
 *
 * 传**官方 static 变量引用**而非硬编码色值，官方换调色板时自动跟随。
 * 刻意引用 `--dsw-static-neutral-bluish-*`（原始色阶）而**不是** `--dsw-alias-bg-layer-*`：
 * 后者正是我们要覆盖的 token，引用它会形成自引用环。
 *
 * ## 为什么不再逐条照抄官方的阶梯
 *
 * 官方暗轴是 `layer-1 875 / layer-2 850 / layer-3 800` 三档，我们原来逐条照抄 + 同一个
 * 染色比例 → 三个「面」只差 4–6/255，owner 真机反馈「插件弹出、下拉弹出、设置弹出、
 * 按钮的 hover、区分区域的色块，这些还都是不统一的，有点乱」。
 *
 * 现在**这个家族（layer-1/2/3 + 菜单 + 提示条）统一到一档**：暗轴 `875`、浅轴 `60`。
 * 分层改由**描边、阴影、hover 洗染**承担 —— 而不是靠一堆肉眼难辨的灰阶。
 * 这也是官方浅轴自己的做法（layer-1/2/3 全是同一个白）。
 *
 * 深浅的取法：暗轴从官方的菜单档 `800`（三通道和 163，染色后 188）**下压到 `875`**（染色后
 * 139）—— 这一档仍明显高于地面（36），读得出是「面板」，但不再是一块发亮的灰板
 * （owner 连着两轮反馈「弹出框颜色偏浅了」「还是有点浅了」）。
 *
 * **浅轴取官方自己的那档纯白（`bluish-00`）** —— 这是 owner 第 12 轮的要求：
 * 「各种弹出框，上一版用的是偏深的主色，**应该用浅的，否则小范围看着显脏**」。
 * 实测旧值（`bluish-60`）与本色混完是 `#e8f0eb`，比内容底 `#f5fbf6` **还暗 13 级** ——
 * 一块小灰面浮在暖白上，正是「脏」的来源。换成纯白后弹层与内容底**基本同深**（见下），
 * 这也正是官方浅轴的做法（`bg-base` 与 `layer-1/2/3` 全绑纯白）。
 */
export const SURFACE_RUNGS: Readonly<Record<ColorScheme, Readonly<Record<SurfaceRung, string>>>> = Object.freeze({
  light: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-00',
    layer2: '--dsw-static-neutral-bluish-00',
    layer3: '--dsw-static-neutral-bluish-00',
    tip: '--dsw-static-neutral-bluish-00',
  }),
  dark: Object.freeze({
    layer1: '--dsw-static-neutral-bluish-875',
    layer2: '--dsw-static-neutral-bluish-875',
    layer3: '--dsw-static-neutral-bluish-875',
    tip: '--dsw-static-neutral-bluish-875',
  }),
})

/**
 * 「弹出来的框」落在哪几个官方 token 上 —— 逐个查过官方源码后钉死的一份清单。
 *
 * | 官方 token | 谁在用 |
 * | :--- | :--- |
 * | `--dsw-alias-bg-layer-3` | 菜单（`ui-primitives/Menu.module.css:18` 经 `--dsw-specific-menu`）、
 *   `PopupSelectView`、`ModelSelect`、`InputTrigger/MenuView`、`stat-dialog`、`JobListAction`、
 *   `ScheduleCatalogAction`、`SubagentHeaderLineage`、`ContextMeter` |
 * | `--dsw-alias-bg-layer-2` | 模态对话框（`ui-primitives/Modal.module.css:33`）、`DirectoryBrowser`、`SettingsRoot` |
 * | `--dsw-alias-bg-layer-1` | `OnboardingSurface`、`FeedbackDialog`、`Input`、`JsonTree` 等抬升面 |
 * | `--dsw-specific-tip` | 浮动提示条：`TodoPanel`、`QueueDock`、`GoalBar` |
 * | `--dsw-specific-menu` | 菜单专用别名。官方写的是 `var(--dsw-alias-bg-layer-3)`，覆盖 layer-3 本可
 *   自动跟随；**仍然显式覆盖一份**，这样官方哪天把菜单改指别处，菜单也还在色调里 |
 *
 * **不染的几处（有意）**：工具提示 `--dsw-alias-tooltip-bg`、轻提示 `--dsw-alias-toast-bg` /
 * `--dsw-alias-button-contrast-fill` 在两轴上都是**反色**（浅色轴上工具提示是深灰），
 * 染了会破坏「反色」这个语义；悬停卡 `--dsw-hovercard-bg` 是组件内的字面量 `#2C2C2E`
 * （`HoverCard.module.css:14`，官方注明 light/dark 同值），声明在使用它的元素上，
 * 覆盖它只能靠 hashed 类名选择器 —— 违反本插件「不碰 hashed 类名」的红线，故放弃。
 */
export const SURFACE_TOKENS: readonly Readonly<{ token: string; rung: SurfaceRung }>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-bg-layer-1', rung: 'layer1' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-2', rung: 'layer2' as const }),
  Object.freeze({ token: '--dsw-alias-bg-layer-3', rung: 'layer3' as const }),
])

/**
 * **菜单族**那两个 token —— 与 {@link SURFACE_TOKENS} 同一种做法：**只装颜色，不装图层**。
 *
 * ## 为什么曾经装过图层，又为什么撤回来
 *
 * 曾经把「颗粒 + 顶光 + 底光 + 底色」整份配方塞进这两个 token，理由是浮层里有
 * **不带任何 role 属性**的（`ui-jobs/JobListAction.tsx:157` 是个光秃秃的
 * `<ul className={css.menu}>`），按语义锚点永远命中不到 —— token 是唯一能覆盖全部消费方的通道。
 *
 * **但那条路会让「粘性分组标题」烂掉**：官方把同一个 `--dsw-specific-menu` 也用在
 * `ModelSelect` 的 `.groupTitle`（`ModelSelect.module.css:184`）与 codebuddy 的
 * `.ccb-model-groupTitle` 上 —— 它们是 `position: sticky; top: 0` 的小条，作用是**压在
 * 滚过的行上面**，所以必须与菜单主体同色。而百分比渐变是**按元素自身盒子缩放**的：
 * 同一条 `ellipse 120% 42% at 50% -12%` 落在一条 24px 高的横条上会重新压成一道
 * 带硬边的金色带，与菜单主体对不上（实测：整条几乎全被顶光染满，而主体只在顶部 20%）。
 *
 * 结论：**token 只给颜色**（消费方共享同一个不透明色，小条天然与主体同色），
 * **图层交给 `surface.ts` 的选择器表**（按 role 命中真正的浮层）。代价是那个无 role 的
 * `<ul>` 只拿到颜色、拿不到颗粒与光 —— 已知且记账（见 05-surfaces §8.2）。
 */
export const POPUP_TOKENS: readonly Readonly<{ token: string; rung: SurfaceRung }>[] = Object.freeze([
  Object.freeze({ token: '--dsw-specific-menu', rung: 'layer3' as const }),
])
// ⚠️ `--dsw-specific-tip` **曾在此表**（当它是「菜单族」），现已移出：
// 它的三个消费方是**三张停靠卡**（TodoPanel / GoalBar / QueueDock），不是菜单；
// 且它需要的是「比地面重」而菜单族要的是「比地面浅」，目标相反。
// 现归 {@link INSET_TOKENS}，走独立的 {@link INSET_TINT}。

/**
 * **浅灰内嵌面**（inset surface）的染色比例 —— 从抬升面那套里**独立出来**的新通道。
 *
 * ## 这些面是什么、为什么要单独一档（owner 2026-09-20 的想法）
 *
 * 官方浅色轴里有一族「比背景略暗的浅灰面」，用来在**白色地面上**圈出内容块：
 *
 * | token | 官方浅色 | 官方深色 | 谁在吃 |
 * | :--- | :--- | :--- | :--- |
 * | `--dsw-alias-markdown-code-block` | `bluish-50` `#f9fafb` | `bluish-900` | 代码块、`ioCard`、`payload`、`instructionsCard`、Trajectory 各块（15+ 处） |
 * | `--dsw-alias-markdown-code-block-banner` | `bluish-50` | `bluish-850` | 代码块顶栏 |
 * | `--dsw-specific-tip` | `bluish-60` `#f5f6f7` | `bluish-800` | **三张停靠卡**：`TodoPanel` / `GoalBar` / `QueueDock` |
 *
 * owner 的判断：「我看了下官方白色主题，这几个卡，包括代码块，都是浅灰色，所以我考虑要不我们
 * 用我们的主色来做这个事，这样就会比背景颜色重一些，正好就区分开了。」
 *
 * 实测印证：官方这两档与白背景分别只差 **5.1 / 9.1** 阶亮度；而浅色轴的抬升面已回到**纯白**
 * （`PANEL_TINT.light = 0`），于是 `--dsw-specific-tip` 一度等于 `#fff` —— **与背景同色**，
 * 三张停靠卡的面直接「消失」（只剩 4% 的描边在撑）。代码块也只差 5 阶，几乎读不出边界。
 *
 * 染色后（本色 12% 混进官方灰）实测：
 *
 * | 色调 | 代码块 | 比背景 | 停靠卡 | 比背景 |
 * | :--- | :--- | :--- | :--- | :--- |
 * | 苔青 | `#f0f7f3` | −9.8 | `#edf4f0` | −12.8 |
 * | 霜蓝 | `#edf6f9` | −10.7 | `#e9f2f6` | −14.6 |
 * | 樱花 | `#f9f4f7` | −9.7 | `#f5f0f3` | −13.7 |
 *
 * 即「比官方灰更重、但远不到彩色块」——正是 owner 要的「区分开」。
 *
 * **代码块比停靠卡浅 2–3 阶是刻意的**：两族官方基数不同（代码块 `bluish-50` =
 * `#f9fafb`，停靠卡 `bluish-60` = `#f5f6f7`），我们沿用各自基数、只按同一比例混本色，
 * 于是官方「代码块更白、提示卡更深」的既有层级被保留，没有被抹平。
 *
 * **比例从 `.18` 收到 `.12`**：`.18` 在真机上 owner 觉得「还是有点重」。
 * `.12` 仍显著高于官方的 −5.1 / −9.1（读得出边界），但不再像灰板。
 * 再调一次挪一格（`.10` / `.14`）；下界参考官方的 −5.1。
 *
 * ## 为什么不复用 PANEL_TINT
 *
 * 抬升面（菜单 / 弹窗）是**浮在地面之上的面板**，浅色轴上 owner 明确要它「浅、别显脏」
 * （第 12 轮），所以收到 0。而这族是**嵌在地面之内的内容块**，语义相反：它需要**比地面重**
 * 才读得出来。两者目标冲突，必须分开。
 */
export const INSET_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.12, dark: 0.14 })

/**
 * **浅灰内嵌面**的 token 表 —— 底色取**官方自己那一档**（逐条写，因为两轴不同档）。
 *
 * 引用官方 `--dsw-static-*` 原始色阶而非 alias：alias 正是我们要覆盖的东西，引用会成自引用环。
 * 「默认」轴走每条自带的 `official` 字段（逐条回官方绑定），保证完全不介入。
 */
export const INSET_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-markdown-code-block',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-900' }),
  }),
  Object.freeze({
    token: '--dsw-alias-markdown-code-block-banner',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-50', dark: '--dsw-static-neutral-bluish-850' }),
  }),
  Object.freeze({
    token: '--dsw-specific-tip',
    official: Object.freeze({ light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  }),
])

/**
 * 底部辉光色值：**本色 @ 该轴的共享 alpha**。
 *
 * ## 为什么浅色轴的底部用本色（owner 两轮反馈的最终结论）
 *
 * 第 10 轮我曾把浅色轴的底部换成「那束银白光」，理由是「本色比近白底暗，放底部会变阴影」。
 * 那个推理**只看单层、漏看了整屏**：owner 随即反馈「**改的不对啊，没反过来啊**」，
 * 之后又明确「**感觉还是上一版好看，只是各种弹出框，上一版用的是偏深的主色，应该用浅的**」
 * 并澄清「上一版，**有主色的渐变那版**」。
 *
 * 实测（真机，采样列在顶部椭圆内）：
 *
 * | 配方 | 纵向极差（渐变强度） | 顶 / 中 / 底 |
 * | :--- | :--- | :--- |
 * | 底 = 银白（第 10 轮） | **2.5** | 247 / 245 / 248 |
 * | 底 = 本色（本版） | **17.5** | 247 / 245 / **230** |
 * | 深色参照 Space | 8.4 | 27 / 22 / **30** |
 *
 * 也就是说：**底部放本色才有「主色渐变」**（纵向极差 17.5），而银白只做出 2.5 ——
 * 那正是 owner 说的「确实这么看，更像纯色了」。
 *
 * **两个轴仍然同构**：这一层都是「本色的纵向渐变」。差别只在本色相对底色的方向 ——
 * 深色轴本色比近黑底**亮**（是辉光），浅色轴本色比近白底**暗**（是把画面往下压一档的纵深）。
 * 「亮 / 暗」不是判据，**「有没有色相的纵向渐变」才是**。
 * @param tint - 本色通道值（`'R, G, B'`）；`''` → 不画。
 * @param scheme - 明暗轴（决定 alpha 档）。
 * @returns CSS 颜色字面量（`rgba(r, g, b, a)`）或空串。
 */
function depthGlow(tint: string, scheme: ColorScheme): string {
  return tint === '' ? '' : `rgba(${tint}, ${DEPTH_ALPHA[scheme]})`
}

/**
 * 浅色轴**上光 / 侧光**的 alpha（本色 @ 各自档）。
 *
 * owner 的规格：「**底部和顶部的打光都一样，只是浅色是用主色打光**」——
 * 于是浅色轴的三层光**全部来自本色**，与深色轴（三层全部来自金）逐项同构。
 * 底部在 {@link DEPTH_ALPHA}；这两档单独给，因为它们本来就更弱。
 *
 * ## 2026-09-18：结构改动后的**新口径**（owner 定案）
 *
 * owner：「浅色的我想的是**依然是官方的底色配置**，然后**打光用主色**，
 * **打光的方向位置和深色的金光一样**。而不是现在整体都是主色的感觉。」
 *
 * | 项 | 旧结构 | **新结构** |
 * | :--- | :--- | :--- |
 * | 底色 | **本色染过的近白**（`#f1fcff`…） | **官方中性底**（`--dsw-static-neutral-bluish-00` = `#fff`） |
 * | 光 | 本色，`.48/.54/.38`，收束 `100%` | 本色，**`.16/.19/.30`**，收束 **`62%`** |
 * | 中段主色（实测） | **4.91**（= owner 说的「整体都是主色」） | **−0.44 ≈ 0**（中性） |
 *
 * **两轴现在严格镜像**：近黑底 + 金光源 / **近白底 + 主色光源**，
 * 几何（方向、位置、收束点）逐字相同。
 *
 * ## 强度次序与深色轴一致（这是「光从左上来」的几何含义）
 *
 * | 层 | 深色轴（金） | **浅色轴（主色）** | 说明 |
 * | :--- | ---: | ---: | :--- |
 * | `top` | `.09` | **`.16`** | 正对光源 |
 * | `left` | `.11` | **`.19`** | 掠射（alpha 略高于顶光，因为它铺在**大面积的左栏**上） |
 * | `bottom` | `.18` | **`.30`** | 纵深 / 焦散，最强 |
 *
 * ## 为什么浅色的 alpha 约为深色的 1.8 倍（物理约束，不是口味）
 *
 * 白底对浅色主色的**通道余量只有深色底对金的一半**：
 * 深底 `#0a0a10` → 金 `232,162,74` 的 R 差 **222**；
 * 白底 `#fff` → 霜蓝 `145,215,235` 的 R 差只有 **110**。
 * 所以逐字照抄 `.09/.11/.18` 在白底上明显偏弱（实测顶光主色只有 1.49，本档 2.39）。
 */
export const LIGHT_GLOW_ALPHA: Readonly<Record<'top' | 'left', number>> = Object.freeze({
  top: 0.16,
  left: 0.19,
})

/**
 * 把本色按给定 alpha 组成「一层光」。
 * @param tint - 本色通道值（`'R, G, B'`）；`''` → 不画。
 * @param alpha - 不透明度。
 * @returns CSS 颜色字面量。
 */
function toneGlow(tint: string, alpha: number): string {
  return tint === '' ? '' : `rgba(${tint}, ${alpha})`
}

/**
 * 抬升面（浮层）色值：把本色按该轴的比例混进官方中性 rung。
 * @param tint - 本色通道值（`'R, G, B'`）；`''` → 直通官方 rung（等于官方原值）。
 * @param scheme - 明暗轴（决定比例与 rung 表）。
 * @param rung - 官方 rung 档位。
 * @returns CSS 颜色字面量。
 */
function surfaceFill(tint: string, scheme: ColorScheme, rung: SurfaceRung): string {
  // 「默认」逐条回官方绑定（不是我们选的档），否则官方默认下 layer-3 会被我们改深。
  if (tint === '') return `var(${OFFICIAL_RUNGS[scheme][rung]})`
  // ⚠️ 面板用**专用**的 {@link PANEL_TINT}（2026-09-18 从 SURFACE_TINT 拆出）——
  // 地面已回官方无色，面板太艳会与地面「两张皮」。交互态 / 滚动条仍用 SURFACE_TINT。
  return rungFill(tint, SURFACE_RUNGS[scheme][rung], PANEL_TINT[scheme])
}

/**
 * 把本色混进**任意一档官方原始色阶**（`--dsw-static-*`）。
 *
 * 引用 static 而**不是** alias：alias 正是我们要覆盖的东西，引用它会形成自引用环。
 * 传色阶的**完整变量名**（如 `--dsw-static-neutral-bluish-800` / `--dsw-static-deepseek-100`），
 * 与 {@link SURFACE_RUNGS} 同一个口径 —— 抬升面与交互态共用这一条。
 *
 * 比例由调用方按轴给出（`PANEL_TINT` / `SURFACE_TINT` / `INSET_TINT` 都按轴取值），
 * 本函数**不感知明暗轴** —— 同一档色阶在两个轴上怎么混是调用方的事。
 * @param tint - 本色通道值（`'R, G, B'`）；`''` → 直通官方色阶（等于官方原值）。
 * @param rung - 官方原始色阶的完整变量名。
 * @param scale - 混合比例 0–1。
 * @returns CSS 颜色字面量。
 */
function rungFill(tint: string, rung: string, scale: number): string {
  const reference = `var(${rung})`
  // 比例为 0 时直通官方引用 —— 不产出 `color-mix(… 0%, …)` 那种恒等包装，
  // 「官方底色不动」在产物里逐字符可见（浅色轴的面板就是走这条路，见 {@link PANEL_TINT}）。
  if (tint === '' || scale === 0) return reference
  return `color-mix(in srgb, rgb(${tint}) ${Math.round(scale * 100)}%, ${reference})`
}

/**
 * 浮层面板底色 = 本色混进 {@link SURFACE_RUNGS} 那一档。
 * @param tone - 色调取值。
 * @param scheme - 明暗轴。
 * @param rung - 档位名。
 * @returns CSS 颜色字面量（官方默认下即官方色阶引用）。
 */
export function panelFill(tone: ToneSpec, scheme: ColorScheme, rung: SurfaceRung): string {
  return surfaceFill(tone.tint, scheme, rung)
}

/**
 * **交互态**（hover / 按下 / 强调）的染色比例。比面高一点：这些是**低 alpha 洗染**
 * （深色轴上就是一层 8% 的白），比例给低了色相根本读不出来。
 *
 * **浅色轴从 `.15` 上调到 `.25`（与深色轴同档）**：同属「三款分不清」的收口 ——
 * 浅轴上三族比例原先都不到深色轴的一半（深 .18/洗 .25/面 .05 对 浅 .08/.15/.14），
 * 而 hover 面是**用户每时每刻都在碰**的位置，它的色相差就是「感受到色调」的主要来源。
 */
export const WASH_TINT: Readonly<Record<ColorScheme, number>> = Object.freeze({ light: 0.25, dark: 0.25 })

/**
 * 交互态的**低 alpha 洗染** —— 官方的 hover / 按下 / 强调底色。
 *
 * 这类值官方写的是**字面量** `rgba(...)`（不是 static 变量引用），而且 **alpha 就是效果的全部**
 * （深色轴 = 8% 白、14% 白、24% 白）。所以不能像面那样直接 `color-mix`：`color-mix` 会连 alpha
 * 一起加权平均（`.25×1 + .75×.08 = .31`，一层 8% 的洗染会变成 31%，四个档位全糊成一片）。
 * 解法：**只混 RGB、原样保留 alpha**，在 JS 里算好再当字面量发出去。
 *
 * 官方原值逐字抄自 `ui-theme/src/styles/design-platform.css:196-200`（浅）与 `:289-293`（深），
 * 有测试钉住 —— 官方改了这几个数，测试会红。
 *
 * 最后一条 `--dsw-alias-bg-skeleton` 是 `@` 菜单加载态的骨架条
 * （`ui-input-trigger/.../MenuView.module.css:178`）—— 它跟这几条**同一种东西**
 * （低 alpha 官方字面量、漂在已染过的面上），只是 alpha 更淡，所以并进这一族、共用同一条混法。
 * 不并进的话，菜单里会闪一道纯白的条。
 */
export const WASH_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.06)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-active',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.1)', dark: 'rgba(255, 255, 255, 0.14)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-interactive-bg-hover-accent',
    official: Object.freeze({ light: 'rgba(38, 49, 72, 0.14)', dark: 'rgba(255, 255, 255, 0.24)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-bg-skeleton',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.08)' }),
  }),
])

/**
 * **描边 / 分隔线**（发丝线）—— 与 {@link WASH_TOKENS} 同一种东西：**低 alpha 的洗染**，
 * 官方写的是 `rgba(...)` 字面量，所以同样「只换 RGB、alpha 一字不动」。
 *
 * 为什么要染：这几条是**浮层内部**仅剩的中性命中。菜单卡的外描边（`Menu.module.css:19`
 * 把 `--dsw-elevation-stroke-color` 绑到 l1）、菜单里的 `.separator`（l1）与 `.footer`
 * 顶线（l2）、对话框内部的分区线 —— 全是纯白 / 纯黑洗染。它们**叠在已经被染过的面上**，
 * 所以本身会跟着底色走一点；但那一层 alpha 只有 4–20%，叠出来的色相几乎读不出来，
 * 于是「框里还是灰的」。
 *
 * 官方原值逐字抄自 `design-platform.css:172-176`（浅）与 `:265-269`（深），有测试钉住。
 *
 * **不在此列（有意）**：`--dsw-alias-border-inverted` / `-inverted2`（两轴都是 `rgba(0,0,0,0)`，
 * 染了等于凭空画出一条线）。
 */
export const BORDER_TOKENS: readonly Readonly<{
  token: string
  official: Readonly<Record<ColorScheme, string>>
}>[] = Object.freeze([
  Object.freeze({
    token: '--dsw-alias-border-l1',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.04)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    // 深色轴的「细一档」变体（浅色轴与 l2 同值）。
    token: '--dsw-alias-border-l2-darkmode-thin',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.06)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l2',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.1)', dark: 'rgba(255, 255, 255, 0.12)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l3',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.12)', dark: 'rgba(255, 255, 255, 0.16)' }),
  }),
  Object.freeze({
    token: '--dsw-alias-border-l4',
    official: Object.freeze({ light: 'rgba(0, 0, 0, 0.16)', dark: 'rgba(255, 255, 255, 0.2)' }),
  }),
])

/**
 * **滚动条滑块** —— 浮层里最后一处**纯中性**：官方绑的是 `--dsw-static-neutral-*`
 * （纯灰，连 bluish 都不是），所以菜单内部滚动时，一条纯灰滑块会从染过的面板上横切过去。
 *
 * 与描边不同，这几个是**实心、不透明**的变量引用（不是低 alpha 字面量），
 * 所以用 {@link rungFill}（`color-mix`）而不是 {@link washFill}。
 * 比例沿用抬升面的 {@link SURFACE_TINT}：滑块是「面」的量级，不是洗染。
 *
 * 官方绑定逐字抄自 `design-platform.css:219-222`（浅）与 `:312-315`（深），有测试钉住。
 * 注意 `-l1` 与 `-l2` 在两轴上同值、`-hover-l1` 与 `-hover-l2` 亦同值 —— 逐条写而不是去重，
 * 是为了万一官方哪天拆开也能自动跟随。
 */
export const SCROLLBAR_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l1', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-700' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-bg-l2', light: '--dsw-static-neutral-200', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l1', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-600' }),
  Object.freeze({ token: '--dsw-alias-scrollbar-hover-l2', light: '--dsw-static-neutral-300', dark: '--dsw-static-neutral-550' }),
])

/**
 * **不透明的中性态面**：选中 / hover 的导航底、设置里的模块面板、各类按钮面。
 *
 * owner 指着设置页问「选中、hover、按钮、内部元素是不是也得适配」——就是这几条。
 * 每条给出两轴的官方原始色阶名（浅轴的绑定与深轴不同，所以逐条写而不是写一个映射）。
 *
 * | token | 谁在用 |
 * | :--- | :--- |
 * | `--dsw-specific-sidebar-nav-item-active` | 设置左导航**选中**项（`SettingsRoot.module.css` 的 `.navCell.active`） |
 * | `--dsw-specific-sidebar-nav-item-hover` | 设置左导航 hover |
 * | `--dsw-specific-sidebar-nav-item-active-accent` | 选中项的强调底（`QuestionComposer.module.css:282` 的已选行） |
 * | `--dsw-alias-bg-module-platform` | 设置里的**模块面板**：provider 编辑器、setup 卡（`ModelsSection.module.css:226/333`） |
 * | `--dsw-alias-interactive-bg-hover-solid` | 实心 hover（次按钮 `secondaryButton`） |
 * | `--dsw-alias-button-elevated-fill` / `-floating-fill` / `-floating-hover` | 抬升按钮、浮动按钮 |
 * | `--dsw-alias-button-ghost-active-fill` / `-hover` | 幽灵按钮的按下 / 悬停 |
 *
 * **不在此列（有意）**：危险态 `--dsw-alias-interactive-bg-hover-danger`（红）、
 * 主按钮 `--dsw-alias-button-primary-fill` / `-hover`（品牌 = 反色对比，染了就不再是「最重的那个」）、
 * 成功 / 错误 / 警告 `--dsw-alias-state-*`（语义色，任何主题下都必须是它自己）、
 * 遮罩 `--dsw-alias-bg-mask-*`、代码块 `--dsw-alias-markdown-code-block*`。
 */
export const STATE_TOKENS: readonly Readonly<{
  token: string
  light: string
  dark: string
}>[] = Object.freeze([
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-hover', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-850' }),
  Object.freeze({ token: '--dsw-specific-sidebar-nav-item-active-accent', light: '--dsw-static-deepseek-100', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-bg-module-platform', light: '--dsw-static-neutral-bluish-60', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-interactive-bg-hover-solid', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-elevated-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-floating-fill', light: '--dsw-static-neutral-bluish-00', dark: '--dsw-static-neutral-bluish-850' }),
  Object.freeze({ token: '--dsw-alias-button-floating-hover', light: '--dsw-static-neutral-bluish-75', dark: '--dsw-static-neutral-bluish-800' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-fill', light: '--dsw-static-neutral-bluish-100', dark: '--dsw-static-neutral-bluish-750' }),
  Object.freeze({ token: '--dsw-alias-button-ghost-active-hover', light: '--dsw-static-neutral-bluish-150', dark: '--dsw-static-neutral-bluish-700' }),
])

/**
 * 交互态洗染色值：**只换 RGB，alpha 一字不动**。
 * @param tint - 本色通道值（`'R, G, B'`）；`''` → 直通官方字面量。
 * @param scheme - 明暗轴（决定混合比例）。
 * @param official - 官方原字面量（`rgba(r, g, b, a)`）。
 * @returns CSS 颜色字面量。
 */
export function washFill(tint: string, scheme: ColorScheme, official: string): string {
  if (tint === '') return official
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/u.exec(official)
  if (match === null) return official
  const hue = tint.split(',').map(part => Number.parseInt(part.trim(), 10))
  const scale = WASH_TINT[scheme]
  const mixed = [0, 1, 2].map(i => Math.round(hue[i] * scale + Number(match[i + 1]) * (1 - scale)))
  return `rgba(${mixed[0]}, ${mixed[1]}, ${mixed[2]}, ${match[4]})`
}

/** 持久化的色调选择：明暗各一份，切轴不丢选择。 */
export interface ThemeToneSettings {
  /** 浅色轴选中的色调。 */
  lightTone: LightToneId
  /** 深色轴选中的色调。 */
  darkTone: DarkToneId
}

/** 无用户写入时的默认值（也是 settings 的 base 层）。 */
export const DEFAULT_SETTINGS: ThemeToneSettings = Object.freeze({
  lightTone: 'official',
  darkTone: 'violet',
})

/**
 * 浅色轴色调表（规则见 docs/spec/03-palette.md L1–L4）。
 *
 * ## 与深色轴**严格镜像**（owner 2026-09-18 定案）
 *
 * owner：「浅色的我想的是**依然是官方的底色配置**，然后**打光用主色**，
 * **打光的方向位置和深色的金光一样**。而不是现在整体都是主色的感觉。」
 *
 * | 角色 | 深色轴 | 浅色轴 |
 * | :--- | :--- | :--- |
 * | 空间 `base` | **官方**近黑（`bluish-950`） | **官方**近白（`bluish-00` = `#fff`） |
 * | 光源 | **金**（三款共享） | **本色**（三款各用自己的主色） |
 * | 上光 `top` | 金 @ `.09` | **本色 @ `.16`** |
 * | 侧光 `left` | 金 @ `.11` | **本色 @ `.19`** |
 * | 底光 `bottom` | 本色 @ `.18` | **本色 @ `.30`** |
 * | 收束点 | `62%` | **`62%`**（与深色逐字相同） |
 * | 颗粒 | `.13` / screen | `.16` / multiply |
 *
 * **底色不染色了** —— 三款共用同一个官方底色，色调**只由打光表达**。
 * 旧结构（本色染过的近白底 + 三层强主色光）的中段主色实测 **4.91**，
 * 那正是 owner 说的「整体都是主色的感觉」；新结构中段 **−0.44 ≈ 0**（中性）。
 *
 * `official` 传**官方变量引用**而非硬编码色值 —— 官方换色自动跟随，语义上就是「官方原值」。
 * **其余三款也复用同一个官方底色变量**（而不是写死 `#fff`）：语义是「底色 = 官方配置」，
 * 官方调整浅色底时三款自动跟随，与本插件「官方默认直通」的哲学一致。
 */
export const LIGHT_TONES: Readonly<Record<LightToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '',
    top: '',
    bottom: '',
    left: '',
    grain: false,
  }),
  sakura: Object.freeze({
    available: true,
    // 底色 = **官方配置**（三款相同，不再按本色染）。owner：
    // 「依然是官方的底色配置，然后打光用主色」—— 色调的差异只在光上。
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    /**
     * **樱花粉**本色（2026-09-18 由原「素白」改）。
     *
     * owner：「**chalk 这档，能不能主色变成樱花粉，现在都看不出来是什么颜色**……」
     *
     * 旧值 `224, 224, 232` 的**色度只有 8**（且偏冷：R−B = −8），实机渲染出来
     * **中段 R−B ≈ 0.1 —— 就是一个中性灰**，确实「看不出是什么颜色」。
     *
     * 顺带修正一处**结构上的不一致**：这个位置在色序里与深色轴的 `crimson`（余烬，红）逐位对应，
     * 本该是**暖**的一档，旧值却是冷中性。
     *
     * ## 为什么色度取到 50（而不是 20~30 那种「淡雅粉」）
     *
     * 本色只以 **`.16 ~ .30` 的 alpha** 出现（三层光），叠在官方白底上后**色度会被压掉约 3 倍**：
     *
     * | tint | 本色色度 | 叠白底后（底光 .30） |
     * | :--- | ---: | ---: |
     * | 旧 `224,224,232` | 8 | **2** ← 看不出来 |
     * | **本值 `248,198,214`** | **50** | **6.3**（与绿款 `green` 的 5.8 等量） |
     * | （蓝 `145,215,235` 参照） | 90 | 10.3 |
     *
     * 取 50 是为了**与另两款的音量对齐**（绿 50 / 蓝 90）—— 色度给低了会重演「看不出颜色」。
     * 实机对照：旧值中段 R−B = 0.1（中性），本值顶光 R−B = **1.4**、底光色度 6.3（暖且可辨）。
     */
    tint: '248, 198, 214',
    top: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('248, 198, 214', 'light'),
    left: toneGlow('248, 198, 214', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
  blue: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '145, 215, 235',
    top: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('145, 215, 235', 'light'),
    left: toneGlow('145, 215, 235', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
  green: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-00)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-50)',
    tint: '176, 226, 186',
    top: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.top),
    bottom: depthGlow('176, 226, 186', 'light'),
    left: toneGlow('176, 226, 186', LIGHT_GLOW_ALPHA.left),
    grain: true,
  }),
})

/**
 * 深色轴色调表。规则见 docs/spec/03-palette.md D1–D5：
 * **三款共享同一束金色光源**（`top` / `left` 都是 pyai.site 的金 `rgb(232, 162, 74)`，
 * alpha 统一 `.09` / `.11`）—— 切换色调改变的是「空间」，不是「光源」；
 * 各自的差异只在底色（色相染过的近黑）与底部纵深（该色调本色）。
 * `violet` 的三处数值逐字取自 pyai.site（`global.css:57`、`SpaceBackdrop.astro:29-39`、
 * `global.css:69-78`），是其余两款反推规则的基准。
 */
export const DARK_TONES: Readonly<Record<DarkToneId, ToneSpec>> = Object.freeze({
  official: Object.freeze({
    available: true,
    base: 'var(--dsw-static-neutral-bluish-950)',
    sidebarFill: 'var(--dsw-static-neutral-bluish-900)',
    tint: '',
    top: '',
    bottom: '',
    left: '',
    grain: false,
  }),
  violet: Object.freeze({
    available: true,
    base: '#0a0a10',
    sidebarFill: '#14141c',
    // 本色 = pyai.site 的蓝紫（SpaceBackdrop.astro 的底部蓝紫）
    tint: '96, 78, 168',
    top: 'rgba(232, 162, 74, .09)',
    // 色相值仍是 pyai.site 原值，**alpha 由 .08 上调到 .18**：owner 看完色卡后认为实况偏保守
    // （pyai.site 是留白为主的博客，浓度不一定适合 DSW 这种满屏 UI）。三款同步，规则无例外。
    bottom: depthGlow('96, 78, 168', 'dark'),
    // 左侧金晕：把金色铺到左边栏上，并让左栏与对话列的接缝一带出现金色渐变。
    // 用「锚在视口左上角」的椭圆（而不是按左栏宽度定位）——官方没把左栏宽度暴露成
    // CSS 变量（SidebarRoot 是 inline width + hashed 类名），锚左上角无需知道接缝在哪，
    // 且左栏宽度在 264–420px 之间变化时观感都成立。
    left: 'rgba(232, 162, 74, .11)',
    grain: true,
  }),
  crimson: Object.freeze({
    available: true,
    // 底色色相跨度 5（violet 是 6）—— 真机先反馈红/绿偏夸张压到 4，再反馈「压过了」，
    // 故回到中间档。三通道和仍是 36，所以亮度与 violet 严格相等，正文对比度不变。
    base: '#0f0a0b',
    sidebarFill: '#191415',
    // 本色：饱和度向 violet 那档收（原 rgb(150,52,84) 的 S≈.49 偏夸张，压到 .37 又过头，
    // 取中间 S≈.43），只保留 crimson 的色相。
    tint: '144, 58, 86',
    top: 'rgba(232, 162, 74, .09)',
    bottom: depthGlow('144, 58, 86', 'dark'),
    left: 'rgba(232, 162, 74, .11)',
    grain: true,
  }),
  forest: Object.freeze({
    available: true,
    // 同上：色相跨度回到 5（绿为最高通道，蓝略高于红，留一点冷调）
    base: '#0a0f0b',
    sidebarFill: '#141915',
    tint: '55, 118, 92',
    top: 'rgba(232, 162, 74, .09)',
    bottom: depthGlow('55, 118, 92', 'dark'),
    left: 'rgba(232, 162, 74, .11)',
    grain: true,
  }),
})

/**
 * 插件**自己的光色变量**（不是官方 token）：背景层与浮层共用同一套色值。
 *
 * 为什么也要走 token 覆盖层：背景层是插件自有元素，值写在它的内联样式上；但**浮层是官方元素**
 * （portal 到 `body`），读不到那个元素上的变量 —— 只有发到 `body` 上它才继承得到。
 * 走官方 token seam 还顺带解决了两件事：明暗两轴一次给全、卸载时随覆盖层一起回收。
 *
 * `pick` 负责把色调表里的空串（= 不画）翻成 CSS 字面量 —— 空串在自定义属性里非法。
 */
export const LIGHT_TOKENS: readonly Readonly<{
  token: string
  pick: (tone: ToneSpec, scheme: ColorScheme) => string
}>[] = Object.freeze([
  Object.freeze({
    token: TOP_VARIABLE,
    pick: (tone: ToneSpec) => tone.top === '' ? 'transparent' : tone.top,
  }),
  Object.freeze({
    token: BOTTOM_VARIABLE,
    pick: (tone: ToneSpec) => tone.bottom === '' ? 'transparent' : tone.bottom,
  }),
  /**
   * **左侧光晕**：以前**漏在这里**（只在背景层元素上写内联样式）——
   * 背景层是插件自有元素，能读到；但**浮层是 portal 到 `body` 的官方元素**，
   * 读不到那个元素上的变量，于是所有弹层的左光**一直是缺的**。
   * 补进来之后，弹层那条 `radial-gradient(… var(--dsh-theme-tone-left) …)` 才真正有值。
   */
  Object.freeze({
    token: LEFT_VARIABLE,
    pick: (tone: ToneSpec) => tone.left === '' ? 'transparent' : tone.left,
  }),
  Object.freeze({
    token: GRAIN_TILE_VARIABLE,
    pick: (tone: ToneSpec) => tone.grain ? POPUP_GRAIN_DATA_URI : 'none',
  }),
])

/** 某一轴的完整色调表。 */
const TONES_BY_SCHEME: Readonly<Record<ColorScheme, Readonly<Record<string, ToneSpec>>>> = Object.freeze({
  light: LIGHT_TONES,
  dark: DARK_TONES,
})

/** 某一轴的色调 id 顺序。 */
export function toneIdsFor(scheme: ColorScheme): readonly ToneId[] {
  return scheme === 'dark' ? DARK_TONE_IDS : LIGHT_TONE_IDS
}

/** 某一轴的**可取**色调 id（设置行只渲染这些）。 */
export function availableToneIds(scheme: ColorScheme): ToneId[] {
  const tones = TONES_BY_SCHEME[scheme]
  return toneIdsFor(scheme).filter(id => tones[id]?.available === true)
}

/**
 * 取某一轴上某个 id 的色调；id 不属于该轴（脏设置 / 跨轴串味）时回落到该轴默认。
 * @param scheme - 明暗轴。
 * @param id - 候选色调 id。
 * @returns 该轴上安全可用的色调取值。
 */
export function toneFor(scheme: ColorScheme, id: ToneId): ToneSpec {
  const tones = TONES_BY_SCHEME[scheme]
  const direct = tones[id]
  if (direct !== undefined && direct.available) return direct
  const fallbackId = scheme === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
  return tones[fallbackId] ?? LIGHT_TONES.official
}

/**
 * 读某一轴当前选中的色调 id。脏值（不属于该轴、或该轴上仍是留位不可选的色）一律
 * 回落到该轴默认 id —— 与 {@link toneFor} 的回落口径一致，避免「选中态显示 A、实际画 B」。
 * @param settings - 已解析的设置节。
 * @param scheme - 明暗轴。
 * @returns 该轴上可用且被选中的色调 id。
 */
export function toneIdOf(settings: ThemeToneSettings, scheme: ColorScheme): ToneId {
  const candidate = scheme === 'dark' ? settings.darkTone : settings.lightTone
  const spec = candidate === undefined ? undefined : TONES_BY_SCHEME[scheme][candidate]
  if (spec !== undefined && spec.available) return candidate as ToneId
  return scheme === 'dark' ? DEFAULT_SETTINGS.darkTone : DEFAULT_SETTINGS.lightTone
}

/**
 * 某一轴对应的设置字段名 —— 立方块点击要写哪一个字段。
 * @param scheme - 明暗轴。
 * @returns 该轴的字段名。
 */
export function toneFieldFor(scheme: ColorScheme): 'lightTone' | 'darkTone' {
  return scheme === 'dark' ? 'darkTone' : 'lightTone'
}

/** 一侧的模式值对。 */
export interface TokenModes {
  /** 浅色轴下的取值。 */
  light: string
  /** 深色轴下的取值。 */
  dark: string
}

/** 覆盖层的 token 字典（结构兼容官方 `ThemeTokenOverrides`，此处不 import 官方类型以保持本模块零依赖）。 */
export type TokenOverrides = Record<string, TokenModes>

/**
 * 由设置节算出 token 覆盖层。**两个模式都必须给**（官方对裸字符串抛错），
 * 各自取该轴当前选中款 —— 这样用户切轴时颜色已经在位，不需要等重新写入。
 *
 * 覆盖分四族：
 *
 * 1. **官方面**：底色、左栏、抬升面阶梯（{@link SURFACE_TOKENS}）与菜单族（{@link POPUP_TOKENS}）。
 * 2. **官方面内的中性件**：交互态洗染（{@link WASH_TOKENS}）、描边 / 分隔线（{@link BORDER_TOKENS}）、
 *    滚动条（{@link SCROLLBAR_TOKENS}）—— 这三族是「框内元素」那一类，各自保 alpha / 走 color-mix。
 * 3. **插件自己的光色**：顶光 / 底光 / 颗粒贴图（{@link LIGHT_TOKENS}）—— 背景层与浮层都要读，
 *    而浮层是 `body` 的后代、读不到背景层元素上的内联变量，所以这几个值必须发到 `body` 上。
 * 4. **浮层面板底色**：`PANEL_VARIABLE` 单独一份，给自带硬编码底色的弹层兜底。
 * @param settings - 已解析的设置节。
 * @returns 完整覆盖层。
 */
export function tokenOverrides(settings: ThemeToneSettings): TokenOverrides {
  const light = toneFor('light', toneIdOf(settings, 'light'))
  const dark = toneFor('dark', toneIdOf(settings, 'dark'))
  const overrides: TokenOverrides = {
    '--dsw-alias-bg-base': { light: light.base, dark: dark.base },
    '--dsw-specific-sidebar-fill': { light: light.sidebarFill, dark: dark.sidebarFill },
  }
  // 抬升面阶梯（浮层 / 行内面）跟着色调走。
  for (const { token, rung } of SURFACE_TOKENS) {
    overrides[token] = {
      light: surfaceFill(light.tint, 'light', rung),
      dark: surfaceFill(dark.tint, 'dark', rung),
    }
  }
  // 菜单族：**只给颜色**（图层交给 surface.ts 的选择器表，理由见 POPUP_TOKENS）。
  for (const { token, rung } of POPUP_TOKENS) {
    overrides[token] = {
      light: surfaceFill(light.tint, 'light', rung),
      dark: surfaceFill(dark.tint, 'dark', rung),
    }
  }
  // 浅灰内嵌面（代码块 / 三张停靠卡）：**独立通道、独立比例**，取官方自己那一档。
  for (const { token, official } of INSET_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, official.light, INSET_TINT.light),
      dark: rungFill(dark.tint, official.dark, INSET_TINT.dark),
    }
  }
  // 浮层面板底色：单独发一份，给「自带硬编码底色」的弹层兜底（surface.ts 的选择器读它）。
  overrides[PANEL_VARIABLE] = {
    light: panelFill(light, 'light', 'layer3'),
    dark: panelFill(dark, 'dark', 'layer3'),
  }
  // 插件自己的光色：空串在 CSS 里非法，统一换成「什么都不画」的字面量。
  for (const { token, pick } of LIGHT_TOKENS) {
    overrides[token] = { light: pick(light, 'light'), dark: pick(dark, 'dark') }
  }
  // 顶光收束点：两轴几何相同、alpha 差一个量级，收束点必须跟着分开（见 TOP_STOP_BY_SCHEME）。
  overrides[TOP_STOP_VARIABLE] = {
    light: TOP_STOP_BY_SCHEME.light,
    dark: TOP_STOP_BY_SCHEME.dark,
  }
  // 交互态：无 alpha 的面走 color-mix，低 alpha 的洗染只换 RGB、保住 alpha。
  for (const entry of STATE_TOKENS) {
    overrides[entry.token] = {
      light: rungFill(light.tint, entry.light, SURFACE_TINT.light),
      dark: rungFill(dark.tint, entry.dark, SURFACE_TINT.dark),
    }
  }
  for (const { token, official } of [...WASH_TOKENS, ...BORDER_TOKENS]) {
    overrides[token] = {
      light: washFill(light.tint, 'light', official.light),
      dark: washFill(dark.tint, 'dark', official.dark),
    }
  }
  // 滚动条：实心变量引用，走 color-mix（与抬升面同一个比例）。
  for (const { token, light: lightRung, dark: darkRung } of SCROLLBAR_TOKENS) {
    overrides[token] = {
      light: rungFill(light.tint, lightRung, SURFACE_TINT.light),
      dark: rungFill(dark.tint, darkRung, SURFACE_TINT.dark),
    }
  }
  return overrides
}
