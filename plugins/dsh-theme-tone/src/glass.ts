/**
 * 玻璃效果（`backdrop-filter`）：对话顶栏 + 输入框。
 *
 * **为什么单独一个模块**：它和「色调」是两件不同的事（前者是 chrome 拟态，后者是底色/染色），
 * 只是目前共用一个样式表注入点。拆成独立插件时把本模块搬过去即可，不用翻 client half。
 *
 * **浮层不在这里**：菜单 / 对话框走「不透明 + 色调的光与颗粒」那条路（`src/surface.ts`）。
 * 两件事正交 —— 玻璃 = 半透明 + 模糊；抬升面质感 = 实色 + 渐变 + 颗粒。别混。
 *
 * ## 只有「压在滚动内容之上」的元素才配做玻璃
 *
 * 玻璃的本质是**模糊它背后的东西**；背后是纯色，模糊纯色 = 肉眼零变化。DSH 里：
 *
 * * **输入框**（底座 `.composerSeat` 是 `position: sticky; bottom: 0`）—— **真的**压在滚动体之上，
 *   内容从它后面滚过 → 玻璃成立。
 * * **对话顶栏**——官方写它是 `ordinary column chrome above the scrollport (not sticky)`
 *   （`ui-conversation/.../ConversationRoot.module.css:319`）：内容从它**下面过不去**。
 *   所以必须先把它改成浮层（本模块干的事）。
 *
 * ## 输入框：玻璃只做在**卡片**上（一次教训）
 *
 * 玻璃**只做在卡片**（`[data-composer-card]`）—— 那是用户盯着的那个面，形状天然等于卡片。
 *
 * ⚠️ 曾经想让底座也出一份力：在底座上挂一个 `::before { inset: 0 }` 做「渐隐 + 玻璃」。
 * 那是**错的**，owner 一句话点破：「应该改变的是**输入框本身**，不是靠这个**夹层**吧……
 * 否则会有**误伤**啊。」根因：底座是**全宽**的（卡片自己有 `max-width`，两侧留白），
 * `inset: 0` 于是把两侧留白也糊上一层 → 实测颗粒能量从 **2.87** 掉到 **1.57 / 1.88**，
 * 读成两块竖直暗矩形，且**跟着输入框一起变高**。**夹层已撤，不要再加回来。**
 *
 * ## 「官方默认 = 完全不介入」
 *
 * owner 硬约束：「官方默认的都不要动，也有个参考，给用户一个完全不动的选择。」
 * 玻璃是**与色调无关**的功能，但它会改顶栏与输入框的样子 —— 所以本表每条规则都带
 * `body:not([PLAIN_ATTR])` 前缀：选「默认」那一轴时整表不命中，外观与没装插件逐像素一致。
 * 属性由 client 按 `backdropPlan(...).hidden` 打上 / 摘掉（见 constants.ts 的 `PLAIN_ATTR`）。
 */

import { ABOVE_CONTENT_Z_INDEX, GRAIN_ALPHA_VARIABLE, PLAIN_ATTR, RIGHT_PANEL_ATTR, WORKSTART_ATTR } from './constants.js'
import { BACKDROP_GRADIENTS, GRAIN_DATA_URI, GRAIN_OPACITY, GRAIN_OPACITY_LIGHT, dimmedBackdropGradients, grainOverGradients } from './backdrop.js'

/** 顶栏高度（px）。官方把它钉在这个值上，与左栏 38+38 对齐（`ConversationRoot.module.css:37-41`）。 */
export const HEADER_HEIGHT_PX = 76

/*
 * 底座**下半段**那条「不透带」的几何（owner 2026-09-16 定案）。
 *
 * ## 为什么是「很矮 + 不透明」这两条一起
 *
 * owner：「下面这个块，应该是**很矮**才对，**就到输入框下面为止**，然后这个块是**不透明的**」，
 * 以及「在这个基础上，**按照背景原来底部的样子重画**就对了」。
 *
 * 把要求写成公式：设该点的页面色 `P = 底色 + L`，面以 alpha `a` 画 `C`，
 * 合成结果 `a·C + (1−a)·P`。**要让它恒等于周围（看不出来），必须 `C = P`。**
 *
 * | 取法 | 要做到 `C = P` 需要… | 结果 |
 * | :--- | :--- | :--- |
 * | **不透明**（`a = 1`）✅ | **原样画满 P**（底色 + 完整的光 + 颗粒） | 精确成立，没有可调错的比例 |
 * | 半透明（`a < 1`） | 画 `a·P` —— **底色与光都得乘 a** | 漏乘光 = 光翻倍，owner 一眼看出「**相当于两层光了**」 |
 *
 * 所以**不透明反而更简单**：只要照背景画满就行。
 *
 * ⚠️ **这一条只许锚座底、只许很矮**（见 `SEAT_SOLID_PX`）。曾经把「渐隐 + 玻璃」做成
 * 覆盖**整个底座**的 `::before`（`inset: 0`）—— 底座是全宽的（卡片自己有 max-width），
 * 于是**两侧留白也被糊上一层**，读成两块竖直暗矩形，还跟着输入框一起变高。
 * owner：「你这个透明，应该改变的是**输入框本身**，不是靠这个**夹层**吧……否则会有**误伤**啊。」
 * 玻璃归**卡片**（它本来就有自己的 backdrop-filter），底座两侧**什么都不画**。
 */

/** 底座下半段**实色**带的高度（px）：只到卡片下沿为止，盖住下面那条统计行。 */
export const SEAT_SOLID_PX = 36

/**
 * 上面那条实色带**顶端**的过渡高度（px）。
 *
 * 硬切会在带顶留一道边；而这段过渡**落在卡片背后**（卡片不透明到哪里，过渡就藏到哪里），
 * 所以它既不产生缝、也不抢卡片的玻璃。取 10 与 `GLASS_BLUR` 的化开范围同量级。
 */
export const SEAT_SOLID_RAMP_PX = 10

/**
 * **顶栏 / 输入框底座**的模糊 —— 只提饱和不加亮度，避免玻璃面在深色底上发灰。
 *
 * **从 `18px` 收到 `12px`**（owner：「**顶栏和输入框下面的模糊，有点太大了，
 * 会降低玻璃通透感，得往回收收**」）。
 *
 * 大模糊会**抹掉背后内容的形状**，只剩一团平均色 —— 读起来像「磨砂塑料」而不是玻璃。
 * 玻璃的「通透」恰恰来自**还能认出背后的东西在动**（所以才有 `backdrop-filter` 的意义）。
 * 收到 12px：仍足以化开文字与图标、不至于干扰阅读，但保留可辨的形状与流动感。
 */
export const GLASS_BLUR = 'blur(12px) saturate(1.15)'

/**
 * **镜面高光的四条边**（从上开始顺时针）—— 液态玻璃的「玻璃厚度」。
 *
 * owner：「**液态玻璃效果好像不只是上面加亮条**，你可以看看苹果的设计。」
 * Apple 的材质是 `specular highlights, refraction` —— 高光沿玻璃的**整圈边缘**、
 * 且随主光方向强弱不同。四条等亮的边那是**塑料描边**，不是玻璃。
 * 故按「主光来自左上」分配：上 `30%` / 左 `20%` / 右 `12%`（背光）/ 下 `8%`（地面反射）。
 *
 * ## 用在哪：**输入框卡片**（owner 说的「对话框」= 打字那个输入框）
 *
 * ⚠️ **曾经做在了 `[role='dialog']` 模态弹窗上 —— 那是理解错了 owner 的意思**
 * （owner：「就是我输入对话的对话框啊」）。模态弹窗是**内容面**（设置 / 文件 / 归档列表），
 * Apple HIG 明说「**Don't put glass on lists, cards, or media content**」，
 * 做玻璃既违反规范、又让内容变透明（owner 反馈「归档和云端文件的界面还变成透明的了」）。
 * 现在**只有输入框卡片**用它 —— 那正好是 HIG 说的 navigation/control layer。
 *
 * ## 为什么要单独一遍（第五版）：`linear-gradient` 画不出圆角
 *
 * 前四版用 `background-image` 的 `linear-gradient` 画「直线带」，理由是怕 `box-shadow`
 * 压掉官方投影。**但 `linear-gradient` 画不出圆角** —— 官方卡片是 `border-radius: 22px`，
 * 直线带到圆角处被裁断，**光绕不过圆角**（owner：「不太对呢，你看 iphone 这个」）。
 *
 * 改用 `inset` 阴影：它**沿元素自身的圆角轮廓描边**，天然绕圈。
 * 而当初的顾虑也不成立 —— 官方那条是**外**投影（`--dsw-elevation-soft`），
 * 与我们的内阴影**可并存**（多条 `box-shadow` 逗号并列），所以两者都保留。
 *
 * 颜色取官方最亮静态色（`--dsw-static-neutral-bluish-00`）而不是写死白 ——
 * 高光是**物理反射**、与色调无关，走 token 最干净。
 */
/** 镜面高光环的一条（`inset` 阴影）。 */
export interface GlassRing {
  /** 亮在**哪条边**（可读性用；实际靠 x/y 偏移推出来）。 */
  key: 'top' | 'bottom' | 'left' | 'right'
  /** 水平偏移。`inset` 阴影的偏移把亮边推到**对侧**（`x: 1` → 亮在**左**缘）。 */
  x: number
  /** 垂直偏移。`y: 1` → 亮在**上**缘。 */
  y: number
  /** 模糊半径。0 = 锐利窄线（直射高光）；> 0 = 柔和宽晕（焦散）。 */
  blur: number
  /** 扩展半径。 */
  spread: number
  /** 0–1 的不透明度。 */
  alpha: number
}

