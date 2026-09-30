/**
 * 弹窗遮罩的模糊 —— 恢复 dsh 0.1.5 的观感。
 *
 * ## 为什么单独一个模块
 *
 * 它**既不是玻璃、也不受相位约束**，与 `glass.ts` 的两条纪律都冲突：
 * 那个模块要求「每条规则都带官方默认门」且「限定 active 相位」，
 * 而本规则按 owner 决定**两档都生效**、任何相位都可能出现遮罩。
 * 硬塞进去会同时打破那两条守卫（实测：确实被两条纪律测试拦下）。
 *
 * ## 事实：这不是我们改坏的，是官方 rc.2 有意去掉的
 *
 * 官方 `--dsw-mask-blur` 逐版取值（`ui-theme/src/styles/gradient-shadow-text.css`）：
 *
 * | 官方 tag | 取值 |
 * | :--- | :--- |
 * | `0.1.5-rc.3` / `0.1.6-alpha.2` / `0.1.7-alpha.1` / `0.1.7-rc.1` | `blur(2px)` |
 * | **`0.1.7-rc.2`** | **`none`** |
 *
 * 引入提交 `fdd14a0989 "feat(web): unify UI materials"`，**注释一并改写**：
 * 从「mask 与菜单共用模糊」改成「Blocking masks dim the page; menu backgrounds
 * retain their blur」——是一次语义重划，不是失误。且官方**写了断言**钉住新行为
 * （`apps/web/tests/menu-material.e2e.ts`：
 * `expect(mask).toEqual({ ..., blur: 'none' })`）。
 *
 * 完整证据链见 `docs/upstream/0.1.7-rc.2-mask-blur.md`。
 *
 * ## 为什么不能直接改官方那个变量
 *
 * `--dsw-mask-blur` 有 **4 个消费点**，第 4 个用法不同：
 *
 * | # | 消费点 | 用法 |
 * | :--- | :--- | :--- |
 * | 1 | `ui-primitives/Modal` `.mask` | `backdrop-filter`（滤**背后**） |
 * | 2 | `ui-settings-general/SettingsRoot` `.mask` | 同上 |
 * | 3 | `ui-primitives/ImageLightbox` `.mask` | 同上 |
 * | 4 | `ui-settings-account/DesktopOnboarding` `.blurred` | **`filter:`（滤自身内容）** |
 *
 * 全局改会把第 4 处变成「把引导页整页糊掉」。故本模块**只在遮罩元素自身**上重设该变量：
 * 官方规则 `backdrop-filter: var(--dsw-mask-blur)` 会取到元素自己的值，
 * 而 `.blurred` 是**另一个元素**、仍继承 `body` 的 `none`。
 * 好处还在于**不硬编码 `backdrop-filter`** —— 官方若改回，我们自动跟随。
 *
 * ## owner 决定（2026-09-27）
 *
 * * 大图查看（`ImageLightbox`）**一并恢复**（同一条规则顺带覆盖）；
 * * **两个档位都恢复** ⇒ **不带官方默认门**。这是刻意动官方默认外观，
 *   与悬停卡（`HOVER_CARD_ANCHOR`）同类，须记入 `docs/private-seams.md`。
 *
 * ## 真机验证（注入本模块产物后逐项对比）
 *
 * | 读取项 | 注入前 | 插件档 | 官方默认档 |
 * | :--- | :--- | :--- | :--- |
 * | 遮罩 `backdropFilter` | `none` | **`blur(2px)`** | **`blur(2px)`** |
 * | `body` 上全局变量 | `none` | `none`（未变） | `none`（未变） |
 * | 插件自有层该变量 | `none` | `none`（未误伤） | `none` |
 *
 * ## ⚠️ 脆弱依赖
 *
 * `[class*='_mask']` 是**哈希类名的稳定后缀匹配** —— 本仓库第 3 处同类依赖
 * （另两处见 `docs/private-seams.md`）。官方若重命名后缀，本规则会**静默失效**
 * （不报错、只是没效果），故 `test/mask.test.mjs` 逐条钉住本模块的产物。
 */

