/**
 * Minimal frontmatter handling for the notebook library.
 *
 * Notes use the same shape the bundled templates did: a leading `---` fence with top-level
 * scalars (title / type / date / tags). Nested values are kept as their raw text in `fields`
 * for display; the library only needs the headline fields for indexing.
 */

/** One top-level field as the review tab shows it. */
export interface ParsedField {
  readonly name: string
  readonly value: string
}

/** Parsed page: frontmatter presence, headline fields, and the body after the fence. */
export interface ParsedPage {
  readonly hasFrontmatter: boolean
  readonly title?: string
  readonly type?: string
  readonly date?: string
  readonly tags: readonly string[]
  readonly fields: readonly ParsedField[]
  /** Raw frontmatter block including both fences; empty when the file has none. */
  readonly frontmatter: string
  readonly body: string
  readonly bytes: number
}

/** Strip one pair of surrounding quotes. */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed.charAt(0)
    const last = trimmed.charAt(trimmed.length - 1)
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) return trimmed.slice(1, -1)
  }
  return trimmed
}

/** Parse an inline list (`[a, b]`) into values; a scalar becomes a one-item list. */
function parseList(value: string): string[] {
  const trimmed = value.trim()
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  return inner
    .split(',')
    .map(item => unquote(item))
    .filter(item => item !== '')
}

/**
 * Parse one text file into headline fields and body.
 * @param raw - whole file text.
 * @param bytes - byte length for display.
 * @returns the parsed page (no frontmatter when the fence is absent).
 */
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

/** Display title: frontmatter title, else the file stem. */
export function displayTitle(parsed: ParsedPage, relativePath: string): string {
  if (parsed.title !== undefined && parsed.title !== '') return parsed.title
  const base = relativePath.split('/').pop() ?? relativePath
  return base.replace(/\.[^.]+$/u, '')
}