/**
 * 玻璃边光的**光路模型** —— 光从**左上方**打来（本应用的主光方向）。
 *
 * ## 核心：不是「四边都是光」，而是**两边高光 + 一边阴影 + 底缘焦散**
 *
 * 我连错三版，根因都是同一个思维定势：**把四条边都当成「光」，只调亮度**。
 * owner 最后点破：「**四个边都是光？iphone 那个右边是阴影，左边也不是满光。
 * 咱们还是要按实际场景模拟，咱们的光主要是从左上方打过来的**」。
 *
 * 光从左上方来时，四条边的物理角色**完全不同**：
 *
 * `
 *        光源 ↖
 *   ┌──────────────┐  ← 上缘：正对光源 → **高光**（最强）
 *   │╲            ╱│
 *   │ ╲          ╱ │  ← 左缘：斜射 → **高光**（次强，不是满光）
 *   │  ╲        ╱  │  ← 右缘：**背对光源 → 阴影**（不是光！）
 *   └──────────────┘  ← 下缘：穿过玻璃体 → **焦散**（弱光）
 * `
 *
 * | 边 | 相对光源 | 角色 | 实现 |
 * | :--- | :--- | :--- | :--- |
 * | 上缘 | 正对 | **高光**（最强、最锐） | {@link GLASS_EDGE_TOP}（主光） |
 * | 左缘 | 斜射 | **高光**（次强，带柔） | {@link GLASS_EDGE_LEFT}（主光） |
 * | **右缘** | **背对** | **阴影**（不是光！） | **暗色** —— 见 {@link GLASS_SHADE_RING} |
 * | 下缘 | 穿过玻璃体 | **焦散**（弱光、最柔） | {@link GLASS_SPECULAR_RING} 的 `bottom`（`blur` 最大） |
 *
 * ⚠️ **主光是 `background-image` 的两条细长椭圆**（`GLASS_EDGE_TOP` / `GLASS_EDGE_LEFT`），
 * 不是 `inset` 阴影；{@link GLASS_SPECULAR_RING} 里的 `top` / `bottom` 只是**底光**。
 *
 * ## 为什么「右边是阴影」是关键
 *
 * 一块**有厚度**的玻璃被左上方光照亮时，**背光侧壁**处在自己的阴影里 ——
 * 它比背景**更暗**，而不是更亮。这一条同时提供了两个信息：
 * **① 光的方向（左 vs 右不对称）；② 玻璃的厚度**。
 * 四边都给光的话，光源方向就丢了 —— 那正是「看着假」的根源。
 *
 * ## ⚠️ iPhone 那张图不能照抄
 *
 * owner：「**iphone那个我理解是从正上方打的光，咱们是左上方**」。
 * 所以 iPhone 的左右是**对称**的；**我们必须做出左右不对称** ——
 * 左亮右暗才是「左上方来光」。照抄 iPhone 的对称反而错。
 *
 * **暗色边在 {@link GLASS_SHADE_RING}**（两轴共用，不再只是浅色轴的补丁）。
 */
export const GLASS_SPECULAR_RING: readonly GlassRing[] = Object.freeze([
  // ⚠️ 这些只是**底光**（主光是 background-image 的两条细长椭圆，见 GLASS_EDGE_TOP/LEFT）。
  //
  // 数值经过**四次**修正，其中三次同向、一次反向，**别再单方向推**：
  // * 一开始 blur `0/1/2px` —— owner：「这个玻璃**特别薄**，是不是光边有点**过于锐利**了？」
  //   → blur 全面加大到 `3/4px`（锐利的 0px 边读起来像描边）。
  // * 加大后 owner：「**整体玻璃厚度的感觉稍微往回收一收，也有点弄大了**」
  //   → 收到 `2/3px`：**仍是柔的（不是描边），但不至于厚成一块板**。
  // * 再后 owner：「把输入框的边缘光，**再稍微弄薄一点点**……**稍微收一点点，别收大了**」
  //   → 只把**焦散**（下缘，最柔的那条）`3 → 2.5px`，上缘停在 `2px` 不动
  //   （它已在守卫下界，再收就回到「描边」了）。
  // * ⑳ 后 owner：「最后再把输入框液态玻璃的厚度感**稍微减低一点点**，**边缘高光还是有点厚了**」
  //   → 焦散再收一档 `2.5 → 2.2px`；**上缘仍停在 `2px`**（那个下界是「不是描边」的底线，不许破）。
  //   本轮**主要**靠 {@link GLASS_EDGE_TOP} 的 `ry` 收窄（那才是厚度的主来源），blur 只是配角。
  //
  // 回落幅度总是**小于**当初的加大幅度（3→2→2.5→2.2 而不是回 0）：owner 四次反馈的落点都指向
  // 「**柔但不厚**」，2~2.2px 是那个区间，直接回到 0 就又变回描边了。
  Object.freeze({ key: 'top', x: 0, y: 1, blur: 2, spread: 0, alpha: 0.14 }), // 面：正对光源
  Object.freeze({ key: 'bottom', x: 0, y: -1, blur: 2.2, spread: 0, alpha: 0.09 }), // 焦散：最柔
  // ⚠️ **没有 left** —— 左边由渐变层（GLASS_EDGE_LEFT）单独负责。
  //    两处都写会**叠加**（13% + 13% ≈ 24%），把已经收窄的左缘又拉宽回去 ——
  //    owner 反馈「左边那块是不是有点过了」之后撤掉（底光环只保留上/下两个方向）。
  // ⚠️ **没有 right** —— 右缘是**阴影**，在 GLASS_SHADE_RING 里，不是这里。
])

/**
 * **沿边衰减的边光**（`background-image` 图层）—— 光沿边**渐变**，不是均匀光条。
 *
 * ## 为什么必须换掉「均匀的 `inset` 边」
 *
 * owner 连续三问，全部命中同一个缺陷：
 * 1. 「**左边是满光么？？**」
 * 2. 「**上边应该也不是均匀的光条吧？**」
 * 3. 「现在觉得这个玻璃**特别薄**，是不是光边有点**过于锐利**了？」
 *
 * `inset box-shadow` 的**每条边天生均匀** —— 它只能做「一圈等亮的壁」，
 * 既做不出**沿边衰减**（前两问），也做不出**向内的柔化**（第三问）。
 * 强度不随位置变化，读起来就是**一圈薄描边**。
 *
 * ## 修法：锚在光源角落的**细长椭圆**
 *
 * 一条 `radial-gradient` 用**极扁的椭圆**锚在左上角，就同时给出了两个方向的衰减：
 *
 * ```
 *   ◉ 光源（左上角）
 *   ┌────────────────────┐  ← 上缘：靠左最亮，向右渐暗（横向衰减）
 *   │                    │
 *   │                    │  ← 左缘：靠上最亮，向下渐暗（纵向衰减）
 *   └────────────────────┘
 * ```
 *
 * * **横向**（沿上边向右）：离光源越远越暗 —— 椭圆横向半径 `110%` 覆盖整条边，
 *   亮度按距离自然衰减；
 * * **纵向**（从上边往内）：椭圆纵向半径 `5%` 很扁 —— 光**柔柔地往内淡出**，
 *   而不是一条 3px 硬边（这正是「薄 / 锐利」的解药）。
 *
 * 同理再一条**竖向**扁椭圆覆盖左边。两条都锚在**同一个角**，所以**左上角最亮**
 * （两层的叠加），向右、向下各自衰减 —— 这就是「光从左上方来」。
 *
 * **为什么不用 `background-size` 切横条**：那样切出来的条在垂直方向仍是**硬边界**
 * （只是把「均匀的竖条」换成「均匀的横条」），第三问的「薄 / 锐利」解决不了。
 * 细长椭圆的衰减是**两个方向都连续**的。
 */
export interface GlassEdgeFade {
  /** 横向半径（占元素宽度的比例；`>1` 表示铺满整条边）。 */
  rx: number
  /** 纵向半径（占元素高度的比例）。 */
  ry: number
  /** 中心处的 0–1 不透明度。 */
  alpha: number
  /** 衰减到透明的停止点（占半径的比例）。大 = 收得晚、光更长。 */
  stop: number
}

/**
 * 上缘的光（横向长、纵向极扁）—— 沿上边向右衰减，同时往内柔化。
 *
 * `ry` 是**厚度感的主要来源**（往内柔化带的宽度）。它跟着 owner 的**四次**反馈走：
 *
 * | 轮次 | owner 原话 | `ry` | 实测可见厚度 |
 * | :--- | :--- | :--- | :--- |
 * | ① | 「这个玻璃**特别薄**，是不是光边**过于锐利**了」 | `0.06` | —— |
 * | ② | 「整体玻璃厚度的感觉稍微往回收一收，也有点弄大了」 | `0.045` | —— |
 * | ③ | 「把输入框的边缘光，**再稍微弄薄一点点**……**别收大了**」 | `0.040` | 4px |
 * | ④ | 「厚度感**稍微减低一点点**，**边缘高光还是有点厚了**」 | **`0.030`**（本次） | **3px** |
 *
 * ## ⚠️ 为什么 ④ 这一步**必须跨过像素台阶**（量出来的，别再凭感觉小步挪）
 *
 * 本机无头复现逐像素量了上缘亮度剖面（`ry 0.040` → `0.034` → `0.030` → `0.020`）：
 *
 * | `ry` | 第0px | 第1px | 第2px | 第3px | 可见厚度 |
 * | :--- | :--- | :--- | :--- | :--- | :--- |
 * | `0.040` | 93.3 | 77.0 | 61.0 | **48.3** | 4px |
 * | `0.034` | 91.3 | 74.3 | 56.0 | **41.0** | 4px |
 * | `0.030` | 91.5 | 73.1 | 51.2 | **36.0** | **3px** |
 * | `0.020` | 90.5 | 60.9 | 37.0 | 36.0 | 2px |
 *
 * **本轮先试的** `0.040 → 0.034`（−15%）**只改了第 3 个像素的亮度**、厚度仍是 4px ——
 * 拿到量测数据才发现那一步**等于没做**；owner 说的「**还是**有点厚」正是这个原因：
 * **小步挪 `ry` 会先改亮度、后改厚度**，得跨过那个像素台阶才看得见。
 * `0.040 → 0.030`（−25%）才把可见厚度从 **4px 压到 3px**，是可以被眼睛确认的一档。
 *
 * 卡片高约 130px 时 `0.030` ≈ **3.9px** 的椭圆纵径（× `stop 0.60` ⇒ 可见带 ≈ **2.3px**）。
 * **它与 `GLASS_SPECULAR_RING.bottom.blur`（底光焦散）一起决定「看起来多厚」，
 * 调一个要想到另一个**；上界的守卫是 `ry ≤ 0.05`（再大 owner 会说过厚），
 * **下界是 `>= 0.03`** —— 那是**量出来的描边阈值**：`0.020` 那档可见带只剩 2px，
 * 实测已贴到「过于锐利」的观感（owner 第①轮明确否过）。别只朝一个方向推。
 *
 * ⚠️ **别用压 alpha 来代替收宽度**：owner 四次说的都是「**薄**」（宽度），不是「**淡**」（亮度）——
 * 第 ③ 轮已明确记过这条口径，α 与阴影浓度至今未动，收亮度会让光源方向丢掉。
 */
