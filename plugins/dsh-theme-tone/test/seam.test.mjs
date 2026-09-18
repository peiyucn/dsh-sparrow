import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSeamCss, SEAM_NOTCH_PX } from '../lib/glass.js'
import { BACKDROP_GRADIENTS } from '../lib/backdrop.js'
import { GRAIN_TILE_VARIABLE, PLAIN_ATTR } from '../lib/constants.js'

const css = buildSeamCss()
// 注释里也会出现 `{` / `::before` 这类结构字符，对全文做结构断言会误判，故先剥注释。
const rules = css.replace(/\/\*[\s\S]*?\*\//gu, '')

/**
 * 取一条规则的规则体（已剥注释）。
 * @param needle - 选择器片段（含结尾的 ` {`，避免与 `::before` 那条撞名）。
 * @returns 花括号内的声明串。
 */
function bodyOf(needle) {
  const at = rules.indexOf(needle)
  assert.ok(at >= 0, `缺规则：${needle}`)
  return rules.slice(rules.indexOf('{', at) + 1, rules.indexOf('}', at))
}

/** 三条缝的挡板选择器（与被测实现一一对应）。 */
const GOAL_BAND = "[data-testid='todo-panel'] ~ [data-goal-bar]::before"
const QUEUE_BAND = ":is([data-testid='todo-panel'], [data-goal-bar]) ~ [data-queue-dock]::before"
// 最后一条**不挂在输入框卡自己身上** —— 卡片带 backdrop-filter、自成层叠上下文，
// 挂它身上的伪元素（哪怕 z-index: -1）会画在停靠卡**之上**，补缺口那 16px 会把待办卡底边涂成背景色。
const CARD_BAND = ':has(> [data-composer-card])::before'

describe('seam：缝挡板（停靠卡与输入框卡之间的 6px 缝）', () => {
  it('三条缝各有一条挡板：目标条 / 排队卡 / 输入框卡的父元素', () => {
    assert.ok(rules.includes(GOAL_BAND), '缺「待办 ↔ 目标」那条')
    assert.ok(rules.includes(QUEUE_BAND), '缺「目标 / 待办 ↔ 排队」那条')
    assert.ok(rules.includes(CARD_BAND), '缺「最后一张 ↔ 输入框卡」那条')
  })

  it('每条规则都应该 带「官方默认」门，且只 active（与座底那条一致）', () => {
    // 官方默认那一轴必须整表让路；hero 下底座不是 sticky、官方那条背衬也没有，
    // 这里跟着不介入，免得留下半截带子（hero 的栈间距是 8px，会正好差 2px）。
    const blocks = rules.split('}').filter(block => block.includes('{'))
    for (const block of blocks) {
      const selector = block.slice(0, block.indexOf('{')).trim()
      if (selector === '') continue
      assert.ok(selector.startsWith(`body:not([${PLAIN_ATTR}])`), `规则「${selector}」缺少官方默认门`)
      assert.ok(selector.includes("[data-phase='active']"), `规则「${selector}」只该覆盖 active`)
    }
    assert.ok(!/hero/u.test(css), 'hero 不介入')
  })

  it('挡板必须是**不透明 + 背景原样重画**（静态零差别的前提）', () => {
    // 数学（座底那条注释有完整推导）：面以 alpha a 画 C，要恒等于页面色 P 就必须 C = P；
    // 取 a = 1 时只要原样画满即可，没有可调错的比例。半透明就得同时压底色与光，那是「两层光」的坑。
    for (const needle of [GOAL_BAND, QUEUE_BAND, CARD_BAND]) {
      const body = bodyOf(needle)
      assert.match(body, /background-color: var\(--dsw-alias-bg-base\)/u, `${needle} 必须不透明（原样 token）`)
      assert.ok(body.includes(`var(${GRAIN_TILE_VARIABLE}, none)`), `${needle} 颗粒必须在`)
      assert.ok(body.includes(BACKDROP_GRADIENTS), `${needle} 光必须与背景层**同源**（直引，不复制数值）`)
      assert.ok(!/\bbackground:\s/u.test(body), `${needle} 不得用简写（会重置其它 background-*）`)
    }
  })

  it('挡板应该 压在条目背后、不吃鼠标事件', () => {
    for (const needle of [GOAL_BAND, QUEUE_BAND, CARD_BAND]) {
      const body = bodyOf(needle)
      assert.ok(!/\btop\s*:/u.test(body), `${needle} 不得声明 top`)
      assert.match(body, /left: 0/u, `${needle} 横向铺满条目`)
      // z-index: -1 是安全绳：带子必须画在**条目背后**，万一哪天门松了、带子越界，也是被卡片盖住而不是盖住卡片。
      assert.match(body, /z-index: -1/u, `${needle} 必须压在条目背后`)
      assert.match(body, /pointer-events: none/u, `${needle} 不得吃鼠标事件`)
    }
  })

  it('高度 = 缝间距 + **圆角缺口**：停靠卡那两条两头都补，输入框卡那条只往上补', () => {
    // 卡片是**圆角**的：只盖那 6px 缝不够 —— 「圆角弧线以外、包围盒以内」那一小块三角仍会露正文。
    // owner 真机指认：「todo 的**左下角**能看到吧，露出来一点，**右边**估计也有这个问题。」
    // 白条探针实测缺口小窗读数 **250+**（完全透出），而紧邻的缝区已被挡到 ~35。
    assert.ok(SEAM_NOTCH_PX > 12, '缺口补贴必须大于停靠卡的圆角半径（官方 12px），否则补不满')
    for (const needle of [GOAL_BAND, QUEUE_BAND]) {
      const body = bodyOf(needle)
      assert.match(
        body,
        new RegExp(`bottom: calc\\(100% - ${SEAM_NOTCH_PX}px\\)`, 'u'),
        `${needle} 要往**上下两张卡**的缺口里各伸一点`,
      )
      assert.match(
        body,
        new RegExp(`height: calc\\(var\\(--dsh-composer-stack-gap, 6px\\) \\+ ${2 * SEAM_NOTCH_PX}px\\)`, 'u'),
        `${needle} 高度 = 缝间距 + 2×缺口`,
      )
    }
    // 输入框卡是**玻璃**：往它顶里伸 = 把背衬塞到玻璃背后，那一片就不再透正文
    // （实测卡片内部会从 113 掉到 ~41）—— 所以只往上补上面那张停靠卡。
    const card = bodyOf(CARD_BAND)
    assert.match(card, /bottom: 100%/u, '输入框卡那条只往上补（不伸进玻璃里）')
    assert.match(
      card,
      new RegExp(`height: calc\\(var\\(--dsh-composer-stack-gap, 6px\\) \\+ ${SEAM_NOTCH_PX}px\\)`, 'u'),
      '输入框卡那条高度 = 缝间距 + 缺口',
    )
  })

  it('背景附着必须只写一个 fixed —— 少于层数会按顺序循环补齐', () => {
    // 配方 4 层 background-image；写「scroll, fixed」会让第 1、3 段渐变退回按元素自身盒子解析，
    // 光就不再与背景层对齐（座底那条注释记过这个坑）。
    const body = bodyOf(GOAL_BAND)
    assert.equal((body.match(/background-attachment/gu) ?? []).length, 1, '只能有一个 background-attachment')
    assert.match(body, /background-attachment: fixed/u)
  })

  it('三个宿主都必须补成包含块（否则 bottom:100% 会锚到座位上）', () => {
    assert.match(bodyOf('~ [data-goal-bar] {'), /position: relative/u, '目标条 wrapper 要 position: relative')
    assert.match(bodyOf('~ [data-queue-dock] {'), /position: relative/u, '排队卡 wrapper 要 position: relative')
    // 输入框卡那条挂在**卡的父元素**上 —— 卡自带 backdrop-filter，挂它身上会被抬到停靠卡之上
    assert.match(bodyOf(':has(> [data-composer-card]) {'), /position: relative/u, '输入框卡的父元素要 position: relative')
    // 无偏移 ⇒ 不改布局；也不能带 z-index（那会另开层叠上下文，把带子的 -1 关进小盒子）
    for (const needle of ['~ [data-goal-bar] {', '~ [data-queue-dock] {', ':has(> [data-composer-card]) {']) {
      const body = bodyOf(needle)
      assert.ok(!/\btop\s*:/u.test(body) && !/\bleft\s*:/u.test(body), `${needle} 不得带偏移`)
      assert.ok(!/\bz-index\s*:/u.test(body), `${needle} 不得带 z-index`)
    }
  })

  it('⛔ 三种「没有缝」的情形必须被门挡住 —— 否则带子会画到底座外、盖住正文', () => {
    // ① 前面没有停靠卡时（目标条 / 排队卡是栈内第一项）：官方 `~` 兄弟门。
    assert.ok(rules.includes("[data-testid='todo-panel'] ~ [data-goal-bar]::before"), '目标条：必须要求前面有 todo')
    assert.ok(
      rules.includes(":is([data-testid='todo-panel'], [data-goal-bar]) ~ [data-queue-dock]::before"),
      '排队卡：必须要求前面有 todo / goal',
    )
    // ② 完全没有停靠卡时，输入框卡上方根本没有缝 —— `:has()` 门。
    assert.ok(
      rules.includes("[data-composer-seat]:has([data-testid='todo-panel'], [data-goal-bar])"),
      '输入框卡：必须要求底座里有停靠卡',
    )
    // ③ 排队卡在场时它自带负边距塞进输入框卡下面（实测重叠 3px）—— 那条缝本来就不存在，
    //    此时再画一条会**盖在排队卡自己身上**。
    assert.ok(
      rules.includes("not(:has([data-queue-dock])) :has(> [data-composer-card])::before"),
      '输入框卡：排队卡在场时那条缝不存在，必须排除',
    )
  })

  it('⛔ 输入框卡那条的「门」与「宿主」必须分开：门挂座位、宿主是座位里的卡父元素', () => {
    // 踩过：把 `:has(> [data-composer-card])` 直接并进座位（`[data-composer-seat]:has(> […])`），
    // 宿主就变成了**座位自己** —— 伪元素挂回底座、缝反而漏（实测缝区又回到 250+）。
    assert.ok(
      rules.includes("[data-composer-seat]:has([data-testid='todo-panel'], [data-goal-bar])"),
      '门必须挂在座位上',
    )
    assert.ok(
      !rules.includes('[data-composer-seat]:has(> [data-composer-card])'),
      '宿主不得并进座位自身（门与宿主之间必须有后代组合符）',
    )
    assert.ok(rules.includes(' :has(> [data-composer-card]) {'), '宿主是座位里面的「卡的父元素」')
  })

  it('⛔ 底座本体不得挂伪元素（owner：「不是靠这个夹层」）', () => {
    assert.ok(!rules.includes('[data-composer-seat]::before'), '缝挡板只能挂在条目上，不许挂底座')
  })

  it('不应该 依赖官方 hashed 类名，也不应该 出现硬编码色值', () => {
    assert.ok(!/\.[A-Za-z0-9]*_[A-Za-z0-9]{4,}/u.test(css), '不得出现 hashed 类名')
    assert.ok(!/#[0-9a-f]{3,8}\b/iu.test(css), '不得出现硬编码色值')
    assert.ok(!/\brgba?\(/u.test(css), '不得出现硬编码色值')
  })
})
