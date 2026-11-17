
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'


const CLIENT = new URL('../src/client/', import.meta.url)
const read = (name) => readFile(new URL(name, CLIENT), 'utf8')

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')

describe('codebuddy-credits：不接管官方模型选择控件', () => {
  it('⛔ client 不得注册 conversation.input.model（父槽 = 控件本身）', async () => {
    const code = stripComments(await read('index.ts'))
    assert.ok(
      !/['"]conversation\.input\.model['"]/u.test(code),
      '不得注册父槽 conversation.input.model —— 选择控件归官方 ui-model-selection',
    )

    assert.match(code, /conversation\.input\.model\.label/u, 'label 扩展槽用于只读事实，应存在')
  })

  it('⛔ priority -1 只允许用在 label 扩展槽上，不得用于遮蔽控件', async () => {
    const code = stripComments(await read('index.ts'))
    const labelBlock = code.slice(code.indexOf("'conversation.input.model.label'"))
    assert.match(labelBlock, /priority:\s*-1/u, 'label 扩展槽需要 priority -1 才能稳定拿到渲染权（single 槽）')

    const outside = code.replace(labelBlock, '')
    assert.ok(!/priority:\s*-1/u.test(outside), '除 label 扩展槽外，不得再用 priority -1 遮蔽官方控件')
  })

  it('⛔ 仓库里不得再有 vendored 模型选择器或 1017 镜像', async () => {
    const files = await readdir(CLIENT)
    assert.ok(!files.includes('CodeBuddyModelSelect.tsx'), '自绘模型选择器必须保持删除状态')

    assert.ok(!files.includes('model-label-1017.ts'), '1017 镜像已随官方目录角标取消，不得保留')
    const label = stripComments(await read('CodeBuddyModelLabel.tsx'))
    assert.match(label, /\.badge/u, 'label 扩展必须渲染官方目录角标 model.badge')
    assert.match(label, /resolveText/u, '角标文字必须经官方 locale resolveText 解析（多语言）')
  })
})
