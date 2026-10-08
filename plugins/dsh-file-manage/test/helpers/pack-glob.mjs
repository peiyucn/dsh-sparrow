/**
 * `package.json` 的 `files` 清单语义（npm 的 glob），供「发布包会不会带上某产物」的守卫真判
 * 一遍 —— 拿常量拼 `||` 的写法与依赖名无关、恒真，守不住东西。
 * ⚠️ 本文件与各插件 `test/helpers/` 下的同名文件**逐字节相同**；位置必须在 `test/` 而非
 * `test/lib/`：根 `.gitignore` 的裸 `lib/` 规则会把它一起忽略，干净检出上测试直接挂。
 */

/** 把一条 npm files 条目编译成整串匹配的 `RegExp`：`*` 不跨层、`**` 跨层、`?` 单字符。 */
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
          // 双星后接斜杠 = 零层或多层目录（minimatch 同口径）。
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

/** 该路径会不会被 `files` 清单收进发布包：命中正向规则、且未被其后的否定项再次排除。 */
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
