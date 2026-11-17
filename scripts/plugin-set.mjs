

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '..')


export const RETIRED_PLUGINS = new Set([])


export function activePluginNames(root = repoRoot) {
  return readdirSync(join(root, 'plugins'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !RETIRED_PLUGINS.has(name))
    .filter(name => existsSync(join(root, 'plugins', name, 'package.json')))
    .sort()
}


export const isVersionGatedDshPackage = (name) =>
  name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
