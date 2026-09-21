import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DARK_TONES,
  DEFAULT_SETTINGS,
  DEPTH_ALPHA,
  LIGHT_GLOW_ALPHA,
  LIGHT_TONES,
  availableToneIds,
  normalizeScheme,
  toneFieldFor,
  toneFor,
  toneIdOf,
  toneIdsFor,
  tokenOverrides,
} from '../lib/tones.js'
import { backdropPlan, tonePreview } from '../lib/backdrop.js'
import { en, zh } from '../lib/client/locales.js'

const ALL_TONE_IDS = [...toneIdsFor('light'), ...toneIdsFor('dark')].filter(
  (id, index, list) => list.indexOf(id) === index,
)

describe('色调表', () => {
  it('两轴都应该 含官方默认，且 id 顺序与 toneIdsFor 一致', () => {
    assert.ok(toneIdsFor('light').includes('official'))
    assert.ok(toneIdsFor('dark').includes('official'))
    assert.deepEqual(toneIdsFor('dark'), ['official', 'violet', 'crimson', 'forest'])
    // 浅色轴的顺序**与深色轴逐位对应**（owner：「蓝色的在最前面，有点泛红那个在中间，
    // 最后是绿的，和深色正好对应」）：蓝 ↔ 蓝紫、**樱花（粉/暖）↔ 余烬（红/暖）**、绿 ↔ 绿。
    assert.deepEqual(toneIdsFor('light'), ['official', 'blue', 'sakura', 'green'])
  })

  it('两轴色调顺序应该 **逐位对应**（蓝 / 暖 / 绿）', () => {
    // 这条守卫「换顺序」这个需求本身：以后加款时也能一眼看出对应关系。
    // 判据用**主通道**，不用色相角 —— 浅色三款的本色都很淡，色相角容易是噪声。
    const slots = scheme => toneIdsFor(scheme).filter(id => id !== 'official').map(id => {
      const tones = scheme === 'dark' ? DARK_TONES : LIGHT_TONES
      const [r, g, b] = tones[id].tint.split(',').map(v => Number(v.trim()))
      const mx = Math.max(r, g, b)
      // 判「中性」的兜底保留：万一将来又出现一款近中性的本色，这里会暴露出来。
      // ⚠️ 2026-09-18 起**浅色轴没有中性款了** —— `gray`（素白，色度仅 8）已被
      // owner 换成 `sakura`（樱花粉，色度 50），理由正是「看不出来是什么颜色」。
      if (mx - Math.min(r, g, b) <= 15) return 'neutral'
      return r === mx ? 'warm' : g === mx ? 'green' : 'cool'
    })
    assert.deepEqual(slots('dark'), ['cool', 'warm', 'green'], '深色轴：蓝紫 / 红 / 绿')
    // 浅色轴中间那款现在是**暖**（樱花的 R 是主通道）—— 与深色轴的 crimson 同位同调。
    // 这条断言正是本次改动的**意图本身**：第 2 位两轴都应是暖色。
    assert.deepEqual(slots('light'), ['cool', 'warm', 'green'], '浅色轴：蓝 / 暖（樱花）/ 绿')
    assert.equal(slots('dark').length, slots('light').length, '两轴的非官方款数应相同')
    // 逐位对齐：两轴的「位」序列应完全相同
    assert.deepEqual(slots('light'), slots('dark'), '两轴逐位对应（蓝 / 暖 / 绿）')
  })

  it('8 款色调都应该 可选（available 是「留位 / 下架」开关，当前无一款被占）', () => {
    assert.deepEqual(availableToneIds('dark'), ['official', 'violet', 'crimson', 'forest'])
    assert.deepEqual(availableToneIds('light'), ['official', 'blue', 'sakura', 'green'])
    for (const [id, spec] of [...Object.entries(LIGHT_TONES), ...Object.entries(DARK_TONES)]) {
      assert.equal(spec.available, true, `${id} 当前应为可选`)
    }
  })


  it('默认值应该 落在各自轴上且可选', () => {
    assert.deepEqual(DEFAULT_SETTINGS, { lightTone: 'official', darkTone: 'violet' })
    assert.equal(LIGHT_TONES[DEFAULT_SETTINGS.lightTone].available, true)
    assert.equal(DARK_TONES[DEFAULT_SETTINGS.darkTone].available, true)
  })

  it('每条色调都应该 字段齐备（染色色值同时给或同时空）', () => {
    for (const [id, spec] of [...Object.entries(LIGHT_TONES), ...Object.entries(DARK_TONES)]) {
      assert.equal(typeof spec.available, 'boolean', `${id}.available`)
      assert.ok(spec.base.length > 0, `${id}.base 非空`)
      assert.ok(spec.sidebarFill.length > 0, `${id}.sidebarFill 非空`)
      assert.equal(typeof spec.grain, 'boolean', `${id}.grain`)
      assert.equal(
        spec.top === '', spec.bottom === '',
        `${id} 的 top / bottom 必须同时为空或同时给出`,
      )
      // 左侧金晕是「主染色之上的额外一层」：没有主染色时给了它也没有承载层
      if (spec.top === '') assert.equal(spec.left, '', `${id} 无主染色时不应单给 left`)
    }
  })

  it('深色三款应该 共享同一束金色光源（切换色调变的是空间，不是光源）', () => {
    const GOLD = 'rgba(232, 162, 74, .09)'
    const GOLD_LEFT = 'rgba(232, 162, 74, .11)'
    for (const id of ['violet', 'crimson', 'forest']) {
      assert.equal(DARK_TONES[id].top, GOLD, `${id}.top 应共享金色光源`)
      assert.equal(DARK_TONES[id].left, GOLD_LEFT, `${id}.left 应共享金色光源`)
      assert.equal(DARK_TONES[id].grain, true, `${id} 深色轴应叠颗粒`)
    }
    // 差异只在底色与底部纵深
    assert.notEqual(DARK_TONES.crimson.base, DARK_TONES.violet.base)
    assert.notEqual(DARK_TONES.forest.bottom, DARK_TONES.violet.bottom)
  })

  it('深色三款的底色应该 同亮度、色相跨度按「音量」定（对比度天然等价）', () => {
    const channels = hex => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))
    const spread = id => {
      const c = channels(DARK_TONES[id].base)
      return { sum: c[0] + c[1] + c[2], spread: Math.max(...c) - Math.min(...c), maxAt: c.indexOf(Math.max(...c)) }
    }
    // 三通道和全部锁在 36 → 亮度严格相等，对比度等价
    for (const id of ['violet', 'crimson', 'forest']) {
      assert.equal(spread(id).sum, 36, `${id}.base 三通道和应锁在 36`)
    }
    // 色相跨度是「音量钮」：violet 6 是已落地基准；红/绿经两轮真机反馈后定在 5
    // （先反馈偏夸张压到 4，再反馈「压过了」回到 5）
    assert.equal(spread('violet').spread, 6, 'violet 是基准，不动')
    assert.equal(spread('crimson').spread, 5, 'crimson 定在中间档')
    assert.equal(spread('forest').spread, 5, 'forest 定在中间档')
    // 各自仍由最高通道定色相：violet→B、crimson→R、forest→G
    assert.deepEqual(channels(DARK_TONES.violet.base), [10, 10, 16])
    assert.deepEqual(channels(DARK_TONES.crimson.base), [15, 10, 11])
    assert.deepEqual(channels(DARK_TONES.forest.base), [10, 15, 11])
    assert.equal(spread('violet').maxAt, 2)
    assert.equal(spread('crimson').maxAt, 0)
    assert.equal(spread('forest').maxAt, 1)
  })

  it('深色两款的底部纵深应该 与 violet 互相在 20% 饱和度以内（不抢戏）', () => {
    /** HSL 饱和度：s = (max-min) / (255 - |2L-255|)。 */
    const saturation = rgba => {
      const [r, g, b] = [...rgba.matchAll(/\d+/gu)].slice(0, 3).map(n => Number(n[0]))
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      return (max - min) / (255 - Math.abs(max + min - 255))
    }
    const reference = saturation(DARK_TONES.violet.bottom)
    assert.ok(reference > 0.3 && reference < 0.45, `violet.bottom 是基准档，实测 ${reference}`)
    for (const id of ['crimson', 'forest']) {
      const s = saturation(DARK_TONES[id].bottom)
      const drift = Math.abs(s / reference - 1)
      assert.ok(
        drift <= 0.2,
        `${id}.bottom 饱和度 ${s.toFixed(3)} 与基准 ${reference.toFixed(3)} 差 ${(drift * 100).toFixed(0)}%，超出 20% 带`,
      )
    }
  })

  it('左栏填充应该 比底色亮/暗 —— 但浅色轴现在**三款同底**，方向由官方定', () => {
    const channels = hex => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))
    // 暗色轴：左栏比底色亮（面板浮起）
    for (const id of ['violet', 'crimson', 'forest']) {
      const base = channels(DARK_TONES[id].base)
      const side = channels(DARK_TONES[id].sidebarFill)
      assert.ok(side.every((v, i) => v > base[i]), `${id} 左栏应逐通道亮于底色`)
    }
  })

  it('浅色三款应该 **底色 = 官方配置**（三款完全相同）、**有颗粒**、三层光齐备', () => {
    // ## 2026-09-18 结构改动（owner 定案）
    //
    // owner：「浅色的我想的是**依然是官方的底色配置**，然后**打光用主色**，
    // **打光的方向位置和深色的金光一样**。而不是现在整体都是主色的感觉。」
    //
    // 旧结构是「本色染过的近白底 + 三层强主色光」—— 本用例原先守的正是那个：
    // base 三通道和锁死 748、三款 base 互不相同、色度 1/14/6。**那套已整体作废**：
    // 底色不再染色（三款同底），色调**只由打光表达**。
    //
    // 所以现在守的是**新结构**：三款 base / sidebarFill **逐字相同**，且都是官方变量引用
    // （不是写死 hex）—— 官方调整浅色底时三款自动跟随。
    const OFFICIAL_BASE = 'var(--dsw-static-neutral-bluish-00)'
    const OFFICIAL_SIDE = 'var(--dsw-static-neutral-bluish-50)'
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      assert.equal(spec.base, OFFICIAL_BASE, `${id}.base 应是官方底色（引用变量，不是写死）`)
      assert.equal(spec.sidebarFill, OFFICIAL_SIDE, `${id}.sidebarFill 应是官方左栏色`)
      assert.equal(spec.grain, true, `${id} 浅色轴也叠颗粒（两轴质感对等）`)
      // 三款**唯一**的差别就是本色与三层光 —— 那才是「打光用主色」
      assert.ok(spec.tint !== '', `${id} 必须有自己的本色（打光要用它）`)
      for (const layer of ['top', 'bottom', 'left']) {
        assert.match(spec[`${layer}`], /^rgba\(/u, `${id}.${layer} 应给色值`)
      }
    }
    // 三款底色**逐字相同**（这正是新结构的要点：空间色不再随色调变）
    const bases = ['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].base)
    assert.equal(new Set(bases).size, 1, '三款底色必须相同（已改回官方配置）')
    // 且与 official 那一款**完全一致** —— 「依然是官方的底色配置」
    assert.equal(LIGHT_TONES.official.base, LIGHT_TONES.blue.base, '有色调的底色应与官方默认款相同')
  })

  it('浅色三款应该 **只靠打光区分**（本色各不相同，底色相同）', () => {
    // 新结构的核心断言：**色相全部由光表达**。
    // 三款的本色必须互不相同（否则打光也分不出来），而底色相同（见上一条）。
    const tints = ['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].tint)
    assert.equal(new Set(tints).size, 3, '三款本色必须互不相同（那是唯一的区分来源）')
    // 每一款的三层光都来自**它自己的**本色
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'bottom', 'left']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 应来自本色 ${spec.tint}，实测 ${spec[layer]}`,
        )
      }
    }
  })

  it('浅色轴的三层光 alpha 应该 与深色轴**同次序**（顶 < 侧 < 底）', () => {
    // 两轴严格镜像：深色 `top .09 / left .11 / bottom .18`，
    // 浅色 `top .16 / left .19 / bottom .30` —— **次序完全一致**，只是数值约 1.8 倍
    // （白底对浅色主色的通道余量只有深底对金的一半，见 tones.ts 的推导）。
    assert.equal(LIGHT_GLOW_ALPHA.top, 0.16)
    assert.equal(LIGHT_GLOW_ALPHA.left, 0.19)
    assert.equal(DEPTH_ALPHA.light, 0.30)
    // 次序：顶（正对光源）< 侧（掠射，但铺在**大面积左栏**上）< 底（纵深，最强）
    assert.ok(LIGHT_GLOW_ALPHA.top < LIGHT_GLOW_ALPHA.left, '顶光应弱于侧光')
    assert.ok(LIGHT_GLOW_ALPHA.left < DEPTH_ALPHA.light, '侧光应弱于底部纵深')
    // 与深色轴同构：两边都是 top < left < bottom
    const darkTop = 0.09, darkLeft = 0.11
    assert.ok(DEPTH_ALPHA.dark > darkLeft, '深色底应最强（bottom > left）')
    assert.ok(darkTop < darkLeft && darkLeft < DEPTH_ALPHA.dark, '深色轴次序应为 top < left < bottom')
  })

  it('浅色轴的打光几何应该 **与深色金光逐字相同**（收束点 62%）', () => {
    // owner：「**打光的方向位置和深色的金光一样**」——
    // 几何（方向、位置）在 `backdrop.ts` 里两轴共用同一组 SHAPE 常量，
    // 唯一按轴分的变量是**收束点**；本条守「收束点也相同」。
    // 旧值浅色 `100%` 是「强主色光」时代的补丁（把色量摊开以免收束边太硬），
    // alpha 降到 `.16` 后那条边本就看不见，补丁随之作废。
    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    const stopLight = overrides['--dsh-theme-tone-top-stop'].light
    const stopDark = overrides['--dsh-theme-tone-top-stop'].dark
    assert.equal(stopLight, '62%', '浅色顶光收束点应与深色相同')
    assert.equal(stopDark, '62%', '深色沿用 pyai.site 原值')
    assert.equal(stopLight, stopDark, '两轴的收束点变量应逐字相同')
  })

  it('浅色轴的三层光应该 **全部来自本色**（owner：「只是浅色是用主色打光」）', () => {
    // 最终规格：两轴打光结构逐项同构 —— 深色轴三层全部是金，浅色轴三层全部是**本色**。
    // 所以浅色轴**没有**「共享的银白光」；三款各自的光色不同，那是「用主色打光」的必然结果。
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'bottom', 'left']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 应来自本色 ${spec.tint}，实测 ${spec[layer]}`,
        )
      }
    }
    // 三款的光色因此应该**互不相同**（因为它们的主色不同）
    const tops = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].top))
    assert.equal(tops.size, 3, '三款的顶光应各自不同（各自的主色）')
  })

  it('浅色轴的三层光应该 与深色轴**结构同构**（都是「主色打光」）', () => {
    // 走查过的弯路：暖金（owner：「显脏」）→ 冷白 → 银白（owner：「没反过来啊」）。
    // 最终规格：「浅色版也可以和深色版有相同的渐变质感，底部和顶部的打光都一样，
    //           只是浅色是用主色打光。」
    // 深色轴：三层全部是金（比近黑底亮 → 是光）；浅色轴：三层全部是本色。
    const rgbOf = c => [...c.matchAll(/\d+/gu)].slice(0, 3).map(n => Number(n[0]))
    // 深色轴基准：三层同源
    for (const layer of ['top', 'left']) {
      assert.equal(
        DARK_TONES.violet[layer].replace(/[\d.]+\)$/u, 'A)'),
        DARK_TONES.violet.top.replace(/[\d.]+\)$/u, 'A)'),
        `深色轴 ${layer} 应与 top 同源（同一支金）`,
      )
    }
    // 浅色轴：三层同源（都是本色），与深色轴逐项对应
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'left', 'bottom']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 应是本色（主色打光），实测 ${spec[layer]}`,
        )
      }
    }
    // 深色轴的金保持不变（它本来是对的）
    const [r, , b] = rgbOf(DARK_TONES.violet.top)
    assert.ok(r > b, '深色轴仍是暖金（R > B）')
  })

  it('浅色三款应该 共享同一层光、但底部**各自带本色渐变**', () => {
    const tops = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].top))
    const lefts = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].left))
    assert.equal(tops.size, 3, '三款顶光应各自不同（各自的主色）')
    assert.equal(lefts.size, 3, '三款侧光应各自不同')
    // 底部也是**本色**的渐变 —— 三款必须各异
    const bottoms = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].bottom))
    assert.equal(bottoms.size, 3, '底部渐变应三款各异（那是各款的主色所在）')
    // 三款的差异**只在光**：base / sidebarFill 现在**相同**（官方配置），
    // 区分来源是本色的三层光 —— 所以这里只断言 tint 与三层光各异。
    const tints = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].tint))
    assert.equal(tints.size, 3, '三款本色必须互不相同（那是打光的来源）')
    const bases = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].base))
    assert.equal(bases.size, 1, '底色现在三款相同（官方配置，不随色调染）')
  })

  it('浅色轴的光层应该 **不是**暖金 / 银白这类外来光源，而是本色', () => {
    // 历史：暖金（被判「显脏」）→ 冷白 → 银白，最后 owner 定案「用主色打光」。
    // 这条守卫防止有人再把「共享光源」加回来 —— 那会让浅色轴与深色轴的结构不再同构。
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'bottom', 'left']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 必须来自本色（owner：「浅色是用主色打光」），实测 ${spec[layer]}`,
        )
      }
    }
    // 底部 α = 共享常量（与色卡对齐，见 PREVIEW_ALPHA_SCALE）
    const alpha = rgba => Number(/,\s*([\d.]+)\)$/u.exec(rgba)[1])
    assert.equal(alpha(LIGHT_TONES.blue.bottom), DEPTH_ALPHA.light)
    // 对比：暗色轴的光层本来就是环境级的小值
    assert.ok(alpha(DARK_TONES.violet.top) < 0.15)
  })

  it('浅色轴的光层 α 应该 与深色轴同构（上 / 侧 / 底各一档，且底部守住共享常量）', () => {
    /** rgba 的 alpha。 */
    const alpha = rgba => Number(/,\s*([\d.]+)\)$/u.exec(rgba)[1])
    // owner：「底部和顶部的打光都一样，只是浅色是用主色打光」——
    // 浅色轴**不再有「必须极淡」或「必须冷调」的限制**（那些是「外来光源」时代的约束）。
    // 现在要守的是**结构**：三层各给一档 alpha，底部与 DEPTH_ALPHA 对齐。
    assert.equal(alpha(LIGHT_TONES.blue.bottom), DEPTH_ALPHA.light, '底部 α 应与共享常量一致')
    assert.equal(alpha(LIGHT_TONES.blue.top), LIGHT_GLOW_ALPHA.top, '顶部 α 应取自共享档')
    assert.equal(alpha(LIGHT_TONES.blue.left), LIGHT_GLOW_ALPHA.left, '侧光 α 应取自共享档')
    // 对比：暗色轴的光层本来就是环境级的小值
    assert.ok(alpha(DARK_TONES.violet.top) < 0.15)
  })

  it('官方默认应该 引用官方变量而不是硬编码色值，且不画染色', () => {
    for (const spec of [LIGHT_TONES.official, DARK_TONES.official]) {
      assert.match(spec.base, /^var\(--dsw-static-neutral-/u)
      assert.match(spec.sidebarFill, /^var\(--dsw-static-neutral-/u)
      assert.equal(spec.top, '')
      assert.equal(spec.bottom, '')
      assert.equal(spec.left, '')
      assert.equal(spec.grain, false)
    }
  })

  it('深空款应该 守住 pyai.site 的色相值（alpha 已按 owner 决定上调一档）', () => {
    /** 取 rgba 的前三通道，返回 "r,g,b"。 */
    const rgbOf = rgba => [...rgba.matchAll(/\d+/gu)].slice(0, 3).map(n => n[0]).join(',')
    /** 取 rgba 的 alpha。 */
    const alphaOf = rgba => Number(/,\s*([\d.]+)\)$/u.exec(rgba)[1])
    // 色相 / 底色仍是 pyai.site 原值（global.css:57、SpaceBackdrop.astro:29-39）
    assert.equal(DARK_TONES.violet.base, '#0a0a10')
    assert.equal(rgbOf(DARK_TONES.violet.top), '232,162,74')
    assert.equal(rgbOf(DARK_TONES.violet.bottom), '96,78,168')
    assert.equal(rgbOf(DARK_TONES.violet.left), '232,162,74')
    assert.equal(DARK_TONES.violet.grain, true)
    // 底部辉光的 alpha 是**有意上调**的（pyai.site 原值 .08 → 现 .18，owner 认为实况偏保守），
    // 这条断言是为了防止它被误当「抄错」而改回去。
    assert.equal(alphaOf(DARK_TONES.violet.bottom), 0.18)
    assert.ok(alphaOf(DARK_TONES.violet.bottom) > 0.08, 'bottom alpha 已高于 pyai.site 原值')
    // 三款同步同档，规则无例外
    for (const id of ['violet', 'crimson', 'forest']) {
      assert.equal(alphaOf(DARK_TONES[id].bottom), 0.18, `${id}.bottom 应与另两款同档`)
    }
  })
})

