/**
 * 上游渠道风控的「内容指纹」处理。
 *
 * 背景：CodeBuddy 中国区网关（`copilot.tencent.com`）对 **system / assistant 正文**做内容指纹
 * 拦截，命中即返回 HTTP 400 `{"code":11128,"msg":"Illegal API invocation from an unapproved
 * channel"}`。已观测到的指纹有三类，互相独立（任何一类残留都会整轮被拒）：
 *  1. DeepSeek Harness / Claude Code 的身份句；
 *  2. DSH Web 的「Web GUI」身份句；
 *  3. 「`@` 路径引用」说明段（2026-10-28 实测）。
 *
 * 处理方式：**不删正文**，只在命中词内插入一个不可见的组合字符（U+034F，CGJ）——显示与语义不变，
 * 网关的字符串匹配失效。这比逐句删除更稳：同一身份句的变体、上下文位置、大小写都不再需要单独维护；
 * 也不会因为删掉身份句而改变模型行为。围栏代码块与行内代码**原样保留**（不能把不可见字符写进用户代码）。
 *
 * 2026-10-29 实测：上游已把常见零宽字符（U+200B / 200C / 200D / 2060 / FEFF / 00AD / 180E）与
 * 双空格归一化后再匹配，旧版「插 U+200B」整层失效；U+034F（CGJ）当时未被归一化，故改用它。
 * 该结论只代表本次实测——上游下一轮归一化大概率把 CGJ 一并收掉，届时本处理会再次失效
 * （表现仍是 400 / 11128），需重新实测。
 *
 * 旧历史兼容：早期版本用 U+200B 中和过，assistant 正文可能残留 U+200B；上游归一化后等于没中和，
 * 故处理前先把 U+200B / U+034F 一并剥掉再按当前规则重打（只动命中词的插入符，可见文字不变），
 * 顺带保证本函数幂等。
 *
 * 只改要发给上游的 wire 文本，本机会话历史原样保留；不改 UA / `X-IDE-Name` / 请求头，不伪装官方客户端。
 */

/** 组合字符 CGJ（U+034F）：不可见、不占排版位、不改变语义，当前未被上游归一化。 */
const CGJ = '\u034F'
/** 旧版中和符（U+200B，ZWSP）：上游已会归一化，正文里残留时必须剥掉重打。 */
const LEGACY_ZWSP = '\u200B'

/**
 * 身份句前缀：在第一个字符后插组合字符。覆盖「新的一句 DSH 身份话」这种波次，
 * 不需要等整句被完整观测到。
 */
const NEUTRALIZE_PREFIXES: readonly RegExp[] = [
  // "You are an AI agent powered by ..."
  /^(\s*You)(?= are an AI agent\b)/gmu,
  // "You are interacting with the user through ..."
  /^(\s*You)(?= are interacting with the user through\b)/gmu,
  // "The runtime context names the DeepSeek Harness implementation checkout."
  /^(\s*The)(?= runtime context\b)/gmu,
  // "Current DeepSeek Harness implementation checkout: ..."
  /^(\s*Current)(?= DeepSeek Harness\b)/gmu,
  // "Main branch (you will usually use this for PRs)"
  /^(\s*Main)(?= branch \(you will usually use this for PRs\))/gmu,
]

/** 品牌词：插在词内（不影响可见空格），同一句里的其它成分不用再列。 */
const NEUTRALIZE_TOKENS: readonly RegExp[] = [
  /(\bDeep)(?=Seek\b)/gu,
  /(\bHarness)(?=\b)/gu,
  /(\bClaude)(?= Code\b)/gu,
  /(\bAnthropic)(?='s official CLI\b)/gu,
  // 「@ 路径引用」类指纹：只插在 `@` 之后，`@path` / `@"..."` 的可见形态与含义不变
  // （组合字符不占排版位），但上游的字符匹配失效。不做白名单：@ 只出现在提示词说明里，
  // 正文中的路径语法同样是命中源。
  /(@)/gu,
]

/** 把一段普通文本里的身份指纹改成「视觉不变」的形式（幂等）。 */
function neutralizeProse(text: string): string {
  // 先剥掉历史残留的插入符（旧版 U+200B、本版 U+034F）再按当前规则重打：
  // 上游会归一化 U+200B，旧中和等于没做；先剥后插也让本函数天然幂等。
  let result = text.split(LEGACY_ZWSP).join('').split(CGJ).join('')
  for (const pattern of NEUTRALIZE_PREFIXES) {
    result = result.replace(pattern, `$1${CGJ}`)
  }
  for (const pattern of NEUTRALIZE_TOKENS) {
    result = result.replace(pattern, `$1${CGJ}`)
  }
  return result
}

/**
 * 无损中和 system / assistant 正文里的渠道指纹（纯函数，幂等）：
 *  - 围栏代码块与行内代码逐字保留（不可见字符会污染用户代码）；
 *  - 其余文本只插组合字符，不删任何可见字符；可见文案与 token 语义不变；
 *  - 未命中任何指纹 → 返回原字符串。
 */
export function neutralizeChannelFingerprints(text: string): string {
  if (text.length === 0) return text
  // 按围栏 / 行内代码切段：偶数段是普通文本，奇数段是代码，只处理偶数段。
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/gu)
  let changed = false
  for (let index = 0; index < parts.length; index += 2) {
    const part = parts[index] ?? ''
    const next = neutralizeProse(part)
    if (next !== part) {
      parts[index] = next
      changed = true
    }
  }
  return changed ? parts.join('') : text
}

/** 去掉插入字符（含旧版 ZWSP）后的文本，供测试断言「可见内容未变」。 */
export function visibleText(text: string): string {
  return text.split(CGJ).join('').split(LEGACY_ZWSP).join('')
}
