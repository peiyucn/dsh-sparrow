# 06 · 官方运行扫光带 — dsh-theme-tone

> **做法：照我们自己的背景画满 + mask 乘 0.6**。
> 官方那条扫光带画的是「自己的背景 × 60%」，而**我们的背景是插件画出来的复合结果**，
> 所以只能**照自己的地面画**，不能去猜官方那支颜色等价于什么。
>
> ⚠️ **锚点必须同时带 `data-variant` 或 `data-tool`**（只有官方那 5 处具备）——
> 用通用属性（`data-state` / `_row` 后缀）当判据会误伤官方其它带 `::after` 的元素
> （分隔线 / 描边 / 拖拽柄 / 展开箭头…），把那一片刷成不透明色块。见第 5 节。

## 1) 它是什么（双向查证）

先说清楚**不是什么**：

| 候选 | 结论 | 依据 |
| :--- | :--- | :--- |
| 插件画的 | ❌ 不是 | 三个样式模块里没有 `outline` / 焦点环 / 关键帧 |
| 那圈**粗蓝方框** | ❌ 另一个东西 | 官方运行态**没有任何边框**；最可能是**浏览器焦点环**（官方 `DisclosureRow` 的 `div[role=button]` 自身没有 `:focus-visible` 规则） |
| 官方**扫光带** | ✅ 就是它 | 见下 |

官方**五处**同款（源码 + 构建产物双向核对）：

```css
.root[data-state=running] .row::after {
  content: ''; position: absolute; top: 0; bottom: 0; left: 0;
  width: 300px;                                     /* 满行高 + 固定带宽 */
  background: linear-gradient(90deg,
    transparent 0%,
    color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%,
    transparent 100%);
  animation: 2.6s ease-out infinite dsh-tool-row-sweep;
}
@keyframes dsh-tool-row-sweep { 0% { left: -300px } 90%, 100% { left: 100% } }
```

| 组件 | 位置 | 规则 |
| :--- | :--- | :--- |
| `ui-tool` ToolRow | 工具行 | `.root[data-state='running'] .row::after` |
| `ui-tool` bash-sample | 终端卡 | `.root[data-state='running']::after`（**长在容器自身**） |
| `ui-chat` ReasoningRow | 思考行 | `.root[data-state='running'] .row::after` |
| `ui-chat` GenericCommandCard | 命令卡 | `.root[data-state='running'] .row::after` |
| `ui-skill` SkillRow | 技能行 | `.card[data-state='running'] .row::after` |

**构建产物核对**（`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-tool/lib/client.js`）：
类名 `<模块 id>_<名字>`（如 `o3BgMG_row`），关键帧名保留 `dsh-tool-row-sweep` 尾串。

## 2) 官方那套的完整逻辑：**照自己的背景画**

官方带子画的是 `bg-base × 60%`，而**官方对话区的底色恰好就是 `bg-base`** ——
`ConversationRoot.module.css:7` 一句 `.root { background: var(--dsw-alias-bg-base) }`，一块**纯色**。
于是：

* 压在背景上：`0.6 × bg-base + 0.4 × bg-base = bg-base` → **与背景逐像素相同，看不见**；
* 压过字形：`0.6 × bg-base + 0.4 × 字形` → 把字往背景色洗 → 那行字一亮一暗地扫过。

官方注释写的正是这个意图：*washing glyphs and icon toward the background as it passes*。
**换句话说：官方就是「照它自己的背景画」的；那条带子从来不是给眼睛看的图形。**

## 3) 做法：照做

我们的背景 = `bg-base` **+ 背景层那串光 + 颗粒**
（`ConversationRoot` 的纯色底在背景层**下面**，而对话内容被抬到 `z 81`，见 `backdrop.ts` 的「用户内容豁免」）。
照搬官方那支「纯 `bg-base` 的 60%」必然与背景差一档 —— **任何固定颜色的带子都会显形**。