describe('色调取值回落', () => {
  it('toneIdOf 应该 原样返回该轴上的可用值', () => {
    assert.equal(toneIdOf({ lightTone: 'official', darkTone: 'violet' }, 'dark'), 'violet')
    assert.equal(toneIdOf({ lightTone: 'official', darkTone: 'official' }, 'dark'), 'official')
    assert.equal(toneIdOf({ lightTone: 'green', darkTone: 'violet' }, 'light'), 'green')
  })

  it('toneIdOf 应该 把跨轴脏值 / 未知值回落到该轴默认', () => {
    // gray 是浅色轴的 id，出现在 darkTone 上是脏值
    assert.equal(toneIdOf({ lightTone: 'official', darkTone: 'sakura' }, 'dark'), 'violet')
    assert.equal(toneIdOf({ lightTone: 'violet', darkTone: 'violet' }, 'light'), 'official')
    // 完全不存在的 id（旧版残留 / 手改 settings.yaml）
    assert.equal(toneIdOf({ lightTone: 'nope', darkTone: 'nope' }, 'dark'), 'violet')
    assert.equal(toneIdOf({ lightTone: 'nope', darkTone: 'nope' }, 'light'), 'official')
  })

  it('toneFor 应该 与 toneIdOf 同口径地回落到该轴默认，避免选中态与实际渲染不一致', () => {
    assert.equal(toneFor('dark', 'violet'), DARK_TONES.violet)
    assert.equal(toneFor('dark', 'crimson'), DARK_TONES.crimson)
    for (const [scheme, dirty] of [['dark', 'sakura'], ['dark', 'nope'], ['light', 'violet'], ['light', 'nope']]) {
      const settings = scheme === 'dark'
        ? { lightTone: 'official', darkTone: dirty }
        : { lightTone: dirty, darkTone: 'violet' }
      const settled = toneIdOf(settings, scheme)
      assert.equal(toneFor(scheme, dirty), toneFor(scheme, settled), `${scheme}/${dirty} 两处回落口径应一致`)
    }
  })

  it('toneFieldFor 应该 把明暗轴映射到对应设置字段', () => {
    assert.equal(toneFieldFor('dark'), 'darkTone')
    assert.equal(toneFieldFor('light'), 'lightTone')
  })

  it('纯函数应该 对脏输入也有安全默认值（不抛错）', () => {
    // 这些函数已作为公开 API 从 index.ts 导出，故脏输入不该抛 ——
    // 仓库《鲁棒性》要求「异常输入返回安全默认值」。
    // 生产调用方给的一定是 `'light' | 'dark'` 与已解析的设置节，所以这不是修 bug，是硬化接口。
    const dirtySchemes = ['LIGHT', 'Dark', '', 'system', null, undefined, 0, {}]
    for (const s of dirtySchemes) {
      // 非法轴一律当浅色轴 —— 与 toneFieldFor 原有的「非 dark 即 light」口径一致
      assert.equal(normalizeScheme(s), s === 'dark' ? 'dark' : 'light', `normalizeScheme(${String(s)})`)
      assert.equal(toneFieldFor(s), 'lightTone', `toneFieldFor(${String(s)})`)
      assert.doesNotThrow(() => toneIdOf(undefined, s), `toneIdOf(${String(s)})`)
      assert.doesNotThrow(() => toneFor(s, 'blue'), `toneFor(${String(s)})`)
      assert.doesNotThrow(() => backdropPlan(s, undefined), `backdropPlan(${String(s)})`)
      assert.doesNotThrow(() => tonePreview(s, 'blue'), `tonePreview(${String(s)})`)
      assert.doesNotThrow(() => availableToneIds(s), `availableToneIds(${String(s)})`)
    }
    // 设置节为 null / undefined 时按空设置处理 → 两轴都走默认
    for (const empty of [null, undefined]) {
      const o = tokenOverrides(empty)
      assert.equal(o['--dsw-alias-bg-layer-1'].light, tokenOverrides(DEFAULT_SETTINGS)['--dsw-alias-bg-layer-1'].light)
      assert.equal(backdropPlan('dark', empty).scheme, 'dark')
    }
    // 大小写不匹配的轴名当浅色轴（**不是**当深色）—— 否则深色用户会看到浅色配方
    assert.equal(backdropPlan('DARK', DEFAULT_SETTINGS).scheme, 'light')
  })
})

