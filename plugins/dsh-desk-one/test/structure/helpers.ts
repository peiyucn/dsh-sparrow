

import { readFile, readdir, stat } from 'node:fs/promises'


export const PLUGIN_ROOT = new URL('../../', import.meta.url)

type ToolRegistration = (ctx: unknown, dependency: unknown) => void

interface RegisteredTool {
  name: string
  execute: (input: Record<string, unknown>) => string
}

export async function read(relative: string): Promise<string> {
  return await readFile(new URL(relative, PLUGIN_ROOT), 'utf8')
}

export async function readJson(relative: string) {
  return JSON.parse(await read(relative))
}

async function isFile(url: URL): Promise<boolean> {
  try {
    return (await stat(url)).isFile()
  } catch {
    return false
  }
}

export async function fileExists(relative: string): Promise<boolean> {
  return await isFile(new URL(relative, PLUGIN_ROOT))
}

export async function walkFiles(dir: URL, pattern: RegExp): Promise<URL[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: URL[] = []
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir)
    if (entry.isDirectory()) files.push(...await walkFiles(url, pattern))
    else if (pattern.test(entry.name)) files.push(url)
  }
  return files
}

export function importSpecifiers(text: string): string[] {
  const found = new Set<string>()
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

export async function resolveSourceImport(from: URL, specifier: string): Promise<URL | null> {
  if (!specifier.startsWith('.')) return null
  const target = new URL(specifier, from)
  const candidates: URL[] = []
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

export function collectTools(registration: ToolRegistration, dependency?: unknown): RegisteredTool[] {
  const tools: RegisteredTool[] = []
  const ctx = {
    tools: { register: (tool: RegisteredTool) => { tools.push(tool) } },
    logger: { info: () => {}, warn: () => {}, debug: () => {} },
  }
  registration(ctx, dependency)
  return tools
}

export function collectToolNames(registration: ToolRegistration, dependency?: unknown): string[] {
  return collectTools(registration, dependency).map(tool => String(tool.name)).sort()
}

export function pluginRelative(url: URL): string {
  const absolute = decodeURIComponent(url.pathname).replaceAll('\\', '/')
  const marker = '/plugins/dsh-desk-one/'
  const at = absolute.lastIndexOf(marker)
  return at < 0 ? absolute : absolute.slice(at + marker.length)
}
