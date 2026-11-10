/**
 * Frontmatter parsing for the notes index.
 *
 * Only the fields the shelf and the annotation anchors need are extracted; unknown
 * keys are ignored. The YAML parser stays on the host side so the client bundle
 * never carries it (the review view receives parsed fields from REST instead).
 */

import { parseDocument, isMap, isScalar } from 'yaml'
import { NOTEBOOK_FRONTMATTER_MAX_BYTES } from '../../constants.js'

/** Facts the index keeps from one page's frontmatter. */
export interface ParsedFrontmatter {
  readonly title?: string
  readonly type?: string
  readonly date?: string
  readonly tags: readonly string[]
  /** Byte length of the whole block including delimiters; 0 when the page has none. */
  readonly bytes: number
}

const EMPTY: ParsedFrontmatter = { tags: [], bytes: 0 }

/** One closing delimiter line (`---` or `...`). */
const CLOSING = /^(?:---|\.\.\.)[ \t]*$/u

/**
 * Split a leading YAML frontmatter block from file text.
 * @param text - at least the head of the file.
 * @returns the parsed block and the body after it, or `undefined` when the text does not open with one.
 */
export function splitFrontmatter(text: string): { readonly block: string; readonly body: string; readonly bytes: number } | undefined {
  // A BOM is legal before the opening delimiter.
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text
  if (!source.startsWith('---')) return undefined
  const lines = source.split('\n')
  if (lines.length === 0 || lines[0].trimEnd() !== '---') return undefined
  for (let index = 1; index < lines.length; index += 1) {
    if (!CLOSING.test(lines[index].trimEnd())) continue
    const block = lines.slice(1, index).join('\n')
    const body = lines.slice(index + 1).join('\n')
    // Byte length of the block as it appears on disk, delimiters included.
    const bytes = byteLength(text.slice(0, text.length - body.length))
    return { block, body, bytes }
  }
  // An unterminated block is not frontmatter: the page opens with a rule or plain text.
  return undefined
}

/** UTF-8 byte length without allocating a buffer for the common ASCII case. */
function byteLength(text: string): number {
  let bytes = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** Read one string field from a parsed mapping, ignoring non-scalar values. */
function stringField(contents: unknown, key: string): string | undefined {
  if (!isMap(contents)) return undefined
  const pair = contents.items.find(item => isScalar(item.key) && item.key.value === key)
  if (pair === undefined) return undefined
  const value = pair.value
  if (!isScalar(value)) return undefined
  if (typeof value.value === 'number' || typeof value.value === 'boolean') return String(value.value)
  return typeof value.value === 'string' && value.value.trim() !== '' ? value.value.trim() : undefined
}

/** Read a tag list: an array of scalars, or one comma-separated scalar. */
function tagField(contents: unknown): readonly string[] {
  if (!isMap(contents)) return []
  const pair = contents.items.find(item => isScalar(item.key) && item.key.value === 'tags')
  if (pair === undefined || pair.value === null || pair.value === undefined) return []
  const value = pair.value
  if (isScalar(value)) {
    const text = typeof value.value === 'string' ? value.value : ''
    return text.split(',').map(part => part.trim()).filter(part => part !== '')
  }
  if (!Array.isArray((value as { items?: unknown[] }).items)) return []
  return ((value as { items: unknown[] }).items)
    .map(item => (isScalar(item) && typeof item.value === 'string' ? item.value.trim() : ''))
    .filter(item => item !== '')
}

/**
 * Parse the frontmatter of one file head.
 * @param head - file text (a truncated head is acceptable; the block must be complete inside it).
 * @param fileBytes - total file size, used to decide whether the head holds the whole body.
 * @returns parsed facts plus the body text available in `head`, or an empty result when absent.
 */
export function parseFrontmatter(head: string, fileBytes: number): ParsedFrontmatter & { readonly body: string; readonly truncated: boolean } {
  const split = splitFrontmatter(head)
  if (split === undefined) {
    return { ...EMPTY, body: head, truncated: fileBytes > byteLength(head) }
  }
  const document = parseDocument(split.block)
  if (document.errors.length > 0) {
    // Invalid YAML still counts as a frontmatter block: the page has one, it just does not parse.
    return { tags: [], bytes: split.bytes, body: split.body, truncated: false }
  }
  const contents = document.contents
  return {
    title: stringField(contents, 'title'),
    type: stringField(contents, 'type'),
    date: stringField(contents, 'date'),
    tags: tagField(contents),
    bytes: split.bytes,
    body: split.body,
    truncated: false,
  }
}

/** How much of a file head is read for frontmatter detection. */
export const FRONTMATTER_HEAD_BYTES = NOTEBOOK_FRONTMATTER_MAX_BYTES
