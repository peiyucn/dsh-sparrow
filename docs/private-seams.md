# DSH 插件私有 seam 特例

> 本文件**只登记"欠官方的债"**——需要 owner 认可的例外。三类：
> **A 私有 seam**（官方无公开能力）、**B 刻意改官方默认外观**、**C 无门可拦的静默失效风险**。
>
> **公开 seam 的正常使用不进本文件**：公开服务 / 公开槽位 / 公开事件 / 公开 DOM 标记 / 公开导出
> 一律视为正路，用了就用了，不写。**收缩原则**：条目应随官方补齐公开能力而**减少**——
> 官方一旦提供公开替代，就地删除条目、换用公开路径。新增条目须 owner 认可。
>
> **官方公开锚点也不在此手工维护**：权威来源是各插件 `src/` 里的选择器字面量，跟版审计时现取
> （方法与口径见 [`docs/upstream/0.2.0-rc.1.md`](upstream/0.2.0-rc.1.md) §4.1）。
> 理由：手工清单已证会漂——0.2.0-rc.1 审计时发现它漏列了三处一直在用的锚点。
>
> 最近一次核对：dsh `0.2.0-rc.2`（2026-10-03），本文件点名的例外逐条验存续。
> ⚠️ rc.2 这一版**不是零回归**：`role='menu'` 换了承载元素，theme-tone 的分组菜单锚点踩中
> （见 §D 旁注），已修并补守卫。

---

## A. 私有 seam（官方无公开能力，启动能力检查缺失即 fail-fast）

* **`dsh-archive-manage`**
  * **`sessionPersistence.locate`** —— 后端私有方法（alpha.5 后从公开契约降级），是拿到会话**产物目录**的
    唯一途径：公开契约 `SessionPersistence` 只有 `create` / `open` / `flush` / `stat` / `list`，
    而 `stat` / `list` 返回的 `SessionPersistenceSnapshot` 只含 `header` / `revision` / `eventCount` /
    `sizeBytes`，**不含路径**；`SessionLocation`（`kind` + `path`）只出现在 `errors.ts`。
  * **WorkspaceRegistry 私有写通道**（`enqueueOperation` / `requireState` / `setState`）——
    归档集没有公开写入口。
  * **`session_projcache` 存储域直读 / 直写**（`src/host.ts` 的 `PROJCACHE_DOMAIN_NAME` /
    `PROJCACHE_SESSIONS_TABLE`）—— 移入回收站 / 删除把目录搬走后，必须让官方投影缓存里那几行失效，
    否则 @ 列表仍读到已归档会话的标题。
    ⚠️ **这一条是「可以走公开路径却没走」**：官方**有**导出 `projectionCacheDomainSpec`
    （`@deepseek-ai/dsh-session-projection-cache`，`src/index.ts:59` 导出、`src/spec.ts` 定义），
    域名字符串与表名都该从它取。本插件目前写的是**字面量** `'session_projcache'` / `'sessions'`,
    等于把官方合法的公开契约降级成了私有 seam（官方改域名 / 改表名即静默失效）。
    **待办**：换成 import 官方 spec（属「收缩原则」，公开替代已存在）。
  * **`ctx.get('sessionProjections')` / `ctx.get('sessionProjectionCache')` + `fn.length` 形参自适应**
    （`src/host.ts:202-253` 的 `cachedTitle`、`:571-600` 的 `subagentLabel`）—— 按被调函数**形参个数**
    选择调用形态，而不是 try/catch 回退。**两处调用同一个 `cachedSnapshot`，必须同口径**：
    只改一处会让另一处静默 miss（能取到缓存却永远读不出 label；不抛错、也不易被测试发现）。
    这是「同一能力在不同 dsh 线里签名不同」的兼容写法；官方给全签名后应删。

## B. 刻意改官方默认外观的例外（**均不带官方默认门**，两个档位都生效）

> 判据：「恢复官方本该有的行为」（修 bug、复原）⇒ 不带门；「改变官方有意的设计选择」（断点、留白）⇒ 带门。
>
> ⚠️ 不带门的规则另有一条硬约束：**不得依赖插件 token 层就绪**——token 层在 `status: loading` 窗口内
> 不具备，`var()` 解析为空，比不生效更糟（悬停卡栽过一次，卡片变全透明）。

