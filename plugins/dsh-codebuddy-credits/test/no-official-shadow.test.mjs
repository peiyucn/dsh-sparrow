// @ts-check
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

/**
 * 架构守卫（2026-10-27）：**本插件不得注册 / 遮蔽官方模型选择器。**
 *
 * 旧做法是客户端以 `priority: -1` 注册 `conversation.input.model` 遮蔽官方 `ModelSelect`，自绘一份
 * vendored 选择器（约 600 行 + 一整套样式/测试）。后果：
 *  - 官方模型菜单本来就是**目录驱动**的（`ModelCatalog` / `ModelProviderGroup`，含分组、吸顶标题、
 *    搜索、per-effort 子面板），本插件的 provider 已由 host 侧 `ctx.llm.registerAdapter` 注册进官方
 *    目录 ⇒ 官方菜单**本来就会列出**它的模型；
 *  - 自绘控件要自己承担材质 / portal / `backdrop-filter` 的合成细节，与官方默认门、色调档的玻璃、
 *    地面层等叠加时反复出现「偏移淡框 / 透明 / 闪」等问题（owner：「codebuddy 根本就不该动官方模型菜单」）。
 *
 * 正确姿态：**只做 provider + 官方既有槽位里的额度 UI**（设置卡 / 顶栏小卡 / 每轮胶囊 / 统计行）。
 */
const CLIENT = new URL('../src/client/', import.meta.url)
const read = (name) => readFile(new URL(name, CLIENT), 'utf8')

describe('codebuddy-credits：不遮蔽官方模型选择器', () => {
  it('⛔ client 不得注册 conversation.input.model', async () => {
    const src = await read('index.ts')
    // 注释里会提到这个槽名（反面教材），故先剥注释再断言。
    const code = src.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
    assert.ok(
      !/conversation\.input\.model(?!\.label)/u.test(code),
      'client 不得注册 conversation.input.model —— 模型选择器用官方 ui-model-selection',
    )
    assert.ok(!/priority:\s*-1/u.test(code), '不得再用 priority -1 遮蔽官方控件')
  })

  it('⛔ 仓库里不得再有 vendored 模型选择器 / 1017 版本标镜像', async () => {
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(CLIENT)
    assert.ok(!files.includes('CodeBuddyModelSelect.tsx'), '自绘模型选择器必须保持删除状态')
    assert.ok(!files.includes('model-label-1017.ts'), '1017 版本标镜像随自绘选择器一并删除（官方 label 子槽负责）')
  })
})
