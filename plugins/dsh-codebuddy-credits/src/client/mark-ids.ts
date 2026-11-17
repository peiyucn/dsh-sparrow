


const UNSAFE_IN_ID = /[^A-Za-z0-9_-]/gu


const USABLE_IN_ID = /[A-Za-z0-9]/u


const URL_REFERENCE = /url\(\s*(['"]?)#([^)'"]+)\1\s*\)/gu
const HREF_REFERENCE = /(\b(?:xlink:)?href\s*=\s*)(['"])#([^'"]+)\2/gu


export function scopeMarkSvg(svg: string, scope: string): string {
  const prefix = scope.replace(UNSAFE_IN_ID, '_')
  if (!USABLE_IN_ID.test(prefix)) return svg
  const rename = (id: string): string => `${prefix}-${id}`
  return svg
    .replace(/\bid="([^"]*)"/gu, (_match, id: string) => `id="${rename(id)}"`)
    .replace(URL_REFERENCE, (_match, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`)
    .replace(HREF_REFERENCE, (_match, head: string, quote: string, id: string) => `${head}${quote}#${rename(id)}${quote}`)
}
