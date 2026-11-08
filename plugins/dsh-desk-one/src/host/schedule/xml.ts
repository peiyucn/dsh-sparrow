/**
 * Minimal XML extraction for WebDAV multistatus responses.
 *
 * A full XML parser is intentionally avoided: only four shallow shapes are read (response /
 * href / status / prop), all under the control of the CalDAV server. Matching is by local name so
 * namespace prefixes (`D:`, `d:`, `C:`, `cal:`, vendor `ns0:`) cannot change the result, and the
 * XML entities that appear in hrefs / display names / escaped iCalendar data are decoded.
 *
 * This is not a general XML parser: comments are stripped, CDATA is preserved verbatim, and
 * nested elements with the same local name are not supported (none of the read shapes need it).
 */

export interface ParsedResponse {
  /** Text of the response-level `href` (may be relative; callers resolve it against the request URL). */
  href: string
  /** HTTP status line, e.g. `HTTP/1.1 200 OK`; empty when the server omitted it. */
  status: string
  /**
   * Values of the properties we care about, keyed by local name:
   * `displayname`, `resourcetype` (raw inner markup), `calendar-data`, `getetag`,
   * `getcontenttype`, `sync-token`, `current-user-principal` (href),
   * `calendar-home-set` (href).
   */
  props: Record<string, string | undefined>
}

const KNOWN_PROPS = [
  'displayname',
  'resourcetype',
  'calendar-data',
  'getetag',
  'getcontenttype',
  'sync-token',
  'current-user-principal',
  'calendar-home-set',
] as const

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/g
const COMMENT_RE = /<!--[\s\S]*?-->/g

/** Extract every top-level `<response>` of a multistatus document. */
export function parseMultistatus(xml: string): ParsedResponse[] {
  if (typeof xml !== 'string' || xml.trim() === '') return []
  const source = stripComments(xml)
  const responses: ParsedResponse[] = []
  for (const response of findElements(source, 'response')) {
    const body = response.inner
    const responseHref = findElement(body, 'href')
    const responseStatus = findElement(body, 'status')

    const props: Record<string, string | undefined> = {}
    let firstPropstatStatus = ''
    let firstSuccessStatus = ''
    const propstats = findElements(body, 'propstat')
    if (propstats.length > 0) {
      for (const propstat of propstats) {
        const statusText = textOf(findElement(propstat.inner, 'status')?.inner ?? '')
        if (statusText !== '') {
          if (firstPropstatStatus === '') firstPropstatStatus = statusText
          if (isSuccessStatus(statusText)) {
            if (firstSuccessStatus === '') firstSuccessStatus = statusText
          } else {
            // A non-2xx propstat only reports missing properties; never merge its values.
            continue
          }
        }
        const prop = findElement(propstat.inner, 'prop')
        if (prop !== null) collectProps(prop.inner, props)
      }
    } else {
      const prop = findElement(body, 'prop')
      if (prop !== null) collectProps(prop.inner, props)
    }

    const status = textOf(responseStatus?.inner ?? '') || firstSuccessStatus || firstPropstatStatus
    responses.push({ href: textOf(responseHref?.inner ?? ''), status, props })
  }
  return responses
}

function collectProps(propInner: string, target: Record<string, string | undefined>): void {
  for (const name of KNOWN_PROPS) {
    const element = findElement(propInner, name)
    if (element === null) continue
    if (name === 'resourcetype') {
      target.resourcetype = element.inner.trim()
      continue
    }
    if (name === 'current-user-principal' || name === 'calendar-home-set') {
      const href = findElement(element.inner, 'href')
      target[name] = href === null ? textOf(element.inner) : textOf(href.inner)
      continue
    }
    target[name] = textOf(element.inner)
  }
}

interface ElementSpan {
  inner: string
}

function findElements(source: string, localName: string): ElementSpan[] {
  const result: ElementSpan[] = []
  const open = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?${escapeRegExp(localName)})(?=[\\s/>])[^>]*>`, 'gi')
  const close = new RegExp(`<\\/(?:[A-Za-z_][\\w.-]*:)?${escapeRegExp(localName)}\\s*>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = open.exec(source)) !== null) {
    if (match[0].endsWith('/>')) {
      result.push({ inner: '' })
      continue
    }
    close.lastIndex = open.lastIndex
    const end = close.exec(source)
    if (end === null) break
    result.push({ inner: source.slice(open.lastIndex, end.index) })
    open.lastIndex = close.lastIndex
  }
  return result
}

function findElement(source: string, localName: string): ElementSpan | null {
  return findElements(source, localName)[0] ?? null
}

function stripComments(xml: string): string {
  return xml.replace(COMMENT_RE, '')
}

/** Strip markup, decode entities and trim. CDATA content is kept byte-for-byte (no entity decoding). */
function textOf(raw: string): string {
  if (raw === '') return ''
  const cdata: string[] = []
  let text = raw.replace(CDATA_RE, (_match, content: string) => {
    cdata.push(content)
    return `\u0000${cdata.length - 1}\u0000`
  })
  text = text.replace(/<[^>]*>/g, '')
  text = decodeEntities(text)
  text = text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => cdata[Number(index)] ?? '')
  return text.trim()
}

function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return codePoint(match, Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith('#')) {
      return codePoint(match, Number.parseInt(entity.slice(1), 10))
    }
    return NAMED_ENTITIES[entity] ?? match
  })
}

function codePoint(original: string, value: number): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : original
}

function isSuccessStatus(status: string): boolean {
  return /^\s*HTTP\/\d(?:\.\d)?\s+2\d\d\b/i.test(status)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