**逐项对应，一项都不能少**：

| 官方 | 我们 |
| :--- | :--- |
| `bg-base`（它的背景色） | `var(--dsw-alias-bg-base)`（同一个 token，已被色调染色） |
| ——（官方背景没有光） | **背景层那串渐变** `BACKDROP_GRADIENTS`（**同源**，不复制数值） |
| ——（官方背景没有颗粒） | **颗粒瓦片** `GRAIN_TILE_VARIABLE` |
| 颜色里的 `60%` | **`mask` 的峰值 alpha `60%`** |

```css
body:not([PLAIN_ATTR]) [data-state='running']::after,
body:not([PLAIN_ATTR]) [data-state='running'] [class*='_row']::after {
  /* 背景板：底色 + 同源的光 + 颗粒（照我们自己的地面，一项都不许少） */
  background-color: var(--dsw-alias-bg-base);
  background-image: var(--dsh-theme-tone-grain-tile, none), <BACKDROP_GRADIENTS>;
  background-attachment: fixed;
  /* 形状与强度：官方剖面 + 峰值 60%（一块 mask 干两件事） */
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 60%) 55%, transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0%, rgb(0 0 0 / 60%) 55%, transparent 100%);
}
```

结果与官方那条公式**逐项相同**：`0.6 × 我们的背景 + 0.4 × 底下的像素`
→ 背景上恒等于背景（**隐形** ✓）；字形上把字往背景洗（**洗字** ✓）。

### 为什么 60% 放进 `mask` 而不是颜色里

颜色 / 渐变 / 颗粒**各自**都要按 60% 压，而 `background-image` 的每一层没法统一压 alpha
（**颗粒的强度烘在贴图里**）。所以改成：**背景板按原样 100% 画，再让一整块 `mask` 把它乘 0.6**。
一块 mask 同时承担两件事：**形状**（官方停点 `0% → 55% → 100%`）与**强度**（峰值 60%）。

## 4) ⚠️ `background-attachment: scroll, fixed` 是个真 bug（不得这么写）

**per-layer 属性值少于层数时，CSS 会按顺序循环补齐。**
本规则的 `background-image` 有 **4 层**（颗粒 + 三段渐变），写 `scroll, fixed` 实际等于
`scroll, fixed, scroll, fixed` —— **第 1、3 段渐变退回按元素自己的盒子解析**
（扫光带那个盒子只有 300×24，`80vw/45vh` 的椭圆会直接糊满整条）。

**单个 `fixed` 应用到全部层**，且颗粒随之变成视口锚定 —— 那反而**更准**：
背景层的颗粒同样锚在视口上（它就在那个 fixed 全屏元素里）。

**同一个 bug 在右边栏那条规则里同样成立**（`glass.ts`），
两处都有守卫测试（禁止 `scroll, fixed`、要求单个 `fixed`）。

## 5) 已否决的做法（**别再重走**）

| 做法 | 死因 |
| :--- | :--- |
| 不动 | 官方那条带子在插件地面上读成「长方形，有点愣」 |
| 当成**形状**问题：3 停点 → 5 停点钟形 + 上下 34% 羽化 | **方向错** —— 要的是「隐藏」而不是「好看」 |
| 画「**近似**背景板」：`bg-base×60%` + 同源渐变×0.6 | 两处硬伤：**(a) 漏了颗粒**（地面有噪点、带子没有）；**(b) `scroll, fixed` 的层数补齐 bug**（见第 4 节）→ 反而更明显 |
| `backdrop-filter: blur(6px)` 把字**糊**进背景 | 官方那种「洗」是把字**淡**下去（字还在），blur 是把字**糊掉**，读起来像渲染失焦 |
| 干脆**不画**（`background: none`） | 丢功能：官方那圈焦点/运行提示就没了 |
| `mix-blend-mode: destination-out` 擦除 | 对「底下压着哪一层」的假设不成立，实测与官方公式结果相反 |
| 照自己的背景画**全量**，但选择器用裸 `[data-state='running']` + `[class*='_row']` | **思路对、选择器太宽**：官方给元素写 `::after` 的理由五花八门，那些伪元素全被刷上不透明底色 + 光 + 颗粒 → 整片对话区底部被盖住 |