describe('token 覆盖层', () => {
  it('每个 token 都应该 给全 light / dark 两个模式（官方对裸字符串抛错）', () => {
    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    for (const [token, modes] of Object.entries(overrides)) {
      assert.ok(typeof modes.light === 'string' && modes.light.length > 0, `${token}.light`)
      assert.ok(typeof modes.dark === 'string' && modes.dark.length > 0, `${token}.dark`)
    }
  })

  it('应该 取各轴当前选中款的底色与左栏填充', () => {
    const overrides = tokenOverrides({ lightTone: 'official', darkTone: 'violet' })
    assert.deepEqual(overrides['--dsw-alias-bg-base'], {
      light: LIGHT_TONES.official.base,
      dark: DARK_TONES.violet.base,
    })
    assert.deepEqual(overrides['--dsw-specific-sidebar-fill'], {
      light: LIGHT_TONES.official.sidebarFill,
      dark: DARK_TONES.violet.sidebarFill,
    })
  })
})

describe('双语标签', () => {
  it('zh / en 应该 键集完全一致', () => {
    assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  })

  it('每个色调 id 都应该 在 zh / en 里都有标签（含留位色，避免上线时渲染出原始 key）', () => {
    for (const id of ALL_TONE_IDS) {
      assert.ok(zh[`tone.${id}`], `zh 缺 tone.${id}`)
      assert.ok(en[`tone.${id}`], `en 缺 tone.${id}`)
    }
  })

  it('英文色调标签应该 都是单个单词（`Deep space` 那种会把整排卡的文字节奏打乱）', () => {
    for (const id of ALL_TONE_IDS) {
      const label = en[`tone.${id}`]
      assert.match(label, /^\S+$/u, `en tone.${id} = "${label}" 应为单个单词`)
    }
  })

  it('英文色调标签应该 都落在单音节、4–6 字母这一档（整排视觉节奏一致）', () => {
    // `official` 是功能性选项（Default），不参与诗意名的节奏规则
    const TONE_NAMES = ALL_TONE_IDS.filter(id => id !== 'official')
    assert.deepEqual([...TONE_NAMES].sort(), ['blue', 'crimson', 'forest', 'green', 'sakura', 'violet'])
    // ⚠️ 上限从 5 放宽到 6（2026-09-18），只为 `Sakura` 一款 ——
    // owner 把这档从「素白 / Chalk」改成樱花粉时，一并定了英文名 `Sakura`。
    // 它是「樱花」最直接的英文，且仍是**单个单词、三音节**，与另几款的节奏差一档但不成行；
    // 若日后要严格回 5 字母，替代候选是 `Petal`（花瓣，5 字母）——但那不如 `Sakura` 达意。
    for (const id of TONE_NAMES) {
      const label = en[`tone.${id}`]
      assert.ok(label.length >= 4 && label.length <= 6, `en tone.${id} = "${label}" 长度应为 4–6`)
    }
  })

  it('中文色调标签应该 一律两个字（含 `official`）', () => {
    // owner：「把色卡那里的官方默认改成默认吧」。原来是四个字，在一排两字标签里
    // 会把整行的文字节奏带歪 —— 与英文那条 4–5 字母规则同一个理由。
    for (const id of ALL_TONE_IDS) {
      const label = zh[`tone.${id}`]
      assert.equal([...label].length, 2, `zh tone.${id} = "${label}" 应为两个字`)
    }
    assert.equal(zh['tone.official'], '默认', 'official 的 zh 标签就是「默认」')
  })
})
