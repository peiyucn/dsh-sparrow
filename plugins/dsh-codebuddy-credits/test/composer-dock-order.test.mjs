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
 * C：`conversation.input.model` 不得声明子槽 `conversation.input.model.label` —— 官方
 * ui-model-selection 注册同一父槽时已声明（上游 `ui-model-selection/src/client/index.ts:172-177`），
 * ui-slots 规定「一个子槽只有一个声明者」（上游 `ui-slots/src/index.ts:1245-1250` 抛
 * "already declared"），重复声明会让本注册失败并退回官方。
 */
const INDEX_SOURCE = new URL('../src/client/index.ts', import.meta.url)
const CONTRACT_SOURCE = new URL('../src/client/slot-contract.d.ts', import.meta.url)
const index = await readFile(INDEX_SOURCE, 'utf8')
const contract = await readFile(CONTRACT_SOURCE, 'utf8')

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
    const ours = { id: 'codebuddy-credits-stats', order: Number(/order:\s*(\d+)/u.exec(dockCode)[1]), priority: 0 }
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

describe('C：conversation.input.model 不得重复声明 label 子槽', () => {
  it('注册选项显式用 priority -1 遮蔽官方，且不声明 children', () => {
    const modelBlock = blockOf(index, "scopeCtx.slots.inject('conversation.input.model'", 'CodeBuddyModelSelect as unknown as')
    const code = stripComments(modelBlock)
    assert.match(code, /priority:\s*-1/u, '必须以 priority -1 遮蔽官方 ModelSelect')
    assert.ok(
      !/\bchildren\s*:/u.test(code),
      '不得声明 children：官方 ui-model-selection 已声明 conversation.input.model.label，'
        + '重复声明会被 ui-slots 的「一个子槽一个声明者」校验抛错（上游 ui-slots/src/index.ts:1245-1250），'
        + '轻则本插件注册失败退回官方，重则顶掉官方注册。',
    )
    assert.ok(
      !/'conversation\.input\.model\.label'/u.test(code),
      '注册代码里不得出现 conversation.input.model.label（那是官方声明的子槽）',
    )
  })

  it('类型层只补父槽，不重复声明官方已发布的 label 子槽', () => {
    assert.match(contract, /'conversation\.input\.model':\s*\{/u, '父槽类型要在 slot-contract.d.ts 里声明')
    assert.ok(
      !/'conversation\.input\.model\.label'\s*:/u.test(contract),
      'label 子槽由官方 ui-model-selection 的 slots.d.ts 声明（经 /client 类型入口加载），'
        + '此处重复声明会与官方类型冲突',
    )
  })
})