**为什么选择器必须收窄（最关键的一条）**：`data-state` 是**通用**属性、`_row` 是**通用**后缀，
拿它们当「这是扫光带」的判据，等于假设「凡是带 running 态的 `::after` 都是那条带子」——
这个假设不成立。**正确判据**来自「这 5 处**有什么别人没有的**」：
`data-variant` / `data-tool` 只有官方那 5 处同时具备，等于把「这是扫光带」从**猜测**变成**可判定特征**。

**共同点**：上面几条否决都栽在「**用一个我们自己造的东西去替代官方那支颜色**」这个框里，
而且越改**改动面越大**。官方那条带子的正确性建立在「地面是常量」上，而我们的地面是插件自己
画出来的复合结果 —— 所以**只能照自己的地面画**，而不是去猜官方那支颜色等价于什么。

## 6) 代价与已知近似

* `[class*='_row']` 是**稳定后缀匹配**，也会命中 `_rowSettled` / `_rowActive` 这类变体，
  以及运行容器里**其它**名字里带 `_row` 的元素 —— 若它恰好也有 `::after`，那个伪元素会跟着被改画。
  范围仅限「运行中的行内部」，且只影响色调档，接受；
* **颗粒的合成方式不同**：背景层的颗粒是 `::after` + 独立 `opacity` + 深色轴走 `screen`
  （纯加亮），而这里的颗粒是**瓦片贴图 + 正常合成**（会同时压暗黑像素，略「脏」一档）。
  两者观感不完全相同 —— 与**右边栏**那条规则取**一致**的做法（那里也记着同一条近似）。
  真机上若发现带子比周围「脏」，优先怀疑这一条；
* 官方若改结构（类名尾串或 `data-state` 语义变化），最坏结果是**静默不命中**：
  带子回到官方样子（即最初那个「长方形」），不会糊、不会挡交互 —— 所以**不进兼容门**。

## 7) 待真机调

1. **带子是否真的隐形**：让某行进入 running，看背景上有没有一条横带。
   * 隐形 ✓ → 成了；
   * **仍可见** → 说明背景板还差一项（比如 `.root` 那层纯色之上还有别的层）。
     这时**别再调 60%**（那会同时破坏「洗字」与「隐形」两条），而应该去补那一项；
2. **洗字够不够**：峰值就是官方的 60%，**不要动**（大了显形、小了洗不动）；
3. **颗粒脏不脏**：见第 6 节第二条 —— 若脏，考虑给这一条的颗粒单独降一档
   （用浮层那张更淡的贴图，而不是背景层这张）。

## 8) 涉及文件

* `src/sweep.ts`：锚点表 + `SWEEP_PLATE_LAYERS` / `SWEEP_SHAPE_MASK` / `SWEEP_PLATE_ALPHA` + `buildSweepCss()`；
* `src/glass.ts`：右边栏那条规则的 `background-attachment` 一并修正（同一 bug）；
* `src/client/index.ts`：样式表拼接里加一段 `buildSweepCss()`；
* `src/index.ts`：导出（供单测与将来的独立插件复用）；
* `test/sweep.test.mjs`（7 条）：锚点覆盖面、**范围只有色调档**、
  **背景板必须画全**（底色 + 同源的光 + 颗粒，一项都不许少）、
  **单个 `fixed`**（禁 `scroll, fixed`）、强度与形状交给 mask（峰值 60%、停点与官方一致）、
  不得退回「只画一个颜色」/ blur / 擦除 / 不画、官方几何不得被声明、不得 `!important`；
* `test/glass.test.mjs`：右边栏那条 `fixed` 的守卫。
