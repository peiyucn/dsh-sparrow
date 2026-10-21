// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { BADGE_1017_TEXT, shows1017Badge } from '../lib/client/model-label-1017.js'

/** 选择器源码：无 client DOM 测试环境，接线契约读源码断言。 */
const selectorSource = await readFile(new URL('../src/client/CodeBuddyModelSelect.tsx', import.meta.url), 'utf8')

/**
 * 官方 1017 版本标的镜像条件（`src/client/model-label-1017.ts`）。
 * 本插件无法声明 `conversation.input.model.label` 子槽，只能按上游同条件自绘；
 * 条件一旦漂移就会在错误的模型上显示「1017」，故逐条钉死。
 * 上游依据：`packages/client/ui-deepseek-model-label-1017/src/client/DeepSeekModelLabel.tsx:7,17-18`。
 */

describe('shows1017Badge：官方 1017 版本标的判定条件', () => {
  it('正例：两条官方 provider 路由 + deepseek-flash + 固定版本名', () => {
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), true)
    assert.equal(shows1017Badge('deepseek-account', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), true)
    assert.equal(BADGE_1017_TEXT, '1017', '标文案与官方两份 locale 一致')
  })

  it('负例：非官方 provider（含本插件 provider）不显示', () => {
    assert.equal(shows1017Badge('codebuddy-credits', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), false)
    assert.equal(shows1017Badge('deepseek-flash', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), false)
    assert.equal(shows1017Badge('', 'deepseek-flash', 'DeepSeek-V4.1-Flash'), false)
  })

  it('负例：官方 provider 下的非 flash 模型不显示', () => {
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-v4-pro', 'DeepSeek-V4-Pro'), false)
    assert.equal(shows1017Badge('deepseek-account', 'deepseek-v4-pro', 'DeepSeek-V4-Pro'), false)
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4-Pro'), false)
  })

  it('负例：名字必须逐字等于 DeepSeek-V4.1-Flash（大小写 / 空格 / 后缀都不行）', () => {
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'deepseek-v4.1-flash'), false)
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4.1-Flash '), false)
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek-V4.1-Flash-Pro'), false)
    assert.equal(shows1017Badge('deepseek-official', 'deepseek-flash', 'DeepSeek Flash'), false)
  })

  it('镜像契约：注释里保留「官方临时标、每次 dsh 升级复核」的提醒', async () => {
    const source = await readFile(new URL('../src/client/model-label-1017.ts', import.meta.url), 'utf8')
    assert.match(source, /mirror of upstream 0\.2\.1 temporary 1017 badge; re-check on every dsh bump/u,
      '必须保留上游临时标的复核提醒（官方结构化版本标签会替换掉它）')
  })
})

describe('选择器接线：三处模型名都走自绘标（无 DOM 环境，读源码钉住）', () => {
  it('trigger / 当前模型行 / 选项行三处都渲染 ModelNameLabel', () => {
    assert.equal(
      [...selectorSource.matchAll(/<ModelNameLabel\b/gu)].length,
      3,
      '官方在 trigger、当前模型菜单行、模型选项三处共用该标；漏一处 owner 就会觉得标没了',
    )
  })

  it('视觉用官方 Tag tone="info" + 固定文案，不自造视觉', () => {
    assert.match(selectorSource, /<Tag tone="info">\{BADGE_1017_TEXT\}<\/Tag>/u)
    assert.match(selectorSource, /import \{[^}]*Tag[^}]*\} from '@deepseek-ai\/dsh-client-ui-primitives'/u)
  })

  it('判定委托纯函数，不在选择器里内联条件', () => {
    assert.match(selectorSource, /shows1017Badge\(providerId, modelId, modelName\)/u)
    assert.ok(
      !/DeepSeek-V4\.1-Flash/u.test(selectorSource),
      '固定版本名只能出现在 model-label-1017.ts（单一真值），别在选择器里再写一遍',
    )
  })
})
