

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const plugin = process.argv[2]
const version = process.argv[3]
if (!plugin || !version) {
  console.error('用法: node scripts/tag-notes.mjs <插件名> <版本号>')
  process.exit(1)
}

const root = resolve(process.cwd())
const read = (file) => readFileSync(join(root, 'plugins', plugin, file), 'utf8')

const section = (text) => {
  const lines = text.split(/\r?\n/)




  const bracketPrefix = '## [' + version + ']'
  const plainPrefix = '## ' + version
  const isHeading = (line) => {
    if (line.startsWith(bracketPrefix)) {
      const rest = line.slice(bracketPrefix.length).trim()
      return rest.startsWith('-') || (rest.startsWith('(') && rest.endsWith(')'))
        || (rest.startsWith('（') && rest.endsWith('）'))
    }
    if (!line.startsWith(plainPrefix)) return false
    const rest = line.slice(plainPrefix.length).trim()
    return (rest.startsWith('(') && rest.endsWith(')'))
      || (rest.startsWith('（') && rest.endsWith('）'))
  }
  const i = lines.findIndex(isHeading)
  if (i < 0) return ''
  const out = []
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].startsWith('## ')) break
    out.push(lines[j])
  }
  return out.join('\n').trim()
}

const en = section(read('CHANGELOG.md'))
const zh = section(read('CHANGELOG.zh-CN.md'))
if (!en && !zh) {
  console.error('CHANGELOG 中没有 ' + version + ' 条目')
  process.exit(1)
}
const parts = []
if (en) parts.push('### English\n\n' + en)
if (zh) parts.push('### 中文\n\n' + zh)
process.stdout.write(parts.join('\n\n') + '\n')
