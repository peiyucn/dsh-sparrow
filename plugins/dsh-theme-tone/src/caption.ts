/**
 * 桌面端（Windows）**窗口标题栏 overlay** 的样式。
 *
 * ## 那条 overlay 本来就跟着我们的色调走
 *
 * Windows 桌面端把标题栏交给 Electron 的原生 WCO（`titleBarOverlay`）绘制 ——
 * 最小化 / 最大化 / 关闭三个按钮由原生画在**网页之上**，我们碰不到按钮本身。
 * 但**颜色**是官方从我们这里取的（官方源码 `apps/desktop/src/preload-windows.ts`）：
 *
 *   建一个探针 span：`background-color: var(--dsw-specific-sidebar-fill)`、
 *   `color: var(--dsw-alias-label-primary)`；经 canvas 归一化成 `rgba(…)` 后
 *   IPC 送达主进程 `setTitleBarOverlay({ color, symbolColor })`。
 *
 * 本插件把该 token 覆盖成色调色，所以探针读到的是**我们的色**
 * （`#14141c` → `rgba(20,20,28,1)`；官方默认是 `rgb(27,27,28)`）—— 链路本来就是通的。
 *
 * ## 那条缝是怎么来的
 *
 * 送出去的是**不透明纯色** ⇒ 标题栏一条平色；而紧邻其下的侧栏有本插件的光与颗粒
 * （真机实测：标题栏 `21,25,21` 均匀平色 vs 其下侧栏 `43,42,34` 有质感）。
 * 平色挨着有质感 = owner 说的「和桌面端窗口标题栏没有打通，看着很丑」。
 *
 * ## 修法：把 overlay 底色改成**透明**，让本插件自己那层透上来
 *
 * 原生 overlay **支持透明**：官方主进程的 `validColor` 正则接受 `rgba(…)`（含 alpha），
 * 而 Electron 早在 2023-06 就加了 WCO 透明底支持（electron/electron#38693，
 * 原文 "Added transparent color support for WCO on Windows"，关闭 electron/electron#33567）。
 *
 * ### 为什么透明**不可能**改坏底色
 *
 * 官方那条铺标题栏的 `.frame::before`（`AppFrame.module.css` 的 `[data-windows-titlebar]` 段）
 * 用的**就是同一个** `--dsw-specific-sidebar-fill`，与探针取自同一条继承链
 * ⇒ **两者必然同值**（同一次自定义属性解析，只是被本规则单独改掉了探针那一份）。
 * 所以「不透明 → 透明」在颜色上恒等，**只多出本插件装饰层的光与颗粒**；
 * 连「选了官方默认」那一档也一样：那时该 token 逐条回给官方（见 `tones.ts` 的
 * `OFFICIAL_RUNGS` 口径），透明露出的仍是那个官方色。
 *
 * ### 为什么**不带** `body:not([plain])` 门（反直觉，但是硬要求）
 *
 * 本插件其余各表都以那道门收口，这里刻意不带，因为**带门会静默失效**：
 * 官方那套观察者只盯 `root[lang]`、`body[data-ds-dark-theme, style]` 与 `head`
 * （`preload-windows.ts` 的三条 observe），**没有**观察本插件的门属性。
 * 实测：单独把门属性从 body 上摘掉**不会**触发重发 —— 原生 overlay 会永远停在
 * 门关着时送出的不透明色，修法等于没写。而不带门本身没有代价（理由见上一节），
 * 故宁可去掉门，也不要一个「有时不生效」的实现。
 *
 * ### 值必须是字面量 `transparent`，不许用 `var()`
 *
 * 不带门的规则另有一条硬约束（见 `docs/private-seams.md` §B 的告诫）：
 * **不得依赖插件 token 层就绪** —— token 层在 `status: loading` 窗口内不具备，
 * `var()` 会解析为空，比不生效更糟。故这里直接写字面量。
 *
 * ## 只改**探针那一个元素**，不动 token 本身
 *
 * 该 token 同时被官方 `.frame` 与侧栏用来铺底色，**全局置透明会把侧栏自己的色调
 * 一起抹掉**（实测会变）⇒ 只把它重设到探针元素自身上。
 *
 * ## 私有 seam 说明（护栏与计数见仓库 `docs/private-seams.md`）
 *
 * 官方没给探针任何 data 属性，唯一可辨的是它 inline style 里逐字写着的两个 token 名。
 * 故选择器要求**两个 token 同时出现**（比只认一个更窄，误伤面更小），
 * 且限定为 `body` 的**直接子** `span`。这只是**只读判别 + 不改官方任何实现**
 * （不替换、不包装、不覆写官方函数）。官方若改写那一行，本规则**不命中**
 * ⇒ 退回改前外观（不透明 overlay），不抛错、不影响宿主 —— 属良性降级。
 */

/** 官方 preload 探针 inline style 里写着的背景 token（overlay 底色）。 */
export const CAPTION_PROBE_TOKEN = '--dsw-specific-sidebar-fill'

/** 官方 preload 探针 inline style 里写着的字色 token（与上者同现，用于收窄选择器）。 */
export const CAPTION_PROBE_SYMBOL_TOKEN = '--dsw-alias-label-primary'

/**
 * 桌面端标题栏 overlay 的样式表文本。
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildCaptionCss(): string {
  return `/* ===== 桌面端标题栏 overlay：底色透明，让本插件的质感透上来 =====
   owner 2026-09-30：桌面端标题栏要和主题「打通」。
   原生 overlay 的颜色由官方 preload 探针读 ${CAPTION_PROBE_TOKEN} 送出去，
   但那是个**不透明纯色** ⇒ 标题栏平色、紧邻的侧栏有质感 = 那条缝。
   设成透明后，标题栏显示的就是本插件铺满视口的装饰层（同一片光与颗粒）。
   Electron 2023-06 起支持 WCO 透明底（electron/electron#38693）。
   只改**探针那一个元素**：全局改这个 token 会连侧栏自己的底色一起抹掉。
   刻意**不带**官方默认门：官方观察者不观察本插件的门属性
   （preload-windows.ts 只 observe root[lang] / body[data-ds-dark-theme,style] / head），
   带门则门翻开时不一定重发、overlay 停在旧色 ⇒ 静默失效；
   而不带门在颜色上恒等（探针与官方 .frame::before 读同一个 token）。
   值写字面量、不用 var()：不带门的规则不得依赖本插件 token 层就绪。
   （本段在模板字符串里，注释中**不能出现反引号**。） */
body > span[style*='${CAPTION_PROBE_TOKEN}'][style*='${CAPTION_PROBE_SYMBOL_TOKEN}'] {
  ${CAPTION_PROBE_TOKEN}: transparent;
}`
}
