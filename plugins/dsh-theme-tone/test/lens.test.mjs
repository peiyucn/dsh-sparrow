// @ts-check
/**
 * 边缘折射滤镜的契约：一个 `<feImage>` 逐像素位移图（R = 128+dx / G = 128+dy）
 * + `feDisplacementMap` 负 scale（向卡外取样）；滤镜 id 与位移图 id 由常量单源提供。
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LENS_FILTER_ID, LENS_IMAGE_ID, LENS_MAP_SCALE } from '../lib/constants.js'
import { buildLensFilterMarkup } from '../lib/client/lens.js'

describe('lens filter', () => {
  const markup = buildLensFilterMarkup()

  it('应该 用固定 id 暴露滤镜，供 CSS url(#id) 引用', () => {
    assert.ok(markup.includes(`<filter id="${LENS_FILTER_ID}"`))
    assert.ok(markup.includes('x="0" y="0" width="100%" height="100%"'), '滤镜区域严格等于卡片盒')
  })

  it('应该 只有一张逐像素位移图，并拉伸铺满滤镜区域', () => {
    const maps = [...markup.matchAll(/<feImage\b[^>]*\/>/gu)].map(match => match[0])
    assert.equal(maps.length, 1, '位移图只允许一张（不再用两张线性渐变合成）')
    const [map] = maps
    assert.ok(map.includes(`id="${LENS_IMAGE_ID}"`), 'feImage 有固定 id，供运行期更新 href')
    assert.ok(map.includes('preserveAspectRatio="none"'), '位移图必须拉伸到整张卡')
    assert.ok(map.includes('width="100%"') && map.includes('height="100%"'))
  })

  it('应该 用负 scale 反向消费 128+dx / 128+dy 编码，让边缘向卡外取样', () => {
    assert.ok(LENS_MAP_SCALE < 0, '负 scale = 向卡外取样（凸透镜放大边缘）')
    assert.ok(markup.includes(`<feDisplacementMap in="SourceGraphic" in2="map" scale="${LENS_MAP_SCALE}" xChannelSelector="R" yChannelSelector="G"/>`))
    assert.ok(!markup.includes('feBlend'), '不再做双图 screen 合成')
    assert.ok(!markup.includes('linearGradient'), '不再用固定线性渐变图')
  })
})
