// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSkillFile } from '../../lib/host/skills.js'

describe('bundled skills: SKILL.md parsing', () => {
  it('取出 frontmatter 描述与正文，frontmatter 不进正文', () => {
    const parsed = parseSkillFile('---\nname: demo\ndescription: "Short routing text."\n---\n\n# Body\n\nText.\n')
    assert.equal(parsed.description, 'Short routing text.')
    assert.equal(parsed.content, '# Body\n\nText.')
  })

  it('支持跨行引号描述（折叠为一行）', () => {
    const parsed = parseSkillFile('---\ndescription: "first part\nsecond part"\n---\nbody')
    assert.equal(parsed.description, 'first part second part')
  })

  it('无 frontmatter 时整篇作为正文，描述为空', () => {
    const parsed = parseSkillFile('# Title\n\nbody')
    assert.equal(parsed.description, '')
    assert.equal(parsed.content, '# Title\n\nbody')
  })

  it('未闭合的 frontmatter 不当成头部', () => {
    const parsed = parseSkillFile('---\ndescription: x\nbody')
    assert.equal(parsed.description, '')
    assert.match(parsed.content, /^---/u)
  })

  it('BOM 与无描述字段都能处理', () => {
    assert.equal(parseSkillFile('\uFEFF---\nname: x\n---\nbody').content, 'body')
    assert.equal(parseSkillFile('---\nname: x\n---\nbody').description, '')
  })
})
