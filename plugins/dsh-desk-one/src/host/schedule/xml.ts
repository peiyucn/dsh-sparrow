

export interface ParsedResponse {

  href: string

  status: string

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
  let out = ''
  let index = 0
  while (index < xml.length) {
    const start = xml.indexOf('<!--', index)
    if (start === -1) {
      out += xml.slice(index)
      break
    }
    out += xml.slice(index, start)
    const end = xml.indexOf('-->', start + 4)
    if (end === -1) break
    index = end + 3
  }
  return out
}


function stripTags(text: string): string {
  let out = ''
  let index = 0
  while (index < text.length) {
    const start = text.indexOf('<', index)
    if (start === -1) {
      out += text.slice(index)
      break
    }
    out += text.slice(index, start)
    const end = text.indexOf('>', start + 1)
    if (end === -1) break
    index = end + 1
  }
  return out
}


function textOf(raw: string): string {
  if (raw === '') return ''
  const cdata: string[] = []
  let text = raw.replace(CDATA_RE, (_match, content: string) => {
    cdata.push(content)
    return `\uE000${cdata.length - 1}\uE000`
  })
  text = stripTags(text)
  text = decodeEntities(text)
  text = text.replace(/\uE000(\d+)\uE000/g, (_match, index: string) => cdata[Number(index)] ?? '')
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
