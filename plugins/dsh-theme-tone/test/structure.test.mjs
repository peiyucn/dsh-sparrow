// @ts-check
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

describe('dsh-theme-tone 结构', () => {
  it('package.json 声明 dsh.bundle / dsh.client 且产物在 files 清单里', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
    assert.equal(pkg.dsh.client.platform, 'web')
        assert.ok(pkg.files.includes('lib/**/*.js'), 'lib 产物进包')
    assert.ok(pkg.files.includes('!lib/client/**'), 'client 子目录不随包发布')
  })

  it('cordis.patch.yml 按 bundle patch 结构插入 host 行', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(patch, /- insert:/u)
    assert.match(patch, /id: dsh-theme-tone/u)
    assert.match(patch, /name: '@dsh-sparrow\/dsh-theme-tone'/u)
  })

  it('两份 README / 两份 CHANGELOG / LICENSE 都在', async () => {
    for (const file of ['README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md', 'LICENSE']) {
      assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} 缺失`)
    }
  })

  it('已删除机制的模块不得复活', async () => {
    for (const removed of ['anchors.ts', 'phase.ts', 'mutation-gate.ts', 'workstart.ts', 'caption.ts', 'popover.ts', 'mask.ts', 'sweep.ts', 'handle-glow.ts', 'surface.ts']) {
      assert.ok(!existsSync(new URL(`../src/${removed}`, import.meta.url)), `${removed} 已删除，不得复活`)
    }
  })

  it('src 只剩「颜色 + 地面光 + 三块玻璃 + 设置行」这几件事', async () => {
    for (const file of ['constants.ts', 'backdrop.ts', 'glass.ts', 'nav-pin.ts', 'tones.ts', 'host.ts', 'compat.ts', 'settings-schema.ts', 'index.ts']) {
      assert.ok(existsSync(new URL(`../src/${file}`, import.meta.url)), `${file} 应存在`)
    }
  })

  it('client 应挂载 bezel 透镜滤镜，并在卸载时释放（观察 / rAF / SVG / body 标记）', async () => {
    assert.ok(existsSync(new URL('../src/client/lens.ts', import.meta.url)), '缺 lens.ts')
    assert.ok(existsSync(new URL('../src/client/lens-map.ts', import.meta.url)), '缺 lens-map.ts（纯函数位移图）')
    const index = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
    assert.match(index, /attachLensFilter\(\)/u, 'client 入口应挂载透镜控制器')
    assert.match(index, /resources\.lens\?\.dispose\(\)/u, 'resources effect 清理里应 dispose')
    const lens = await readFile(new URL('../src/client/lens.ts', import.meta.url), 'utf8')
    assert.match(lens, /new ResizeObserver/u, '尺寸 / 圆角变化要重建位移图')
    assert.match(lens, /\.disconnect\(\)/u, '卸载时必须 disconnect ResizeObserver')
    assert.match(lens, /cancelAnimationFrame/u, '卸载时必须取消待执行的 rAF')
    assert.match(lens, /svg\.setAttribute\('width'/u, '隐藏 SVG 视口必须跟随卡片尺寸（否则 feImage 百分比解析成黑图）')
    assert.match(lens, /svg\?\.remove\(\)/u, '卸载时必须移除滤镜 SVG')
    assert.match(lens, /removeAttribute\(LENS_ATTR\)/u, '卸载时必须摘掉 body 标记')
    assert.match(lens, /LENS_ATTACH_MAX_FRAMES = 120/u, '卡片轮询有上限（找不到就安静降级）')
    assert.match(lens, /clearTimeout/u, '卸载时必须清掉防抖定时器')
    assert.match(lens, /LENS_RESIZE_SETTLE_MS = 160/u, '换行高度变化有防抖，不逐帧重画')
    assert.match(lens, /cssSupports\(SUPPORT_PROBE\)/u, '浏览器不支持 backdrop-filter url() 时不注入增强')
  })

  it('lens-map 必须是不碰 DOM / canvas 的纯函数（Node 单测直接跑）', async () => {
    const source = await readFile(new URL('../src/client/lens-map.ts', import.meta.url), 'utf8')
    for (const forbidden of ['document', 'window', 'getContext', 'HTMLCanvasElement', 'getComputedStyle', 'requestAnimationFrame']) {
      assert.ok(!source.includes(forbidden), `lens-map.ts 不得出现 ${forbidden}`)
    }
    assert.match(source, /export function buildLensMap/u)
  })
})