export const GLASS_EDGE_TOP: GlassEdgeFade = Object.freeze({
  rx: 1.1, // 横向铺满整条上边
  ry: 0.03, // 纵向更扁 → 往内的柔化带（厚度感主来源；0.040 → 0.030，owner 第④轮）
  alpha: 0.28,
  stop: 0.60,
})

/**
 * 左缘的光（纵向长、横向**很窄**）—— 沿左边向下衰减，同时往内柔化。
 *
 * ## 比上缘明显弱、明显窄（owner：「**左边那块是不是有点过了……**」）
 *
 * 第一版给了 `rx 5% / α 26%`，实测在真机上是一条**约 40px 宽、从上亮到下**的亮带
 * （横向半径 5% × 1320px 宽 = 66px，衰减到 62% 处仍有 ~40px），而且左上角两层叠加到
 * `1−(1−.30)(1−.14) ≈ 40%` 的白 —— **过亮**。
 *
 * 物理上侧壁的光只是「**透过玻璃看到厚度**」，应当是**窄而暗的一条**，
 * 而不是一大片亮区。所以：横向半径砍到 `1.6%`（≈ 21px，衰减后 ~13px），
 * alpha 降到上缘的**一半以下**。
 *
 * **判据**：左缘 alpha 必须明显低于上缘（不是「略低」），且横向半径必须小 ——
 * 否则它就从「侧壁光」变成「左侧那一块亮」。
 */
export const GLASS_EDGE_LEFT: GlassEdgeFade = Object.freeze({
  rx: 0.016, // 横向很窄 → 只贴着左边一条（不是一大片）
  ry: 1.1, // 纵向铺满
  alpha: 0.12, // 不到上缘的一半：侧壁只是「看到厚度」
  stop: 0.55, // 比上缘收得早一点，让下端更快消失
})




/**
 * **阴影侧**（右缘）—— 玻璃**背光的那面壁**，它比背景**更暗**，不是更亮。
 *
 * 这是 owner 点破的那条：「**iphone 那个右边是阴影**」。
 * 有厚度的玻璃被左上方光照亮时，背光侧壁处在**自己的阴影**里。
 * 它同时给出两个信息：**① 光的方向（左亮右暗）；② 玻璃的厚度**。
 *
 * ## 两轴共用（不再是浅色轴的补丁）
 *
 * 早先这里是「浅色轴的补丁」（因为近白面上白高光看不见）。**那个定位是错的** ——
 * 阴影侧与明暗轴无关：它是**光路**的产物。深浅两轴都需要它，
 * 差别只在浓度（见 {@link SHADE_ALPHA}）。
 */
export const GLASS_SHADE_RING: readonly GlassRing[] = Object.freeze([
  Object.freeze({ key: 'right', x: -1, y: 0, blur: 2, spread: 0, alpha: 0.10 }), // 背光侧壁：阴影
])

/**
 * 阴影侧在两个轴上的浓度。
 *
 * 浅色轴 `10%`（近白底上需要它来立形）；深色轴 `6%`（暗底上重了会发脏）。
 *
 * 阴影也是**厚度感**的来源之一（背光壁越明显，玻璃越"厚"）—— owner
 * 「整体玻璃厚度的感觉稍微往回收一收」时，这里**没动**：它的作用是**方向**（左亮右暗），
 * 厚度感主要由 {@link GLASS_EDGE_TOP} 的 `ry` 与底光的 `blur` 表达。
 * **要再收厚度就先动那两个，别动这个** —— 阴影弱到看不见，光源方向就丢了。
 */
export const SHADE_ALPHA: Readonly<Record<'light' | 'dark', number>> = Object.freeze({
  light: 0.10,
  dark: 0.06,
})

/**
 * 把一组环拼成 `box-shadow` 的 `inset` 串。
 *
 * 每条 = `inset <x>px <y>px <blur>px <spread>px <color>`。
 * 与旧的 `linear-gradient` 版本最大的不同：**阴影沿元素自身的 `border-radius` 走**，
 * 所以光会**绕过圆角连成一圈**（那正是 iPhone 图里最显眼的特征）。
 * @param ring - 一组环（{@link GLASS_SPECULAR_RING} / {@link GLASS_SHADE_RING}）。
 * @param color - 光线颜色（通常传官方 token 变量）。
 * @returns 可直接接到 `box-shadow` 后面的 `inset …` 串。
 */
const rimShadows = (ring: readonly GlassRing[], color: string): string =>
  ring
    .map(({ x, y, blur, spread, alpha }) =>
      `inset ${x}px ${y}px ${blur}px ${spread}px color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`,
    )
    .join(',\n    ')

const LIGHT_TINT = 'var(--dsw-static-neutral-bluish-00)' // 官方最亮静态色
const SHADE_TINT = 'var(--dsw-static-neutral-bluish-1000)' // 官方最深静态色

/**
 * 镜面高光的 `inset` 阴影串 —— **接到官方那条外投影之后**（用逗号并列，两者都保留）。
 *
 * 官方卡片自带 `box-shadow: var(--dsw-elevation-soft)`（外投影，`InputBar.module.css:57`），
 * 所以卡片规则里要写成 `box-shadow: var(--dsw-elevation-soft), <我们这几条 inset>` ——
 * **不能**只用 `!important` 覆盖，那会把官方的抬升感一起抹掉。
 */
export const GLASS_SPECULAR = rimShadows(GLASS_SPECULAR_RING, LIGHT_TINT)

/**
 * 完整边光串（**两轴共用**）：**阴影侧在前、高光在后**。
 *
 * CSS `box-shadow` **第一条在最上层**，所以阴影写在前面才会盖住同位置的亮边 ——
 * 右缘既不在 {@link GLASS_SPECULAR_RING} 里，这个顺序其实不是必需的，
 * 但保持一致（阴影在上）更符合直觉。
 * @param scheme - 明暗轴（决定阴影浓度，见 {@link SHADE_ALPHA}）。
 * @returns 可接到 `box-shadow` 之后的串。
 */
export const rimFor = (scheme: 'light' | 'dark'): string => {
  const ring = GLASS_SHADE_RING.map(e => ({ ...e, alpha: SHADE_ALPHA[scheme] }))
  return `${rimShadows(ring, SHADE_TINT)},\n    ${GLASS_SPECULAR}`
}

/**
 * 把一条「沿边衰减」的光拼成 `radial-gradient` 图层。
 *
 * 两条光**都锚在左上角**（光源处），只是椭圆的长轴方向不同 —— 所以不需要 axis 参数，
 * 形状全由 {@link GlassEdgeFade} 的 `rx` / `ry` 决定。
 * @param edge - 一条边的衰减参数。
 * @param color - 光线颜色（官方最亮静态色）。
 * @returns 单个 `radial-gradient(...)` 图层。
 */
const edgeFade = (edge: GlassEdgeFade, color: string): string => {
  // 百分比保留两位小数 —— 直接用 `rx * 100` 会漏出浮点噪声（`1.1 * 100 = 110.00000000000001`）。
  // ⚠️ 这个**保留小数**的换算与模块级 {@link pct}（取整）不同，故单独命名，
  // 不要合并：那个取整是给 alpha 用的，这里给的是椭圆半径，进位规则一改就会动几何。
  const pctExact = (v: number): string => `${Number((v * 100).toFixed(2))}%`
  const a = Math.round(edge.alpha * 100)
  const stop = Math.round(edge.stop * 100)
  return `radial-gradient(ellipse ${pctExact(edge.rx)} ${pctExact(edge.ry)} at 0% 0%, `
    + `color-mix(in srgb, ${color} ${a}%, transparent) 0%, transparent ${stop}%)`
}

/**
 * 边光的 `background-image` 图层（**两轴共用**）：上缘一条、左缘一条。
 *
 * 两者都锚在**左上角**，所以左上角最亮（两条叠加），向右、向下各自衰减 ——
 * 这就是「光从左上方来」。详见 {@link GlassEdgeFade} 里为什么不能用均匀的 inset 边。
 * @param scheme - 明暗轴（阴影浓度不同，但**光**这一侧两轴同值）。
 * @returns 可写进 `background-image` 的多图层串。
 */
export const edgeFadeLayers = (scheme: 'light' | 'dark'): string => {
  void scheme // 光这一侧两轴同值；参数留着是为了将来按轴调光（暗底上光该更强）
  return [
    edgeFade(GLASS_EDGE_TOP, LIGHT_TINT),
    edgeFade(GLASS_EDGE_LEFT, LIGHT_TINT),
  ].join(',\n    ')
}

/**
 * **输入框卡片**的模糊 —— 现为 `10px`（**不与顶栏同档**：顶栏是 `12px`），只把提饱和抬高一档。
 *
 * 早期曾刻意与顶栏对齐（都是 12px），出发点是「卡片与顶栏像同一块玻璃的两个部件，
 * 模糊不一致会在交界处露断层」。**那条推理已不成立**：两者在版面上永不相邻（顶栏在最上、
 * 卡片在最下，中间隔着整个对话区），没有交界可露；真正决定通透感的是卡片自身。
 * 故按卡片自己的实测阶梯单独取值（见下），不再受顶栏档位约束。
 *
 * 通透感靠**提饱和**补（`1.45`），不靠加大模糊。
 *
 * ## 2026-09-18：再收到 `10px`（owner 要「再轻一点、更通透」）
 *
 * owner：「让输入框的**背透模糊再轻一点**，让输入框显得**再通透一些**」。
 * 真机实测（条纹探针铺在卡片背后，取卡片内部条纹可见度 —— 越大越通透）：
 *
 * | blur / 填充 | 条纹可见度 |
 * | :--- | ---: |
 * | 12px / 62%（改前） | 76 |
 * | **10px / 58%（本值）** | **80** |
 * | 8px / 52% | 87 |
 * | 6px / 46% | 103 |
 *
 * 选 `10px` 而不是更低的档：模糊与填充**两个都在压通透**，同向调会叠加；
 * `10px` 这一档变化看得见、又不会让背后文字「化不开」而失去玻璃感
 * （玻璃的通透恰恰来自**还能认出背后有东西**，全清了就成一块平板）。
 */
