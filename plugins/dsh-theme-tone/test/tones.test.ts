
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DARK_GOLD_ALPHA,
  DARK_GOLD_TINT,
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


const alphaOf = rgba => {
  const match = /,\s*([\d.]+)\)$/u.exec(rgba)
  assert.ok(match, `不是可解析的 rgba() 色值：${rgba}`)
  return Number(match[1])
}

describe('色调表', () => {
  it('两轴都应该 含官方默认，且 id 顺序与 toneIdsFor 一致', () => {
    assert.ok(toneIdsFor('light').includes('official'))
    assert.ok(toneIdsFor('dark').includes('official'))
    assert.deepEqual(toneIdsFor('dark'), ['official', 'violet', 'crimson', 'forest'])

    assert.deepEqual(toneIdsFor('light'), ['official', 'blue', 'sakura', 'green'])
  })

  it('两轴色调顺序应该 **逐位对应**（蓝 / 暖 / 绿）', () => {

    const slots = scheme => toneIdsFor(scheme).filter(id => id !== 'official').map(id => {
      const tones = scheme === 'dark' ? DARK_TONES : LIGHT_TONES
      const [r, g, b] = tones[id].tint.split(',').map(v => Number(v.trim()))
      const mx = Math.max(r, g, b)

      if (mx - Math.min(r, g, b) <= 15) return 'neutral'
      return r === mx ? 'warm' : g === mx ? 'green' : 'cool'
    })
    assert.deepEqual(slots('dark'), ['cool', 'warm', 'green'], '深色轴：蓝紫 / 红 / 绿')

    assert.deepEqual(slots('light'), ['cool', 'warm', 'green'], '浅色轴：蓝 / 暖（樱花）/ 绿')
    assert.equal(slots('dark').length, slots('light').length, '两轴的非官方款数应相同')
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

      assert.equal(
        spec.top === '', spec.bottom === '',
        `${id} 的 top / bottom 必须同时为空或同时给出`,
      )

      if (spec.top === '') assert.equal(spec.left, '', `${id} 无主染色时不应单给 left`)
    }
  })

  it('深色三款应该 共享同一束金色光源（切换色调变的是空间，不是光源）', () => {


    const GOLD = `rgba(${DARK_GOLD_TINT}, ${DARK_GOLD_ALPHA.top})`
    const GOLD_LEFT = `rgba(${DARK_GOLD_TINT}, ${DARK_GOLD_ALPHA.left})`
    for (const id of ['violet', 'crimson', 'forest']) {
      assert.equal(DARK_TONES[id].top, GOLD, `${id}.top 应共享金色光源`)
      assert.equal(DARK_TONES[id].left, GOLD_LEFT, `${id}.left 应共享金色光源`)

    }

    const tops = new Set(['violet', 'crimson', 'forest'].map(id => DARK_TONES[id].top))
    const lefts = new Set(['violet', 'crimson', 'forest'].map(id => DARK_TONES[id].left))
    assert.equal(tops.size, 1, '三款 top 必须逐字相同（共享光源）')
    assert.equal(lefts.size, 1, '三款 left 必须逐字相同（共享光源）')
    assert.notEqual(DARK_TONES.crimson.base, DARK_TONES.violet.base)
    assert.notEqual(DARK_TONES.forest.bottom, DARK_TONES.violet.bottom)
  })

  it('顶上两道金光 应该 强于旧值、且两道都还在「环境级小值」档', () => {

    assert.ok(DARK_GOLD_ALPHA.top > 0.09, `顶光应强于旧值 .09，实际 ${DARK_GOLD_ALPHA.top}`)
    assert.ok(DARK_GOLD_ALPHA.left > 0.11, `侧光应强于旧值 .11，实际 ${DARK_GOLD_ALPHA.left}`)

    assert.ok(DARK_GOLD_ALPHA.top < DARK_GOLD_ALPHA.left, '顶光应弱于侧光（它铺在大面积左栏上）')
    assert.ok(DARK_GOLD_ALPHA.left < DEPTH_ALPHA.dark, '两道金光都必须弱于底部纵深 .18')
    assert.ok(DARK_GOLD_ALPHA.top < 0.15, '顶光应仍是环境级小值（< .15）')
  })

  it('深色三款的底色应该 同亮度、色相跨度按「音量」定（对比度天然等价）', () => {
    const channels = hex => [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16))
    const spread = id => {
      const c = channels(DARK_TONES[id].base)
      return { sum: c[0] + c[1] + c[2], spread: Math.max(...c) - Math.min(...c), maxAt: c.indexOf(Math.max(...c)) }
    }

    for (const id of ['violet', 'crimson', 'forest']) {
      assert.equal(spread(id).sum, 36, `${id}.base 三通道和应锁在 36`)
    }

    assert.equal(spread('violet').spread, 6, 'violet 是基准，不动')
    assert.equal(spread('crimson').spread, 5, 'crimson 定在中间档')
    assert.equal(spread('forest').spread, 5, 'forest 定在中间档')

    assert.deepEqual(channels(DARK_TONES.violet.base), [10, 10, 16])
    assert.deepEqual(channels(DARK_TONES.crimson.base), [15, 10, 11])
    assert.deepEqual(channels(DARK_TONES.forest.base), [10, 15, 11])
    assert.equal(spread('violet').maxAt, 2)
    assert.equal(spread('crimson').maxAt, 0)
    assert.equal(spread('forest').maxAt, 1)
  })

  it('深色两款的底部纵深应该 与 violet 互相在 20% 饱和度以内（不抢戏）', () => {

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

    for (const id of ['violet', 'crimson', 'forest']) {
      const base = channels(DARK_TONES[id].base)
      const side = channels(DARK_TONES[id].sidebarFill)
      assert.ok(side.every((v, i) => v > base[i]), `${id} 左栏应逐通道亮于底色`)
    }
  })

  it('浅色三款应该 **底色 = 官方配置**（三款完全相同）、**有颗粒**、三层光齐备', () => {


    const OFFICIAL_BASE = 'var(--dsw-static-neutral-bluish-00)'
    const OFFICIAL_SIDE = 'var(--dsw-static-neutral-bluish-50)'
    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      assert.equal(spec.base, OFFICIAL_BASE, `${id}.base 应是官方底色（引用变量，不是写死）`)
      assert.equal(spec.sidebarFill, OFFICIAL_SIDE, `${id}.sidebarFill 应是官方左栏色`)


      assert.ok(spec.tint !== '', `${id} 必须有自己的本色（打光要用它）`)
      for (const layer of ['top', 'bottom', 'left']) {
        assert.match(spec[`${layer}`], /^rgba\(/u, `${id}.${layer} 应给色值`)
      }
    }

    const bases = ['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].base)
    assert.equal(new Set(bases).size, 1, '三款底色必须相同（已改回官方配置）')
    assert.equal(LIGHT_TONES.official.base, LIGHT_TONES.blue.base, '有色调的底色应与官方默认款相同')
  })

  it('浅色三款应该 **只靠打光区分**（本色各不相同，底色相同）', () => {

    const tints = ['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].tint)
    assert.equal(new Set(tints).size, 3, '三款本色必须互不相同（那是唯一的区分来源）')

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


    assert.equal(LIGHT_GLOW_ALPHA.top, 0.16)
    assert.equal(LIGHT_GLOW_ALPHA.left, 0.19)
    assert.equal(DEPTH_ALPHA.light, 0.30)

    assert.ok(LIGHT_GLOW_ALPHA.top < LIGHT_GLOW_ALPHA.left, '顶光应弱于侧光')
    assert.ok(LIGHT_GLOW_ALPHA.left < DEPTH_ALPHA.light, '侧光应弱于底部纵深')

    assert.ok(DEPTH_ALPHA.dark > DARK_GOLD_ALPHA.left, '深色底应最强（bottom > left）')
    assert.ok(
      DARK_GOLD_ALPHA.top < DARK_GOLD_ALPHA.left && DARK_GOLD_ALPHA.left < DEPTH_ALPHA.dark,
      '深色轴次序应为 top < left < bottom',
    )
  })

  it('浅色轴的打光几何应该 **与深色金光逐字相同**（收束点 62%）', () => {


    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    const stopLight = overrides['--dsh-theme-tone-top-stop'].light
    const stopDark = overrides['--dsh-theme-tone-top-stop'].dark
    assert.equal(stopLight, '62%', '浅色顶光收束点应与深色相同')
    assert.equal(stopDark, '62%', '深色沿用 pyai.site 原值')
    assert.equal(stopLight, stopDark, '两轴的收束点变量应逐字相同')
  })

  it('浅色轴的三层光应该 **全部来自本色**（owner：「只是浅色是用主色打光」）', () => {


    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'bottom', 'left']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 应来自本色 ${spec.tint}，实测 ${spec[layer]}`,
        )
      }
    }
    const tops = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].top))
    assert.equal(tops.size, 3, '三款的顶光应各自不同（各自的主色）')
  })

  it('浅色轴的三层光应该 与深色轴**结构同构**（都是「主色打光」）', () => {

    const rgbOf = c => [...c.matchAll(/\d+/gu)].slice(0, 3).map(n => Number(n[0]))

    for (const layer of ['top', 'left']) {
      assert.equal(
        DARK_TONES.violet[layer].replace(/[\d.]+\)$/u, 'A)'),
        DARK_TONES.violet.top.replace(/[\d.]+\)$/u, 'A)'),
        `深色轴 ${layer} 应与 top 同源（同一支金）`,
      )
    }

    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'left', 'bottom']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 应是本色（主色打光），实测 ${spec[layer]}`,
        )
      }
    }

    const [r, , b] = rgbOf(DARK_TONES.violet.top)
    assert.ok(r > b, '深色轴仍是暖金（R > B）')
  })

  it('浅色三款应该 共享同一层光、但底部**各自带本色渐变**', () => {
    const tops = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].top))
    const lefts = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].left))
    assert.equal(tops.size, 3, '三款顶光应各自不同（各自的主色）')
    assert.equal(lefts.size, 3, '三款侧光应各自不同')
    const bottoms = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].bottom))
    assert.equal(bottoms.size, 3, '底部渐变应三款各异（那是各款的主色所在）')

    const tints = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].tint))
    assert.equal(tints.size, 3, '三款本色必须互不相同（那是打光的来源）')
    const bases = new Set(['sakura', 'blue', 'green'].map(id => LIGHT_TONES[id].base))
    assert.equal(bases.size, 1, '底色现在三款相同（官方配置，不随色调染）')
  })

  it('浅色轴的光层应该 **不是**暖金 / 银白这类外来光源，而是本色', () => {

    for (const id of ['sakura', 'blue', 'green']) {
      const spec = LIGHT_TONES[id]
      for (const layer of ['top', 'bottom', 'left']) {
        assert.ok(
          spec[layer].startsWith(`rgba(${spec.tint},`),
          `${id}.${layer} 必须来自本色（owner：「浅色是用主色打光」），实测 ${spec[layer]}`,
        )
      }
    }

    assert.equal(alphaOf(LIGHT_TONES.blue.bottom), DEPTH_ALPHA.light)
    assert.ok(alphaOf(DARK_TONES.violet.top) < 0.15)
  })

  it('浅色轴的光层 α 应该 与深色轴同构（上 / 侧 / 底各一档，且底部守住共享常量）', () => {

    assert.equal(alphaOf(LIGHT_TONES.blue.bottom), DEPTH_ALPHA.light, '底部 α 应与共享常量一致')
    assert.equal(alphaOf(LIGHT_TONES.blue.top), LIGHT_GLOW_ALPHA.top, '顶部 α 应取自共享档')
    assert.equal(alphaOf(LIGHT_TONES.blue.left), LIGHT_GLOW_ALPHA.left, '侧光 α 应取自共享档')
    assert.ok(alphaOf(DARK_TONES.violet.top) < 0.15)
  })

  it('官方默认应该 引用官方变量而不是硬编码色值，且不画染色', () => {
    for (const spec of [LIGHT_TONES.official, DARK_TONES.official]) {
      assert.match(spec.base, /^var\(--dsw-static-neutral-/u)
      assert.match(spec.sidebarFill, /^var\(--dsw-static-neutral-/u)
      assert.equal(spec.top, '')
      assert.equal(spec.bottom, '')
      assert.equal(spec.left, '')

    }
  })

  it('深空款应该 守住 pyai.site 的色相值（alpha 已按 owner 决定上调一档）', () => {

    const rgbOf = rgba => [...rgba.matchAll(/\d+/gu)].slice(0, 3).map(n => n[0]).join(',')

    assert.equal(DARK_TONES.violet.base, '#0a0a10')
    assert.equal(rgbOf(DARK_TONES.violet.top), '232,162,74')
    assert.equal(rgbOf(DARK_TONES.violet.bottom), '96,78,168')
    assert.equal(rgbOf(DARK_TONES.violet.left), '232,162,74')



    assert.equal(alphaOf(DARK_TONES.violet.bottom), 0.18)
    assert.ok(alphaOf(DARK_TONES.violet.bottom) > 0.08, 'bottom alpha 已高于 pyai.site 原值')

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

    assert.equal(toneIdOf({ lightTone: 'official', darkTone: 'sakura' }, 'dark'), 'violet')
    assert.equal(toneIdOf({ lightTone: 'violet', darkTone: 'violet' }, 'light'), 'official')

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



    const dirtySchemes = ['LIGHT', 'Dark', '', 'system', null, undefined, 0, {}]
    for (const s of dirtySchemes) {

      assert.equal(normalizeScheme(s), s === 'dark' ? 'dark' : 'light', `normalizeScheme(${String(s)})`)
      assert.equal(toneFieldFor(s), 'lightTone', `toneFieldFor(${String(s)})`)
      assert.doesNotThrow(() => toneIdOf(undefined, s), `toneIdOf(${String(s)})`)
      assert.doesNotThrow(() => toneFor(s, 'blue'), `toneFor(${String(s)})`)
      assert.doesNotThrow(() => backdropPlan(s, undefined), `backdropPlan(${String(s)})`)
      assert.doesNotThrow(() => tonePreview(s, 'blue'), `tonePreview(${String(s)})`)
      assert.doesNotThrow(() => availableToneIds(s), `availableToneIds(${String(s)})`)
    }

    for (const empty of [null, undefined]) {
      const o = tokenOverrides(empty)
      assert.equal(o['--dsw-alias-bg-layer-1'].light, tokenOverrides(DEFAULT_SETTINGS)['--dsw-alias-bg-layer-1'].light)
      assert.equal(backdropPlan('dark', empty).scheme, 'dark')
    }

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

    const TONE_NAMES = ALL_TONE_IDS.filter(id => id !== 'official')
    assert.deepEqual([...TONE_NAMES].sort(), ['blue', 'crimson', 'forest', 'green', 'sakura', 'violet'])




    for (const id of TONE_NAMES) {
      const label = en[`tone.${id}`]
      assert.ok(label.length >= 4 && label.length <= 6, `en tone.${id} = "${label}" 长度应为 4–6`)
    }
  })

  it('中文色调标签应该 一律两个字（含 `official`）', () => {


    for (const id of ALL_TONE_IDS) {
      const label = zh[`tone.${id}`]
      assert.equal([...label].length, 2, `zh tone.${id} = "${label}" 应为两个字`)
    }
    assert.equal(zh['tone.official'], '默认', 'official 的 zh 标签就是「默认」')
  })
})

