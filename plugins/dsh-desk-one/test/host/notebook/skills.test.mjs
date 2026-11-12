// @ts-check
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isNoteSkill, resolveSkillName, toNotebookSkills } from '../../../lib/host/notebook/skills.js'

describe('笔记技能识别', () => {
  it('按名称或描述识别笔记类技能', () => {
    assert.equal(isNoteSkill('note2md', 'Agent-native Markdown note management'), true)
    assert.equal(isNoteSkill('my-notes', 'personal notes'), true)
    assert.equal(isNoteSkill('diary', '日记与随手记'), true)
    assert.equal(isNoteSkill('obsidian', 'vault helpers'), true)
    assert.equal(isNoteSkill('epub', 'Read and write EPUB books'), false)
    assert.equal(isNoteSkill('official-plugins', 'Check DSH optional plugins'), false)
  })

  it('笔记技能排前，其余按名称排序', () => {
    const list = toNotebookSkills([
      { name: 'zzz', description: 'misc tools', source: 'user' },
      { name: 'note2md', description: 'notes', source: 'bundled' },
      { name: 'aaa', description: 'other tools', source: 'user' },
    ])
    assert.deepEqual(list.map(skill => skill.name), ['note2md', 'aaa', 'zzz'])
    assert.equal(list[0]?.note, true)
    assert.equal(list[1]?.note, false)
  })

  it('默认选 note2md；显式选择优先；null 表示不用技能', () => {
    const skills = toNotebookSkills([
      { name: 'note2md', description: 'notes', source: 'bundled' },
      { name: 'other', description: 'notes too', source: 'user' },
    ])
    assert.equal(resolveSkillName(skills, undefined), 'note2md')
    assert.equal(resolveSkillName(skills, 'other'), 'other')
    assert.equal(resolveSkillName(skills, null), null)
    assert.equal(resolveSkillName([], undefined), null)
  })
})
