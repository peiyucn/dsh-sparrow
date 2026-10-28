// @ts-check
/**
 * 边缘折射滤镜的契约：两张线性位移图（R 横向 / G 纵向）经 screen 合成，
 * 再用负 scale 向卡片内部取样；滤镜 id 与 body 标记属性由常量单源提供。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LENS_FILTER_ID, LENS_SCALE } from '../lib/constants.js'
import { buildLensFilterMarkup } from '../lib/client/lens.js'

describe('lens filter', () => {
  const markup = buildLensFilterMarkup()

  it('应该 用固定 id 暴露滤镜，供 CSS url(#id) 引用', () => {
    assert.ok(markup.includes(`<filter id="${LENS_FILTER_ID}"`))
  })

  it('应该 有两张位移图：横向 R → 纵向 G，并拉伸铺满滤镜区域', () => {
    const maps = [...markup.matchAll(/<feImage\b[^>]*\/>/gu)].map(match => match[0])
    assert.equal(maps.length, 2)
    for (const map of maps) {
      assert.ok(map.includes('preserveAspectRatio="none"'), '位移图必须拉伸到整张卡')
      assert.ok(map.includes('width="100%"') && map.includes('height="100%"'))
    }
    assert.ok(maps[0]?.includes('%230f0'), '横向位置图驱动 G（y 位移）')
    assert.ok(maps[1]?.includes('%23f00'), '纵向位置图驱动 R（x 位移）')
  })

  it('应该 用 screen 合成位移图，再交给 feDisplacementMap', () => {
    assert.ok(markup.includes('<feBlend in="h" in2="v" mode="screen" result="map"/>'))
    assert.ok(markup.includes(`scale="${LENS_SCALE}"`))
    assert.ok(markup.includes('xChannelSelector="R"'))
    assert.ok(markup.includes('yChannelSelector="G"'))
    assert.ok(LENS_SCALE < 0, '负 scale：四边向卡片内部取样，不产生外缘接缝')
    assert.ok(markup.includes("offset='.08'"), '边缘处中性、8%/12% 处位移最大、16%/24% 回中性')
    assert.ok(markup.includes('%23800000'), '中间段 R=128（无位移）')
  })
})