1. **悬停卡**（`HOVER_CARD_ANCHOR`）：官方把这张卡的面与字都写成组件内字面量（浅色轴下官方自己就是深卡）。
   owner：「深卡不对吧」→ 跟随主题、两个档都修。
2. **弹窗遮罩模糊**（`src/mask.ts`）：官方 0.1.7-rc.2 把 `--dsw-mask-blur` 改成 `none`（**有意为之**），
   owner 要求恢复 0.1.5 观感。证据链见 [`0.1.7-rc.2-mask-blur.md`](upstream/0.1.7-rc.2-mask-blur.md)。
3. **悬停光带跟随指针**（`src/handle-glow.ts`，**已随 `dsh-nav-pin` 并入 `dsh-theme-tone` 落地**）：官方
   `--dsh-width-handle-pointer-y` 只在**拖拽中**被写，纯悬停走 CSS 兜底 `50%`，而那个 `50%` 是相对
   `.body` 盒（官方顶栏在流内占 76px）算的 ⇒ 光带比视口中心低 38px。官方**无意的 bug**，
   owner 2026-09-29 定案「官方的也一起修复」。
⚠️ 新增破例时**必须同步更新本节计数**（曾经写着「唯一一处」，加到第二处后即失真）。
第 3 处随 `dsh-nav-pin` 并入 `dsh-theme-tone` 落地；实施时本节改为「三处」，
并顺手修 `src/surface.ts:1223` 那句已过期的「全插件**唯一**不带官方默认门的一条」（实为两条）。
**2026-10-08 复核：本节仍为三处** —— 曾有过第 4 处「顶栏弹出层的列内夹取」（`src/popover.ts`，2026-10-02 加），
因该修法把弹框压成「贴列左缘、横跨整个对话区」，且复查找明**纯 CSS 无解**，**整表已回退**（见 §C 第一条）。

> ⚠️ **计数口径**：§B 的「四条」只数**改官方默认外观**这一类（不带官方默认门）。
> `src/caption.ts` 的桌面端标题栏 overlay 同样不带门，但它是**只读判别 + 改探针自己的 token**、
> 不改官方外观，故登记在 §D 而不计入 §B —— 凡写「三条 / 四条」时指的是 §B 这一组，别把 §D 那条算进来。
> 2026-10-03 复核时把 `src/surface.ts`、`docs/spec/00-overview.md`、`docs/spec/05-surfaces.md`
> 三处过期计数（仍写「唯一」/「三处」）一并校正为「四条（之一）」。

## C. 官方缺陷（**我们不修**，仅登记以免被反复当成我们的 bug 重查）

> ⚠️ 本节只登记**确认不修**的。
> 第一条那个弹出层缺陷曾在 2026-10-02 被移出本节、记为「已修」，**2026-10-08 整表回退并移回本节** —— 理由见下。

