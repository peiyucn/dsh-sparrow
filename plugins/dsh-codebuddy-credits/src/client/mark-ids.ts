/**
 * 品牌 SVG 的**实例作用域**：把内联 SVG 里的 id 与其片段引用**一起**加实例后缀。
 *
 * ## 为什么必须有这个文件（owner 2026-10-07 报的真缺陷）
 *
 * owner：「对话界面的额度卡里，浅色模式下，logo 好像没有反色处理。」
 *
 * 本插件的两枚品牌标是 `CodeBuddyCreditsIndicator.tsx` 里的**内联 SVG 常量**
 * （`LOGO_SVG` / `MARK_SQUARE_SVG`），各自带一个**写死的渐变 id**
 * （`ccb-logo-gradient` / `ccb-logo-square-gradient`）。而同一个文档里这些常量会被
 * 注入**多份**：
 *
 * 1. 顶栏按钮**两种形态都渲染**（宽档 lockup + 窄档方标，显隐交给 `@container`）；
 * 2. 展开的额度卡面板 portal 到 `document.body` 后**再注入一份方标**。
 *
 * `fill="url(#id)"` 按**文档序第一个**同名元素解析。对话区宽（> 656px）时窄档那份是
 * `display: none` ⇒ 它成了文档序第一份 ⇒ 面板那份方标的渐变解析到一个**不可见**的
 * 定义 ⇒ **方底整个不画**，只剩硬编码 `fill="#fff"` 的白色字形。
 *
 * 深色轴下那个字形本来就该是白的，少一层渐变底不易察觉；**浅色轴下白字落在近白底上
 * ⇒ 看起来就是「没反色」**。
 *
 * ## 受控实验（最小 rect + linearGradient，排除素材特殊性）
 *
 * | 用例 | 文档序第一份同名 id | 渐变是否画出 |
 * | :--- | :--- | :--- |
 * | 单份 | 可见 | 画出 |
 * | 同 id 两份、第一份 `display:none` | 不可见 | **不画**（品牌色像素 0） |
 * | 同 id 两份、都可见 | 可见 | 都画出 |
 * | id 各自唯一 | 可见 | 画出 |
 *
 * 同型真实结构复现（顶栏按钮 + portal 面板，只差一个变量）：原样 = 品牌色像素 0；
 * 面板那份 id 唯一 = 画出；面板排到顶栏之前 = 画出；窄档（第一份可见）= 画出。
 *
 * ## 修法（与官方同款）
 *
 * 每个渲染实例给 id 加**实例前缀** ⇒ 每份都只引用**自己**那份定义，而那一定义就在它
 * 自己的（可见）子树里。纯函数，前缀由调用方给（组件里用 React `useId()` + 用途后缀，
 * 见 `CodeBuddyCreditsIndicator.tsx`）。尺寸/颜色/几何一个字不动。
 *
 * 官方 `@deepseek-ai/dsh-client-ui-primitives` 对**同一个问题**用的就是这套做法：
 * `CodeFileIcon.tsx:13`（`dsh-code-icon-${useId().replaceAll(':', '')}`，注释写明
 * 「Per-instance ids keep gradients and clip paths independent」）与
 * `plugin-artwork.tsx:9-13`（注释写明「the artwork repeats across cards and rows, and
 * duplicate document ids would make every `url(#…)` resolve to the first instance」）。
 */

/** id 里不宜出现的字符 → `_`（React 的 useId 形如 `:r1:`，官方同样 replaceAll(':','')）。 */
const UNSAFE_IN_ID = /[^A-Za-z0-9_-]/gu

/** 净化后至少要有这样一个字符才算「可用作用域」（全下划线之类等于没给）。 */
const USABLE_IN_ID = /[A-Za-z0-9]/u

/** SVG 片段引用：`url(#id)`（含带引号写法）、`href="#id"`、`xlink:href="#id"`。 */
const URL_REFERENCE = /url\(\s*(['"]?)#([^)'"]+)\1\s*\)/gu
const HREF_REFERENCE = /(\b(?:xlink:)?href\s*=\s*)(['"])#([^'"]+)\2/gu

/**
 * 给内联 SVG 里**全部** id 与其片段引用加同一个实例前缀。
 *
 * 只改 id 与引用，不动任何几何 / 颜色 / 结构；幂等性不保证（每个实例只调一次）。
 * `scope` 净化后没有一个字母/数字（传了空串、`::` 等）时**原样返回**——客户端的
 * fail-soft 口径：宁可退回旧行为，也不抛错打断渲染。注意这种情况**不解决**多份同 id
 * 的问题，故调用方（组件）必须给真实作用域（`useId()` 必然给得出）。
 *
 * @param svg - 内联 SVG 源码（本插件常量，或调用方自备的同类字符串）。
 * @param scope - 实例作用域（同一文档内唯一即安全；用作 id 前缀）。
 * @returns 作用域化后的 SVG 源码。
 */
export function scopeMarkSvg(svg: string, scope: string): string {
  const prefix = scope.replace(UNSAFE_IN_ID, '_')
  if (!USABLE_IN_ID.test(prefix)) return svg
  const rename = (id: string): string => `${prefix}-${id}`
  return svg
    .replace(/\bid="([^"]*)"/gu, (_match, id: string) => `id="${rename(id)}"`)
    .replace(URL_REFERENCE, (_match, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`)
    .replace(HREF_REFERENCE, (_match, head: string, quote: string, id: string) => `${head}${quote}#${rename(id)}${quote}`)
}
