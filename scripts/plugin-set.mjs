#!/usr/bin/env node
/**
 * **活跃 / 已退役插件的单一真值来源。**
 *
 * ## 为什么要有这个模块（而不是各脚本各写一份名单）
 *
 * `verify-all.mjs`（跑验证）与 `check-dsh-pin.mjs`（守精确 pin）**必须用同一份退役名单**：
 * 两边一旦漂移，pin 守卫就会去检查一个已退役的插件（它本来就不跟版本线，永远红），
 * 或者**漏掉一个活跃插件**（那正是 pin 腐化最容易发生的地方）—— 而这个守卫存在的全部理由
 * 就是"pin 只能有一个版本"。名单复制两份必然漂，故提取到这里。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** 仓库根（本文件位于 `scripts/`）。 */
export const repoRoot = resolve(import.meta.dirname, '..')

/**
 * 已退役插件：代码原地保留作历史（不删不移），但**不参与全量验证**、也**不跟随官方 dsh
 * 版本线升级** —— 留在流水线里只会制造与发布无关的红灯。
 *
 * * `dsh-vision-bridge`：2026-09-10 退役（功能被官方原生支持取代）。
 * * `dsh-nav-pin`：2026-09-29 并入 `dsh-theme-tone`（方案见
 *   `plugins/dsh-theme-tone/docs/spec/09-nav-pin-merge.md`）。
 */
export const RETIRED_PLUGINS = new Set(['dsh-vision-bridge', 'dsh-nav-pin'])

/**
 * 活跃插件名（目录名，按名排序）。
 *
 * 只算**已脚手架化**的插件（有 `package.json`）；纯文档目录（spec 阶段）跳过。
 * @param root - 仓库根；默认取本文件所在仓库。
 * @returns 插件目录名数组。
 */
export function activePluginNames(root = repoRoot) {
  return readdirSync(join(root, 'plugins'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !RETIRED_PLUGINS.has(name))
    .filter(name => existsSync(join(root, 'plugins', name, 'package.json')))
    .sort()
}

/**
 * 是否是**要参与版本门**的官方包名。
 *
 * 口径与官方版本门一致（`plugin-compatibility.ts:75`）：只检查 `@deepseek-ai/dsh` 与
 * `@deepseek-ai/dsh-*`；`@deepseek-ai/cordis` 等**不进这道门**，故不参与精确 pin 检查
 * （它现在用 `~4.0.4` 范围）。
 * @param name - 包名。
 * @returns 是否需要精确 pin。
 */
export const isVersionGatedDshPackage = (name) =>
  name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