* **会话中列裁切 / 遮盖顶栏里的弹出层**（官方 `JobListAction` 的 `.menu`）—— **不修，仅登记**。
  两个**各自独立**的成因：
  * **① 被裁**：弹框向右伸出会话列，而中列是 `overflow: hidden`
    （`ConversationRoot.module.css:363-365` 的 `.root[data-phase='active'] { overflow: hidden }`），
    裁切右边界逐像素等于右栏面板左缘（实测 1600×900 下 880 = 880）。
  * **② 被盖**：弹框 `z-index: 100` 长在**顶栏**子树里，而本插件把顶栏抬成 `absolute + z-index: 82`
    ⟹ 自作层叠上下文，那个 100 **被关在里面**、对外只算 82；右栏面板也正好 82，
    同号按绘制次序决胜、面板在 DOM 更后 ⇒ 面板赢。

  **2026-10-02 曾「修掉」它**（换包含块 + `left: 0 !important`），**2026-10-08 全部回退**：
  那个修法把弹框压成「贴列左缘、横跨整个对话区」，owner 真机报障说比原缺陷更难看。
  按 owner 建议「先恢复成官方原状态再改」回退后重查，查明了**为什么纯 CSS 修不了**：

  * **`container-type: inline-size` 隐含 `contain: layout`**（`ConversationRoot.module.css:71` 的
    `.titleRow`，而弹出层就在它的子树里）⇒ 该元素成为 abspos / **fixed** 后代的**包含块**。
    于是「把包含块上移到列外」这条路被官方 containment 钉死：换谁当包含块都还在 `.titleRow` 内，
    而 `.root` 的 `overflow: hidden` 是它的**祖先** ⇒ **恒被裁**。`position: fixed` 同样无效。
  * 抬**弹框自己**的 `z-index` 无效（出不了顶栏那层；受控实测见 `docs/spec/12`）；
    抬**顶栏**能盖过面板，但**改不了裁切**（`overflow` 不受 z-index 影响），
    且与官方全屏面板次序冲突（见下）。
  * 位置那一半另有坑：官方把锚定值写成**相对触发器**的内联 `left`，换了包含块就落在错误的坐标系里
    （实测偏 −300px）；`left: auto` 能让它回到静态位置 = 触发器左缘（受控实测弹框−触发器 = 0）。

  ⇒ 结论：这是**官方 popover 没有 portal 到 body** 造成的结构性缺陷，纯 CSS 无解；
  真正的修法只有官方把节点 portal 出去，属上游事项。
  ⚠️ 别再把「换包含块 / 抬弹框 z-index / 抬顶栏」当成还没试过的修法 —— 三条都已试过，
  受控实验与失败记录在 `docs/spec/12`。

* **仍不该做的**（此后若有人想「顺手」）：
  * 把顶栏抬到右栏面板之上会违反官方次序 —— 官方全屏面板 `--dsh-dockkit-dock-layer: 40`
    高于顶栏 9（`SidebarRight.module.css:19-21,64-66`，原话「fullscreen (40) covers the frame and
    remains below independently floating panels (60)」），dockkit 浮窗又是 60 —— 三者都必须能压住顶栏；
    守卫钉在 `test/glass.test.mjs`「顶栏不得抬到右栏面板之上」那条。
  * 去动中列的 `overflow` 同样不行：那是列自身的裁切契约。

## D. 静默失效风险（官方改名 / 改行为即失效，没有任何门能拦）

* **`dsh-theme-tone`** —— 仓库规矩是「不依赖 hashed CSS-module 类名」，以下四处**例外**，
  且测试**抓不到官方重命名后缀**：  1. **悬停卡字色**（`HOVER_CARD_TEXT_TOKENS`，`src/constants.ts`）：`[class*='_hoverTitle'|'_hoverPath'|'_hoverTime'|'_hoverStatus']`
  2. **扫光带**（`SWEEP_ANCHORS`，`src/sweep.ts`）：`[class*='_row']::after` —— **已收窄**：必须同时带
     `data-variant` / `data-tool` 才命中（`test/sweep.test.mjs` 钉住不得回退）
  3. **弹窗遮罩**（`MASK_SELECTOR`，`src/mask.ts`）：`[class*='_mask']`（官方三个遮罩 `Modal` /
     `SettingsRoot` / `ImageLightbox` 只在哈希类名上可辨）
  4. **桌面端标题栏 overlay**（`src/caption.ts`）：`body > span[style*='--dsw-specific-sidebar-fill'][style*='--dsw-alias-label-primary']`
     —— 官方那条 Windows preload 探针（`apps/desktop/src/preload-windows.ts`）没有 data 属性，
     唯一可辨的是它 inline style 里逐字写着的两个 token 名；**两者同时出现 + `body` 直接子**双重收窄
     （`test/caption.test.mjs` 钉住）。命中后把探针**自己**那个 token 设为 `transparent`，
     让官方 WCO overlay 透明、由本插件铺满视口的装饰层透上来。官方改写那一行即**不命中**，
     退回改前外观（不透明 overlay），属良性降级。
     ⚠️ 本条**刻意不带**官方默认门：官方那套 `MutationObserver` 只 observe
     `root[lang]` / `body[data-ds-dark-theme,style]` / `head`，**不观察本插件的门属性** ——
     带门则门翻开时不重发、overlay 停在旧色（实测），是不留痕迹的失效；
     而不带门在颜色上恒等（探针与官方 `.frame::before` 读的是**同一个** token，必然同值）。
  5. **轮次导航 nav 的 `aria-label` 文案**（`src/nav-pin.ts` 的 `NAV_ARIA_LABELS`）：
     `[data-conversation-scroll] div:has(> nav[aria-label="轮次导航"|"Turn navigation"])` ——
     官方 nav 没有可依赖的公开属性，只能按**本地化文案**认它；代码自己的注释也写了
     「官方改文案需同步更新」。官方改字即**不命中**（那条窄屏浮现规则静默失效），
     降级表现 = 窄对话列上轮次导航照官方那样消失。
  6. **「未选工作区」空态的官方 `::after` 检测**（`src/workstart.ts`）：读官方
     `::after` 伪元素的 `content` 是否非空、且 `mask-image` 是否含 `stroke-dasharray`，
     用来判断官方那个虚线圆环（= 没有工作区）在不在。语义属性全被污染、哈希类名又禁用，
     只剩这条读**计算样式**的路。官方改那个圆环的画法即**不命中**（驱动
     `WORKSTART_ATTR` 的两条规则失效），降级表现 = 该空态少了我们那点装饰。

  以上 5 / 6 两条都是**本地化文案 / 计算样式**级别的依赖：官方一改就静默失效、不抛错、
  也不影响宿主，属 §D 的标准类型。

