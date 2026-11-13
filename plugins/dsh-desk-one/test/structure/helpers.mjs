// @ts-check
/**
 * Shared helpers for the `test/structure/` contract guards.
 *
 * These guards only check **contracts** (public package surface, import boundaries, i18n key sets,
 * route tables, docs presence). They must not mirror implementation details (CSS values, JSX
 * expressions, internal variable names): a refactor may legitimately reshape those.
 */
import { readFile, readdir, stat } from 'node:fs/promises'

/** Absolute URL of the plugin root (`test/structure/` -> plugin root). */
export const PLUGIN_ROOT = new URL('../../', import.meta.url)

/**
 * Read a plugin-relative text file.
 * @param {string} relative plugin-relative path, forward slashes
 * @returns {Promise<string>}
 */
export async function read(relative) {
  return await readFile(new URL(relative, PLUGIN_ROOT), 'utf8')
}

/**
 * Read and parse a plugin-relative JSON file.
 * @param {string} relative plugin-relative path, forward slashes
 * @returns {Promise<any>}
 */
export async function readJson(relative) {
  return JSON.parse(await read(relative))
}

/**
 * @param {URL} url absolute file URL
 * @returns {Promise<boolean>}
 */
async function isFile(url) {
  try {
    return (await stat(url)).isFile()
  } catch {
    return false
  }
}

/**
 * Whether a plugin-relative path exists as a regular file.
 * @param {string} relative plugin-relative path, forward slashes
 * @returns {Promise<boolean>}
 */
export async function fileExists(relative) {
  return await isFile(new URL(relative, PLUGIN_ROOT))
}

/**
 * Recursively collect files below a directory.
 * @param {URL} dir absolute directory URL
 * @param {RegExp} pattern file-name pattern
 * @returns {Promise<URL[]>}
 */
export async function walkFiles(dir, pattern) {
  const entries = await readdir(dir, { withFileTypes: true })
  /** @type {URL[]} */
  const files = []
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) files.push(...await walkFiles(url, pattern))
    else if (pattern.test(entry.name)) files.push(url)
  }
  return files
}

/**
 * Every module specifier a source file imports: static `import … from`, `export … from`,
 * side-effect `import '…'`, and dynamic `import('…')` with a literal argument. A module boundary is
 * crossed the same way in all four forms, so the layering guard must see all of them.
 * @param {string} text source text
 * @returns {string[]} deduplicated specifiers in source order
 */
export function importSpecifiers(text) {
  /** @type {Set<string>} */
  const found = new Set()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(match[1])
  }
  return [...found]
}

/**
 * Resolve one relative module specifier like NodeNext does for TypeScript sources: `.js` in the
 * specifier maps to a `.ts` / `.tsx` module, and extensionless specifiers may hit a directory
 * `index`. Bare specifiers and unresolvable targets return `null`; the caller decides what a bare
 * specifier means (`node:` / package) and can surface the raw specifier in its message.
 * @param {URL} from file URL of the importing module
 * @param {string} specifier
 * @returns {Promise<URL|null>}
 */
export async function resolveSourceImport(from, specifier) {
  if (!specifier.startsWith('.')) return null
  const target = new URL(specifier, from)
  /** @type {URL[]} */
  const candidates = []
  if (/\.(?:js|ts|tsx|mjs)$/u.test(specifier)) {
    const stem = target.href.replace(/\.(?:js|ts|tsx|mjs)$/u, '')
    candidates.push(new URL(`${stem}.ts`), new URL(`${stem}.tsx`), new URL(`${stem}.js`))
  } else {
    candidates.push(
      new URL(`${target.href}.ts`),
      new URL(`${target.href}.tsx`),
      new URL(`${target.href}.js`),
      new URL(`${target.href}/index.ts`),
      new URL(`${target.href}/index.tsx`),
      new URL(`${target.href}/index.js`),
    )
  }
  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate
  }
  return null
}

/**
 * Register one host tool module against a collecting fake context and return the tool definitions.
 * Tool modules only touch `ctx.tools.register` and the logger during registration; executing a
 * returned tool is up to the caller.
 * @param {(ctx: any, dependency?: any) => void} registration
 * @param {any} [dependency]
 * @returns {any[]}
 */
export function collectTools(registration, dependency) {
  /** @type {any[]} */
  const tools = []
  const ctx = {
    tools: { register: (/** @type {any} */ tool) => { tools.push(tool) } },
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }
  registration(ctx, dependency)
  return tools
}

/**
 * Register one host tool module against a collecting fake context and return the registered tool
 * names.
 * @param {(ctx: any, dependency?: any) => void} registration
 * @param {any} [dependency]
 * @returns {string[]} sorted tool names
 */
export function collectToolNames(registration, dependency) {
  return collectTools(registration, dependency).map(tool => String(tool.name)).sort()
}

/**
 * Plugin-relative, forward-slash path of an absolute URL (for readable failure messages).
 * @param {URL} url absolute URL
 * @returns {string}
 */
export function pluginRelative(url) {
  const absolute = decodeURIComponent(url.pathname).replaceAll('\\', '/')
  const marker = '/plugins/dsh-desk-one/'
  const at = absolute.lastIndexOf(marker)
  return at < 0 ? absolute : absolute.slice(at + marker.length)
}
