



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