export const GLASS_CARD_BLUR = 'blur(10px) saturate(1.45)'

/** 顶栏底的透出比例（只覆盖一层，无叠加问题）。 */
export const GLASS_HEADER_ALPHA = 0.7

/**
 * 输入框**卡片**的填充比例。它**是**用户盯着的那块玻璃（抬升面里唯一的玻璃面）。
 *
 * 早先底座上还挂着一层 40% 填充，卡片要跟它合成，故当时按「合成不透明度」定值；
 * 那个夹层已被 owner 否掉（会糊到两侧留白上），**现在卡片这一层就是最终不透明度**，
 * 直接按「看得见背后模糊」取值即可。
 *
 * **2026-09-18 由 `0.62` 收到 `0.58`**（owner 要更通透，见 {@link GLASS_CARD_BLUR} 的阶梯表）。
 * 与模糊**同向**：填充越淡、背后内容越亮，两处一起收，通透感才出得来。
 */
export const GLASS_CARD_ALPHA = 0.58

/**
 * **输入框卡片的悬浮投影** —— 叠在官方那条之上，做出「浮在背景上」的托起感。
 *
 * ## 为什么需要它：官方那条淡到几乎不可见
 *
 * 官方卡片自带 `box-shadow: var(--dsw-elevation-soft)`（`InputBar.module.css:57`），
 * 真机实测其值 ≈ `0 4px 16px #00000008, 0 0 24px #00000008` ——
 * **只有 3% 黑**，在这套带色调光的背景上读不出抬升。owner：
 * 「输入框本身在背景上**增加一些悬浮感**，我理解是得加一些阴影吧？」—— 理解正确。
 *
 * ## 为什么是「叠加」而不是「替换」
 *
 * 官方的 `--dsw-elevation-soft` 是**外**投影，本插件的边光是 `inset`，
 * 两者可并存（`box-shadow` 逗号并列）。保留官方那条，只在它后面接本常量 ——
 * 既拿到悬浮感，又不抹掉官方的抬升语义（`surface.ts` 记过「不能只用 !important 覆盖」）。
 *
 * ## ⚠️ 已排除的风险：自投影不会透出来压暗卡片
 *
 * 卡片是**半透明**的，影子若落在自己包围盒内，会被 `backdrop-filter` 采进背景、
 * 反而把卡片自己压暗。**实测不存在**：偏移是 `0 4px`（向下），影子落在卡外 ——
 * 四档候选下卡片内部亮度**恒为 80.1 不变**，只有卡片下缘变暗（那正是要的效果）。
 *
 * ## 2026-09-18 二次调整：**往回收一格**（owner「有点重了，阴影有点大」）
 *
 * 首版取的是候选里的 `soft`（`.30 / 28px / y10`），owner 真机看过之后判断偏重，
 * 遂整体回收：**不透明度、模糊半径、y 偏移三项一起减**。
 *
 * 真机阶梯实测（卡片正下方影子带亮度，**越高 = 影子越淡**）：
 *
 * | 档 | 影子带亮度 | 相对首版 |
 * | :--- | ---: | ---: |
 * | 首版 `.30 / 28px / y10` | 216.8 | — |
 * | 回收一格 `.24 / 22px / y8` | 228.4 | +11.5 |
 * | **本值 `.21 / 20px / y7`** | **233.0** | **+16.2** |
 * | `.18 / 18px / y6` | 236.2 | +19.4 |
 * | `.12 / 14px / y4` | 243.1 | +26.3 |
 * | `.06 / 10px / y3`（几乎无） | 246.6 | +29.8 |
 *
 * ## 2026-09-18 三次调整：**再收半步**
 *
 * 回收一格之后 owner 仍觉偏重（「输入框的悬浮，**再收一点点**」），再收**半步**：
 * 这一轮刻意走得**比上一轮更细**（上一轮 +11.5，本轮只 +4.7），因为诉求是「一点点」。
 *
 * 半步的可测落点：最实那一处（y450，紧贴卡片下缘）**194.2 → 203.2**，
 * 影子带均值 228.4 → **233.0**。
 *
 * **每次都三项一起收**（不透明度 / 模糊半径 / y 偏移）—— 只降 alpha 会让影子
 * 「淡但仍在远处糊一片」，只减 blur 又会「小而硬」；三项同收，影子才是整体**变小变淡**。
 *
 * ⚠️ **这一档已经接近「收没了」的边界**（下限由测试钉在 alpha ≥ 0.15）。
 * 若还要再收，应当**重新确认是否真的需要悬浮感** —— 悬浮感本身是 owner 明确要过的
 * （「增加一些悬浮感」），一路收到 0 就退回官方那种**读不出抬升**的状态，
 * 那时该做的是**去掉这条投影**并明确记录，而不是把 alpha 磨到 0.1 以下。
 *
 * ⚠️ 调这条**只许动 `GLASS_CARD_LIFT` 这一个常量**：`GLASS_SPECULAR_RING` 那几条 `inset`
 * 是**边光**（玻璃厚度），与悬浮投影是两件事，别混。
 */
export const GLASS_CARD_LIFT = '0 7px 20px rgba(0, 0, 0, 0.21),\n    0 2px 5px rgba(0, 0, 0, 0.17)'

/**
 * 玻璃卡片要覆盖的**相位** —— `active`（对话中）+ `hero`（新建会话首页）。
 *
 * ## 为什么必须有 `hero`（owner 报的 bug）
 *
 * owner：「**新会话首页的输入框，也得适配下**」（配图：首页那张卡是**不透明灰板**）。
 *
 * 根因：官方 `data-phase` 有**三档**（`ConversationRoot.tsx:355`：
 * `settling ? 'settling' : hero ? 'hero' : 'active'`），而首页走的是 **`hero`**。
 * 本模块原先每条规则都写死 `[data-phase='active']`，于是首页**一条都不命中** ——
 * 卡片留着官方的 `background: var(--dsw-specific-input-major)`（不透明实色，
 * `InputBar.module.css:56`）→ 就是那张「纯色灰板」。
 *
 * ⚠️ **只许放宽卡片这条**，别顺手把别的一起放开：
 * * 底座 `::after`（不透带）**必须留在 active**：它锚 `bottom: 0` 绝对定位，
 *   而底座**只有 active 才是定位元素**（官方 sticky 写在 `.root[data-phase='active']
 *   .composerSeat` 里）。hero 下底座是 **static** → 那条带子会改锚到最近的定位祖先
 *   （`.root`），在**整个对话区底部**横着画一条实色带。
 * * 顶栏浮层 / 滚区补 76px / 拖拽条同理都是 active 专有（hero 下顶栏本就 `display: none`，
 *   补 76px 会把正文顶下去；hero 也没有拖拽条 —— `ConversationRoot.tsx:382`）。
 *
 * `settling` 不在列内：官方把底座设成 `visibility: hidden`（`ConversationRoot.module.css:474`），
 * 卡片随之不可见，画不画都一样（少一个相位少一份意外）。
 */
export const GLASS_CARD_PHASES: readonly string[] = Object.freeze(['active', 'hero'])

/**
 * 把相位清单拼成选择器片段：单相位 → `[data-phase='x']`；多相位 → `:is(a, b)`。
 *
 * 用 `:is()` 而不是并列选择器，是为了**不改变特异度**：`:is()` 取参数中最高者，
 * 两个参数都是 `(0,1,0)` 的属性选择器，所以整条规则的特异度与原先完全一致
 * （底座那条注释记着特异度算错的代价，这里不再冒险）。
 * @param phases - 相位名清单（如 `['active', 'hero']`）。
 * @returns 可直接拼进选择器的片段。
 */
export function phaseGate(phases: readonly string[]): string {
  const parts = phases.map(phase => `[data-phase='${phase}']`)
  return parts.length === 1 ? parts[0] : `:is(${parts.join(', ')})`
}

/**
 * 0–1 的不透明度 → CSS 百分比字面量（**取整**）。
 *
 * 只给 alpha / 停点用。几何类的百分比（椭圆半径）走 {@link edgeFade} 内的 `pctExact` ——
 * 那里必须保留两位小数，否则 `1.1 * 100` 会漏出浮点噪声。
 */
function pct(alpha: number): string {
  return `${Math.round(alpha * 100)}%`
}

/**
 * 「按背景**原样画满**」的三层配方：不透明底色 + 与背景层同源的**光** + **颗粒**。
 *
 * 座底那条不透带（{@link buildGlassCss} 的 `[data-composer-seat]::after`）与
 * 「缝挡板」（{@link buildSeamCss}）**共用**它 —— 两处的要求完全相同：
 * 逐像素等于周围背景（数学见座底那条注释：面以 alpha `a` 画 `C`，要恒等于页面色 `P`
 * 就必须 `C = P`；取 `a = 1` 时只要原样画满即可，没有可调错的比例）。
 *
 * `background-attachment: fixed` 让百分比按**视口**解析，光才与背景层逐像素对齐。
 * ⚠️ 必须写成**单个** `fixed`：本配方 4 层 background-image，per-layer 值少于层数时
 * 会按顺序循环补齐，「scroll, fixed」会让第 1、3 段渐变退回按元素自身盒子解析。
 * @returns 可直接嵌进规则体的声明串。
 */
function backingPaint(): string {
  return `background-color: var(--dsw-alias-bg-base);
  background-image: ${grainOverGradients()};
  background-attachment: fixed;`
}