/**
 * 恢复弹窗遮罩模糊所用的值 —— 即官方 `0.1.7-rc.1` 及更早的 `--dsw-mask-blur` 取值。
 *
 * 单独命名而非内联字面量：它是**官方历史值**，将来官方若调整、或我们要换一档，
 * 只改这一处；也让测试能断言「渲染出来的就是这个值」，而不是断言一个魔法字符串。
 */
export const MASK_BLUR_RESTORED = 'blur(2px)'

/**
 * 遮罩元素的选择器 —— 覆盖**两种**遮罩写法（2026-09-27 补齐第二种）。
 *
 * ## 为什么是两组（owner 报「归档页 / 云端文件页弹出后背景虚化也没有」）
 *
 * 官方与自家插件用了**两种不同的遮罩标记**，第一版只覆盖了第一种：
 *
 * | 写法 | 谁在用 | 旧选择器是否命中 |
 * | :--- | :--- | :--- |
 * | 哈希类名 `xxx_mask` | 官方 `Modal` / `SettingsRoot` / `ImageLightbox` | ✅ |
 * | **`role="presentation"` 且内联 `backdrop-filter`** | **本仓库 `dsh-archive-manage` / `dsh-file-manage`** | ❌ **漏掉** |
 *
 * 自家插件当年那种确认框遮罩是 `<div role="presentation" style="backdropFilter: var(--dsw-mask-blur)">`
 * （当时的 `ArchiveDock.tsx` / `FileManageDock.tsx`）—— 类名是 `dsh-*-confirm-overlay`，
 * **不含 `_mask`**，所以第一版完全没管到它们 ⇒ owner 看到的「没有虚化」。
 *
 * ⚠️ **2026-10-01 实测：后半条现在一条也不命中**（那两个插件的确认框已改用官方 `Modal`，
 * 遮罩带官方 `_mask` 哈希类；实测「初始页 / 设置模态 / 归档 / 云文件」四种状态下
 * `带 --dsw-mask-blur 内联的 presentation` 均为 **0**）。**保留**它是**防御性**的：
 * 本仓库任一插件若再退回那种自建遮罩写法，这条无需改动即可覆盖；
 * 代价只是一个永不命中、且被 `style*=` 双重收窄的选择器（不建多余层叠上下文）。
 *
 * ⚠️ 两条都限定「自己声明了 `backdrop-filter: var(--dsw-mask-blur)`」这个**用法特征**
 * 才安全：`role="presentation"` 本身很泛（面板容器也常用），
 * 无条件命中会给无关元素建层叠上下文。
 */
export const MASK_SELECTOR = "[class*='_mask'], [role='presentation'][style*='--dsw-mask-blur']"

/**
 * 弹窗遮罩模糊的样式表文本。
 *
 * 刻意**不带** `PLAIN_ATTR` 门：owner 定案两个档位都恢复。
 * 这也意味着 token 层未就绪时它照常生效 —— 但它只设一个 CSS 变量、
 * 不依赖任何插件 token，故没有悬停卡那种「变量缺失导致全透明」的风险。
 *
 * @returns 注入 `<style>` 的 CSS 文本。
 */
export function buildMaskCss(): string {
  return `/* dsh-theme-tone 弹窗遮罩模糊（恢复官方 0.1.5 观感；卸载即随样式表移除）
   ⚠️ 本表**有意不带官方默认门**：owner 定案两个档位都恢复（见本模块头注释与
   docs/upstream/0.1.7-rc.2-mask-blur.md）。它只重设一个 CSS 变量，
   不依赖插件 token，因此不存在「token 未就绪导致异常」的风险。
   ⚠️ 只在**遮罩元素自身**上重设：官方全局变量保持 none 不动，
   否则会波及第 4 个消费点（DesktopOnboarding 的 filter，滤自身内容）。 */
${MASK_SELECTOR} {
  --dsw-mask-blur: ${MASK_BLUR_RESTORED};
}
`
}
