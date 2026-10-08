/**
 * 品牌 SVG 的实例作用域：把内联 SVG 里全部 id 与其片段引用一起加实例前缀。
 * 同一文档注入多份（顶栏双形态 + portal 面板）时，`url(#id)` 只认文档序第一份同名元素，
 * 命中 `display:none` 那份即整块渐变不画 ⇒ id 必须逐实例唯一（官方 `ui-primitives` 同款）。
 */

/** id 里不宜出现的字符 → `_`（React 的 useId 形如 `:r1:`）。 */
const UNSAFE_IN_ID = /[^A-Za-z0-9_-]/gu

/** 净化后至少仍有一个字母/数字才算「给了作用域」（全下划线等于没给）。 */
const USABLE_IN_ID = /[A-Za-z0-9]/u

/** SVG 片段引用写法：`url(#id)`（含带引号）、`href="#id"`、`xlink:href="#id"`。 */
const URL_REFERENCE = /url\(\s*(['"]?)#([^)'"]+)\1\s*\)/gu
const HREF_REFERENCE = /(\b(?:xlink:)?href\s*=\s*)(['"])#([^'"]+)\2/gu

/** 给内联 SVG 里全部 id 与片段引用加同一实例前缀，只改 id 与引用，不动几何/颜色/结构。
 * 不保证幂等（每实例只调一次）；`scope` 净化后无字母数字即原样返回（fail-soft，不解决多份同 id）。 */
export function scopeMarkSvg(svg: string, scope: string): string {
  const prefix = scope.replace(UNSAFE_IN_ID, '_')
  if (!USABLE_IN_ID.test(prefix)) return svg
  const rename = (id: string): string => `${prefix}-${id}`
  return svg
    .replace(/\bid="([^"]*)"/gu, (_match, id: string) => `id="${rename(id)}"`)
    .replace(URL_REFERENCE, (_match, quote: string, id: string) => `url(${quote}#${rename(id)}${quote})`)
    .replace(HREF_REFERENCE, (_match, head: string, quote: string, id: string) => `${head}${quote}#${rename(id)}${quote}`)
}