/**
 * 玻璃效果样式表文本。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildGlassCss(): string {
  const fill = (token: string, alpha: number): string => `color-mix(in srgb, ${token} ${pct(alpha)}, transparent)`
  return `/* ===== dsh-theme-tone 玻璃效果（顶栏 + 输入框；卸载即随样式表移除） ===== */

/* --- 顶栏：改成浮层，内容才会从它下面滚过 ---
   ⚠️ **0.1.7 起选择器换了目标，别改回去**（owner 真机报「顶栏崩了」的根因）。
   结构对照（两版都核过）：

   | 版本 | 会话槽位产出物挂在哪 | 谁生成盒子 |
   | :--- | :--- | :--- |
   | 0.1.5-rc.2 | conversation.session.header 的产出物**直接是 .root 的子元素** | 槽位产出物自己 |
   | 0.1.7-rc.1 | 嵌在 header[data-slot='conversation.header'] 里；外层 conversation.header 与会话槽位都是 display:contents | **那个 header 元素**（官方 .header 是 grid、min-height 76px） |

   旧写法打的是 [data-slot='conversation.session.header'] 的直接子元素。在 rc.1 上那个槽位是
   display:contents、其子元素是官方 .titleRow —— 于是**标题行被抽成绝对定位浮层**，
   header 自身塌成 10px（实测：40px → 10px），官方顶栏整条崩掉。
   现在改成打**真正生成盒子的那个 header 元素**（由 conversation.header 槽位宿主定位）。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [data-phase='active'] {
  /* ① 定位祖先 */
  position: relative;
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header {
  /* ② 官方顶栏本体：官方 .header 是 grid / min-height 76px / 自带 padding 与下边框 */
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* **必须高于「用户内容层」**（CONTENT_Z_INDEX = 81，见 constants.ts）。
     内容层是正 z-index 的定位元素，会盖掉一切 z-index 更小的层 —— 包括这个顶栏。
     曾经这里是 9（高于拖拽条 8、输入框底座 7、低于菜单 100），
     内容层抬到 81 之后顶栏就被内容盖住了（owner 真机反馈「顶栏盖不住对话内容了」）。
     统一取 ABOVE_CONTENT_Z_INDEX（82）：仍高于 7/8，仍低于菜单 100。 */
  z-index: ${ABOVE_CONTENT_Z_INDEX};
  /* ⚠️ 本体**不承担玻璃**（这里刻意不写 background-color / background-image /
     backdrop-filter）—— 理由见下面 ::before 那条。本体只负责「浮起来」。
     （本段在模板字符串里，注释中**不能出现反引号**。） */
}

/* ②b 玻璃（填充 + 渐变 + 模糊）挂在顶栏的 **::before** 上，不挂顶栏本体。
   owner 2026-09-24 真机报「弹层全透明 / 分区标题带子串色 / 联想对话框也全透明」的根因就在这里：
   带 backdrop-filter（非 none）的元素会成为**它后代的 backdrop root**，同时成为
   position: fixed 后代的**包含块**。而官方弹层大量渲染在顶栏子树里
   （模型选择菜单、顶栏动作区的弹层 —— 我们自己的材质锚点表里就写着
   [data-slot='conversation.session.header.actions'] ul 这条锚点）。
   于是弹层自己的 backdrop-filter: var(--dsw-menu-backdrop-filter)（官方 blur(40px)）
   **只能采样这个子树**，模糊等于失效 —— 只剩半透明底色（深色轴 #30313680），
   背后的对话文字没被模糊、直接可读，也就是「全透明 / 串色」。
   官方深浅两档一直是好的，正因为这两档下本插件的玻璃规则被官方默认门关掉。

   改法：玻璃交给伪元素。伪元素没有后代 ⇒ 不会把任何官方弹层关进它的 root；
   顶栏本体也不再是 backdrop root / 不再是 fixed 后代的包含块 ⇒ 弹层自己的模糊与定位一起恢复。
   顶栏本体已经是 position: absolute + z-index（自成层叠上下文）⇒ 伪元素 z-index: -1
   正好画在「顶栏内容之下、页面内容之上」，观感与改前一致。
   pointer-events: none —— 别让这一层参与命中测试（顶部有条拖动区）。

   **自己画一遍背景层的渐变栈** —— 抬到背景层之上就吃不到那层光了：
   背景层（z-index 80）原本压在顶栏（原 z-index 9）之上，顶光其实是**直接盖在顶栏上**的；
   顶栏为了不被内容盖住抬到 82 之后，光就没了（owner：「怎么顶栏的金光没有了」）。
   background-attachment: fixed 让百分比按**视口**解析 —— 顶栏只有 76px 高，
   同一串 ellipse 80% 45% 若按自身盒子解析会重新缩放成一条硬边带。
   **光必须按顶栏自己的填充 alpha 同步压**（dimmedBackdropGradients(同一个 alpha)）：
   底乘 70%、光却是满的 → 那一片会比周围**亮一截**（owner 对底座那处说的
   「相当于两层光了」是同一个毛病；顶栏是半透明的，同样逃不掉）。
   （本段在模板字符串里，注释中**不能出现反引号**，否则会把字符串截断。） */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-slot='conversation.header'] > header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: ${fill('var(--dsw-alias-bg-base)', GLASS_HEADER_ALPHA)};
  background-image: ${dimmedBackdropGradients(GLASS_HEADER_ALPHA)};
  background-attachment: fixed;
  backdrop-filter: ${GLASS_BLUR};
}
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-conversation-scroll] {
  /* ③ 滚区顶部补出顶栏高度 —— 与浮层是一对，少一个正文首行会被盖住。
     ⚠️ **必须用 border-top，不能用 padding-top**（owner 2026-09-26 报
     「顶栏透明后，右侧滚动条也会跑上去」）：
     滚动条是画在滚动容器的 **padding box** 上的，**padding-top 只推内容、不推它** ——
     于是玻璃档下轨道与滑块仍从 y=0 起画，前 76px 正落在**半透明顶栏下面** ⇒ 透出来。
     官方因为顶栏**在流内**，滚区天然从 y=76 起，滚动条也就从 76 起。

     border-top 同样是「推内容」，但它把 **padding box 整体下移** 76px ⇒
     滚动条与内容一起回到官方位置。真机实测（滑块染不透明橙、只在滚动条那一列扫描）：

     | 写法 | 滚区 clientHeight | 滑块顶端 y | 官方基准 |
     | :--- | ---: | ---: | :--- |
     | 官方默认档（顶栏在流内） | 680 | **78**（= 76 + 官方轨道 2px） | —— |
     | padding-top: 76px（改前） | 756 | **0**（画进顶栏带，透出来） | ✗ |
     | border-top: 76px（本版） | **680** | **78** | ✓ 逐项相同 |

     ⚠️ 前提是 **box-sizing: content-box**（官方 .scrollBody 就是；实测该元素也是）——
     它是 border-box 的话边框会吃掉内容高度。下面的 border 与 box-sizing 两条一起钉住。
     ⚠️ border 是**透明**的：滚区自己的背景仍按 border-box 铺（border 区照旧有底色），
     且那 76px 之上盖着顶栏浮层 ⇒ 观感与改前一致。
     ⚠️ 正文首行位置**不变**（实测两种写法都是相对滚区顶 76px）—— 这条只挪滚动条与
     clientHeight，不挪内容。 */
  border-top: ${HEADER_HEIGHT_PX}px solid transparent;
  box-sizing: content-box;
}
/* --- ④ 拖拽条：把上段裁到顶栏下缘（**恢复官方几何**，不新造基准） ---
   owner 2026-09-24 又报：「左右边宽度拖动条**在顶栏依然穿模**」—— 顶栏浮层化的直接副作用。

   官方 .widthHandle 是 .body 里的 "absolute + top: 0/bottom: 0"，而官方顶栏**在流内**占 76px，
   所以 .body 从 y=76 起、光带天然只画在顶栏下缘以下；本插件把顶栏改成 absolute 浮层后
   .body 从 y=0 起，光带于是**爬进顶栏区**，而顶栏是半透明玻璃 → 那截就"透"出来（穿模）。

   本规则的几何**正是官方那一份**（盒子 [76, 720]），所以：
   * 光带的几何基准没有变 —— 官方那套 "calc(var(pointer-y, 50%) ± 36px)" 照旧按盒子解析，
     盒子回到官方尺寸后，"50%" 兜底值也回到官方语义（光带静止时的位置与官方一致）；
   * hover / 拖拽时官方与 nav-pin 都会写**真实 clientY**（内联样式，优先级高于本规则），
     所以"跟随指针"的行为不受影响（nav-pin 的 6 条纯函数守卫钉着同一公式）。

   ⚠️ 只挂在 "active" 相位：hero/其他相位下官方顶栏本来就在流内，".body" 已从 76 起，
   再压一次会多推 76px（这正是早先删掉这条规则时留下的教训）。
   ⚠️ 与官方默认档无关：**本规则只在顶栏被浮层化的那个状态出现**（色调档 + active），
   官方档下本插件不碰任何几何。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-width-handle] {
  top: ${HEADER_HEIGHT_PX}px;
}

/* --- 输入框底座：只撤掉官方那条实色渐隐带，**玻璃完全由卡片自己承担** ---
   owner 定的架构（推翻本插件早先的「夹层」做法）：
   「你这个透明，应该改变的是**输入框本身**，不是靠这个**夹层**吧……否则会有**误伤**啊。」

   早先的做法：底座上挂一个 ::before（inset: 0），刷 40% 填充 + 模糊来「渐隐 + 玻璃」。
   它的错在于 **inset: 0 覆盖的是整个底座**（卡片 + 两侧留白 + 下方统计行），而底座是
   **全宽**的（卡片自己有 max-width，两侧留白）—— 那两条留白于是也被糊上一层。
   实测（owner 标注截图，排除蓝色标注像素）：周围颗粒能量 **2.87**，两侧留白被压到
   **1.57 / 1.88** → 读成两块**竖直的暗矩形**；又因为 inset: 0 跟着底座走，
   **输入框一变高它跟着变高**（owner：「这个还会根据输入框变高一起变高」）。
   这就是 owner 看到的「还有东西挡着」。

   撤掉夹层后，各层职责回到最简单的分法：
   * **玻璃**归**卡片**（[data-composer-card]，它本来就有自己的 backdrop-filter 与填充）
     —— 形状天然等于卡片的形状，**不会外溢到留白上**；
   * **底座**自己不画（撤掉官方那条实色渐隐 —— 在本插件的色调背景上它会读成一条纯色带）；
   * **卡片下沿到座底**那一小条由 ::after 承担，那才是官方渐隐带真正的职责：
     挡住从卡片下方滚过去的正文（见下一条）。
   * 正文列比卡片**窄**（--dsh-chat-content-width 比卡片少 32px），两侧留白背后
     **没有正文**，所以底座不画填充也不会露出内容。 */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat] {
  /* 官方同位置规则是 .root[data-phase='active'] .composerSeat（0,3,0）。
     **不要在这里写 position** —— 本选择器是 (0,3,1)（多一个 body 元素计数），
     比官方**高**，写什么都会盖掉官方那条。曾经在这写了 position: relative 当「兜底
     定位上下文」，注释以为「sticky 已是定位元素、这行不生效」—— 实际它生效了，
     底座从 sticky 变成 relative，于是**输入框跟着内容滚走了**（owner 真机反馈）。
     底座官方本来就是 sticky（定位元素），::after 的包含块已经成立，无需兜底。 */
  background: none !important;
  backdrop-filter: none;
}

