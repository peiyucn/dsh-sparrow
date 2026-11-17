


export interface ParsedField {
  readonly name: string
  readonly value: string
}


export interface ParsedPage {
  readonly hasFrontmatter: boolean
  readonly title?: string
  readonly type?: string
  readonly date?: string
  readonly tags: readonly string[]
  readonly fields: readonly ParsedField[]

  readonly frontmatter: string
  readonly body: string
  readonly bytes: number
}


function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed.charAt(0)
    const last = trimmed.charAt(trimmed.length - 1)
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) return trimmed.slice(1, -1)
  }
  return trimmed
}


function parseList(value: string): string[] {
  const trimmed = value.trim()
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  return inner
    .split(',')
    .map(item => unquote(item))
    .filter(item => item !== '')
}


export function parsePage(raw: string, bytes: number): ParsedPage {
  const text = raw.replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) {
    return { hasFrontmatter: false, tags: [], fields: [], frontmatter: '', body: text, bytes }
  }
  const end = text.indexOf('\n---\n', 3)
  if (end < 0) {
    return { hasFrontmatter: false, tags: [], fields: [], frontmatter: '', body: text, bytes }
  }
  const fence = text.slice(4, end)
  const body = text.slice(end + 5)
  const fields: ParsedField[] = []
  let title: string | undefined
  let type: string | undefined
  let date: string | undefined
  const tags: string[] = []
  for (const line of fence.split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (match === null) continue
    const name = match[1] ?? ''
    const value = match[2] ?? ''
    fields.push({ name, value: unquote(value) })
    if (name === 'title') title = unquote(value)
    else if (name === 'type') type = unquote(value)
    else if (name === 'date') date = unquote(value)
    else if (name === 'tags') tags.push(...parseList(value))
  }
  return {
    hasFrontmatter: true,
    ...title === undefined || title === '' ? {} : { title },
    ...type === undefined || type === '' ? {} : { type },
    ...date === undefined || date === '' ? {} : { date },
    tags,
    fields,
    frontmatter: text.slice(0, end + 5),
    body,
    bytes,
  }
}


export function displayTitle(parsed: ParsedPage, relativePath: string): string {
  if (parsed.title !== undefined && parsed.title !== '') return parsed.title
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.[^.]+$/u, '')
}
