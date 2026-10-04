/**
 * `package.json` 的 `files` 清单语义（npm 的 glob），供「发布包会不会带上某个产物」的守卫用。
 *
 * 为什么需要它（反向注入实测）：老写法把「递归 js」条目和「单文件」条目用 `||` 连起来，
 * 而第一支是写死的常量、与依赖名无关 —— 于是依赖名即使根本不存在也恒真
 * （实测 `for (const dep of ['host', '不存在的模块'])` 两者都是 true）。
 *
 * 这里按 glob 语义真判一遍：命中某条**正向**规则，且没有被其后的**否定**规则
 * （`!lib` 下的 client 子树）再次排除。本文件与各插件 `test/helpers/` 下的同名文件逐字节相同 ——
 * 仓库里没有共享的测试工具目录；放 `test/` 下而**不是** `test/lib/`，因为根 `.gitignore` 有一条
 * 裸的 `lib/` 规则会连 `test/lib/` 一起忽略（helper 进不了仓库、干净检出上测试直接挂）。
 * `test/` 不进 `npm pack`（`files` 清单不含 `test`）。
 */

/**
 * 把一条 npm files 条目编译成整串匹配的 `RegExp`。
 * 只支持本仓清单真实用到的语法：`*`（不跨层）、`**`（跨层；双星后接斜杠时连零层目录也算）、
 * `?`（单字符）。
 * @param pattern - 条目原文（已去掉前导感叹号），例如 lib 下的递归 js 条目。
 * @returns 整串匹配该条目的正则。
 */
export function globToRegExp(pattern) {
  const normalized = pattern.replace(/^\.\//u, '')
  let source = ''
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        index++
        if (normalized[index + 1] === '/') {
          index++
          // 双星后接斜杠 = 零层或多层目录（minimatch 同口径）：
          // `lib` + 双星 + `/host.js` 应当命中 `lib/host.js` 本身。
          source += '(?:[^/]+/)*'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      source += '[^/]'
      continue
    }
    source += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
  }
  return new RegExp(`^${source}$`, 'u')
}

/**
 * 该路径会不会被 `files` 清单收进发布包。
 * @param path - 相对包根的 POSIX 路径，如 `lib/host.js`。
 * @param files - `package.json` 的 `files` 数组。
 * @returns 命中正向规则且未被否定项排除时 true。
 */
export function isPacked(path, files) {
  let included = false
  for (const raw of files) {
    if (typeof raw !== 'string') continue
    const negated = raw.startsWith('!')
    const pattern = negated ? raw.slice(1) : raw
    if (!globToRegExp(pattern).test(path)) continue
    included = !negated
  }
  return included
}