/* --- 底座**下半段**：卡片下沿到座底那一小条，**不透明**，且按背景底部的样子重画 ---
   owner：「下面这个块，应该是很矮才对，**就到输入框下面为止**，然后这个块是**不透明的**」，
   以及「在这个基础上，**按照背景原来底部的样子重画**就对了」。

   为什么这一段必须单独一条规则：
   * 底座本体**已经不画**（background: none，见上一条）—— 挡不住滚过去的正文，
     而这一条正是官方用「36px 以下刷实色」解决的事（官方的职责，不能丢）；
   * 但**不能只刷一个 bg-base**（试过一次，owner：「你看这个底部，明显不对了」）：
     底座在背景层（z 80）**之上**，实色会把那一带的**色调光与颗粒一起盖掉** → 平块。

   为什么"不透明"是关键：设该点页面色 P = 底色 + L，面以 alpha a 画 C，
   合成 a·C + (1−a)·P。**要让它恒等于周围就必须 C = P**。
   * 不透明（a = 1）⇒ 只要**原样画满 P**（底色 + 完整的光 + 颗粒）就精确成立 ✓
   * 半透明（a < 1）⇒ 得画 a·P（底色与光**都**乘 a）—— 漏乘光就是 owner 一眼看出的
     「相当于两层光了」。**所以这里选不透明，把那个坑整个绕开。**

   高度：**只到卡片下沿为止**（很矮），上面那 RAMP 段是过渡、藏在卡片背后。
   background-attachment: fixed 让百分比按**视口**解析，光才与背景层逐像素对齐。
   ⚠️ 必须写成**单个 fixed**：本规则 4 层 background-image，per-layer 值少于层数时
   会**按顺序循环补齐**，「scroll, fixed」会让第 1、3 段渐变退回按元素自身盒子解析。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: ${SEAT_SOLID_PX + SEAT_SOLID_RAMP_PX}px;
  z-index: -1; /* 与 ::before 同层，DOM 次序在后 → 压在上面 */
  pointer-events: none;
  /* 原样画满「这一点本该是什么颜色」：不透明底色 + 完整的光 + 颗粒 */
  ${backingPaint()}
  /* 顶端 ${SEAT_SOLID_RAMP_PX}px 过渡（落在卡片背后，故不可见），下面 ${SEAT_SOLID_PX}px 全实 */
  -webkit-mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_SOLID_RAMP_PX}px);
  mask-image: linear-gradient(180deg, transparent 0px, black ${SEAT_SOLID_RAMP_PX}px);
}

/* --- 输入框卡片：用户盯着的那个面（数据锚点来自 InputBar.tsx:429 的 data-composer-card） ---
   边光按**光路**做，分两层：
   ① background-image 的**两条细长椭圆**（锚左上角）＝ 沿边衰减的光（上缘向右暗、左缘向下暗，
      且都往内柔化）—— 这一层解决「均匀光条」与「薄 / 锐利」；
   ② inset 环 ＝ 一圈连续、绕得过圆角的**底光**（右下角那一带靠它，椭圆到不了）。
   官方那条外投影（--dsw-elevation-soft）**要保留**，故写成「官方 + 我们」并列，不用 !important。

   ⚠️ 相位用 {@link GLASS_CARD_PHASES}（active + hero）—— 首页（hero）也要玻璃，
   否则那张卡会留着官方的**不透明实色**（owner：「新会话首页的输入框，也得适配下」）。
   **只有这两条卡片规则**放宽相位；底座 ::after 等仍死守 active（理由见 GLASS_CARD_PHASES）。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card] {
  /* ⚠️ 卡片本体不承担玻璃（不写 background-color / background-image / backdrop-filter）——
     与顶栏同一条理由：卡片的子树里也渲染官方弹层（官方的输入触发器菜单就以
     closest('[data-composer-card]') 为锚，见 InputBar.tsx），
     本体一带 backdrop-filter 就成了它们的 backdrop root，模糊被关进子树里失效
     （owner 报的「联想对话框也是全透明的」）。
     position: relative 官方 .card 本来就有（写出来是给 ::before 一个包含块）；
     z-index: 0 是为了**自成层叠上下文**，好让 ::before 的 z-index: -1 留在卡内 ——
     它与 z-index: auto 在绘制顺序上等价（都是第 8 步、同按 DOM 次序），观感不变。
     background-color: transparent 是必须的：官方 .card 自己刷的是不透明
     --dsw-specific-input-major，不让位就给玻璃盖死了。 */
  position: relative;
  z-index: 0;
  background-color: transparent;
  background-image: none;
  /* ⚠️ 本体只留**外**投影：官方那条抬升（--dsw-elevation-soft）+ 我们的悬浮（GLASS_CARD_LIFT）。
     **inset 边光（rimFor）不能写在这里** —— 绘制顺序是「元素自己的背景/边框/box-shadow」
     先画，**负 z-index 子层随后盖上去**：::before 那道玻璃会把本体的 inset 环整个埋掉，
     实测就是 owner 2026-09-24 报的「输入框玻璃效果改坏了，边缘光效和之前不同了」。
     所以边光跟着玻璃一起挂到 ::before 上（见下一条）。 */
  box-shadow: var(--dsw-elevation-soft),
    ${GLASS_CARD_LIFT};
}
/* 卡片玻璃本体（填充 + 边光渐变 + **inset 边光** + 模糊）—— 挂 ::before，理由见上面卡片规则内。
   border-radius: inherit 必须写：官方 .card 是 22px 圆角，伪元素不继承它就会画成方角。
   pointer-events: none —— 玻璃层不参与命中测试（卡里有 textarea 与按钮）。
   ⚠️ inset 环必须与填充在**同一层**：box-shadow 的 inset 段画在该元素自己的背景之上、
     内容之下，所以放这里才读得出「玻璃厚度」（放本体就会被这层玻璃埋掉，见上）。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  border-radius: inherit;
  background-color: ${fill('var(--dsw-specific-input-major)', GLASS_CARD_ALPHA)};
  background-image: ${edgeFadeLayers('dark')};
  box-shadow: ${rimFor('dark')};
  backdrop-filter: ${GLASS_CARD_BLUR};
}
/* 浅色轴：同样的光路，只有**阴影浓度**不同（近白底上阴影要更明显才立得住形）。
   注意官方默认门（body:not([PLAIN])）必须写在**最前** —— 有一条守卫按前缀认它。 */
body:not([${PLAIN_ATTR}]):not([data-ds-dark-theme]) ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  background-image: ${edgeFadeLayers('light')};
  box-shadow: ${rimFor('light')};
}

/* --- 未选工作区（待启动态）：**把边界让回官方那条虚线框** ---
   官方在「还没选工作区」时给卡片画一圈虚线圆角框（::after + 内联 SVG 虚线遮罩），
   并**同时**把 --dsw-elevation-stroke-color 设成 transparent —— 即它刻意让虚线成为
   **唯一**的边界。而本插件的玻璃给卡片无条件加了悬浮投影 + 内嵌边光，
   两套边缘语言叠加后「不和谐」（owner 2026-09-20 报，定案：撤我们的、留官方的）。

   撤掉的是**两条与边缘有关**的：
   * 悬浮投影 GLASS_CARD_LIFT（我们加的那段外投影）—— 虚线框已经承担了「立形」；
   * inset 边光 rimFor（镜面 + 暗壁）—— 与虚线并存就是两条边。

   **保留**：官方自己的 --dsw-elevation-soft（那是官方的抬升语义，不归我们管）、
   玻璃本身（填充 + 渐变 + 模糊挂在卡片的 ::before 上，不在本体 —— 见卡片规则内的说明；
   边缘交给官方，玻璃照旧）。

   ⚠️ 判定属性由 client 的**行为探针**打上（见 constants.ts 的 WORKSTART_ATTR：
   那条类名是哈希、语义属性又全被污染，只有读 ::after 的 mask 才认得出）。
   这两条必须放在上面两条**之后** —— 同特异性下靠后者胜出。 */
body:not([${PLAIN_ATTR}])[${WORKSTART_ATTR}] ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card] {
  box-shadow: var(--dsw-elevation-soft);
}
/* ⚠️ 边光与玻璃同在 ::before（2026-09-24 起）—— 待启动态要撤的那条 inset 环也必须打在这里，
   只改本体的话边光会留着，与官方那条虚线框并存（owner 2026-09-20 定案：边缘让给官方）。 */
body:not([${PLAIN_ATTR}])[${WORKSTART_ATTR}] ${phaseGate(GLASS_CARD_PHASES)} [data-composer-seat] [data-composer-card]::before {
  box-shadow: none;
}

