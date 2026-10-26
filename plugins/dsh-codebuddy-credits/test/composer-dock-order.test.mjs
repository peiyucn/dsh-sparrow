// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 槽位注册次序 / 子槽声明契约（无需 client DOM 环境，读源码 + 按上游语义模拟排序）。
 *
 * D：`conversation.composer.dock` 是 list 槽。官方 activity order 0、usage order 1
 * （上游 `ui-chat/src/client/chat/StatsPills.tsx:1-5`）；上游 list 渲染先按 ledger 序
 * （priority 升序 → order 升序，稳定）取每 cell 的赢家，再按 order 稳定排序
 * （上游 `ui-renderer/src/client/scoped-slots.tsx:1222-1249`；注册期排序见
 * `ui-slots/src/index.ts:1282-1288`）。本插件 order 2 ⇒ 无论注册先后都排在官方 usage 之后，
 * 不需要 priority 决胜。
 *
 * ⚠️ 2026-10-27 架构调整：本插件**不再注册 `conversation.input.model`**（旧做法是 priority -1 遮蔽官方
 * ModelSelect）。模型选择器 = 官方 ui-model-selection，本插件的模型经 host 侧 `ctx.llm.registerAdapter`
 * 进官方目录 ⇒ 官方菜单原生列出。遮蔽会让插件重复承担材质 / portal / `backdrop-filter` 的坑。
 */
const INDEX_SOURCE = new URL('../src/client/index.ts', import.meta.url)
const index = await readFile(INDEX_SOURCE, 'utf8')

/** 官方 composer.dock 两条 entry 的 order（上游 ui-chat StatsPills / README:71）。 */
const OFFICIAL_DOCK_ORDER = { activity: 0, usage: 1 }

/** 去掉注释后的源码（避免注释里的契约说明被当成代码断言对象）。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
}

/** 取从 marker 起的一段源码（到给定结束 marker），找不到即失败。 */
function blockOf(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  assert.ok(start >= 0, `源码里找不到 ${startMarker}`)
  const end = text.indexOf(endMarker, start)
  assert.ok(end > start, `源码里找不到 ${endMarker}`)
  return text.slice(start, end)
}

const dockBlock = blockOf(index, "ctx.slots.inject('conversation.composer.dock'", 'CodeBuddyCreditsStats as unknown as')
const dockCode = stripComments(dockBlock)

describe('D：conversation.composer.dock 我方 entry 次序', () => {
  it('注册带显式 order，且严格排在官方 activity(0) / usage(1) 之后', () => {
    const match = /order:\s*(\d+)/u.exec(dockCode)
    assert.ok(match, '注册必须写显式 order（别依赖注册先后）')
    const order = Number(match[1])
    assert.ok(
      order > OFFICIAL_DOCK_ORDER.usage && order > OFFICIAL_DOCK_ORDER.activity,
      `我方 order（${order}）必须大于官方 usage 的 ${OFFICIAL_DOCK_ORDER.usage}`,
    )
    assert.match(dockCode, /id:\s*'codebuddy-credits-stats'/u, 'list 槽的 id 不能丢')
    assert.ok(
      !/priority\s*:/u.test(dockCode),
      '不同 order 已足以决定位置；不要再靠 priority 与官方 usage 决胜（同 cell 才有 shadowing 语义）',
    )
  })

  it('按上游 list 渲染色序语义模拟：我方稳定排在官方两颗胶囊之后（与注册先后无关）', () => {
    // 上游语义：ledger 按 (priority, order) 稳定排序；list 行取赢家后按 order 稳定排序。
    const orderMatch = /order:\s*(\d+)/u.exec(dockCode)
    assert.ok(orderMatch, '注册必须写显式 order（别依赖注册先后）')
    const ours = { id: 'codebuddy-credits-stats', order: Number(orderMatch[1]), priority: 0 }
    const official = [
      { id: 'activity', order: OFFICIAL_DOCK_ORDER.activity, priority: 0 },
      { id: 'usage', order: OFFICIAL_DOCK_ORDER.usage, priority: 0 },
    ]
    const ledgerSort = entries => [...entries].sort((a, b) => a.priority - b.priority || a.order - b.order)
    const listSort = entries => [...entries].sort((a, b) => a.order - b.order)
    const render = registrations => listSort(ledgerSort(registrations)).map(entry => entry.id)

    assert.deepEqual(
      render([...official, ours]),
      ['activity', 'usage', 'codebuddy-credits-stats'],
      '正常装配顺序（官方先注册）时我方在最后',
    )
    assert.deepEqual(
      render([ours, ...official]),
      ['activity', 'usage', 'codebuddy-credits-stats'],
      '即使本插件先注册，显式 order 仍把官方两颗胶囊排在我方之前',
    )
  })
})

