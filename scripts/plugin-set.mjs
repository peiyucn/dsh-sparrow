#!/usr/bin/env node
/** 活跃 / 已退役插件的**单一真值来源**：`verify-all.mjs` 与 `check-dsh-pin.mjs` 共用同一份名单 —— 复制两份必然漂（漂了就会漏掉活跃插件，或去查一个已退役的插件）。 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const repoRoot = resolve(import.meta.dirname, '..')

/** 已退役插件（代码原地保留作历史，不删不移）：**不参与全量验证**、也**不跟随官方 dsh 版本线升级** —— 留在流水线里只会制造与发布无关的红灯。 */
export const RETIRED_PLUGINS = new Set(['dsh-vision-bridge', 'dsh-nav-pin'])

/** 活跃插件名（目录名，按名排序）：只算**已脚手架化**的插件（有 `package.json`），纯文档目录（spec 阶段）跳过。 */
export function activePluginNames(root = repoRoot) {
  return readdirSync(join(root, 'plugins'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !RETIRED_PLUGINS.has(name))
    .filter(name => existsSync(join(root, 'plugins', name, 'package.json')))
    .sort()
}

/** 是否是**要参与版本门**的官方包名：口径与官方版本门一致，只检查 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*`，`@deepseek-ai/cordis` 等**不进这道门**。 */
export const isVersionGatedDshPackage = (name) =>
  name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