/* ===== 右边栏：自己画一遍背景层的光与颗粒 =====
   为什么需要：为了不被抬到 81 的内容层盖住，右边栏被抬到了 82（见 backdrop.ts 的不变式）——
   而背景层在 80，于是它**跑到背景层上面**，吃不到那层色调的光与颗粒。
   所以底色**已经**被 token 染对了、只是缺质感 —— 把背景层那套渐变与颗粒**叠上去**即可
   （与顶栏同一个思路，区别是顶栏半透明、这里在实色底上叠）。
   用 background-image 与 background-color 分层，不碰官方底色本身。

   ⚠️ **0.1.7 起还要管一层「内胆」**（owner 真机报「右边栏完全没适配」）。
   0.1.5 线里右边栏是 SidebarRight.module.css 的 .panel 自己刷不透明底色；
   0.1.7 起右边栏整块改由 **dockkit** 承载，真正刷底色的是它的**内容宿主**
   [data-dockkit-pane]（= dockkit.module.css:168-172 的
   .tabHost:not(.float), .emptyTabHost { background: var(--dsw-alias-bg-base) }）。
   那层是**不透明**的、且是 .panel 的**后代** —— 于是本规则画在 .panel 上的
   渐变与颗粒**整个被它盖掉**，右边栏看着就是一块没有任何色调质感的纯色板。
   修法：把同一套图层**同时**画到内容宿主上（.panel 那条保留 —— 它仍负责面板本体、
   浮动面板与空态这两种不经过 .tabHost 的场景）。
   data-dockkit-pane / data-dockkit-host / data-dockkit-surface 都是官方公开属性
   （TabLayout.tsx:80-90），不碰 hashed 类名。
   （本段在模板字符串里，注释中**不能出现反引号**。）

   已知近似一处（**待 owner 真机判断**）：颗粒用的是**浮层那张贴图**（GRAIN_TILE_VARIABLE，
   强度烘进 SVG、正常合成），而背景层的颗粒是 ::after + 独立 opacity + 深色轴走 screen。
   两者观感不完全相同 —— 深色轴上背景层的颗粒是纯**加亮**（黑像素被 screen 吃掉），
   这里正常合成会同时压暗黑像素，略「脏」一档。要完全对齐就得往官方元素上加伪元素，
   那比叠一层 background-image 侵入得多；且浮层（surface.ts）本来就是这么做的，取**一致**。

   ⚠️ **不能再用 background-attachment: fixed（2026-09-16 第二次修）** ——
   **只要元素或任一祖先带非 none 的 transform，fixed 就会静默改判定位区**：
   百分比不再按**视口**解析，而按**元素自己的盒子**解析（实测**任意深度**成立，到第 6 层仍如此；
   **静态与动态 transform 都会触发**，translateX(0px) 这种看着是空操作的值也算）。
   而官方 .panel 的开关动画恰恰就是 transform（SidebarRight.module.css:36-47：
   translateX(100%) ←→ none，0.3s）—— 滑动中 50% 从「视口中心 640」跳到「面板盒中心 190」，
   顶光/底光**灌进面板**；动画一结束 regime 又翻回来 → 就是 owner 报的「**上下亮度骤增**」
   （静止时没事，所以截不到图）。
   本机无头复现（面板几何完全相同，逐像素与「无面板」参照比对）：
     · 静止（transform: none）  + fixed + at 50% → mad 0.2  （正确）
     · 动画（translateX(0px)）  + fixed + at 50% → mad 26.4 / max 90（错）
   白线探针直接读出定位区：900px 宽面板里 at 50% 落在 **x = 830**（= 380 + 450）
   而不是视口中心 640 —— 定位区确实变成了元素盒。

   ✅ 本版：**完全不用 fixed**，改成「显式视口尺寸的背景盒 + 右对齐」。
   .panel 是 position: absolute; right: 0，承载它的 frame 又是全窗宽
   （AppFrame.module.css:84-88：rightbarCol 是 overflow: visible，不裁切）——
   所以**面板右缘恒等于视口右缘**。于是：
     * 渐变层：把图片盒**显式**写成 100vw × 100vh（不再是 auto，否则盒子宽度会
       在两种 regime 下分别是视口宽 / 元素宽），再 background-position: right top ——
       图片右缘贴元素右缘、宽度又是视口宽 ⇒ 盒子恰好覆盖视口，at 50% 落在视口中心。
       两种 regime **同解**，压根没有可切换的东西。
     * 颗粒层：贴图是自铺瓦片，right 会给它一个图幅大小的相位偏移；写成
       calc(100% - 100vw) 后瓦片相位与背景层**逐像素一致**（自铺贴图对图幅取模恒等）。
   附着用 scroll（初值）**自始至终不变** ⇒ 动画中面板外观是**刚性平移**，连续、无跳变。
   实测：静止态与改前逐像素 **0.0/0**；静止帧与动画首帧 **0.0/0**（交班处无缝）。

   ⚠️ **颗粒必须与背景层"同构"**（owner 真机报「6 个色调背景依然没改好」的那条竖线）：
   背景层是「3 层渐变写在自己身上 + 颗粒走 ::after + opacity + 深色轴 mix-blend-mode: screen」，
   而这里曾经把颗粒当成**第 4 个背景层**（grainOverGradients()）**正常合成** ——
   深色轴上 screen 是纯加法（只加亮、不压暗），正常合成却会同时压暗黑像素，
   两者的**质感不同**，于是右边栏与会话区在交界处差一档 → 一条竖直分界线。
   修法：这里也改成「3 层渐变 + ::after 颗粒」，opacity 与混合模式**逐字对齐背景层**
   （常量直引 GRAIN_OPACITY / GRAIN_OPACITY_LIGHT / GRAIN_DATA_URI，不复制数值）。

   ⚠️ ::after 需要定位上下文，而官方 .tabHost / .emptyTabHost **没有 position**（static）
   —— 故这条 gated 规则同时补 position: relative（不动官方任何几何：grid 项的相对定位
   不改变摆放，只是给伪元素一个包含块）。

   ⚠️ background-size / -position / -repeat 现在是 **3 层**，**必须给足 3 个值** ——
   值少于层数时**会按顺序循环补齐**（本插件栽过：写「scroll, fixed」等于两者交替，
   第 1、3 段渐变退回按元素盒解析）。**不许再退回任何一个 per-layer 属性只给一两个值。**
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}],
body:not([${PLAIN_ATTR}]) [data-dockkit-pane],
body:not([${PLAIN_ATTR}]) [data-dockkit-empty] {
  position: relative;
  background-image: ${BACKDROP_GRADIENTS};
  background-attachment: scroll;
  background-size: 100vw 100vh, 100vw 100vh, 100vw 100vh;
  background-position: right top, right top, right top;
  background-repeat: no-repeat, no-repeat, no-repeat;
}
/* 渐变本身的合成方式也必须同构：深色轴上**背景层整层**是 mix-blend-mode: screen
   （渐变与颗粒都走加法），而面板这里的背景层是**正常合成** ——
   于是同样的渐变在两边亮度不同，交界处又是一条分界线。
   background-blend-mode 让面板自己的背景层与它的 background-color（官方 bg-base，
   与页面底色同一个值）按 screen 混合，等效于背景层与页面底色混合。
   浅色轴背景层用 normal（见 backdrop.ts），故这里不需要浅色规则。
   （本段在模板字符串里，注释中不能出现反引号。） */
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [${RIGHT_PANEL_ATTR}],
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-pane],
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-empty] {
  background-blend-mode: screen, screen, screen;
}
/* 颗粒：与背景层那条 ::after 同构（同贴图、同 opacity、同混合模式）。 */
body:not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body:not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: ${GRAIN_DATA_URI};
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY});
}
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body[data-ds-dark-theme]:not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  mix-blend-mode: screen;
}
body:not([data-ds-dark-theme]):not([${PLAIN_ATTR}]) [data-dockkit-pane]::after,
body:not([data-ds-dark-theme]):not([${PLAIN_ATTR}]) [data-dockkit-empty]::after {
  mix-blend-mode: multiply;
  opacity: var(${GRAIN_ALPHA_VARIABLE}, ${GRAIN_OPACITY_LIGHT});
}

/* ===== 官方那些**吸顶遮罩行**：底色要等于它盖住的内容底 =====
   owner 2026-09-24：「该适配的地方没适配，**think 那条黑框**，渲染是官方黑的遗留」。

   根因：官方给这类吸顶行的底色是 **不透明纯色** var(--dsw-alias-bg-base) ——
   "lcKema_root[data-expanded] [data-open] [data-disclosure-row] { position: sticky; top: 0;
   background: var(--dsw-alias-bg-base) }"（展开的 Think 行吸在滚区顶部，压住滚过去的正文）。
   官方档下 bg-base 就是地面那块纯色，所以**看不出有一条带子**；
   而我们的地面是**渐变光带 + 颗粒**，纯色底一盖上去就显成一条「黑框」。

   修法与顶栏同一套（它就是同一类东西：抬到地面之上、又必须等于地面）：
   **把地面原样重画一遍** —— 同色 + 同渐变 + 同颗粒，且 background-attachment: fixed
   让百分比按视口解析（行的盒子很小，按自身盒子解析会把渐变重新压成硬边带）。
   底色仍是官方自己的 bg-base（已被色调染过），我们只补它拿不到的那层光与颗粒。

   ⚠️ 锚点用官方的 "data-disclosure-row"（公开属性、非哈希类名）——
   "lcKema" 是哈希前缀，仓库红线禁止写。
   ⚠️ **收窄到官方自己加底的那个状态**（"[data-expanded] [data-open]"，逐字对齐官方那条规则）：
   只写 "[data-disclosure-row]" 会把**所有**折叠行都刷上一层底（官方只在展开吸顶时才刷）。
   ⚠️ 只挂色调档 —— 官方默认档下地面本来就是纯色，重画等于没事找事。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body:not([${PLAIN_ATTR}]) [data-expanded] [data-open] [data-disclosure-row] {
  ${backingPaint()}
}

/* 模态弹窗（[role='dialog']）**不做玻璃** —— 它是内容面（设置 / 文件 / 归档列表），
   走 src/surface.ts 的实色抬升面。Apple HIG：「Don't put glass on lists, cards, or media content」。
   曾经把液态玻璃做在了它上面（理解错了 owner 说的「对话框」= 输入框），已撤。
   ⚠️ 本段整块在模板字符串里 —— **注释里不能出现反引号**，否则字符串被截断、后面的方括号会被当成 TS 代码。 */
