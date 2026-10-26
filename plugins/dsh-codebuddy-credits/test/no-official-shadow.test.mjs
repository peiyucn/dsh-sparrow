// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 架构守卫（2026-10-27）：**本插件不得接管官方模型选择控件。**
 *
 * 旧做法是客户端以 `priority: -1` 注册 `conversation.input.model` 遮蔽官方 `ModelSelect`，自绘一份
 * vendored 选择器（约 600 行 + 一整套样式/测试）。后果：
 *  - 官方模型菜单本来就是**目录驱动**的（`ModelCatalog` / `ModelProviderGroup`，含分组、吸顶标题、
 *    搜索、per-effort 子面板），本插件的 provider 已由 host 侧 `ctx.llm.registerAdapter` 注册进官方
 *    目录 ⇒ 官方菜单**本来就会列出**它的模型；
 *  - 自绘控件要自己承担材质 / portal / `backdrop-filter` 的合成细节，与官方默认门、色调档的玻璃、
 *    地面层等叠加时反复出现「偏移淡框 / 透明 / 闪」等问题（owner：「codebuddy 根本就不该动官方模型菜单」）。
 *
 * 允许且只用官方**扩展点**：
 *  - `conversation.input.model.label`（官方 `inline` label 扩展槽，single）—— 用来给模型行加只读事实
 *    （倍率 · 上下文）。它是**标签**扩展，不接管控件；但 single 意味着必须同时保留官方的 1017 版本标
 *    （镜像见 `model-label-1017.ts`）。
 */
const CLIENT = new URL('../src/client/', import.meta.url)
const read = (name) => readFile(new URL(name, CLIENT), 'utf8')
/** 去掉注释后的源码（注释里会提到槽名作反面教材）。 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

describe('codebuddy-credits：不接管官方模型选择控件', () => {
  it('⛔ client 不得注册 conversation.input.model（父槽 = 控件本身）', async () => {
    const code = stripComments(await read('index.ts'))
    assert.ok(
      !/['"]conversation\.input\.model['"]/u.test(code),
      '不得注册父槽 conversation.input.model —— 选择控件归官方 ui-model-selection',
    )
    // label 扩展槽是允许的（它是标签贡献，不是控件）。
    assert.match(code, /conversation\.input\.model\.label/u, 'label 扩展槽用于只读事实，应存在')
  })

  it('⛔ priority -1 只允许用在 label 扩展槽上，不得用于遮蔽控件', async () => {
    const code = stripComments(await read('index.ts'))
    const labelBlock = code.slice(code.indexOf("'conversation.input.model.label'"))
    assert.match(labelBlock, /priority:\s*-1/u, 'label 扩展槽需要 priority -1 才能稳定拿到渲染权（single 槽）')
    // 除 label 之外不得再出现 priority -1（父槽遮蔽的旧写法）。
    const outside = code.replace(labelBlock, '')
    assert.ok(!/priority:\s*-1/u.test(outside), '除 label 扩展槽外，不得再用 priority -1 遮蔽官方控件')
  })

  it('⛔ 仓库里不得再有 vendored 模型选择器', async () => {
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(CLIENT)
    assert.ok(!files.includes('CodeBuddyModelSelect.tsx'), '自绘模型选择器必须保持删除状态')
    // 1017 版本标镜像**允许存在**：label 扩展槽是 single，接管后必须保留官方标。
    assert.ok(files.includes('model-label-1017.ts'), '1017 版本标镜像需要保留（label 槽 single）')
  })
})