* **`dsh-codebuddy-credits`** —— 捕获阶段拦截官方行头「编辑」按钮（`stopPropagation` 阻断官方编辑器打开，
  改为展开本插件自建编辑器）：按钮保留官方原位与样式，但**官方改这个按钮即静默失效**。
* **`dsh-codebuddy-credits`** —— 把 current **乐观回写进官方共享模型目录 store**
  （`src/client/index.ts` 的 `directory.store.update(s => { s.current = selection })`）：
  官方 `ModelDirectory` 只公开 `select()`，而空白会话的投影不下发，`syncInputs` 读不到 `current`，
  座位 / 眼睛 / 信息卡就都看不到选择（表现为「点击没反应」）。**这是对官方 store 私有状态的写**，
  官方改 store 形状即静默失效。
  ⚠️ **这一条是「可以走公开路径却没走」**：官方 `ModelDirectoryState` 的写入口应由官方提供，
  目前没有 ⇒ 只能直写。**待办**：官方若给公开 setter 即换过去。

### D-旁注：**不是** hashed 类名、但同样「官方改行为即静默失效」的一类

* **`dsh-theme-tone` 的分组菜单锚点依赖「谁带 `role='menu'`」**（`src/surface.ts`）。
  这条**不**依赖 hashed 类名（用的是公开 role / data 属性），却在 **0.2.0-rc.2 真的踩了一次**：
  官方把 `role='menu'` 从菜单**卡片**搬到了内层**滚动容器**上
  （`ModelSelect.tsx:484` 卡片改成 `role={pane==='model'?'group':'menu'}`；
  `:551-555` 的 `div.groups.scrollable` 自己带 `role="menu"`）。
  于是「菜单锚点的**直接子**」这个结构关系整体上移一层，内圈圆角规则
  `[role='menu'] > :has([role='group'])` 在新结构下**一条也命不中**（实测 rc.2 结构 0 命中 /
  rc.1 结构 1 命中）—— **token 级审计抓不到**：`role="menu"` 这个名字还在、还出现，
  只是**换了元素**（§4.4 说的那类行为变化）。
  现出两条腿各自覆盖（`GROUPED_MENU_SCROLLER_SELECTOR` + `GROUPED_MENU_SELF_SCROLLER_SUFFIX`）；
  守卫在 `test/surfaces.test.mjs`（反向注入验过有牙齿）。
  ⚠️ 下次官方再动这一带，要问的是「**哪个元素带这个 role**」，不是「这个 role 还在不在」。

## E. 已退役（历史，不再维护）

* **`dsh-vision-bridge`**（2026-09-10 退役）：曾可逆包装 `ctx.llm.resolveModelInfo` 抹除文本路由的
  image 门禁，并直读 `snapshotEvents()`。代码原地保留，本节仅作历史。