`
}

/**
 * 「缝挡板」往**圆角缺口**里多伸的高度（px）。
 *
 * 停靠卡是 `border-radius: 12px` 的**圆角矩形**，而底座透明 —— 于是
 * 「圆角弧线以外、卡片包围盒以内」那一小块三角（缺口）会露出背后的正文。
 * owner 真机指认：「todo 的**左下角**能看到吧，露出来一点，**右边**估计也有这个问题。」
 * 白条探针实测：缺口小窗（x 436–442、y 583–585）读数 **250+**（完全透出），
 * 而紧邻的缝区已被挡到 ~35。官方那条底座背衬在不透明段顺手盖住了它，我们撤掉背衬就得自己盖。
 *
 * 取 16 > 12（圆角半径），留 4px 余量：带子往**上面那张卡的底部**与**下面那张卡的顶部**
 * 各伸进这么多 —— 深处被卡片自己的不透明背景盖住，只有缺口那点三角会显示出来。
 * 因此「伸进卡里」**不是**可见的加深，而是把缺口补成背景色。
 */
export const SEAM_NOTCH_PX = 16

/**
 * 「缝挡板」样式表文本 —— 停靠卡与输入框卡之间那条 6px 缝，用**背景原样的不透明带**挡住。
 *
 * ## 这条缝是什么（实测）
 *
 * 官方把停靠卡（待办 / 目标 / 排队）与输入框卡排成一条 flex 列，每两项之间留
 * `--dsh-composer-stack-gap`（6px）。底座本体在本插件里**不画填充**（`background: none`），
 * 于是这 6px 是一条**没有遮挡的窗口**：正文从卡片后面滚过时，卡片上是被玻璃化开的、
 * 在这 6px 里却是**原样清晰**的。真机实测（白条探针钉在缝里）：缝内逐行峰值 **252**
 * （完全透出），而官方同位置 **21**（被它那条「36px 以下实色」的背衬挡住）。
 *
 * ## owner 的选择：A（挡住），不是 B（接上）
 *
 * owner：「要么和官方一样，也用背景色把露出来这条缝给挡上，**要么我们就想对话排队一样，给接上**。」
 * 随后定 A，并给了理由：「**我不想破坏官方这个设定**，而且这么设定从 ui 交互上是有含义的……
 * todo 和 goal 其实是一种提示信息，和输入框有一点间距，也是合理的。」
 * ——即那 6px 间距本身是官方有意的语义，**不许改掉**（B 会把它收成 0）。
 *
 * ## 2026-09-18 复核：B 试过，确实不行
 *
 * 后来 owner 提过「改颜色来区分语义」，据此把三张卡全接上走了一遍；真机复核时 owner 判断
 * 「这么连上感觉确实不对了，尤其是 todo，goal，还有对话排队共存的时候，都连在一起，
 * **表达的意思一下就变了**」，遂整条退回。
 * **根因：颜色与间距干的是两件事** —— 颜色标记**单个东西的身份**，间距标记**分组边界**。
 * 三张全接上后中间没有断点，颜色只能说「这是暗金的」，说不出「从这里起不再是提示信息」。
 * 所以这条挡板必须留着：间距保住语义，挡板负责不让正文从间距里透出来。
 *
 * ## 做法：在缝**下面那个条目**上挂一条 `::before`，向上铺满
 *
 * 复用座底那条**同一个配方**（{@link backingPaint}）——不透明 ⇒ 逐像素等于背景，
 * **静态观感零变化**（实测缝区 mean 0.00 / max 0.0），只是不再透字。
 * 横向铺满条目（实测真实正文压进缝区的可见范围 435–1115，而输入框卡 419–1131、
 * 目标条 926、排队卡 696，都盖得住）。
 *
 * ## 高度：缝间距 + **两头的圆角缺口**（owner 二次指认）
 *
 * 只盖那 6px 缝**不够**：卡片是**圆角**的，圆角弧线以外、包围盒以内那一小块三角
 * 仍然露着背后的正文（owner：「todo 的**左下角**能看到吧，露出来一点」）。
 * 故带子往上下各多伸 {@link SEAM_NOTCH_PX}px —— 深处被卡片自己的不透明背景盖住，
 * 只有缺口那点三角会显示成背景色。**不能改成往输入框卡顶里伸**：那是玻璃，
 * 背衬塞到玻璃背后，那一片就不再透正文了（实测卡片内部会从 113 掉到 ~41）。
 *
 * 挂在「下面那个」而不是「上面那个」：待办卡根元素是 `overflow: hidden`（官方 `lXshSW_root`），
 * 挂在它身上、向下伸出的伪元素会被**裁掉**；挂在下面那个则天然落在缝里。
 * （同理，**卡片自己**没法给自己补缺口 —— 伪元素同样被那个 `overflow` 裁掉。）
 *
 * ## 三条规则各自的**门**（不是无脑全挂）
 *
 * 官方栈内次序是 todo(0) / goal(10) / queue(20)，且 `QueueDock` 自带
 * `margin-bottom: calc(0px - stack-gap - 3px)` —— **自己塞到输入框卡下面**（实测重叠 3px），
 * 所以「排队卡 ↔ 输入框卡」之间**本来就没有缝**；而无停靠卡时输入框卡就是第一项、上方也没有缝。
 * **无条件挂会在这两种情形下把带子画到底座外（盖住正文）**，逐条给了门：
 *
 * | 缝 | 挂在谁身上 | 门 | 圆角缺口 |
 * | :--- | :--- | :--- | :--- |
 * | 待办 ↔ 目标 | 目标条 wrapper | 前面有 todo（兄弟选择器 `~`） | 两头都补（两张都是不透明卡） |
 * | 目标 / 待办 ↔ 排队 | 排队卡 wrapper | 前面有 todo 或 goal | 两头都补 |
 * | 最后一张 ↔ 输入框卡 | 输入框卡的**父元素** | 有 todo 或 goal，**且没有 queue** | 只补上面那张（下面那张是玻璃） |
 *
 * 后两条用的是 `:has()`（「底座里有没有那张卡」只能这么问）。两个 wrapper 官方是
 * `position: static`，`bottom: 100%` 需要它们当包含块，故补一条 `position: relative`
 * （无偏移、不改布局；已核这两个 wrapper 的子树里没有依赖「座位」当包含块的绝对定位后代 ——
 * 唯一那条 `_7yHdaG_panel:after` 挂在 `.panel` 自己身上，而 `.panel` 本来就是 relative）。
 *
 * ⚠️ **最后一条挂的是卡的父元素，不是卡自己**：卡片带 `backdrop-filter` ⇒ 自成层叠上下文
 * ⇒ 挂在它身上的伪元素（哪怕 `z-index: -1`）会画在**停靠卡之上**，补缺口那 16px 会把
 * 待办卡的底边涂成背景色（实测卡底 16px 从 ~52 掉到 ~25）。父元素是普通盒、不成层叠上下文
 * ⇒ 伪元素落回**座位**的层叠上下文，与另外两条一样待在停靠卡背后。
 * 门挂在**座位**上、宿主是它里面的父元素，两者之间必须有**后代组合符** ——
 * 写成 `[data-composer-seat]:has(> [data-composer-card])` 会把宿主变成座位自己（缝反而漏）。
 *
 * 相位门与座底那条**一致**（只 active）：hero 下底座不是 sticky、官方那条背衬也没有，
 * 这里跟着不介入，免得在同一处留下半截带子（hero 的栈间距还是 8px，会正好差 2px）。
 *
 * ⚠️ **本表故意与另外两张表分开**：玻璃表有一条守卫「不许出现 `:has()`」（它只该锚在
 * 输入框 / 顶栏上），surface 表有一条守卫「不许出现 `data-phase`」——而本表两条都要用。
 * 三张表各守一条底线，别为了少一个 `<style>` 把它们合并。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildSeamCss(): string {
  /** 三条缝的公共门：官方默认让路 + 只 active。 */
  const gate = `body:not([${PLAIN_ATTR}]) [data-phase='active'] [data-composer-seat]`
  /**
   * 缝**下面那个条目**的锚点 → 铺一条不透明带。
   * @param selector - 带子的宿主（＝缝**下面**那个条目）。
   * @param bothNotches - 是否连带上、下**两张卡**的圆角缺口一起盖（见 {@link SEAM_NOTCH_PX}）。
   *   停靠卡之间与「停靠卡↔输入框卡」取法不同：前者两张都是不透明卡，两边都盖；
   *   后者下面那张是**玻璃**，往它顶里伸会把背衬塞到玻璃背后（玻璃那片就不再透正文了），故只往上盖。
   * @returns 一条完整的规则文本。
   */
  const band = (selector: string, bothNotches: boolean): string => {
    const height = bothNotches
      ? `calc(var(--dsh-composer-stack-gap, 6px) + ${2 * SEAM_NOTCH_PX}px)`
      : `calc(var(--dsh-composer-stack-gap, 6px) + ${SEAM_NOTCH_PX}px)`
    const bottom = bothNotches ? `calc(100% - ${SEAM_NOTCH_PX}px)` : '100%'
    return `${selector}::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: ${bottom};
  height: ${height};
  z-index: -1;
  pointer-events: none;
  ${backingPaint()}
}`
  }
  /** 官方那两个 wrapper 是 static，补成包含块（无偏移，不改布局）。 */
  const host = (selector: string): string => `${selector} {
  position: relative;
}`
  const goalBand = `${gate} [data-testid='todo-panel'] ~ [data-goal-bar]`
  const queueBand = `${gate} :is([data-testid='todo-panel'], [data-goal-bar]) ~ [data-queue-dock]`
  const cardBand = `${gate}:has([data-testid='todo-panel'], [data-goal-bar]):not(:has([data-queue-dock])) :has(> [data-composer-card])`
  return `/* ===== dsh-theme-tone 缝挡板（停靠卡与输入框卡之间的 6px 缝；详见本函数注释） ===== */
${host(goalBand)}
${band(goalBand, true)}
${host(queueBand)}
${band(queueBand, true)}
${host(cardBand)}
${band(cardBand, false)}
`
}