describe('官方 HoverCard 材料修正（公开 token 通道，不再锚定 hashed 类名）', () => {
  it('四个 hovercard token 应该 都由主题 token 覆盖层提供（面用抬升面、字用官方 label 阶梯）', () => {
    const overrides = tokenOverrides(DEFAULT_SETTINGS)
    const both = value => ({ light: value, dark: value })
    assert.deepEqual(overrides['--dsw-alias-hovercard-bg'], both('var(--dsw-alias-bg-layer-3)'))
    assert.deepEqual(overrides['--dsw-alias-hovercard-label-primary'], both('var(--dsw-alias-label-primary)'))
    assert.deepEqual(overrides['--dsw-alias-hovercard-label-secondary'], both('var(--dsw-alias-label-secondary)'))
    assert.deepEqual(overrides['--dsw-alias-hovercard-label-tertiary'], both('var(--dsw-alias-label-tertiary)'))
  })

  it('材质修正不应该 依赖 surfaces.ts 的 DOM 锚点（hashed 类名依赖退场）', async () => {
    const { readFile } = await import('node:fs/promises')
    const src = await readFile(new URL('../src/surfaces.ts', import.meta.url), 'utf8')

    const code = src.replace(/\/\*[\s\S]*?\*\//gu, '')
    for (const forbidden of ['_portal', 'hoverTitle', '--dsw-alias-hovercard']) {
      assert.ok(!code.includes(forbidden), `surfaces.ts 代码里不得再出现 ${forbidden}`)
    }
  })
})
